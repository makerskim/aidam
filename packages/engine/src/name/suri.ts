import type { Element } from '../core/elements';
import { suriElementOfStrokes } from './suriElement';

export interface FourFrames {
  /** 원격 — 초년운 */
  won: number;
  /** 형격 — 청년운 */
  hyeong: number;
  /** 이격 — 장년운 */
  i: number;
  /** 정격 — 말년·총운 */
  jeong: number;
}

export const FRAME_KO: Record<keyof FourFrames, { name: string; period: string }> = {
  won: { name: '원격(元格)', period: '초년운' },
  hyeong: { name: '형격(亨格)', period: '청년운' },
  i: { name: '이격(利格)', period: '장년운' },
  jeong: { name: '정격(貞格)', period: '말년·총운' },
};

/** 원형이정 4격 (설계서 8.1). surname은 성 획수 합(복성 포함), given은 이름 글자별 원획 */
export function fourFrames(surname: number, given: number[]): FourFrames {
  if (given.length === 0) throw new RangeError('EMPTY_GIVEN_NAME');
  const sum = given.reduce((a, b) => a + b, 0);
  const g1 = given[0] as number;
  if (given.length === 1) return { won: g1, hyeong: surname + g1, i: surname, jeong: surname + g1 };
  return { won: sum, hyeong: surname + g1, i: surname + sum - g1, jeong: surname + sum };
}

export const suriElement = (n: number): Element => suriElementOfStrokes(n);

/** 수리음양: 원획 홀수=양, 짝수=음. 섞여 있으면 균형 */
export function strokeYinYang(strokes: number[]): { pattern: ('yang' | 'yin')[]; balanced: boolean } {
  const pattern = strokes.map((s) => (s % 2 === 1 ? 'yang' : 'yin') as 'yang' | 'yin');
  return { pattern, balanced: pattern.includes('yang') && pattern.includes('yin') };
}
