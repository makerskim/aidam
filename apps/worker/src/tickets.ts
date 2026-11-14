/**
 * 분석 열쇠. 1회 = 분석 1건.
 * 사이트가 분석 입력(성·아이 정보·이름 조건·계산 기준)으로 만든 열쇠를 계정에 넣으면, 그 분석을 언제든 다시 볼 수 있다.
 * 계정마다 첫 1건은 무료다. 그 뒤로 입력을 바꾼 새 분석은 결제(990원)로 연다.
 */
import { HttpError } from './http';

/** 열쇠 모양: r.(아이)-(아이).(조건).(기준) 또는 a.(아이).(이름).(기준) */
const KEY_RE = /^[ra]\.[0-9a-z-]{4,140}\.[0-9a-z]{4,16}\.[0-9a-z]{4,16}$/;

export function checkKey(key: unknown): string {
  if (typeof key !== 'string' || !KEY_RE.test(key)) throw new HttpError('BAD_KEY', '분석 정보가 없어요. 결과 화면에서 다시 눌러 주세요.');
  return key;
}

/** 계정이 가진 열쇠(최근 것이 앞) */
export async function listKeys(db: D1Database, userId: string): Promise<string[]> {
  const r = await db.prepare('SELECT key FROM tickets WHERE user_id = ? ORDER BY created_at DESC, key').bind(userId).all<{ key: string }>();
  return r.results.map((x) => x.key);
}

/** 무료 1회가 남았는지 */
export async function freeLeft(db: D1Database, userId: string): Promise<number> {
  const r = await db.prepare("SELECT 1 AS used FROM tickets WHERE user_id = ? AND source = 'free' LIMIT 1").bind(userId).first();
  return r ? 0 : 1;
}

export const hasKey = async (db: D1Database, userId: string, key: string) => Boolean(await db.prepare('SELECT 1 AS ok FROM tickets WHERE user_id = ? AND key = ?').bind(userId, key).first());

/**
 * 무료 1회로 이 분석을 연다.
 * "무료 열쇠가 아직 없을 때만 넣는다"를 한 문장으로 처리해, 동시에 여러 번 눌러도 한 번만 된다.
 */
export async function claimFree(db: D1Database, userId: string, rawKey: unknown): Promise<'owned' | 'claimed'> {
  const key = checkKey(rawKey);
  if (await hasKey(db, userId, key)) return 'owned';
  const r = await db
    .prepare(
      `INSERT INTO tickets (user_id, key, source, created_at)
       SELECT ?1, ?2, 'free', ?3 WHERE NOT EXISTS (SELECT 1 FROM tickets WHERE user_id = ?1 AND source = 'free')`,
    )
    .bind(userId, key, Date.now())
    .run();
  if (r.meta.changes !== 1) throw new HttpError('FREE_USED', '무료 1회를 이미 썼어요. 이 분석은 결제 후 볼 수 있어요.', 402);
  return 'claimed';
}
