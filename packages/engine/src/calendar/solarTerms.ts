import { Body, HourAngle, MakeTime, Observer, SearchSunLongitude, SunPosition } from 'astronomy-engine';

const DAY = 86_400_000;

/** 12절(節)의 태양황경. index 0=입춘(寅월 시작) … 11=소한(丑월 시작) */
export const JIE_LONGITUDES = [315, 345, 15, 45, 75, 105, 135, 165, 195, 225, 255, 285] as const;
export const JIE_NAMES = ['입춘', '경칩', '청명', '입하', '망종', '소서', '입추', '백로', '한로', '입동', '대설', '소한'] as const;

/** 해당 순간의 태양 겉보기 황경(도) */
export function sunLongitude(utcMs: number): number {
  return SunPosition(MakeTime(new Date(utcMs))).elon;
}

function search(lon: number, startMs: number, limitDays: number): number {
  const t = SearchSunLongitude(lon, MakeTime(new Date(startMs)), limitDays);
  if (!t) throw new RangeError('SOLAR_TERM_NOT_FOUND');
  return t.date.getTime();
}

/** year년의 termIndex번째 절입 순간(UTC ms). 소한(11)은 year+1년 1월. */
export function jieInstantUtc(year: number, termIndex: number): number {
  const lon = JIE_LONGITUDES[termIndex];
  if (lon === undefined) throw new RangeError('INVALID_TERM_INDEX');
  // 절입일은 양력 (termIndex+2)월 3~9일 사이
  return search(lon, Date.UTC(year, termIndex + 1, 1), 15);
}

export const lichunUtc = (year: number): number => jieInstantUtc(year, 0);

/** 해당 순간이 속한 절월 index(0=寅월) */
export function jieMonthIndex(utcMs: number): number {
  return Math.floor((((sunLongitude(utcMs) - 315) % 360) + 360) % 360 / 30);
}

/** 가장 가까운 절입. before=true면 아직 오지 않은(다음) 절입이다. */
export function nearestJie(utcMs: number): { termIndex: number; utcMs: number; before: boolean } {
  const idx = jieMonthIndex(utcMs);
  const prevIdx = idx;
  const nextIdx = (idx + 1) % 12;
  const prev = search(JIE_LONGITUDES[prevIdx] as number, utcMs - 40 * DAY, 41);
  const next = search(JIE_LONGITUDES[nextIdx] as number, utcMs, 40);
  return next - utcMs < utcMs - prev
    ? { termIndex: nextIdx, utcMs: next, before: true }
    : { termIndex: prevIdx, utcMs: prev, before: false };
}

/** 경도 기준 평균태양시의 UTC 대비 오프셋(분) */
export const meanSolarOffsetMin = (lon: number): number => lon * 4;

/** 균시차를 포함한 진태양시의 UTC 대비 오프셋(분) */
export function apparentSolarOffsetMin(utcMs: number, lon: number): number {
  const ha = HourAngle(Body.Sun, MakeTime(new Date(utcMs)), new Observer(37.5, lon, 0));
  const solarMin = ((ha + 12) % 24) * 60;
  const utcMin = (((utcMs % DAY) + DAY) % DAY) / 60_000;
  let diff = solarMin - utcMin;
  while (diff > 720) diff -= 1440;
  while (diff < -720) diff += 1440;
  return diff;
}
