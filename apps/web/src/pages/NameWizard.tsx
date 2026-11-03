import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Gender, Preferences } from '@aidam/engine';
import { BirthFields, birthFromDraft, draftFromBirth, EMPTY_BIRTH, HanjaPicker, SchoolOptionsPanel, SurnamePicker, type BirthDraft } from '../components/forms';
import { BottomBar, ErrorText, Field, Segmented } from '../components/ui';
import { useStoredState } from '../lib/storage';
import { DEFAULT_PREFS, DEFAULT_SAJU, DEFAULT_SCHOOL, fromSearch, STATE_VERSION, toQuery, type NameState, type SurnameSel } from '../lib/state';

interface Draft {
  step: 1 | 2;
  surname: SurnameSel | null;
  gender: Gender;
  birth: BirthDraft;
  prefs: Preferences;
  fixedHangul: string;
  fixedHanja: string | null;
  fixedPos: number;
  includeText: string;
  excludeText: string;
  school: NameState['school'];
  sajuOpts: NameState['sajuOpts'];
}

const EMPTY: Draft = {
  step: 1,
  surname: null,
  gender: 'female',
  birth: EMPTY_BIRTH,
  prefs: DEFAULT_PREFS,
  fixedHangul: '',
  fixedHanja: null,
  fixedPos: 1,
  includeText: '',
  excludeText: '',
  school: DEFAULT_SCHOOL,
  sajuOpts: DEFAULT_SAJU,
};

function fromState(s: NameState): Draft {
  return {
    ...EMPTY,
    surname: s.surname,
    gender: s.gender,
    birth: draftFromBirth(s.birth),
    prefs: s.prefs,
    fixedHangul: s.prefs.fixed?.hangul ?? '',
    fixedHanja: s.prefs.fixed?.hanja ?? null,
    fixedPos: s.prefs.fixed?.position ?? 1,
    includeText: (s.prefs.include ?? []).join(' '),
    excludeText: (s.prefs.exclude ?? []).join(' '),
    school: s.school,
    sajuOpts: s.sajuOpts,
  };
}

const syllablesOf = (t: string) => [...t.replace(/[^가-힣]/g, '')];

export function NameWizard() {
  const location = useLocation();
  const navigate = useNavigate();
  const fromUrl = useMemo(() => fromSearch<NameState>(location.search), [location.search]);
  const [stored, setStored] = useStoredState<Draft>('draft-name', EMPTY);
  const [draft, setDraftState] = useState<Draft>(() => (fromUrl ? fromState(fromUrl) : { ...EMPTY, ...stored, step: 1 }));
  const [error, setError] = useState<string | null>(null);
  const setDraft = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    setDraftState(next);
    setStored(next);
    setError(null);
  };

  const birthResult = birthFromDraft(draft.birth);

  const goStep2 = () => {
    if (!draft.surname) return setError('성씨를 입력하고 한자를 골라 주세요.');
    if (birthResult.error) return setError(birthResult.error);
    setDraft({ step: 2 });
  };

  const submit = () => {
    if (!draft.surname) return setError('성씨를 골라 주세요.');
    if (birthResult.error) return setError(birthResult.error);
    const fixedSyl = syllablesOf(draft.fixedHangul)[0];
    if (fixedSyl && !draft.fixedHanja) return setError('돌림자의 한자를 골라 주세요.');
    const prefs: Preferences = {
      length: draft.prefs.length,
      style: draft.prefs.style,
      ...(fixedSyl && draft.fixedHanja
        ? { fixed: { position: draft.prefs.length === 1 ? 0 : draft.fixedPos, hangul: fixedSyl, hanja: draft.fixedHanja } }
        : {}),
      include: syllablesOf(draft.includeText),
      exclude: syllablesOf(draft.excludeText),
    };
    const state: NameState = {
      v: STATE_VERSION,
      surname: draft.surname,
      gender: draft.gender,
      birth: birthResult.birth,
      prefs,
      school: draft.school,
      sajuOpts: draft.sajuOpts,
    };
    navigate(`/results?${toQuery(state)}`);
  };

  const fixedSyl = syllablesOf(draft.fixedHangul)[0];

  return (
    <main>
      <div className="stepper" aria-label={`3단계 중 ${draft.step}단계`}>
        <span className="on" />
        <span className={draft.step >= 2 ? 'on' : ''} />
        <span />
      </div>
      {draft.step === 1 ? (
        <div className="stack-lg">
          <div className="stack">
            <h1>아기 정보를 알려 주세요</h1>
            <p className="muted">사주를 세우는 데 써요. 이 기기 밖으로 나가지 않아요.</p>
          </div>
          <SurnamePicker value={draft.surname} onChange={(surname) => setDraft({ surname })} />
          <Field label="성별">
            <Segmented
              label="성별"
              value={draft.gender}
              options={[
                { value: 'female', label: '여아' },
                { value: 'male', label: '남아' },
                { value: 'unknown', label: '아직 몰라요' },
              ]}
              onChange={(gender) => setDraft({ gender })}
            />
          </Field>
          <BirthFields idPrefix="baby" value={draft.birth} onChange={(birth) => setDraft({ birth })} />
          <ErrorText>{error}</ErrorText>
          <BottomBar>
            <button type="button" className="btn btn-primary" onClick={goStep2}>
              다음
            </button>
          </BottomBar>
        </div>
      ) : (
        <div className="stack-lg">
          <div className="stack">
            <h1>어떤 이름을 원하세요?</h1>
            <p className="muted">비워 두면 4대 요소 점수가 높은 순으로 골라 드려요.</p>
          </div>
          <Field label="이름 글자 수">
            <Segmented
              label="이름 글자 수"
              value={String(draft.prefs.length)}
              options={[
                { value: '2', label: '두 글자' },
                { value: '1', label: '외자' },
              ]}
              onChange={(v) => setDraft({ prefs: { ...draft.prefs, length: v === '1' ? 1 : 2 } })}
            />
          </Field>
          <Field label="이름 느낌">
            <Segmented
              label="이름 느낌"
              value={draft.prefs.style}
              options={[
                { value: 'popular', label: '요즘 인기' },
                { value: 'balanced', label: '균형' },
                { value: 'unique', label: '흔하지 않게' },
              ]}
              onChange={(style) => setDraft({ prefs: { ...draft.prefs, style } })}
            />
          </Field>
          <Field label="돌림자 (선택)" htmlFor="fixed" hint="집안 돌림자가 있으면 한 글자를 넣고 한자를 골라 주세요.">
            <div className="stack">
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input
                  id="fixed"
                  className="input"
                  placeholder="예: 윤"
                  maxLength={1}
                  value={draft.fixedHangul}
                  onChange={(e) => setDraft({ fixedHangul: e.target.value, fixedHanja: null })}
                  style={{ flex: 1 }}
                />
                {draft.prefs.length === 2 ? (
                  <Segmented
                    label="돌림자 위치"
                    value={String(draft.fixedPos)}
                    options={[
                      { value: '0', label: '첫 자' },
                      { value: '1', label: '끝 자' },
                    ]}
                    onChange={(v) => setDraft({ fixedPos: Number(v) })}
                  />
                ) : null}
              </div>
              {fixedSyl ? (
                <HanjaPicker
                  syllable={fixedSyl}
                  initial={draft.prefs.length === 1 || draft.fixedPos === 0}
                  birth={birthResult.birth}
                  sajuOpts={draft.sajuOpts}
                  value={draft.fixedHanja}
                  onChange={(fixedHanja) => setDraft({ fixedHanja })}
                />
              ) : null}
            </div>
          </Field>
          <div className="grid-2">
            <Field label="넣고 싶은 소리" htmlFor="inc" hint="예: 서 하">
              <input id="inc" className="input" value={draft.includeText} onChange={(e) => setDraft({ includeText: e.target.value })} />
            </Field>
            <Field label="피하고 싶은 소리" htmlFor="exc" hint="예: 준 현">
              <input id="exc" className="input" value={draft.excludeText} onChange={(e) => setDraft({ excludeText: e.target.value })} />
            </Field>
          </div>
          <details className="panel-quiet">
            <summary>학설·계산 옵션</summary>
            <SchoolOptionsPanel
              school={draft.school}
              saju={draft.sajuOpts}
              onSchool={(school) => setDraft({ school })}
              onSaju={(sajuOpts) => setDraft({ sajuOpts })}
              showSaju={draft.birth.known}
            />
          </details>
          <ErrorText>{error}</ErrorText>
          <BottomBar>
            <button type="button" className="btn btn-line" onClick={() => setDraft({ step: 1 })}>
              이전
            </button>
            <button type="button" className="btn btn-primary" onClick={submit}>
              이름 추천받기
            </button>
          </BottomBar>
        </div>
      )}
    </main>
  );
}
