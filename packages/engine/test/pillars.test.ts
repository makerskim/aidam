import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { computePillars, pillarsForHourBranch, DEFAULT_SAJU_OPTIONS, type BirthInput, type SajuOptions } from '../src/saju/pillars';
import { pillarHanja } from '../src/core/ganji';

const OFF: SajuOptions = { trueSolarTime: false, equationOfTime: false, ziHour: 'nextDay' };
const solar = (y: number, m: number, d: number, hour: number | null, minute = 0): BirthInput => ({
  calendar: 'solar', year: y, month: m, day: d, time: hour === null ? null : { hour, minute }, placeId: 'seoul',
});

describe('사주팔자', () => {
  it('2000-01-01 일주 = 戊午', () => {
    expect(pillarHanja(computePillars(solar(2000, 1, 1, 12), OFF).pillars.day)).toBe('戊午');
  });
  it('lichun boundary: 2024-02-04 17:00 → 癸卯년, 18:00 → 甲辰년', () => {
    expect(pillarHanja(computePillars(solar(2024, 2, 4, 17), OFF).pillars.year)).toBe('癸卯');
    expect(pillarHanja(computePillars(solar(2024, 2, 4, 18), OFF).pillars.year)).toBe('甲辰');
  });
  it('월주: 2024-02-10 → 丙寅월', () => {
    expect(pillarHanja(computePillars(solar(2024, 2, 10, 12), OFF).pillars.month)).toBe('丙寅');
  });
  it('시주: 甲일(2000-01-07) 00:30 → 甲子시', () => {
    const r = computePillars(solar(2000, 1, 7, 0, 30), OFF);
    expect(pillarHanja(r.pillars.day)).toBe('甲子');
    expect(r.pillars.hour && pillarHanja(r.pillars.hour)).toBe('甲子');
  });
  it('ziHour boundary: 23:50 출생은 옵션에 따라 일주가 달라진다', () => {
    const next = computePillars(solar(2024, 5, 5, 23, 50), OFF);
    const ya = computePillars(solar(2024, 5, 5, 23, 50), { ...OFF, ziHour: 'yaJasi' });
    const may6 = computePillars(solar(2024, 5, 6, 12), OFF);
    const may5 = computePillars(solar(2024, 5, 5, 12), OFF);
    expect(next.pillars.day).toEqual(may6.pillars.day);
    expect(ya.pillars.day).toEqual(may5.pillars.day);
    expect(next.pillars.hour?.branch).toBe(0);
    expect(ya.pillars.hour).toEqual(next.pillars.hour);
  });
  it('진태양시: 서울 11:20 → −32분 → 巳시, 보정 끄면 午시', () => {
    const on = computePillars(solar(2024, 6, 1, 11, 20), DEFAULT_SAJU_OPTIONS);
    const off = computePillars(solar(2024, 6, 1, 11, 20), OFF);
    expect(on.pillars.hour?.branch).toBe(5);
    expect(off.pillars.hour?.branch).toBe(6);
    expect(on.correctionMin).toBeCloseTo(-32, 0);
    expect(on.flags.nearHourBoundary).toBe(true);
  });
  it('시간 모름 → 시주 없음', () => {
    expect(computePillars(solar(2024, 6, 1, null), DEFAULT_SAJU_OPTIONS).pillars.hour).toBeNull();
  });
  it('음력 입력: 음력 2025-01-01 = 양력 2025-01-29', () => {
    const r = computePillars({ ...solar(2025, 1, 1, 12), calendar: 'lunar', isLeapMonth: false }, OFF);
    expect(r.solar).toEqual({ year: 2025, month: 1, day: 29 });
  });
  it('잘못된 날짜·시간은 RangeError', () => {
    expect(() => computePillars(solar(2023, 2, 29, 12), OFF)).toThrow(RangeError);
    expect(() => computePillars(solar(2023, 2, 1, 24), OFF)).toThrow(RangeError);
    expect(() => computePillars(solar(1899, 12, 31, 12), OFF)).toThrow(RangeError);
  });
  it('12시진 시나리오: 子시는 branch 0', () => {
    expect(pillarsForHourBranch(solar(2024, 6, 1, null), 0, DEFAULT_SAJU_OPTIONS).pillars.hour?.branch).toBe(0);
    expect(pillarsForHourBranch(solar(2024, 6, 1, null), 11, DEFAULT_SAJU_OPTIONS).pillars.hour?.branch).toBe(11);
  });
  it('속성: 1900~2100 임의 일시에서 예외 없음', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1900, max: 2100 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 }),
        fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }), fc.boolean(),
        (y, m, d, h, mi, tst) => {
          const r = computePillars(solar(y, m, d, h, mi), { ...DEFAULT_SAJU_OPTIONS, trueSolarTime: tst });
          return r.pillars.month.branch >= 0 && r.pillars.hour !== null;
        },
      ),
      { numRuns: 60, seed: 42 },
    );
  });
});
