/**
 * 관리자 번호(일회용).
 * 관리자 계정도 다른 사람과 똑같이 결제 화면을 본다. '관리자 번호 받기'를 누르면 서버가 6자리 번호를 만들어
 * 관리자의 휴대폰으로 보내고(문자 또는 휴대폰 알림), 그 번호를 넣으면 정해진 시간 동안 결제 없이 쓴다.
 * 번호는 어디에도 고정되어 있지 않다. 누를 때마다 새로 만들고, 5분 뒤 사라지며, 한 번만 쓸 수 있다.
 * 서버에는 번호 자체가 아니라 해시만 잠깐 둔다.
 */
import { num, type Env } from './env';

const CODE_TTL = 5 * 60; // 초
const RESEND_WAIT = 60; // 초
const MAX_TRIES = 5;
const HOUR = 3_600_000;

export class AdminError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

function sixDigits(): string {
  const b = new Uint32Array(1);
  // 한쪽으로 치우치지 않게 범위를 벗어난 값은 다시 뽑는다
  do crypto.getRandomValues(b);
  while (b[0]! >= 4_294_000_000);
  return String(b[0]! % 1_000_000).padStart(6, '0');
}

/** 어떤 길로 번호를 보내는지: 문자(솔라피) > 휴대폰 알림(ntfy) */
export function codeChannel(env: Env): 'sms' | 'push' | null {
  if (env.SOLAPI_API_KEY && env.SOLAPI_API_SECRET && env.SMS_FROM && env.ADMIN_PHONE) return 'sms';
  if (env.NTFY_TOPIC) return 'push';
  return null;
}

async function sendSms(env: Env, text: string): Promise<void> {
  const date = new Date().toISOString();
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const salt = hex(saltBytes.buffer);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SOLAPI_API_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(date + salt)));
  const res = await fetch('https://api.solapi.com/messages/v4/send', {
    method: 'POST',
    headers: {
      Authorization: `HMAC-SHA256 apiKey=${env.SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: { to: env.ADMIN_PHONE, from: env.SMS_FROM, text } }),
  });
  if (!res.ok) throw new AdminError('SEND_FAILED', '문자를 보내지 못했어요. 문자 설정을 확인해 주세요.', 502);
}

async function sendPush(env: Env, text: string): Promise<void> {
  const res = await fetch('https://ntfy.sh/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic: env.NTFY_TOPIC, title: '아이담 관리자 번호', message: text, priority: 4 }),
  });
  if (!res.ok) throw new AdminError('SEND_FAILED', '휴대폰 알림을 보내지 못했어요. 잠시 뒤 다시 해 주세요.', 502);
}

/** 번호를 새로 만들어 휴대폰으로 보낸다 */
export async function sendCode(env: Env, uid: string): Promise<{ channel: 'sms' | 'push'; ttl: number }> {
  const channel = codeChannel(env);
  if (!channel) throw new AdminError('CODE_NOT_READY', '관리자 번호를 받을 휴대폰 설정이 아직 없어요.', 503);
  if (await env.KV.get(`otpw:${uid}`)) throw new AdminError('TOO_SOON', '방금 보냈어요. 1분 뒤에 다시 받을 수 있어요.', 429);
  const code = sixDigits();
  await env.KV.put(`otp:${uid}`, JSON.stringify({ hash: await sha256(`${uid}:${code}`), exp: Date.now() + CODE_TTL * 1000, tries: 0 }), { expirationTtl: CODE_TTL });
  await env.KV.put(`otpw:${uid}`, '1', { expirationTtl: RESEND_WAIT });
  const text = `[아이담] 관리자 번호 ${code} (5분 안에 입력)`;
  if (channel === 'sms') await sendSms(env, text);
  else await sendPush(env, text);
  return { channel, ttl: CODE_TTL };
}

/** 번호를 확인하고, 맞으면 관리자 모드가 끝나는 시각을 돌려준다 */
export async function verifyCode(env: Env, uid: string, input: unknown): Promise<number> {
  const code = typeof input === 'string' ? input.replace(/\D/g, '') : '';
  if (code.length !== 6) throw new AdminError('BAD_CODE', '6자리 번호를 넣어 주세요.');
  const rec = await env.KV.get<{ hash: string; exp: number; tries: number }>(`otp:${uid}`, 'json');
  if (!rec || rec.exp < Date.now()) throw new AdminError('NO_CODE', '번호가 없거나 시간이 지났어요. 다시 받아 주세요.');
  if (rec.tries >= MAX_TRIES) {
    await env.KV.delete(`otp:${uid}`);
    throw new AdminError('TOO_MANY', '여러 번 틀렸어요. 번호를 다시 받아 주세요.', 429);
  }
  if ((await sha256(`${uid}:${code}`)) !== rec.hash) {
    const left = Math.max(60, Math.ceil((rec.exp - Date.now()) / 1000));
    await env.KV.put(`otp:${uid}`, JSON.stringify({ ...rec, tries: rec.tries + 1 }), { expirationTtl: left });
    throw new AdminError('WRONG_CODE', '번호가 맞지 않아요.');
  }
  await env.KV.delete(`otp:${uid}`); // 한 번만 쓴다
  const until = Date.now() + num(env.ADMIN_PASS_HOURS, 12) * HOUR;
  await env.KV.put(`adm:${uid}`, String(until), { expirationTtl: Math.max(60, Math.ceil(num(env.ADMIN_PASS_HOURS, 12) * 3600)) });
  return until;
}

/** 관리자 모드가 끝나는 시각(없으면 0) */
export async function adminUntil(env: Env, uid: string): Promise<number> {
  const v = Number((await env.KV.get(`adm:${uid}`)) ?? 0);
  return v > Date.now() ? v : 0;
}

export async function adminOff(env: Env, uid: string): Promise<void> {
  await env.KV.delete(`adm:${uid}`);
}
