/**
 * 로그인(Google·카카오 OAuth)과 로그인 상태(세션).
 * - 사용자를 Google/카카오 로그인 화면으로 보내고, 돌아올 때 받은 코드를 서버가 직접 확인한다.
 * - 로그인되면 무작위 값을 쿠키에 넣는다. 서버에는 그 값의 해시만 둔다(저장소가 새어도 쿠키를 만들 수 없다).
 * - 두 서비스 모두 로그인 연동은 무료다.
 */
import { isAdminEmail, isLocal, type Env } from './env';
import { b64url, clientIp, cookie, HttpError, limit, randomToken, readCookie, redirect, sha256 } from './http';

export interface User {
  id: string;
  provider: 'google' | 'kakao';
  sub: string;
  email: string | null;
  email_verified: number;
  name: string | null;
  photo: string | null;
}

export interface Session {
  /** 세션 번호(쿠키 값의 해시) */
  id: string;
  user: User;
  /** 관리자 계정인지(Google이 확인한 이메일이 관리자 목록에 있음) */
  admin: boolean;
  /** 관리자 번호를 넣어 결제 없이 쓰는 끝 시각(없으면 0) */
  adminUntil: number;
}

const SESSION_COOKIE = 'aidam_s';
const STATE_COOKIE = 'aidam_o';
const SESSION_DAYS = 30;
const DAY = 86_400_000;

type Provider = 'google' | 'kakao';
const isProvider = (p: string): p is Provider => p === 'google' || p === 'kakao';

function ready(env: Env, p: Provider): boolean {
  return p === 'google' ? Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) : Boolean(env.KAKAO_REST_KEY);
}

export const providers = (env: Env) => ({ google: ready(env, 'google'), kakao: ready(env, 'kakao') });

const callbackUrl = (req: Request, p: Provider) => `${new URL(req.url).origin}/api/auth/${p}/callback`;

/** 1) 로그인 시작: 확인용 값(state)을 쿠키에 두고 Google/카카오 로그인 화면으로 보낸다 */
export async function startLogin(req: Request, env: Env, provider: string): Promise<Response> {
  if (!isProvider(provider)) throw new HttpError('NOT_FOUND', '없는 주소예요.', 404);
  if (!ready(env, provider)) throw new HttpError('LOGIN_NOT_READY', '이 로그인은 아직 준비 중이에요.', 503);
  await limit(env.DB, `login:${clientIp(req)}`, 30, 600);
  const state = randomToken(24);
  const verifier = randomToken(32);
  let url: string;
  if (provider === 'google') {
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    url =
      'https://accounts.google.com/o/oauth2/v2/auth?' +
      new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID!,
        redirect_uri: callbackUrl(req, provider),
        response_type: 'code',
        scope: 'openid email profile',
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      });
  } else {
    url = 'https://kauth.kakao.com/oauth/authorize?' + new URLSearchParams({ client_id: env.KAKAO_REST_KEY!, redirect_uri: callbackUrl(req, provider), response_type: 'code', state });
  }
  return redirect(url, [cookie(req, STATE_COOKIE, `${provider}.${state}.${verifier}`, 600, '/api/auth')]);
}

interface Profile {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  photo: string | null;
}

async function googleProfile(req: Request, env: Env, code: string, verifier: string): Promise<Profile> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: callbackUrl(req, 'google'),
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { id_token?: string };
  if (!res.ok || !data.id_token) throw new HttpError('LOGIN_FAILED', 'Google 로그인을 확인하지 못했어요.', 401);
  // Google 서버에서 직접 받은 값이라 그대로 믿을 수 있다. 그래도 대상·발급자·기한은 확인한다
  const part = data.id_token.split('.')[1] ?? '';
  const p = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)))) as {
    aud?: string;
    iss?: string;
    exp?: number;
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  const issOk = p.iss === 'https://accounts.google.com' || p.iss === 'accounts.google.com';
  if (p.aud !== env.GOOGLE_CLIENT_ID || !issOk || !p.sub || (p.exp ?? 0) * 1000 < Date.now()) throw new HttpError('LOGIN_FAILED', 'Google 로그인을 확인하지 못했어요.', 401);
  return { sub: p.sub, email: p.email ?? null, emailVerified: p.email_verified === true, name: p.name ?? null, photo: p.picture ?? null };
}

async function kakaoProfile(req: Request, env: Env, code: string): Promise<Profile> {
  const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: env.KAKAO_REST_KEY!, redirect_uri: callbackUrl(req, 'kakao'), code });
  if (env.KAKAO_CLIENT_SECRET) body.set('client_secret', env.KAKAO_CLIENT_SECRET);
  const tok = await fetch('https://kauth.kakao.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' }, body });
  const t = (await tok.json().catch(() => ({}))) as { access_token?: string };
  if (!tok.ok || !t.access_token) throw new HttpError('LOGIN_FAILED', '카카오 로그인을 확인하지 못했어요.', 401);
  const me = await fetch('https://kapi.kakao.com/v2/user/me', { headers: { Authorization: `Bearer ${t.access_token}` } });
  const u = (await me.json().catch(() => ({}))) as {
    id?: number | string;
    properties?: { nickname?: string; profile_image?: string };
    kakao_account?: { email?: string; is_email_verified?: boolean; profile?: { nickname?: string; profile_image_url?: string } };
  };
  if (!me.ok || u.id === undefined) throw new HttpError('LOGIN_FAILED', '카카오 로그인을 확인하지 못했어요.', 401);
  const photo = u.kakao_account?.profile?.profile_image_url ?? u.properties?.profile_image ?? null;
  return {
    sub: String(u.id),
    email: u.kakao_account?.email ?? null,
    emailVerified: u.kakao_account?.is_email_verified === true,
    name: u.kakao_account?.profile?.nickname ?? u.properties?.nickname ?? null,
    photo: photo ? photo.replace(/^http:/, 'https:') : null,
  };
}

/** 계정을 찾거나 만들고, 로그인 상태(세션)를 새로 만든다 */
export async function signIn(req: Request, env: Env, provider: Provider, p: Profile, adminUntil = 0): Promise<string> {
  const now = Date.now();
  const id = `u_${randomToken(12)}`;
  const row = await env.DB
    .prepare(
      `INSERT INTO users (id, provider, sub, email, email_verified, name, photo, created_at, last_login) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
       ON CONFLICT (provider, sub) DO UPDATE SET email = ?4, email_verified = ?5, name = ?6, photo = ?7, last_login = ?8
       RETURNING id`,
    )
    .bind(id, provider, p.sub, p.email, p.emailVerified ? 1 : 0, p.name, p.photo, now)
    .first<{ id: string }>();
  return newSession(req, env, row!.id, adminUntil);
}

export async function newSession(req: Request, env: Env, userId: string, adminUntil = 0): Promise<string> {
  const now = Date.now();
  const token = randomToken(32);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    env.DB.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at, admin_until) VALUES (?, ?, ?, ?, ?)').bind(await sha256(token), userId, now, now + SESSION_DAYS * DAY, adminUntil),
  ]);
  return cookie(req, SESSION_COOKIE, token, SESSION_DAYS * 86_400);
}

/** 2) 로그인 화면에서 돌아옴: state가 맞는지 보고, 받은 코드를 Google/카카오 서버에 직접 확인한다 */
export async function finishLogin(req: Request, env: Env, provider: string): Promise<Response> {
  const clear = cookie(req, STATE_COOKIE, '', 0, '/api/auth');
  try {
    if (!isProvider(provider) || !ready(env, provider)) throw new HttpError('NOT_FOUND', '없는 주소예요.', 404);
    await limit(env.DB, `login:${clientIp(req)}`, 30, 600);
    const q = new URL(req.url).searchParams;
    const [p, state, verifier] = (readCookie(req, STATE_COOKIE) ?? '').split('.');
    const code = q.get('code');
    if (!code || !state || !verifier || p !== provider || q.get('state') !== state) throw new HttpError('LOGIN_FAILED', '로그인이 취소됐거나 시간이 지났어요.', 401);
    const profile = provider === 'google' ? await googleProfile(req, env, code, verifier) : await kakaoProfile(req, env, code);
    return redirect('/?login=ok', [clear, await signIn(req, env, provider, profile)]);
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    return redirect('/?login=fail', [clear]);
  }
}

/** 요청의 쿠키로 로그인 상태를 찾는다 */
export async function getSession(req: Request, env: Env): Promise<Session | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token || token.length < 20) return null;
  const now = Date.now();
  const row = await env.DB
    .prepare(
      `SELECT s.id AS sid, s.admin_until, u.id, u.provider, u.sub, u.email, u.email_verified, u.name, u.photo
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?`,
    )
    .bind(await sha256(token), now)
    .first<User & { sid: string; admin_until: number }>();
  if (!row) return null;
  // 관리자는 Google이 확인한 이메일로만 인정한다(카카오는 이메일을 확인해 주지 않을 수 있다)
  const admin = row.provider === 'google' && isAdminEmail(env, row.email, row.email_verified === 1);
  const { sid, admin_until, ...user } = row;
  return { id: sid, user, admin, adminUntil: admin && admin_until > now ? admin_until : 0 };
}

export async function logout(req: Request, env: Env): Promise<string> {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256(token)).run();
  return cookie(req, SESSION_COOKIE, '', 0);
}

/**
 * 시험용 로그인. 내 컴퓨터(localhost)에서 DEV_LOGIN=1로 켰을 때만 동작한다.
 * 배포된 주소에서는 설정값과 상관없이 언제나 꺼져 있다.
 */
export async function devLogin(req: Request, env: Env): Promise<Response> {
  if (env.DEV_LOGIN !== '1' || !isLocal(req)) throw new HttpError('NOT_FOUND', '없는 주소예요.', 404);
  const q = new URL(req.url).searchParams;
  const provider = q.get('provider') === 'kakao' ? 'kakao' : 'google';
  const email = q.get('email');
  const profile: Profile = { sub: q.get('sub') ?? email ?? 'dev', email, emailVerified: q.get('verified') !== '0', name: q.get('name') ?? '시험 계정', photo: null };
  return redirect('/?login=ok', [await signIn(req, env, provider, profile)]);
}

/**
 * 내 컴퓨터의 Claude Code 연결 화면(localhost)으로 로그인 상태를 넘긴다(관리자 계정만).
 * 일회용 값을 만들어 주고(1분), 연결 프로그램이 그 값으로 새 로그인 상태를 받는다.
 */
export async function createHandoff(env: Env, s: Session): Promise<string> {
  if (!s.admin) throw new HttpError('NOT_FOUND', '없는 주소예요.', 404);
  const code = randomToken(24);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM handoff WHERE expires_at < ?').bind(now),
    env.DB.prepare('INSERT INTO handoff (code_hash, user_id, admin_until, expires_at) VALUES (?, ?, ?, ?)').bind(await sha256(code), s.user.id, s.adminUntil, now + 60_000),
  ]);
  return code;
}

export async function redeemHandoff(req: Request, env: Env, code: unknown): Promise<string> {
  await limit(env.DB, `handoff:${clientIp(req)}`, 10, 600);
  if (typeof code !== 'string' || code.length < 20) throw new HttpError('BAD_CODE', '연결 값이 맞지 않아요.', 400);
  // 한 번만 쓸 수 있게, 지우면서 읽는다
  const row = await env.DB.prepare('DELETE FROM handoff WHERE code_hash = ? AND expires_at > ? RETURNING user_id, admin_until').bind(await sha256(code), Date.now()).first<{ user_id: string; admin_until: number }>();
  if (!row) throw new HttpError('BAD_CODE', '연결 값이 맞지 않거나 시간이 지났어요.', 400);
  return newSession(req, env, row.user_id, row.admin_until);
}
