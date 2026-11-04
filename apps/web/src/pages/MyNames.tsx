import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { NameReport } from '@aidam/engine';
import { call } from '../lib/engine';
import { useLibrary } from '../lib/library';
import { fromSearch, type AnalyzeState } from '../lib/state';
import { Icon, Segmented } from '../components/ui';

const ROWS: { key: keyof NameReport['score']; label: string }[] = [
  { key: 'total', label: '총점' },
  { key: 'resource', label: '사주 보완' },
  { key: 'suri', label: '획수' },
  { key: 'sound', label: '소리오행' },
  { key: 'yinyang', label: '음양' },
  { key: 'practical', label: '뜻·발음' },
];

const dateText = (t: number) => (t ? new Date(t).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }) : '');

export function LoginCard() {
  const lib = useLibrary();
  if (lib.user) {
    return (
      <div className="card between">
        <span className="row" style={{ flexWrap: 'nowrap', minWidth: 0 }}>
          {lib.user.photo ? <img src={lib.user.photo} alt="" width={40} height={40} style={{ borderRadius: '50%' }} referrerPolicy="no-referrer" /> : null}
          <span style={{ minWidth: 0 }}>
            <b style={{ display: 'block' }}>{lib.user.name ?? 'Google 계정'}</b>
            <span className="tiny muted">기록이 계정에 저장되고 있어요</span>
          </span>
        </span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void lib.signOut()}>
          로그아웃
        </button>
      </div>
    );
  }
  return (
    <div className="card stack" style={{ gap: 12 }}>
      <b>로그인하면 어느 기기에서든 이어 볼 수 있어요</b>
      <p className="small" style={{ color: 'var(--text-2)' }}>
        풀어 본 이름과 입력한 생년월일이 내 Google 계정의 저장소에 저장돼요. 이름함에서 언제든 지울 수 있어요.
      </p>
      <button type="button" className="btn btn-secondary btn-block" onClick={() => void lib.signIn()} style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
        {Icon.google}
        Google로 계속하기
      </button>
      {!lib.cloudConfigured ? <p className="tiny muted">로그인 기능은 관리자 설정 후 켜져요. 지금은 이 기기에만 저장돼요.</p> : null}
    </div>
  );
}

export function MyNames() {
  const lib = useLibrary();
  const [params, setParams] = useSearchParams();
  const tab: 'history' | 'bookmark' = params.get('tab') === 'history' ? 'history' : 'bookmark';
  const setTab = (t: 'history' | 'bookmark') => setParams({ tab: t === 'history' ? 'history' : 'saved' }, { replace: true });
  const [picked, setPicked] = useState<string[]>([]);
  const [reports, setReports] = useState<NameReport[]>([]);
  const [confirming, setConfirming] = useState(false);
  const list = tab === 'bookmark' ? lib.entries.filter((e) => e.bookmarked) : lib.entries;

  useEffect(() => {
    let alive = true;
    const items = lib.entries.filter((e) => picked.includes(e.id));
    Promise.all(
      items.map((e) => {
        const s = fromSearch<AnalyzeState>(e.query);
        return s ? call('analyze', s).then((d) => d.report) : Promise.resolve(null);
      }),
    ).then((r) => alive && setReports(r.filter((x): x is NameReport => x !== null)));
    return () => {
      alive = false;
    };
  }, [picked, lib.entries]);

  const togglePick = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? p : [...p, id]));

  return (
    <main className="container narrow page stack-lg">
      <h1>{tab === 'bookmark' ? '저장한 이름' : '검색 기록'}</h1>
      <LoginCard />
      {lib.syncError ? <p className="error">{lib.syncError}</p> : null}
      <Segmented
        label="보기"
        value={tab}
        options={[
          { value: 'bookmark', label: `저장한 이름 ${lib.entries.filter((e) => e.bookmarked).length}` },
          { value: 'history', label: `검색 기록 ${lib.entries.length}` },
        ]}
        onChange={(v) => {
          setTab(v);
          setPicked([]);
        }}
      />
      {list.length === 0 ? (
        <div className="stack">
          <p className="muted">{tab === 'bookmark' ? '저장한 이름이 없어요. 이름 옆의 저장 표시를 눌러 모아 보세요.' : '아직 본 이름이 없어요.'}</p>
          <Link className="btn btn-primary btn-block" to="/name">
            이름 짓기 시작
          </Link>
        </div>
      ) : (
        <div className="list">
          {list.map((e) => (
            <div key={e.id} className="name-row">
              {tab === 'bookmark' ? (
                <input type="checkbox" aria-label={`${e.hangul} 비교`} checked={picked.includes(e.id)} onChange={() => togglePick(e.id)} style={{ width: 22, height: 22, accentColor: 'var(--primary)' }} />
              ) : null}
              <Link to={`/report?${e.query}`} className="who">
                <span className="ko">{e.hangul}</span>
                <span className="hj">{e.hanja}</span>
                <span className="meaning">{dateText(e.savedAt)}</span>
              </Link>
              <span className="score">
                <b>{Math.round(e.total)}</b>
                <small>{e.grade}</small>
              </span>
              <button type="button" className="icon-btn" aria-pressed={e.bookmarked} aria-label={e.bookmarked ? `${e.hangul} 저장 해제` : `${e.hangul} 저장`} onClick={() => lib.toggleBookmark(e)}>
                {Icon.bookmark(e.bookmarked)}
              </button>
              {tab === 'history' ? (
                <button type="button" className="icon-btn" aria-label={`${e.hangul} 기록 지우기`} onClick={() => lib.remove(e.id)}>
                  ✕
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {tab === 'bookmark' && list.length >= 2 ? <p className="small muted">비교할 이름을 2~3개 고르세요.</p> : null}
      {reports.length >= 2 ? (
        <section className="stack">
          <h2>비교</h2>
          <div className="table-wrap">
            <table className="compare">
              <thead>
                <tr>
                  <th>항목</th>
                  {reports.map((r, i) => (
                    <th key={i}>
                      {r.fullHangul}
                      <br />
                      <span className="muted">{r.fullHanja}</span>
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
                      {reports.map((r, i) => {
                        const v = Number(r.score[row.key]);
                        return (
                          <td key={i} style={{ fontWeight: v === best ? 800 : 500, color: v === best ? 'var(--primary)' : undefined }}>
                            {v}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {!lib.user && lib.entries.length ? (
        confirming ? (
          <div className="row">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => { lib.clearLocal(); setConfirming(false); }}>
              모두 지우기
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirming(false)}>
              취소
            </button>
          </div>
        ) : (
          <button type="button" className="text-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirming(true)}>
            이 기기의 기록 모두 지우기
          </button>
        )
      ) : null}
    </main>
  );
}
