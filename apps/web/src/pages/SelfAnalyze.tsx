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

/** 정한 이름 풀어보기 (계정 메뉴·리포트의 '한자 바꿔 보기'에서 들어옴) */
export function SelfAnalyze() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const fromUrl = useMemo(() => fromSearch<AnalyzeState>(search), [search]);
  const [stored, setStored] = useStoredState<Draft>('draft-self-v4', EMPTY);
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
    if (!draft.surname) return setError('성을 쓰고 한자를 골라 주세요.');
    if (syllables.length === 0) return setError('이름을 한글로 써 주세요.');
    if (birthResult.error) return setError(birthResult.error);
    const given: NameChar[] = syllables.map((h, i) => ({ hangul: h, hanja: draft.hanja[i] ?? null }));
    const state: AnalyzeState = { v: STATE_VERSION, surname: draft.surname, gender: draft.gender, birth: birthResult.birth, given, school: settings.school, sajuOpts: settings.sajuOpts };
    navigate(`/report?${toQuery(state)}`);
  };

  return (
    <main className="container page">
      <div className="flow stack-lg">
        <div>
          <span className="section-kicker">정한 이름 풀어보기</span>
          <h1 className="q-title" style={{ marginTop: 4 }}>
            생각해 둔 이름을 알려 주세요
          </h1>
        </div>
        <SurnamePicker label="성" value={draft.surname} onChange={(surname) => setDraft({ surname })} />
        <div className="stack" style={{ gap: 16 }}>
          <Field label="이름" htmlFor="given">
            <input id="given" className="input input-xl" placeholder="예: 서윤" value={draft.givenText} maxLength={4} autoComplete="off" onChange={(e) => setDraft({ givenText: e.target.value, hanja: [] })} />
          </Field>
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
        </div>
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
        <ErrorText>{error}</ErrorText>
        <Cta>
          <button type="button" className="btn btn-primary btn-lg" onClick={submit}>
            풀이 보기
          </button>
        </Cta>
      </div>
    </main>
  );
}
