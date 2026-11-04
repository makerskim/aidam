import { describe, expect, it } from 'vitest';
import { recommendNames, DEFAULT_PREFERENCES } from '../src/recommend/recommend';
import { SYLLABLES, POPULAR_NAMES, FAMILIAR_HANJA, AWKWARD_NAMES, COMMON_NAMES, DISTINCT_NAMES } from '../src/recommend/syllables';
import { isPositiveMeaning } from '../src/name/safety';
import { applyDueum } from '../src/hangul/dueum';
import { analyzeName, DEFAULT_SCHOOL_OPTIONS } from '../src/name/analyze';
import { analyzePillars } from '../src/saju/analysis';
import { BRANCHES, STEMS, type Pillar } from '../src/core/ganji';
import { getHanja, isNameHanja } from '../src/name/hanjaDb';

const p = (s: string): Pillar => ({ stem: STEMS.indexOf(s[0] as never), branch: BRANCHES.indexOf(s[1] as never) });
const saju = analyzePillars({ year: p('庚申'), month: p('庚子'), day: p('甲申'), hour: p('辛酉') });
const base = {
  surname: [{ hangul: '김', hanja: '金' }],
  gender: 'female' as const,
  saju,
  prefs: DEFAULT_PREFERENCES,
  options: DEFAULT_SCHOOL_OPTIONS,
  limit: 30,
};

describe('음절 풀', () => {
  it('성별·위치별 음절과 인기 이름이 있다', () => {
    expect(SYLLABLES.first.female.length).toBeGreaterThanOrEqual(30);
    expect(SYLLABLES.second.male.length).toBeGreaterThanOrEqual(30);
    expect(POPULAR_NAMES.female).toContain('서아');
  });
});

describe('추천', () => {
  const recs = recommendNames(base);

  it('결과는 limit 이하이고 비어 있지 않다', () => {
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.length).toBeLessThanOrEqual(30);
  });
  it('결정적: 두 번 호출해도 같다', () => {
    expect(recommendNames(base).map((r) => r.hanja)).toEqual(recs.map((r) => r.hanja));
  });
  it('모든 한자는 인명용이고 부정 뜻이 아니다', () => {
    for (const r of recs) for (const ch of r.hanja.slice(1)) {
      const h = getHanja(ch);
      expect(h && isNameHanja(h)).toBe(true);
      expect(h?.negative).toBe(false);
    }
  });
  it('엄격 모드: 4격 흉수·음령 상극 없음', () => {
    for (const r of recs) {
      expect(r.report.frameResults.every((f) => f.info.luck !== 'bad')).toBe(true);
      expect(r.report.score.passesStrict).toBe(true);
    }
  });
  it('점수 내림차순', () => {
    const totals = recs.map((r) => r.report.score.total);
    expect([...totals].sort((a, b) => b - a)).toEqual(totals);
  });
  it('추천 점수 = 같은 이름을 직접 풀어 본 점수 (이름 느낌을 바꿔도)', () => {
    for (const style of ['popular', 'unique'] as const) {
      const list = recommendNames({ ...base, prefs: { ...DEFAULT_PREFERENCES, style } });
      for (const r of list.slice(0, 10)) {
        const given = [...r.hangul.slice(1)].map((h, i) => ({ hangul: h, hanja: r.hanja.slice(1)[i] ?? null }));
        const solo = analyzeName({ surname: base.surname, given, gender: base.gender }, saju, base.options);
        expect(solo.score.total).toBe(r.report.score.total);
      }
    }
  });
  it('한글 이름당 한자 조합은 최대 2개', () => {
    const count = new Map<string, number>();
    for (const r of recs) count.set(r.hangul, (count.get(r.hangul) ?? 0) + 1);
    expect(Math.max(...count.values())).toBeLessThanOrEqual(2);
  });
  it('돌림자 고정 위치 준수', () => {
    const r = recommendNames({ ...base, prefs: { ...DEFAULT_PREFERENCES, fixed: { position: 1, hangul: '윤', hanja: '潤' } } });
    expect(r.length).toBeGreaterThan(0);
    for (const x of r) {
      expect(x.hangul.endsWith('윤')).toBe(true);
      expect(x.hanja.endsWith('潤')).toBe(true);
    }
  });
  it('피할 음절은 나오지 않는다', () => {
    const r = recommendNames({ ...base, prefs: { ...DEFAULT_PREFERENCES, exclude: ['서', '윤'] } });
    for (const x of r) expect(/[서윤]/.test(x.hangul.slice(1))).toBe(false);
  });
  it('외자 이름', () => {
    const r = recommendNames({ ...base, prefs: { ...DEFAULT_PREFERENCES, length: 1 } });
    expect(r.length).toBeGreaterThan(0);
    for (const x of r) expect([...x.hangul]).toHaveLength(2);
  });
  it('사주 없이도 추천', () => {
    expect(recommendNames({ ...base, saju: null }).length).toBeGreaterThan(0);
  });
});

describe('어색한 이름 거르기', () => {
  const jeong = [{ hangul: '정', hanja: '鄭' }];
  for (const gender of ['female', 'male', 'unknown'] as const) {
    it(`${gender}: 낱말처럼 들리는 이름(하지·지하·이유·하수…)이 없다`, () => {
      const recs = recommendNames({ ...base, surname: jeong, gender, limit: 100 });
      expect(recs.length).toBeGreaterThan(40);
      for (const r of recs) expect(AWKWARD_NAMES.has(r.hangul.slice(1))).toBe(false);
    });
  }
  it('이름 느낌과 상관없이 실제로 쓰는 이름 목록 안에서만 고른다', () => {
    const known = new Set([...COMMON_NAMES.female, ...POPULAR_NAMES.female, ...DISTINCT_NAMES.female]);
    for (const style of ['popular', 'balanced', 'unique'] as const) {
      const recs = recommendNames({ ...base, surname: jeong, prefs: { ...DEFAULT_PREFERENCES, style }, limit: 100 });
      expect(recs.length).toBeGreaterThan(40);
      for (const r of recs) expect(known.has(r.hangul.slice(1))).toBe(true);
    }
  });
  it('흔하지 않은 이름은 인기 이름을 덜 앞세운다', () => {
    const top = (style: 'popular' | 'unique') =>
      recommendNames({ ...base, surname: jeong, prefs: { ...DEFAULT_PREFERENCES, style }, limit: 100 })
        .slice(0, 30)
        .filter((r) => POPULAR_NAMES.female.includes(r.hangul.slice(1))).length;
    expect(top('unique')).toBeLessThanOrEqual(top('popular'));
  });
  it('성과 이름 첫 글자가 같은 이름(정정우)은 없다', () => {
    const recs = recommendNames({ ...base, surname: jeong, gender: 'male', limit: 100 });
    for (const r of recs) expect(r.hangul[1]).not.toBe('정');
  });
  it('많이 쓰는 이름 목록에 낱말 이름이 섞여 있지 않다', () => {
    for (const n of [...COMMON_NAMES.female, ...COMMON_NAMES.male]) expect(AWKWARD_NAMES.has(n)).toBe(false);
  });
});

describe('추천 한자 품질', () => {
  const recs = recommendNames({ ...base, limit: 60 });
  const male = recommendNames({ ...base, gender: 'male', limit: 60 });
  it('뜻(훈)이 없는 희귀 한자는 추천하지 않는다', () => {
    for (const r of [...recs, ...male]) for (const ch of r.hanja.slice(1)) expect(getHanja(ch)?.meaning, ch).not.toBe('');
  });
  it('이름에 흔히 쓰거나 좋은 뜻인 한자만 추천한다(교육용이라는 이유만으로는 안 됨)', () => {
    for (const r of [...recs, ...male]) for (const ch of r.hanja.slice(1)) {
      const h = getHanja(ch);
      expect(h && (FAMILIAR_HANJA.has(ch) || isPositiveMeaning(h.meaning)), `${ch} ${h?.meaning}`).toBe(true);
    }
  });
  it('어색한 조합 차단: 균형 스타일은 흔한 음절끼리(가중치 합 4 이상) 또는 인기 이름만', () => {
    for (const r of [...recs, ...male]) expect(['김나별', '김담별', '김담비'], r.hangul).not.toContain(r.hangul);
  });
  it('헐뜯을(誹)·비상(砒)은 부정 뜻', () => {
    expect(getHanja('誹')?.negative).toBe(true);
    expect(getHanja('砒')?.negative).toBe(true);
  });
});

describe('좋은 뜻 판정', () => {
  it('"큰 자라"(黿)처럼 꾸미는 말만 좋은 경우는 좋은 뜻이 아니다', () => {
    expect(isPositiveMeaning(getHanja('黿')?.meaning ?? '')).toBe(false);
    expect(isPositiveMeaning('클 태')).toBe(true);
  });
  it('諭(고할 유)는 친숙 한자 목록에 없다', () => expect(FAMILIAR_HANJA.has('諭')).toBe(false));
});

describe('대표음 일치', () => {
  it('추천 한자의 대표음(첫 음)이 그 음절과 같다(첫 자는 두음법칙 허용)', () => {
    const recs = recommendNames({ ...base, limit: 80 });
    for (const r of recs) {
      [...r.hanja.slice(1)].forEach((ch, i) => {
        const h = getHanja(ch);
        const syl = [...r.hangul][i + 1] as string;
        const primary = h?.readings[0] ?? '';
        expect(primary === syl || (i === 0 && applyDueum(primary) === syl), `${ch} ${h?.readings} ${syl}`).toBe(true);
      });
    }
  });
});

describe('외자 + 흉수 성씨', () => {
  it('남궁(19획) 외자: 이격(=성 획수)은 이름으로 못 바꾸므로 엄격 기준에서 빼고 안내한다', () => {
    const r = recommendNames({ ...base, surname: [{ hangul: '남', hanja: '南' }, { hangul: '궁', hanja: '宮' }], prefs: { ...DEFAULT_PREFERENCES, length: 1 } });
    expect(r.length).toBeGreaterThan(0);
    expect(r[0]!.report.warnings.some((w) => w.includes('이격'))).toBe(true);
  });
});

describe('검토 보완', () => {
  it('두 학설 모두 상극 없음 옵션: 해례본·운해본 어느 쪽에도 상극이 없다', () => {
    const r = recommendNames({ ...base, options: { ...DEFAULT_SCHOOL_OPTIONS, bothSchoolsNoClash: true } });
    expect(r.length).toBeGreaterThan(0);
    for (const x of r) {
      expect(x.report.soundBySchool.haerye.pairs.some((p) => p.kind === 'clash')).toBe(false);
      expect(x.report.soundBySchool.unhae.pairs.some((p) => p.kind === 'clash')).toBe(false);
    }
  });
  it('넣고 싶은 소리·피할 소리는 10개까지만 반영(조작된 링크로 계산 폭증 방지)', () => {
    const many = Array.from({ length: 400 }, (_, i) => String.fromCodePoint(0xac00 + i * 7));
    const include = ['서', '하', ...many];
    const first10 = include.slice(0, 10);
    const r = recommendNames({ ...base, prefs: { ...DEFAULT_PREFERENCES, style: 'unique', include }, limit: 60 });
    for (const x of r) expect([...x.hangul.slice(1)].some((s) => first10.includes(s)), x.hangul).toBe(true);
  });
});
