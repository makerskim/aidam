import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { NameReport } from '@aidam/engine';
import { call } from '../lib/engine';
import { fromSearch, type AnalyzeState } from '../lib/state';
import { clearAllStored, useFavorites } from '../lib/storage';
import { Notice } from '../components/ui';

const ROWS: { key: keyof NameReport['score']; label: string; max?: number }[] = [
  { key: 'total', label: '총점', max: 100 },
  { key: 'resource', label: '자원오행', max: 30 },
  { key: 'suri', label: '수리', max: 25 },
  { key: 'sound', label: '음령오행', max: 20 },
  { key: 'yinyang', label: '음양', max: 10 },
  { key: 'practical', label: '뜻·어감', max: 15 },
];

export function Favorites() {
  const fav = useFavorites();
  const [picked, setPicked] = useState<string[]>([]);
  const [reports, setReports] = useState<NameReport[]>([]);

  useEffect(() => {
    let alive = true;
    const items = fav.list.filter((f) => picked.includes(f.hanja));
    Promise.all(
      items.map((f) => {
        const s = fromSearch<AnalyzeState>(f.query);
        return s ? call('analyze', s).then((d) => d.report) : Promise.resolve(null);
      }),
    ).then((r) => alive && setReports(r.filter((x): x is NameReport => x !== null)));
    return () => {
      alive = false;
    };
  }, [picked, fav.list]);

  const togglePick = (h: string) =>
    setPicked((p) => (p.includes(h) ? p.filter((x) => x !== h) : p.length >= 3 ? p : [...p, h]));

  return (
    <main className="stack-lg">
      <div className="stack">
        <h1>찜한 이름</h1>
        <p className="muted">이 기기에만 저장돼요. 최대 3개를 골라 나란히 비교할 수 있어요.</p>
      </div>
      {fav.list.length === 0 ? (
        <Notice>
          아직 찜한 이름이 없어요. <Link to="/name">이름 추천받기</Link>에서 마음에 드는 이름에 하트를 눌러 보세요.
        </Notice>
      ) : (
        <div>
          {fav.list.map((f) => (
            <div key={f.hanja} className="name-row">
              <input
                type="checkbox"
                aria-label={`${f.hangul} 비교에 넣기`}
                checked={picked.includes(f.hanja)}
                onChange={() => togglePick(f.hanja)}
                style={{ width: 22, height: 22 }}
              />
              <Link to={`/report?${f.query}`} className="who" style={{ color: 'inherit', textDecoration: 'none' }}>
                <span className="ko">{f.hangul}</span>
                <span className="hj">{f.hanja}</span>
              </Link>
              <span className="score">
                <b>{f.total}</b>
                <small>{f.grade}등급</small>
              </span>
              <button type="button" className="btn-icon" aria-label={`${f.hangul} 삭제`} onClick={() => fav.remove(f.hanja)}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      {reports.length >= 2 ? (
        <section className="panel stack">
          <h2>나란히 비교</h2>
          <div className="table-wrap">
            <table className="compare">
              <thead>
                <tr>
                  <th>항목</th>
                  {reports.map((r) => (
                    <th key={r.analysisCode}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>{r.fullHangul}</span>
                      <br />
                      <span className="hanja muted">{r.fullHanja}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => {
                  const best = Math.max(...reports.map((r) => Number(r.score[row.key])));
                  return (
                    <tr key={row.key}>
                      <td>{row.label}</td>
                      {reports.map((r) => (
                        <td key={r.analysisCode} style={{ fontWeight: Number(r.score[row.key]) === best ? 700 : 400 }}>
                          {String(r.score[row.key])}
                          <span className="tiny muted">/{row.max}</span>
                        </td>
                      ))}
                    </tr>
                  );
                })}
                <tr>
                  <td>엄격 기준</td>
                  {reports.map((r) => (
                    <td key={r.analysisCode}>{r.score.passesStrict ? '통과' : '아쉬움'}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : picked.length === 1 ? (
        <p className="small muted">하나 더 고르면 비교표가 나와요.</p>
      ) : null}
      <section className="stack">
        <button
          type="button"
          className="btn btn-line"
          onClick={() => {
            if (window.confirm('찜 목록과 입력 기록을 이 기기에서 모두 지울까요?')) {
              clearAllStored();
              window.location.reload();
            }
          }}
        >
          이 기기에서 기록 모두 지우기
        </button>
      </section>
    </main>
  );
}
