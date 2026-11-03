import KoreanLunarCalendar from 'korean-lunar-calendar';
import type { YMD } from './julian';

export const LUNAR_MIN_YEAR = 1900;
export const LUNAR_MAX_YEAR = 2050;

/** 음력 → 양력 (한국천문연구원 데이터). 잘못된 날짜·없는 윤달·범위 밖은 RangeError('INVALID_LUNAR_DATE') */
export function lunarToSolar(year: number, month: number, day: number, isLeapMonth: boolean): YMD {
  if (![year, month, day].every(Number.isInteger) || year < LUNAR_MIN_YEAR || year > LUNAR_MAX_YEAR) {
    throw new RangeError('INVALID_LUNAR_DATE');
  }
  const cal = new KoreanLunarCalendar();
  if (isLeapMonth && cal.getLunarIntercalationMonth(cal.getLunarData(year)) !== month) {
    throw new RangeError('INVALID_LUNAR_DATE');
  }
  if (!cal.setLunarDate(year, month, day, isLeapMonth)) throw new RangeError('INVALID_LUNAR_DATE');
  const s = cal.getSolarCalendar();
  return { year: s.year, month: s.month, day: s.day };
}
