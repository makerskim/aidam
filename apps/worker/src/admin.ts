/**
 * 관리자 번호(일회용).
 * 관리자 계정도 다른 사람과 똑같이 잠긴 화면과 결제 화면을 본다. '관리자 번호 받기'를 누르면 서버가 6자리 번호를 만들어
 * 관리자의 휴대폰으로 보내고(휴대폰 알림 또는 문자), 그 번호를 넣으면 정해진 시간 동안 그 기기에서 결제 없이 쓴다.
 * 번호는 어디에도 고정되어 있지 않다. 누를 때마다 새로 만들고, 5분 뒤 사라지며, 한 번만 쓸 수 있다.
 * 서버에는 번호 자체가 아니라 해시만 잠깐 둔다.
 */
import type { Session } from './auth';
import { isLocal, num, type Env } from './env';
import { HttpError, hex, sha256 } from './http';

const CODE_TTL = 5 * 60_000;
const RESEND_WAIT = 60_000;
const MAX_TRIES = 5;
const HOUR = 3_600_000;

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
    headers: { Authorization: `HMAC-SHA256 apiKey=${env.SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { to: env.ADMIN_PHONE, from: env.SMS_FROM, text } }),
  });
  if (!res.ok) throw new HttpError('SEND_FAILED', '문자를 보내지 못했어요. 문자 설정을 확인해 주세요.', 502);
}

async function sendPush(req: Request, env: Env, text: string): Promise<void> {
  const base = env.NTFY_BASE && isLocal(req) ? env.NTFY_BASE : 'https://ntfy.sh';
  const res = await fetch(`${base}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic: env.NTFY_TOPIC, title: '아이담 관리자 번호', message: text, priority: 4 }),
  });
  if (!res.ok) throw new HttpError('SEND_FAILED', '휴대폰 알림을 보내지 못했어요. 잠시 뒤 다시 해 주세요.', 502);
}

/** 번호를 새로 만들어 휴대폰으로 보낸다 */
export async function sendCode(req: Request, env: Env, s: Session): Promise<{ channel: 'sms' | 'push'; ttl: number }> {
  const channel = codeChannel(env);
  if (!channel) throw new HttpError('CODE_NOT_READY', '관리자 번호를 받을 휴대폰 설정이 아직 없어요.', 503);
  const now = Date.now();
  const prev = await env.DB.prepare('SELECT sent_at FROM otp WHERE user_id = ?').bind(s.user.id).first<{ sent_at: number }>();
  if (prev && now - prev.sent_at < RESEND_WAIT) throw new HttpError('TOO_SOON', '방금 보냈어요. 1분 뒤에 다시 받을 수 있어요.', 429);
  const code = sixDigits();
  await env.DB
    .prepare('INSERT INTO otp (user_id, hash, expires_at, tries, sent_at) VALUES (?1, ?2, ?3, 0, ?4) ON CONFLICT (user_id) DO UPDATE SET hash = ?2, expires_at = ?3, tries = 0, sent_at = ?4')
    .bind(s.user.id, await sha256(`${s.user.id}:${code}`), now + CODE_TTL, now)
    .run();
  const text = `[아이담] 관리자 번호 ${code} (5분 안에 입력)`;
  if (channel === 'sms') await sendSms(env, text);
  else await sendPush(req, env, text);
  return { channel, ttl: CODE_TTL / 1000 };
}

/** 번호를 확인하고, 맞으면 이 로그인 상태에서 관리자 모드를 켠다. 끝나는 시각을 돌려준다 */
export async function verifyCode(env: Env, s: Session, input: unknown): Promise<number> {
  const code = typeof input === 'string' ? input.replace(/\D/g, '') : '';
  if (code.length !== 6) throw new HttpError('BAD_CODE', '6자리 번호를 넣어 주세요.');
  const now = Date.now();
  const rec = await env.DB.prepare('SELECT hash, expires_at, tries FROM otp WHERE user_id = ?').bind(s.user.id).first<{ hash: string; expires_at: number; tries: number }>();
  if (!rec || rec.expires_at < now) throw new HttpError('NO_CODE', '번호가 없거나 시간이 지났어요. 다시 받아 주세요.');
  if (rec.tries >= MAX_TRIES) {
    await env.DB.prepare('DELETE FROM otp WHERE user_id = ?').bind(s.user.id).run();
    throw new HttpError('TOO_MANY', '여러 번 틀렸어요. 번호를 다시 받아 주세요.', 429);
  }
  if ((await sha256(`${s.user.id}:${code}`)) !== rec.hash) {
    await env.DB.prepare('UPDATE otp SET tries = tries + 1 WHERE user_id = ?').bind(s.user.id).run();
    throw new HttpError('WRONG_CODE', '번호가 맞지 않아요.');
  }
  const until = now + num(env.ADMIN_PASS_HOURS, 12) * HOUR;
  // 번호는 한 번만 쓴다: 지우기와 켜기를 한꺼번에
  await env.DB.batch([
    env.DB.prepare('DELETE FROM otp WHERE user_id = ?').bind(s.user.id),
    env.DB.prepare('UPDATE sessions SET admin_until = ? WHERE id = ?').bind(until, s.id),
  ]);
  return until;
}

export async function adminOff(env: Env, s: Session): Promise<void> {
  await env.DB.prepare('UPDATE sessions SET admin_until = 0 WHERE id = ?').bind(s.id).run();
}
