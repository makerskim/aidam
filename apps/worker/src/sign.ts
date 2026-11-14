/**
 * 이용권 서명.
 * /api/me 답에 서버만 가진 비밀 키로 서명을 붙인다. 사이트는 공개 키로 서명을 확인한 뒤에만 잠금을 푼다.
 * 그래서 브라우저에서 서버 답을 가짜로 바꿔치기해도 잠금이 풀리지 않는다.
 * 키는 배포 워크플로가 한 번 만들어 KV(cfg:signing)에 둔다. 키가 없으면 서명 없이 답한다.
 */
import type { Env } from './env';

let cached: Promise<CryptoKey | null> | null = null;

async function loadKey(env: Env): Promise<CryptoKey | null> {
  const raw = await env.KV.get('cfg:signing');
  if (!raw) return null;
  try {
    const jwk = (JSON.parse(raw) as { private?: JsonWebKey }).private;
    if (!jwk) return null;
    return await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  } catch {
    return null;
  }
}

/** 테스트에서 키를 새로 읽게 한다 */
export function resetSigningKey() {
  cached = null;
}

export const accessMessage = (a: { uid: string; admin: boolean; until: number | null; iat: number }) => `aidam-access|${a.uid}|${a.admin ? 1 : 0}|${a.until ?? 0}|${a.iat}`;

const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

export async function signAccess(env: Env, a: { uid: string; admin: boolean; until: number | null; iat: number }): Promise<string | null> {
  cached ??= loadKey(env);
  const key = await cached;
  if (!key) {
    cached = null; // 키가 나중에 생기면 다시 읽는다
    return null;
  }
  return b64url(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(accessMessage(a))));
}
