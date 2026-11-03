/** 오행(五行). 배열 순서는 상생 순환(木→火→土→金→水) 순서다. */
export type Element = 'wood' | 'fire' | 'earth' | 'metal' | 'water';

export const ELEMENTS: readonly Element[] = ['wood', 'fire', 'earth', 'metal', 'water'];

export const ELEMENT_HANJA: Record<Element, '木' | '火' | '土' | '金' | '水'> = {
  wood: '木',
  fire: '火',
  earth: '土',
  metal: '金',
  water: '水',
};

export const ELEMENT_KO: Record<Element, string> = {
  wood: '목',
  fire: '화',
  earth: '토',
  metal: '금',
  water: '수',
};

const idx = (e: Element): number => ELEMENTS.indexOf(e);
const at = (i: number): Element => ELEMENTS[((i % 5) + 5) % 5] as Element;

/** e가 생(生)하는 오행 */
export const generates = (e: Element): Element => at(idx(e) + 1);
/** e를 생하는 오행 */
export const generatorOf = (e: Element): Element => at(idx(e) - 1);
/** e가 극(剋)하는 오행 */
export const controls = (e: Element): Element => at(idx(e) + 2);
/** e를 극하는 오행 */
export const controllerOf = (e: Element): Element => at(idx(e) - 2);

export type ElementRelation = 'same' | 'generates' | 'generatedBy' | 'controls' | 'controlledBy';

/** from 입장에서 본 to와의 관계 */
export function relation(from: Element, to: Element): ElementRelation {
  if (from === to) return 'same';
  if (generates(from) === to) return 'generates';
  if (generatorOf(from) === to) return 'generatedBy';
  if (controls(from) === to) return 'controls';
  return 'controlledBy';
}

export function emptyElementRecord(value = 0): Record<Element, number> {
  return { wood: value, fire: value, earth: value, metal: value, water: value };
}
