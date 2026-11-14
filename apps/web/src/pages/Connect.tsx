import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useAccess } from '../lib/access';
import { bridgeAvailable } from '../lib/bridge';
import { ErrorText } from '../components/ui';

const BRIDGE = 'http://localhost:8765';

/** 내려받는 연결 프로그램에 지금 사이트 주소를 적어 넣는다 */
async function downloadBridge() {
  const res = await fetch('./aidam-claude-bridge.mjs', { cache: 'no-store' });
  if (!res.ok) throw new Error('연결 프로그램을 내려받지 못했어요.');
  const site = (window.location.origin + window.location.pathname).replace(/\/+$/, '');
  const text = (await res.text()).replace('__AIDAM_SITE__', site);
  const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'aidam-claude-bridge.mjs';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** 내 컴퓨터의 Claude Code 연결 안내(관리자·개인용). 메뉴에 드러내지 않고 관리자 계정 메뉴나 주소(#/connect)로만 들어온다 */
export function ConnectPage() {
  const access = useAccess();
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void bridgeAvailable().then(setConnected);
  }, []);
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : '잠시 문제가 생겼어요.');

  /** 로그인 상태를 내 컴퓨터 화면(localhost)으로 넘기고 그 화면을 연다 */
  const openLocal = async () => {
    setError(null);
    try {
      const { code } = await api<{ code: string }>('/auth/handoff', {});
      window.location.assign(`${BRIDGE}/__bridge/login?code=${encodeURIComponent(code)}`);
    } catch (e) {
      fail(e);
    }
  };

  if (access.enabled && !access.admin) {
    return (
      <main className="container narrow page stack">
        <h1>관리자만 쓸 수 있어요</h1>
        <p style={{ color: 'var(--text-2)' }}>{access.loading ? '확인 중…' : '관리자 계정으로 로그인해 주세요.'}</p>
        <Link className="btn btn-outline" to="/">
          처음으로
        </Link>
      </main>
    );
  }
  return (
    <main className="container narrow page stack-lg">
      <div className="stack" style={{ gap: 8 }}>
        <span className="section-kicker">관리자 · 개인용</span>
        <h1>내 Claude Code 연결</h1>
        <p style={{ color: 'var(--text-2)' }}>
          내 컴퓨터에 로그인된 Claude Code가 구독 요금제로 이름 풀이를 써서, 풀이 화면에 바로 보여 줘요. API 키도 API 비용도 없어요.
        </p>
      </div>
      {connected ? (
        <p className="note-soft">지금 이 화면은 내 Claude Code에 연결되어 있어요. 이름 풀이 화면의 ‘내 Claude Code로 풀이 받기’를 누르면 돼요.</p>
      ) : (
        <section className="card stack">
          <ol className="ai-steps">
            <li>컴퓨터에 Node.js와 Claude Code를 설치하고, 터미널에서 <code>claude</code>를 한 번 실행해 로그인해요.</li>
            <li>아래 버튼으로 연결 프로그램을 내려받아요.</li>
            <li>
              내려받은 폴더에서 터미널로 <code>node aidam-claude-bridge.mjs</code>를 실행해요. 창은 켜 둬요.
            </li>
            <li>{access.enabled ? '아래 ‘내 컴퓨터 화면 열기’를 눌러요. 그 화면에서 이름을 풀이하면 AI 풀이가 바로 나와요.' : '브라우저에 아이담이 자동으로 열려요. 그 화면에서 이름을 풀이하면 AI 풀이가 바로 나와요.'}</li>
          </ol>
          <button type="button" className="btn btn-outline btn-block" onClick={() => void downloadBridge().catch(fail)}>
            연결 프로그램 내려받기
          </button>
          {access.enabled ? (
            <button type="button" className="btn btn-primary btn-block" onClick={() => void openLocal()}>
              내 컴퓨터 화면 열기
            </button>
          ) : null}
          {error ? <ErrorText>{error}</ErrorText> : null}
          <p className="tiny muted">프로그램을 켜 둔 컴퓨터에서만 동작해요. ‘사이트에 연결할 수 없음’이 나오면 프로그램이 꺼져 있는 거예요.</p>
        </section>
      )}
    </main>
  );
}
