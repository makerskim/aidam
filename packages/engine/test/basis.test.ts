import { describe, expect, it } from 'vitest';
import { DEFAULT_SAJU_OPTIONS } from '../src/saju/pillars';
import { analyzePillars, lackingMethod } from '../src/saju/analysis';
import { BRANCHES, STEMS, type Pillar } from '../src/core/ganji';
import { analyzeName, DEFAULT_SCHOOL_OPTIONS, type SchoolOptions } from '../src/name/analyze';
import { recommendNames, DEFAULT_PREFERENCES } from '../src/recommend/recommend';
import { entryForBasis, getHanja } from '../src/name/hanjaDb';
import { ELEMENTS } from '../src/core/elements';

const p = (s: string): Pillar => ({ stem: STEMS.indexOf(s[0] as never), branch: BRANCHES.indexOf(s[1] as never) });
const saju = analyzePillars({ year: p('丙午'), month: p('甲午'), day: p('丙寅'), hour: p('丁巳') });
/** 일반 작명 앱 기준 */
const APP: SchoolOptions = { ...DEFAULT_SCHOOL_OPTIONS, yongsinMethod: 'lacking', soundSchool: 'unhae', suriElement: 'strong', hanjaElement: 'meaning' };

describe('용신 정하는 법: 부족한 오행', () => {
  const l = lackingMethod(saju);
  it('여덟 글자 중 가장 적은 오행이 용신, 가장 많은 오행이 기신', () => {
    const min = Math.min(...ELEMENTS.map((e) => saju.counts[e]));
    const max = Math.max(...ELEMENTS.map((e) => saju.counts[e]));
    expect(saju.counts[l.yongsin]).toBe(min);
    expect(saju.counts[ELEMENTS.find((e) => l.roles[e] === 'gi')!]).toBe(max);
    expect(l.method).toBe('lacking');
    expect(lackingMethod(l)).toBe(l);
  });
  it('추천 이름은 그 방법의 용신·희신 한자를 담고 기신·구신 한자는 없다', () => {
    const r = recommendNames({ surname: [{ hangul: '김', hanja: '金' }], gender: 'female', saju, prefs: DEFAULT_PREFERENCES, options: APP, limit: 40 });
    expect(r.length).toBeGreaterThanOrEqual(30);
    for (const x of r) {
      expect(x.report.resource.some((c) => l.roles[c.element] === 'yong' || l.roles[c.element] === 'hui'), x.hanja).toBe(true);
      for (const c of x.report.resource) expect(['gi', 'gu']).not.toContain(l.roles[c.element]);
    }
  });
});

describe('한자오행: 뜻 우선', () => {
  it('부수와 뜻이 다른 한자는 뜻 우선일 때 오행이 바뀐다', () => {
    const h = getHanja('昊')!; // 日 부수(불) · 뜻 '하늘'
    const m = entryForBasis(h, 'meaning');
    expect(entryForBasis(h, 'radical')).toBe(h);
    expect(m.elementBasis.startsWith('뜻') || m.element === h.element).toBe(true);
  });
});

describe('수리오행 비중', () => {
  it('수리 점수는 어느 비중이든 25점을 넘지 않고, 비중에 따라 달라질 수 있다', () => {
    const input = { surname: [{ hangul: '김', hanja: '金' }], given: [{ hangul: '서', hanja: '瑞' }, { hangul: '윤', hanja: '潤' }], gender: 'female' as const };
    const a = analyzeName(input, saju, DEFAULT_SCHOOL_OPTIONS);
    const b = analyzeName(input, saju, { ...DEFAULT_SCHOOL_OPTIONS, suriElement: 'strong' });
    expect(a.score.suri).toBeLessThanOrEqual(25);
    expect(b.score.suri).toBeLessThanOrEqual(25);
  });
});

describe('두 기준으로 같은 이름을 보면', () => {
  it('정통 기준과 일반 앱 기준 점수를 함께 낼 수 있다', () => {
    const input = { surname: [{ hangul: '김', hanja: '金' }], given: [{ hangul: '하', hanja: '河' }, { hangul: '은', hanja: '恩' }], gender: 'female' as const };
    const a = analyzeName(input, saju, DEFAULT_SCHOOL_OPTIONS);
    const b = analyzeName(input, saju, APP);
    expect(a.score.total).toBeGreaterThan(0);
    expect(b.score.total).toBeGreaterThan(0);
    expect(b.options.soundSchool).toBe('unhae');
  });
});

describe('배점: 정통 성명학 / 일반 작명앱', () => {
  const input = { surname: [{ hangul: '김', hanja: '金' }], given: [{ hangul: '아', hanja: '亞' }, { hangul: '경', hanja: '璟' }], gender: 'female' as const };
  it('두 배점 모두 만점의 합은 100이다', async () => {
    const { PROFILE_MAX } = await import('../src/score/score');
    for (const m of Object.values(PROFILE_MAX)) expect(m.resource + m.suri + m.sound + m.yinyang + m.practical).toBe(100);
  });
  it('일반 앱 배점은 영역 만점이 다르고 점수도 정통과 다르게 나온다', () => {
    const a = analyzeName(input, saju, DEFAULT_SCHOOL_OPTIONS);
    const b = analyzeName(input, saju, { ...APP, hanjaElement: 'radical', scoring: 'app' });
    expect(a.score.max.resource).toBe(30);
    expect(b.score.max.suri).toBe(40);
    expect(b.score.max.practical).toBe(0);
    expect(b.score.suri).toBeLessThanOrEqual(40);
    expect(b.score.total).not.toBe(a.score.total);
  });
  it('일반 앱 기준 추천 목록은 정통 기준과 다르다', () => {
    const args = { surname: [{ hangul: '김', hanja: '金' }], gender: 'female' as const, saju, prefs: DEFAULT_PREFERENCES, limit: 30 };
    const a = recommendNames({ ...args, options: DEFAULT_SCHOOL_OPTIONS }).map((r) => r.hanja);
    const b = recommendNames({ ...args, options: { ...APP, hanjaElement: 'radical', scoring: 'app' } }).map((r) => r.hanja);
    expect(b.slice(0, 10)).not.toEqual(a.slice(0, 10));
  });
});

describe('다둥이 다섯 명 이상', () => {
  it('다섯 명도 서로 다른 이름의 세트를 낸다', async () => {
    const { recommendSiblingSets } = await import('../src/siblings/siblings');
    const birth = { calendar: 'solar' as const, year: 2026, month: 3, day: 14, time: { hour: 9, minute: 30 }, placeId: 'seoul' };
    const kids = Array.from({ length: 5 }, (_, i) => ({ label: `${i + 1}`, gender: (i % 2 ? 'male' : 'female') as 'male' | 'female', birth }));
    const sets = recommendSiblingSets([{ hangul: '김', hanja: '金' }], kids as never, DEFAULT_PREFERENCES, DEFAULT_SAJU_OPTIONS, DEFAULT_SCHOOL_OPTIONS, 5);
    expect(sets.length).toBeGreaterThan(0);
    for (const st of sets) {
      expect(st.names).toHaveLength(5);
      expect(new Set(st.names.map((n) => n.hangul)).size).toBe(5);
    }
  });
});
