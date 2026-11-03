/** 입력 상태를 URL에 넣을 수 있는 base64url(JSON) 문자열로 */
export function encodeState(obj: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** encodeState의 역. 깨진 값이면 null */
export function decodeState<T = unknown>(s: string): T | null {
  if (!s || !/^[A-Za-z0-9_-]+$/.test(s)) return null;
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const v: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return v !== null && typeof v === 'object' ? (v as T) : null;
  } catch {
    return null;
  }
}
