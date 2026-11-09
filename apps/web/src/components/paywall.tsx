import { useLocation, useNavigate } from 'react-router-dom';
import { useAccess, won } from '../lib/access';
import { useLibrary } from '../lib/library';
import { useGate } from '../lib/gate';

/** 결제 화면으로 갈 때 돌아올 자리를 기억한다 */
export const RETURN_KEY = 'aidam:pay-return';

export function rememberReturn(path: string) {
  try {
    sessionStorage.setItem(RETURN_KEY, path);
  } catch {
    /* 저장이 막힌 환경 */
  }
}

/** 맛보기 끝에 보이는 잠금 안내 */
export function Paywall({ title, lines, hidden }: { title: string; lines?: string[]; hidden?: number }) {
  const access = useAccess();
  const lib = useLibrary();
  const gate = useGate();
  const navigate = useNavigate();
  const loc = useLocation();
  if (access.unlocked) return null;
  const plan = access.plan;
  const goPay = () => {
    rememberReturn(loc.pathname + loc.search);
    navigate('/pay');
  };
  return (
    <section className="card paywall" aria-label="이용권 안내">
      <span className="pw-lock" aria-hidden="true">
        🔒
      </span>
      <h2 className="pw-title">{title}</h2>
      {hidden ? <p className="pw-count num">{hidden}개 이름이 더 있어요</p> : null}
      <ul className="pw-list">
        {(lines ?? ['추천 이름 전체(30개 이상)', '이름마다 항목별 자세한 풀이와 고쳐 보기', 'AI가 써 주는 이 이름만의 풀이']).map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      {access.loading ? (
        <p className="small muted">이용권 확인 중…</p>
      ) : (
        <div className="pw-actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={goPay}>
            {plan ? `${plan.days}일 이용권 ${won(plan.amount)}` : '이용권 보기'}
          </button>
          {!lib.user ? (
            <button type="button" className="text-btn" onClick={gate.openLogin}>
              이미 결제했어요 · 로그인
            </button>
          ) : null}
        </div>
      )}
      {access.error ? <p className="small" style={{ color: 'var(--bad)' }}>{access.error}</p> : null}
    </section>
  );
}
