/** FNV-1a 32비트 (UTF-8 바이트 기준), 8자리 16진수 */
export function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(str)) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** 키 순서를 고정한 JSON 직렬화 (재현 가능한 해시용) */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** 입력·옵션·버전으로 만든 분석 코드 (같으면 같은 결과) */
export function analysisCode(value: unknown): string {
  return fnv1a(stableStringify(value)).toUpperCase();
}
