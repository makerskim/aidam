import { compose, decompose, type Jamo } from './jamo';

/** 겹받침·쌍받침을 대표음으로 */
const FINAL_REP: Record<string, string> = {
  ㄲ: 'ㄱ', ㅋ: 'ㄱ', ㄳ: 'ㄱ', ㄺ: 'ㄱ', ㅅ: 'ㄷ', ㅆ: 'ㄷ', ㅈ: 'ㄷ', ㅊ: 'ㄷ', ㅌ: 'ㄷ',
  ㅍ: 'ㅂ', ㅄ: 'ㅂ', ㄿ: 'ㅂ', ㄵ: 'ㄴ', ㄶ: 'ㄴ', ㄼ: 'ㄹ', ㄽ: 'ㄹ', ㄾ: 'ㄹ', ㅀ: 'ㄹ', ㄻ: 'ㅁ',
};
const ASPIRATE: Record<string, string> = { ㄱ: 'ㅋ', ㄷ: 'ㅌ', ㅂ: 'ㅍ', ㅈ: 'ㅊ' };
/** 연음 시 그대로 넘어가는 홑받침 */
const LIAISON = new Set(['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅆ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ']);

/**
 * 이름을 이어 읽을 때의 표준 발음을 간략히 추정한다.
 * 다루는 규칙: 연음, 격음화(ㅎ), 비음화, 유음화, ㄹ의 비음화. 그 밖은 표기대로 둔다.
 */
export function pronounce(syllables: string[]): string[] {
  const js: (Jamo | null)[] = syllables.map(decompose);
  for (let i = 0; i < js.length - 1; i++) {
    const a = js[i];
    const b = js[i + 1];
    if (!a || !b || a.final === '') continue;
    const f = a.final;
    const n = b.initial;

    if (n === 'ㅇ') {
      if (f === 'ㅎ') a.final = '';
      else if (LIAISON.has(f)) {
        b.initial = f;
        a.final = '';
      }
      continue;
    }
    if (f === 'ㅎ' && ASPIRATE[n]) {
      b.initial = ASPIRATE[n] as string;
      a.final = '';
      continue;
    }
    const rep = FINAL_REP[f] ?? f;
    if (n === 'ㅎ' && ASPIRATE[rep]) {
      b.initial = ASPIRATE[rep] as string;
      a.final = '';
      continue;
    }
    if (n === 'ㄹ') {
      if (rep === 'ㄴ' || rep === 'ㄹ') {
        a.final = 'ㄹ';
        continue;
      }
      // ㄹ의 비음화: 침략[침냑], 석류[성뉴]
      b.initial = 'ㄴ';
    }
    if (rep === 'ㄹ' && b.initial === 'ㄴ') {
      b.initial = 'ㄹ';
      continue;
    }
    if (b.initial === 'ㄴ' || b.initial === 'ㅁ') {
      if (rep === 'ㄱ') a.final = 'ㅇ';
      else if (rep === 'ㄷ') a.final = 'ㄴ';
      else if (rep === 'ㅂ') a.final = 'ㅁ';
    }
  }
  return js.map((j, i) => (j ? compose(j.initial, j.medial, j.final) : (syllables[i] as string)));
}
