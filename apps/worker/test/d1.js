// 테스트용 D1: Node에 들어 있는 SQLite로 같은 SQL을 그대로 돌린다.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export function makeD1() {
  const db = new DatabaseSync(':memory:');
  for (const f of readdirSync(dir).sort()) db.exec(readFileSync(join(dir, f), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async (col) => {
      const r = db.prepare(sql).get(...args);
      return r ? (col ? r[col] : { ...r }) : null;
    },
    all: async () => ({ success: true, meta: {}, results: db.prepare(sql).all(...args).map((r) => ({ ...r })) }),
    run: async () => {
      const r = db.prepare(sql).run(...args);
      return { success: true, results: [], meta: { changes: Number(r.changes) } };
    },
  });
  return {
    prepare: (sql) => stmt(sql),
    batch: async (list) => {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of list) out.push(await s.run());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    /** 테스트에서 직접 들여다볼 때 */
    raw: db,
  };
}
