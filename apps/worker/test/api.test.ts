/* eslint-disable @typescript-eslint/no-explicit-any -- 테스트용 가짜 응답 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet, type CryptoKey } from 'jose';
import worker from '../src/index';
import { setKeySource } from '../src/auth';
import { setClientFactory, SYSTEM_PROMPT } from '../src/ai';
import type { Env } from '../src/env';
import { accessMessage, resetSigningKey } from '../src/sign';

const KEY_A = 'r.abc1234567.pref0001.sch00001';
const KEY_B = 'r.abc1234567.pref0002.sch00001';

const PROJECT = 'aidam-test';
let priv: CryptoKey;

beforeAll(async () => {
  const kp = await generateKeyPair('RS256');
  priv = kp.privateKey;
  const jwk = { ...(await exportJWK(kp.publicKey)), kid: 'k1', alg: 'RS256' };
  setKeySource(createLocalJWKSet({ keys: [jwk] }));
});

afterEach(() => vi.unstubAllGlobals());

function memKV(): KVNamespace {
  const m = new Map<string, string>();
  return {
    get: async (k: string, type?: string) => {
      const v = m.get(k);
      if (v === undefined) return null;
      return type === 'json' ? JSON.parse(v) : v;
    },
    put: async (k: string, v: string) => void m.set(k, v),
    delete: async (k: string) => void m.delete(k),
  } as unknown as KVNamespace;
}

function makeEnv(over: Partial<Env> = {}): Env {
  return {
    KV: memKV(),
    ASSETS: { fetch: async () => new Response('site') } as unknown as Fetcher,
    FIREBASE_PROJECT_ID: PROJECT,
    ADMIN_EMAILS: 'boss@example.com',
    PRICE_KRW: '990',
    ORDER_NAME: '아이담 이름 분석 1회',
    ADMIN_PASS_HOURS: '12',
    NTFY_TOPIC: 'aidam-test-topic',
    AI_DAILY_LIMIT: '2',
    AI_ADMIN_DAILY_LIMIT: '100',
    AI_GLOBAL_DAILY_LIMIT: '200',
    AI_MODEL: 'claude-opus-5-5',
    TOSS_SECRET_KEY: 'test_sk_dummy',
    ANTHROPIC_API_KEY: 'sk-ant-dummy',
    ...over,
  };
}

async function token(sub: string, email: string, verified = true, project = PROJECT) {
  return new SignJWT({ email, email_verified: verified, auth_time: Math.floor(Date.now() / 1000) - 10 })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(`https://securetoken.google.com/${project}`)
    .setAudience(project)
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(priv);
}

const ORIGIN = 'https://aidam.example.workers.dev';
async function call(env: Env, path: string, opts: { tok?: string; body?: unknown; method?: string; origin?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.tok) headers.Authorization = `Bearer ${opts.tok}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.origin) headers.Origin = opts.origin;
  const req = new Request(ORIGIN + path, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const res = await worker.fetch(req, env);
  return { status: res.status, data: (await res.json().catch(() => null)) as Record<string, any> };
}

/** 바깥으로 나가는 요청(토스·휴대폰 알림·문자)을 가짜로 받는다 */
function stubOut(toss: (body: any) => { status: number; json: unknown } = tossOk) {
  const calls: { toss: any[]; push: any[]; sms: { headers: Record<string, string>; body: any }[] } = { toss: [], push: [], sms: [] };
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (url === 'https://api.tosspayments.com/v1/payments/confirm') {
      expect((init.headers as Record<string, string>).Authorization).toBe('Basic ' + btoa('test_sk_dummy:'));
      calls.toss.push(body);
      const r = toss(body);
      return new Response(JSON.stringify(r.json), { status: r.status });
    }
    if (url === 'https://ntfy.sh/') {
      calls.push.push(body);
      return new Response('{}');
    }
    if (url === 'https://api.solapi.com/messages/v4/send') {
      calls.sms.push({ headers: init.headers as Record<string, string>, body });
      return new Response('{}');
    }
    throw new Error(`예상하지 못한 요청: ${url}`);
  });
  return calls;
}

function tossOk(b: any) {
  return { status: 200, json: { status: 'DONE', totalAmount: b.amount, orderId: b.orderId, method: '카드' } };
}

/** 테스트용: 관리자 모드를 켜 둔다 */
async function adminOn(env: Env, uid = 'admin1') {
  await env.KV.put(`adm:${uid}`, String(Date.now() + 3_600_000));
}

describe('사이트 파일', () => {
  it('/api 밖은 사이트 파일을 그대로 낸다', async () => {
    const res = await worker.fetch(new Request(ORIGIN + '/'), makeEnv());
    expect(await res.text()).toBe('site');
  });
});

describe('로그인 확인', () => {
  it('토큰이 없거나 다른 프로젝트 토큰이면 401', async () => {
    const env = makeEnv();
    expect((await call(env, '/api/me')).status).toBe(401);
    expect((await call(env, '/api/me', { tok: await token('u1', 'a@b.c', true, 'other') })).status).toBe(401);
    expect((await call(env, '/api/me', { tok: 'garbage' })).status).toBe(401);
  });

  it('설정은 로그인 없이 볼 수 있다', async () => {
    const r = await call(makeEnv(), '/api/config');
    expect(r.status).toBe(200);
    expect(r.data.plan).toEqual({ amount: 990, orderName: '아이담 이름 분석 1회' });
  });
});

describe('결제: 1회 = 분석 1건', () => {
  it('주문 → 승인하면 그 분석의 열쇠가 계정에 들어간다', async () => {
    const env = makeEnv();
    const tok = await token('u1', 'u1@example.com');
    const order = await call(env, '/api/pay/order', { tok, body: { key: KEY_A } });
    expect(order.status).toBe(200);
    expect(order.data.amount).toBe(990);
    expect(order.data.customerKey).not.toContain('u1');
    const out = stubOut();
    const ok = await call(env, '/api/pay/confirm', { tok, body: { paymentKey: 'pk', orderId: order.data.orderId, amount: 990 } });
    expect(ok.status).toBe(200);
    expect(out.toss).toHaveLength(1);
    expect(ok.data.key).toBe(KEY_A);
    expect(ok.data.me.keys).toEqual([KEY_A]);
    expect((await call(env, '/api/me', { tok })).data.keys).toEqual([KEY_A]);
    // 같은 주문을 다시 보내도 두 번 승인하지 않는다
    const again = await call(env, '/api/pay/confirm', { tok, body: { paymentKey: 'pk', orderId: order.data.orderId, amount: 990 } });
    expect(again.status).toBe(200);
    expect(out.toss).toHaveLength(1);
    expect(again.data.me.keys).toEqual([KEY_A]);
  });

  it('조건을 바꾼 분석은 열쇠가 달라 따로 결제한다. 이미 산 분석은 다시 결제하지 않는다', async () => {
    const env = makeEnv();
    const tok = await token('u1', 'u1@example.com');
    stubOut();
    const o1 = await call(env, '/api/pay/order', { tok, body: { key: KEY_A } });
    await call(env, '/api/pay/confirm', { tok, body: { paymentKey: 'pk1', orderId: o1.data.orderId, amount: 990 } });
    const dup = await call(env, '/api/pay/order', { tok, body: { key: KEY_A } });
    expect(dup.status).toBe(409);
    expect(dup.data.error).toBe('ALREADY_OWNED');
    const o2 = await call(env, '/api/pay/order', { tok, body: { key: KEY_B } });
    expect(o2.status).toBe(200);
    const ok = await call(env, '/api/pay/confirm', { tok, body: { paymentKey: 'pk2', orderId: o2.data.orderId, amount: 990 } });
    expect(ok.data.me.keys).toEqual([KEY_B, KEY_A]);
    // 다른 사람 계정에는 없다
    expect((await call(env, '/api/me', { tok: await token('u2', 'u2@example.com') })).data.keys).toEqual([]);
  });

  it('열쇠가 없거나 모양이 이상하면 주문을 받지 않는다', async () => {
    const env = makeEnv();
    const tok = await token('u1', 'u1@example.com');
    for (const key of [undefined, '', 'x', 'r.abc', 'r.<script>.aaaa.bbbb', 'z.abc1234567.pref0001.sch00001']) {
      expect((await call(env, '/api/pay/order', { tok, body: { key } })).status).toBe(400);
    }
  });

  it('금액을 바꾸면 토스에 보내지도 않고 거절한다', async () => {
    const env = makeEnv();
    const tok = await token('u1', 'u1@example.com');
    const order = await call(env, '/api/pay/order', { tok, body: { key: KEY_A } });
    const out = stubOut();
    const r = await call(env, '/api/pay/confirm', { tok, body: { paymentKey: 'pk', orderId: order.data.orderId, amount: 100 } });
    expect(r.status).toBe(400);
    expect(r.data.error).toBe('AMOUNT_MISMATCH');
    expect(out.toss).toHaveLength(0);
  });

  it('다른 사람 주문은 승인하지 않는다', async () => {
    const env = makeEnv();
    const order = await call(env, '/api/pay/order', { tok: await token('u1', 'u1@example.com'), body: { key: KEY_A } });
    stubOut();
    const r = await call(env, '/api/pay/confirm', {
      tok: await token('u2', 'u2@example.com'),
      body: { paymentKey: 'pk', orderId: order.data.orderId, amount: 990 },
    });
    expect(r.status).toBe(403);
  });

  it('토스가 거절하면 열쇠가 생기지 않는다', async () => {
    const env = makeEnv();
    const tok = await token('u1', 'u1@example.com');
    const order = await call(env, '/api/pay/order', { tok, body: { key: KEY_A } });
    stubOut(() => ({ status: 400, json: { code: 'REJECT_CARD_COMPANY', message: '카드사에서 거절했어요.' } }));
    const r = await call(env, '/api/pay/confirm', { tok, body: { paymentKey: 'pk', orderId: order.data.orderId, amount: 990 } });
    expect(r.status).toBe(402);
    expect(r.data.error).toBe('REJECT_CARD_COMPANY');
    expect((await call(env, '/api/me', { tok })).data.keys).toEqual([]);
  });

  it('다른 사이트에서 보낸 POST는 막는다', async () => {
    const env = makeEnv();
    const r = await call(env, '/api/pay/order', { tok: await token('u1', 'u1@example.com'), body: { key: KEY_A }, origin: 'https://evil.example' });
    expect(r.status).toBe(403);
  });

  it('결제 키가 없으면 주문을 받지 않는다', async () => {
    const env = makeEnv({ TOSS_SECRET_KEY: undefined });
    const r = await call(env, '/api/pay/order', { tok: await token('u1', 'u1@example.com'), body: { key: KEY_A } });
    expect(r.status).toBe(503);
  });
});

describe('관리자 번호(휴대폰으로 받는 일회용 번호)', () => {
  const codeOf = (text: string) => /관리자 번호 (\d{6})/.exec(text)![1]!;

  it('관리자 계정도 처음에는 잠겨 있다(결제 화면을 그대로 본다)', async () => {
    const r = await call(makeEnv(), '/api/me', { tok: await token('admin1', 'Boss@Example.com') });
    expect(r.data.admin).toBe(true);
    expect(r.data.adminUntil).toBe(0);
    expect(r.data.keys).toEqual([]);
    expect(r.data.codeChannel).toBe('push');
  });

  it('번호를 휴대폰 알림으로 보내고, 맞게 넣으면 관리자 모드가 켜진다. 번호는 한 번만 쓴다', async () => {
    const env = makeEnv();
    const tok = await token('admin1', 'boss@example.com');
    const out = stubOut();
    const sent = await call(env, '/api/admin/code', { tok, body: {} });
    expect(sent.status).toBe(200);
    expect(sent.data).toEqual({ channel: 'push', ttl: 300 });
    expect(out.push).toHaveLength(1);
    expect(out.push[0].topic).toBe('aidam-test-topic');
    const code = codeOf(out.push[0].message);
    // 서버에는 번호가 그대로 남지 않는다
    expect(await env.KV.get('otp:admin1')).not.toContain(code);
    const ok = await call(env, '/api/admin/verify', { tok, body: { code } });
    expect(ok.status).toBe(200);
    const hours = (ok.data.me.adminUntil - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(11.9);
    expect(hours).toBeLessThanOrEqual(12);
    expect((await call(env, '/api/me', { tok })).data.adminUntil).toBe(ok.data.me.adminUntil);
    // 같은 번호를 다시 쓸 수 없다
    expect((await call(env, '/api/admin/verify', { tok, body: { code } })).status).toBe(400);
    // 끄면 다시 잠긴다
    const off = await call(env, '/api/admin/off', { tok, body: {} });
    expect(off.data.me.adminUntil).toBe(0);
    expect((await call(env, '/api/me', { tok })).data.adminUntil).toBe(0);
  });

  it('틀린 번호는 받지 않고, 다섯 번 틀리면 번호를 버린다', async () => {
    const env = makeEnv();
    const tok = await token('admin1', 'boss@example.com');
    const out = stubOut();
    await call(env, '/api/admin/code', { tok, body: {} });
    const code = codeOf(out.push[0].message);
    const wrong = code === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++) expect((await call(env, '/api/admin/verify', { tok, body: { code: wrong } })).data.error).toBe('WRONG_CODE');
    expect((await call(env, '/api/admin/verify', { tok, body: { code } })).status).toBe(429);
    expect((await call(env, '/api/admin/verify', { tok, body: { code } })).data.error).toBe('NO_CODE');
    expect((await call(env, '/api/me', { tok })).data.adminUntil).toBe(0);
  });

  it('1분 안에 다시 보내 달라고 하면 기다리라고 한다', async () => {
    const env = makeEnv();
    const tok = await token('admin1', 'boss@example.com');
    const out = stubOut();
    expect((await call(env, '/api/admin/code', { tok, body: {} })).status).toBe(200);
    expect((await call(env, '/api/admin/code', { tok, body: {} })).status).toBe(429);
    expect(out.push).toHaveLength(1);
  });

  it('관리자가 아닌 계정은 번호를 받을 수도 넣을 수도 없다', async () => {
    const env = makeEnv();
    const out = stubOut();
    for (const tok of [await token('u1', 'u1@example.com'), await token('x', 'boss@example.com', false)]) {
      expect((await call(env, '/api/admin/code', { tok, body: {} })).status).toBe(404);
      expect((await call(env, '/api/admin/verify', { tok, body: { code: '123456' } })).status).toBe(404);
      expect((await call(env, '/api/me', { tok })).data.admin).toBe(false);
    }
    expect(out.push).toHaveLength(0);
    // 다른 사람이 관리자 모드 값을 흉내 내도 관리자 계정이 아니면 무시한다
    await env.KV.put('adm:u1', String(Date.now() + 3_600_000));
    expect((await call(env, '/api/me', { tok: await token('u1', 'u1@example.com') })).data.adminUntil).toBe(0);
  });

  it('문자 설정이 있으면 문자로 보낸다', async () => {
    const env = makeEnv({ SOLAPI_API_KEY: 'key1', SOLAPI_API_SECRET: 'secret1', SMS_FROM: '0212345678', ADMIN_PHONE: '01012345678' });
    const out = stubOut();
    const sent = await call(env, '/api/admin/code', { tok: await token('admin1', 'boss@example.com'), body: {} });
    expect(sent.data.channel).toBe('sms');
    expect(out.push).toHaveLength(0);
    expect(out.sms[0]!.body.message.to).toBe('01012345678');
    expect(out.sms[0]!.body.message.from).toBe('0212345678');
    expect(out.sms[0]!.body.message.text).toMatch(/관리자 번호 \d{6}/);
    expect(out.sms[0]!.headers.Authorization).toMatch(/^HMAC-SHA256 apiKey=key1, date=.+, salt=[0-9a-f]{32}, signature=[0-9a-f]{64}$/);
  });

  it('휴대폰 설정이 없으면 번호를 만들지 않는다', async () => {
    const env = makeEnv({ NTFY_TOPIC: undefined });
    const r = await call(env, '/api/admin/code', { tok: await token('admin1', 'boss@example.com'), body: {} });
    expect(r.status).toBe(503);
    expect(await env.KV.get('otp:admin1')).toBeNull();
  });
});

describe('계정 상태 서명', () => {
  it('키가 없으면 서명 없이 답한다', async () => {
    resetSigningKey();
    const r = await call(makeEnv(), '/api/me', { tok: await token('u1', 'u1@example.com') });
    expect(r.data.sig).toBeNull();
    expect(r.data.uid).toBe('u1');
  });

  it('공개 키로 확인되는 서명을 붙이고, 내용을 바꾸면 확인되지 않는다', async () => {
    resetSigningKey();
    const kp = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const env = makeEnv();
    await env.KV.put('cfg:signing', JSON.stringify({ private: await crypto.subtle.exportKey('jwk', kp.privateKey), public: await crypto.subtle.exportKey('jwk', kp.publicKey) }));
    await env.KV.put('keys:u1', JSON.stringify([KEY_A]));
    const d = (await call(env, '/api/me', { tok: await token('u1', 'u1@example.com') })).data;
    expect(typeof d.sig).toBe('string');
    const sig = Uint8Array.from(atob(d.sig.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    const check = (m: string) => crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, kp.publicKey, sig, new TextEncoder().encode(m));
    const base = { uid: d.uid, admin: d.admin, adminUntil: d.adminUntil, keys: d.keys, iat: d.iat };
    expect(await check(accessMessage(base))).toBe(true);
    // 열쇠를 더하거나, 관리자 모드를 켜거나, 다른 사람 것으로 바꾸면 서명이 맞지 않는다
    expect(await check(accessMessage({ ...base, keys: [KEY_A, KEY_B] }))).toBe(false);
    expect(await check(accessMessage({ ...base, admin: true, adminUntil: Date.now() + 9e9 }))).toBe(false);
    expect(await check(accessMessage({ ...base, uid: 'someone-else' }))).toBe(false);
    resetSigningKey();
  });
});

describe('AI 풀이', () => {
  const summary = { name: { hangul: '김서윤', hanja: '金瑞允' }, total: 91, grade: 'S' };
  function fakeClaude(text = '## 이름에 담긴 뜻\n좋은 이름이에요.') {
    const create = vi.fn(async (_p: unknown) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] }));
    setClientFactory(() => ({ beta: { messages: { create } } }) as never);
    return create;
  }

  it('결제한 분석이 없으면 402', async () => {
    fakeClaude();
    const r = await call(makeEnv(), '/api/ai/explain', { tok: await token('u1', 'u1@example.com'), body: { summary } });
    expect(r.status).toBe(402);
  });

  it('관리자 모드에서 쓸 수 있고, 같은 입력은 저장된 답을 다시 쓴다', async () => {
    const create = fakeClaude();
    const env = makeEnv();
    await adminOn(env);
    const tok = await token('admin1', 'boss@example.com');
    const a = await call(env, '/api/ai/explain', { tok, body: { summary } });
    expect(a.status).toBe(200);
    expect(a.data.text).toContain('이름에 담긴 뜻');
    expect(a.data.cached).toBe(false);
    const b = await call(env, '/api/ai/explain', { tok, body: { summary } });
    expect(b.data.cached).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    const p = create.mock.calls[0]![0] as Record<string, any>;
    expect(p.model).toBe('claude-opus-5-5');
    expect(p.system).toBe(SYSTEM_PROMPT);
    expect(p.fallbacks).toBe('default');
    expect(p.messages[0].content).toContain('金瑞允');
  });

  it('하루 한도를 넘으면 429', async () => {
    fakeClaude();
    const env = makeEnv();
    const tok = await token('u1', 'u1@example.com');
    await env.KV.put('keys:u1', JSON.stringify([KEY_A]));
    for (const q of ['a', 'b']) expect((await call(env, '/api/ai/explain', { tok, body: { summary, question: q } })).status).toBe(200);
    const r = await call(env, '/api/ai/explain', { tok, body: { summary, question: 'c' } });
    expect(r.status).toBe(429);
    expect(r.data.error).toBe('DAILY_LIMIT');
  });

  it('AI가 거절하면 알려 주고 저장하지 않는다', async () => {
    const create = vi.fn(async () => ({ stop_reason: 'refusal', content: [] }));
    setClientFactory(() => ({ beta: { messages: { create } } }) as never);
    const env = makeEnv();
    await adminOn(env);
    const r = await call(env, '/api/ai/explain', { tok: await token('admin1', 'boss@example.com'), body: { summary } });
    expect(r.status).toBe(422);
  });

  it('너무 긴 입력은 받지 않는다', async () => {
    fakeClaude();
    const env = makeEnv();
    await adminOn(env);
    const r = await call(env, '/api/ai/explain', {
      tok: await token('admin1', 'boss@example.com'),
      body: { summary: { x: 'ㄱ'.repeat(9000) } },
    });
    expect(r.status).toBe(400);
  });
});
