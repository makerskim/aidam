import { mod, type Pillar, pillarFromCycle } from '../core/ganji';
import { addDays, isValidSolarDate, jdn, type YMD } from '../calendar/julian';
import { lunarToSolar } from '../calendar/lunar';
import { findPlace } from '../calendar/places';
import { seoulOffsetSecAt, seoulWallToUtcMs } from '../calendar/seoulTime';
import { apparentSolarOffsetMin, jieMonthIndex, lichunUtc, meanSolarOffsetMin, nearestJie } from '../calendar/solarTerms';

export interface BirthInput {
  calendar: 'solar' | 'lunar';
  year: number;
  month: number;
  day: number;
  isLeapMonth?: boolean;
  /** 출생 시각(벽시계). 모르면 null */
  time: { hour: number; minute: number } | null;
  /** PLACES의 id. 해외 출생은 'custom' + customLon (+ utcOffsetMin) */
  placeId: string;
  customLon?: number;
  /** 해외 출생지의 표준시 오프셋(분). 없으면 서울 표준시 이력 사용 */
  utcOffsetMin?: number;
}

export interface SajuOptions {
  /** 출생지 경도로 진태양시 보정 */
  trueSolarTime: boolean;
  /** 균시차까지 반영 */
  equationOfTime: boolean;
  /** nextDay: 23시부터 다음 날 / yaJasi: 23~24시는 당일 일주 + 다음 날 자시 천간 */
  ziHour: 'nextDay' | 'yaJasi';
}

export const DEFAULT_SAJU_OPTIONS: SajuOptions = { trueSolarTime: true, equationOfTime: false, ziHour: 'nextDay' };

export interface Pillars {
  year: Pillar;
  month: Pillar;
  day: Pillar;
  hour: Pillar | null;
}

export interface LocalTime extends YMD {
  hour: number;
  minute: number;
}

export interface PillarsResult {
  pillars: Pillars;
  /** 양력 출생일 */
  solar: YMD;
  /** 출생 순간(UTC ms). 시간 모름이면 null */
  utcMs: number | null;
  /** 보정된 지방시(일주·시주 기준). 시간 모름이면 null */
  corrected: LocalTime | null;
  /** 벽시계 대비 보정량(분) */
  correctionMin: number;
  /** 절월 index (0=寅월) */
  monthTerm: number;
  flags: { nearHourBoundary: boolean; nearTermBoundary: boolean };
}

const MIN = 60_000;
const MIN_DATE = jdn(1900, 1, 1);
const MAX_DATE = jdn(2100, 12, 31);

function resolveSolar(b: BirthInput): YMD {
  const d = b.calendar === 'lunar' ? lunarToSolar(b.year, b.month, b.day, b.isLeapMonth ?? false) : { year: b.year, month: b.month, day: b.day };
  if (!isValidSolarDate(d.year, d.month, d.day)) throw new RangeError('INVALID_DATE');
  const j = jdn(d.year, d.month, d.day);
  if (j < MIN_DATE || j > MAX_DATE) throw new RangeError('DATE_OUT_OF_RANGE');
  return d;
}

function resolveLon(b: BirthInput): number {
  if (b.customLon !== undefined) {
    if (!Number.isFinite(b.customLon) || b.customLon < -180 || b.customLon > 180) throw new RangeError('INVALID_PLACE');
    return b.customLon;
  }
  const p = findPlace(b.placeId);
  if (!p) throw new RangeError('INVALID_PLACE');
  return p.lon;
}

/** 서머타임을 뺀 서울 표준시 오프셋(초) */
function standardOffsetSec(utcMs: number): number {
  const o = seoulOffsetSecAt(utcMs);
  if (o === 36000) return 32400;
  if (o === 34200) return 30600;
  return o;
}

function wallToUtc(b: BirthInput, d: YMD, hour: number, minute: number): number {
  if (b.utcOffsetMin !== undefined) return Date.UTC(d.year, d.month - 1, d.day, hour, minute) - b.utcOffsetMin * MIN;
  return seoulWallToUtcMs(d.year, d.month, d.day, hour, minute);
}

function toLocal(ms: number): LocalTime {
  const t = new Date(ms);
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate(), hour: t.getUTCHours(), minute: t.getUTCMinutes() };
}

const dayPillarOf = (d: YMD): Pillar => pillarFromCycle(jdn(d.year, d.month, d.day) + 49);

function yearMonth(utcMs: number, wallYear: number): { year: Pillar; month: Pillar; monthTerm: number } {
  const sajuYear = utcMs >= lichunUtc(wallYear) ? wallYear : wallYear - 1;
  const year = pillarFromCycle(sajuYear - 4);
  const monthTerm = jieMonthIndex(utcMs);
  const month: Pillar = { stem: mod((year.stem % 5) * 2 + 2 + monthTerm, 10), branch: mod(monthTerm + 2, 12) };
  return { year, month, monthTerm };
}

export function computePillars(birth: BirthInput, opts: SajuOptions = DEFAULT_SAJU_OPTIONS): PillarsResult {
  const solar = resolveSolar(birth);
  const lon = resolveLon(birth);

  if (!birth.time) {
    const noonUtc = wallToUtc(birth, solar, 12, 0);
    const ym = yearMonth(noonUtc, solar.year);
    const startUtc = wallToUtc(birth, solar, 0, 0);
    const jie = nearestJie(noonUtc);
    const termToday = jie.utcMs >= startUtc && jie.utcMs < startUtc + 1440 * MIN;
    return {
      pillars: { year: ym.year, month: ym.month, day: dayPillarOf(solar), hour: null },
      solar,
      utcMs: null,
      corrected: null,
      correctionMin: 0,
      monthTerm: ym.monthTerm,
      flags: { nearHourBoundary: false, nearTermBoundary: termToday },
    };
  }

  const { hour, minute } = birth.time;
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new RangeError('INVALID_TIME');
  }
  const utcMs = wallToUtc(birth, solar, hour, minute);
  const ym = yearMonth(utcMs, solar.year);

  const wallMs = Date.UTC(solar.year, solar.month - 1, solar.day, hour, minute);
  let localMs: number;
  if (opts.trueSolarTime) {
    const off = opts.equationOfTime ? apparentSolarOffsetMin(utcMs, lon) : meanSolarOffsetMin(lon);
    localMs = utcMs + Math.round(off * 60) * 1000;
  } else {
    const std = birth.utcOffsetMin !== undefined ? birth.utcOffsetMin * 60 : standardOffsetSec(utcMs);
    localMs = utcMs + std * 1000;
  }
  const corrected = toLocal(localMs);
  const correctionMin = Math.round((localMs - wallMs) / MIN);

  const localDate: YMD = { year: corrected.year, month: corrected.month, day: corrected.day };
  const lateZi = corrected.hour >= 23;
  const dayDate = lateZi && opts.ziHour === 'nextDay' ? addDays(localDate, 1) : localDate;
  const day = dayPillarOf(dayDate);

  const branch = Math.floor((corrected.hour * 60 + corrected.minute + 60) / 120) % 12;
  const stemBase = lateZi && opts.ziHour === 'yaJasi' ? dayPillarOf(addDays(localDate, 1)).stem : day.stem;
  const hourPillar: Pillar = { stem: mod((stemBase % 5) * 2 + branch, 10), branch };

  const minutesOfDay = corrected.hour * 60 + corrected.minute;
  const distToBoundary = Math.min(...[1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25].map((h) => Math.abs(minutesOfDay - h * 60)));
  const jie = nearestJie(utcMs);

  return {
    pillars: { year: ym.year, month: ym.month, day, hour: hourPillar },
    solar,
    utcMs,
    corrected,
    correctionMin,
    monthTerm: ym.monthTerm,
    flags: { nearHourBoundary: distToBoundary <= 30, nearTermBoundary: Math.abs(jie.utcMs - utcMs) <= 30 * MIN },
  };
}

/** 시간 모름일 때 12시진 시나리오: 보정 없이 해당 시진의 대표 시각(子=00:00, 丑=02:00 …)으로 계산 */
export function pillarsForHourBranch(birth: BirthInput, branch: number, opts: SajuOptions): PillarsResult {
  const b: BirthInput = { ...birth, time: { hour: mod(branch * 2, 24), minute: 0 } };
  return computePillars(b, { ...opts, trueSolarTime: false, equationOfTime: false });
}

