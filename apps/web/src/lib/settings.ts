import type { SajuOptions, SchoolOptions } from '@aidam/engine';
import { DEFAULT_SAJU, DEFAULT_SCHOOL } from './state';
import { useStoredState } from './storage';

export interface Settings {
  school: SchoolOptions;
  sajuOpts: SajuOptions;
}

/** 학설·시간 보정 설정 (계정 메뉴 → 설정). 이 기기에 저장된다 */
export function useSettings(): [Settings, (s: Settings) => void] {
  const [s, set] = useStoredState<Settings>('settings', { school: DEFAULT_SCHOOL, sajuOpts: DEFAULT_SAJU });
  return [{ school: { ...DEFAULT_SCHOOL, ...s.school }, sajuOpts: { ...DEFAULT_SAJU, ...s.sajuOpts } }, set];
}
