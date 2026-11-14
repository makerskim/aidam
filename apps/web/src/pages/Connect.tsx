import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccess } from '../lib/access';
import { bridgeAvailable } from '../lib/bridge';
import { ErrorText } from '../components/ui';

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

/** 내 컴퓨터의 Claude Code 연결 안내(개인용). 메뉴에 드러내지 않고 주소(#/connect)로만 들어온다 */
export function ConnectPage() {
  const access = useAccess();
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void bridgeAvailable().then(setConnected);
  }, []);

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
        <span className="section-kicker">개인용</span>
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
              내려받은 폴더에서 터미널로 <code>node aidam-claude-bridge.mjs</code>를 실행해요.
            </li>
            <li>브라우저에 아이담이 자동으로 열려요. 그 화면에서 이름을 풀이하면 AI 풀이가 바로 나와요.</li>
          </ol>
          <button type="button" className="btn btn-primary btn-block" onClick={() => void downloadBridge().catch((e) => setError(e instanceof Error ? e.message : '내려받지 못했어요.'))}>
            연결 프로그램 내려받기
          </button>
          {error ? <ErrorText>{error}</ErrorText> : null}
          <p className="tiny muted">연결 번호를 넣을 필요가 없어요. 프로그램을 켜 둔 컴퓨터에서, 프로그램이 열어 준 화면(localhost)에서만 동작해요.</p>
        </section>
      )}
    </main>
  );
}
