import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Gender, NameChar } from '@aidam/engine';
import { BirthFields, birthFromDraft, draftFromBirth, EMPTY_BIRTH, HanjaPicker, SurnamePicker, type BirthDraft } from '../components/forms';
import { Cta, ErrorText, Field, Segmented, Switch } from '../components/ui';
import { useSettings } from '../lib/settings';
import { useStoredState } from '../lib/storage';
import { fromSearch, STATE_VERSION, toQuery, type AnalyzeState, type SurnameSel } from '../lib/state';

interface Draft {
  surname: SurnameSel | null;
  givenText: string;
  hanja: (string | null)[];
  gender: Gender;
  birth: BirthDraft;
}

const EMPTY: Draft = { surname: null, givenText: '', hanja: [], gender: 'female', birth: EMPTY_BIRTH };

export function SelfAnalyze() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const fromUrl = useMemo(() => fromSearch<AnalyzeState>(search), [search]);
  const [stored, setStored] = useStoredState<Draft>('draft-self-v3', EMPTY);
  const [draft, setDraftState] = useState<Draft>(() =>
    fromUrl
      ? {
          surname: fromUrl.surname,
          givenText: fromUrl.given.map((g) => g.hangul).join(''),
          hanja: fromUrl.given.map((g) => g.hanja),
          gender: fromUrl.gender,
          birth: draftFromBirth(fromUrl.birth),
        }
      : { ...EMPTY, ...stored },
  );
  const [error, setError] = useState<string | null>(null);
  const [settings] = useSettings();
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
    const state: AnalyzeState = { v: STATE_VERSION, surname: draft.surname, gender: draft.gender, birth: birthResult.birth, given, school: settings.school, sajuOpts: settings.sajuOpts };
    navigate(`/report?${toQuery(state)}`);
  };

  return (
    <main className="container narrow page stack-lg">
      <div>
        <span className="section-kicker">지은 이름 풀어보기</span>
        <h1 style={{ marginTop: 4 }}>마음에 둔 이름을 알려 주세요</h1>
        <p className="q-sub">한자까지 고르면 사주에 맞는지, 무엇이 좋고 아쉬운지 풀어 드려요.</p>
      </div>
      <SurnamePicker label="성" value={draft.surname} onChange={(surname) => setDraft({ surname })} />
      <Field label="이름" htmlFor="given">
        <input id="given" className="input" placeholder="예: 서윤" value={draft.givenText} maxLength={4} onChange={(e) => setDraft({ givenText: e.target.value, hanja: [] })} style={{ maxWidth: 360 }} />
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
        <Switch checked={draft.birth.known} onChange={(known) => setDraft({ birth: { ...draft.birth, known } })} title="생일을 넣고 사주까지 볼게요" />
        {draft.birth.known ? <BirthFields idPrefix="self" value={draft.birth} onChange={(birth) => setDraft({ birth })} /> : null}
      </div>
      {syllables.map((s, i) => (
        <Field key={`${s}-${i}`} label={`‘${s}’ 한자`}>
          <HanjaPicker
            syllable={s}
            initial={i === 0}
            birth={birthResult.birth}
            sajuOpts={settings.sajuOpts}
            value={draft.hanja[i] ?? null}
            onChange={(ch) => {
              const hanja = [...draft.hanja];
              hanja[i] = ch;
              setDraft({ hanja });
            }}
          />
        </Field>
      ))}
      <ErrorText>{error}</ErrorText>
      <Cta>
        <button type="button" className="btn btn-primary btn-lg" onClick={submit}>
          풀이 보기
        </button>
      </Cta>
    </main>
  );
}
