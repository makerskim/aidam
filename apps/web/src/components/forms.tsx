import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { BirthInput, SajuOptions, SchoolOptions, Surname } from '@aidam/engine';
import { PLACES } from '@aidam/engine/src/calendar/places';
import { call } from '../lib/engine';
import type { HanjaOption } from '../lib/api';
import type { SurnameSel } from '../lib/state';
import { surnameInfo } from '../lib/surname-info';
import { ElementChip, Field, Icon, Picker, Segmented, Switch, type PickerGroup } from './ui';

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

/** 바깥을 누르거나 Esc를 누르면 닫힌다 */
function usePopover(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, open, close]);
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
  /** "HH:MM" */
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

const isRealDate = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

export function birthFromDraft(d: BirthDraft): { birth: BirthInput | null; error: string | null } {
  if (!d.known) return { birth: null, error: null };
  const year = Number(d.year);
  const month = Number(d.month);
  const day = Number(d.day);
  if (!d.year || !d.month || !d.day || !Number.isInteger(year)) return { birth: null, error: '태어난 날짜를 넣어 주세요. (예: 2026.03.14)' };
  if (year < 1900 || year > 2100) return { birth: null, error: '1900년부터 2100년 사이로 넣어 주세요.' };
  if (d.calendar === 'solar' && !isRealDate(year, month, day)) return { birth: null, error: '달력에 없는 날짜예요. 다시 확인해 주세요.' };
  let time: BirthInput['time'] = null;
  if (d.timeKnown) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(d.time);
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return { birth: null, error: '태어난 시각을 넣거나 "시간 모름"을 눌러 주세요. (예: 09:30)' };
    time = { hour: Number(m[1]), minute: Number(m[2]) };
  }
  return {
    birth: { calendar: d.calendar, year, month, day, isLeapMonth: d.calendar === 'lunar' ? d.isLeapMonth : false, time, placeId: d.placeId },
    error: null,
  };
}

export function draftFromBirth(b: BirthInput | null): BirthDraft {
  if (!b) return { ...EMPTY_BIRTH, known: false };
  return {
    known: true,
    calendar: b.calendar,
    year: String(b.year),
    month: String(b.month),
    day: String(b.day),
    isLeapMonth: Boolean(b.isLeapMonth),
    timeKnown: b.time !== null,
    time: b.time ? `${pad2(b.time.hour)}:${pad2(b.time.minute)}` : '',
    placeId: b.placeId,
  };
}

const pad2 = (n: number | string) => String(n).padStart(2, '0');
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

/** "20260314", "2026.3.14", "2026-03-14" 모두 읽는다 */
function parseDateText(raw: string): { year: string; month: string; day: string } | null {
  const parts = raw.split(/[^0-9]+/).filter(Boolean);
  if (parts.length >= 3 && parts[0]!.length === 4) return { year: parts[0]!, month: String(Number(parts[1])), day: String(Number(parts[2])) };
  const dg = raw.replace(/\D/g, '');
  if (dg.length === 8) return { year: dg.slice(0, 4), month: String(Number(dg.slice(4, 6))), day: String(Number(dg.slice(6, 8))) };
  return null;
}
/** 숫자만 치면 점을 자동으로 넣는다 */
function formatDateTyping(raw: string): string {
  if (/[^0-9]/.test(raw)) return raw.slice(0, 10);
  const dg = raw.slice(0, 8);
  if (dg.length > 6) return `${dg.slice(0, 4)}.${dg.slice(4, 6)}.${dg.slice(6)}`;
  if (dg.length > 4) return `${dg.slice(0, 4)}.${dg.slice(4)}`;
  return dg;
}
const dateText = (y: string, m: string, d: string) => (y && m && d ? `${y}.${pad2(m)}.${pad2(d)}` : '');

/** 날짜: 직접 입력 + 달력에서 고르기 */
export function DateField({
  id,
  calendar,
  year,
  month,
  day,
  onChange,
}: {
  id: string;
  calendar: 'solar' | 'lunar';
  year: string;
  month: string;
  day: string;
  onChange: (v: { year: string; month: string; day: string }) => void;
}) {
  const [text, setText] = useState(dateText(year, month, day));
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  usePopover(wrap, open, () => setOpen(false));

  // 달력에서 고르거나 바깥에서 값이 바뀌면 글자도 맞춘다
  useEffect(() => {
    const parsed = parseDateText(text);
    if (year && month && day && (!parsed || parsed.year !== year || parsed.month !== month || parsed.day !== day)) setText(dateText(year, month, day));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, day]);

  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const complete = Boolean(year && month && day);
  const solarOk = complete && calendar === 'solar' && isRealDate(y, m, d);
  const hint = !complete
    ? ''
    : calendar === 'solar'
      ? solarOk
        ? `${WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}요일`
        : '없는 날짜'
      : '음력';

  return (
    <div className="df" ref={wrap}>
      <div className={`df-box ${complete && calendar === 'solar' && !solarOk ? 'bad' : ''}`}>
        <input
          id={id}
          className="df-input num"
          inputMode="numeric"
          autoComplete="off"
          placeholder="2026.03.14"
          aria-label="태어난 날짜 (예: 2026.03.14)"
          value={text}
          onChange={(e) => {
            const t = formatDateTyping(e.target.value);
            setText(t);
            onChange(parseDateText(t) ?? { year: '', month: '', day: '' });
          }}
          onBlur={() => complete && setText(dateText(year, month, day))}
        />
        {hint ? <span className={`df-hint ${hint === '없는 날짜' ? 'bad' : ''}`}>{hint}</span> : null}
        <button type="button" className="df-btn" aria-label="달력에서 고르기" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {Icon.calendar}
        </button>
      </div>
      {open ? (
        <>
          <div className="pk-backdrop" onMouseDown={() => setOpen(false)} />
          <CalendarPop
            calendar={calendar}
            year={y || new Date().getFullYear()}
            month={m || new Date().getMonth() + 1}
            selected={complete ? { y, m, d } : null}
            onPick={(v) => {
              onChange({ year: String(v.y), month: String(v.m), day: String(v.d) });
              setText(dateText(String(v.y), String(v.m), String(v.d)));
              setOpen(false);
            }}
          />
        </>
      ) : null}
    </div>
  );
}

type CalMode = 'day' | 'month' | 'year';

function CalendarPop({
  calendar,
  year,
  month,
  selected,
  onPick,
}: {
  calendar: 'solar' | 'lunar';
  year: number;
  month: number;
  selected: { y: number; m: number; d: number } | null;
  onPick: (v: { y: number; m: number; d: number }) => void;
}) {
  const [view, setView] = useState({ y: Math.min(2100, Math.max(1900, year)), m: Math.min(12, Math.max(1, month)) });
  const [mode, setMode] = useState<CalMode>('day');
  const [dir, setDir] = useState<'next' | 'prev' | ''>('');
  const yearPage = Math.floor((view.y - 1900) / 12) * 12 + 1900;
  const move = (delta: number) => {
    setDir(delta > 0 ? 'next' : 'prev');
    if (mode === 'year') return setView((v) => ({ ...v, y: Math.min(2100, Math.max(1900, v.y + delta * 12)) }));
    if (mode === 'month') return setView((v) => ({ ...v, y: Math.min(2100, Math.max(1900, v.y + delta)) }));
    const idx = view.y * 12 + (view.m - 1) + delta;
    const y = Math.floor(idx / 12);
    if (y < 1900 || y > 2100) return undefined;
    return setView({ y, m: (idx % 12) + 1 });
  };
  const solar = calendar === 'solar';
  const days = solar ? new Date(Date.UTC(view.y, view.m, 0)).getUTCDate() : 30;
  const lead = solar ? new Date(Date.UTC(view.y, view.m - 1, 1)).getUTCDay() : 0;
  const now = new Date();
  const isToday = (d: number) => solar && now.getFullYear() === view.y && now.getMonth() + 1 === view.m && now.getDate() === d;
  const title = mode === 'year' ? `${yearPage} – ${Math.min(2100, yearPage + 11)}` : mode === 'month' ? `${view.y}년` : `${view.y}년 ${view.m}월`;
  return (
    <div className="pk-pop cal" role="dialog" aria-label={`${solar ? '양력' : '음력'} 달력`}>
      <div className="cal-head">
        <button type="button" className="cal-title" aria-label="연도·월 고르기" onClick={() => setMode(mode === 'day' ? 'year' : mode === 'year' ? 'month' : 'day')}>
          {!solar ? <span className="cal-lunar">음력</span> : null}
          {title}
          <span className={`cal-caret ${mode !== 'day' ? 'up' : ''}`}>{Icon.down}</span>
        </button>
        <div className="cal-navs">
          <button type="button" className="cal-nav" aria-label={mode === 'day' ? '이전 달' : '이전'} onClick={() => move(-1)}>
            {Icon.back}
          </button>
          <button type="button" className="cal-nav next" aria-label={mode === 'day' ? '다음 달' : '다음'} onClick={() => move(1)}>
            {Icon.back}
          </button>
        </div>
      </div>

      {mode === 'year' ? (
        <div className={`cal-cells cal-ym slide-${dir}`} key={`y${yearPage}`}>
          {Array.from({ length: 12 }, (_, k) => yearPage + k)
            .filter((y) => y <= 2100)
            .map((y) => (
              <button key={y} type="button" className={`cal-cell ${now.getFullYear() === y ? 'today' : ''}`} aria-pressed={view.y === y} onClick={() => { setView({ ...view, y }); setMode('month'); setDir(''); }}>
                {y}
              </button>
            ))}
        </div>
      ) : null}

      {mode === 'month' ? (
        <div className={`cal-cells cal-ym slide-${dir}`} key={`m${view.y}`}>
          {Array.from({ length: 12 }, (_, k) => k + 1).map((m) => (
            <button key={m} type="button" className="cal-cell" aria-pressed={view.m === m} onClick={() => { setView({ ...view, m }); setMode('day'); setDir(''); }}>
              {m}월
            </button>
          ))}
        </div>
      ) : null}

      {mode === 'day' ? (
        <>
          {solar ? (
            <div className="cal-grid cal-week" aria-hidden="true">
              {WEEK.map((w, k) => (
                <span key={w} className={k === 0 ? 'sun' : k === 6 ? 'sat' : ''}>
                  {w}
                </span>
              ))}
            </div>
          ) : null}
          <div className={`cal-grid slide-${dir}`} key={`d${view.y}-${view.m}`}>
            {Array.from({ length: lead }, (_, k) => (
              <span key={`b${k}`} />
            ))}
            {Array.from({ length: days }, (_, k) => k + 1).map((d) => {
              const sel = selected && selected.y === view.y && selected.m === view.m && selected.d === d;
              const dow = (lead + d - 1) % 7;
              return (
                <button
                  key={d}
                  type="button"
                  className={`cal-day ${isToday(d) ? 'today' : ''} ${solar && dow === 0 ? 'sun' : ''} ${solar && dow === 6 ? 'sat' : ''}`}
                  aria-pressed={Boolean(sel)}
                  aria-label={`${view.y}년 ${view.m}월 ${d}일`}
                  onClick={() => onPick({ y: view.y, m: view.m, d })}
                >
                  {d}
                </button>
              );
            })}
          </div>
          {solar ? (
            <div className="cal-foot">
              <button type="button" className="cal-today" onClick={() => onPick({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() })}>
                오늘
              </button>
            </div>
          ) : (
            <p className="tiny muted cal-note">윤달이면 아래 ‘윤달이에요’를 켜 주세요.</p>
          )}
        </>
      ) : null}
    </div>
  );
}

/** "0930", "9:30", "09:30" 모두 읽는다 */
function parseTimeText(raw: string): string | null {
  const parts = raw.split(/[^0-9]+/).filter(Boolean);
  let h: number;
  let m: number;
  if (parts.length >= 2) {
    h = Number(parts[0]);
    m = Number(parts[1]);
  } else {
    const dg = raw.replace(/\D/g, '');
    if (dg.length !== 4) return null;
    h = Number(dg.slice(0, 2));
    m = Number(dg.slice(2));
  }
  if (h > 23 || m > 59) return null;
  return `${pad2(h)}:${pad2(m)}`;
}
function formatTimeTyping(raw: string): string {
  if (/[^0-9]/.test(raw)) return raw.slice(0, 5);
  const dg = raw.slice(0, 4);
  return dg.length > 2 ? `${dg.slice(0, 2)}:${dg.slice(2)}` : dg;
}
const ampm = (h: number) => (h < 12 ? '오전' : '오후');

/** 오전/오후 + 시(12칸) + 분(5분 칸) + ±1분 */
function TimePop({ time, onChange, onDone }: { time: string; onChange: (t: string) => void; onDone: () => void }) {
  const [h0, m0] = time ? time.split(':').map(Number) : [9, 0];
  const h = h0 ?? 9;
  const m = m0 ?? 0;
  const [pm, setPm] = useState(h >= 12);
  const set = (hh: number, mm: number) => onChange(`${pad2(hh)}:${pad2(mm)}`);
  const step = (delta: number) => {
    const t = (((h * 60 + m + delta) % 1440) + 1440) % 1440;
    setPm(t >= 720);
    set(Math.floor(t / 60), t % 60);
  };
  return (
    <div className="pk-pop tp2" role="dialog" aria-label="시각 고르기">
      <div className="tp2-now">
        <button type="button" className="tp2-step" aria-label="1분 빠르게" onClick={() => step(-1)}>
          −1분
        </button>
        <b className="num">{time ? `${ampm(h)} ${h % 12 === 0 ? 12 : h % 12}:${pad2(m)}` : '--:--'}</b>
        <button type="button" className="tp2-step" aria-label="1분 늦게" onClick={() => step(1)}>
          +1분
        </button>
      </div>
      <div className="seg tp2-ampm" role="group" aria-label="오전 오후">
        {[false, true].map((isPm) => (
          <button
            key={String(isPm)}
            type="button"
            aria-pressed={pm === isPm}
            onClick={() => {
              setPm(isPm);
              if (time) set((h % 12) + (isPm ? 12 : 0), m);
            }}
          >
            {isPm ? '오후' : '오전'}
          </button>
        ))}
      </div>
      <div className="tp2-label">시</div>
      <div className="tp2-grid">
        {Array.from({ length: 12 }, (_, k) => (k === 0 ? 12 : k)).map((n) => {
          const hh = (n % 12) + (pm ? 12 : 0);
          return (
            <button key={n} type="button" className="tp2-cell" aria-pressed={Boolean(time) && h === hh} onClick={() => set(hh, m)}>
              {n}
            </button>
          );
        })}
      </div>
      <div className="tp2-label">분</div>
      <div className="tp2-grid">
        {Array.from({ length: 12 }, (_, k) => k * 5).map((mm) => (
          <button key={mm} type="button" className="tp2-cell" aria-pressed={Boolean(time) && m === mm} onClick={() => set(time ? h : pm ? 12 : 9, mm)}>
            {pad2(mm)}
          </button>
        ))}
      </div>
      <button type="button" className="btn btn-primary btn-block tp2-done" onClick={onDone}>
        완료
      </button>
    </div>
  );
}

/** 시각: 직접 입력 + 목록에서 고르기 + 시간 모름 */
export function TimeFields({ idPrefix, time, known, onChange }: { idPrefix: string; time: string; known: boolean; onChange: (time: string, known: boolean) => void }) {
  const [text, setText] = useState(time);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  usePopover(wrap, open, () => setOpen(false));
  useEffect(() => {
    if (time && parseTimeText(text) !== time) setText(time);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time]);
  const [hh, mm] = time ? time.split(':').map(Number) : [null, null];
  const hint = time && hh !== null && hh !== undefined ? `${ampm(hh)} ${hh % 12 === 0 ? 12 : hh % 12}시 ${mm}분` : '';

  return (
    <div className="time-row">
      <div className="df" ref={wrap}>
        <div className={`df-box ${!known ? 'off' : ''}`}>
          <input
            id={`${idPrefix}-time`}
            className="df-input num"
            inputMode="numeric"
            autoComplete="off"
            placeholder="09:30"
            aria-label="태어난 시각 (예: 09:30)"
            disabled={!known}
            value={known ? text : ''}
            onChange={(e) => {
              const t = formatTimeTyping(e.target.value);
              setText(t);
              onChange(parseTimeText(t) ?? '', true);
            }}
            onBlur={() => time && setText(time)}
          />
          {known && hint ? <span className="df-hint">{hint}</span> : null}
          <button type="button" className="df-btn" aria-label="시각 고르기" aria-expanded={open} disabled={!known} onClick={() => setOpen((o) => !o)}>
            {Icon.clock}
          </button>
        </div>
        {open ? (
          <>
            <div className="pk-backdrop" onMouseDown={() => setOpen(false)} />
            <TimePop
              time={time}
              onChange={(t) => {
                setText(t);
                onChange(t, true);
              }}
              onDone={() => setOpen(false)}
            />
          </>
        ) : null}
      </div>
      <button type="button" className="choice unknown-btn" aria-pressed={!known} onClick={() => onChange(time, !known)}>
        시간 모름
      </button>
    </div>
  );
}

const REGIONS: [string, string[]][] = [
  ['서울·경기·인천', ['seoul', 'incheon', 'suwon', 'uijeongbu']],
  ['강원', ['chuncheon', 'gangneung']],
  ['충청·대전·세종', ['daejeon', 'sejong', 'cheongju', 'cheonan']],
  ['전라·광주', ['gwangju', 'jeonju', 'mokpo', 'yeosu']],
  ['경상·부산·대구·울산', ['busan', 'daegu', 'ulsan', 'pohang', 'andong', 'changwon', 'jinju']],
  ['제주', ['jeju', 'seogwipo']],
];
const PLACE_GROUPS: PickerGroup[] = REGIONS.map(([title, ids]) => ({
  title,
  cols: 2,
  options: ids.map((id) => ({ value: id, label: PLACES.find((p) => p.id === id)?.name ?? id })),
}));

export function BirthFields({ value, onChange, idPrefix, hideTime = false }: { value: BirthDraft; onChange: (v: BirthDraft) => void; idPrefix: string; hideTime?: boolean }) {
  const set = (patch: Partial<BirthDraft>) => onChange({ ...value, ...patch });
  return (
    <div className="stack" style={{ gap: 24 }}>
      <Field label="태어난 날">
        <div className="stack" style={{ gap: 10 }}>
          <Segmented
            label="양력 음력"
            value={value.calendar}
            options={[
              { value: 'solar', label: '양력' },
              { value: 'lunar', label: '음력' },
            ]}
            onChange={(v) => set({ calendar: v })}
          />
          <DateField id={`${idPrefix}-date`} calendar={value.calendar} year={value.year} month={value.month} day={value.day} onChange={(v) => set(v)} />
          {value.calendar === 'lunar' ? <Switch checked={value.isLeapMonth} onChange={(v) => set({ isLeapMonth: v })} title="윤달이에요" /> : null}
        </div>
      </Field>
      {hideTime ? null : (
        <Field label="태어난 시각">
          <TimeFields idPrefix={idPrefix} time={value.time} known={value.timeKnown} onChange={(time, timeKnown) => set({ time, timeKnown })} />
        </Field>
      )}
      <Field label="태어난 곳">
        <Picker id={`${idPrefix}-place`} label="태어난 곳" placeholder="지역 선택" value={value.placeId} groups={PLACE_GROUPS} onChange={(placeId) => set({ placeId })} />
      </Field>
    </div>
  );
}

// ── 성 ────────────────────────────────────────────────
type InitSurname = Surname & { strokes: number; meaning: string };

/** 사전 뜻 중 '성 ○'이 아닌 첫 뜻 (대표 훈음 목록에 없을 때만 씀) */
function fallbackHun(meaning: string): string {
  const segs = meaning.split(/[,/]/).map((x) => x.trim()).filter(Boolean);
  return segs.find((x) => !/^성(씨)?\s/.test(x)) ?? segs[0] ?? '';
}

export function SurnamePicker({ value, onChange, label }: { value: SurnameSel | null; onChange: (v: SurnameSel | null) => void; label?: string }) {
  const init = useInit();
  const [text, setText] = useState(value?.hangul ?? '');
  const t = text.trim();
  const [showRare, setShowRare] = useState(false);
  const all = useMemo<InitSurname[]>(() => {
    if (!init || !t) return [];
    return init.surnames.filter((s) => s.hangul === t || s.readings.includes(t) || s.hanja === t);
  }, [init, t]);
  // 거의 쓰지 않는 성 한자는 숨긴다(같은 소리의 흔한 성이 없거나, 직접 펼쳤을 때만 보여 줌)
  const commonOnes = all.filter((s) => s.common);
  const rareOnes = all.filter((s) => !s.common);
  const matches = commonOnes.length && !showRare && !rareOnes.some((s) => s.hanja === value?.hanja) ? commonOnes : all;
  const pick = (s: InitSurname) => onChange({ hangul: s.hanja === t ? s.hangul : t, hanja: s.hanja });

  useEffect(() => {
    if (matches.length === 1 && value?.hanja !== matches[0]!.hanja) pick(matches[0]!);
    // 하나뿐이면 자동 선택
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches]);

  const input = (
    <input
      id="surname"
      className="input input-xl"
      placeholder="예: 김"
      value={text}
      maxLength={2}
      autoComplete="family-name"
      onChange={(e) => {
        setText(e.target.value);
        setShowRare(false);
        onChange(null);
      }}
    />
  );
  return (
    <div className="stack" style={{ gap: 22 }}>
      {label ? (
        <Field label={label} htmlFor="surname">
          {input}
        </Field>
      ) : (
        input
      )}
      {matches.length > 0 ? (
        <div className="field">
          <span className="label">{matches.length > 1 ? `‘${t}’ 씨 한자를 골라 주세요` : '한자'}</span>
          <div className="opt-list" role="radiogroup" aria-label="성씨 한자">
            {matches.map((s) => (
              <button key={s.hanja} type="button" role="radio" aria-checked={value?.hanja === s.hanja} className="opt-row" onClick={() => pick(s)}>
                <span className="opt-hanja">{s.hanja}</span>
                <span className="opt-text">
                  <b>{surnameInfo(s.hanja)?.hun ?? fallbackHun(s.meaning)}</b>
                  <small>{s.strokes}획</small>
                </span>
                <span className="opt-check" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {matches.length > 0 && matches.length < all.length ? (
        <button type="button" className="text-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setShowRare(true)}>
          드물게 쓰는 한자 {all.length - matches.length}개 더 보기
        </button>
      ) : null}
      {t && init && matches.length === 0 ? <p className="small muted">목록에 없는 성이에요. 다른 표기(이/리, 유/류)로 찾아보세요.</p> : null}
    </div>
  );
}

// ── 설정: 켜고 끄기만 ─────────────────────────────────
export function SchoolOptionsPanel({ school, saju, onSchool, onSaju }: { school: SchoolOptions; saju: SajuOptions; onSchool: (v: SchoolOptions) => void; onSaju: (v: SajuOptions) => void }) {
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="card settings-group">
        <h2 className="settings-title">이름 고르기</h2>
        <Switch checked={school.strictMode} onChange={(v) => onSchool({ ...school, strictMode: v })} title="아쉬운 이름 미리 빼기" />
        <Switch checked={Boolean(school.bothSchoolsNoClash)} onChange={(v) => onSchool({ ...school, bothSchoolsNoClash: v })} title="두 학설 모두 맞는 소리만" />
        <Switch checked={school.femaleStrongNumbers} onChange={(v) => onSchool({ ...school, femaleStrongNumbers: v })} title="여아는 센 획수 빼기" />
        <Switch checked={school.excludeBulyong} onChange={(v) => onSchool({ ...school, excludeBulyong: v })} title="예전에 안 쓰던 한자 빼기" />
        <Switch checked={school.includeFinalConsonant} onChange={(v) => onSchool({ ...school, includeFinalConsonant: v })} title="받침 소리도 보기" />
      </div>
      <div className="card settings-group">
        <h2 className="settings-title">사주 계산</h2>
        <Switch checked={saju.trueSolarTime} onChange={(v) => onSaju({ ...saju, trueSolarTime: v })} title="태어난 지역 시간으로 보정" />
        <Switch checked={saju.equationOfTime} onChange={(v) => onSaju({ ...saju, equationOfTime: v })} title="계절 시간차까지 보정" />
        <Switch checked={saju.ziHour === 'nextDay'} onChange={(v) => onSaju({ ...saju, ziHour: v ? 'nextDay' : 'yaJasi' })} title="밤 11시 이후는 다음 날로" />
      </div>
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
  const shown = showAll ? options : good.slice(0, 15);
  return (
    <div className="stack">
      <div className="hanja-grid" role="group" aria-label={`${syllable} 한자`}>
        {shown.map((o) => (
          <button key={o.ch} type="button" className="hanja-opt" aria-pressed={value === o.ch} onClick={() => onChange(value === o.ch ? null : o.ch)}>
            <span className="big">{o.ch}</span>
            <span className="m">{o.meaning.split(',')[0] || '—'}</span>
            <span className="row" style={{ justifyContent: 'center', gap: 4 }}>
              <ElementChip element={o.element} withName />
            </span>
            {o.favor !== null && o.favor >= 0.8 ? <span className="flag good">사주를 채워요</span> : null}
            {o.favor !== null && o.favor <= -0.5 ? <span className="flag bad">사주와 안 맞아요</span> : null}
            {!o.nameUse ? <span className="flag bad">인명용 아님</span> : o.negative ? <span className="flag bad">피하는 뜻</span> : null}
          </button>
        ))}
      </div>
      {options.length > shown.length ? (
        <button type="button" className="text-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setShowAll(true)}>
          한자 {options.length}자 모두 보기
        </button>
      ) : null}
    </div>
  );
}
