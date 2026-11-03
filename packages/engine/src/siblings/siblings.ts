import { ELEMENT_HANJA, relation } from '../core/elements';
import { BRANCHES, STEMS, ZODIAC_KO } from '../core/ganji';
import { decompose } from '../hangul/jamo';
import { analyzeName, type Gender, type NameChar, type NameReport, type SchoolOptions } from '../name/analyze';
import { soundElement } from '../name/sound';
import { recommendNames, type Preferences, type Recommendation } from '../recommend/recommend';
import { computeSaju, type SajuResult } from '../saju';
import { BRANCH_RELATION_KO, branchRelations, stemRelation, type BranchRelation } from '../saju/relations';
import type { BirthInput, SajuOptions } from '../saju/pillars';

export interface ChildInput {
  label: string;
  gender: Gender;
  birth: BirthInput | null;
  /** 이미 정한 이름(성 제외). 있으면 세트 추천에서 고정 */
  given?: NameChar[];
}

export interface PairHarmony {
  a: number;
  b: number;
  /** 0..100 */
  score: number;
  saju: { stem: string; zodiac: string[]; dayBranch: string[]; points: number } | null;
  name: { initialRelation: string; distinctness: number; rhyme: number; points: number } | null;
  notes: string[];
}

export interface SiblingReport {
  children: { saju: SajuResult | null; report: NameReport | null }[];
  pairs: PairHarmony[];
  total: number;
}

export interface SiblingSet {
  names: Recommendation[];
  pairs: PairHarmony[];
  score: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function jamoSeq(s: string): string[] {
  const out: string[] = [];
  for (const ch of s) {
    const d = decompose(ch);
    if (d) out.push(d.initial, d.medial, ...(d.final ? [d.final] : []));
    else out.push(ch);
  }
  return out;
}

function levenshtein(a: string[], b: string[]): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) (dp[0] as number[])[j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const row = dp[i] as number[];
      const prev = dp[i - 1] as number[];
      row[j] = Math.min((prev[j] as number) + 1, (row[j - 1] as number) + 1, (prev[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return (dp[a.length] as number[])[b.length] as number;
}

/** 이름(성 제외) 두 개의 소리 구별도 0..1 (자모 편집거리, 0.5 이상 차이면 1) */
export function nameDistinctness(a: string, b: string): number {
  const x = jamoSeq(a);
  const y = jamoSeq(b);
  const d = levenshtein(x, y) / Math.max(x.length, y.length, 1);
  return Math.min(1, d / 0.5);
}

function branchPoints(rels: BranchRelation[], full: number, bad: number, mild: number, none: number): number {
  if (rels.includes('yukhap') || rels.includes('samhap')) return full;
  if (rels.includes('chung')) return bad;
  if (rels.length > 0) return mild;
  return none;
}

const relLabel = (rels: BranchRelation[]) => (rels.length ? rels.map((r) => BRANCH_RELATION_KO[r]).join('·') : '무난');

function sajuPart(a: SajuResult, b: SajuResult): PairHarmony['saju'] {
  const pa = a.primary.pillars;
  const pb = b.primary.pillars;
  const sr = stemRelation(pa.day.stem, pb.day.stem);
  const stemPts = sr === 'hap' ? 15 : sr === 'generates' || sr === 'generatedBy' ? 12 : sr === 'same' ? 9 : 4;
  const zr = pa.year.branch === pb.year.branch ? [] : branchRelations(pa.year.branch, pb.year.branch);
  const zodiacPts = pa.year.branch === pb.year.branch ? 10 : branchPoints(zr, 15, 3, 6, 10);
  const dr = pa.day.branch === pb.day.branch ? [] : branchRelations(pa.day.branch, pb.day.branch);
  const dayPts = pa.day.branch === pb.day.branch ? 7 : branchPoints(dr, 10, 2, 4, 7);
  const stemKo = { hap: '천간합', generates: '상생', generatedBy: '상생', same: '비화', controls: '상극', controlledBy: '상극' }[sr];
  return {
    stem: `${STEMS[pa.day.stem]}·${STEMS[pb.day.stem]} ${stemKo}`,
    zodiac: [`${ZODIAC_KO[pa.year.branch]}띠·${ZODIAC_KO[pb.year.branch]}띠 ${pa.year.branch === pb.year.branch ? '같은 띠' : relLabel(zr)}`],
    dayBranch: [`일지 ${BRANCHES[pa.day.branch]}·${BRANCHES[pb.day.branch]} ${pa.day.branch === pb.day.branch ? '같음' : relLabel(dr)}`],
    points: stemPts + zodiacPts + dayPts,
  };
}

function namePart(a: string[], b: string[], options: SchoolOptions): PairHarmony['name'] {
  const ea = soundElement(a[0] as string, options.soundSchool);
  const eb = soundElement(b[0] as string, options.soundSchool);
  let initPts = 12;
  let initialRelation = '비화';
  if (ea && eb) {
    const r = relation(ea, eb);
    if (r === 'generates' || r === 'generatedBy') { initPts = 20; initialRelation = '상생'; }
    else if (r === 'same') { initPts = 12; initialRelation = '비화'; }
    else { initPts = 4; initialRelation = '상극'; }
    initialRelation = `${ELEMENT_HANJA[ea]}·${ELEMENT_HANJA[eb]} ${initialRelation}`;
  }
  const distinctness = nameDistinctness(a.join(''), b.join(''));
  const shared = a.some((s, i) => b[i] === s);
  let rhyme = 0;
  if (shared) rhyme = 15;
  else {
    const la = decompose(a[a.length - 1] as string);
    const lb = decompose(b[b.length - 1] as string);
    if (la && lb && la.medial === lb.medial) rhyme += 8;
    if (la && lb && Boolean(la.final) === Boolean(lb.final)) rhyme += 7;
  }
  return { initialRelation, distinctness: round1(distinctness), rhyme, points: initPts + 25 * distinctness + rhyme };
}

function combinePair(i: number, j: number, s: PairHarmony['saju'], n: PairHarmony['name']): PairHarmony {
  const notes: string[] = [];
  let got = 0;
  let max = 0;
  if (s) {
    got += s.points; max += 40;
    notes.push(`일간 ${s.stem}`, ...s.zodiac, ...s.dayBranch);
  }
  if (n) {
    got += n.points; max += 60;
    notes.push(`이름 첫소리 ${n.initialRelation}`);
    notes.push(n.distinctness < 0.5 ? '두 이름 소리가 비슷해 헷갈릴 수 있어요' : '두 이름이 또렷이 구별돼요');
    if (n.rhyme >= 15) notes.push('돌림자로 형제자매 느낌이 살아요');
    else if (n.rhyme >= 8) notes.push('끝소리가 닮아 세트 느낌이 있어요');
  }
  return { a: i, b: j, score: max ? round1((got / max) * 100) : 0, saju: s, name: n, notes };
}

export function analyzeSiblings(
  surname: NameChar[],
  children: ChildInput[],
  sajuOpts: SajuOptions,
  schoolOpts: SchoolOptions,
): SiblingReport {
  const out = children.map((c) => {
    const saju = c.birth ? computeSaju(c.birth, sajuOpts) : null;
    const report = c.given?.length ? analyzeName({ surname, given: c.given, gender: c.gender }, saju?.primary ?? null, schoolOpts) : null;
    return { saju, report };
  });
  const pairs: PairHarmony[] = [];
  for (let i = 0; i < children.length; i++) {
    for (let j = i + 1; j < children.length; j++) {
      const a = out[i] as SiblingReport['children'][number];
      const b = out[j] as SiblingReport['children'][number];
      const s = a.saju && b.saju ? sajuPart(a.saju, b.saju) : null;
      const n = a.report && b.report
        ? namePart(a.report.input.given.map((g) => g.hangul), b.report.input.given.map((g) => g.hangul), schoolOpts)
        : null;
      pairs.push(combinePair(i, j, s, n));
    }
  }
  const total = pairs.length ? round1(pairs.reduce((s, p) => s + p.score, 0) / pairs.length) : 0;
  return { children: out, pairs, total };
}

/** 다둥이 이름 세트 추천 (설계서 11절). 세트점수 = 0.6×개인 평균 + 0.4×쌍 평균 */
export function recommendSiblingSets(
  surname: NameChar[],
  children: ChildInput[],
  prefs: Preferences,
  sajuOpts: SajuOptions,
  schoolOpts: SchoolOptions,
  limit = 10,
): SiblingSet[] {
  if (children.length < 2 || children.length > 4) throw new RangeError('SIBLINGS_2_TO_4');
  const per = children.length <= 3 ? 40 : 25;
  const sajus = children.map((c) => (c.birth ? computeSaju(c.birth, sajuOpts) : null));
  const surHangul = surname.map((c) => c.hangul).join('');
  const surHanja = surname.map((c) => c.hanja ?? '').join('');
  const candidates: Recommendation[][] = children.map((c, i) => {
    const saju = sajus[i]?.primary ?? null;
    if (c.given?.length) {
      const report = analyzeName({ surname, given: c.given, gender: c.gender }, saju, schoolOpts);
      return [{ hangul: surHangul + c.given.map((g) => g.hangul).join(''), hanja: surHanja + c.given.map((g) => g.hanja ?? '').join(''), report }];
    }
    return recommendNames({ surname, gender: c.gender, saju, prefs, options: schoolOpts, limit: per });
  });

  const sajuPairs = new Map<string, PairHarmony['saju']>();
  const pairCache = new Map<string, PairHarmony>();
  const pairOf = (i: number, ci: number, j: number, cj: number): PairHarmony => {
    const key = `${i}:${ci}:${j}:${cj}`;
    let p = pairCache.get(key);
    if (!p) {
      const sk = `${i}:${j}`;
      if (!sajuPairs.has(sk)) {
        const a = sajus[i];
        const b = sajus[j];
        sajuPairs.set(sk, a && b ? sajuPart(a, b) : null);
      }
      const ra = (candidates[i] as Recommendation[])[ci] as Recommendation;
      const rb = (candidates[j] as Recommendation[])[cj] as Recommendation;
      const n = namePart(ra.report.input.given.map((g) => g.hangul), rb.report.input.given.map((g) => g.hangul), schoolOpts);
      p = combinePair(i, j, sajuPairs.get(sk) ?? null, n);
      pairCache.set(key, p);
    }
    return p;
  };

  const results: { idx: number[]; score: number; key: string; set: string }[] = [];
  const idx: number[] = [];
  const walk = (k: number) => {
    if (k === children.length) {
      const names = idx.map((ci, i) => (candidates[i] as Recommendation[])[ci] as Recommendation);
      if (new Set(names.map((n) => n.hangul)).size !== names.length) return;
      let pairSum = 0;
      let pairN = 0;
      for (let i = 0; i < idx.length; i++) for (let j = i + 1; j < idx.length; j++) {
        pairSum += pairOf(i, idx[i] as number, j, idx[j] as number).score;
        pairN++;
      }
      const indiv = names.reduce((s, n) => s + n.report.score.total, 0) / names.length;
      results.push({ idx: [...idx], score: round1(0.6 * indiv + 0.4 * (pairSum / pairN)), key: names.map((n) => n.hanja).join('|'), set: names.map((n) => n.hanja).sort().join('|') });
      return;
    }
    const list = candidates[k] as Recommendation[];
    for (let c = 0; c < list.length; c++) {
      idx[k] = c;
      walk(k + 1);
    }
  };
  walk(0);
  results.sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  // 같은 이름이 여러 세트를 독차지하지 않도록, 한 이름은 최대 3세트까지
  const used = new Map<string, number>();
  const seenSets = new Set<string>();
  const out: SiblingSet[] = [];
  for (const r of results) {
    // 같은 이름 조합을 순서만 바꾼 세트는 점수가 높은 배치 하나만
    if (seenSets.has(r.set)) continue;
    seenSets.add(r.set);
    const names = r.idx.map((ci, i) => (candidates[i] as Recommendation[])[ci] as Recommendation);
    if (names.some((n, i) => !children[i]?.given?.length && (used.get(n.hanja) ?? 0) >= 3)) continue;
    for (const n of names) used.set(n.hanja, (used.get(n.hanja) ?? 0) + 1);
    const pairs: PairHarmony[] = [];
    for (let i = 0; i < r.idx.length; i++) for (let j = i + 1; j < r.idx.length; j++) pairs.push(pairOf(i, r.idx[i] as number, j, r.idx[j] as number));
    out.push({ names, pairs, score: r.score });
    if (out.length >= limit) break;
  }
  return out;
}
