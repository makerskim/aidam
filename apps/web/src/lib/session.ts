import { useCallback, useState } from 'react';

/** 이 탭 안에서만 기억하는 화면 상태(결과 화면의 탭·정렬·스크롤 등). 저장이 막혀도 동작한다. */
export function readSession<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(`aidam:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeSession(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(`aidam:${key}`, JSON.stringify(value));
  } catch {
    /* 저장 불가 환경 */
  }
}

export function useSessionState<T>(key: string, initial: T): [T, (patch: Partial<T>) => void] {
  const [value, setValue] = useState<T>(() => ({ ...initial, ...readSession<Partial<T>>(key, {}) }));
  const update = useCallback(
    (patch: Partial<T>) =>
      setValue((prev) => {
        const next = { ...prev, ...patch };
        writeSession(key, next);
        return next;
      }),
    [key],
  );
  return [value, update];
}
