import { useEffect, useMemo, useState } from 'react';
import { meaningFor } from '../lib/format';
import { Link, useLocation } from 'react-router-dom';
import type { Recommendation, SajuResult } from '@aidam/engine';
import { ELEMENT_HANJA, ELEMENT_KO } from '@aidam/engine/src/core/elements';
import { SCHOOL_KO } from '@aidam/engine/src/name/sound';
import { decompose } from '@aidam/engine/src/hangul/jamo';
import { call, errorMessage } from '../lib/engine';
import { fromSearch, STATE_VERSION, toQuery, type AnalyzeState, type NameState } from '../lib/state';
import { useFavorites } from '../lib/storage';
import { Disclaimer, ElementChip, ErrorText, Loading, Notice, Segmented } from '../components/ui';

const PAGE = 20;

function reportQuery(state: NameState, rec: Recommendation): string {
  const a: AnalyzeState = {
    v: STATE_VERSION,
    surname: state.surname,
    gender: state.gender,
    birth: state.birth,
    given: rec.report.input.given,
    school: state.school,
    sajuOpts: state.sajuOpts,
  };
  return toQuery(a);
}

export function Results() {
  const { search } = useLocation();
  const state = useMemo(() => fromSearch<NameState>(search), [search]);
  const [data, setData] = useState<{ saju: SajuResult | null; recs: Recommendation[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<'score' | 'name'>('score');
  const [minGrade, setMinGrade] = useState<'all' | 'A' | 'S'>('all');
  const [shown, setShown] = useState(PAGE);
  const [initial, setInitial] = useState('');
  const surnameLen = state ? [...state.surname.hangul].length : 1;
  const initialOf = (r: Recommendation) => decompose([...r.hangul][surnameLen] ?? '')?.initial ?? '';
  const fav = useFavorites();

  useEffect(() => {
    if (!state) return;
    let alive = true;
    setData(null);
    setError(null);
    call('recommend', state)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [state]);

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

  const initials = [...new Set((data?.recs ?? []).map(initialOf))].filter(Boolean).sort();
  const list = (data?.recs ?? [])
    .filter((r) => (minGrade === 'all' ? true : minGrade === 'S' ? r.report.score.grade === 'S' : ['S', 'A'].includes(r.report.score.grade)))
    .filter((r) => !initial || initialOf(r) === initial)
    .sort((a, b) => (sort === 'score' ? 0 : a.hangul < b.hangul ? -1 : a.hangul > b.hangul ? 1 : 0));
  const a = data?.saju?.primary;

  return (
    <main className="stack-lg">
      <div className="stepper" aria-hidden="true">
        <span className="on" />
        <span className="on" />
        <span className="on" />
      </div>
      <section className="stack">
        <h1>{state.surname.hangul}씨 아기에게 어울리는 이름</h1>
        {a ? (
          <p className="muted">
            용신 <ElementChip element={a.yongsin} /> {ELEMENT_KO[a.yongsin]}, 희신 <ElementChip element={a.huisin} /> {ELEMENT_KO[a.huisin]}을 채워 주는 한자를 우선했어요.
            음령오행은 {SCHOOL_KO[state.school.soundSchool]} 기준이에요.
          </p>
        ) : data ? (
          <p className="muted">출생 정보 없이 소리·획수·뜻으로 골랐어요.</p>
        ) : null}
        <div className="row">
          <Link className="btn btn-line" to={`/name?${toQuery(state)}`}>
            조건 바꾸기
          </Link>
          {a ? (
            <Link className="btn btn-line" to={`/manse?${toQuery(state)}`}>
              사주 자세히
            </Link>
          ) : null}
        </div>
      </section>

      {error ? <ErrorText>{error}</ErrorText> : null}
      {!data && !error ? <Loading text="사주를 세우고 이름을 고르고 있어요" /> : null}

      {data ? (
        <section className="stack">
          {data.saju?.alternatives.length ? (
            <Notice warn>
              출생 시각이 경계에 가까워 다른 사주로 볼 여지가 있어요({data.saju.alternatives.map((x) => x.label).join(', ')}). 사주 자세히에서 확인해 보세요.
            </Notice>
          ) : null}
          <div className="grid-2">
            <Segmented
              label="정렬"
              value={sort}
              options={[
                { value: 'score', label: '점수순' },
                { value: 'name', label: '가나다순' },
              ]}
              onChange={setSort}
            />
            <Segmented
              label="등급"
              value={minGrade}
              options={[
                { value: 'all', label: '전체' },
                { value: 'A', label: 'A↑' },
                { value: 'S', label: 'S' },
              ]}
              onChange={setMinGrade}
            />
          </div>
          {initials.length > 1 ? (
            <div className="choice-list" role="group" aria-label="이름 첫소리">
              <button type="button" className="choice" aria-pressed={initial === ''} onClick={() => setInitial('')}>
                모든 첫소리
              </button>
              {initials.map((c) => (
                <button key={c} type="button" className="choice" aria-pressed={initial === c} onClick={() => { setInitial(c); setShown(PAGE); }}>
                  {c}
                </button>
              ))}
            </div>
          ) : null}
          {list.length === 0 ? (
            <Notice>
              조건에 맞는 이름이 없어요. 피하고 싶은 소리를 줄이거나, 학설·계산 옵션에서 &lsquo;엄격하게 고르기&rsquo;를 꺼 보세요.
            </Notice>
          ) : null}
          <div>
            {list.slice(0, shown).map((r) => {
              const q = reportQuery(state, r);
              const meaning = r.report.chars.map((h, i) => (h ? meaningFor(h.meaning, r.report.input.given[i]?.hangul ?? '') : '')).join(' · ');
              const saved = fav.has(r.hanja);
              return (
                <div key={r.hanja} className="name-row">
                  <Link to={`/report?${q}`} className="who" style={{ color: 'inherit', textDecoration: 'none' }}>
                    <span className="ko">{r.hangul}</span>
                    <span className="hj">{r.hanja}</span>
                    <span className="meaning" style={{ display: 'block' }}>
                      {meaning}{' '}
                      {r.report.resource.map((x) => (
                        <span key={x.ch} className="sr-only">
                          {ELEMENT_HANJA[x.element]}
                        </span>
                      ))}
                    </span>
                  </Link>
                  <span className="score">
                    <b>{r.report.score.total}</b>
                    <small>{r.report.score.grade}등급</small>
                  </span>
                  <button
                    type="button"
                    className="btn-icon heart"
                    aria-pressed={saved}
                    aria-label={saved ? `${r.hangul} 찜 해제` : `${r.hangul} 찜하기`}
                    onClick={() => fav.toggle({ hangul: r.hangul, hanja: r.hanja, total: r.report.score.total, grade: r.report.score.grade, query: q })}
                  >
                    {saved ? '♥' : '♡'}
                  </button>
                </div>
              );
            })}
          </div>
          {list.length > shown ? (
            <button type="button" className="btn btn-line btn-block" onClick={() => setShown(shown + PAGE)}>
              {Math.min(PAGE, list.length - shown)}개 더 보기
            </button>
          ) : null}
          <p className="tiny muted">
            엔진 v{data.recs[0]?.report.engineVersion ?? ''} · 데이터 {data.recs[0]?.report.dataVersion ?? ''} · 같은 조건이면 언제나 같은 순서로 추천돼요.
          </p>
        </section>
      ) : null}
      <Disclaimer />
    </main>
  );
}
