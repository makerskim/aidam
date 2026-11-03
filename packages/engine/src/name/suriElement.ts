import type { Element } from '../core/elements';

/** 수리오행: 끝자리 1·2 木, 3·4 火, 5·6 土, 7·8 金, 9·0 水 */
export function suriElementOfStrokes(n: number): Element {
  const d = ((n % 10) + 10) % 10;
  if (d === 1 || d === 2) return 'wood';
  if (d === 3 || d === 4) return 'fire';
  if (d === 5 || d === 6) return 'earth';
  if (d === 7 || d === 8) return 'metal';
  return 'water';
}
