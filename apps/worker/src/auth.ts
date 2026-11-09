/**
 * Google 로그인(Firebase Auth) 토큰 확인.
 * 사이트에서 받은 ID 토큰을 Google 공개키로 서명 검증하고, 발급자·대상(프로젝트)을 확인한다.
 */
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export interface AuthUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
}

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

let keys: JWTVerifyGetKey | null = null;
/** 테스트에서 공개키를 바꿔 끼울 때 쓴다 */
export function setKeySource(k: JWTVerifyGetKey | null) {
  keys = k;
}

export class AuthError extends Error {}

export async function verifyUser(req: Request, projectId: string): Promise<AuthUser> {
  const h = req.headers.get('Authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m?.[1]) throw new AuthError('NO_TOKEN');
  keys ??= createRemoteJWKSet(new URL(JWKS_URL));
  try {
    const { payload } = await jwtVerify(m[1], keys, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      algorithms: ['RS256'],
    });
    const uid = typeof payload.sub === 'string' ? payload.sub : '';
    if (!uid) throw new AuthError('NO_SUBJECT');
    const authTime = typeof payload.auth_time === 'number' ? payload.auth_time : 0;
    if (authTime > Date.now() / 1000 + 60) throw new AuthError('BAD_AUTH_TIME');
    return {
      uid,
      email: typeof payload.email === 'string' ? payload.email : null,
      emailVerified: payload.email_verified === true,
    };
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw new AuthError('BAD_TOKEN');
  }
}
