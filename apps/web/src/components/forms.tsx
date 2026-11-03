import { useEffect, useMemo, useState } from 'react';
import type { BirthInput, SajuOptions, SchoolOptions, Surname } from '@aidam/engine';
import { PLACES } from '@aidam/engine/src/calendar/places';
import { call } from '../lib/engine';
import type { HanjaOption } from '../lib/api';
import type { SurnameSel } from '../lib/state';
import { ElementChip, Field, Segmented, Switch } from './ui';

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
  if (!d.year || !d.month || !d.day || !Number.isInteger(year)) return { birth: null, error: '생년월일을 입력해 주세요.' };
  if (year < 1900 || year > 2100) return { birth: null, error: '1900~2100년 사이로 입력해 주세요.' };
  let time: BirthInput['time'] = null;
  if (d.timeKnown) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(d.time);
    if (!m) return { birth: null, error: '태어난 시각을 넣거나 "모름"을 눌러 주세요.' };
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

export function BirthFields({ value, onChange, idPrefix, hideTime = false }: { value: BirthDraft; onChange: (v: BirthDraft) => void; idPrefix: string; hideTime?: boolean }) {
  const set = (patch: Partial<BirthDraft>) => onChange({ ...value, ...patch });
  const days = value.calendar === 'lunar' ? 30 : 31;
  return (
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
      <div className="date-row">
        <input
          id={`${idPrefix}-year`}
          className="input num"
          inputMode="numeric"
          placeholder="2026"
          aria-label="연도"
          value={value.year}
          maxLength={4}
          onChange={(e) => set({ year: e.target.value.replace(/\D/g, '') })}
        />
        <select className="select" aria-label="월" value={value.month} onChange={(e) => set({ month: e.target.value })}>
          <option value="">월</option>
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i} value={i + 1}>
              {i + 1}월
            </option>
          ))}
        </select>
        <select className="select" aria-label="일" value={value.day} onChange={(e) => set({ day: e.target.value })}>
          <option value="">일</option>
          {Array.from({ length: days }, (_, i) => (
            <option key={i} value={i + 1}>
              {i + 1}일
            </option>
          ))}
        </select>
      </div>
      {value.calendar === 'lunar' ? <Switch checked={value.isLeapMonth} onChange={(v) => set({ isLeapMonth: v })} title="윤달" /> : null}
      {hideTime ? null : <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input
          id={`${idPrefix}-time`}
          className="input num"
          type="time"
          aria-label="태어난 시각"
          value={value.time}
          disabled={!value.timeKnown}
          onChange={(e) => set({ time: e.target.value })}
          style={{ flex: 1 }}
        />
        <button type="button" className="choice" aria-pressed={!value.timeKnown} onClick={() => set({ timeKnown: !value.timeKnown })} style={{ minHeight: 56, borderRadius: 12 }}>
          시간 모름
        </button>
      </div>}
      <select id={`${idPrefix}-place`} className="select" aria-label="태어난 곳" value={value.placeId} onChange={(e) => set({ placeId: e.target.value })}>
        {PLACES.map((p) => (
          <option key={p.id} value={p.id}>
            태어난 곳 · {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── 성씨 ───────────────────────────────────────────────
export function SurnamePicker({ value, onChange, label }: { value: SurnameSel | null; onChange: (v: SurnameSel | null) => void; label?: string }) {
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
    // 하나뿐이면 자동 선택
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches]);

  const input = (
    <input
      id="surname"
      className="input"
      placeholder="예: 김"
      value={text}
      maxLength={2}
      autoComplete="family-name"
      onChange={(e) => {
        setText(e.target.value);
        onChange(null);
      }}
    />
  );
  return (
    <div className="stack">
      {label ? <Field label={label} htmlFor="surname">{input}</Field> : input}
      {matches.length > 1 ? (
        <div className="chips" role="group" aria-label="성씨 한자">
          {matches.map((s) => (
            <button key={s.hanja} type="button" className="choice" aria-pressed={value?.hanja === s.hanja} onClick={() => onChange({ hangul: text.trim(), hanja: s.hanja })}>
              {s.hanja} {s.hangul}
            </button>
          ))}
        </div>
      ) : null}
      {matches.length === 1 ? (
        <div className="chips">
          <span className="chip chip-primary" aria-pressed="true">
            {matches[0]!.hanja} {matches[0]!.hangul}
          </span>
        </div>
      ) : null}
      {text && init && matches.length === 0 ? <p className="small muted">목록에 없는 성씨예요. 다른 표기(이/리)로 찾아보세요.</p> : null}
    </div>
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
    <div className="stack" style={{ gap: 4 }}>
      <Field label="소리오행 기준">
        <Segmented
          label="소리오행 기준"
          value={school.soundSchool}
          options={[
            { value: 'haerye', label: '해례본' },
            { value: 'unhae', label: '운해본' },
          ]}
          onChange={(v) => onSchool({ ...school, soundSchool: v })}
        />
      </Field>
      <Switch checked={school.strictMode} onChange={(v) => onSchool({ ...school, strictMode: v })} title="흉수·상극 이름 빼기" />
      <Switch checked={Boolean(school.bothSchoolsNoClash)} onChange={(v) => onSchool({ ...school, bothSchoolsNoClash: v })} title="두 학설 모두 상극 없게" />
      <Switch checked={school.femaleStrongNumbers} onChange={(v) => onSchool({ ...school, femaleStrongNumbers: v })} title="여아 강한 수(21·23·33·39) 주의" />
      <Switch checked={school.excludeBulyong} onChange={(v) => onSchool({ ...school, excludeBulyong: v })} title="불용한자 빼기" />
      <Switch checked={school.includeFinalConsonant} onChange={(v) => onSchool({ ...school, includeFinalConsonant: v })} title="받침 소리까지 보기" />
      {showSaju ? (
        <>
          <Switch checked={saju.trueSolarTime} onChange={(v) => onSaju({ ...saju, trueSolarTime: v })} title="출생지 시간 보정" />
          <Switch checked={saju.equationOfTime} onChange={(v) => onSaju({ ...saju, equationOfTime: v })} title="균시차 보정" />
          <Field label="밤 11시~자정 출생">
            <Segmented
              label="자시 처리"
              value={saju.ziHour}
              options={[
                { value: 'nextDay', label: '다음 날로' },
                { value: 'yaJasi', label: '그날로(야자시)' },
              ]}
              onChange={(v) => onSaju({ ...saju, ziHour: v })}
            />
          </Field>
        </>
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

  if (!options) return <p className="small muted">불러오는 중…</p>;
  const good = options.filter((o) => o.nameUse && !o.negative && o.meaning);
  const shown = showAll ? options : good.slice(0, 11);
  return (
    <div className="stack">
      <div className="hanja-grid" role="group" aria-label={`${syllable} 한자`}>
        <button type="button" className="hanja-opt" aria-pressed={value === null} onClick={() => onChange(null)}>
          <span className="big">{syllable}</span>
          <span className="m">한글만</span>
        </button>
        {shown.map((o) => (
          <button key={o.ch} type="button" className="hanja-opt" aria-pressed={value === o.ch} onClick={() => onChange(o.ch)}>
            <span className="big">{o.ch}</span>
            <span className="m">{o.meaning.split(',')[0] || '—'}</span>
            <span className="row" style={{ justifyContent: 'center', gap: 4 }}>
              <ElementChip element={o.element} />
              <span className="tiny muted num">{o.strokes}획</span>
            </span>
            {o.favor !== null && o.favor >= 0.8 ? <span className="flag good">사주 보완</span> : null}
            {o.favor !== null && o.favor <= -0.5 ? <span className="flag bad">사주와 상충</span> : null}
            {!o.nameUse ? <span className="flag bad">인명용 아님</span> : o.negative ? <span className="flag bad">피하는 뜻</span> : null}
          </button>
        ))}
      </div>
      {options.length > shown.length ? (
        <button type="button" className="text-btn" onClick={() => setShowAll(true)}>
          한자 {options.length}자 모두 보기
        </button>
      ) : null}
    </div>
  );
}
