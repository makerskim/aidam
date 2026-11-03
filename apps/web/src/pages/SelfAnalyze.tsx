import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Gender, NameChar } from '@aidam/engine';
import { BirthFields, birthFromDraft, draftFromBirth, EMPTY_BIRTH, HanjaPicker, SchoolOptionsPanel, SurnamePicker, type BirthDraft } from '../components/forms';
import { BottomBar, ErrorText, Field, Segmented } from '../components/ui';
import { useStoredState } from '../lib/storage';
import { DEFAULT_SAJU, DEFAULT_SCHOOL, fromSearch, STATE_VERSION, toQuery, type AnalyzeState, type SurnameSel } from '../lib/state';

interface Draft {
  surname: SurnameSel | null;
  givenText: string;
  hanja: (string | null)[];
  gender: Gender;
  birth: BirthDraft;
  school: AnalyzeState['school'];
  sajuOpts: AnalyzeState['sajuOpts'];
}

const EMPTY: Draft = { surname: null, givenText: '', hanja: [], gender: 'female', birth: EMPTY_BIRTH, school: DEFAULT_SCHOOL, sajuOpts: DEFAULT_SAJU };

export function SelfAnalyze() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const fromUrl = useMemo(() => fromSearch<AnalyzeState>(search), [search]);
  const [stored, setStored] = useStoredState<Draft>('draft-self', EMPTY);
  const [draft, setDraftState] = useState<Draft>(() =>
    fromUrl
      ? {
          surname: fromUrl.surname,
          givenText: fromUrl.given.map((g) => g.hangul).join(''),
          hanja: fromUrl.given.map((g) => g.hanja),
          gender: fromUrl.gender,
          birth: draftFromBirth(fromUrl.birth),
          school: fromUrl.school,
          sajuOpts: fromUrl.sajuOpts,
        }
      : { ...EMPTY, ...stored },
  );
  const [error, setError] = useState<string | null>(null);
  const setDraft = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    setDraftState(next);
    setStored(next);
    setError(null);
  };

  const syllables = [...draft.givenText.replace(/[^가-힣]/g, '')].slice(0, 4);
  const birthResult = birthFromDraft(draft.birth);

  const submit = () => {
    if (!draft.surname) return setError('성씨를 입력하고 한자를 골라 주세요.');
    if (syllables.length === 0) return setError('이름을 한글로 입력해 주세요.');
    if (birthResult.error) return setError(birthResult.error);
    const given: NameChar[] = syllables.map((h, i) => ({ hangul: h, hanja: draft.hanja[i] ?? null }));
    const state: AnalyzeState = {
      v: STATE_VERSION,
      surname: draft.surname,
      gender: draft.gender,
      birth: birthResult.birth,
      given,
      school: draft.school,
      sajuOpts: draft.sajuOpts,
    };
    navigate(`/report?${toQuery(state)}`);
  };

  return (
    <main className="stack-lg">
      <div className="stack">
        <h1>지은 이름 풀어보기</h1>
        <p className="muted">마음에 둔 이름과 한자를 넣으면 4대 요소로 점수를 매기고, 같은 소리의 더 좋은 한자도 찾아 드려요.</p>
      </div>
      <SurnamePicker value={draft.surname} onChange={(surname) => setDraft({ surname })} />
      <Field label="이름 (성 제외)" htmlFor="given" hint="예: 서윤">
        <input
          id="given"
          className="input"
          value={draft.givenText}
          maxLength={4}
          onChange={(e) => setDraft({ givenText: e.target.value, hanja: [] })}
        />
      </Field>
      <Field label="성별">
        <Segmented
          label="성별"
          value={draft.gender}
          options={[
            { value: 'female', label: '여아' },
            { value: 'male', label: '남아' },
            { value: 'unknown', label: '모름' },
          ]}
          onChange={(gender) => setDraft({ gender })}
        />
      </Field>
      <BirthFields idPrefix="self" value={draft.birth} onChange={(birth) => setDraft({ birth })} />
      {syllables.map((s, i) => (
        <Field key={`${s}-${i}`} label={`'${s}' 한자 고르기`}>
          <HanjaPicker
            syllable={s}
            initial={i === 0}
            birth={birthResult.birth}
            sajuOpts={draft.sajuOpts}
            value={draft.hanja[i] ?? null}
            onChange={(ch) => {
              const hanja = [...draft.hanja];
              hanja[i] = ch;
              setDraft({ hanja });
            }}
          />
        </Field>
      ))}
      <details className="panel-quiet">
        <summary>학설·계산 옵션</summary>
        <SchoolOptionsPanel school={draft.school} saju={draft.sajuOpts} onSchool={(school) => setDraft({ school })} onSaju={(sajuOpts) => setDraft({ sajuOpts })} showSaju={draft.birth.known} />
      </details>
      <ErrorText>{error}</ErrorText>
      <BottomBar>
        <button type="button" className="btn btn-primary" onClick={submit}>
          이름 풀이 보기
        </button>
      </BottomBar>
    </main>
  );
}
