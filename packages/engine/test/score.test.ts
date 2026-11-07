import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { analyzeName, DEFAULT_SCHOOL_OPTIONS, type NameInput } from '../src/name/analyze';
import { analyzePillars } from '../src/saju/analysis';
import { BRANCHES, STEMS, type Pillar } from '../src/core/ganji';
import { hanjaByReading, isNameHanja } from '../src/name/hanjaDb';

const p = (s: string): Pillar => ({ stem: STEMS.indexOf(s[0] as never), branch: BRANCHES.indexOf(s[1] as never) });
// 신약, 용신 水, 희신 木, 기신 土
const saju = analyzePillars({ year: p('庚申'), month: p('庚子'), day: p('甲申'), hour: p('辛酉') });
const kim = [{ hangul: '김', hanja: '金' }];

const input = (given: { hangul: string; hanja: string | null }[], gender: NameInput['gender'] = 'female'): NameInput => ({
  surname: kim, given, gender,
});

describe('이름 분석·채점', () => {
  const report = analyzeName(input([{ hangul: '하', hanja: '河' }, { hangul: '윤', hanja: '潤' }]), saju);

  it('결정적: 같은 입력 두 번 → 같은 결과', () => {
    expect(analyzeName(input([{ hangul: '하', hanja: '河' }, { hangul: '윤', hanja: '潤' }]), saju)).toEqual(report);
  });
  it('총점 0..100, 등급, 분석코드, 버전', () => {
    expect(report.score.total).toBeGreaterThanOrEqual(0);
    expect(report.score.total).toBeLessThanOrEqual(100);
    expect(['S', 'A', 'B', 'C', 'D']).toContain(report.score.grade);
    expect(report.analysisCode).toMatch(/^[0-9A-F]{8}$/);
    expect(report.engineVersion).toBe('1.11.0');
    expect(report.score.partial).toBe(false);
  });
  it('배점 상한: 자원30 수리25 음령20 음양10 실용15', () => {
    const s = report.score;
    expect(s.resource).toBeLessThanOrEqual(30);
    expect(s.suri).toBeLessThanOrEqual(25);
    expect(s.sound).toBeLessThanOrEqual(20);
    expect(s.yinyang).toBeLessThanOrEqual(10);
    expect(s.practical).toBeLessThanOrEqual(15);
  });
  it('용신(水) 한자의 자원오행 점수 > 기신(土) 한자', () => {
    const water = analyzeName(input([{ hangul: '하', hanja: '河' }]), saju);
    const earth = analyzeName(input([{ hangul: '곤', hanja: '坤' }]), saju);
    expect(water.score.resource).toBeGreaterThan(earth.score.resource);
  });
  it('두 학설 음령오행을 모두 계산', () => {
    expect(report.soundBySchool.haerye.pairs.length).toBe(2);
    expect(report.soundBySchool.unhae.pairs.length).toBe(2);
  });
  it('흉수가 있으면 엄격 기준 불통과: 金一一 → 원격 2(흉)', () => {
    const r = analyzeName(input([{ hangul: '일', hanja: '一' }, { hangul: '일', hanja: '一' }]), saju);
    expect(r.frames?.won).toBe(2);
    expect(r.score.passesStrict).toBe(false);
  });
  it('hangul-only partial: 한자 없는 글자는 부분 분석', () => {
    const r = analyzeName(input([{ hangul: '뷁', hanja: null }]), saju);
    expect(r.score.partial).toBe(true);
    expect(r.frames).toBeNull();
    expect(r.score.total).toBeGreaterThanOrEqual(0);
  });
  it('사주 없이도 분석된다', () => {
    const r = analyzeName(input([{ hangul: '하', hanja: '河' }, { hangul: '윤', hanja: '潤' }]), null);
    expect(r.score.total).toBeGreaterThan(0);
    expect(r.warnings.some((w) => w.includes('사주'))).toBe(true);
  });
  it('여성 강수 옵션: 21·23·33·39가 있으면 경고', () => {
    // 金(8) + 13획 → 형격 21
    const ch = hanjaByReading('서').find((h) => h.strokes === 13 && isNameHanja(h));
    expect(ch).toBeDefined();
    const r = analyzeName(input([{ hangul: '서', hanja: ch?.ch ?? null }]), saju, { ...DEFAULT_SCHOOL_OPTIONS, femaleStrongNumbers: true });
    expect(r.warnings.some((w) => w.includes('강한 수'))).toBe(true);
  });
  it('잘못된 입력은 RangeError', () => {
    expect(() => analyzeName(input([]), saju)).toThrow(RangeError);
    expect(() => analyzeName(input([{ hangul: 'ab', hanja: null }]), saju)).toThrow(RangeError);
  });
  it('근거 문장이 4대 요소 모두에 있다', () => {
    const areas = new Set(report.reasons.map((r) => r.area));
    for (const a of ['resource', 'suri', 'sound', 'yinyang']) expect(areas.has(a as never)).toBe(true);
  });
  it('속성: 임의 음절·한자 조합에서 예외 없이 0..100', () => {
    const sylls = ['서', '하', '윤', '지', '민', '도', '준', '아', '은', '연'];
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...sylls), { minLength: 1, maxLength: 3 }), fc.nat(), (syl, seed) => {
        const given = syl.map((s, i) => {
          const list = hanjaByReading(s, { initial: i === 0 });
          const h = list.length ? list[(seed + i) % list.length] : undefined;
          return { hangul: s, hanja: h ? h.ch : null };
        });
        const r = analyzeName(input(given), saju);
        return r.score.total >= 0 && r.score.total <= 100;
      }),
      { numRuns: 80, seed: 7 },
    );
  });
});
