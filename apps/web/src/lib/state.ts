import type { BirthInput, Gender, NameChar, Preferences, SajuOptions, SchoolOptions, ChildInput } from '@aidam/engine';
import { encodeState, decodeState } from '@aidam/engine/src/share/state';

export const STATE_VERSION = 1;

export interface SurnameSel {
  hangul: string;
  hanja: string;
}

interface Common {
  v: number;
  surname: SurnameSel;
  school: SchoolOptions;
  sajuOpts: SajuOptions;
}

/** 작명(추천) 입력 */
export interface NameState extends Common {
  gender: Gender;
  birth: BirthInput | null;
  prefs: Preferences;
}

/** 특정 이름 분석(리포트·셀프 분석) 입력 */
export interface AnalyzeState extends Common {
  gender: Gender;
  birth: BirthInput | null;
  given: NameChar[];
}

/** 다둥이 입력 */
export interface SiblingState extends Common {
  children: ChildInput[];
  prefs: Preferences;
  mode: 'recommend' | 'analyze';
}

export const DEFAULT_SCHOOL: SchoolOptions = {
  soundSchool: 'haerye',
  strictMode: true,
  femaleStrongNumbers: false,
  excludeBulyong: false,
  includeFinalConsonant: false,
};
export const DEFAULT_SAJU: SajuOptions = { trueSolarTime: true, equationOfTime: false, ziHour: 'nextDay' };
export const DEFAULT_PREFS: Preferences = { length: 2, style: 'balanced' };

export const surnameChars = (s: SurnameSel): NameChar[] =>
  [...s.hangul].map((h, i) => ({ hangul: h, hanja: [...s.hanja][i] ?? null }));

export function toQuery<T extends { v: number }>(state: T): string {
  return `s=${encodeState(state)}`;
}

export function fromSearch<T extends { v: number }>(search: string): T | null {
  const s = new URLSearchParams(search).get('s');
  if (!s) return null;
  const v = decodeState<T>(s);
  return v && v.v === STATE_VERSION ? v : null;
}

export { encodeState, decodeState };
