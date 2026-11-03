import table from '../data/seoul-tz.json';

/** [이 UTC 시각(ms)부터, 오프셋(초)] — IANA tzdata Asia/Seoul에서 추출한 내장표 */
const TRANSITIONS = table as [number, number][];

/** 해당 UTC 순간의 서울 표준시 오프셋(초) */
export function seoulOffsetSecAt(utcMs: number): number {
  let off = (TRANSITIONS[0] as [number, number])[1];
  for (const [t, o] of TRANSITIONS) {
    if (utcMs >= t) off = o;
    else break;
  }
  return off;
}

/**
 * 서울 벽시계 시각 → UTC(ms).
 * 서머타임 종료로 같은 시각이 두 번 있으면 앞선 순간, 시작으로 없는 시각이면 직전 표준시를 쓴다.
 */
export function seoulWallToUtcMs(year: number, month: number, day: number, hour: number, minute: number): number {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const offsets = [...new Set(TRANSITIONS.map(([, o]) => o))].sort((a, b) => b - a);
  for (const o of offsets) {
    const utc = wall - o * 1000;
    if (seoulOffsetSecAt(utc) === o) return utc;
  }
  // 존재하지 않는 시각(서머타임 시작 구간): 직전 오프셋 적용
  return wall - seoulOffsetSecAt(wall - 9 * 3600_000 - 3600_000) * 1000;
}
