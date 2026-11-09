/* eslint-disable @typescript-eslint/no-explicit-any -- 테스트용 가짜 응답 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet, type CryptoKey } from 'jose';
import worker from '../src/index';
import { setKeySource } from '../src/auth';
import { setClientFactory, SYSTEM_PROMPT } from '../src/ai';
import type { Env } from '../src/env';

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
    PRICE_KRW: '9900',
    PASS_DAYS: '30',
    ORDER_NAME: '아이담 30일 이용권',
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

function stubToss(result: (body: any) => { status: number; json: unknown }) {
  const calls: any[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    expect(url).toBe('https://api.tosspayments.com/v1/payments/confirm');
    expect((init.headers as Record<string, string>).Authorization).toBe('Basic ' + btoa('test_sk_dummy:'));
    const body = JSON.parse(String(init.body));
    calls.push(body);
    const r = result(body);
    return new Response(JSON.stringify(r.json), { status: r.status });
  });
  return calls;
}

const tossOk = (b: any) => ({ status: 200, json: { status: 'DONE', totalAmount: b.amount, orderId: b.orderId, method: '카드' } });

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
    expect(r.data.plan).toEqual({ amount: 9900, days: 30, orderName: '아이담 30일 이용권' });
  });
});

describe('관리자', () => {
  it('인증된 관리자 이메일은 결제 없이 열린다', async () => {
    const r = await call(makeEnv(), '/api/me', { tok: await token('admin1', 'Boss@Example.com') });
    expect(r.data.admin).toBe(true);
    expect(r.data.unlocked).toBe(true);
    expect(r.data.paid).toBe(false);
  });
  it('이메일 인증이 안 된 계정은 관리자로 보지 않는다', async () => {
    const r = await call(makeEnv(), '/api/me', { tok: await token('x', 'boss@example.com', false) });
    expect(r.data.admin).toBe(false);
    expect(r.data.unlocked).toBe(false);
  });
});

describe('결제', () => {
  it('주문 → 승인하면 이용권이 30일 생긴다', async () => {
    const env = makeEnv();
    const tok = await token('u1', 'u1@example.com');
    const order = await call(env, '/api/pay/order', { tok, body: {} });
    expect(order.status).toBe(200);
    expect(order.data.amount).toBe(9900);
    expect(order.data.customerKey).not.toContain('u1');
    const calls = stubToss(tossOk);
    const ok = await call(env, '/api/pay/confirm', { tok, body: { paymentKey: 'pk', orderId: order.data.orderId, amount: 9900 } });
    expect(ok.status).toBe(200);
    expect(calls).toHaveLength(1);
    const days = (ok.data.until - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    const me = await call(env, '/api/me', { tok });
    expect(me.data.paid).toBe(true);
    expect(me.data.unlocked).toBe(true);
    // 같은 주문을 다시 보내도 두 번 승인하지 않는다
    const again = await call(env, '/api/pay/confirm', { tok, body: { paymentKey: 'pk', orderId: order.data.orderId, amount: 9900 } });
    expect(again.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(again.data.until).toBe(ok.data.until);
  });

  it('금액을 바꾸면 토스에 보내지도 않고 거절한다', async () => {
    const env = makeEnv();
    const tok = await token('u1', 'u1@example.com');
    const order = await call(env, '/api/pay/order', { tok, body: {} });
    const calls = stubToss(tossOk);
    const r = await call(env, '/api/pay/confirm', { tok, body: { paymentKey: 'pk', orderId: order.data.orderId, amount: 100 } });
    expect(r.status).toBe(400);
    expect(r.data.error).toBe('AMOUNT_MISMATCH');
    expect(calls).toHaveLength(0);
  });

  it('다른 사람 주문은 승인하지 않는다', async () => {
    const env = makeEnv();
    const order = await call(env, '/api/pay/order', { tok: await token('u1', 'u1@example.com'), body: {} });
    stubToss(tossOk);
    const r = await call(env, '/api/pay/confirm', {
      tok: await token('u2', 'u2@example.com'),
      body: { paymentKey: 'pk', orderId: order.data.orderId, amount: 9900 },
    });
    expect(r.status).toBe(403);
  });

  it('토스가 거절하면 이용권이 생기지 않는다', async () => {
    const env = makeEnv();
    const tok = await token('u1', 'u1@example.com');
    const order = await call(env, '/api/pay/order', { tok, body: {} });
    stubToss(() => ({ status: 400, json: { code: 'REJECT_CARD_COMPANY', message: '카드사에서 거절했어요.' } }));
    const r = await call(env, '/api/pay/confirm', { tok, body: { paymentKey: 'pk', orderId: order.data.orderId, amount: 9900 } });
    expect(r.status).toBe(402);
    expect(r.data.error).toBe('REJECT_CARD_COMPANY');
    expect((await call(env, '/api/me', { tok })).data.paid).toBe(false);
  });

  it('다른 사이트에서 보낸 POST는 막는다', async () => {
    const env = makeEnv();
    const r = await call(env, '/api/pay/order', { tok: await token('u1', 'u1@example.com'), body: {}, origin: 'https://evil.example' });
    expect(r.status).toBe(403);
  });

  it('결제 키가 없으면 주문을 받지 않는다', async () => {
    const env = makeEnv({ TOSS_SECRET_KEY: undefined });
    const r = await call(env, '/api/pay/order', { tok: await token('u1', 'u1@example.com'), body: {} });
    expect(r.status).toBe(503);
  });
});

describe('AI 풀이', () => {
  const summary = { name: { hangul: '김서윤', hanja: '金瑞允' }, total: 91, grade: 'S' };
  function fakeClaude(text = '## 이름에 담긴 뜻\n좋은 이름이에요.') {
    const create = vi.fn(async (_p: unknown) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] }));
    setClientFactory(() => ({ beta: { messages: { create } } }) as never);
    return create;
  }

  it('이용권이 없으면 402', async () => {
    fakeClaude();
    const r = await call(makeEnv(), '/api/ai/explain', { tok: await token('u1', 'u1@example.com'), body: { summary } });
    expect(r.status).toBe(402);
  });

  it('관리자는 쓸 수 있고, 같은 입력은 저장된 답을 다시 쓴다', async () => {
    const create = fakeClaude();
    const env = makeEnv();
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
    await env.KV.put('ent:u1', JSON.stringify({ until: Date.now() + 86_400_000, orders: [] }));
    for (const q of ['a', 'b']) expect((await call(env, '/api/ai/explain', { tok, body: { summary, question: q } })).status).toBe(200);
    const r = await call(env, '/api/ai/explain', { tok, body: { summary, question: 'c' } });
    expect(r.status).toBe(429);
    expect(r.data.error).toBe('DAILY_LIMIT');
  });

  it('AI가 거절하면 알려 주고 저장하지 않는다', async () => {
    const create = vi.fn(async () => ({ stop_reason: 'refusal', content: [] }));
    setClientFactory(() => ({ beta: { messages: { create } } }) as never);
    const env = makeEnv();
    const r = await call(env, '/api/ai/explain', { tok: await token('admin1', 'boss@example.com'), body: { summary } });
    expect(r.status).toBe(422);
  });

  it('너무 긴 입력은 받지 않는다', async () => {
    fakeClaude();
    const r = await call(makeEnv(), '/api/ai/explain', {
      tok: await token('admin1', 'boss@example.com'),
      body: { summary: { x: 'ㄱ'.repeat(9000) } },
    });
    expect(r.status).toBe(400);
  });
});
