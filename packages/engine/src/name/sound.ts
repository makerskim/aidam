import { relation, type Element } from '../core/elements';
import { decompose } from '../hangul/jamo';

/** 음령(발음)오행 학설. haerye: 훈민정음 해례본, unhae: 운해본(작명소 관행) */
export type SoundSchool = 'haerye' | 'unhae';

export const SCHOOL_KO: Record<SoundSchool, string> = { haerye: '해례본', unhae: '운해본' };

const COMMON: Record<string, Element> = {
  ㄱ: 'wood', ㅋ: 'wood', ㄲ: 'wood',
  ㄴ: 'fire', ㄷ: 'fire', ㄹ: 'fire', ㅌ: 'fire', ㄸ: 'fire',
  ㅅ: 'metal', ㅈ: 'metal', ㅊ: 'metal', ㅆ: 'metal', ㅉ: 'metal',
};
const LIP = ['ㅁ', 'ㅂ', 'ㅍ', 'ㅃ'];
const THROAT = ['ㅇ', 'ㅎ'];

/** 자음 하나의 오행 (받침 겹자음은 첫 자음 기준) */
export function consonantElement(c: string, school: SoundSchool): Element | null {
  const first = { ㄳ: 'ㄱ', ㄵ: 'ㄴ', ㄶ: 'ㄴ', ㄺ: 'ㄹ', ㄻ: 'ㄹ', ㄼ: 'ㄹ', ㄽ: 'ㄹ', ㄾ: 'ㄹ', ㄿ: 'ㄹ', ㅀ: 'ㄹ', ㅄ: 'ㅂ' }[c] ?? c;
  if (COMMON[first]) return COMMON[first] as Element;
  if (LIP.includes(first)) return school === 'haerye' ? 'earth' : 'water';
  if (THROAT.includes(first)) return school === 'haerye' ? 'water' : 'earth';
  return null;
}

/** 음절 첫소리(초성)의 오행 */
export function soundElement(syllable: string, school: SoundSchool): Element | null {
  const d = decompose(syllable);
  return d ? consonantElement(d.initial, school) : null;
}

export type FlowKind = 'forward' | 'backward' | 'same' | 'clash';
export const FLOW_KO: Record<FlowKind, string> = { forward: '상생', backward: '역상생', same: '비화', clash: '상극' };
const FLOW_SCORE: Record<FlowKind, number> = { forward: 1, backward: 0.8, same: 0.6, clash: 0 };

export interface SoundFlow {
  elements: (Element | null)[];
  pairs: { from: Element; to: Element; kind: FlowKind; score: number }[];
  /** 0..1 */
  score: number;
}

/** 성→이름 순 오행 흐름 평가 (설계서 8.4). includeFinal이면 받침 오행도 순서에 넣는다 */
export function soundFlow(syllables: string[], school: SoundSchool, includeFinal = false): SoundFlow {
  const elements: (Element | null)[] = [];
  for (const s of syllables) {
    const d = decompose(s);
    elements.push(d ? consonantElement(d.initial, school) : null);
    if (includeFinal && d && d.final) elements.push(consonantElement(d.final, school));
  }
  const known = elements.filter((e): e is Element => e !== null);
  const pairs: SoundFlow['pairs'] = [];
  for (let i = 0; i < known.length - 1; i++) {
    const from = known[i] as Element;
    const to = known[i + 1] as Element;
    const r = relation(from, to);
    const kind: FlowKind = r === 'generates' ? 'forward' : r === 'generatedBy' ? 'backward' : r === 'same' ? 'same' : 'clash';
    pairs.push({ from, to, kind, score: FLOW_SCORE[kind] });
  }
  if (pairs.length === 0) return { elements, pairs, score: 1 };
  let score = pairs.reduce((a, p) => a + p.score, 0) / pairs.length;
  if (known.length >= 3 && new Set(known).size === 1) score -= 0.2;
  return { elements, pairs, score: Math.max(0, Math.min(1, score)) };
}

const YANG_V = new Set(['ㅏ', 'ㅑ', 'ㅗ', 'ㅛ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅐ', 'ㅒ']);
const NEUTRAL_V = new Set(['ㅣ']);

export type VowelPolarity = 'yang' | 'yin' | 'neutral';

/** 소리음양(모음 기준, 설계서 8.5) */
export function vowelYinYang(syllables: string[]): { pattern: VowelPolarity[]; level: 'harmony' | 'normal' | 'unbalanced'; score: number } {
  const pattern = syllables.map((s): VowelPolarity => {
    const m = decompose(s)?.medial ?? 'ㅣ';
    return YANG_V.has(m) ? 'yang' : NEUTRAL_V.has(m) ? 'neutral' : 'yin';
  });
  const hasYang = pattern.includes('yang');
  const hasYin = pattern.includes('yin');
  if (hasYang && hasYin) return { pattern, level: 'harmony', score: 1 };
  if (pattern.includes('neutral')) return { pattern, level: 'normal', score: 0.6 };
  return { pattern, level: 'unbalanced', score: 0 };
}
