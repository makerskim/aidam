import { useEffect, useMemo, useState } from 'react';
import type { BirthInput, SajuOptions, SchoolOptions, Surname } from '@aidam/engine';
import { PLACES } from '@aidam/engine/src/calendar/places';
import { call } from '../lib/engine';
import type { HanjaOption } from '../lib/api';
import { surnameLabel, type SurnameSel } from '../lib/state';
import { surnameInfo } from '../lib/surname-info';
import { ElementChip, Field, Picker, Segmented, Switch, type PickerGroup } from './ui';

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

export function birthFromDraft(d: BirthDraft): { birth: BirthInput | null; error: string | null } {
  if (!d.known) return { birth: null, error: null };
  const year = Number(d.year);
  const month = Number(d.month);
  const day = Number(d.day);
  if (!d.year || !d.month || !d.day || !Number.isInteger(year)) return { birth: null, error: '태어난 연·월·일을 골라 주세요.' };
  let time: BirthInput['time'] = null;
  if (d.timeKnown) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(d.time);
    if (!m) return { birth: null, error: '태어난 시·분을 고르거나 "시간 모름"을 눌러 주세요.' };
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

const YEARS: PickerGroup[] = (() => {
  const groups: PickerGroup[] = [];
  for (let start = 2090; start >= 1900; start -= 10) {
    const opts = [];
    for (let y = start + 9; y >= start; y--) if (y <= 2100) opts.push({ value: String(y), label: String(y) });
    groups.push({ title: `${start}년대`, cols: 5, options: opts });
  }
  groups.unshift({ title: '2100년', cols: 5, options: [{ value: '2100', label: '2100' }] });
  return groups;
})();
const MONTHS: PickerGroup[] = [{ cols: 4, options: Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}월` })) }];
const dayGroups = (n: number): PickerGroup[] => [{ cols: 7, options: Array.from({ length: n }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })) }];
const HOURS: PickerGroup[] = [
  { title: '오전', cols: 6, options: Array.from({ length: 12 }, (_, h) => ({ value: String(h), label: `${h}시` })) },
  { title: '오후', cols: 6, options: Array.from({ length: 12 }, (_, i) => ({ value: String(i + 12), label: `${i + 12}시` })) },
];
const MINUTES: PickerGroup[] = [{ cols: 6, options: Array.from({ length: 60 }, (_, m) => ({ value: String(m), label: `${String(m).padStart(2, '0')}분` })) }];
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

/** 시·분 + 시간 모름 */
export function TimeFields({ idPrefix, time, known, onChange }: { idPrefix: string; time: string; known: boolean; onChange: (time: string, known: boolean) => void }) {
  const [h, m] = time ? time.split(':') : ['', ''];
  const set = (hh: string, mm: string) => onChange(`${String(hh || 0).padStart(2, '0')}:${String(mm || 0).padStart(2, '0')}`, true);
  return (
    <div className="time-grid">
      <Picker id={`${idPrefix}-hour`} label="시" placeholder="시" value={h ? String(Number(h)) : ''} groups={HOURS} onChange={(v) => set(v, m ?? '0')} disabled={!known} />
      <Picker id={`${idPrefix}-minute`} label="분" placeholder="분" value={m ? String(Number(m)) : ''} groups={MINUTES} onChange={(v) => set(h ?? '0', v)} disabled={!known} align="right" />
      <button type="button" className="choice" aria-pressed={!known} onClick={() => onChange(time, !known)} style={{ minHeight: 58, borderRadius: 12 }}>
        시간 모름
      </button>
    </div>
  );
}

export function BirthFields({ value, onChange, idPrefix, hideTime = false }: { value: BirthDraft; onChange: (v: BirthDraft) => void; idPrefix: string; hideTime?: boolean }) {
  const set = (patch: Partial<BirthDraft>) => onChange({ ...value, ...patch });
  const days = value.calendar === 'lunar' ? 30 : 31;
  return (
    <div className="stack" style={{ gap: 22 }}>
      <Field label="생년월일">
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
          <div className="date-grid">
            <Picker id={`${idPrefix}-year`} label="연도" placeholder="연도" value={value.year} groups={YEARS} onChange={(year) => set({ year })} display={(v) => `${v}년`} />
            <Picker id={`${idPrefix}-month`} label="월" placeholder="월" value={value.month} groups={MONTHS} onChange={(month) => set({ month })} />
            <Picker id={`${idPrefix}-day`} label="일" placeholder="일" value={value.day} groups={dayGroups(days)} onChange={(day) => set({ day })} display={(v) => `${v}일`} align="right" />
          </div>
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

// ── 성씨 ───────────────────────────────────────────────
type InitSurname = Surname & { strokes: number; meaning: string };

/** 사전 뜻 중 '성 ○'이 아닌 첫 뜻 (큐레이션 목록에 없을 때만 씀) */
function fallbackHun(meaning: string): string {
  const segs = meaning.split(/[,/]/).map((x) => x.trim()).filter(Boolean);
  return segs.find((x) => !/^성(씨)?\s/.test(x)) ?? segs[0] ?? '';
}

export function SurnamePicker({ value, onChange, label }: { value: SurnameSel | null; onChange: (v: SurnameSel | null) => void; label?: string }) {
  const init = useInit();
  const [text, setText] = useState(value?.hangul ?? '');
  const t = text.trim();
  const matches = useMemo<InitSurname[]>(() => {
    if (!init || !t) return [];
    return init.surnames.filter((s) => s.hangul === t || s.readings.includes(t) || s.hanja === t);
  }, [init, t]);
  const pick = (s: InitSurname, bongwan?: string) => onChange({ hangul: s.hanja === t ? s.hangul : t, hanja: s.hanja, ...(bongwan ? { bongwan } : {}) });

  useEffect(() => {
    if (matches.length === 1 && value?.hanja !== matches[0]!.hanja) pick(matches[0]!);
    // 하나뿐이면 자동 선택
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches]);

  const selected = matches.find((s) => s.hanja === value?.hanja) ?? null;
  const clans = selected ? (surnameInfo(selected.hanja)?.clans ?? []) : [];
  const customValue = value?.bongwan && !clans.includes(value.bongwan) ? value.bongwan : '';
  const [custom, setCustom] = useState(Boolean(customValue));
  const [customText, setCustomText] = useState(customValue);
  const setClan = (b: string | undefined) => selected && pick(selected, b);

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
        setCustom(false);
        onChange(null);
      }}
    />
  );
  return (
    <div className="stack" style={{ gap: 26 }}>
      {label ? (
        <Field label={label} htmlFor="surname">
          {input}
        </Field>
      ) : (
        input
      )}
      {matches.length > 0 ? (
        <div className="field">
          <span className="label">{matches.length > 1 ? `‘${t}’ 씨는 한자가 ${matches.length}가지예요` : '한자'}</span>
          <div className="opt-list" role="radiogroup" aria-label="성씨 한자">
            {matches.map((s) => {
              const info = surnameInfo(s.hanja);
              const top = info?.clans.slice(0, 3) ?? [];
              return (
                <button key={s.hanja} type="button" role="radio" aria-checked={value?.hanja === s.hanja} className="opt-row" onClick={() => pick(s)}>
                  <span className="opt-hanja">{s.hanja}</span>
                  <span className="opt-text">
                    <b>{info?.hun ?? fallbackHun(s.meaning)}</b>
                    <small>
                      {s.strokes}획{top.length ? ` · ${top.join('·')}${(info?.clans.length ?? 0) > 3 ? ' 등' : ''}` : ''}
                    </small>
                  </span>
                  <span className="opt-check" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {selected ? (
        <div className="field">
          <span className="label">
            본관 <span style={{ fontWeight: 500, color: 'var(--text-3)' }}>· 고르지 않아도 돼요</span>
          </span>
          <div className="chips" role="group" aria-label="본관">
            {clans.map((c) => (
              <button
                key={c}
                type="button"
                className="choice"
                aria-pressed={value?.bongwan === c}
                onClick={() => {
                  setCustom(false);
                  setClan(value?.bongwan === c ? undefined : c);
                }}
              >
                {c}
              </button>
            ))}
            <button
              type="button"
              className="choice"
              aria-pressed={custom}
              onClick={() => {
                setCustom(!custom);
                setCustomText('');
                setClan(undefined);
              }}
            >
              {clans.length ? '목록에 없어요' : '직접 입력'}
            </button>
          </div>
          {custom ? (
            <input
              id="bongwan"
              className="input"
              placeholder="본관을 한글로 (예: 김해)"
              maxLength={6}
              value={customText}
              onChange={(e) => {
                const v = e.target.value.replace(/[^가-힣ㄱ-ㅎㅏ-ㅣ]/g, '');
                setCustomText(v);
                setClan(/^[가-힣]+$/.test(v) ? v : undefined);
              }}
            />
          ) : null}
          <p className="tiny muted">본관은 점수에 영향을 주지 않고, 결과에 ‘{value ? surnameLabel(value) : `${t}씨`}’로 적혀요.</p>
        </div>
      ) : null}
      {t && init && matches.length === 0 ? <p className="small muted">목록에 없는 성씨예요. 다른 표기(이/리, 유/류)로 찾아보세요.</p> : null}
    </div>
  );
}

// ── 학설·계산 설정 ─────────────────────────────────────
export function SchoolOptionsPanel({ school, saju, onSchool, onSaju }: { school: SchoolOptions; saju: SajuOptions; onSchool: (v: SchoolOptions) => void; onSaju: (v: SajuOptions) => void }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <Field label="소리오행 기준">
        <Segmented
          label="소리오행 기준"
          value={school.soundSchool}
          options={[
            { value: 'haerye', label: '해례본 (훈민정음 원전)' },
            { value: 'unhae', label: '운해본 (작명소 관행)' },
          ]}
          onChange={(v) => onSchool({ ...school, soundSchool: v })}
        />
      </Field>
      <Switch checked={school.strictMode} onChange={(v) => onSchool({ ...school, strictMode: v })} title="나쁜 획수·부딪히는 소리 이름 빼기" desc="추천에서 아쉬운 이름을 미리 걸러요" />
      <Switch checked={Boolean(school.bothSchoolsNoClash)} onChange={(v) => onSchool({ ...school, bothSchoolsNoClash: v })} title="두 학설 모두 소리가 부딪히지 않게" />
      <Switch checked={school.femaleStrongNumbers} onChange={(v) => onSchool({ ...school, femaleStrongNumbers: v })} title="여아에게 강한 수(21·23·33·39) 피하기" />
      <Switch checked={school.excludeBulyong} onChange={(v) => onSchool({ ...school, excludeBulyong: v })} title="옛 작명에서 피하던 한자 빼기" />
      <Switch checked={school.includeFinalConsonant} onChange={(v) => onSchool({ ...school, includeFinalConsonant: v })} title="받침 소리까지 보기" />
      <Switch checked={saju.trueSolarTime} onChange={(v) => onSaju({ ...saju, trueSolarTime: v })} title="태어난 지역의 실제 해 시간으로 보정" desc="서울은 약 32분 늦춰 계산해요" />
      <Switch checked={saju.equationOfTime} onChange={(v) => onSaju({ ...saju, equationOfTime: v })} title="계절별 해 시간 차이(균시차)까지 보정" />
      <Field label="밤 11시~자정에 태어났다면">
        <Segmented
          label="자시 처리"
          value={saju.ziHour}
          options={[
            { value: 'nextDay', label: '다음 날로 보기' },
            { value: 'yaJasi', label: '그날로 보기' },
          ]}
          onChange={(v) => onSaju({ ...saju, ziHour: v })}
        />
      </Field>
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
        <button type="button" className="hanja-opt" aria-pressed={value === null} onClick={() => onChange(null)}>
          <span className="big">{syllable}</span>
          <span className="m">한글만</span>
        </button>
        {shown.map((o) => (
          <button key={o.ch} type="button" className="hanja-opt" aria-pressed={value === o.ch} onClick={() => onChange(o.ch)}>
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
