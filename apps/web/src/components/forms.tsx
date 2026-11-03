import { useEffect, useMemo, useState } from 'react';
import type { BirthInput, SajuOptions, SchoolOptions, Surname } from '@aidam/engine';
import { PLACES } from '@aidam/engine/src/calendar/places';
import { call } from '../lib/engine';
import type { HanjaOption } from '../lib/api';
import type { SurnameSel } from '../lib/state';
import { ElementChip, Field, Segmented, Toggle } from './ui';

// ── 엔진 초기 데이터(성씨 목록) ─────────────────────────
let initPromise: ReturnType<typeof call<'init'>> | null = null;
export function useInit() {
  const [data, setData] = useState<Awaited<ReturnType<typeof call<'init'>>> | null>(null);
  useEffect(() => {
    initPromise ??= call('init');
    let alive = true;
    initPromise.then((d) => alive && setData(d)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return data;
}

// ── 출생 정보 ──────────────────────────────────────────
export interface BirthDraft {
  known: boolean;
  calendar: 'solar' | 'lunar';
  year: string;
  month: string;
  day: string;
  isLeapMonth: boolean;
  timeKnown: boolean;
  time: string;
  placeId: string;
}

export const EMPTY_BIRTH: BirthDraft = {
  known: true,
  calendar: 'solar',
  year: '',
  month: '',
  day: '',
  isLeapMonth: false,
  timeKnown: true,
  time: '',
  placeId: 'seoul',
};

export function birthFromDraft(d: BirthDraft): { birth: BirthInput | null; error: string | null } {
  if (!d.known) return { birth: null, error: null };
  const year = Number(d.year);
  const month = Number(d.month);
  const day = Number(d.day);
  if (!d.year || !d.month || !d.day || !Number.isInteger(year)) return { birth: null, error: '생년월일을 모두 입력해 주세요.' };
  if (year < 1900 || year > 2100) return { birth: null, error: '1900년부터 2100년 사이로 입력해 주세요.' };
  let time: BirthInput['time'] = null;
  if (d.timeKnown) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(d.time);
    if (!m) return { birth: null, error: '태어난 시각을 입력하거나 "시간 모름"을 골라 주세요.' };
    time = { hour: Number(m[1]), minute: Number(m[2]) };
  }
  return {
    birth: { calendar: d.calendar, year, month, day, isLeapMonth: d.calendar === 'lunar' ? d.isLeapMonth : false, time, placeId: d.placeId },
    error: null,
  };
}

export function draftFromBirth(b: BirthInput | null): BirthDraft {
  if (!b) return { ...EMPTY_BIRTH, known: false };
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    known: true,
    calendar: b.calendar,
    year: String(b.year),
    month: String(b.month),
    day: String(b.day),
    isLeapMonth: Boolean(b.isLeapMonth),
    timeKnown: b.time !== null,
    time: b.time ? `${pad(b.time.hour)}:${pad(b.time.minute)}` : '',
    placeId: b.placeId,
  };
}

export function BirthFields({ value, onChange, allowUnknown = true, idPrefix }: { value: BirthDraft; onChange: (v: BirthDraft) => void; allowUnknown?: boolean; idPrefix: string }) {
  const set = (patch: Partial<BirthDraft>) => onChange({ ...value, ...patch });
  const days = value.calendar === 'lunar' ? 30 : 31;
  return (
    <div className="stack">
      {allowUnknown ? (
        <Segmented
          label="출생 정보"
          value={value.known ? 'known' : 'none'}
          options={[
            { value: 'known', label: '생년월일 입력' },
            { value: 'none', label: '사주 없이 볼래요' },
          ]}
          onChange={(v) => set({ known: v === 'known' })}
        />
      ) : null}
      {value.known ? (
        <>
          <Field label="생년월일" hint="출산 예정이라면 예정일을 넣어도 돼요.">
            <div className="stack">
              <Segmented
                label="양력 음력"
                value={value.calendar}
                options={[
                  { value: 'solar', label: '양력' },
                  { value: 'lunar', label: '음력' },
                ]}
                onChange={(v) => set({ calendar: v })}
              />
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input
                  id={`${idPrefix}-year`}
                  className="input"
                  inputMode="numeric"
                  placeholder="2026"
                  aria-label="연도"
                  value={value.year}
                  maxLength={4}
                  onChange={(e) => set({ year: e.target.value.replace(/\D/g, '') })}
                  style={{ flex: 1.3 }}
                />
                <select className="select" aria-label="월" value={value.month} onChange={(e) => set({ month: e.target.value })} style={{ flex: 1 }}>
                  <option value="">월</option>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i} value={i + 1}>
                      {i + 1}월
                    </option>
                  ))}
                </select>
                <select className="select" aria-label="일" value={value.day} onChange={(e) => set({ day: e.target.value })} style={{ flex: 1 }}>
                  <option value="">일</option>
                  {Array.from({ length: days }, (_, i) => (
                    <option key={i} value={i + 1}>
                      {i + 1}일
                    </option>
                  ))}
                </select>
              </div>
              {value.calendar === 'lunar' ? (
                <Toggle checked={value.isLeapMonth} onChange={(v) => set({ isLeapMonth: v })} title="윤달이에요" />
              ) : null}
            </div>
          </Field>
          <Field label="태어난 시각" htmlFor={`${idPrefix}-time`} hint={value.timeKnown ? '병원 기록의 시각 그대로 넣어 주세요. 출생지 경도로 보정해요.' : '12시진을 모두 따져 가장 많이 나온 용신을 써요.'}>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input
                id={`${idPrefix}-time`}
                className="input"
                type="time"
                value={value.time}
                disabled={!value.timeKnown}
                onChange={(e) => set({ time: e.target.value })}
                style={{ flex: 1 }}
              />
              <button type="button" className="choice" aria-pressed={!value.timeKnown} onClick={() => set({ timeKnown: !value.timeKnown })}>
                시간 모름
              </button>
            </div>
          </Field>
          <Field label="태어난 곳" htmlFor={`${idPrefix}-place`}>
            <select id={`${idPrefix}-place`} className="select" value={value.placeId} onChange={(e) => set({ placeId: e.target.value })}>
              {PLACES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </>
      ) : (
        <p className="small muted">사주 없이도 소리·획수·뜻으로 풀어 드려요. 다만 용신 보완(자원오행)은 평가하지 못해요.</p>
      )}
    </div>
  );
}

// ── 성씨 ───────────────────────────────────────────────
export function SurnamePicker({ value, onChange }: { value: SurnameSel | null; onChange: (v: SurnameSel | null) => void }) {
  const init = useInit();
  const [text, setText] = useState(value?.hangul ?? '');
  const matches = useMemo<Surname[]>(() => {
    if (!init || !text.trim()) return [];
    const t = text.trim();
    return init.surnames.filter((s) => s.hangul === t || s.readings.includes(t));
  }, [init, text]);

  useEffect(() => {
    if (matches.length === 1 && value?.hanja !== matches[0]!.hanja) {
      onChange({ hangul: text.trim(), hanja: matches[0]!.hanja });
    }
    // 한 개뿐이면 자동 선택
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches]);

  return (
    <Field label="성씨" htmlFor="surname" hint={text && init && matches.length === 0 ? '목록에 없는 성씨예요. 다른 표기(예: 이/리)로 찾아보세요.' : '한글로 입력하면 한자를 고를 수 있어요.'}>
      <input
        id="surname"
        className="input"
        placeholder="김"
        value={text}
        maxLength={2}
        autoComplete="family-name"
        onChange={(e) => {
          setText(e.target.value);
          onChange(null);
        }}
      />
      {matches.length > 0 ? (
        <div className="choice-list" style={{ marginTop: 10 }} role="group" aria-label="성씨 한자">
          {matches.map((s) => (
            <button
              key={s.hanja}
              type="button"
              className="choice"
              aria-pressed={value?.hanja === s.hanja}
              onClick={() => onChange({ hangul: text.trim(), hanja: s.hanja })}
            >
              <span className="hanja" style={{ fontSize: 20 }}>{s.hanja}</span> {s.hangul}
            </button>
          ))}
        </div>
      ) : null}
    </Field>
  );
}

// ── 학설·계산 옵션 ─────────────────────────────────────
export function SchoolOptionsPanel({
  school,
  saju,
  onSchool,
  onSaju,
  showSaju = true,
}: {
  school: SchoolOptions;
  saju: SajuOptions;
  onSchool: (v: SchoolOptions) => void;
  onSaju: (v: SajuOptions) => void;
  showSaju?: boolean;
}) {
  return (
    <div className="stack">
      <Field label="음령(발음)오행 기준" hint="해례본: ㅇㅎ=水, ㅁㅂㅍ=土 · 운해본: ㅇㅎ=土, ㅁㅂㅍ=水. 결과에는 두 기준을 모두 보여 드려요.">
        <Segmented
          label="음령오행 기준"
          value={school.soundSchool}
          options={[
            { value: 'haerye', label: '해례본' },
            { value: 'unhae', label: '운해본' },
          ]}
          onChange={(v) => onSchool({ ...school, soundSchool: v })}
        />
      </Field>
      <div>
        <Toggle checked={school.strictMode} onChange={(v) => onSchool({ ...school, strictMode: v })} title="엄격하게 고르기" desc="4격에 흉수가 있거나 소리오행이 상극인 이름은 빼요." />
        <Toggle
          checked={Boolean(school.bothSchoolsNoClash)}
          onChange={(v) => onSchool({ ...school, bothSchoolsNoClash: v })}
          title="두 학설 모두 상극 없게"
          desc="해례본·운해본 어느 기준으로 봐도 소리오행이 부딪히지 않는 이름만 추천해요."
        />
        <Toggle checked={school.femaleStrongNumbers} onChange={(v) => onSchool({ ...school, femaleStrongNumbers: v })} title="여아 강한 수 주의" desc="여아 이름에서 21·23·33·39를 낮게 보는 학설을 적용해요." />
        <Toggle checked={school.excludeBulyong} onChange={(v) => onSchool({ ...school, excludeBulyong: v })} title="불용한자 빼기" desc="일부 학설에서 이름에 쓰지 않는다고 보는 한자를 빼요." />
        <Toggle checked={school.includeFinalConsonant} onChange={(v) => onSchool({ ...school, includeFinalConsonant: v })} title="받침 소리까지 보기" desc="받침의 오행도 소리 흐름에 넣어요." />
      </div>
      {showSaju ? (
        <div>
          <Toggle checked={saju.trueSolarTime} onChange={(v) => onSaju({ ...saju, trueSolarTime: v })} title="출생지 시간 보정(진태양시)" desc="서울은 약 32분 늦춰 계산해요. 결과가 갈리면 둘 다 보여 드려요." />
          <Toggle checked={saju.equationOfTime} onChange={(v) => onSaju({ ...saju, equationOfTime: v })} title="균시차까지 보정" desc="계절에 따른 해의 남중 차이(최대 16분)를 더해요." />
          <Field label="밤 11시~자정 출생">
            <Segmented
              label="자시 처리"
              value={saju.ziHour}
              options={[
                { value: 'nextDay', label: '다음 날로 (정통)' },
                { value: 'yaJasi', label: '그날로 (야자시)' },
              ]}
              onChange={(v) => onSaju({ ...saju, ziHour: v })}
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
}

// ── 한자 고르기 ────────────────────────────────────────
export function HanjaPicker({
  syllable,
  initial,
  birth,
  sajuOpts,
  value,
  onChange,
}: {
  syllable: string;
  initial: boolean;
  birth: BirthInput | null;
  sajuOpts: SajuOptions;
  value: string | null;
  onChange: (ch: string | null) => void;
}) {
  const [options, setOptions] = useState<HanjaOption[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [custom, setCustom] = useState('');
  const depKey = JSON.stringify([syllable, initial, birth, sajuOpts]);
  useEffect(() => {
    let alive = true;
    setOptions(null);
    call('hanjaOptions', syllable, initial, birth, sajuOpts)
      .then((o) => alive && setOptions(o))
      .catch(() => alive && setOptions([]));
    return () => {
      alive = false;
    };
    // 객체 동일성 대신 내용으로 비교
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey]);

  if (!options) return <p className="small muted">한자를 찾고 있어요…</p>;
  const good = options.filter((o) => o.nameUse && !o.negative && o.meaning);
  const shown = showAll ? options : good.slice(0, 24);
  return (
    <div className="stack">
      <div className="hanja-options" role="group" aria-label={`${syllable} 한자`}>
        <button type="button" className="hanja-opt" aria-pressed={value === null} onClick={() => onChange(null)}>
          <span className="big" style={{ fontFamily: 'var(--font-display)' }}>{syllable}</span>
          <span className="m">한자 없이</span>
        </button>
        {shown.map((o) => (
          <button key={o.ch} type="button" className="hanja-opt" aria-pressed={value === o.ch} onClick={() => onChange(o.ch)}>
            <span className="big">{o.ch}</span>
            <span className="m">{o.meaning.split(',')[0] || '뜻 정보 없음'}</span>
            <span className="row" style={{ justifyContent: 'center', gap: 4, marginTop: 4 }}>
              <ElementChip element={o.element} />
              <span className="tiny muted">{o.strokes}획</span>
            </span>
            {o.favor !== null && o.favor >= 0.8 ? <span className="tiny" style={{ color: 'var(--good)' }}>용·희신</span> : null}
            {o.favor !== null && o.favor <= -0.5 ? <span className="tiny" style={{ color: 'var(--bad)' }}>사주와 상충</span> : null}
            {!o.nameUse ? <span className="tiny" style={{ color: 'var(--bad)' }}>인명용 아님</span> : null}
            {o.negative ? <span className="tiny" style={{ color: 'var(--bad)' }}>피하는 뜻</span> : null}
          </button>
        ))}
      </div>
      <div className="row">
        {options.length > shown.length ? (
          <button type="button" className="btn btn-line" onClick={() => setShowAll(true)}>
            전체 {options.length}자 보기
          </button>
        ) : null}
        <input
          className="input"
          style={{ flex: 1, minWidth: 140 }}
          placeholder="한자 직접 입력"
          aria-label={`${syllable} 한자 직접 입력`}
          value={custom}
          maxLength={1}
          onChange={(e) => {
            const ch = [...e.target.value].slice(-1)[0] ?? '';
            setCustom(ch);
            if (/\p{Script=Han}/u.test(ch)) onChange(ch);
          }}
        />
      </div>
    </div>
  );
}
