import type { BirthInput, Gender, NameChar, Preferences, SajuOptions, SchoolOptions } from '@aidam/engine';
import { encodeState, decodeState } from '@aidam/engine/src/share/state';

export const STATE_VERSION = 1;

export interface SurnameSel {
  hangul: string;
  hanja: string;
  /** 본관 (예: 김해). 표시용이며 점수에는 쓰지 않는다 */
  bongwan?: string;
}

/** "김해 김씨" / "김씨" */
export const surnameLabel = (s: SurnameSel): string => `${s.bongwan ? `${s.bongwan} ` : ''}${s.hangul}씨`;

interface Common {
  v: number;
  surname: SurnameSel;
  school: SchoolOptions;
  sajuOpts: SajuOptions;
}

/** 다둥이 아이별 입력 (생일·출생지는 함께 쓰고 성별·시각만 다름) */
export interface KidInput {
  gender: Gender;
  time: { hour: number; minute: number } | null;
}

/** 작명(추천) 입력. kids가 2명 이상이면 다둥이 세트로 짓는다 */
export interface NameState extends Common {
  gender: Gender;
  birth: BirthInput | null;
  prefs: Preferences;
  kids?: KidInput[];
}

export const KID_LABELS = ['첫째', '둘째', '셋째', '넷째'];

/** 다둥이 각자의 출생 정보 */
export function kidBirth(state: NameState, i: number): BirthInput | null {
  const k = state.kids?.[i];
  if (!state.birth) return null;
  return k ? { ...state.birth, time: k.time } : state.birth;
}

/** 특정 이름 분석(리포트·셀프 분석) 입력 */
export interface AnalyzeState extends Common {
  gender: Gender;
  birth: BirthInput | null;
  given: NameChar[];
}


export const DEFAULT_SCHOOL: SchoolOptions = {
  soundSchool: 'haerye',
  strictMode: true,
  femaleStrongNumbers: false,
  excludeBulyong: false,
  includeFinalConsonant: false,
  bothSchoolsNoClash: false,
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
