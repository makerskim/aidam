import { describe, expect, it } from 'vitest';
import { HANJA_STORY } from '../src/name/stories';
import { getHanja, isNameHanja } from '../src/name/hanjaDb';
import { recommendNames, DEFAULT_PREFERENCES } from '../src/recommend/recommend';
import { DEFAULT_SCHOOL_OPTIONS } from '../src/name/analyze';
import { analyzePillars } from '../src/saju/analysis';
import { BRANCHES, STEMS, type Pillar } from '../src/core/ganji';

/** 받침 번호(0: 없음, 4: ㄴ, 8: ㄹ) */
const jong = (s: string) => {
  const c = s.charCodeAt(s.length - 1) - 0xac00;
  return c >= 0 && c < 11172 ? c % 28 : -1;
};

describe('이름 한자 이야기', () => {
  it('400개 가까이 있고, 모두 인명용 한자다', () => {
    expect(HANJA_STORY.size).toBeGreaterThanOrEqual(380);
    // 延(미칠 연)·鳴(울 명)은 자료에서 뜻풀이 낱말 때문에 부정 뜻으로 잡혀 추천에는 안 나오지만,
    // 이름에 흔히 쓰므로 직접 넣은 이름의 풀이를 위해 이야기는 둔다
    const flagged = new Set(['延', '鳴']);
    for (const ch of HANJA_STORY.keys()) {
      const h = getHanja(ch);
      expect(h, ch).toBeDefined();
      expect(h && isNameHanja(h) && (!h.negative || flagged.has(ch)), ch).toBe(true);
    }
  });
  it('문장 조각의 꼴이 맞다: 꾸밈말 ‘○○ㄴ/는/의’, 잇는 말 ‘○○고’, 바람 ‘○○길’', () => {
    for (const [ch, s] of HANJA_STORY) {
      expect(jong(s.adj) === 4 || s.adj.endsWith('의'), `${ch} ${s.adj}`).toBe(true);
      expect(s.and.endsWith('고'), `${ch} ${s.and}`).toBe(true);
      expect(s.wish.endsWith('길'), `${ch} ${s.wish}`).toBe(true);
      if (s.hun) expect(/^\S+( \S+)* \S$/.test(s.hun), `${ch} ${s.hun}`).toBe(true);
    }
  });
});

describe('추천 한자는 이야기가 있는 글자에서', () => {
  const p = (s: string): Pillar => ({ stem: STEMS.indexOf(s[0] as never), branch: BRANCHES.indexOf(s[1] as never) });
  const saju = analyzePillars({ year: p('丙午'), month: p('甲午'), day: p('丙寅'), hour: p('丁巳') });
  it('98% 이상이 이야기 사전 안의 한자이고, 수갑 추(杻) 같은 글자는 나오지 않는다', () => {
    let all = 0;
    let storied = 0;
    for (const sur of [{ hangul: '김', hanja: '金' }, { hangul: '박', hanja: '朴' }, { hangul: '정', hanja: '鄭' }]) for (const gender of ['female', 'male'] as const) {
      const r = recommendNames({ surname: [sur], gender, saju, prefs: DEFAULT_PREFERENCES, options: DEFAULT_SCHOOL_OPTIONS, limit: 100 });
      for (const x of r) for (const ch of [...x.hanja].slice(1)) {
        all++;
        if (HANJA_STORY.has(ch)) storied++;
        expect(['杻', '叟', '酉', '垸', '塗', '黽'], x.hanja).not.toContain(ch);
      }
    }
    expect(storied / all).toBeGreaterThanOrEqual(0.98);
  });
  it('추천은 30개 이상 나온다(돌림자가 있어도)', () => {
    for (const fixed of [undefined, { position: 1, hangul: '현', hanja: '炫' }, { position: 0, hangul: '규', hanja: '奎' }]) {
      const r = recommendNames({ surname: [{ hangul: '박', hanja: '朴' }], gender: 'male', saju, prefs: { ...DEFAULT_PREFERENCES, ...(fixed ? { fixed } : {}) }, options: DEFAULT_SCHOOL_OPTIONS, limit: 100 });
      expect(r.length, JSON.stringify(fixed)).toBeGreaterThanOrEqual(30);
    }
  });
});
