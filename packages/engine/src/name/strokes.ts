/**
 * 성명학 원획(原劃) 계산.
 * 규칙(설계서 5.3): 변형부수는 원형 획수로 센다(氵→水 4, 艹→艸 6, 阝→阜 8 등).
 * 원획 = max(총획, 강희부수획 + 잔획). 잔획 0(부수 자체인 글자)은 총획. 숫자 한자는 뜻 획수.
 */

/** 강희자전 214부수의 획수. index = 부수 번호 */
const RADICAL_STROKE_RANGES: [from: number, to: number, strokes: number][] = [
  [1, 6, 1], [7, 29, 2], [30, 60, 3], [61, 94, 4], [95, 117, 5], [118, 146, 6], [147, 166, 7],
  [167, 175, 8], [176, 186, 9], [187, 194, 10], [195, 200, 11], [201, 204, 12], [205, 208, 13],
  [209, 210, 14], [211, 211, 15], [212, 213, 16], [214, 214, 17],
];

export function kangxiRadicalStrokes(radical: number): number {
  for (const [from, to, s] of RADICAL_STROKE_RANGES) if (radical >= from && radical <= to) return s;
  throw new RangeError(`INVALID_RADICAL:${radical}`);
}

/** 원형과 변형의 획수가 달라 성명학에서 원형으로 세는 부수 */
export const VARIANT_RADICALS = new Set([61, 64, 85, 94, 96, 113, 122, 125, 130, 140, 145, 162, 163, 170]);

const NUMERAL_STROKES: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

export interface RadicalStroke {
  radical: number;
  residual: number;
  simplified: boolean;
}

/** kRSUnicode 값("85.5", "114.8 140.9", "120'.3") 해석 */
export function parseRS(rs: string): RadicalStroke[] {
  return rs
    .split(' ')
    .filter(Boolean)
    .map((tok) => {
      const m = /^(\d+)('*)\.(-?\d+)$/.exec(tok);
      if (!m) throw new RangeError(`INVALID_RS:${tok}`);
      return { radical: Number(m[1]), residual: Number(m[3]), simplified: (m[2] ?? '').length > 0 };
    });
}

/** 성명학 계산에 쓸 부수 값: 번체 부수 중 변형부수를 우선, 없으면 첫 값 */
export function primaryRadical(rs: string): RadicalStroke {
  const all = parseRS(rs);
  const traditional = all.filter((r) => !r.simplified);
  const pool = traditional.length > 0 ? traditional : all;
  return pool.find((r) => VARIANT_RADICALS.has(r.radical)) ?? (pool[0] as RadicalStroke);
}

export function computeWonStrokes(ch: string, rs: string, totalStrokes: number): number {
  const numeral = NUMERAL_STROKES[ch];
  if (numeral !== undefined) return numeral;
  const r = primaryRadical(rs);
  if (r.simplified || r.residual <= 0) return totalStrokes;
  return Math.max(totalStrokes, kangxiRadicalStrokes(r.radical) + r.residual);
}
