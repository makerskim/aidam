/**
 * 만세력 기준 대조 테스트.
 * - 일진: 한국천문연구원(KASI) 음양력 데이터를 담은 korean-lunar-calendar의 일진과 매일 대조
 * - 절입 시각: 공표된 절입 시각(한국 표준시, 분 단위)과 ±2분 이내
 * - 골든 케이스: 정해진 입력 → 정해진 사주(알고리즘이 바뀌면 여기서 바로 드러난다)
 */
import { describe, expect, it } from 'vitest';
import KoreanLunarCalendar from 'korean-lunar-calendar';
import { addDays, jdn } from '../src/calendar/julian';
import { jieInstantUtc } from '../src/calendar/solarTerms';
import { computePillars, type BirthInput, type SajuOptions } from '../src/saju/pillars';
import { pillarFromCycle, STEMS, BRANCHES, type Pillar } from '../src/core/ganji';

const name = (p: Pillar | null) => (p ? `${STEMS[p.stem]}${BRANCHES[p.branch]}` : '—');
const four = (b: BirthInput, o?: SajuOptions) => {
  const { pillars: p } = computePillars(b, o);
  return [p.year, p.month, p.day, p.hour].map(name).join(' ');
};
const solar = (y: number, m: number, d: number, time: [number, number] | null, placeId = 'seoul'): BirthInput => ({
  calendar: 'solar', year: y, month: m, day: d, time: time ? { hour: time[0], minute: time[1] } : null, placeId,
});
const NO_CORRECTION: SajuOptions = { trueSolarTime: false, equationOfTime: false, ziHour: 'nextDay' };

describe('일진: 한국천문연구원 데이터와 매일 대조', () => {
  it('1900-02-01 ~ 2050-12-31 모든 날의 일주가 같다', () => {
    const cal = new KoreanLunarCalendar();
    let d = { year: 1900, month: 2, day: 1 };
    const end = jdn(2050, 12, 31);
    let checked = 0;
    const mismatches: string[] = [];
    while (jdn(d.year, d.month, d.day) <= end) {
      cal.setSolarDate(d.year, d.month, d.day);
      const idx = cal.getGapJaIndex();
      const ours = pillarFromCycle(jdn(d.year, d.month, d.day) + 49);
      if (ours.stem !== idx.cheongan.day || ours.branch !== idx.ganji.day) mismatches.push(`${d.year}-${d.month}-${d.day}`);
      checked += 1;
      d = addDays(d, 1);
    }
    expect(checked).toBeGreaterThan(55000);
    expect(mismatches).toEqual([]);
  });
});

describe('절입 시각: 공표값(한국 표준시)과 ±2분', () => {
  // 한국천문연구원 역서 기준으로 널리 공표된 값
  const published: [number, number, string][] = [
    [2024, 0, '2024-02-04T17:27'], // 입춘
    [2025, 0, '2025-02-03T23:10'], // 입춘
    [2026, 0, '2026-02-04T05:02'], // 입춘
    [2026, 1, '2026-03-05T22:58'], // 경칩
    [2026, 2, '2026-04-05T03:39'], // 청명
    [2026, 3, '2026-05-05T20:48'], // 입하
  ];
  for (const [year, term, kst] of published) {
    it(`${kst} KST`, () => {
      const expected = Date.parse(`${kst}:00+09:00`);
      expect(Math.abs(jieInstantUtc(year, term) - expected)).toBeLessThanOrEqual(2 * 60_000);
    });
  }
});

describe('골든 케이스 (연 월 일 시)', () => {
  const cases: [string, BirthInput, SajuOptions | undefined, string][] = [
    ['2000-01-01 정오, 보정 없음', solar(2000, 1, 1, [12, 0]), NO_CORRECTION, '己卯 丙子 戊午 戊午'],
    ['입춘 직전 2024-02-04 17:20', solar(2024, 2, 4, [17, 20]), NO_CORRECTION, '癸卯 乙丑 戊戌 辛酉'],
    ['입춘 직후 2024-02-04 17:35', solar(2024, 2, 4, [17, 35]), NO_CORRECTION, '甲辰 丙寅 戊戌 辛酉'],
    ['설날 2024-02-10 09:00 서울(지역 보정 −32분)', solar(2024, 2, 10, [9, 0]), undefined, '甲辰 丙寅 甲辰 戊辰'],
    ['2026-03-14 09:30 부산(보정 −24분)', solar(2026, 3, 14, [9, 30], 'busan'), undefined, '丙午 辛卯 丁亥 乙巳'],
    // 2000-01-06은 소한(08시경) 이후라 丑월. 다음 날(01-07)이 甲子일
    ['자시 23:50 — 다음 날로 보는 기본값', solar(2000, 1, 6, [23, 50]), NO_CORRECTION, '己卯 丁丑 甲子 甲子'],
    ['자시 23:50 — 야자시', solar(2000, 1, 6, [23, 50]), { ...NO_CORRECTION, ziHour: 'yaJasi' }, '己卯 丁丑 癸亥 甲子'],
    // 서머타임을 빼지 않으면 13:30 → 未시가 된다
    ['1988-07-01 13:30 서머타임(UTC+10) → 표준시 12:30 午시', solar(1988, 7, 1, [13, 30]), NO_CORRECTION, '戊辰 戊午 丁巳 丙午'],
    ['1955-06-01 13:20 서머타임(UTC+9:30) → 표준시(UTC+8:30) 12:20 午시', solar(1955, 6, 1, [13, 20]), NO_CORRECTION, '乙未 辛巳 癸巳 戊午'],
    ['음력 2024-01-01 = 양력 2024-02-10, 시간 모름', { calendar: 'lunar', year: 2024, month: 1, day: 1, isLeapMonth: false, time: null, placeId: 'seoul' }, undefined, '甲辰 丙寅 甲辰 —'],
  ];
  for (const [label, birth, opts, expected] of cases) {
    it(label, () => expect(four(birth, opts)).toBe(expected));
  }

  it('같은 입력은 언제나 같은 결과 (1000번 반복)', () => {
    const b = solar(2026, 3, 14, [9, 30], 'busan');
    const first = JSON.stringify(computePillars(b));
    for (let i = 0; i < 1000; i++) expect(JSON.stringify(computePillars(b))).toBe(first);
  });
});
