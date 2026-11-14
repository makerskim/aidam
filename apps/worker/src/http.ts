/** 응답·쿠키·오류·보안 머리말 */
export class HttpError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** 사이트 전체에 붙이는 보안 머리말 */
const CSP =
  "default-src 'self'; script-src 'self' https://js.tosspayments.com; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: https://*.googleusercontent.com https://*.kakaocdn.net https://*.tosspayments.com https://static.toss.im; " +
  "font-src 'self'; worker-src 'self' blob:; connect-src 'self' https://*.tosspayments.com; frame-src https://*.tosspayments.com; " +
  "base-uri 'self'; form-action 'self'; object-src 'none'; frame-ancestors 'none'";

export function secure(res: Response, csp = CSP): Response {
  const out = new Response(res.body, res);
  out.headers.set('Content-Security-Policy', csp);
  out.headers.set('X-Content-Type-Options', 'nosniff');
  out.headers.set('X-Frame-Options', 'DENY');
  out.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  out.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  out.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return out;
}

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

export const fail = (code: string, message: string, status: number) => json({ error: code, message }, status);

export function redirect(to: string, cookies: string[] = []): Response {
  const h = new Headers({ Location: to, 'Cache-Control': 'no-store' });
  for (const c of cookies) h.append('Set-Cookie', c);
  return new Response(null, { status: 302, headers: h });
}

export function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get('Cookie') ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/** 쿠키 만들기. 자바스크립트가 읽지 못하고(HttpOnly), 다른 사이트 요청에는 실리지 않는다(SameSite) */
export function cookie(req: Request, name: string, value: string, maxAge: number, path = '/'): string {
  const https = new URL(req.url).protocol === 'https:';
  return `${name}=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${https ? '; Secure' : ''}`;
}

export async function readJson(req: Request, limit = 20_000): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > limit) throw new HttpError('TOO_LARGE', '요청이 너무 커요.', 413);
  try {
    const v = JSON.parse(text || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    throw new HttpError('BAD_JSON', '요청 형식이 잘못됐어요.', 400);
  }
}

export const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
export const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
export const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf instanceof Uint8Array ? buf : new Uint8Array(buf))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
export function randomToken(bytes = 32): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return b64url(b);
}

export const clientIp = (req: Request) => req.headers.get('CF-Connecting-IP') ?? 'local';

/**
 * 요청 횟수 제한. 정해진 시간 안에 limit번을 넘으면 거절한다.
 * 한 문장으로 세고 읽어서, 동시에 여러 번 와도 정확하다.
 */
export async function limit(db: D1Database, key: string, max: number, windowSec: number): Promise<void> {
  const now = Date.now();
  const row = await db
    .prepare(
      `INSERT INTO rate (key, count, reset_at) VALUES (?1, 1, ?2)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN rate.reset_at < ?3 THEN 1 ELSE rate.count + 1 END,
         reset_at = CASE WHEN rate.reset_at < ?3 THEN ?2 ELSE rate.reset_at END
       RETURNING count`,
    )
    .bind(key, now + windowSec * 1000, now)
    .first<{ count: number }>();
  if ((row?.count ?? 0) > max) throw new HttpError('TOO_MANY', '요청이 너무 많아요. 잠시 뒤 다시 해 주세요.', 429);
}
