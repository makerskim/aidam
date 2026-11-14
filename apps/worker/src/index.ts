/**
 * 아이담 서버(Cloudflare Workers).
 * 사이트 파일을 그대로 내보내고, /api/* 만 여기서 처리한다.
 *   GET  /api/config       가격·기간, 결제·AI 준비 여부(로그인 불필요)
 *   GET  /api/me           내 이용권·관리자 여부·AI 남은 횟수
 *   POST /api/pay/order    주문 만들기(금액은 서버가 정함)
 *   POST /api/pay/confirm  토스 결제 승인 → 이용권 늘리기
 *   POST /api/ai/explain   AI 이름 풀이(이용권 또는 관리자)
 */
import { AiError, aiUsage, explain } from './ai';
import { AuthError, verifyUser, type AuthUser } from './auth';
import { isAdminEmail, plan, type Env } from './env';
import { confirmPayment, createOrder, getEntitlement, isActive, PayError } from './pay';
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

async function access(env: Env, user: AuthUser) {
  const admin = isAdminEmail(env, user.email, user.emailVerified);
  const ent = await getEntitlement(env, user.uid);
  return { admin, paid: isActive(ent), until: ent?.until ?? null };
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

  if (path === '/api/me' && req.method === 'GET') {
    const a = await access(env, user);
    const ai = await aiUsage(env, user.uid, a.admin);
    const iat = Date.now();
    const sig = await signAccess(env, { uid: user.uid, admin: a.admin, until: a.until, iat });
    return json({ ...a, uid: user.uid, iat, sig, unlocked: a.admin || a.paid, ai, plan: plan(env) });
  }

  if (path === '/api/pay/order' && req.method === 'POST') {
    if (!env.TOSS_SECRET_KEY) return fail('PAY_NOT_READY', '결제 설정이 아직 끝나지 않았어요.', 503);
    return json(await createOrder(env, user));
  }

  if (path === '/api/pay/confirm' && req.method === 'POST') {
    const ent = await confirmPayment(env, user, await readBody(req));
    return json({ paid: true, until: ent.until });
  }

  if (path === '/api/ai/explain' && req.method === 'POST') {
    const a = await access(env, user);
    if (!a.admin && !a.paid) return fail('PAYMENT_REQUIRED', '이용권이 있어야 AI 풀이를 볼 수 있어요.', 402);
    return json(await explain(env, user.uid, a.admin, await readBody(req)));
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
      if (e instanceof PayError || e instanceof AiError) return fail(e.code, e.message, e.status);
      console.error(e);
      return fail('SERVER_ERROR', '잠시 문제가 생겼어요. 다시 해 주세요.', 500);
    }
  },
} satisfies ExportedHandler<Env>;
