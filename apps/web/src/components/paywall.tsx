import { useState } from 'react';
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

/**
 * 맛보기 끝에 보이는 잠금 안내. ticket: 이 화면의 분석 열쇠
 * - 로그인 전: 로그인하면 첫 1회 무료
 * - 무료 1회가 남음: 무료로 이 분석 열기
 * - 무료를 이미 씀: 이 분석 990원
 */
export function Paywall({ ticket, title, lines, hidden }: { ticket: string; title: string; lines?: string[]; hidden?: number }) {
  const access = useAccess();
  const lib = useLibrary();
  const gate = useGate();
  const navigate = useNavigate();
  const loc = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (access.can(ticket)) return null;
  const plan = access.plan;
  const price = plan ? won(plan.amount) : '';
  const goPay = () => {
    rememberPending({ ticket, back: loc.pathname + loc.search });
    navigate('/pay');
  };
  const claimFree = async () => {
    setBusy(true);
    setError(null);
    try {
      await access.claim(ticket);
    } catch (e) {
      setError(e instanceof Error ? e.message : '잠시 문제가 생겼어요.');
      await access.refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card paywall" aria-label="전체 보기 안내">
      <span className="pw-lock" aria-hidden="true">
        🔒
      </span>
      <h2 className="pw-title">{title}</h2>
      {hidden ? <p className="pw-count num">{hidden}개 이름이 더 있어요</p> : null}
      <ul className="pw-list">
        {(lines ?? ['이 조건의 추천 이름 전체(30개 이상)', '이름마다 항목별 자세한 풀이와 고쳐 보기', '연 분석은 언제든 다시 볼 수 있어요']).map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      {!access.ready || access.loading ? (
        <p className="small muted">확인 중…</p>
      ) : !lib.user ? (
        <div className="pw-actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={gate.openLogin}>
            로그인하고 첫 1회 무료로 보기
          </button>
          <p className="tiny muted">첫 분석 1회는 무료예요. 조건을 바꾼 새 분석은 1회 {price}이에요.</p>
        </div>
      ) : access.freeLeft ? (
        <div className="pw-actions">
          <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={() => void claimFree()}>
            {busy ? '여는 중…' : '무료 1회로 이 분석 전체 보기'}
          </button>
          <p className="tiny muted">무료는 계정마다 한 번이에요. 그 뒤 조건을 바꾼 새 분석은 1회 {price}이에요.</p>
        </div>
      ) : (
        <div className="pw-actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={goPay}>
            이 분석 전체 보기 {price}
          </button>
          <p className="tiny muted">무료 1회를 이미 썼어요. 조건을 바꾼 새 분석은 1회 {price}이에요.</p>
        </div>
      )}
      {error || access.error ? <p className="small" style={{ color: 'var(--bad)' }}>{error ?? access.error}</p> : null}
    </section>
  );
}
