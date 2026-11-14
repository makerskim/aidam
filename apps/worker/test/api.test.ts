/* eslint-disable @typescript-eslint/no-explicit-any -- 테스트용 가짜 응답 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import { signIn } from '../src/auth';
import type { Env } from '../src/env';
import { accessMessage, resetSigningKey } from '../src/sign';
import { makeD1 } from './d1.js';

const ORIGIN = 'https://aidam.example.workers.dev';
const KEY_A = 'r.abc1234567.pref0001.sch00001';
const KEY_B = 'r.abc1234567.pref0002.sch00001';
const ADMIN = 'boss@example.com';

afterEach(() => vi.unstubAllGlobals());

function makeEnv(over: Partial<Env> = {}): Env & { DB: ReturnType<typeof makeD1> } {
  return {
    DB: makeD1(),
    ASSETS: { fetch: async () => new Response('<html>site</html>', { headers: { 'Content-Type': 'text/html' } }) } as unknown as Fetcher,
    SITE_MODE: 'open',
    PRICE_KRW: '990',
    ORDER_NAME: '아이담 이름 분석 1회',
    ADMIN_PASS_HOURS: '12',
    ADMIN_EMAILS: ADMIN,
    GOOGLE_CLIENT_ID: 'gid',
    GOOGLE_CLIENT_SECRET: 'gsecret',
    KAKAO_REST_KEY: 'kkey',
    TOSS_SECRET_KEY: 'test_sk_dummy',
    NTFY_TOPIC: 'aidam-test-topic',
    ...over,
  } as Env & { DB: ReturnType<typeof makeD1> };
}

/** 쿠키 값만 꺼낸다: "aidam_s=...; Path=..." → "aidam_s=..." */
const pair = (setCookie: string) => setCookie.split(';')[0]!;

/** 로그인된 상태의 쿠키를 만든다(로그인 과정 자체는 아래에서 따로 시험한다) */
async function loginAs(env: Env, email: string, opts: { provider?: 'google' | 'kakao'; verified?: boolean } = {}) {
  const req = new Request(ORIGIN + '/');
  return pair(await signIn(req, env, opts.provider ?? 'google', { sub: `sub-${email}`, email, emailVerified: opts.verified ?? true, name: '이름', photo: null }));
}

async function call(env: Env, path: string, o: { cookie?: string; body?: unknown; method?: string; origin?: string | null; headers?: Record<string, string>; base?: string } = {}) {
  const headers: Record<string, string> = { ...o.headers };
  const method = o.method ?? (o.body !== undefined ? 'POST' : 'GET');
  if (o.cookie) headers.Cookie = o.cookie;
  if (o.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && o.origin !== null) headers.Origin = o.origin ?? o.base ?? ORIGIN;
  const res = await worker.fetch(new Request((o.base ?? ORIGIN) + path, { method, headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined, redirect: 'manual' }), env);
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* JSON이 아닌 답 */
  }
  return { status: res.status, data, text, headers: res.headers, cookies: res.headers.getSetCookie() };
}

function tossOk(b: any) {
  return { status: 200, json: { status: 'DONE', totalAmount: b.amount, orderId: b.orderId, method: '카드' } };
}

/** 바깥으로 나가는 요청(Google·카카오·토스·휴대폰 알림·문자)을 가짜로 받는다 */
function stubOut(o: { toss?: (body: any) => { status: number; json: unknown }; google?: Record<string, unknown>; kakao?: Record<string, unknown> } = {}) {
  const calls: { toss: any[]; push: any[]; sms: any[]; google: URLSearchParams[]; kakao: string[] } = { toss: [], push: [], sms: [], google: [], kakao: [] };
  // 실제 토큰처럼 한글 이름을 UTF-8로 넣는다
  const idToken = (p: Record<string, unknown>) => `h.${btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(p)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.s`;
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      calls.google.push(init.body as URLSearchParams);
      const payload = { aud: 'gid', iss: 'https://accounts.google.com', exp: Math.floor(Date.now() / 1000) + 600, sub: 'g-1', email: ADMIN, email_verified: true, name: '관리자', ...o.google };
      return new Response(JSON.stringify({ id_token: idToken(payload) }));
    }
    if (url === 'https://kauth.kakao.com/oauth/token') {
      calls.kakao.push(String(init.body));
      return new Response(JSON.stringify({ access_token: 'kat' }));
    }
    if (url === 'https://kapi.kakao.com/v2/user/me') {
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer kat');
      return new Response(JSON.stringify({ id: 4242, properties: { nickname: '카카오사람', profile_image: 'http://k.kakaocdn.net/p.jpg' }, ...o.kakao }));
    }
    const body = JSON.parse(String(init.body));
    if (url === 'https://api.tosspayments.com/v1/payments/confirm') {
      expect((init.headers as Record<string, string>).Authorization).toBe('Basic ' + btoa('test_sk_dummy:'));
      calls.toss.push(body);
      const r = (o.toss ?? tossOk)(body);
      return new Response(JSON.stringify(r.json), { status: r.status });
    }
    if (url === 'https://ntfy.sh/') {
      calls.push.push(body);
      return new Response('{}');
    }
    if (url === 'https://api.solapi.com/messages/v4/send') {
      calls.sms.push({ headers: init.headers, body });
      return new Response('{}');
    }
    throw new Error(`예상하지 못한 요청: ${url}`);
  });
  return calls;
}

describe('출시 전 잠금(SITE_MODE=closed)', () => {
  it('로그인하지 않은 사람에게는 준비 중 화면만 주고, 사이트 파일은 주지 않는다', async () => {
    const env = makeEnv({ SITE_MODE: 'closed' });
    for (const path of ['/', '/assets/app.js', '/aidam-claude-bridge.mjs']) {
      const r = await call(env, path);
      expect(r.text).toContain('준비 중이에요');
      expect(r.text).not.toContain('site');
      expect(r.headers.get('Cache-Control')).toBe('no-store');
    }
    expect((await call(env, '/')).text).toContain('/api/auth/google/start');
  });

  it('관리자가 아닌 계정은 로그인해도 들어오지 못하고, 서버 기능도 쓰지 못한다', async () => {
    const env = makeEnv({ SITE_MODE: 'closed' });
    const cookie = await loginAs(env, 'someone@example.com');
    const page = await call(env, '/', { cookie });
    expect(page.text).toContain('지금은 관리자만');
    expect(page.text).not.toContain('site');
    expect((await call(env, '/api/ticket/claim', { cookie, body: { key: KEY_A } })).data.error).toBe('SITE_CLOSED');
    expect((await call(env, '/api/library', { cookie })).status).toBe(403);
    // 이메일이 같아도 Google이 확인하지 않았거나 카카오 계정이면 관리자가 아니다
    for (const c of [await loginAs(env, ADMIN, { verified: false }), await loginAs(env, ADMIN, { provider: 'kakao' })]) {
      expect((await call(env, '/', { cookie: c })).text).not.toContain('site');
    }
  });

  it('관리자 계정은 들어온다', async () => {
    const env = makeEnv({ SITE_MODE: 'closed' });
    const cookie = await loginAs(env, 'Boss@Example.com');
    const page = await call(env, '/', { cookie });
    expect(page.text).toContain('site');
    expect(page.headers.get('X-Robots-Tag')).toBe('noindex');
    expect((await call(env, '/api/library', { cookie })).status).toBe(200);
  });

  it('열면(open) 누구에게나 사이트 파일을 준다', async () => {
    expect((await call(makeEnv(), '/')).text).toContain('site');
  });
});

describe('보안', () => {
  it('모든 답에 보안 머리말을 붙인다', async () => {
    const env = makeEnv();
    for (const r of [await call(env, '/'), await call(env, '/api/me'), await call(env, '/api/nope')]) {
      expect(r.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
      expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(r.headers.get('X-Frame-Options')).toBe('DENY');
      expect(r.headers.get('Strict-Transport-Security')).toContain('max-age');
    }
  });

  it('다른 사이트에서 보낸 바꾸는 요청은 받지 않는다', async () => {
    const env = makeEnv();
    const cookie = await loginAs(env, 'u1@example.com');
    expect((await call(env, '/api/ticket/claim', { cookie, body: { key: KEY_A }, origin: 'https://evil.example' })).status).toBe(403);
    expect((await call(env, '/api/ticket/claim', { cookie, body: { key: KEY_A }, origin: null, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403);
    expect((await call(env, '/api/library/abc', { cookie, method: 'DELETE', origin: 'https://evil.example' })).status).toBe(403);
    expect((await call(env, '/api/me', { cookie })).data.keys).toEqual([]);
  });

  it('로그인 쿠키는 자바스크립트가 읽지 못하고, 서버에는 쿠키 값이 그대로 남지 않는다', async () => {
    const env = makeEnv();
    const set = await signIn(new Request(ORIGIN + '/'), env, 'google', { sub: 's', email: 'a@b.c', emailVerified: true, name: null, photo: null });
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/SameSite=Lax/);
    expect(set).toMatch(/Secure/);
    const token = pair(set).split('=')[1]!;
    const rows = env.DB.raw.prepare('SELECT id FROM sessions').all();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).not.toBe(token);
  });

  it('가짜 쿠키·지난 로그인은 로그인으로 보지 않는다', async () => {
    const env = makeEnv();
    expect((await call(env, '/api/me', { cookie: 'aidam_s=' + 'x'.repeat(43) })).data.user).toBeNull();
    const cookie = await loginAs(env, 'u1@example.com');
    env.DB.raw.exec('UPDATE sessions SET expires_at = 1');
    expect((await call(env, '/api/me', { cookie })).data.user).toBeNull();
  });

  it('시험용 로그인은 배포된 주소에서는 켜 놓아도 동작하지 않는다', async () => {
    const env = makeEnv({ DEV_LOGIN: '1' });
    expect((await call(env, '/api/auth/dev?email=' + ADMIN)).status).toBe(404);
    const local = await call(env, '/api/auth/dev?email=' + ADMIN, { base: 'http://localhost:8787' });
    expect(local.status).toBe(302);
    expect((await call(makeEnv(), '/api/auth/dev?email=' + ADMIN, { base: 'http://localhost:8787' })).status).toBe(404);
  });
});

describe('로그인', () => {
  const stateOf = (cookies: string[]) => pair(cookies.find((c) => c.startsWith('aidam_o='))!);

  it('Google: 로그인 화면으로 보내고, 돌아오면 코드를 확인해 로그인 상태를 만든다', async () => {
    const env = makeEnv();
    const start = await call(env, '/api/auth/google/start');
    expect(start.status).toBe(302);
    const to = new URL(start.headers.get('Location')!);
    expect(to.origin + to.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(to.searchParams.get('redirect_uri')).toBe(ORIGIN + '/api/auth/google/callback');
    expect(to.searchParams.get('code_challenge_method')).toBe('S256');
    const state = to.searchParams.get('state')!;
    const out = stubOut();
    const back = await call(env, `/api/auth/google/callback?code=abc&state=${state}`, { cookie: stateOf(start.cookies) });
    expect(back.status).toBe(302);
    expect(back.headers.get('Location')).toBe('/?login=ok');
    expect(out.google[0]!.get('code')).toBe('abc');
    expect(out.google[0]!.get('client_secret')).toBe('gsecret');
    expect(out.google[0]!.get('code_verifier')).toBeTruthy();
    const session = pair(back.cookies.find((c) => c.startsWith('aidam_s='))!);
    const me = await call(env, '/api/me', { cookie: session });
    expect(me.data.user).toMatchObject({ name: '관리자', email: ADMIN, provider: 'google' });
    expect(me.data.admin).toBe(true);
    // 로그아웃하면 끝
    await call(env, '/api/auth/logout', { cookie: session, body: {} });
    expect((await call(env, '/api/me', { cookie: session })).data.user).toBeNull();
  });

  it('state가 다르거나, 다른 앱용 토큰이면 로그인하지 않는다', async () => {
    const env = makeEnv();
    const start = await call(env, '/api/auth/google/start');
    stubOut();
    const wrong = await call(env, '/api/auth/google/callback?code=abc&state=nope', { cookie: stateOf(start.cookies) });
    expect(wrong.headers.get('Location')).toBe('/?login=fail');
    expect(wrong.cookies.some((c) => c.startsWith('aidam_s='))).toBe(false);
    const noCookie = await call(env, `/api/auth/google/callback?code=abc&state=${new URL(start.headers.get('Location')!).searchParams.get('state')}`);
    expect(noCookie.headers.get('Location')).toBe('/?login=fail');
    stubOut({ google: { aud: 'someone-else' } });
    const s2 = await call(env, '/api/auth/google/start');
    const bad = await call(env, `/api/auth/google/callback?code=abc&state=${new URL(s2.headers.get('Location')!).searchParams.get('state')}`, { cookie: stateOf(s2.cookies) });
    expect(bad.headers.get('Location')).toBe('/?login=fail');
  });

  it('카카오: 로그인하면 계정이 생기고, 다시 로그인하면 같은 계정이다', async () => {
    const env = makeEnv();
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const start = await call(env, '/api/auth/kakao/start');
      const to = new URL(start.headers.get('Location')!);
      expect(to.origin + to.pathname).toBe('https://kauth.kakao.com/oauth/authorize');
      expect(to.searchParams.get('client_id')).toBe('kkey');
      const out = stubOut();
      const back = await call(env, `/api/auth/kakao/callback?code=kc&state=${to.searchParams.get('state')}`, { cookie: stateOf(start.cookies) });
      expect(back.headers.get('Location')).toBe('/?login=ok');
      expect(out.kakao[0]).toContain('code=kc');
      const me = await call(env, '/api/me', { cookie: pair(back.cookies.find((c) => c.startsWith('aidam_s='))!) });
      expect(me.data.user).toMatchObject({ name: '카카오사람', provider: 'kakao', photo: 'https://k.kakaocdn.net/p.jpg' });
      expect(me.data.admin).toBe(false);
      ids.push(me.data.user.id);
    }
    expect(ids[0]).toBe(ids[1]);
    expect(env.DB.raw.prepare('SELECT count(*) AS n FROM users').get().n).toBe(1);
  });

  it('설정하지 않은 로그인은 받지 않고, 로그인 안 한 사람에게는 준비된 로그인만 알려 준다', async () => {
    const env = makeEnv({ KAKAO_REST_KEY: undefined });
    expect((await call(env, '/api/auth/kakao/start')).status).toBe(503);
    const me = await call(env, '/api/me');
    expect(me.data).toMatchObject({ user: null, login: { google: true, kakao: false }, payMode: 'test', plan: { amount: 990 } });
  });
});

describe('1회 = 분석 1건, 첫 1회 무료', () => {
  it('계정마다 첫 분석 1건은 무료로 열리고, 그 분석은 계속 볼 수 있다', async () => {
    const env = makeEnv();
    const cookie = await loginAs(env, 'u1@example.com');
    expect((await call(env, '/api/me', { cookie })).data).toMatchObject({ keys: [], freeLeft: 1 });
    const r = await call(env, '/api/ticket/claim', { cookie, body: { key: KEY_A } });
    expect(r.status).toBe(200);
    expect(r.data.result).toBe('claimed');
    expect(r.data.me).toMatchObject({ keys: [KEY_A], freeLeft: 0 });
    // 같은 분석을 다시 여는 것은 언제나 된다
    expect((await call(env, '/api/ticket/claim', { cookie, body: { key: KEY_A } })).data.result).toBe('owned');
  });

  it('조건을 바꾼 두 번째 분석은 무료로 열리지 않는다(결제 필요)', async () => {
    const env = makeEnv();
    const cookie = await loginAs(env, 'u1@example.com');
    await call(env, '/api/ticket/claim', { cookie, body: { key: KEY_A } });
    const r = await call(env, '/api/ticket/claim', { cookie, body: { key: KEY_B } });
    expect(r.status).toBe(402);
    expect(r.data.error).toBe('FREE_USED');
    expect((await call(env, '/api/me', { cookie })).data.keys).toEqual([KEY_A]);
  });

  it('동시에 여러 분석을 무료로 열려고 해도 하나만 열린다', async () => {
    const env = makeEnv();
    const cookie = await loginAs(env, 'u1@example.com');
    const keys = Array.from({ length: 8 }, (_, i) => `r.abc1234567.pref000${i}.sch00001`);
    const rs = await Promise.all(keys.map((key) => call(env, '/api/ticket/claim', { cookie, body: { key } })));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await call(env, '/api/me', { cookie })).data.keys).toHaveLength(1);
  });

  it('무료 1회는 계정마다 따로다. 로그인하지 않으면 열 수 없다', async () => {
    const env = makeEnv();
    await call(env, '/api/ticket/claim', { cookie: await loginAs(env, 'u1@example.com'), body: { key: KEY_A } });
    const other = await call(env, '/api/ticket/claim', { cookie: await loginAs(env, 'u2@example.com'), body: { key: KEY_B } });
    expect(other.data.result).toBe('claimed');
    expect((await call(env, '/api/ticket/claim', { body: { key: KEY_A } })).status).toBe(401);
  });

  it('열쇠 모양이 이상하면 받지 않는다', async () => {
    const env = makeEnv();
    const cookie = await loginAs(env, 'u1@example.com');
    for (const key of [undefined, '', 'x', 'r.abc', 'r.<script>.aaaa.bbbb', 'z.abc1234567.pref0001.sch00001', "r.abc1234567.pref0001.sch0'--"]) {
      expect((await call(env, '/api/ticket/claim', { cookie, body: { key } })).status).toBe(400);
    }
    expect((await call(env, '/api/me', { cookie })).data.freeLeft).toBe(1);
  });
});

describe('결제(토스페이먼츠 뼈대)', () => {
  it('시크릿 키가 없으면 준비 중: 주문을 받지 않는다', async () => {
    const env = makeEnv({ TOSS_SECRET_KEY: undefined });
    const cookie = await loginAs(env, 'u1@example.com');
    expect((await call(env, '/api/me', { cookie })).data.payMode).toBe('off');
    const r = await call(env, '/api/pay/order', { cookie, body: { key: KEY_A } });
    expect(r.status).toBe(503);
    expect(r.data.error).toBe('PAY_NOT_READY');
    expect((await call(makeEnv({ TOSS_SECRET_KEY: 'live_sk_x' }), '/api/me')).data.payMode).toBe('live');
  });

  it('주문 → 승인하면 그 분석의 열쇠가 계정에 들어간다. 같은 주문은 두 번 승인하지 않는다', async () => {
    const env = makeEnv();
    const cookie = await loginAs(env, 'u1@example.com');
    await call(env, '/api/ticket/claim', { cookie, body: { key: KEY_A } }); // 무료 1회를 먼저 씀
    const order = await call(env, '/api/pay/order', { cookie, body: { key: KEY_B } });
    expect(order.status).toBe(200);
    expect(order.data.amount).toBe(990);
    expect(order.data.customerKey).toMatch(/^c_[0-9a-f]{32}$/);
    const out = stubOut();
    const ok = await call(env, '/api/pay/confirm', { cookie, body: { paymentKey: 'pk', orderId: order.data.orderId, amount: 990 } });
    expect(ok.status).toBe(200);
    expect(ok.data.key).toBe(KEY_B);
    expect(ok.data.me.keys.sort()).toEqual([KEY_A, KEY_B].sort());
    const again = await call(env, '/api/pay/confirm', { cookie, body: { paymentKey: 'pk', orderId: order.data.orderId, amount: 990 } });
    expect(again.status).toBe(200);
    expect(out.toss).toHaveLength(1);
    // 이미 가진 분석은 다시 주문을 받지 않는다
    expect((await call(env, '/api/pay/order', { cookie, body: { key: KEY_B } })).data.error).toBe('ALREADY_OWNED');
    expect(env.DB.raw.prepare("SELECT source FROM tickets WHERE key = ?").get(KEY_B).source).toBe('paid');
  });

  it('금액을 바꾸면 토스에 보내지도 않고 거절한다', async () => {
    const env = makeEnv();
    const cookie = await loginAs(env, 'u1@example.com');
    const order = await call(env, '/api/pay/order', { cookie, body: { key: KEY_A } });
    const out = stubOut();
    const r = await call(env, '/api/pay/confirm', { cookie, body: { paymentKey: 'pk', orderId: order.data.orderId, amount: 100 } });
    expect(r.data.error).toBe('AMOUNT_MISMATCH');
    expect(out.toss).toHaveLength(0);
  });

  it('다른 사람 주문은 승인하지 않고, 토스가 거절하면 열쇠가 생기지 않는다', async () => {
    const env = makeEnv();
    const c1 = await loginAs(env, 'u1@example.com');
    const order = await call(env, '/api/pay/order', { cookie: c1, body: { key: KEY_A } });
    stubOut({ toss: () => ({ status: 400, json: { code: 'REJECT_CARD_COMPANY', message: '카드사에서 거절했어요.' } }) });
    const other = await call(env, '/api/pay/confirm', { cookie: await loginAs(env, 'u2@example.com'), body: { paymentKey: 'pk', orderId: order.data.orderId, amount: 990 } });
    expect(other.status).toBe(403);
    const r = await call(env, '/api/pay/confirm', { cookie: c1, body: { paymentKey: 'pk', orderId: order.data.orderId, amount: 990 } });
    expect(r.status).toBe(402);
    expect(r.data.error).toBe('REJECT_CARD_COMPANY');
    expect((await call(env, '/api/me', { cookie: c1 })).data.keys).toEqual([]);
  });
});

describe('관리자 번호(휴대폰으로 받는 일회용 번호)', () => {
  const codeOf = (text: string) => /관리자 번호 (\d{6})/.exec(text)![1]!;

  it('관리자 계정도 처음에는 잠겨 있다(결제 화면을 그대로 본다)', async () => {
    const env = makeEnv();
    const me = await call(env, '/api/me', { cookie: await loginAs(env, ADMIN) });
    expect(me.data).toMatchObject({ admin: true, adminUntil: 0, keys: [], codeChannel: 'push' });
  });

  it('번호를 휴대폰 알림으로 보내고, 맞게 넣으면 그 기기에서만 관리자 모드가 켜진다. 번호는 한 번만 쓴다', async () => {
    const env = makeEnv();
    const cookie = await loginAs(env, ADMIN);
    const otherDevice = await loginAs(env, ADMIN);
    const out = stubOut();
    const sent = await call(env, '/api/admin/code', { cookie, body: {} });
    expect(sent.data).toEqual({ channel: 'push', ttl: 300 });
    expect(out.push[0].topic).toBe('aidam-test-topic');
    const code = codeOf(out.push[0].message);
    // 서버에는 번호가 그대로 남지 않는다
    expect(JSON.stringify(env.DB.raw.prepare('SELECT * FROM otp').all())).not.toContain(code);
    const ok = await call(env, '/api/admin/verify', { cookie, body: { code } });
    expect(ok.status).toBe(200);
    const hours = (ok.data.me.adminUntil - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(11.9);
    expect(hours).toBeLessThanOrEqual(12);
    expect((await call(env, '/api/me', { cookie })).data.adminUntil).toBe(ok.data.me.adminUntil);
    expect((await call(env, '/api/me', { cookie: otherDevice })).data.adminUntil).toBe(0);
    expect((await call(env, '/api/admin/verify', { cookie, body: { code } })).status).toBe(400);
    const off = await call(env, '/api/admin/off', { cookie, body: {} });
    expect(off.data.me.adminUntil).toBe(0);
    expect((await call(env, '/api/me', { cookie })).data.adminUntil).toBe(0);
  });

  it('틀린 번호는 받지 않고, 다섯 번 틀리면 번호를 버린다. 1분 안에는 다시 보내지 않는다', async () => {
    const env = makeEnv();
    const cookie = await loginAs(env, ADMIN);
    const out = stubOut();
    await call(env, '/api/admin/code', { cookie, body: {} });
    expect((await call(env, '/api/admin/code', { cookie, body: {} })).status).toBe(429);
    expect(out.push).toHaveLength(1);
    const code = codeOf(out.push[0].message);
    const wrong = code === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++) expect((await call(env, '/api/admin/verify', { cookie, body: { code: wrong } })).data.error).toBe('WRONG_CODE');
    expect((await call(env, '/api/admin/verify', { cookie, body: { code } })).status).toBe(429);
    expect((await call(env, '/api/admin/verify', { cookie, body: { code } })).data.error).toBe('NO_CODE');
    expect((await call(env, '/api/me', { cookie })).data.adminUntil).toBe(0);
  });

  it('관리자가 아닌 계정은 번호를 받을 수도 넣을 수도 없다', async () => {
    const env = makeEnv();
    const out = stubOut();
    for (const cookie of [await loginAs(env, 'u1@example.com'), await loginAs(env, ADMIN, { verified: false }), await loginAs(env, ADMIN, { provider: 'kakao' })]) {
      expect((await call(env, '/api/admin/code', { cookie, body: {} })).status).toBe(404);
      expect((await call(env, '/api/admin/verify', { cookie, body: { code: '123456' } })).status).toBe(404);
      expect((await call(env, '/api/me', { cookie })).data.admin).toBe(false);
    }
    expect(out.push).toHaveLength(0);
    // 저장소의 값을 흉내 내도 관리자 계정이 아니면 무시한다
    env.DB.raw.exec(`UPDATE sessions SET admin_until = ${Date.now() + 3_600_000}`);
    expect((await call(env, '/api/me', { cookie: await loginAs(env, 'u1@example.com') })).data.adminUntil).toBe(0);
  });

  it('문자 설정이 있으면 문자로 보내고, 휴대폰 설정이 없으면 번호를 만들지 않는다', async () => {
    const sms = makeEnv({ SOLAPI_API_KEY: 'key1', SOLAPI_API_SECRET: 'secret1', SMS_FROM: '0212345678', ADMIN_PHONE: '01012345678' });
    const out = stubOut();
    expect((await call(sms, '/api/admin/code', { cookie: await loginAs(sms, ADMIN), body: {} })).data.channel).toBe('sms');
    expect(out.push).toHaveLength(0);
    expect(out.sms[0].body.message).toMatchObject({ to: '01012345678', from: '0212345678' });
    expect(out.sms[0].headers.Authorization).toMatch(/^HMAC-SHA256 apiKey=key1, date=.+, salt=[0-9a-f]{32}, signature=[0-9a-f]{64}$/);
    const none = makeEnv({ NTFY_TOPIC: undefined });
    expect((await call(none, '/api/admin/code', { cookie: await loginAs(none, ADMIN), body: {} })).status).toBe(503);
    expect(none.DB.raw.prepare('SELECT count(*) AS n FROM otp').get().n).toBe(0);
  });
});

describe('저장한 이름', () => {
  const entry = { hangul: '김서윤', hanja: '金瑞允', total: 91, grade: 'S', query: 's=abc', savedAt: 1000, bookmarked: true };

  it('내 것만 저장하고 읽고 지운다', async () => {
    const env = makeEnv();
    const c1 = await loginAs(env, 'u1@example.com');
    const c2 = await loginAs(env, 'u2@example.com');
    expect((await call(env, '/api/library/e1', { cookie: c1, method: 'PUT', body: entry })).status).toBe(200);
    await call(env, '/api/library/e1', { cookie: c1, method: 'PUT', body: { ...entry, total: 95 } });
    expect((await call(env, '/api/library', { cookie: c1 })).data.entries).toEqual([{ id: 'e1', ...entry, total: 95 }]);
    expect((await call(env, '/api/library', { cookie: c2 })).data.entries).toEqual([]);
    await call(env, '/api/library/e1', { cookie: c2, method: 'DELETE' });
    expect((await call(env, '/api/library', { cookie: c1 })).data.entries).toHaveLength(1);
    await call(env, '/api/library/e1', { cookie: c1, method: 'DELETE' });
    expect((await call(env, '/api/library', { cookie: c1 })).data.entries).toEqual([]);
  });

  it('로그인하지 않았거나 내용이 이상하면 받지 않는다', async () => {
    const env = makeEnv();
    expect((await call(env, '/api/library')).status).toBe(401);
    const cookie = await loginAs(env, 'u1@example.com');
    expect((await call(env, '/api/library/e1', { cookie, method: 'PUT', body: { ...entry, hangul: '' } })).status).toBe(400);
    expect((await call(env, '/api/library/e1', { cookie, method: 'PUT', body: { ...entry, query: 'x'.repeat(7000) } })).status).toBe(400);
  });
});

describe('내 컴퓨터 연결 화면으로 로그인 넘기기', () => {
  it('관리자만 일회용 값을 만들 수 있고, 한 번만 쓸 수 있다', async () => {
    const env = makeEnv();
    expect((await call(env, '/api/auth/handoff', { cookie: await loginAs(env, 'u1@example.com'), body: {} })).status).toBe(404);
    const made = await call(env, '/api/auth/handoff', { cookie: await loginAs(env, ADMIN), body: {} });
    expect(made.status).toBe(200);
    const got = await call(env, '/api/auth/handoff/redeem', { body: { code: made.data.code } });
    expect(got.status).toBe(200);
    const me = await call(env, '/api/me', { cookie: pair(got.cookies[0]!) });
    expect(me.data.admin).toBe(true);
    expect((await call(env, '/api/auth/handoff/redeem', { body: { code: made.data.code } })).status).toBe(400);
    expect((await call(env, '/api/auth/handoff/redeem', { body: { code: 'x'.repeat(32) } })).status).toBe(400);
  });
});

describe('계정 상태 서명', () => {
  it('키가 없으면 서명 없이 답하고, 있으면 공개 키로 확인되는 서명을 붙인다. 내용을 바꾸면 확인되지 않는다', async () => {
    resetSigningKey();
    const env = makeEnv();
    const cookie = await loginAs(env, 'u1@example.com');
    expect((await call(env, '/api/me', { cookie })).data.sig).toBeNull();
    const kp = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    env.DB.raw.prepare("INSERT INTO config (key, value) VALUES ('signing', ?)").run(JSON.stringify({ private: await crypto.subtle.exportKey('jwk', kp.privateKey), public: await crypto.subtle.exportKey('jwk', kp.publicKey) }));
    await call(env, '/api/ticket/claim', { cookie, body: { key: KEY_A } });
    const d = (await call(env, '/api/me', { cookie })).data;
    expect(typeof d.sig).toBe('string');
    const sig = Uint8Array.from(atob(d.sig.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    const check = (m: string) => crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, kp.publicKey, sig, new TextEncoder().encode(m));
    const base = { uid: d.uid, admin: d.admin, adminUntil: d.adminUntil, keys: d.keys, iat: d.iat };
    expect(await check(accessMessage(base))).toBe(true);
    expect(await check(accessMessage({ ...base, keys: [KEY_A, KEY_B] }))).toBe(false);
    expect(await check(accessMessage({ ...base, admin: true, adminUntil: Date.now() + 9e9 }))).toBe(false);
    expect(await check(accessMessage({ ...base, uid: 'someone-else' }))).toBe(false);
    resetSigningKey();
  });
});

describe('요청 횟수 제한', () => {
  it('로그인 시작을 한곳에서 너무 많이 하면 막는다', async () => {
    const env = makeEnv();
    let last = 0;
    for (let i = 0; i < 32; i++) last = (await call(env, '/api/auth/google/start', { headers: { 'CF-Connecting-IP': '1.2.3.4' } })).status;
    expect(last).toBe(429);
    expect((await call(env, '/api/auth/google/start', { headers: { 'CF-Connecting-IP': '5.6.7.8' } })).status).toBe(302);
  });
});
