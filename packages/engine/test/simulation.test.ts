/**
 * 전체 작명 시스템 시뮬레이션. 시드가 고정된 의사 난수로 출생·성씨·성별·느낌·글자 수·돌림자·계산 기준을 고르고,
 * 어떤 입력에서도 지켜야 할 규칙(불변식)을 확인한다. 실패하면 입력을 메시지에 남겨 그대로 재현할 수 있다.
 */
import { describe, expect, it } from 'vitest';
import { computeSaju, DEFAULT_SAJU_OPTIONS, PLACES, SURNAMES } from '../src';
import { recommendNames, DEFAULT_PREFERENCES, fitsGender, type Preferences } from '../src/recommend/recommend';
import { analyzeName, DEFAULT_SCHOOL_OPTIONS, type SchoolOptions } from '../src/name/analyze';
import { gradeOf } from '../src/score/score';
import { getHanja, hanjaByReading, isNameHanja, MID_LIQUID } from '../src/name/hanjaDb';
import { applyDueum } from '../src/hangul/dueum';
import { sajuForMethod } from '../src/saju/analysis';
import { AWKWARD_NAMES } from '../src/recommend/syllables';
import { HANJA_STORY } from '../src/name/stories';
import { ELEMENTS } from '../src/core/elements';

/** 재현 가능한 의사 난수 (mulberry32) */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)] as T;

const CLASSIC: SchoolOptions = DEFAULT_SCHOOL_OPTIONS;
const PRACTICAL: SchoolOptions = { ...DEFAULT_SCHOOL_OPTIONS, yongsinMethod: 'lacking', soundSchool: 'unhae', scoring: 'app' };
const COMMON_SURNAMES = SURNAMES.filter((s) => s.common && [...s.hanja].length === 1).slice(0, 40);
const STORY_FIXED = [...HANJA_STORY.keys()].map((ch) => getHanja(ch)!).filter((h) => h && isNameHanja(h) && !h.negative);

function readingOk(ch: string, syl: string, initial: boolean): boolean {
  const h = getHanja(ch);
  if (!h) return false;
  const p = h.readings[0] ?? '';
  return h.readings.includes(syl) || p === syl || (initial && applyDueum(p) === syl) || (!initial && MID_LIQUID[syl] === p);
}

describe('시뮬레이션: 출생·성씨·성별·느낌·글자 수·돌림자·기준 무작위 160가지', () => {
  const r = rng(20261105);
  const cases = Array.from({ length: 160 }, (_, i) => {
    const year = 1950 + Math.floor(r() * 81);
    const month = 1 + Math.floor(r() * 12);
    const day = 1 + Math.floor(r() * 28);
    const known = r() > 0.15;
    const birth = { calendar: 'solar' as const, year, month, day, time: known ? { hour: Math.floor(r() * 24), minute: Math.floor(r() * 60) } : null, placeId: pick(r, PLACES).id };
    const sur = pick(r, COMMON_SURNAMES);
    const gender = pick(r, ['female', 'male', 'unknown'] as const);
    const length = r() < 0.15 ? 1 : 2;
    let fixed: Preferences['fixed'];
    if (length === 2 && r() < 0.2) {
      const h = pick(r, STORY_FIXED);
      const position = r() < 0.5 ? 0 : 1;
      const reading = h.readings[0] ?? '';
      fixed = { position, hangul: position === 0 ? applyDueum(reading) : reading, hanja: h.ch };
    }
    const prefs: Preferences = { ...DEFAULT_PREFERENCES, length, style: pick(r, ['popular', 'balanced', 'unique'] as const), ...(fixed ? { fixed } : {}) };
    const options = r() < 0.5 ? CLASSIC : PRACTICAL;
    return { i, birth, sur, gender, prefs, options };
  });

  it('모든 경우에서 규칙을 지킨다', () => {
    const problems: string[] = [];
    for (const c of cases) {
      const tag = `#${c.i} ${JSON.stringify({ b: c.birth, s: c.sur.hanja, g: c.gender, p: c.prefs, o: c.options.scoring ?? 'classic' })}`;
      const saju = computeSaju(c.birth, DEFAULT_SAJU_OPTIONS);
      const a = saju.primary;
      // 사주: 세력 합 100, 용·희·기·구·한 다섯 역할이 하나씩
      const sum = ELEMENTS.reduce((s, e) => s + a.power[e], 0);
      if (Math.abs(sum - 100) > 0.01) problems.push(`${tag} 세력 합 ${sum}`);
      const m = sajuForMethod(a, c.options.yongsinMethod)!;
      if (new Set(Object.values(m.roles)).size !== 5) problems.push(`${tag} 역할 중복 ${JSON.stringify(m.roles)}`);

      const args = { surname: [{ hangul: c.sur.hangul, hanja: c.sur.hanja }], gender: c.gender, saju: a, prefs: c.prefs, options: c.options, limit: 40 };
      const recs = recommendNames(args);
      if (recs.length === 0) problems.push(`${tag} 추천 0개`);
      // 재현성: 같은 입력이면 같은 결과
      const again = recommendNames(args).map((x) => x.hanja).join(',');
      if (again !== recs.map((x) => x.hanja).join(',')) problems.push(`${tag} 같은 입력인데 결과가 다름`);
      // 점수순, 중복 없음
      for (let k = 1; k < recs.length; k++) if (recs[k]!.report.score.total > recs[k - 1]!.report.score.total) problems.push(`${tag} 점수순 아님 @${k}`);
      if (new Set(recs.map((x) => x.hanja)).size !== recs.length) problems.push(`${tag} 같은 이름 중복`);
      for (const x of recs) {
        const s = x.report.score;
        const given = x.report.input.given;
        const g = given.map((q) => q.hangul).join('');
        // 점수 범위·등급·영역 만점
        if (!(s.total >= 0 && s.total <= 100) || s.grade !== gradeOf(s.total)) problems.push(`${tag} ${x.hanja} 점수 ${s.total} ${s.grade}`);
        const mx = s.max;
        if (mx.resource + mx.suri + mx.sound + mx.yinyang + mx.practical !== 100) problems.push(`${tag} 만점 합`);
        for (const k of ['resource', 'suri', 'sound', 'yinyang', 'practical'] as const) if (s[k] > mx[k] + 1e-9 || s[k] < 0) problems.push(`${tag} ${x.hanja} ${k} ${s[k]}/${mx[k]}`);
        // 같은 이름을 직접 풀어 보면 같은 점수
        const solo = analyzeName({ surname: args.surname, given, gender: c.gender }, a, c.options);
        if (Math.abs(solo.score.total - s.total) > 1e-9) problems.push(`${tag} ${x.hanja} 풀이 점수 ${solo.score.total} ≠ ${s.total}`);
        // 글자 수·한자·소리
        if (given.length !== c.prefs.length) problems.push(`${tag} ${x.hangul} 글자 수`);
        given.forEach((q, gi) => {
          const h = q.hanja ? getHanja(q.hanja) : undefined;
          if (!h || !isNameHanja(h)) problems.push(`${tag} ${x.hanja} 인명용 아님 ${q.hanja}`);
          else if (h.negative && !(c.prefs.fixed && c.prefs.fixed.hanja === h.ch)) problems.push(`${tag} ${x.hanja} 부정 뜻 ${q.hanja}`);
          if (q.hanja && !readingOk(q.hanja, q.hangul, gi === 0)) problems.push(`${tag} ${x.hanja} 소리 ${q.hanja}≠${q.hangul}`);
        });
        // 이름 거르기
        if (AWKWARD_NAMES.has(g)) problems.push(`${tag} 어색한 이름 ${g}`);
        const fixedLast = c.prefs.fixed && c.prefs.fixed.position === given.length - 1;
        if (!fixedLast && !fitsGender(g, c.gender)) problems.push(`${tag} 성별 ${g}`);
        if (c.prefs.fixed) {
          const fp = Math.min(c.prefs.fixed.position, given.length - 1);
          if (given[fp]?.hanja !== c.prefs.fixed.hanja) problems.push(`${tag} 돌림자 ${x.hanja}`);
        }
        // 기신·구신 한자 없음(돌림자 글자는 부모가 정했으므로 예외)
        for (const rc of x.report.resource) {
          if (c.prefs.fixed && rc.ch === c.prefs.fixed.hanja) continue;
          if (m.roles[rc.element] === 'gi' || m.roles[rc.element] === 'gu') problems.push(`${tag} ${x.hanja} 기신·구신 ${rc.ch}`);
        }
      }
    }
    expect(problems.slice(0, 15)).toEqual([]);
  }, 240000);
});

describe('시뮬레이션: 직접 넣은 이름 풀이 400가지', () => {
  it('어떤 이름·한자 조합이든 오류 없이 범위 안의 점수를 낸다', () => {
    const r = rng(7);
    const SYL = '가나다라마바사아자차카타파하서윤지민하은도현준우수연예린채원시율'.split('');
    const problems: string[] = [];
    for (let i = 0; i < 400; i++) {
      const sur = pick(r, COMMON_SURNAMES);
      const n = 1 + Math.floor(r() * 2);
      const given = Array.from({ length: n }, (_, k) => {
        const syl = pick(r, SYL);
        const opts = hanjaByReading(syl, { initial: k === 0 });
        return { hangul: syl, hanja: r() < 0.85 && opts.length ? pick(r, opts).ch : null };
      });
      const birth = { calendar: 'solar' as const, year: 1990 + Math.floor(r() * 40), month: 1 + Math.floor(r() * 12), day: 1 + Math.floor(r() * 28), time: { hour: Math.floor(r() * 24), minute: 0 }, placeId: 'seoul' };
      const saju = r() < 0.8 ? computeSaju(birth).primary : null;
      for (const options of [CLASSIC, PRACTICAL]) {
        try {
          const rep = analyzeName({ surname: [{ hangul: sur.hangul, hanja: sur.hanja }], given, gender: pick(r, ['female', 'male', 'unknown'] as const) }, saju, options);
          const s = rep.score;
          if (!Number.isFinite(s.total) || s.total < 0 || s.total > 100 || s.grade !== gradeOf(s.total)) problems.push(`${JSON.stringify(given)} ${s.total}`);
        } catch (e) {
          problems.push(`${JSON.stringify(given)} 오류 ${(e as Error).message}`);
        }
      }
    }
    expect(problems.slice(0, 10)).toEqual([]);
  }, 120000);
});

describe('시뮬레이션: 다둥이 세트 24가지 (2~6명)', () => {
  it('세트 안의 이름은 서로 다르고, 세트는 점수 높은 순이며, 같은 입력이면 같은 결과', async () => {
    const { recommendSiblingSets } = await import('../src/siblings/siblings');
    const r = rng(42);
    const problems: string[] = [];
    for (let i = 0; i < 24; i++) {
      const n = 2 + Math.floor(r() * 5);
      const base = { calendar: 'solar' as const, year: 2000 + Math.floor(r() * 30), month: 1 + Math.floor(r() * 12), day: 1 + Math.floor(r() * 28), placeId: 'seoul' };
      const kids = Array.from({ length: n }, (_, k) => ({ label: `${k + 1}`, gender: pick(r, ['female', 'male'] as const), birth: { ...base, time: { hour: 8 + Math.floor(r() * 3), minute: Math.floor(r() * 60) } } }));
      const sur = [{ hangul: pick(r, COMMON_SURNAMES).hangul, hanja: '' }];
      const s0 = pick(r, COMMON_SURNAMES);
      sur[0] = { hangul: s0.hangul, hanja: s0.hanja };
      const options = r() < 0.5 ? CLASSIC : PRACTICAL;
      const run = () => recommendSiblingSets(sur, kids as never, DEFAULT_PREFERENCES, DEFAULT_SAJU_OPTIONS, options, 5);
      const sets = run();
      const tag = `#${i} n=${n} ${s0.hanja} ${options.scoring ?? 'classic'}`;
      if (!sets.length) problems.push(`${tag} 세트 0개`);
      for (let k = 1; k < sets.length; k++) if (sets[k]!.score > sets[k - 1]!.score) problems.push(`${tag} 세트 점수순 아님`);
      for (const st of sets) if (new Set(st.names.map((x) => x.hangul)).size !== n) problems.push(`${tag} 세트 안 같은 이름`);
      if (run().map((st) => st.names.map((x) => x.hanja).join('|')).join(',') !== sets.map((st) => st.names.map((x) => x.hanja).join('|')).join(',')) problems.push(`${tag} 재현 안 됨`);
    }
    expect(problems).toEqual([]);
  }, 240000);
});
