import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { Gender, Preferences } from '@aidam/engine';
import { BirthFields, birthFromDraft, draftFromBirth, EMPTY_BIRTH, HanjaPicker, SurnamePicker, TimeFields, type BirthDraft } from '../components/forms';
import { Cta, ErrorText, Field, Icon, Progress, Segmented } from '../components/ui';
import { useGate } from '../lib/gate';
import { useLibrary } from '../lib/library';
import { useSettings } from '../lib/settings';
import { useStoredState } from '../lib/storage';
import { DEFAULT_PREFS, fromSearch, KID_LABELS, STATE_VERSION, toQuery, type NameState, type SurnameSel } from '../lib/state';

type Step = 1 | 2 | 3 | 4 | 5;
const LAST: Step = 5;

interface Kid {
  gender: Gender;
  time: string;
  timeKnown: boolean;
}

interface Draft {
  step: Step;
  surname: SurnameSel | null;
  count: number;
  gender: Gender;
  kids: Kid[];
  birth: BirthDraft;
  prefs: Preferences;
  fixedHangul: string;
  fixedHanja: string | null;
  fixedPos: number;
}

const kid = (): Kid => ({ gender: 'female', time: '', timeKnown: true });
const EMPTY: Draft = { step: 1, surname: null, count: 1, gender: 'female', kids: [kid(), kid(), kid()], birth: EMPTY_BIRTH, prefs: DEFAULT_PREFS, fixedHangul: '', fixedHanja: null, fixedPos: 1 };
const pad = (n: number) => String(n).padStart(2, '0');

function fromState(s: NameState): Draft {
  const kids = s.kids?.length ? s.kids.map((k) => ({ gender: k.gender, timeKnown: k.time !== null, time: k.time ? `${pad(k.time.hour)}:${pad(k.time.minute)}` : '' })) : [];
  return {
    ...EMPTY,
    step: LAST,
    surname: s.surname,
    count: kids.length > 1 ? kids.length : 1,
    gender: s.gender,
    kids: [...kids, kid(), kid(), kid()].slice(0, 3),
    birth: draftFromBirth(s.birth),
    prefs: s.prefs,
    fixedHangul: s.prefs.fixed?.hangul ?? '',
    fixedHanja: s.prefs.fixed?.hanja ?? null,
    fixedPos: s.prefs.fixed?.position ?? 1,
  };
}

const COPY: Record<Step, [string, string]> = {
  1: ['아기 성이 무엇인가요?', '한글로 쓰면 한자를 골라 드려요.'],
  2: ['아기는 몇 명인가요?', '쌍둥이라면 아이마다 사주를 따로 보고 어울리는 이름 세트를 지어요.'],
  3: ['성별을 알려 주세요', '이름의 어감을 고르는 데 써요.'],
  4: ['언제, 어디서 태어났나요?', '태어난 시각과 지역까지 알면 사주를 더 정확하게 세울 수 있어요.'],
  5: ['어떤 이름이 좋으세요?', '정하지 않아도 괜찮아요. 사주에 가장 잘 맞는 이름부터 보여 드려요.'],
};

export function NameWizard() {
  const location = useLocation();
  const navigate = useNavigate();
  const lib = useLibrary();
  const gate = useGate();
  const [settings] = useSettings();
  const fromUrl = useMemo(() => fromSearch<NameState>(location.search), [location.search]);
  const [stored, setStored] = useStoredState<Draft>('draft-name-v4', EMPTY);
  const [draft, setDraftState] = useState<Draft>(() => (fromUrl ? fromState(fromUrl) : { ...EMPTY, ...stored, step: 1 }));
  const [error, setError] = useState<string | null>(null);

  // 로그인도, '로그인 없이 하기'도 고르지 않았으면 안내 창을 먼저 연다
  useEffect(() => {
    if (!lib.user && !gate.guest) gate.go('/name', true);
    // 처음 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setDraft = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    setDraftState(next);
    setStored(next);
    setError(null);
  };
  const go = (step: Step) => setDraft({ step });
  const multi = draft.count > 1;
  const kids = draft.kids.slice(0, draft.count);
  const setKid = (i: number, patch: Partial<Kid>) => setDraft({ kids: draft.kids.map((k, j) => (j === i ? { ...k, ...patch } : k)) });
  const birthResult = multi ? birthFromDraft({ ...draft.birth, timeKnown: false }) : birthFromDraft(draft.birth);
  const fixedSyl = [...draft.fixedHangul.replace(/[^가-힣]/g, '')][0];

  const next = () => {
    if (draft.step === 1) return draft.surname ? go(2) : setError('성을 입력하고 한자를 골라 주세요.');
    if (draft.step === 2) return go(3);
    if (draft.step === 3) return go(4);
    if (draft.step === 4) {
      if (birthResult.error) return setError(birthResult.error);
      if (multi && draft.birth.known) {
        const i = kids.findIndex((k) => k.timeKnown && !/^\d{1,2}:\d{2}$/.test(k.time));
        if (i >= 0) return setError(`${KID_LABELS[i]} 태어난 시·분을 고르거나 "시간 모름"을 눌러 주세요.`);
      }
      return go(5);
    }
    if (!draft.surname) return go(1);
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
            kids: kids.map((k) => {
              const m = /^(\d{1,2}):(\d{2})$/.exec(k.time);
              return { gender: k.gender, time: k.timeKnown && m ? { hour: Number(m[1]), minute: Number(m[2]) } : null };
            }),
          }
        : {}),
    };
    navigate(`/results?${toQuery(state)}`);
  };

  const [title, sub] = COPY[draft.step];
  return (
    <main className="container">
      <div className="wizard">
        <div className="wizard-top">
          {draft.step > 1 ? (
            <button type="button" className="icon-btn" aria-label="이전" onClick={() => go((draft.step - 1) as Step)} style={{ marginLeft: -10 }}>
              {Icon.back}
            </button>
          ) : null}
          <Progress step={draft.step} total={LAST} />
          <span className="step-count num">
            {draft.step} / {LAST}
          </span>
        </div>

        <div key={draft.step} className="rise">
          <h1 className="q-title">{title}</h1>
          <p className="q-sub">{sub}</p>
        </div>

        {draft.step === 1 ? <SurnamePicker value={draft.surname} onChange={(surname) => setDraft({ surname })} /> : null}

        {draft.step === 2 ? (
          <div className="tiles" role="group" aria-label="아기 수">
            {(
              [
                [1, '한 명', '아이 한 명의 이름'],
                [2, '쌍둥이', '두 아이의 이름 세트'],
                [3, '세쌍둥이', '세 아이의 이름 세트'],
              ] as const
            ).map(([n, label, s]) => (
              <button key={n} type="button" className="tile" aria-pressed={draft.count === n} onClick={() => setDraft({ count: n, step: 3 })}>
                {label}
                <small>{s}</small>
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

        {draft.step === 4 ? (
          <div className="stack" style={{ gap: 22 }}>
            <BirthFields idPrefix="baby" value={{ ...draft.birth, known: true }} onChange={(birth) => setDraft({ birth: { ...birth, known: true } })} hideTime={multi} />
            {multi
              ? kids.map((k, i) => (
                  <Field key={i} label={`${KID_LABELS[i]} 태어난 시각`}>
                    <TimeFields idPrefix={`kid${i}`} time={k.time} known={k.timeKnown} onChange={(time, timeKnown) => setKid(i, { time, timeKnown })} />
                  </Field>
                ))
              : null}
            <button type="button" className="text-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setDraft({ birth: { ...draft.birth, known: false }, step: 5 })}>
              생일 없이 이름만 볼게요
            </button>
          </div>
        ) : null}

        {draft.step === 5 ? (
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
                  { value: 'popular', label: '요즘 인기 있는' },
                  { value: 'balanced', label: '무난한' },
                  { value: 'unique', label: '특별한' },
                ]}
                onChange={(style) => setDraft({ prefs: { ...draft.prefs, style } })}
              />
            </Field>
            <Field label="돌림자 (없으면 비워 두세요)" htmlFor="fixed">
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input id="fixed" className="input" placeholder="예: 윤" maxLength={1} value={draft.fixedHangul} onChange={(e) => setDraft({ fixedHangul: e.target.value, fixedHanja: null })} style={{ maxWidth: 200 }} />
                {draft.prefs.length === 2 ? (
                  <div style={{ flex: 1, maxWidth: 280 }}>
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
                학설과 시간 보정은 <Link to="/settings" style={{ textDecoration: 'underline' }}>설정</Link>에서 바꿀 수 있어요.
              </p>
            ) : null}
          </div>
        ) : null}

        <ErrorText>{error}</ErrorText>
        {draft.step !== 2 && !(draft.step === 3 && !multi) ? (
          <Cta>
            <button type="button" className="btn btn-primary btn-lg" onClick={next} disabled={draft.step === 1 && !draft.surname}>
              {draft.step === LAST ? (multi ? '이름 세트 추천받기' : '이름 추천받기') : '다음'}
            </button>
          </Cta>
        ) : null}
      </div>
    </main>
  );
}
