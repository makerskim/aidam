/**
 * 아이담 서버(Cloudflare Workers).
 * 사이트 파일을 그대로 내보내고, /api/* 만 여기서 처리한다.
 *   GET  /api/config        가격, 결제·AI 준비 여부(로그인 불필요)
 *   GET  /api/me            내 계정 상태: 산 분석 열쇠, 관리자 여부·관리자 모드(서명 포함)
 *   POST /api/pay/order     주문 만들기(금액은 서버가 정함, 분석 열쇠와 함께)
 *   POST /api/pay/confirm   토스 결제 승인 → 그 분석 열쇠를 계정에 넣기
 *   POST /api/admin/code    관리자 번호를 휴대폰으로 보내기(관리자 계정만)
 *   POST /api/admin/verify  관리자 번호 확인 → 정해진 시간 동안 결제 없이
 *   POST /api/admin/off     관리자 모드 끄기(일반 사용자 화면 확인용)
 *   POST /api/ai/explain    AI 이름 풀이(API 키를 넣었을 때만)
 */
import { AdminError, adminOff, adminUntil, codeChannel, sendCode, verifyCode } from './admin';
import { AiError, aiUsage, explain } from './ai';
import { AuthError, verifyUser, type AuthUser } from './auth';
import { isAdminEmail, plan, type Env } from './env';
import { confirmPayment, createOrder, getKeys, PayError } from './pay';
import { signAccess } from './sign';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

const fail = (code: string, message: string, status: number) => json({ error: code, message }, status);

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > 20_000) throw new PayError('TOO_LARGE', '요청이 너무 커요.', 413);
  try {
    const v = JSON.parse(text || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    throw new PayError('BAD_JSON', '요청 형식이 잘못됐어요.', 400);
  }
}

/** 서명한 계정 상태. 방금 바뀐 값은 넘겨받아 쓴다(저장소가 조금 늦게 반영될 수 있어서) */
async function me(env: Env, user: AuthUser, known: { keys?: string[]; adminUntil?: number } = {}) {
  const admin = isAdminEmail(env, user.email, user.emailVerified);
  const keys = known.keys ?? (await getKeys(env, user.uid));
  const until = admin ? (known.adminUntil ?? (await adminUntil(env, user.uid))) : 0;
  const iat = Date.now();
  const sig = await signAccess(env, { uid: user.uid, admin, adminUntil: until, keys, iat });
  const ai = await aiUsage(env, user.uid, until > iat);
  return { uid: user.uid, iat, sig, admin, adminUntil: until, keys, ai, plan: plan(env), codeChannel: admin ? codeChannel(env) : null };
}

export async function handleApi(req: Request, env: Env, path: string): Promise<Response> {
  if (path === '/api/config' && req.method === 'GET') {
    return json({ plan: plan(env), payReady: !!env.TOSS_SECRET_KEY, aiReady: !!env.ANTHROPIC_API_KEY });
  }

  // 같은 사이트에서만 부른다: 다른 출처의 POST는 막는다
  if (req.method === 'POST') {
    const origin = req.headers.get('Origin');
    if (origin && origin !== new URL(req.url).origin) return fail('BAD_ORIGIN', '허용되지 않은 요청이에요.', 403);
  }

  let user: AuthUser;
  try {
    user = await verifyUser(req, env.FIREBASE_PROJECT_ID);
  } catch (e) {
    if (e instanceof AuthError) return fail('UNAUTHORIZED', '로그인이 필요해요.', 401);
    throw e;
  }

  if (path === '/api/me' && req.method === 'GET') return json(await me(env, user));

  if (path === '/api/pay/order' && req.method === 'POST') {
    if (!env.TOSS_SECRET_KEY) return fail('PAY_NOT_READY', '결제 설정이 아직 끝나지 않았어요.', 503);
    return json(await createOrder(env, user, await readBody(req)));
  }

  if (path === '/api/pay/confirm' && req.method === 'POST') {
    const r = await confirmPayment(env, user, await readBody(req));
    return json({ key: r.key, me: await me(env, user, { keys: r.keys }) });
  }

  if (path.startsWith('/api/admin/') && req.method === 'POST') {
    // 관리자 계정이 아니면 이런 주소가 있는지도 알려 주지 않는다
    if (!isAdminEmail(env, user.email, user.emailVerified)) return fail('NOT_FOUND', '없는 주소예요.', 404);
    if (path === '/api/admin/code') return json(await sendCode(env, user.uid));
    if (path === '/api/admin/verify') {
      const until = await verifyCode(env, user.uid, (await readBody(req)).code);
      return json({ me: await me(env, user, { adminUntil: until }) });
    }
    if (path === '/api/admin/off') {
      await adminOff(env, user.uid);
      return json({ me: await me(env, user, { adminUntil: 0 }) });
    }
  }

  if (path === '/api/ai/explain' && req.method === 'POST') {
    const adminOn = isAdminEmail(env, user.email, user.emailVerified) && (await adminUntil(env, user.uid)) > 0;
    if (!adminOn && (await getKeys(env, user.uid)).length === 0) return fail('PAYMENT_REQUIRED', '결제한 분석이 있어야 AI 풀이를 볼 수 있어요.', 402);
    return json(await explain(env, user.uid, adminOn, await readBody(req)));
  }

  return fail('NOT_FOUND', '없는 주소예요.', 404);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      return await handleApi(req, env, url.pathname);
    } catch (e) {
      if (e instanceof PayError || e instanceof AiError || e instanceof AdminError) return fail(e.code, e.message, e.status);
      console.error(e);
      return fail('SERVER_ERROR', '잠시 문제가 생겼어요. 다시 해 주세요.', 500);
    }
  },
} satisfies ExportedHandler<Env>;
