import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { Recommendation, SajuAnalysis, SajuResult, SiblingSet } from '@aidam/engine';
import { decompose } from '@aidam/engine/src/hangul/jamo';
import { call, errorMessage } from '../lib/engine';
import { meaningFor } from '../lib/format';
import { explainCriteria, shortTags, type Criterion } from '../lib/insights';
import { fromSearch, KID_LABELS, kidBirth, STATE_VERSION, surnameLabel, toQuery, type AnalyzeState, type NameState } from '../lib/state';
import { useLibrary } from '../lib/library';
import { useGate } from '../lib/gate';
import { readSession, useSessionState, writeSession } from '../lib/session';
import { SajuBrief } from '../components/report';
import { Disclaimer, ErrorText, Icon, Segmented, Staged, Switch } from '../components/ui';

const PAGE = 20;

type Data =
  | { kind: 'single'; saju: SajuResult | null; recs: Recommendation[] }
  | { kind: 'each'; kids: { label: string; saju: SajuResult | null; recs: Recommendation[] }[] }
  | { kind: 'set'; sajus: (SajuResult | null)[]; sets: SiblingSet[] };

/** 한 번 계산한 결과는 이 탭에 두고, 리포트에서 돌아오면 바로 보여 준다 */
const cache = new Map<string, Data>();

export const FIX_LABEL: Record<Criterion['key'] | 'clean', string> = {
  clean: '아쉬운 점 없는 이름만',
  yongsin: '사주를 잘 채우는 이름만',
  sound: '소리가 잘 어울리는 이름만',
  suri: '획수 운이 좋은 이름만',
  yinyang: '음양이 고른 이름만',
  meaning: '뜻과 발음이 좋은 이름만',
};

function reportQuery(state: NameState, rec: Recommendation, kidIndex: number | null): string {
  const a: AnalyzeState = {
    v: STATE_VERSION,
    surname: state.surname,
    gender: kidIndex === null ? state.gender : (state.kids?.[kidIndex]?.gender ?? state.gender),
    birth: kidIndex === null ? state.birth : kidBirth(state, kidIndex),
    given: rec.report.input.given,
    school: state.school,
    sajuOpts: state.sajuOpts,
  };
  return toQuery(a);
}

function NameCard({ rec, saju, to, rank, label, onOpen }: { rec: Recommendation; saju: SajuAnalysis | null; to: string; rank?: number; label?: string; onOpen: () => void }) {
  const lib = useLibrary();
  const gate = useGate();
  const location = useLocation();
  const query = to.split('?')[1] ?? '';
  const meaning = rec.report.chars.map((h, i) => (h ? meaningFor(h.meaning, rec.report.input.given[i]?.hangul ?? '') : '')).join(' · ');
  const tags = shortTags(rec.report, saju);
  const saved = lib.isBookmarked(rec.hanja, query);
  const given = rec.hangul.slice(rec.report.input.surname.length);
  return (
    <div className="name-card">
      <Link to={to} state={{ from: location.pathname + location.search, rank }} className="nc-link" onClick={onOpen}>
        {rank !== undefined ? <span className={`rank ${rank <= 3 ? 'top' : ''}`}>{rank}</span> : null}
        <span className="nc-main">
          {label ? <span className="nc-label">{label}</span> : null}
          <span className="nc-name">
            <b>
              <span className="sur">{rec.hangul.slice(0, rec.report.input.surname.length)}</span>
              {given}
            </b>
            <span className="hj">{rec.hanja}</span>
          </span>
          <span className="nc-meaning">{meaning}</span>
          <span className="nc-tags">
            {tags.good.slice(0, 2).map((t) => (
              <span key={t} className={`chip ${t.includes('채워요') ? 'chip-primary' : 'chip-good'}`}>
                {t}
              </span>
            ))}
            {tags.caution ? <span className="chip chip-bad">아쉬운 점 {tags.caution}</span> : null}
          </span>
        </span>
        <span className="nc-score">
          <b className="num">{rec.report.score.total}</b>
          <span className={`grade-pill g-${rec.report.score.grade}`}>{rec.report.score.grade}등급</span>
        </span>
      </Link>
      <button
        type="button"
        className="icon-btn nc-mark"
        aria-pressed={saved}
        aria-label={saved ? `${rec.hangul} 북마크 해제` : `${rec.hangul} 북마크`}
        onClick={() => (lib.user ? lib.toggleBookmark({ hangul: rec.hangul, hanja: rec.hanja, total: rec.report.score.total, grade: rec.report.score.grade, query }) : gate.openLogin())}
      >
        {Icon.bookmark(saved)}
      </button>
    </div>
  );
}

interface Ui {
  tab: string;
  sort: 'score' | 'name';
  initial: string;
  shown: number;
  clean: boolean;
}

export function Results() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const state = useMemo(() => fromSearch<NameState>(search), [search]);
  const params = new URLSearchParams(search);
  const fix = params.get('fix') as Criterion['key'] | 'clean' | null;
  const sKey = params.get('s') ?? '';
  const multi = (state?.kids?.length ?? 0) > 1;
  const mode: 'single' | 'each' | 'set' = !multi ? 'single' : state?.kidMode === 'each' ? 'each' : 'set';
  const [data, setData] = useState<Data | null>(() => cache.get(sKey) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [ui, setUi] = useSessionState<Ui>(`results-ui:${sKey}:${fix ?? ''}`, { tab: '0', sort: 'score', initial: '', shown: PAGE, clean: false });
  const restored = useRef(false);

  useEffect(() => {
    if (!state || cache.has(sKey)) return;
    let alive = true;
    setError(null);
    const done = (d: Data) => {
      cache.set(sKey, d);
      if (alive) setData(d);
    };
    const p =
      mode === 'single'
        ? call('recommend', state).then((d) => done({ kind: 'single', saju: d.saju, recs: d.recs }))
        : mode === 'each'
          ? call('recommendEach', state).then((kids) => done({ kind: 'each', kids }))
          : call('recommendKids', state).then((d) => done({ kind: 'set', sajus: d.sajus, sets: d.sets }));
    p.catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [state, sKey, mode]);

  // 리포트에서 돌아오면 보던 자리로
  useLayoutEffect(() => {
    if (!data || restored.current) return;
    restored.current = true;
    const y = readSession<number>(`results-scroll:${search}`, 0);
    if (y > 0) requestAnimationFrame(() => window.scrollTo({ top: y }));
  }, [data, search]);
  const remember = () => writeSession(`results-scroll:${search}`, window.scrollY);

  if (!state) {
    return (
      <main className="container narrow page stack">
        <h1>입력 정보가 없어요</h1>
        <Link className="btn btn-primary" to="/name">
          이름 짓기 시작
        </Link>
      </main>
    );
  }

  const surLen = [...state.surname.hangul].length;
  const initialOf = (r: Recommendation) => decompose([...r.hangul][surLen] ?? '')?.initial ?? '';
  const tabIndex = Number(ui.tab) || 0;

  /** 목록 걸러내기: 첫소리·고치기 옵션·아쉬운 점 없음 */
  const filterList = (recs: Recommendation[], saju: SajuAnalysis | null) => {
    let list = recs.filter((r) => !ui.initial || initialOf(r) === ui.initial);
    if (fix && fix !== 'clean') list = list.filter((r) => explainCriteria(r.report, saju).find((c) => c.key === fix)?.verdict === 'good');
    if (fix === 'clean' || ui.clean) list = list.filter((r) => shortTags(r.report, saju).caution === 0);
    return ui.sort === 'name' ? [...list].sort((a, b) => (a.hangul < b.hangul ? -1 : a.hangul > b.hangul ? 1 : 0)) : list;
  };

  const kidTabs =
    data?.kind === 'each' ? (
      <Segmented label="아이 선택" value={String(tabIndex)} options={data.kids.map((k, i) => ({ value: String(i), label: k.label }))} onChange={(tab) => setUi({ tab, initial: '', shown: PAGE })} />
    ) : null;

  const renderList = (recs: Recommendation[], saju: SajuResult | null, kidIndex: number | null) => {
    const list = filterList(recs, saju?.primary ?? null);
    const initials = [...new Set(recs.map(initialOf))].filter(Boolean).sort();
    return (
      <section className="stack" aria-label="추천 이름" style={{ gap: 16 }}>
        <div className="res-tools">
          <h2>
            추천 이름 <span className="num muted">{list.length}</span>
          </h2>
          <Segmented
            label="정렬"
            value={ui.sort}
            options={[
              { value: 'score', label: '점수순' },
              { value: 'name', label: '가나다순' },
            ]}
            onChange={(sort) => setUi({ sort })}
          />
        </div>
        <div className="res-filters">
          {initials.length > 1 ? (
            <div className="chips" role="group" aria-label="첫소리">
              <button type="button" className="choice" aria-pressed={ui.initial === ''} onClick={() => setUi({ initial: '', shown: PAGE })}>
                전체
              </button>
              {initials.map((c) => (
                <button key={c} type="button" className="choice" aria-pressed={ui.initial === c} onClick={() => setUi({ initial: c, shown: PAGE })}>
                  {c}
                </button>
              ))}
            </div>
          ) : null}
          {fix ? (
            <button type="button" className="chip chip-primary fix-chip" onClick={() => navigate(`/results?s=${sKey}`, { replace: true })}>
              {FIX_LABEL[fix]} ✕
            </button>
          ) : (
            <Switch checked={ui.clean} onChange={(clean) => setUi({ clean, shown: PAGE })} title="아쉬운 점 없는 이름만" />
          )}
        </div>
        {list.length === 0 ? <p className="muted">조건에 맞는 이름이 없어요. 걸러 보기를 풀거나 조건을 바꿔 보세요.</p> : null}
        <div className="list-anim stack" style={{ gap: 12 }}>
          {list.slice(0, ui.shown).map((r, i) => (
            <NameCard key={r.hanja} rec={r} saju={saju?.primary ?? null} rank={ui.sort === 'score' ? i + 1 : undefined} to={`/report?${reportQuery(state, r, kidIndex)}`} onOpen={remember} />
          ))}
        </div>
        {list.length > ui.shown ? (
          <button type="button" className="btn btn-outline btn-block" onClick={() => setUi({ shown: ui.shown + PAGE })}>
            이름 더 보기
          </button>
        ) : null}
      </section>
    );
  };

  const sajuQuery = (kidIndex: number | null) => `/saju?${toQuery(state)}${kidIndex !== null ? `&k=${kidIndex}` : ''}`;

  return (
    <main className="container page results">
      <header className="res-head">
        <div>
          <span className="section-kicker">{multi ? (mode === 'set' ? '다둥이 이름 세트' : '다둥이 이름') : '추천 이름'}</span>
          <h1>
            {surnameLabel(state.surname)} {multi ? '아이들' : '아기'} 이름
          </h1>
        </div>
        <Link className="btn btn-outline btn-sm" to={`/name?${toQuery(state)}`}>
          조건 바꾸기
        </Link>
      </header>

      {error ? <ErrorText>{error}</ErrorText> : null}
      {!error ? (
        <Staged steps={['사주 세우는 중', '필요한 기운 찾는 중', '어울리는 이름 고르는 중']} done={Boolean(data)}>
          {data?.kind === 'single' ? (
            <div className="stack-lg">
              {data.saju ? <SajuBrief saju={data.saju} detailTo={sajuQuery(null)} /> : <NoBirthNote />}
              {renderList(data.recs, data.saju, null)}
            </div>
          ) : null}

          {data?.kind === 'each' ? (
            <div className="stack-lg">
              {kidTabs}
              {(() => {
                const k = data.kids[Math.min(tabIndex, data.kids.length - 1)];
                if (!k) return null;
                const idx = Math.min(tabIndex, data.kids.length - 1);
                return (
                  <>
                    {k.saju ? <SajuBrief saju={k.saju} label={k.label} detailTo={sajuQuery(idx)} /> : <NoBirthNote />}
                    {renderList(k.recs, k.saju, idx)}
                  </>
                );
              })()}
            </div>
          ) : null}

          {data?.kind === 'set' ? (
            <div className="stack-lg">
              <div className="brief-grid">
                {data.sajus.map((sj, i) => (sj ? <SajuBrief key={i} saju={sj} label={KID_LABELS[i]} detailTo={sajuQuery(i)} compact /> : null))}
              </div>
              <section className="stack" aria-label="추천 이름 세트" style={{ gap: 14 }}>
                <h2>
                  어울리는 이름 세트 <span className="num muted">{data.sets.length}</span>
                </h2>
                {data.sets.length === 0 ? <p className="muted">조건에 맞는 세트가 없어요. 조건을 바꿔 보세요.</p> : null}
                {data.sets.map((set, si) => (
                  <article key={si} className="set-card">
                    <div className="set-head">
                      <span className={`rank ${si < 3 ? 'top' : ''}`}>{si + 1}</span>
                      <span className="set-title">세트 {si + 1}</span>
                      <span className="nc-score">
                        <b className="num">{set.score}</b>
                        <span className="grade-pill">세트 점수</span>
                      </span>
                    </div>
                    <div className="stack" style={{ gap: 10 }}>
                      {set.names.map((n, i) => (
                        <NameCard key={i} rec={n} saju={data.sajus[i]?.primary ?? null} label={KID_LABELS[i]} to={`/report?${reportQuery(state, n, i)}`} onOpen={remember} />
                      ))}
                    </div>
                  </article>
                ))}
              </section>
            </div>
          ) : null}
        </Staged>
      ) : null}
      <div style={{ marginTop: 48 }}>
        <Disclaimer />
      </div>
    </main>
  );
}

function NoBirthNote() {
  return <p className="card-soft small">생일 없이 지은 이름이에요. 생일을 넣으면 사주에 맞춰 다시 골라 드려요.</p>;
}
