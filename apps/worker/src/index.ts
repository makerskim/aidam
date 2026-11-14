/**
 * 아이담 서버(Cloudflare Workers + D1). 사이트 파일과 /api 를 한 주소에서 내보낸다.
 *
 * 출시 전(SITE_MODE=closed)에는 관리자 계정으로 로그인한 사람에게만 사이트 파일과 /api 를 준다.
 *
 *   GET  /api/auth/google/start, /api/auth/kakao/start   로그인 화면으로 보내기
 *   GET  /api/auth/{google|kakao}/callback                로그인 확인 → 로그인 상태 만들기
 *   POST /api/auth/logout
 *   GET  /api/me                 내 계정 상태: 가진 분석 열쇠, 무료 1회 남음, 관리자 모드(서명 포함)
 *   POST /api/ticket/claim       무료 1회로 이 분석 열기
 *   POST /api/pay/order          주문 만들기(금액은 서버가 정함)
 *   POST /api/pay/confirm        토스 결제 승인 → 그 분석 열쇠 넣기
 *   POST /api/admin/code         관리자 번호를 휴대폰으로 보내기(관리자 계정만)
 *   POST /api/admin/verify       관리자 번호 확인 → 정해진 시간 동안 결제 없이
 *   POST /api/admin/off          관리자 모드 끄기
 *   GET  /api/library            저장한 이름·검색 기록
 *   PUT, DELETE /api/library/:id
 *   POST /api/auth/handoff, /api/auth/handoff/redeem   내 컴퓨터의 Claude Code 연결 화면으로 로그인 넘기기(관리자)
 */
import { adminOff, codeChannel, sendCode, verifyCode } from './admin';
import { createHandoff, devLogin, finishLogin, getSession, logout, providers, redeemHandoff, startLogin, type Session } from './auth';
import { payMode, plan, siteOpen, type Env } from './env';
import { LOCK } from './gate';
import { fail, HttpError, json, limit, readJson, redirect, secure } from './http';
import { deleteLibrary, listLibrary, putLibrary } from './library';
import { confirmPayment, createOrder } from './pay';
import { signAccess } from './sign';
import { claimFree, freeLeft, listKeys } from './tickets';

/** 서명한 계정 상태 */
async function me(env: Env, s: Session | null) {
  const base = { plan: plan(env), payMode: payMode(env), login: providers(env) };
  if (!s) return { user: null, ...base };
  const keys = await listKeys(env.DB, s.user.id);
  const iat = Date.now();
  const sig = await signAccess(env, { uid: s.user.id, admin: s.admin, adminUntil: s.adminUntil, keys, iat });
  return {
    user: { id: s.user.id, name: s.user.name, email: s.user.email, photo: s.user.photo, provider: s.user.provider },
    uid: s.user.id,
    iat,
    sig,
    admin: s.admin,
    adminUntil: s.adminUntil,
    keys,
    freeLeft: await freeLeft(env.DB, s.user.id),
    codeChannel: s.admin ? codeChannel(env) : null,
    ...base,
  };
}

/** 다른 사이트가 내 로그인 상태로 요청을 보내지 못하게, 바꾸는 요청은 같은 주소에서 온 것만 받는다 */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('Origin');
  if (origin) return origin === new URL(req.url).origin;
  const site = req.headers.get('Sec-Fetch-Site');
  return site === null || site === 'same-origin' || site === 'none';
}

async function api(req: Request, env: Env, path: string): Promise<Response> {
  const m = req.method;
  if (m !== 'GET' && !sameOrigin(req)) return fail('BAD_ORIGIN', '허용되지 않은 요청이에요.', 403);

  // 로그인: 출시 전에도 열려 있어야 관리자가 들어올 수 있다
  const auth = /^\/api\/auth\/(google|kakao)\/(start|callback)$/.exec(path);
  if (auth && m === 'GET') return auth[2] === 'start' ? startLogin(req, env, auth[1]!) : finishLogin(req, env, auth[1]!);
  if (path === '/api/auth/dev' && m === 'GET') return devLogin(req, env);
  if (path === '/api/auth/logout' && m === 'POST') {
    const clear = await logout(req, env);
    // 잠금 화면의 버튼(폼)으로 왔으면 첫 화면으로 돌려보낸다
    return (req.headers.get('Accept') ?? '').includes('text/html') ? redirect('/', [clear]) : json({ ok: true }, 200, { 'Set-Cookie': clear });
  }
  if (path === '/api/auth/handoff/redeem' && m === 'POST') {
    return json({ ok: true }, 200, { 'Set-Cookie': await redeemHandoff(req, env, (await readJson(req)).code) });
  }

  const s = await getSession(req, env);
  if (path === '/api/me' && m === 'GET') return json(await me(env, s));

  // 출시 전에는 관리자 계정만 나머지 기능을 쓴다
  if (!siteOpen(env) && !s?.admin) return fail('SITE_CLOSED', '아직 준비 중이에요.', 403);
  if (!s) return fail('UNAUTHORIZED', '로그인이 필요해요.', 401);
  const uid = s.user.id;

  if (path === '/api/ticket/claim' && m === 'POST') {
    await limit(env.DB, `claim:${uid}`, 60, 3600);
    const result = await claimFree(env.DB, uid, (await readJson(req)).key);
    return json({ result, me: await me(env, s) });
  }

  if (path === '/api/pay/order' && m === 'POST') return json(await createOrder(env, uid, (await readJson(req)).key));
  if (path === '/api/pay/confirm' && m === 'POST') {
    const key = await confirmPayment(req, env, uid, await readJson(req));
    return json({ key, me: await me(env, s) });
  }

  if (path.startsWith('/api/admin/') && m === 'POST') {
    // 관리자 계정이 아니면 이런 주소가 있는지도 알려 주지 않는다
    if (!s.admin) return fail('NOT_FOUND', '없는 주소예요.', 404);
    if (path === '/api/admin/code') return json(await sendCode(req, env, s));
    if (path === '/api/admin/verify') {
      const until = await verifyCode(env, s, (await readJson(req)).code);
      return json({ me: await me(env, { ...s, adminUntil: until }) });
    }
    if (path === '/api/admin/off') {
      await adminOff(env, s);
      return json({ me: await me(env, { ...s, adminUntil: 0 }) });
    }
  }

  if (path === '/api/auth/handoff' && m === 'POST') return json({ code: await createHandoff(env, s) });

  if (path === '/api/library' && m === 'GET') return json({ entries: await listLibrary(env.DB, uid) });
  const lib = /^\/api\/library\/([0-9A-Za-z]{1,40})$/.exec(path);
  if (lib && m === 'PUT') {
    await putLibrary(env.DB, uid, lib[1]!, await readJson(req));
    return json({ ok: true });
  }
  if (lib && m === 'DELETE') {
    await deleteLibrary(env.DB, uid, lib[1]!);
    return json({ ok: true });
  }

  return fail('NOT_FOUND', '없는 주소예요.', 404);
}

/** 사이트 파일. 출시 전에는 관리자에게만 주고, 그 밖에는 '준비 중' 화면만 준다 */
async function site(req: Request, env: Env): Promise<Response> {
  if (siteOpen(env)) return secure(await env.ASSETS.fetch(req));
  const html = (body: string) =>
    secure(new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } }), LOCK.csp);
  const s = await getSession(req, env);
  if (!s) return html(LOCK.guest(providers(env).google));
  if (!s.admin) return html(LOCK.notAdmin());
  const res = secure(await env.ASSETS.fetch(req));
  res.headers.set('Cache-Control', 'private, no-cache');
  res.headers.set('X-Robots-Tag', 'noindex');
  return res;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const path = new URL(req.url).pathname;
    try {
      return path.startsWith('/api/') ? secure(await api(req, env, path)) : await site(req, env);
    } catch (e) {
      if (e instanceof HttpError) return secure(fail(e.code, e.message, e.status));
      console.error(e);
      return secure(fail('SERVER_ERROR', '잠시 문제가 생겼어요. 다시 해 주세요.', 500));
    }
  },
} satisfies ExportedHandler<Env>;
