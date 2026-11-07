import type { Element } from '../core/elements';
import { decompose } from '../hangul/jamo';
import { applyDueum } from '../hangul/dueum';
import { pronounce } from '../hangul/pronounce';
import {
  analyzeName, resourcePointsFor, suriPointsFor, type Gender, type NameChar, type NameReport, type SchoolOptions,
} from '../name/analyze';
import { entryForBasis, getHanja, hanjaByReading, isNameHanja, MID_LIQUID, type HanjaEntry } from '../name/hanjaDb';
import { sajuForMethod } from '../saju/analysis';
import { isPositiveMeaning, teaseWord } from '../name/safety';
import { HANJA_STORY } from '../name/stories';
import { soundFlow, vowelYinYang } from '../name/sound';
import { strokeYinYang } from '../name/suri';
import type { SajuAnalysis } from '../saju/analysis';
import { AWKWARD_NAMES, COMMON_NAMES, DISTINCT_NAMES, FAMILIAR_HANJA, POPULAR_NAMES, RECENT_TOP, SYLLABLES } from './syllables';

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
  /**
   * 이름 느낌과 얼마나 맞는지. 0: 고른 느낌의 실제 이름, 1: 다른 느낌의 실제 이름,
   * 2: 조건 때문에 넓혀 찾은 조합(목록에 없는 이름). 점수와는 상관없고 순서에만 쓴다.
   */
  fit?: 0 | 1 | 2;
  /** '두 기준 모두'로 찾았을 때: 정통 성명학·실용 작명법 점수 */
  dual?: { classic: { total: number; grade: string }; practical: { total: number; grade: string } };
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

function isCommon(hangul: string, gender: Gender): boolean {
  return (gender === 'unknown' ? [...COMMON_NAMES.female, ...COMMON_NAMES.male] : COMMON_NAMES[gender]).includes(hangul);
}

/** 요즘 많이 쓰는 이름: 최근 인기 이름 + 많이 쓰는 이름 앞쪽 */
function isRecent(hangul: string, gender: Gender): boolean {
  if (isPopular(hangul, gender)) return true;
  const gs = gender === 'unknown' ? (['female', 'male'] as const) : ([gender] as const);
  return gs.some((g) => {
    const i = COMMON_NAMES[g].indexOf(hangul);
    return i >= 0 && i < RECENT_TOP;
  });
}

/** 남자아이 이름 끝에 오면 여자 이름처럼 들리는 글자 / 여자아이 이름 끝에 오면 남자 이름처럼 들리는 글자 */
const FEMININE_LAST = new Set(['아', '나', '미', '라', '리', '린', '혜', '슬', '별', '설', '경', '연']);
const MASCULINE_LAST = new Set(['준', '혁', '훈', '호', '철', '석', '범', '웅', '환', '건', '강', '찬']);
const listed = (g: 'male' | 'female') => new Set([...COMMON_NAMES[g], ...POPULAR_NAMES[g], ...DISTINCT_NAMES[g]]);
const MAIN = { male: new Set([...COMMON_NAMES.male, ...POPULAR_NAMES.male]), female: new Set([...COMMON_NAMES.female, ...POPULAR_NAMES.female]) };

/**
 * 성별에 맞는 이름인지. 남자아이에게 여자 이름처럼 들리는 이름(…아·…나·…경), 여자아이에게 남자 이름처럼 들리는 이름(…준·…혁·…호)은 뺀다.
 * 그 성별에서 실제로 많이 쓰는 이름이면 그대로 둔다(하준·서준 같은 예외가 없도록).
 */
export function fitsGender(hangul: string, gender: Gender): boolean {
  if (gender === 'unknown') return true;
  const last = [...hangul].pop() ?? '';
  if (MAIN[gender].has(hangul)) return true;
  if (gender === 'male') return !FEMININE_LAST.has(last) && !(MAIN.female.has(hangul) && !listed('male').has(hangul));
  return !MASCULINE_LAST.has(last) && !(MAIN.male.has(hangul) && !listed('female').has(hangul));
}


/** 실제로 많이 쓰는 이름 목록(성별 모름이면 둘 다) */
function knownNames(gender: Gender): Set<string> {
  const gs = gender === 'unknown' ? (['female', 'male'] as const) : ([gender] as const);
  return new Set(gs.flatMap((g) => [...COMMON_NAMES[g], ...POPULAR_NAMES[g], ...DISTINCT_NAMES[g]]).filter((n) => !AWKWARD_NAMES.has(n)));
}

/**
 * 이름 느낌별 우선순위(0이 가장 잘 맞음). 세 느낌이 서로 다른 이름을 먼저 내도록 목록을 나눈다.
 * - 요즘 많이 쓰는: 요즘 인기 이름 → 오래 써 온 이름 → 개성 있는 이름
 * - 무난한: 오래 써 온 친숙한 이름 → 나머지
 * - 흔하지 않은: 개성 있는 이름 → 오래 써 온 이름 → 요즘 인기 이름
 */
function styleTier(hangul: string, gender: Gender, style: Preferences['style']): number {
  if ([...hangul].length < 2) return singleTier(hangul, gender, style);
  return styleTierOf(hangul, gender, style);
}

/** 외자도 느낌별로 나눈다(요즘 많이 쓰는 / 오래 써 온 / 흔하지 않은) */
const SINGLE_STYLE: Record<'female' | 'male', Record<Preferences['style'], string>> = {
  female: { popular: '윤율린은', balanced: '현진민연정혜', unique: '솔별설담단슬빈결온' },
  male: { popular: '준윤율건혁', balanced: '현진민훈석호원찬범환한', unique: '결온솔담겸산강웅' },
};
function singleTier(syl: string, gender: Gender, style: Preferences['style']): number {
  const gs = gender === 'unknown' ? (['female', 'male'] as const) : ([gender] as const);
  return gs.some((g) => SINGLE_STYLE[g][style].includes(syl)) ? 0 : 1;
}

function styleTierOf(hangul: string, gender: Gender, style: Preferences['style']): number {
  const recent = isRecent(hangul, gender);
  const distinct = isDistinct(hangul, gender);
  const classic = isCommon(hangul, gender) && !recent;
  if (style === 'popular') return recent ? 0 : classic && !distinct ? 1 : 2;
  if (style === 'unique') return distinct && !recent ? 0 : recent ? 2 : 1;
  return classic && !distinct ? 0 : 1;
}

/**
 * 후보를 얼마나 넓게 찾을지. 조건(돌림자·포함·제외 등) 때문에 좋은 이름이 없을 때만 한 단계씩 넓힌다.
 * 0: 고른 느낌의 실제 이름  1: 실제로 쓰는 이름 전체  2: + 아주 흔한 음절끼리 조합(가중치 합 5 이상)
 * 3: + 이름 음절 조합(가중치 합 3 이상)  4: 3과 같되 '아쉬운 이름 미리 빼기'를 잠시 끈다
 */
type Level = 0 | 1 | 2 | 3 | 4;

/** 어색한 조합 거르기. 낱말처럼 들리는 이름(하지·지하·이유·유린…)은 어느 단계에서도 뺀다 */
function allowedAt(level: Level, weights: number[], hangul: string, known: Set<string>, tier: number, styleStrict = false): boolean {
  if (AWKWARD_NAMES.has(hangul)) return false;
  // 외자와 실제 이름은 고른 느낌(tier 0)만, 넓히는 단계(level 1 이상)에서도 styleStrict면 그대로
  if (weights.length < 2) return tier === 0 || (level >= 1 && !styleStrict);
  if (known.has(hangul)) return tier === 0 || (level >= 1 && !styleStrict);
  const sum = weights.reduce((a, b) => a + b, 0);
  return (level >= 2 && sum >= 5) || (level >= 3 && sum >= 3);
}

/** 고를 거리가 되도록 적어도 이만큼은 보여 준다(limit보다 크면 limit) */
const MIN_TOTAL = 30;
/** 고른 느낌의 이름이 이만큼 있으면 다른 느낌 이름은 섞지 않는다 */
const STYLE_ENOUGH = 30;

interface HangulCandidate {
  syllables: string[];
  hangul: string;
  pre: number;
  tier: number;
  known: boolean;
  soundPts: number;
  vowelPts: number;
  practicalSound: number;
  preference: number;
}

/** 대표음(첫 음)이 그 음절인 한자만 (別音으로 읽히는 글자 제외). 이름 첫 자는 두음법칙 허용 */
function primaryReadingMatches(h: HanjaEntry, syllable: string, initial: boolean): boolean {
  const primary = h.readings[0] ?? '';
  // 대표음이 그 소리이거나, 대표음이 그 소리의 두음 형태(朗 낭→랑, 羅 나→라, 林 임→림)인 경우.
  // 이름 첫 글자는 두음법칙 형태(려→여)도, 둘째 글자 이후 율·열은 률·렬 한자도 허용
  if (primary === syllable || applyDueum(syllable) === primary) return h.readings.includes(syllable) || primary === syllable;
  return initial ? applyDueum(primary) === syllable : MID_LIQUID[syllable] === primary;
}

function hanjaCandidates(syllable: string, position: number, saju: SajuAnalysis | null, options: SchoolOptions): HanjaEntry[] {
  const base = hanjaByReading(syllable, { initial: position === 0 }).map((h) => entryForBasis(h, options.hanjaElement)).filter(
    (h) =>
      isNameHanja(h) && !h.negative && h.meaning !== '' && !(options.excludeBulyong && h.bulyong) &&
      primaryReadingMatches(h, syllable, position === 0) &&
      (FAMILIAR_HANJA.has(h.ch) || isPositiveMeaning(h.meaning)),
  );
  // 이름에 어울리는지 사람이 확인하고 뜻 이야기를 써 둔 한자(HANJA_STORY)가 있으면 그 안에서만 고른다.
  // 점수만 보고 '수갑 추(杻)'처럼 이름에 쓰지 않는 글자가 끼는 것을 막는다.
  // 사주에 해가 되는 기운(기신·구신)의 한자는 쓰지 않는다
  const safeOf = (l: HanjaEntry[]) => (saju ? l.filter((h) => saju.roles[h.element] !== 'gi' && saju.roles[h.element] !== 'gu') : l);
  // 뜻 이야기를 써 둔 한자가 있는 소리는 그 안에서만 고른다(모두 사주에 해가 되면 이 소리는 쓰지 않는다)
  const storiedAll = base.filter((h) => HANJA_STORY.has(h.ch));
  const list = storiedAll.length > 0 ? safeOf(storiedAll) : safeOf(base);
  const key = (h: HanjaEntry) =>
    // 오행이 부수·뜻으로 분명한 한자를 먼저(획수 끝자리로 추정한 C는 뒤로)
    (FAMILIAR_HANJA.has(h.ch) ? 2 : 0) + (isPositiveMeaning(h.meaning) ? 1 : 0) + (h.edu ? 0.3 : 0) - (h.elementConfidence === 'C' ? 1 : 0) +
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
 * 3) 4격·채점 → 한글 이름당 상위 2개 조합  4) 상위 후보를 정식 분석(analyzeName)으로 확정
 * 고른 이름 느낌의 실제 이름부터 찾고, 좋은 이름이 모자라면 한 단계씩 넓힌다(Level).
 * 순서: 점수 높은 순. 고른 이름 느낌의 이름만 낸다(모자라면 같은 느낌 안에서만 넓힘).
 */
export function recommendNames(args: RecommendArgs): Recommendation[] {
  const { surname, gender, prefs, options } = args;
  const saju = sajuForMethod(args.saju, options.yongsinMethod);
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

  // 단계와 상관없는 거르기(조건·소리)는 한 번만 계산한다
  interface Base extends HangulCandidate { weights: number[]; clash: boolean }
  const bases: Base[] = [];
  for (const combo of combos) {
    const syl = combo.map(([s]) => s);
    if (syl.some((s, i) => i > 0 && s === syl[i - 1])) continue;
    // 성과 이름 첫 글자가 같으면(정정우·이이서) 부르기 어색하다
    if (syl[0] === surSyl[surSyl.length - 1] && !(prefs.fixed && prefs.fixed.position === 0)) continue;
    if (syl.some((s) => exclude.has(s) && !(prefs.fixed && s === prefs.fixed.hangul))) continue;
    if (syl.some((s) => excludeInitials.has(decompose(s)?.initial ?? ''))) continue;
    if (include.length > 0 && !syl.some((s) => include.includes(s))) continue;
    const hangul = syl.join('');
    if (AWKWARD_NAMES.has(hangul)) continue;
    // 돌림자가 이름 끝 글자면 부모가 정한 글자이므로 끝소리로 성별을 따지지 않는다
    const fixedLast = prefs.fixed && Math.min(Math.max(0, prefs.fixed.position), syl.length - 1) === syl.length - 1;
    if (!fixedLast && !fitsGender(hangul, gender)) continue;
    const all = [...surSyl, ...syl];
    if (teaseWord(all.join(''))) continue;
    const flow = soundFlow(all, options.soundSchool, options.includeFinalConsonant);
    const clash = flow.pairs.some((p) => p.kind === 'clash');
    // '두 학설 모두 상극 없음'은 사용자가 켠 조건이라 어느 단계에서도 지킨다
    if (options.bothSchoolsNoClash) {
      const other = options.soundSchool === 'haerye' ? 'unhae' : 'haerye';
      if (clash || soundFlow(all, other, options.includeFinalConsonant).pairs.some((p) => p.kind === 'clash')) continue;
    }
    const vowel = vowelYinYang(all);
    const pronChanged = pronounce(all).join('') !== all.join('');
    const practicalSound = 4 - (pronChanged ? 2 : 0);
    const weights = combo.map(([, w]) => w);
    const preference = preferenceOf(weights, hangul, gender, prefs.style);
    const soundPts = flow.score * 20;
    const vowelPts = vowel.score * 4;
    bases.push({
      syllables: syl, hangul, soundPts, vowelPts, practicalSound, preference, weights, clash,
      tier: styleTier(hangul, gender, prefs.style), known: known.has(hangul) || syl.length < 2,
      pre: soundPts + vowelPts + practicalSound + preference * 3,
    });
  }
  bases.sort((a, b) => b.pre - a.pre || cmpCodePoints(a.hangul, b.hangul));

  // 2) 음절별 한자 후보 (캐시)
  const cache = new Map<string, HanjaEntry[]>();
  const candidatesFor = (s: string, pos: number): HanjaEntry[] => {
    if (prefs.fixed && pos === prefs.fixed.position && s === prefs.fixed.hangul) {
      const h = getHanja(prefs.fixed.hanja);
      return h ? [entryForBasis(h, options.hanjaElement)] : [];
    }
    const k = `${s}:${pos === 0 ? 1 : 0}`;
    let v = cache.get(k);
    if (!v) {
      v = hanjaCandidates(s, pos, saju, options);
      cache.set(k, v);
    }
    return v;
  };

  // 3) 조합 채점 (한글 이름마다 한 번만, 엄격 모드 통과 여부는 따로 적어 둔다)
  interface Scored { hangul: string; hanja: string; entries: HanjaEntry[]; total: number; strictOk: boolean }
  const scoredCache = new Map<string, Scored[]>();
  const scoreHangul = (hc: Base, strict: boolean, needFavor: boolean): Scored[] => {
    const key = `${hc.hangul}:${strict ? 1 : 0}:${needFavor ? 1 : 0}`;
    const hit = scoredCache.get(key);
    if (hit) return hit;
    const lists = hc.syllables.map((s, i) => candidatesFor(s, i));
    const best: Scored[] = [];
    if (!lists.some((l) => l.length === 0)) {
      let combosH: HanjaEntry[][] = [[]];
      for (const l of lists) {
        const next: HanjaEntry[][] = [];
        for (const c of combosH) for (const h of l) next.push([...c, h]);
        combosH = next;
      }
      for (const entries of combosH) {
        const strokes = entries.map((h) => h.strokes);
        const suri = suriPointsFor(surStrokes, strokes, gender, options);
        if (strict && !suri.noBad) continue;
        // 용신·희신 기운의 한자가 하나도 없는 조합은 뺀다(돌림자 한자는 정해져 있으니 다른 글자로 채운다)
        if (needFavor && saju && !entries.some((h) => saju.roles[h.element] === 'yong' || saju.roles[h.element] === 'hui')) continue;
        // 생일이 없으면 정식 채점도 한자오행을 빼므로 미리 고를 때도 0으로 둔다(순서가 정식 점수와 같게)
        const resource = saju ? resourcePointsFor(entries, saju) : 0;
        const syy = strokeYinYang([...(surEntries as HanjaEntry[]).map((h) => h.strokes), ...strokes]).balanced ? 6 : 0;
        const bulyong = entries.some((h) => h.bulyong) ? 0 : 3;
        // 실용 점수의 이름 느낌 몫(3점)은 정식 분석과 똑같이 늘 만점으로 둔다. 배점은 정식 분석과 같게
        const total =
          options.scoring === 'app'
            ? (resource * 25) / 30 + suri.points + hc.soundPts + (syy + hc.vowelPts) * 1.5
            : resource + suri.points + hc.soundPts + syy + hc.vowelPts + 5 + bulyong + hc.practicalSound + 3;
        best.push({ hangul: hc.hangul, hanja: entries.map((h) => h.ch).join(''), entries, total, strictOk: suri.noBad && !hc.clash });
      }
      best.sort((a, b) => b.total - a.total || cmpCodePoints(a.hanja, b.hanja));
    }
    const top = best.slice(0, 2);
    scoredCache.set(key, top);
    return top;
  };

  // 4) 정식 분석 (같은 이름이면 '이름 풀어보기'와 똑같은 점수)
  const reportCache = new Map<string, NameReport>();
  const analyze = (s: Scored): NameReport => {
    let r = reportCache.get(s.hanja + s.hangul);
    if (!r) {
      const given = [...s.hangul].map((h, i) => ({ hangul: h, hanja: s.entries[i]?.ch ?? null }));
      r = analyzeName({ surname, given, gender }, saju, options);
      reportCache.set(s.hanja + s.hangul, r);
    }
    return r;
  };

  type Out = Recommendation & { pref: number; tier: number };
  const run = (level: Level, opt: { noStrict?: boolean; styleStrict?: boolean } = {}): { out: Out[]; size: number } => {
    const strict = options.strictMode && level < 4 && !opt.noStrict;
    const kept = bases
      .filter((b) => !(strict && b.clash) && allowedAt(level, b.weights, b.hangul, known, b.tier, opt.styleStrict))
      .slice(0, HANGUL_KEEP);
    const byHangul = new Map(kept.map((b) => [b.hangul, b]));
    const scored = kept.flatMap((b) => scoreHangul(b, strict, level < 3));
    scored.sort((a, b) => b.total - a.total || cmpCodePoints(a.hangul, b.hangul) || cmpCodePoints(a.hanja, b.hanja));
    const out: Out[] = scored.slice(0, Math.max(limit * 3, 90)).map((s) => {
      const b = byHangul.get(s.hangul) as Base;
      return {
        hangul: `${surSyl.join('')}${s.hangul}`,
        hanja: `${surname.map((c) => c.hanja).join('')}${s.hanja}`,
        report: analyze(s),
        fit: !b.known ? 2 : b.tier === 0 ? 0 : 1,
        pref: b.preference,
        tier: b.known ? b.tier : 9,
      };
    });
    // 보여 줄 순서는 점수 높은 순(같으면 느낌이 더 맞는 이름 먼저)
    out.sort(
      (a, b) =>
        b.report.score.total - a.report.score.total ||
        a.tier - b.tier ||
        b.pref - a.pref ||
        cmpCodePoints(a.hangul, b.hangul) ||
        cmpCodePoints(a.hanja, b.hanja),
    );
    // 한자가 같고 읽기만 다른 이름(率 솔/률 등)은 점수가 높은 하나만
    const seenHanja = new Set<string>();
    const uniq = out.filter((r) => (seenHanja.has(r.hanja) ? false : (seenHanja.add(r.hanja), true)));
    // 실제로 쓰는 이름이 충분하면 목록에 없는 조합(넓혀 찾은 이름)은 뺀다
    const real = uniq.filter((r) => r.fit !== 2);
    const shown = real.length >= Math.min(STYLE_ENOUGH, limit) ? real : uniq;
    return { out: shown.slice(0, limit), size: kept.length };
  };

  const sCount = (rs: Out[]) => new Set(rs.filter((r) => r.report.score.grade === 'S').map((r) => r.hangul)).size;
  const enough = Math.min(MIN_TOTAL, limit);
  const byScore = (a: Out, b: Out) => b.report.score.total - a.report.score.total || a.tier - b.tier || cmpCodePoints(a.hangul, b.hangul) || cmpCodePoints(a.hanja, b.hanja);
  const merge = (a: Out[], b: Out[]) => {
    const seen = new Set(a.map((r) => r.hanja));
    return [...a, ...b.filter((r) => !seen.has(r.hanja))].sort(byScore).slice(0, limit);
  };

  // 1) 고른 이름 느낌의 이름만 쓴다(다른 느낌의 이름은 섞지 않는다 → 느낌마다 결과가 다르다).
  //    모자라면 같은 느낌 안에서만 넓힌다: 아쉬운 점이 조금 있는 이름 → (흔하지 않은 이름만) 새 음절 조합
  let styled = run(0).out;
  if (styled.length < enough && options.strictMode) styled = merge(styled, run(0, { noStrict: true }).out);
  if (styled.length < enough && prefs.style === 'unique' && pools.length === 2) styled = merge(styled, run(2, { styleStrict: true }).out);
  // 돌림자가 있으면 그 글자가 든 이름만 되므로 느낌에 맞는 이름이 모자라면 다른 이름으로도 채운다(느낌 맞는 이름이 앞)
  if (styled.length > 0 && !(prefs.fixed && styled.length < enough)) return strip(styled);

  // 2) 고른 느낌의 이름이 없을 때만(돌림자·외자 조건 등) 실제 이름 전체 → 음절 조합 → 엄격 모드 해제 순으로 넓힌다
  let last: Out[] = styled;
  for (const level of [1, 2, 3] as const) {
    const { out, size } = run(level);
    last = merge(styled, out);
    if (last.length < enough) continue;
    // 돌림자 등으로 실제 이름 후보가 너무 적으면(40개 미만) 흔한 음절 조합까지 본다
    if (sCount(last) > 0 && (level >= 2 || size >= 40)) return strip(last);
  }
  if (last.length < enough && options.strictMode) last = merge(last, run(4).out);
  return strip(last);
}

function strip(rs: (Recommendation & { pref: number; tier: number })[]): Recommendation[] {
  return rs.map(({ pref: _p, tier: _t, ...r }) => r);
}

export type { Element };

/**
 * 셀프 분석용: 같은 소리를 유지하면서 점수가 더 높은 한자 조합을 최대 limit개 제안.
 * 각 글자마다 후보 한자 상위 12개(친숙·좋은 뜻·용희신 순) 조합을 정식 분석으로 비교한다.
 */
export function suggestBetterHanja(
  input: { surname: NameChar[]; given: NameChar[]; gender: Gender },
  sajuIn: SajuAnalysis | null,
  options: SchoolOptions,
  limit = 3,
): Recommendation[] {
  const saju = sajuForMethod(sajuIn, options.yongsinMethod);
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

/** 정통 성명학 / 실용 작명법 기준(나머지 설정은 그대로) */
export const CLASSIC_BASIS: Partial<SchoolOptions> = { yongsinMethod: 'eokbu', soundSchool: 'haerye', includeFinalConsonant: false, scoring: 'classic', hanjaElement: 'radical' };
export const PRACTICAL_BASIS: Partial<SchoolOptions> = { yongsinMethod: 'lacking', soundSchool: 'unhae', includeFinalConsonant: true, scoring: 'app', hanjaElement: 'radical' };

/**
 * 두 기준 모두에서 좋은 이름. 정통 성명학·실용 작명법으로 각각 후보를 찾아 합친 뒤 같은 이름을 두 기준으로 다시 채점한다.
 * 1) 두 기준 모두 A등급(80점) 이상인 이름만(모자라면 두 기준 모두 B등급 70점 이상까지)
 * 2) 두 점수의 평균이 높은 순(같으면 낮은 쪽 점수가 높은 순)
 * 보여 주는 풀이(report)는 정통 성명학 기준, 두 점수는 dual에 담는다.
 */
export function recommendBoth(args: RecommendArgs): Recommendation[] {
  const limit = args.limit ?? 100;
  const base = { ...args.options, dual: false };
  const classic = { ...base, ...CLASSIC_BASIS };
  const practical = { ...base, ...PRACTICAL_BASIS };
  const wide = Math.max(limit * 2, 120);
  const pool = new Map<string, Recommendation>();
  for (const r of [...recommendNames({ ...args, options: classic, limit: wide }), ...recommendNames({ ...args, options: practical, limit: wide })]) {
    if (!pool.has(r.hanja)) pool.set(r.hanja, r);
  }
  const scored = [...pool.values()].map((r) => {
    const a = analyzeName(r.report.input, args.saju, classic);
    const b = analyzeName(r.report.input, args.saju, practical);
    return {
      ...r,
      report: a,
      dual: { classic: { total: a.score.total, grade: a.score.grade }, practical: { total: b.score.total, grade: b.score.grade } },
      low: Math.min(a.score.total, b.score.total),
      avg: (a.score.total + b.score.total) / 2,
    };
  });
  const enough = Math.min(MIN_TOTAL, limit);
  let kept = scored.filter((x) => x.low >= 80);
  if (kept.length < enough) kept = scored.filter((x) => x.low >= 70);
  if (kept.length < enough) kept = scored;
  kept.sort((x, y) => y.avg - x.avg || y.low - x.low || cmpCodePoints(x.hangul, y.hangul) || cmpCodePoints(x.hanja, y.hanja));
  return kept.slice(0, limit).map(({ low: _l, avg: _a, ...r }) => r);
}

/** '두 기준 모두' 목록 점수: 두 기준 점수의 평균 */
export function dualScore(r: Recommendation): number {
  return r.dual ? (r.dual.classic.total + r.dual.practical.total) / 2 : r.report.score.total;
}
