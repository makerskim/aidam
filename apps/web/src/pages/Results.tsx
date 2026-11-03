import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { Recommendation, SajuResult, SiblingSet, SajuAnalysis } from '@aidam/engine';
import { decompose } from '@aidam/engine/src/hangul/jamo';
import { call, errorMessage } from '../lib/engine';
import { meaningFor } from '../lib/format';
import { shortTags } from '../lib/insights';
import { fromSearch, KID_LABELS, kidBirth, STATE_VERSION, toQuery, type AnalyzeState, type NameState } from '../lib/state';
import { useLibrary } from '../lib/library';
import { SajuCard } from '../components/report';
import { Disclaimer, ErrorText, Icon, Segmented, Staged } from '../components/ui';

const PAGE = 20;

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

function NameRow({ rec, saju, to, label }: { rec: Recommendation; saju: SajuAnalysis | null; to: string; label?: string }) {
  const lib = useLibrary();
  const query = to.split('?')[1] ?? '';
  const meaning = rec.report.chars.map((h, i) => (h ? meaningFor(h.meaning, rec.report.input.given[i]?.hangul ?? '') : '')).join(' · ');
  const tags = shortTags(rec.report, saju);
  const saved = lib.isBookmarked(rec.hanja, query);
  return (
    <div className="name-row">
      <Link to={to} className="who">
        {label ? <span className="tiny muted" style={{ display: 'block', fontWeight: 600 }}>{label}</span> : null}
        <span className="ko">{rec.hangul}</span>
        <span className="hj">{rec.hanja}</span>
        <span className="meaning">{meaning}</span>
        <span className="row" style={{ gap: 4, marginTop: 6 }}>
          {tags.good.map((t, i) => (
            <span key={t} className={`chip ${i === 0 && t.includes('보완') ? 'chip-primary' : 'chip-good'}`}>
              {t}
            </span>
          ))}
          {tags.caution ? <span className="chip chip-bad">아쉬운 점 {tags.caution}</span> : null}
        </span>
      </Link>
      <span className="score">
        <b>{rec.report.score.total}</b>
        <small>{rec.report.score.grade}등급</small>
      </span>
      <button
        type="button"
        className="icon-btn"
        aria-pressed={saved}
        aria-label={saved ? `${rec.hangul} 북마크 해제` : `${rec.hangul} 북마크`}
        onClick={() => lib.toggleBookmark({ hangul: rec.hangul, hanja: rec.hanja, total: rec.report.score.total, grade: rec.report.score.grade, query })}
      >
        {Icon.bookmark(saved)}
      </button>
    </div>
  );
}

export function Results() {
  const { search } = useLocation();
  const state = useMemo(() => fromSearch<NameState>(search), [search]);
  const multi = (state?.kids?.length ?? 0) > 1;
  const [single, setSingle] = useState<{ saju: SajuResult | null; recs: Recommendation[] } | null>(null);
  const [kids, setKids] = useState<{ sajus: (SajuResult | null)[]; sets: SiblingSet[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState('0');
  const [sort, setSort] = useState<'score' | 'name'>('score');
  const [initial, setInitial] = useState('');
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    if (!state) return;
    let alive = true;
    setSingle(null);
    setKids(null);
    setError(null);
    const p = multi ? call('recommendKids', state).then((d) => alive && setKids(d)) : call('recommend', state).then((d) => alive && setSingle(d));
    p.catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [state, multi]);

  if (!state) {
    return (
      <main className="stack">
        <h1>입력 정보가 없어요</h1>
        <Link className="btn btn-primary" to="/name">
          이름 짓기 시작
        </Link>
      </main>
    );
  }

  const loading = !error && !single && !kids;
  const sajus = multi ? (kids?.sajus ?? []) : single?.saju ? [single.saju] : [];
  const tabIndex = Math.min(Number(tab), Math.max(0, sajus.length - 1));
  const surLen = [...state.surname.hangul].length;
  const initialOf = (r: Recommendation) => decompose([...r.hangul][surLen] ?? '')?.initial ?? '';
  const recs = single?.recs ?? [];
  const initials = [...new Set(recs.map(initialOf))].filter(Boolean).sort();
  const list = recs.filter((r) => !initial || initialOf(r) === initial).sort((a, b) => (sort === 'score' ? 0 : a.hangul < b.hangul ? -1 : a.hangul > b.hangul ? 1 : 0));

  return (
    <main className="stack-lg">
      <div className="between">
        <h1>{multi ? `${state.surname.hangul}씨 다둥이 이름` : `${state.surname.hangul}씨 아기 이름`}</h1>
        <Link className="btn btn-secondary btn-sm" to={`/name?${toQuery(state)}`}>
          조건 바꾸기
        </Link>
      </div>

      {error ? <ErrorText>{error}</ErrorText> : null}
      {!error ? (
      <Staged steps={['만세력으로 사주를 세우고 있어요', '오행의 균형을 살피고 있어요', '어울리는 이름을 고르고 있어요']} done={!loading}>
      <div className="stack-lg rise">
      {sajus.length ? (
        <section className="stack" aria-label="사주 분석">
          <h2>1. 사주 분석</h2>
          {multi && sajus.length > 1 ? (
            <Segmented label="아이 선택" value={String(tabIndex)} options={sajus.map((_, i) => ({ value: String(i), label: KID_LABELS[i] ?? '' }))} onChange={setTab} />
          ) : null}
          {sajus[tabIndex] ? <SajuCard saju={sajus[tabIndex] as SajuResult} /> : null}
        </section>
      ) : null}

      {single ? (
        <section className="stack" aria-label="추천 이름">
          <h2>{sajus.length ? '2. ' : ''}추천 이름 {recs.length}개</h2>
          <div className="chips-scroll" role="group" aria-label="정렬과 첫소리">
            <button type="button" className="choice" aria-pressed={sort === 'score'} onClick={() => setSort('score')}>
              점수순
            </button>
            <button type="button" className="choice" aria-pressed={sort === 'name'} onClick={() => setSort('name')}>
              가나다순
            </button>
            <button type="button" className="choice" aria-pressed={initial === ''} onClick={() => setInitial('')}>
              전체
            </button>
            {initials.map((c) => (
              <button key={c} type="button" className="choice" aria-pressed={initial === c} onClick={() => { setInitial(c); setShown(PAGE); }}>
                {c}
              </button>
            ))}
          </div>
          {list.length === 0 ? <p className="muted">조건에 맞는 이름이 없어요. 조건을 바꿔 보세요.</p> : null}
          <div className="list">
            {list.slice(0, shown).map((r) => (
              <NameRow key={r.hanja} rec={r} saju={single.saju?.primary ?? null} to={`/report?${reportQuery(state, r, null)}`} />
            ))}
          </div>
          {list.length > shown ? (
            <button type="button" className="btn btn-secondary btn-block" onClick={() => setShown(shown + PAGE)}>
              더 보기
            </button>
          ) : null}
        </section>
      ) : null}

      {kids ? (
        <section className="stack" aria-label="추천 이름 세트">
          <h2>{sajus.some(Boolean) ? '2. ' : ''}추천 이름 세트</h2>
          {kids.sets.length === 0 ? <p className="muted">조건에 맞는 세트가 없어요. 조건을 바꿔 보세요.</p> : null}
          {kids.sets.map((set, si) => (
            <div key={si} className="card stack" style={{ gap: 4 }}>
              <div className="between">
                <b>세트 {si + 1}</b>
                <span className="chip chip-primary">세트 점수 {set.score}</span>
              </div>
              <div className="list">
                {set.names.map((n, i) => (
                  <NameRow key={i} rec={n} saju={kids.sajus[i]?.primary ?? null} label={KID_LABELS[i]} to={`/report?${reportQuery(state, n, i)}`} />
                ))}
              </div>
              <p className="small" style={{ color: 'var(--text-2)' }}>
                {set.pairs[0]?.notes.filter((t) => !t.startsWith('일간') && !t.startsWith('일지')).join(' · ')}
              </p>
            </div>
          ))}
        </section>
      ) : null}
      </div>
      </Staged>
      ) : null}
      <Disclaimer />
    </main>
  );
}
