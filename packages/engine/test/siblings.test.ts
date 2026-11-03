import { describe, expect, it } from 'vitest';
import { analyzeSiblings, nameDistinctness, recommendSiblingSets, type ChildInput } from '../src/siblings/siblings';
import { DEFAULT_SCHOOL_OPTIONS } from '../src/name/analyze';
import { DEFAULT_SAJU_OPTIONS } from '../src/saju/pillars';
import { DEFAULT_PREFERENCES } from '../src/recommend/recommend';

const surname = [{ hangul: '김', hanja: '金' }];
const birth = (h: number, m: number) => ({ calendar: 'solar' as const, year: 2026, month: 4, day: 2, time: { hour: h, minute: m }, placeId: 'seoul' });
const twins: ChildInput[] = [
  { label: '첫째', gender: 'female', birth: birth(10, 5) },
  { label: '둘째', gender: 'female', birth: birth(10, 9) },
];

describe('다둥이', () => {
  it('구별도: 서윤/서연은 서윤/도하보다 낮다', () => {
    expect(nameDistinctness('서윤', '서연')).toBeLessThan(nameDistinctness('서윤', '도하'));
    expect(nameDistinctness('서윤', '서윤')).toBe(0);
  });

  it('기존 이름 궁합 분석', () => {
    const r = analyzeSiblings(surname, [
      { ...twins[0]!, given: [{ hangul: '하', hanja: '河' }, { hangul: '윤', hanja: '潤' }] },
      { ...twins[1]!, given: [{ hangul: '도', hanja: '道' }, { hangul: '윤', hanja: '潤' }] },
    ], DEFAULT_SAJU_OPTIONS, DEFAULT_SCHOOL_OPTIONS);
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0]!.score).toBeGreaterThanOrEqual(0);
    expect(r.pairs[0]!.score).toBeLessThanOrEqual(100);
    expect(r.pairs[0]!.notes.length).toBeGreaterThan(0);
    expect(r.children.every((c) => c.report !== null && c.saju !== null)).toBe(true);
  });

  const sets = recommendSiblingSets(surname, twins, DEFAULT_PREFERENCES, DEFAULT_SAJU_OPTIONS, DEFAULT_SCHOOL_OPTIONS, 10);
  it('쌍둥이 세트 추천: 10개 이하, 세트 안에 같은 이름 없음', () => {
    expect(sets.length).toBeGreaterThan(0);
    expect(sets.length).toBeLessThanOrEqual(10);
    for (const s of sets) expect(new Set(s.names.map((n) => n.hangul)).size).toBe(s.names.length);
  });
  it('세트 점수 내림차순, 결정적', () => {
    const scores = sets.map((s) => s.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    const again = recommendSiblingSets(surname, twins, DEFAULT_PREFERENCES, DEFAULT_SAJU_OPTIONS, DEFAULT_SCHOOL_OPTIONS, 10);
    expect(again.map((s) => s.names.map((n) => n.hanja).join())).toEqual(sets.map((s) => s.names.map((n) => n.hanja).join()));
  });
  it('이미 이름이 있는 아이는 그 이름으로 고정', () => {
    const r = recommendSiblingSets(surname, [
      { label: '첫째', gender: 'male', birth: null, given: [{ hangul: '도', hanja: '道' }, { hangul: '윤', hanja: '潤' }] },
      { label: '둘째', gender: 'female', birth: birth(10, 5) },
    ], DEFAULT_PREFERENCES, DEFAULT_SAJU_OPTIONS, DEFAULT_SCHOOL_OPTIONS, 5);
    expect(r.length).toBeGreaterThan(0);
    for (const s of r) expect(s.names[0]!.hangul).toBe('김도윤');
  });
});

describe('세트 중복', () => {
  it('같은 이름 조합을 순서만 바꾼 세트는 한 번만 보여 준다', () => {
    const kids = [0, 1, 2].map((i) => ({ label: String(i), gender: 'female' as const, birth: birth(8, 10 + i) }));
    const r = recommendSiblingSets(surname, kids, DEFAULT_PREFERENCES, DEFAULT_SAJU_OPTIONS, DEFAULT_SCHOOL_OPTIONS, 10);
    const keys = r.map((s) => s.names.map((n) => n.hanja).sort().join('|'));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
