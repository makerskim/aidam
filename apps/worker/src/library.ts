/** 저장한 이름·검색 기록. 로그인한 계정의 것만 읽고 쓴다(계정 번호는 로그인 상태에서만 가져온다). */
import { HttpError, limit } from './http';

const MAX_ENTRIES = 500;
const str = (v: unknown, max: number): string => {
  if (typeof v !== 'string' || v.length === 0 || v.length > max) throw new HttpError('BAD_ENTRY', '저장할 내용이 올바르지 않아요.');
  return v;
};

export async function listLibrary(db: D1Database, userId: string) {
  const r = await db
    .prepare('SELECT id, hangul, hanja, total, grade, query, saved_at AS savedAt, bookmarked FROM library WHERE user_id = ? ORDER BY saved_at DESC LIMIT ?')
    .bind(userId, MAX_ENTRIES)
    .all<{ id: string; hangul: string; hanja: string; total: number; grade: string; query: string; savedAt: number; bookmarked: number }>();
  return r.results.map((e) => ({ ...e, bookmarked: e.bookmarked === 1 }));
}

export async function putLibrary(db: D1Database, userId: string, id: string, body: Record<string, unknown>): Promise<void> {
  await limit(db, `lib:${userId}`, 600, 3600);
  if (!/^[0-9a-z]{1,40}$/i.test(id)) throw new HttpError('BAD_ENTRY', '저장할 내용이 올바르지 않아요.');
  const total = Number(body.total);
  if (!Number.isFinite(total)) throw new HttpError('BAD_ENTRY', '저장할 내용이 올바르지 않아요.');
  const savedAt = Number(body.savedAt);
  await db
    .prepare(
      `INSERT INTO library (user_id, id, hangul, hanja, total, grade, query, saved_at, bookmarked) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
       ON CONFLICT (user_id, id) DO UPDATE SET hangul = ?3, hanja = ?4, total = ?5, grade = ?6, query = ?7, saved_at = ?8, bookmarked = ?9`,
    )
    .bind(userId, id, str(body.hangul, 40), str(body.hanja, 40), total, str(body.grade, 4), str(body.query, 6000), Number.isFinite(savedAt) ? savedAt : Date.now(), body.bookmarked === true ? 1 : 0)
    .run();
  // 너무 많이 쌓이면 북마크하지 않은 오래된 기록부터 지운다
  await db
    .prepare('DELETE FROM library WHERE user_id = ?1 AND bookmarked = 0 AND id NOT IN (SELECT id FROM library WHERE user_id = ?1 ORDER BY bookmarked DESC, saved_at DESC LIMIT ?2)')
    .bind(userId, MAX_ENTRIES)
    .run();
}

export async function deleteLibrary(db: D1Database, userId: string, id: string): Promise<void> {
  await db.prepare('DELETE FROM library WHERE user_id = ? AND id = ?').bind(userId, id).run();
}
