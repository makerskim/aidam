import { describe, expect, it } from 'vitest';
import { fromJdn, isValidSolarDate, jdn } from '../src/calendar/julian';
import { seoulOffsetSecAt, seoulWallToUtcMs } from '../src/calendar/seoulTime';
import { jieInstantUtc, lichunUtc, nearestJie, sunLongitude, apparentSolarOffsetMin, meanSolarOffsetMin } from '../src/calendar/solarTerms';
import { lunarToSolar } from '../src/calendar/lunar';
import { PLACES, findPlace } from '../src/calendar/places';

const MIN = 60_000;
const kst = (y: number, m: number, d: number, h: number, mi: number) => Date.UTC(y, m - 1, d, h - 9, mi);

describe('율리우스일', () => {
  it('2000-01-01 = 2451545', () => expect(jdn(2000, 1, 1)).toBe(2451545));
  it('왕복', () => {
    for (const j of [2415021, 2451545, 2460000, 2488069]) {
      const d = fromJdn(j);
      expect(jdn(d.year, d.month, d.day)).toBe(j);
    }
  });
  it('날짜 유효성', () => {
    expect(isValidSolarDate(2024, 2, 29)).toBe(true);
    expect(isValidSolarDate(2023, 2, 29)).toBe(false);
    expect(isValidSolarDate(2025, 13, 1)).toBe(false);
  });
});

describe('서울 표준시 이력', () => {
  it('현재 UTC+9', () => expect(seoulWallToUtcMs(2024, 1, 1, 9, 0)).toBe(Date.UTC(2024, 0, 1, 0, 0)));
  it('1955년 여름 서머타임 UTC+9:30', () => {
    expect(seoulWallToUtcMs(1955, 6, 1, 0, 0)).toBe(Date.UTC(1955, 5, 1, 0, 0) - 9.5 * 3600_000);
  });
  it('1987년 서머타임 UTC+10', () => expect(seoulOffsetSecAt(Date.UTC(1987, 6, 1))).toBe(36000));
  it('1960년 겨울 UTC+8:30', () => expect(seoulOffsetSecAt(Date.UTC(1960, 0, 1))).toBe(30600));
});

describe('절기', () => {
  it.each([
    [2024, kst(2024, 2, 4, 17, 27)],
    [2025, kst(2025, 2, 3, 23, 10)],
    [2026, kst(2026, 2, 4, 5, 2)],
  ])('%i 입춘 시각(±2분)', (y, expected) => {
    expect(Math.abs(lichunUtc(y) - expected)).toBeLessThanOrEqual(2 * MIN);
  });
  it('입춘 순간의 태양황경은 315°', () => {
    expect(sunLongitude(lichunUtc(2024))).toBeCloseTo(315, 3);
  });
  it('소한(termIndex 11)은 다음 해 1월', () => {
    const t = new Date(jieInstantUtc(2024, 11));
    expect(t.getUTCFullYear()).toBe(2025);
    expect(t.getUTCMonth()).toBe(0);
  });
  it('nearestJie: 입춘 10분 전이면 다음 절기가 입춘', () => {
    const r = nearestJie(lichunUtc(2024) - 10 * MIN);
    expect(r.termIndex).toBe(0);
    expect(r.before).toBe(true);
    expect(Math.abs(r.utcMs - lichunUtc(2024))).toBeLessThan(1000);
  });
});

describe('태양시 보정', () => {
  it('서울 평균태양시는 표준시보다 약 32분 늦다', () => {
    expect(meanSolarOffsetMin(126.98) - 540).toBeCloseTo(-32.08, 1);
  });
  it('균시차 포함 진태양시 오프셋은 평균태양시와 ±17분 이내', () => {
    for (const m of [0, 3, 6, 9]) {
      const t = Date.UTC(2024, m, 15, 3, 0);
      expect(Math.abs(apparentSolarOffsetMin(t, 126.98) - meanSolarOffsetMin(126.98))).toBeLessThan(17);
    }
  });
});

describe('음력', () => {
  it('음력 2025-01-01 = 양력 2025-01-29', () => {
    expect(lunarToSolar(2025, 1, 1, false)).toEqual({ year: 2025, month: 1, day: 29 });
  });
  it('윤달: 음력 2025 윤6월 1일 = 양력 2025-07-25', () => {
    expect(lunarToSolar(2025, 6, 1, true)).toEqual({ year: 2025, month: 7, day: 25 });
  });
  it('invalid lunar: 2월 30일, 없는 윤달은 RangeError', () => {
    expect(() => lunarToSolar(2025, 2, 30, false)).toThrow(RangeError);
    expect(() => lunarToSolar(2025, 3, 1, true)).toThrow(RangeError);
    expect(() => lunarToSolar(2051, 1, 1, false)).toThrow(RangeError);
  });
});

describe('출생지', () => {
  it('서울 경도 126.98', () => {
    expect(findPlace('seoul')?.lon).toBeCloseTo(126.98, 2);
    expect(PLACES.length).toBeGreaterThanOrEqual(16);
  });
});
