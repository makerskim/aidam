import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { Gender, NameChar, Preferences } from '@aidam/engine';
import { BirthFields, birthFromDraft, draftFromBirth, EMPTY_BIRTH, HanjaPicker, SurnamePicker, TimeFields, type BirthDraft } from '../components/forms';
import { Cta, ErrorText, Field, Icon, Progress, Segmented } from '../components/ui';
import { useGate } from '../lib/gate';
import { useLibrary } from '../lib/library';
import { useSettings } from '../lib/settings';
import { useStoredState } from '../lib/storage';
import { DEFAULT_PREFS, fromSearch, KID_LABELS, MAX_KIDS, STATE_VERSION, toQuery, type AnalyzeState, type NameState, type SurnameSel } from '../lib/state';

type StepKey = 'surname' | 'purpose' | 'given' | 'count' | 'gender' | 'birth' | 'prefs';
type Purpose = 'new' | 'check';

const FLOW: Record<Purpose, StepKey[]> = {
  new: ['surname', 'purpose', 'count', 'gender', 'birth', 'prefs'],
  check: ['surname', 'purpose', 'given', 'gender', 'birth'],
};

interface Kid {
  gender: Gender;
  time: string;
  timeKnown: boolean;
}

interface Draft {
  step: StepKey;
  purpose: Purpose;
  surname: SurnameSel | null;
  givenText: string;
  givenHanja: (string | null)[];
  count: number;
  kidMode: 'set' | 'each';
  gender: Gender;
  kids: Kid[];
  birth: BirthDraft;
  prefs: Preferences;
  fixedHangul: string;
  fixedHanja: string | null;
  fixedPos: number;
}

const kid = (): Kid => ({ gender: 'female', time: '', timeKnown: true });
const EMPTY: Draft = {
  step: 'surname',
  purpose: 'new',
  surname: null,
  givenText: '',
  givenHanja: [],
  count: 1,
  kidMode: 'set',
  gender: 'female',
  kids: [kid(), kid(), kid(), kid()],
  birth: EMPTY_BIRTH,
  prefs: DEFAULT_PREFS,
  fixedHangul: '',
  fixedHanja: null,
  fixedPos: 1,
};
const pad = (n: number) => String(n).padStart(2, '0');

function fromState(s: NameState): Draft {
  const kids = s.kids?.length ? s.kids.map((k) => ({ gender: k.gender, timeKnown: k.time !== null, time: k.time ? `${pad(k.time.hour)}:${pad(k.time.minute)}` : '' })) : [];
  return {
    ...EMPTY,
    // 결과에서 '조건 바꾸기'로 오면 '무엇을 해 드릴까요?'부터 다시 고른다(입력한 값은 그대로)
    step: 'purpose',
    purpose: 'new',
    surname: s.surname,
    count: kids.length > 1 ? kids.length : 1,
    kidMode: s.kidMode ?? 'set',
    gender: s.gender,
    kids: [...kids, ...Array.from({ length: MAX_KIDS }, kid)].slice(0, MAX_KIDS),
    birth: draftFromBirth(s.birth),
    prefs: s.prefs,
    fixedHangul: s.prefs.fixed?.hangul ?? '',
    fixedHanja: s.prefs.fixed?.hanja ?? null,
    fixedPos: s.prefs.fixed?.position ?? 1,
  };
}

const COPY: Record<StepKey, [string, string]> = {
  surname: ['아기 성은 무엇인가요?', '한글로 쓰면 한자를 골라 드려요.'],
  purpose: ['무엇을 해 드릴까요?', ''],
  given: ['정한 이름을 알려 주세요', '글자마다 한자를 고를 수 있어요.'],
  count: ['아기는 몇 명인가요?', ''],
  gender: ['아기 성별은요?', ''],
  birth: ['언제, 어디서 태어났나요?', '숫자로 바로 쓰거나 달력에서 고르세요.'],
  prefs: ['어떤 이름이 좋으세요?', '정하지 않아도 괜찮아요.'],
};

export function NameWizard() {
  const location = useLocation();
  const navigate = useNavigate();
  const lib = useLibrary();
  const gate = useGate();
  const [settings] = useSettings();
  const fromUrl = useMemo(() => fromSearch<NameState>(location.search), [location.search]);
  const wantCheck = new URLSearchParams(location.search).get('check') === '1';
  const [stored, setStored] = useStoredState<Draft>('draft-name-v5', EMPTY);
  const [draft, setDraftState] = useState<Draft>(() => {
    if (fromUrl) return fromState(fromUrl);
    const base = { ...EMPTY, ...stored };
    return wantCheck ? { ...base, purpose: 'check', step: base.surname ? 'given' : 'surname' } : { ...base, step: 'surname' };
  });
  const [error, setError] = useState<string | null>(null);

  // 로그인도, '로그인 없이 하기'도 고르지 않았으면 안내 창을 먼저 연다
  useEffect(() => {
    if (!lib.user && !gate.guest) gate.go(`/name${location.search}`, true);
    // 처음 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [draft.step]);

  const setDraft = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    setDraftState(next);
    setStored(next);
    setError(null);
  };
  // '정한 이름 풀어보기'로 바로 들어왔으면 무엇을 할지 다시 묻지 않는다
  const flowOf = (p: Purpose) => (wantCheck && p === 'check' ? FLOW.check.filter((x) => x !== 'purpose') : FLOW[p]);
  const flow = flowOf(draft.purpose);
  const index = Math.max(0, flow.indexOf(draft.step));
  const go = (step: StepKey, patch: Partial<Draft> = {}) => setDraft({ ...patch, step });
  const goNext = (patch: Partial<Draft> = {}) => {
    const f = flowOf(patch.purpose ?? draft.purpose);
    const i = f.indexOf(patch.step ?? draft.step);
    const nextStep = f[i + 1];
    if (nextStep) go(nextStep, patch);
  };
  const multi = draft.purpose === 'new' && draft.count > 1;
  const allKids = [...draft.kids, ...Array.from({ length: MAX_KIDS }, kid)].slice(0, MAX_KIDS);
  const kids = allKids.slice(0, draft.count);
  const setKid = (i: number, patch: Partial<Kid>) => setDraft({ kids: allKids.map((k, j) => (j === i ? { ...k, ...patch } : k)) });
  const birthResult = multi ? birthFromDraft({ ...draft.birth, timeKnown: false }) : birthFromDraft(draft.birth);
  const fixedSyl = [...draft.fixedHangul.replace(/[^가-힣]/g, '')][0];
  const syllables = [...draft.givenText.replace(/[^가-힣]/g, '')].slice(0, 4);

  const finishCheck = () => {
    if (!draft.surname) return go('surname');
    if (syllables.length === 0) return go('given');
    const given: NameChar[] = syllables.map((h, i) => ({ hangul: h, hanja: draft.givenHanja[i] ?? null }));
    const state: AnalyzeState = { v: STATE_VERSION, surname: draft.surname, gender: draft.gender, birth: birthResult.birth, given, school: settings.school, sajuOpts: settings.sajuOpts };
    navigate(`/report?${toQuery(state)}`);
  };

  const finishNew = () => {
    if (!draft.surname) return go('surname');
    if (fixedSyl && !draft.fixedHanja) return setError('돌림자 한자를 골라 주세요.');
    const prefs: Preferences = {
      length: draft.prefs.length,
      style: draft.prefs.style,
      ...(fixedSyl && draft.fixedHanja ? { fixed: { position: draft.prefs.length === 1 ? 0 : draft.fixedPos, hangul: fixedSyl, hanja: draft.fixedHanja } } : {}),
    };
    const state: NameState = {
      v: STATE_VERSION,
      surname: draft.surname,
      gender: multi ? (kids[0]?.gender ?? 'unknown') : draft.gender,
      birth: birthResult.birth,
      prefs,
      school: settings.school,
      sajuOpts: settings.sajuOpts,
      ...(multi
        ? {
            kidMode: draft.kidMode,
            kids: kids.map((k) => {
              const m = /^(\d{1,2}):(\d{2})$/.exec(k.time);
              return { gender: k.gender, time: k.timeKnown && m ? { hour: Number(m[1]), minute: Number(m[2]) } : null };
            }),
          }
        : {}),
    };
    navigate(`/results?${toQuery(state)}`);
  };

  const next = () => {
    switch (draft.step) {
      case 'surname':
        return draft.surname ? goNext() : setError('성을 쓰고 한자를 골라 주세요.');
      case 'given':
        return syllables.length ? goNext() : setError('이름을 한글로 써 주세요.');
      case 'purpose':
      case 'count':
      case 'gender':
        return goNext();
      case 'birth':
        if (birthResult.error) return setError(birthResult.error);
        if (multi && draft.birth.known) {
          const i = kids.findIndex((k) => k.timeKnown && !/^\d{1,2}:\d{2}$/.test(k.time));
          if (i >= 0) return setError(`${KID_LABELS[i]} 태어난 시각을 넣거나 "시간 모름"을 눌러 주세요.`);
        }
        return draft.purpose === 'check' ? finishCheck() : goNext();
      case 'prefs':
        return finishNew();
      default:
        return undefined;
    }
  };

  const [title, sub] = COPY[draft.step];
  const isLast = index === flow.length - 1 || (draft.purpose === 'check' && draft.step === 'birth');
  // 타일은 고르기만 하고, 넘어가기는 언제나 '다음' 버튼으로
  const autoStep = false;
  const ctaLabel = isLast ? (draft.purpose === 'check' ? '풀이 보기' : multi ? '이름 추천받기' : '이름 추천받기') : '다음';

  return (
    <main className="container">
      <div className="wizard">
        <div className="wizard-top">
          {index > 0 ? (
            <button type="button" className="icon-btn" aria-label="이전" onClick={() => go(flow[index - 1] as StepKey)} style={{ marginLeft: -10 }}>
              {Icon.back}
            </button>
          ) : null}
          <Progress step={index + 1} total={flow.length} />
          <span className="step-count num">
            {index + 1} / {flow.length}
          </span>
        </div>

        <div key={draft.step} className="rise">
          <h1 className="q-title">{draft.step === 'gender' && multi ? '아이들 성별은요?' : title}</h1>
          {sub ? <p className="q-sub">{sub}</p> : null}
        </div>

        {draft.step === 'surname' ? <SurnamePicker value={draft.surname} onChange={(surname) => setDraft({ surname })} /> : null}

        {draft.step === 'purpose' ? (
          <div className="tiles" role="group" aria-label="할 일">
            <button type="button" className="tile" aria-pressed={draft.purpose === 'new'} onClick={() => setDraft({ purpose: 'new' })}>
              새 이름 추천받기
              <small>사주에 맞는 이름을 지어 드려요</small>
            </button>
            <button type="button" className="tile" aria-pressed={draft.purpose === 'check'} onClick={() => setDraft({ purpose: 'check' })}>
              정한 이름 풀어보기
              <small>생각해 둔 이름이 잘 맞는지 봐 드려요</small>
            </button>
          </div>
        ) : null}

        {draft.step === 'given' ? (
          <div className="stack" style={{ gap: 18 }}>
            <input
              id="given"
              className="input input-xl"
              placeholder="예: 서윤"
              value={draft.givenText}
              maxLength={4}
              autoComplete="off"
              aria-label="이름(성 빼고)"
              onChange={(e) => setDraft({ givenText: e.target.value, givenHanja: [] })}
            />
            {syllables.map((s, i) => (
              <Field key={`${s}-${i}`} label={`‘${s}’ 한자`}>
                <HanjaPicker
                  syllable={s}
                  initial={i === 0}
                  birth={null}
                  sajuOpts={settings.sajuOpts}
                  value={draft.givenHanja[i] ?? null}
                  onChange={(ch) => {
                    const givenHanja = [...draft.givenHanja];
                    givenHanja[i] = ch;
                    setDraft({ givenHanja });
                  }}
                />
              </Field>
            ))}
          </div>
        ) : null}

        {draft.step === 'count' ? (
          <div className="stack" style={{ gap: 22 }}>
            <div className="tiles" role="group" aria-label="아기 수">
              {(
                [
                  [1, '한 명'],
                  [2, '쌍둥이'],
                  [3, '세쌍둥이'],
                ] as const
              ).map(([n, label]) => (
                <button key={n} type="button" className="tile" aria-pressed={draft.count === n} onClick={() => setDraft({ count: n })}>
                  {label}
                </button>
              ))}
              <button type="button" className="tile" aria-pressed={draft.count >= 4} onClick={() => setDraft({ count: Math.max(4, draft.count) })}>
                네 명 이상
              </button>
            </div>
            {draft.count >= 4 ? (
              <Field label="아기는 모두 몇 명인가요?">
                <div className="stepper" role="group" aria-label="아기 수 정하기">
                  <button type="button" className="icon-btn" aria-label="한 명 줄이기" disabled={draft.count <= 4} onClick={() => setDraft({ count: draft.count - 1 })}>
                    −
                  </button>
                  <b className="num" aria-live="polite">
                    {draft.count}명
                  </b>
                  <button type="button" className="icon-btn" aria-label="한 명 늘리기" disabled={draft.count >= MAX_KIDS} onClick={() => setDraft({ count: draft.count + 1 })}>
                    +
                  </button>
                </div>
              </Field>
            ) : null}
            {draft.count > 1 ? (
              <Field label="이름은 어떻게 지을까요?">
                <Segmented
                  label="다둥이 이름 짓는 방식"
                  value={draft.kidMode}
                  options={[
                    { value: 'set', label: '서로 어울리는 세트로' },
                    { value: 'each', label: '아이마다 따로' },
                  ]}
                  onChange={(kidMode) => setDraft({ kidMode })}
                />
              </Field>
            ) : null}
          </div>
        ) : null}

        {draft.step === 'gender' && !multi ? (
          <div className="tiles" role="group" aria-label="성별">
            {(
              [
                ['female', '여자아이'],
                ['male', '남자아이'],
                ['unknown', '아직 몰라요'],
              ] as const
            ).map(([v, label]) => (
              <button key={v} type="button" className="tile" aria-pressed={draft.gender === v} onClick={() => setDraft({ gender: v })}>
                {label}
              </button>
            ))}
          </div>
        ) : null}

        {draft.step === 'gender' && multi ? (
          <div className="stack" style={{ gap: 22 }}>
            {kids.map((k, i) => (
              <Field key={i} label={KID_LABELS[i] ?? ''}>
                <Segmented
                  label={`${KID_LABELS[i]} 성별`}
                  value={k.gender}
                  options={[
                    { value: 'female', label: '여자아이' },
                    { value: 'male', label: '남자아이' },
                    { value: 'unknown', label: '몰라요' },
                  ]}
                  onChange={(gender) => setKid(i, { gender })}
                />
              </Field>
            ))}
          </div>
        ) : null}

        {draft.step === 'birth' ? (
          <div className="stack" style={{ gap: 22 }}>
            <BirthFields idPrefix="baby" value={{ ...draft.birth, known: true }} onChange={(birth) => setDraft({ birth: { ...birth, known: true } })} hideTime={multi} />
            {multi
              ? kids.map((k, i) => (
                  <Field key={i} label={`${KID_LABELS[i]} 태어난 시각`}>
                    <TimeFields idPrefix={`kid${i}`} time={k.time} known={k.timeKnown} onChange={(time, timeKnown) => setKid(i, { time, timeKnown })} />
                  </Field>
                ))
              : null}
            <button
              type="button"
              className="text-btn"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => {
                const birth = { ...draft.birth, known: false };
                if (draft.purpose === 'check') {
                  setDraft({ birth });
                  const given: NameChar[] = syllables.map((h, i) => ({ hangul: h, hanja: draft.givenHanja[i] ?? null }));
                  if (draft.surname && given.length) {
                    const state: AnalyzeState = { v: STATE_VERSION, surname: draft.surname, gender: draft.gender, birth: null, given, school: settings.school, sajuOpts: settings.sajuOpts };
                    navigate(`/report?${toQuery(state)}`);
                  }
                } else goNext({ birth });
              }}
            >
              생일 없이 볼게요
            </button>
          </div>
        ) : null}

        {draft.step === 'prefs' ? (
          <div className="stack" style={{ gap: 26 }}>
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
            <Field label="이름 느낌">
              <Segmented
                label="이름 느낌"
                value={draft.prefs.style}
                options={[
                  { value: 'popular', label: '요즘 많이 쓰는' },
                  { value: 'balanced', label: '무난한' },
                  { value: 'unique', label: '흔하지 않은' },
                ]}
                onChange={(style) => setDraft({ prefs: { ...draft.prefs, style } })}
              />
            </Field>
            <Field label="돌림자 (없으면 비워 두세요)" htmlFor="fixed">
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input id="fixed" className="input" placeholder="예: 윤" maxLength={1} value={draft.fixedHangul} onChange={(e) => setDraft({ fixedHangul: e.target.value, fixedHanja: null })} style={{ width: 120, flex: '0 0 auto' }} />
                {draft.prefs.length === 2 ? (
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Segmented
                      label="돌림자 위치"
                      value={String(draft.fixedPos)}
                      options={[
                        { value: '0', label: '앞 글자' },
                        { value: '1', label: '뒤 글자' },
                      ]}
                      onChange={(v) => setDraft({ fixedPos: Number(v) })}
                    />
                  </div>
                ) : null}
              </div>
            </Field>
            {fixedSyl ? (
              <HanjaPicker syllable={fixedSyl} initial={draft.prefs.length === 1 || draft.fixedPos === 0} birth={birthResult.birth} sajuOpts={settings.sajuOpts} value={draft.fixedHanja} onChange={(fixedHanja) => setDraft({ fixedHanja })} />
            ) : null}
            {lib.user ? (
              <p className="small muted">
                계산 기준은 <Link to="/settings" style={{ textDecoration: 'underline' }}>설정</Link>에서 바꿀 수 있어요.
              </p>
            ) : null}
          </div>
        ) : null}

        <ErrorText>{error}</ErrorText>
        {!autoStep ? (
          <Cta>
            <button type="button" className="btn btn-primary btn-lg" onClick={next} disabled={draft.step === 'surname' && !draft.surname}>
              {ctaLabel}
            </button>
          </Cta>
        ) : null}
      </div>
    </main>
  );
}
