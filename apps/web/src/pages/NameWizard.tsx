import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Gender, Preferences } from '@aidam/engine';
import { BirthFields, birthFromDraft, draftFromBirth, EMPTY_BIRTH, HanjaPicker, SchoolOptionsPanel, SurnamePicker, type BirthDraft } from '../components/forms';
import { Cta, ErrorText, Field, Icon, Progress, Segmented } from '../components/ui';
import { useStoredState } from '../lib/storage';
import { DEFAULT_PREFS, DEFAULT_SAJU, DEFAULT_SCHOOL, fromSearch, KID_LABELS, STATE_VERSION, toQuery, type NameState, type SurnameSel } from '../lib/state';

type Step = 1 | 2 | 3 | 4 | 5;
const LAST: Step = 5;

interface Draft {
  step: Step;
  surname: SurnameSel | null;
  gender: Gender;
  birth: BirthDraft;
  prefs: Preferences;
  fixedHangul: string;
  fixedHanja: string | null;
  fixedPos: number;
  count: number;
  kids: { gender: Gender; time: string; timeKnown: boolean }[];
  school: NameState['school'];
  sajuOpts: NameState['sajuOpts'];
}

const kid = (gender: Gender = 'female') => ({ gender, time: '', timeKnown: true });

const EMPTY: Draft = {
  step: 1,
  surname: null,
  gender: 'female',
  birth: EMPTY_BIRTH,
  prefs: DEFAULT_PREFS,
  fixedHangul: '',
  fixedHanja: null,
  fixedPos: 1,
  count: 1,
  kids: [kid(), kid()],
  school: DEFAULT_SCHOOL,
  sajuOpts: DEFAULT_SAJU,
};

const pad = (n: number) => String(n).padStart(2, '0');

function fromState(s: NameState): Draft {
  return {
    ...EMPTY,
    step: LAST,
    count: s.kids?.length && s.kids.length > 1 ? s.kids.length : 1,
    kids: s.kids?.length
      ? s.kids.map((k) => ({ gender: k.gender, timeKnown: k.time !== null, time: k.time ? `${pad(k.time.hour)}:${pad(k.time.minute)}` : '' }))
      : [kid(), kid()],
    surname: s.surname,
    gender: s.gender,
    birth: draftFromBirth(s.birth),
    prefs: s.prefs,
    fixedHangul: s.prefs.fixed?.hangul ?? '',
    fixedHanja: s.prefs.fixed?.hanja ?? null,
    fixedPos: s.prefs.fixed?.position ?? 1,
    school: s.school,
    sajuOpts: s.sajuOpts,
  };
}

const TITLES: Record<Step, string> = {
  1: '아기 성이 무엇인가요?',
  2: '아기는 몇 명인가요?',
  3: '성별을 알려 주세요',
  4: '언제 태어났나요?',
  5: '어떤 이름이 좋으세요?',
};

export function NameWizard() {
  const location = useLocation();
  const navigate = useNavigate();
  const fromUrl = useMemo(() => fromSearch<NameState>(location.search), [location.search]);
  const [stored, setStored] = useStoredState<Draft>('draft-name-v3', EMPTY);
  const [draft, setDraftState] = useState<Draft>(() => (fromUrl ? fromState(fromUrl) : { ...EMPTY, ...stored, step: 1 }));
  const [error, setError] = useState<string | null>(null);
  const setDraft = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    setDraftState(next);
    setStored(next);
    setError(null);
  };
  const go = (step: Step) => setDraft({ step });

  const birthResult = birthFromDraft(draft.birth);
  const fixedSyl = [...draft.fixedHangul.replace(/[^가-힣]/g, '')][0];

  const multi = draft.count > 1;
  const kids = draft.kids.slice(0, draft.count);
  const setKid = (i: number, patch: Partial<Draft['kids'][number]>) => {
    const list = [...draft.kids];
    while (list.length < draft.count) list.push(kid());
    list[i] = { ...(list[i] ?? kid()), ...patch };
    setDraft({ kids: list });
  };

  const kidTimesError = (): string | null => {
    if (!multi || !draft.birth.known) return null;
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i]!;
      if (k.timeKnown && !/^\d{1,2}:\d{2}$/.test(k.time)) return `${KID_LABELS[i]} 태어난 시각을 넣거나 "모름"을 눌러 주세요.`;
    }
    return null;
  };

  const next = () => {
    if (draft.step === 1) return draft.surname ? go(2) : setError('성을 입력하고 한자를 골라 주세요.');
    if (draft.step === 3) return go(4);
    if (draft.step === 4) {
      const b = multi ? birthFromDraft({ ...draft.birth, timeKnown: false }) : birthResult;
      const err = b.error ?? kidTimesError();
      return err ? setError(err) : go(5);
    }
    if (!draft.surname) return go(1);
    if (fixedSyl && !draft.fixedHanja) return setError('돌림자 한자를 골라 주세요.');
    const prefs: Preferences = {
      length: draft.prefs.length,
      style: draft.prefs.style,
      ...(fixedSyl && draft.fixedHanja ? { fixed: { position: draft.prefs.length === 1 ? 0 : draft.fixedPos, hangul: fixedSyl, hanja: draft.fixedHanja } } : {}),
    };
    const base = multi ? birthFromDraft({ ...draft.birth, timeKnown: false }).birth : birthResult.birth;
    const state: NameState = {
      v: STATE_VERSION,
      surname: draft.surname,
      gender: multi ? (kids[0]?.gender ?? 'unknown') : draft.gender,
      birth: base,
      prefs,
      school: draft.school,
      sajuOpts: draft.sajuOpts,
      ...(multi
        ? {
            kids: kids.map((k) => {
              const m = /^(\d{1,2}):(\d{2})$/.exec(k.time);
              return { gender: k.gender, time: k.timeKnown && m ? { hour: Number(m[1]), minute: Number(m[2]) } : null };
            }),
          }
        : {}),
    };
    navigate(`/results?${toQuery(state)}`);
  };

  return (
    <main className="stack-lg">
      <div className="stack" style={{ gap: 20 }}>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          {draft.step > 1 ? (
            <button type="button" className="icon-btn" aria-label="이전" onClick={() => go((draft.step - 1) as Step)} style={{ marginLeft: -12 }}>
              {Icon.back}
            </button>
          ) : null}
          <div style={{ flex: 1 }}>
            <Progress step={draft.step} total={LAST} />
          </div>
        </div>
        <h1>{TITLES[draft.step]}</h1>
      </div>

      {draft.step === 1 ? <SurnamePicker value={draft.surname} onChange={(surname) => setDraft({ surname })} /> : null}

      {draft.step === 2 ? (
        <div className="tiles" role="group" aria-label="아기 수">
          {(
            [
              [1, '한 명'],
              [2, '쌍둥이'],
              [3, '세쌍둥이'],
            ] as const
          ).map(([n, label]) => (
            <button key={n} type="button" className="tile" aria-pressed={draft.count === n} onClick={() => setDraft({ count: n, kids: Array.from({ length: Math.max(2, n) }, (_, i) => draft.kids[i] ?? kid()), step: 3 })}>
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {draft.step === 3 && !multi ? (
        <div className="tiles" role="group" aria-label="성별">
          {(
            [
              ['female', '여자아이'],
              ['male', '남자아이'],
              ['unknown', '아직 몰라요'],
            ] as const
          ).map(([v, label]) => (
            <button key={v} type="button" className="tile" aria-pressed={draft.gender === v} onClick={() => setDraft({ gender: v, step: 4 })}>
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {draft.step === 3 && multi ? (
        <div className="stack" style={{ gap: 20 }}>
          {kids.map((k, i) => (
            <Field key={i} label={KID_LABELS[i] ?? ''}>
              <Segmented
                label={`${KID_LABELS[i]} 성별`}
                value={k.gender}
                options={[
                  { value: 'female', label: '여자' },
                  { value: 'male', label: '남자' },
                  { value: 'unknown', label: '모름' },
                ]}
                onChange={(gender) => setKid(i, { gender })}
              />
            </Field>
          ))}
        </div>
      ) : null}

      {draft.step === 4 ? (
        <div className="stack" style={{ gap: 16 }}>
          <BirthFields
            idPrefix="baby"
            value={{ ...draft.birth, known: true, ...(multi ? { timeKnown: false, time: '' } : {}) }}
            onChange={(birth) => setDraft({ birth: { ...birth, known: true, ...(multi ? { timeKnown: draft.birth.timeKnown, time: draft.birth.time } : {}) } })}
            hideTime={multi}
          />
          {multi
            ? kids.map((k, i) => (
                <Field key={i} label={`${KID_LABELS[i]} 태어난 시각`} htmlFor={`kid${i}-time`}>
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <input
                      id={`kid${i}-time`}
                      className="input num"
                      type="time"
                      value={k.time}
                      disabled={!k.timeKnown}
                      onChange={(e) => setKid(i, { time: e.target.value })}
                      style={{ flex: 1 }}
                    />
                    <button type="button" className="choice" aria-pressed={!k.timeKnown} onClick={() => setKid(i, { timeKnown: !k.timeKnown })} style={{ minHeight: 56, borderRadius: 12 }}>
                      시간 모름
                    </button>
                  </div>
                </Field>
              ))
            : null}
          <button type="button" className="text-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setDraft({ birth: { ...draft.birth, known: false }, step: 5 })}>
            생일 없이 볼게요
          </button>
        </div>
      ) : null}

      {draft.step === 5 ? (
        <div className="stack-lg">
          <Field label="글자 수">
            <Segmented
              label="글자 수"
              value={String(draft.prefs.length)}
              options={[
                { value: '2', label: '두 글자' },
                { value: '1', label: '외자' },
              ]}
              onChange={(v) => setDraft({ prefs: { ...draft.prefs, length: v === '1' ? 1 : 2 } })}
            />
          </Field>
          <Field label="느낌">
            <Segmented
              label="느낌"
              value={draft.prefs.style}
              options={[
                { value: 'popular', label: '요즘 인기' },
                { value: 'balanced', label: '균형' },
                { value: 'unique', label: '특별하게' },
              ]}
              onChange={(style) => setDraft({ prefs: { ...draft.prefs, style } })}
            />
          </Field>
          <Field label="돌림자 (없으면 비워 두세요)" htmlFor="fixed">
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
                <div style={{ flex: 1 }}>
                  <Segmented
                    label="돌림자 위치"
                    value={String(draft.fixedPos)}
                    options={[
                      { value: '0', label: '앞' },
                      { value: '1', label: '뒤' },
                    ]}
                    onChange={(v) => setDraft({ fixedPos: Number(v) })}
                  />
                </div>
              ) : null}
            </div>
          </Field>
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
          <details className="acc">
            <summary>
              <span className="grow">
                <b>세부 설정</b>
                <span className="v">학설·시간 보정</span>
              </span>
              {Icon.chevron}
            </summary>
            <div className="acc-body">
              <SchoolOptionsPanel
                school={draft.school}
                saju={draft.sajuOpts}
                onSchool={(school) => setDraft({ school })}
                onSaju={(sajuOpts) => setDraft({ sajuOpts })}
                showSaju={draft.birth.known}
              />
            </div>
          </details>
        </div>
      ) : null}

      <ErrorText>{error}</ErrorText>
      {draft.step !== 2 && !(draft.step === 3 && !multi) ? (
        <Cta>
          <button type="button" className="btn btn-primary" onClick={next} disabled={draft.step === 1 && !draft.surname}>
            {draft.step === LAST ? (multi ? '이름 세트 추천받기' : '이름 추천받기') : '다음'}
          </button>
        </Cta>
      ) : null}
    </main>
  );
}
