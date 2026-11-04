import type { Element } from '../core/elements';
import { decompose } from '../hangul/jamo';
import { applyDueum } from '../hangul/dueum';
import { pronounce } from '../hangul/pronounce';
import {
  analyzeName, resourcePointsFor, suriPointsFor, type Gender, type NameChar, type NameReport, type SchoolOptions,
} from '../name/analyze';
import { getHanja, hanjaByReading, isNameHanja, type HanjaEntry } from '../name/hanjaDb';
import { isPositiveMeaning, teaseWord } from '../name/safety';
import { soundFlow, vowelYinYang } from '../name/sound';
import { strokeYinYang } from '../name/suri';
import type { SajuAnalysis } from '../saju/analysis';
import { AWKWARD_NAMES, COMMON_NAMES, DISTINCT_NAMES, FAMILIAR_HANJA, POPULAR_NAMES, SYLLABLES } from './syllables';

export interface Preferences {
  /** 이름 글자 수 (성 제외) */
  length: 1 | 2;
  /** 돌림자: 위치(0부터)와 한글·한자 */
  fixed?: { position: number; hangul: string; hanja: string };
  /** 꼭 넣고 싶은 음절(하나 이상 포함) */
  include?: string[];
  /** 피하고 싶은 음절 */
  exclude?: string[];
  /** 피하고 싶은 첫소리(초성) */
  excludeInitials?: string[];
  style: 'popular' | 'balanced' | 'unique';
}

export const DEFAULT_PREFERENCES: Preferences = { length: 2, style: 'balanced' };

export interface Recommendation {
  hangul: string;
  hanja: string;
  report: NameReport;
}

export interface RecommendArgs {
  surname: NameChar[];
  gender: Gender;
  saju: SajuAnalysis | null;
  prefs: Preferences;
  options: SchoolOptions;
  limit?: number;
}

const HANGUL_KEEP = 1500;
const HANJA_PER_SYLLABLE = 12;
const cp = (s: string) => [...s].map((c) => c.codePointAt(0) ?? 0);
function cmpCodePoints(a: string, b: string): number {
  const x = cp(a);
  const y = cp(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return (x[i] as number) - (y[i] as number);
  return x.length - y.length;
}

type Pool = Map<string, number>;
function pool(kind: 'first' | 'second' | 'single', gender: Gender): Pool {
  const m: Pool = new Map();
  const genders = gender === 'unknown' ? (['female', 'male'] as const) : ([gender] as const);
  for (const g of genders) for (const [s, w] of SYLLABLES[kind][g]) m.set(s, Math.max(m.get(s) ?? 0, w));
  return m;
}

function preferenceOf(weights: number[], hangul: string, gender: Gender, style: Preferences['style']): number {
  const norm = weights.reduce((a, b) => a + b, 0) / (weights.length * 3);
  const popular = isPopular(hangul, gender);
  if (style === 'popular') return 0.5 * norm + (popular ? 0.5 : 0);
  if (style === 'unique') return isDistinct(hangul, gender) ? 1 : popular ? 0.1 : 0.6 - 0.3 * norm;
  return norm;
}

function isDistinct(hangul: string, gender: Gender): boolean {
  return (gender === 'unknown' ? [...DISTINCT_NAMES.female, ...DISTINCT_NAMES.male] : DISTINCT_NAMES[gender]).includes(hangul);
}

function isPopular(hangul: string, gender: Gender): boolean {
  return (gender === 'unknown' ? [...POPULAR_NAMES.female, ...POPULAR_NAMES.male] : POPULAR_NAMES[gender]).includes(hangul);
}

/** 실제로 많이 쓰는 이름 목록(성별 모름이면 둘 다) */
function knownNames(gender: Gender): Set<string> {
  const gs = gender === 'unknown' ? (['female', 'male'] as const) : ([gender] as const);
  return new Set(gs.flatMap((g) => [...COMMON_NAMES[g], ...POPULAR_NAMES[g], ...DISTINCT_NAMES[g]]).filter((n) => !AWKWARD_NAMES.has(n)));
}

/**
 * 어색한 조합 거르기. 한자 점수가 아무리 좋아도 실제로 잘 쓰지 않는 이름은 내지 않는다.
 * - 낱말처럼 들리는 이름(하지·지하·이유·유린…)은 언제나 뺀다.
 * - 두 글자 이름은 이름 느낌과 상관없이 실제로 쓰는 이름 목록(많이 쓰는·인기·개성 있는) 안에서만 고른다.
 *   '흔하지 않은'은 그 목록 안에서 덜 흔한 이름을 앞에 둔다(preferenceOf).
 * - 돌림자 등으로 후보가 너무 적을 때만(relaxed) 아주 흔한 음절끼리의 조합(가중치 합 5 이상)을 더한다.
 */
function isNatural(weights: number[], hangul: string, _gender: Gender, _style: Preferences['style'], known: Set<string>, relaxed: boolean): boolean {
  if (AWKWARD_NAMES.has(hangul)) return false;
  if (weights.length < 2) return true;
  if (known.has(hangul)) return true;
  return relaxed && weights.reduce((a, b) => a + b, 0) >= 5;
}

interface HangulCandidate {
  syllables: string[];
  hangul: string;
  pre: number;
  soundPts: number;
  vowelPts: number;
  practicalSound: number;
  preference: number;
}

/** 대표음(첫 음)이 그 음절인 한자만 (別音으로 읽히는 글자 제외). 이름 첫 자는 두음법칙 허용 */
function primaryReadingMatches(h: HanjaEntry, syllable: string, initial: boolean): boolean {
  const primary = h.readings[0] ?? '';
  return primary === syllable || (initial && applyDueum(primary) === syllable);
}

function hanjaCandidates(syllable: string, position: number, saju: SajuAnalysis | null, options: SchoolOptions): HanjaEntry[] {
  const list = hanjaByReading(syllable, { initial: position === 0 }).filter(
    (h) =>
      isNameHanja(h) && !h.negative && h.meaning !== '' && !(options.excludeBulyong && h.bulyong) &&
      primaryReadingMatches(h, syllable, position === 0) &&
      (FAMILIAR_HANJA.has(h.ch) || isPositiveMeaning(h.meaning)),
  );
  const key = (h: HanjaEntry) =>
    (FAMILIAR_HANJA.has(h.ch) ? 2 : 0) + (isPositiveMeaning(h.meaning) ? 1 : 0) + (h.edu ? 0.3 : 0) +
    (saju ? saju.favor[h.element] * (h.elementConfidence === 'C' ? 0.5 : 1) : 0);
  return list
    .map((h) => ({ h, k: key(h) }))
    .sort((a, b) => b.k - a.k || cmpCodePoints(a.h.ch, b.h.ch))
    .slice(0, HANJA_PER_SYLLABLE)
    .map((x) => x.h);
}

/**
 * 이름 추천 (설계서 10절). 난수 없음: 같은 입력이면 항상 같은 순서.
 * 1) 음절 조합 → 소리 규칙으로 한글 이름 상위 1,500개  2) 음절별 한자 상위 12개
 * 3) 4격·채점 → 한글 이름당 상위 2개 조합  4) 상위 limit개를 정식 분석(analyzeName)으로 확정
 */
export function recommendNames(args: RecommendArgs): Recommendation[] {
  const { surname, gender, saju, prefs, options } = args;
  const limit = args.limit ?? 100;
  const surSyl = surname.map((c) => c.hangul);
  const surEntries = surname.map((c) => (c.hanja ? getHanja(c.hanja) : undefined));
  if (surEntries.some((h) => !h)) throw new RangeError('UNKNOWN_SURNAME_HANJA');
  const surStrokes = (surEntries as HanjaEntry[]).reduce((s, h) => s + h.strokes, 0);

  // 조작된 링크로 계산량이 폭증하지 않도록 목록 길이를 제한한다
  const MAX_LIST = 10;
  const exclude = new Set((prefs.exclude ?? []).slice(0, MAX_LIST));
  const excludeInitials = new Set((prefs.excludeInitials ?? []).slice(0, MAX_LIST));
  const include = (prefs.include?.filter(Boolean) ?? []).slice(0, MAX_LIST);

  const pools: Pool[] =
    prefs.length === 1 ? [pool('single', gender)] : [pool('first', gender), pool('second', gender)];
  for (const s of include) for (const p of pools) if (!p.has(s)) p.set(s, 2);
  if (prefs.fixed) {
    const pos = Math.min(Math.max(0, prefs.fixed.position), pools.length - 1);
    pools[pos] = new Map([[prefs.fixed.hangul, 3]]);
  }

  // 1) 한글 후보: 음절 풀의 조합 + 실제로 많이 쓰는 이름
  let combos: [string, number][][] = [[]];
  for (const p of pools) {
    const next: [string, number][][] = [];
    for (const c of combos) for (const e of p) next.push([...c, e]);
    combos = next;
  }
  const known = knownNames(gender);
  if (pools.length === 2) {
    const seen = new Set(combos.map((c) => c.map(([s]) => s).join('')));
    const fixedPos = prefs.fixed ? Math.min(Math.max(0, prefs.fixed.position), 1) : -1;
    for (const name of [...known].sort()) {
      const syl = [...name];
      if (syl.length !== 2 || seen.has(name)) continue;
      if (prefs.fixed && syl[fixedPos] !== prefs.fixed.hangul) continue;
      combos.push(syl.map((s, i) => [s, pools[i]?.get(s) ?? 2] as [string, number]));
      seen.add(name);
    }
  }
  const build = (relaxed: boolean): HangulCandidate[] => {
  const hangulCands: HangulCandidate[] = [];
  for (const combo of combos) {
    const syl = combo.map(([s]) => s);
    if (syl.some((s, i) => i > 0 && s === syl[i - 1])) continue;
    // 성과 이름 첫 글자가 같으면(정정우·이이서) 부르기 어색하다
    if (syl[0] === surSyl[surSyl.length - 1] && !(prefs.fixed && prefs.fixed.position === 0)) continue;
    if (syl.some((s) => exclude.has(s) && !(prefs.fixed && s === prefs.fixed.hangul))) continue;
    if (syl.some((s) => excludeInitials.has(decompose(s)?.initial ?? ''))) continue;
    if (include.length > 0 && !syl.some((s) => include.includes(s))) continue;
    const hangulName = syl.join('');
    if (!isNatural(combo.map(([, w]) => w), hangulName, gender, prefs.style, known, relaxed)) continue;
    const all = [...surSyl, ...syl];
    if (teaseWord(all.join(''))) continue;
    const flow = soundFlow(all, options.soundSchool, options.includeFinalConsonant);
    if (options.strictMode && flow.pairs.some((p) => p.kind === 'clash')) continue;
    if (options.bothSchoolsNoClash) {
      const other = options.soundSchool === 'haerye' ? 'unhae' : 'haerye';
      if (flow.pairs.some((p) => p.kind === 'clash')) continue;
      if (soundFlow(all, other, options.includeFinalConsonant).pairs.some((p) => p.kind === 'clash')) continue;
    }
    const vowel = vowelYinYang(all);
    const pronChanged = pronounce(all).join('') !== all.join('');
    const practicalSound = 4 - (pronChanged ? 2 : 0);
    const hangul = syl.join('');
    const preference = preferenceOf(combo.map(([, w]) => w), hangul, gender, prefs.style);
    const soundPts = flow.score * 20;
    const vowelPts = vowel.score * 4;
    hangulCands.push({
      syllables: syl, hangul, soundPts, vowelPts, practicalSound, preference,
      pre: soundPts + vowelPts + practicalSound + preference * 3,
    });
  }
  return hangulCands;
  };
  let hangulCands = build(false);
  if (hangulCands.length < 40) hangulCands = build(true);
  hangulCands.sort((a, b) => b.pre - a.pre || cmpCodePoints(a.hangul, b.hangul));
  const kept = hangulCands.slice(0, HANGUL_KEEP);

  // 2) 음절별 한자 후보 (캐시)
  const cache = new Map<string, HanjaEntry[]>();
  const candidatesFor = (s: string, pos: number): HanjaEntry[] => {
    if (prefs.fixed && pos === prefs.fixed.position && s === prefs.fixed.hangul) {
      const h = getHanja(prefs.fixed.hanja);
      return h ? [h] : [];
    }
    const k = `${s}:${pos === 0 ? 1 : 0}`;
    let v = cache.get(k);
    if (!v) {
      v = hanjaCandidates(s, pos, saju, options);
      cache.set(k, v);
    }
    return v;
  };

  // 3) 조합 채점
  interface Scored { hangul: string; hanja: string; entries: HanjaEntry[]; total: number }
  const scored: Scored[] = [];
  for (const hc of kept) {
    const lists = hc.syllables.map((s, i) => candidatesFor(s, i));
    if (lists.some((l) => l.length === 0)) continue;
    let combosH: HanjaEntry[][] = [[]];
    for (const l of lists) {
      const next: HanjaEntry[][] = [];
      for (const c of combosH) for (const h of l) next.push([...c, h]);
      combosH = next;
    }
    const best: Scored[] = [];
    for (const entries of combosH) {
      const strokes = entries.map((h) => h.strokes);
      const suri = suriPointsFor(surStrokes, strokes, gender, options);
      if (options.strictMode && !suri.noBad) continue;
      const resource = resourcePointsFor(entries, saju);
      const syy = strokeYinYang([...(surEntries as HanjaEntry[]).map((h) => h.strokes), ...strokes]).balanced ? 6 : 0;
      const bulyong = entries.some((h) => h.bulyong) ? 0 : 3;
      const total = resource + suri.points + hc.soundPts + syy + hc.vowelPts + 5 + bulyong + hc.practicalSound + hc.preference * 3;
      best.push({ hangul: hc.hangul, hanja: entries.map((h) => h.ch).join(''), entries, total });
    }
    best.sort((a, b) => b.total - a.total || cmpCodePoints(a.hanja, b.hanja));
    scored.push(...best.slice(0, 2));
  }
  scored.sort((a, b) => b.total - a.total || cmpCodePoints(a.hangul, b.hangul) || cmpCodePoints(a.hanja, b.hanja));

  // 4) 정식 분석으로 확정
  // 점수는 '이름 풀어보기'와 똑같이 매긴다(같은 이름이면 어디서나 같은 점수).
  // 이름 느낌(인기·특별) 선호는 후보 고르기와 같은 점수 안의 순서에만 쓴다.
  const out: (Recommendation & { pref: number })[] = [];
  for (const s of scored.slice(0, limit)) {
    const given = [...s.hangul].map((h, i) => ({ hangul: h, hanja: s.entries[i]?.ch ?? null }));
    const pref = hangulCands.find((c) => c.hangul === s.hangul)?.preference ?? 1;
    const report = analyzeName({ surname, given, gender }, saju, options);
    out.push({ hangul: `${surSyl.join('')}${s.hangul}`, hanja: `${surname.map((c) => c.hanja).join('')}${s.hanja}`, report, pref });
  }
  out.sort(
    (a, b) =>
      b.report.score.total - a.report.score.total ||
      b.pref - a.pref ||
      cmpCodePoints(a.hangul, b.hangul) ||
      cmpCodePoints(a.hanja, b.hanja),
  );
  return out.map(({ pref: _pref, ...r }) => r);
}

export type { Element };

/**
 * 셀프 분석용: 같은 소리를 유지하면서 점수가 더 높은 한자 조합을 최대 limit개 제안.
 * 각 글자마다 후보 한자 상위 12개(친숙·좋은 뜻·용희신 순) 조합을 정식 분석으로 비교한다.
 */
export function suggestBetterHanja(
  input: { surname: NameChar[]; given: NameChar[]; gender: Gender },
  saju: SajuAnalysis | null,
  options: SchoolOptions,
  limit = 3,
): Recommendation[] {
  const current = analyzeName(input, saju, options);
  const lists = input.given.map((g, i) => {
    const list = hanjaCandidates(g.hangul, i, saju, options);
    const cur = g.hanja ? getHanja(g.hanja) : undefined;
    return cur && !list.includes(cur) ? [...list, cur] : list;
  });
  if (lists.some((l) => l.length === 0)) return [];
  let combos: HanjaEntry[][] = [[]];
  for (const l of lists) {
    const next: HanjaEntry[][] = [];
    for (const c of combos) for (const h of l) next.push([...c, h]);
    combos = next;
  }
  const surHangul = input.surname.map((c) => c.hangul).join('');
  const surHanja = input.surname.map((c) => c.hanja ?? '').join('');
  const curHanja = input.given.map((g) => g.hanja ?? '').join('');
  const out: Recommendation[] = [];
  for (const entries of combos) {
    const hanja = entries.map((h) => h.ch).join('');
    if (hanja === curHanja) continue;
    const given = input.given.map((g, i) => ({ hangul: g.hangul, hanja: (entries[i] as HanjaEntry).ch }));
    const report = analyzeName({ ...input, given }, saju, options);
    if (report.score.total <= current.score.total) continue;
    out.push({ hangul: surHangul + given.map((g) => g.hangul).join(''), hanja: surHanja + hanja, report });
  }
  out.sort((a, b) => b.report.score.total - a.report.score.total || cmpCodePoints(a.hanja, b.hanja));
  return out.slice(0, limit);
}
