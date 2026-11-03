export const INITIALS = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
export const MEDIALS = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'];
export const FINALS = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

const BASE = 0xac00;
const LAST = 0xd7a3;

export interface Jamo {
  initial: string;
  medial: string;
  final: string;
}

export function isHangulSyllable(s: string): boolean {
  if ([...s].length !== 1) return false;
  const c = s.codePointAt(0) ?? 0;
  return c >= BASE && c <= LAST;
}

export function decompose(s: string): Jamo | null {
  if (!isHangulSyllable(s)) return null;
  const n = (s.codePointAt(0) ?? 0) - BASE;
  return {
    initial: INITIALS[Math.floor(n / 588)] as string,
    medial: MEDIALS[Math.floor((n % 588) / 28)] as string,
    final: FINALS[n % 28] as string,
  };
}

export function compose(initial: string, medial: string, final = ''): string {
  const i = INITIALS.indexOf(initial);
  const m = MEDIALS.indexOf(medial);
  const f = FINALS.indexOf(final);
  if (i < 0 || m < 0 || f < 0) throw new RangeError(`INVALID_JAMO:${initial}${medial}${final}`);
  return String.fromCodePoint(BASE + i * 588 + m * 28 + f);
}

/** 문자열을 한글 음절 배열로 (한글 음절이 아닌 글자가 있으면 null) */
export function toSyllables(s: string): string[] | null {
  const arr = [...s.trim()];
  if (arr.length === 0 || !arr.every(isHangulSyllable)) return null;
  return arr;
}
