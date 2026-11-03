import type { Element } from './elements';

export const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'] as const;
export const STEMS_KO = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'] as const;
export const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const;
export const BRANCHES_KO = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'] as const;
export const ZODIAC_KO = ['쥐', '소', '호랑이', '토끼', '용', '뱀', '말', '양', '원숭이', '닭', '개', '돼지'] as const;

const STEM_ELEMENTS: Element[] = ['wood', 'wood', 'fire', 'fire', 'earth', 'earth', 'metal', 'metal', 'water', 'water'];
const BRANCH_ELEMENTS: Element[] = [
  'water', 'earth', 'wood', 'wood', 'earth', 'fire', 'fire', 'earth', 'metal', 'metal', 'earth', 'water',
];

export const mod = (n: number, m: number): number => ((n % m) + m) % m;

export const stemElement = (i: number): Element => STEM_ELEMENTS[mod(i, 10)] as Element;
export const stemIsYang = (i: number): boolean => mod(i, 2) === 0;
export const branchElement = (i: number): Element => BRANCH_ELEMENTS[mod(i, 12)] as Element;
export const branchIsYang = (i: number): boolean => mod(i, 2) === 0;

/** 기둥(柱): 천간 index(0=甲)와 지지 index(0=子) */
export interface Pillar {
  stem: number;
  branch: number;
}

/** 60갑자 순번(0=甲子) → 기둥 */
export function pillarFromCycle(i: number): Pillar {
  const n = mod(i, 60);
  return { stem: n % 10, branch: n % 12 };
}

/** 기둥 → 60갑자 순번 (중국인의 나머지 정리) */
export function cycleIndex(p: Pillar): number {
  for (let k = 0; k < 6; k++) {
    const n = p.stem + 10 * k;
    if (n % 12 === p.branch) return n;
  }
  throw new RangeError('INVALID_PILLAR');
}

export const pillarHanja = (p: Pillar): string => `${STEMS[p.stem]}${BRANCHES[p.branch]}`;
export const pillarKo = (p: Pillar): string => `${STEMS_KO[p.stem]}${BRANCHES_KO[p.branch]}`;
