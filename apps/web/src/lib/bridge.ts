/**
 * 내 컴퓨터의 Claude Code 연결(개인용).
 * 내 컴퓨터에서 켜 둔 연결 프로그램(aidam-claude-bridge.mjs)에 풀이 요청 글을 보내면,
 * 거기 로그인된 공식 Claude Code가 구독 요금제로 글을 써서 돌려준다. 서버나 API 키를 거치지 않는다.
 */
export const BRIDGE_URL = 'http://127.0.0.1:8765';
const KEY = 'aidam:bridge-token';

export function readBridgeToken(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveBridgeToken(token: string) {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    /* 저장이 막힌 환경 */
  }
}

const OFF = '연결 프로그램에 닿지 않아요. 내 컴퓨터에서 켜져 있는지 확인해 주세요.';

async function call<T>(token: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BRIDGE_URL + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(OFF);
  }
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) throw new Error(data.message ?? OFF);
  return data as T;
}

export const bridgeCheck = (token: string) => call<{ ok: boolean }>(token, '/health');
export const bridgeExplain = (token: string, prompt: string) => call<{ text: string }>(token, '/explain', { prompt }).then((r) => r.text);
