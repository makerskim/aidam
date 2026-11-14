/**
 * 내 컴퓨터의 Claude Code 연결(개인용).
 * 연결 프로그램(aidam-claude-bridge.mjs)을 켜면 내 컴퓨터(localhost)에서 아이담이 열린다.
 * 그 화면에서는 같은 주소의 /__bridge/explain 으로 풀이 요청 글을 보내고,
 * 내 컴퓨터에 로그인된 공식 Claude Code가 구독 요금제로 글을 써서 돌려준다.
 * 일반 사이트 주소에서는 이 기능이 전혀 보이지 않는다.
 */
const APP = 'aidam-claude-bridge';
const isLocal = typeof window !== 'undefined' && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

let probe: Promise<boolean> | null = null;

/** 이 화면이 연결 프로그램을 통해 열렸는지 */
export function bridgeAvailable(): Promise<boolean> {
  if (!isLocal) return Promise.resolve(false);
  probe ??= fetch('/__bridge/health', { cache: 'no-store' })
    .then((r) => (r.ok ? (r.json() as Promise<{ app?: string }>) : null))
    .then((d) => d?.app === APP)
    .catch(() => false);
  return probe;
}

export async function bridgeExplain(prompt: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch('/__bridge/explain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
  } catch {
    throw new Error('연결 프로그램이 꺼졌어요. 터미널에서 다시 켜 주세요.');
  }
  const data = (await res.json().catch(() => ({}))) as { text?: string; message?: string };
  if (!res.ok || !data.text) throw new Error(data.message ?? 'Claude Code에서 풀이를 받지 못했어요.');
  return data.text;
}
