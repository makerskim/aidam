import { describe, expect, it } from 'vitest';
import { analyzePillars } from '../src/saju/analysis';
import { branchRelations, stemRelation } from '../src/saju/relations';
import { computeSaju } from '../src/saju';
import { ELEMENTS } from '../src/core/elements';
import { BRANCHES, STEMS, type Pillar } from '../src/core/ganji';
import type { Pillars } from '../src/saju/pillars';

const p = (s: string): Pillar => ({ stem: STEMS.indexOf(s[0] as never), branch: BRANCHES.indexOf(s[1] as never) });
const pillars = (y: string, m: string, d: string, h: string | null): Pillars => ({
  year: p(y), month: p(m), day: p(d), hour: h ? p(h) : null,
});

describe('사주 분석', () => {
  const weak = analyzePillars(pillars('庚申', '庚子', '甲申', '辛酉'));
  const strong = analyzePillars(pillars('庚寅', '甲寅', '甲寅', '乙卯'));

  it('세력 합은 100', () => {
    const sum = ELEMENTS.reduce((s, e) => s + weak.power[e], 0);
    expect(sum).toBeCloseTo(100, 5);
  });
  it('favor는 5개 오행 모두 −1..1', () => {
    for (const e of ELEMENTS) {
      expect(weak.favor[e]).toBeGreaterThanOrEqual(-1);
      expect(weak.favor[e]).toBeLessThanOrEqual(1);
    }
  });
  it('용·희·한·구·기 역할은 서로 다른 오행', () => {
    for (const a of [weak, strong]) {
      expect(new Set(Object.values(a.roles)).size).toBe(5);
      expect(a.roles[a.yongsin]).toBe('yong');
      expect(a.roles[a.huisin]).toBe('hui');
    }
  });
  it('일간 甲·월지 子·관성 강함 → 신약, 용신 水(인성), 희신 木', () => {
    expect(weak.dayMaster).toBe('wood');
    expect(['weak', 'veryWeak']).toContain(weak.strength.level);
    expect(weak.yongsin).toBe('water');
    expect(weak.huisin).toBe('wood');
    expect(weak.reasoning.length).toBeGreaterThan(0);
  });
  it('비겁 우세 신강 → 용신 金(관성)', () => {
    expect(['strong', 'veryStrong']).toContain(strong.strength.level);
    expect(strong.yongsin).toBe('metal');
    expect(strong.favor.metal).toBe(1);
    expect(strong.favor.wood).toBeLessThan(0);
  });
  it('겨울생 火 부족 → 조후 火', () => {
    expect(weak.johu).toBe('fire');
  });
  it('시간 모름(3주)은 80 → 100 정규화', () => {
    const a = analyzePillars(pillars('庚申', '庚子', '甲申', null));
    expect(ELEMENTS.reduce((s, e) => s + a.power[e], 0)).toBeCloseTo(100, 5);
  });
});

describe('합충', () => {
  it('子午 충, 子丑 육합, 申子 삼합, 子未 원진·해', () => {
    expect(branchRelations(0, 6)).toContain('chung');
    expect(branchRelations(0, 1)).toContain('yukhap');
    expect(branchRelations(8, 0)).toContain('samhap');
    expect(branchRelations(0, 7)).toEqual(expect.arrayContaining(['wonjin', 'hae']));
  });
  it('甲己 천간합', () => {
    expect(stemRelation(0, 5)).toBe('hap');
    expect(stemRelation(0, 2)).toBe('generates');
  });
});

describe('computeSaju', () => {
  it('시간 모름 → 12시진 투표 합 12, 신뢰도 0..1', () => {
    const r = computeSaju({ calendar: 'solar', year: 2024, month: 6, day: 1, time: null, placeId: 'seoul' });
    const votes = Object.values(r.unknownTime?.votes ?? {}).reduce((a, b) => a + b, 0);
    expect(votes).toBe(12);
    expect(r.unknownTime?.confidence).toBeGreaterThan(0);
    expect(r.primary.pillars.hour).toBeNull();
  });
  it('진태양시로 시주가 바뀌면 보정 없는 대안을 함께 준다', () => {
    const r = computeSaju({ calendar: 'solar', year: 2024, month: 6, day: 1, time: { hour: 11, minute: 20 }, placeId: 'seoul' });
    expect(r.alternatives.some((a) => a.label.includes('보정'))).toBe(true);
  });
  it('결정적: 같은 입력 → 같은 결과', () => {
    const b = { calendar: 'solar' as const, year: 2025, month: 3, day: 15, time: { hour: 8, minute: 5 }, placeId: 'busan' };
    expect(computeSaju(b)).toEqual(computeSaju(b));
  });
});
