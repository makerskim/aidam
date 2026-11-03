import { useCallback, useEffect, useState } from 'react';

const PREFIX = 'aidam:';

export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* 저장할 수 없는 환경(사생활 보호 모드 등)에서는 조용히 넘어간다 */
  }
}

export function clearAllStored() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  } catch {
    /* 무시 */
  }
}

/** 기기에만 저장되는 상태 (입력 이어하기, 찜 목록) */
export function useStoredState<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readStored(key, initial));
  useEffect(() => {
    writeStored(key, value);
  }, [key, value]);
  const set = useCallback((v: T | ((p: T) => T)) => setValue(v), []);
  return [value, set];
}
