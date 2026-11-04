import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { Recommendation, SajuResult, SiblingSet, SajuAnalysis } from '@aidam/engine';
import { decompose } from '@aidam/engine/src/hangul/jamo';
import { call, errorMessage } from '../lib/engine';
import { meaningFor } from '../lib/format';
import { shortTags } from '../lib/insights';
import { fromSearch, KID_LABELS, kidBirth, STATE_VERSION, surnameLabel, toQuery, type AnalyzeState, type NameState } from '../lib/state';
import { useLibrary } from '../lib/library';
import { useGate } from '../lib/gate';
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
  const gate = useGate();
  const query = to.split('?')[1] ?? '';
  const meaning = rec.report.chars.map((h, i) => (h ? meaningFor(h.meaning, rec.report.input.given[i]?.hangul ?? '') : '')).join(' · ');
  const tags = shortTags(rec.report, saju);
  const saved = lib.isBookmarked(rec.hanja, query);
  return (
    <div className="name-row">
      <Link to={to} className="who">
        {label ? <span className="chip" style={{ marginBottom: 6 }}>{label}</span> : null}
        <span className="ko">{rec.hangul}</span>
        <span className="hj">{rec.hanja}</span>
        <span className="meaning">{meaning}</span>
        <span className="tags">
          {tags.good.map((t) => (
            <span key={t} className={`chip ${t.includes('채워요') ? 'chip-primary' : 'chip-good'}`}>
              {t}
            </span>
          ))}
          {tags.caution ? <span className="chip chip-bad">아쉬운 점 {tags.caution}개</span> : null}
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
        onClick={() => (lib.user ? lib.toggleBookmark({ hangul: rec.hangul, hanja: rec.hanja, total: rec.report.score.total, grade: rec.report.score.grade, query }) : gate.openLogin())}
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
      <main className="container narrow page stack">
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
    <main className="container page">
      <div className="between" style={{ marginBottom: 32 }}>
        <div>
          <span className="section-kicker">{multi ? '다둥이 이름' : '추천 이름'}</span>
          <h1 style={{ marginTop: 4 }}>{surnameLabel(state.surname)} {multi ? '아이들' : '아기'}에게 어울리는 이름</h1>
        </div>
        <Link className="btn btn-outline btn-sm" to={`/name?${toQuery(state)}`}>
          조건 바꾸기
        </Link>
      </div>

      {error ? <ErrorText>{error}</ErrorText> : null}
      {!error ? (
        <Staged steps={['만세력으로 사주를 세우고 있어요', '다섯 기운의 균형을 살피고 있어요', '부족한 기운을 채우는 이름을 고르고 있어요']} done={!loading}>
          <div className={sajus.length ? 'split' : 'stack'}>
            {sajus.length ? (
              <aside className="sticky-col stack" aria-label="사주 분석">
                {multi && sajus.length > 1 ? (
                  <Segmented label="아이 선택" value={String(tabIndex)} options={sajus.map((_, i) => ({ value: String(i), label: KID_LABELS[i] ?? '' }))} onChange={setTab} />
                ) : null}
                {sajus[tabIndex] ? <SajuCard saju={sajus[tabIndex] as SajuResult} /> : null}
              </aside>
            ) : null}

            {single ? (
              <section className="stack" aria-label="추천 이름">
                <div className="between">
                  <h2>추천 이름 {recs.length}개</h2>
                  <Segmented
                    label="정렬"
                    value={sort}
                    options={[
                      { value: 'score', label: '점수순' },
                      { value: 'name', label: '가나다순' },
                    ]}
                    onChange={setSort}
                  />
                </div>
                {initials.length > 1 ? (
                  <div className="chips" role="group" aria-label="첫소리">
                    <button type="button" className="choice" aria-pressed={initial === ''} onClick={() => setInitial('')}>
                      전체
                    </button>
                    {initials.map((c) => (
                      <button key={c} type="button" className="choice" aria-pressed={initial === c} onClick={() => { setInitial(c); setShown(PAGE); }}>
                        {c}
                      </button>
                    ))}
                  </div>
                ) : null}
                {list.length === 0 ? <p className="muted">조건에 맞는 이름이 없어요. 조건을 바꿔 보세요.</p> : null}
                <div className="list-anim">
                  {list.slice(0, shown).map((r) => (
                    <NameRow key={r.hanja} rec={r} saju={single.saju?.primary ?? null} to={`/report?${reportQuery(state, r, null)}`} />
                  ))}
                </div>
                {list.length > shown ? (
                  <button type="button" className="btn btn-outline btn-block" onClick={() => setShown(shown + PAGE)}>
                    이름 더 보기
                  </button>
                ) : null}
              </section>
            ) : null}

            {kids ? (
              <section className="stack" aria-label="추천 이름 세트">
                <h2>어울리는 이름 세트</h2>
                {kids.sets.length === 0 ? <p className="muted">조건에 맞는 세트가 없어요. 조건을 바꿔 보세요.</p> : null}
                {kids.sets.map((set, si) => (
                  <div key={si} className="card stack" style={{ gap: 14 }}>
                    <div className="between">
                      <h3>세트 {si + 1}</h3>
                      <span className="chip chip-primary">세트 점수 {set.score}</span>
                    </div>
                    <div>
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
      <div style={{ marginTop: 40 }}>
        <Disclaimer />
      </div>
    </main>
  );
}
