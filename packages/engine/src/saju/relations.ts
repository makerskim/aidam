import { relation, type ElementRelation } from '../core/elements';
import { stemElement } from '../core/ganji';

export type StemRelation = 'hap' | ElementRelation;
export type BranchRelation = 'yukhap' | 'samhap' | 'chung' | 'hyeong' | 'hae' | 'wonjin';

export const BRANCH_RELATION_KO: Record<BranchRelation, string> = {
  yukhap: '육합', samhap: '삼합', chung: '충', hyeong: '형', hae: '해', wonjin: '원진',
};

/** a 입장에서 본 천간 관계. 甲己·乙庚·丙辛·丁壬·戊癸는 합 */
export function stemRelation(a: number, b: number): StemRelation {
  if (Math.abs(a - b) === 5) return 'hap';
  return relation(stemElement(a), stemElement(b));
}

const pairIn = (pairs: [number, number][], a: number, b: number) =>
  pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

const YUKHAP: [number, number][] = [[0, 1], [2, 11], [3, 10], [4, 9], [5, 8], [6, 7]];
const SAMHAP: number[][] = [[8, 0, 4], [2, 6, 10], [5, 9, 1], [11, 3, 7]];
const HAE: [number, number][] = [[0, 7], [1, 6], [2, 5], [3, 4], [8, 11], [9, 10]];
const WONJIN: [number, number][] = [[0, 7], [1, 6], [2, 9], [3, 8], [4, 11], [5, 10]];
const HYEONG_GROUPS: number[][] = [[2, 5, 8], [1, 10, 7]];
const SELF_HYEONG = new Set([4, 6, 9, 11]);

export function branchRelations(a: number, b: number): BranchRelation[] {
  const out: BranchRelation[] = [];
  if (pairIn(YUKHAP, a, b)) out.push('yukhap');
  if (a !== b && SAMHAP.some((g) => g.includes(a) && g.includes(b))) out.push('samhap');
  if (Math.abs(a - b) === 6) out.push('chung');
  if (
    (a !== b && HYEONG_GROUPS.some((g) => g.includes(a) && g.includes(b))) ||
    pairIn([[0, 3]], a, b) ||
    (a === b && SELF_HYEONG.has(a))
  ) out.push('hyeong');
  if (pairIn(HAE, a, b)) out.push('hae');
  if (pairIn(WONJIN, a, b)) out.push('wonjin');
  return out;
}
