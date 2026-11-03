import { compose, decompose } from './jamo';

/**
 * 두음법칙: 단어 첫머리의 ㄹ·ㄴ 소리 변화.
 * ㄹ+ㅑㅕㅖㅛㅠㅣ → ㅇ, ㄹ+그 밖의 모음 → ㄴ, ㄴ+ㅕㅛㅠㅣㅖㅑ → ㅇ
 */
const IOTIZED = new Set(['ㅑ', 'ㅕ', 'ㅖ', 'ㅛ', 'ㅠ', 'ㅣ']);

export function applyDueum(syllable: string): string {
  const d = decompose(syllable);
  if (!d) return syllable;
  if (d.initial === 'ㄹ') return compose(IOTIZED.has(d.medial) ? 'ㅇ' : 'ㄴ', d.medial, d.final);
  if (d.initial === 'ㄴ' && IOTIZED.has(d.medial)) return compose('ㅇ', d.medial, d.final);
  return syllable;
}
