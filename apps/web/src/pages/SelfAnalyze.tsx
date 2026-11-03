import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Gender, NameChar } from '@aidam/engine';
import { BirthFields, birthFromDraft, draftFromBirth, EMPTY_BIRTH, HanjaPicker, SchoolOptionsPanel, SurnamePicker, type BirthDraft } from '../components/forms';
import { Cta, ErrorText, Field, Icon, Segmented, Switch } from '../components/ui';
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
  const [stored, setStored] = useStoredState<Draft>('draft-self-v2', EMPTY);
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
    if (!draft.surname) return setError('성을 입력하고 한자를 골라 주세요.');
    if (syllables.length === 0) return setError('이름을 한글로 입력해 주세요.');
    if (birthResult.error) return setError(birthResult.error);
    const given: NameChar[] = syllables.map((h, i) => ({ hangul: h, hanja: draft.hanja[i] ?? null }));
    const state: AnalyzeState = { v: STATE_VERSION, surname: draft.surname, gender: draft.gender, birth: birthResult.birth, given, school: draft.school, sajuOpts: draft.sajuOpts };
    navigate(`/report?${toQuery(state)}`);
  };

  return (
    <main className="stack-lg">
      <h1>지은 이름 풀어보기</h1>
      <SurnamePicker label="성" value={draft.surname} onChange={(surname) => setDraft({ surname })} />
      <Field label="이름" htmlFor="given">
        <input id="given" className="input" placeholder="예: 서윤" value={draft.givenText} maxLength={4} onChange={(e) => setDraft({ givenText: e.target.value, hanja: [] })} />
      </Field>
      <Field label="성별">
        <Segmented
          label="성별"
          value={draft.gender}
          options={[
            { value: 'female', label: '여자' },
            { value: 'male', label: '남자' },
            { value: 'unknown', label: '모름' },
          ]}
          onChange={(gender) => setDraft({ gender })}
        />
      </Field>
      <div className="stack">
        <Switch checked={draft.birth.known} onChange={(known) => setDraft({ birth: { ...draft.birth, known } })} title="생일 넣고 사주까지 보기" />
        {draft.birth.known ? <BirthFields idPrefix="self" value={draft.birth} onChange={(birth) => setDraft({ birth })} /> : null}
      </div>
      {syllables.map((s, i) => (
        <Field key={`${s}-${i}`} label={`‘${s}’ 한자`}>
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
      <details className="acc">
        <summary>
          <span className="grow">
            <b>세부 설정</b>
            <span className="v">학설·시간 보정</span>
          </span>
          {Icon.chevron}
        </summary>
        <div className="acc-body">
          <SchoolOptionsPanel school={draft.school} saju={draft.sajuOpts} onSchool={(school) => setDraft({ school })} onSaju={(sajuOpts) => setDraft({ sajuOpts })} showSaju={draft.birth.known} />
        </div>
      </details>
      <ErrorText>{error}</ErrorText>
      <Cta>
        <button type="button" className="btn btn-primary" onClick={submit}>
          풀이 보기
        </button>
      </Cta>
    </main>
  );
}
