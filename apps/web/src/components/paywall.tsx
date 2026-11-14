import { useLocation, useNavigate } from 'react-router-dom';
import { useAccess, won } from '../lib/access';
import { useLibrary } from '../lib/library';
import { useGate } from '../lib/gate';

/** 결제 화면으로 갈 때, 어떤 분석을 결제하는지와 돌아올 자리를 기억한다 */
const PENDING_KEY = 'aidam:pay';

export interface Pending {
  /** 결제할 분석의 열쇠 */
  ticket: string;
  /** 돌아올 화면 */
  back: string;
}

export function rememberPending(p: Pending) {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(p));
  } catch {
    /* 저장이 막힌 환경 */
  }
}

export function readPending(): Pending | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null') as Pending | null;
    return v && typeof v.ticket === 'string' && typeof v.back === 'string' ? v : null;
  } catch {
    return null;
  }
}

/** 맛보기 끝에 보이는 잠금 안내. ticket: 이 화면의 분석 열쇠 */
export function Paywall({ ticket, title, lines, hidden }: { ticket: string; title: string; lines?: string[]; hidden?: number }) {
  const access = useAccess();
  const lib = useLibrary();
  const gate = useGate();
  const navigate = useNavigate();
  const loc = useLocation();
  if (access.can(ticket)) return null;
  const plan = access.plan;
  const goPay = () => {
    rememberPending({ ticket, back: loc.pathname + loc.search });
    navigate('/pay');
  };
  return (
    <section className="card paywall" aria-label="결제 안내">
      <span className="pw-lock" aria-hidden="true">
        🔒
      </span>
      <h2 className="pw-title">{title}</h2>
      {hidden ? <p className="pw-count num">{hidden}개 이름이 더 있어요</p> : null}
      <ul className="pw-list">
        {(lines ?? ['이 조건의 추천 이름 전체(30개 이상)', '이름마다 항목별 자세한 풀이와 고쳐 보기', '결제한 분석은 언제든 다시 볼 수 있어요']).map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      {access.loading ? (
        <p className="small muted">결제 내역 확인 중…</p>
      ) : (
        <div className="pw-actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={goPay}>
            {plan ? `이 분석 전체 보기 ${won(plan.amount)}` : '전체 보기'}
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
