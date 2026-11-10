import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError, dateKo, useAccess, won } from '../lib/access';
import { useLibrary } from '../lib/library';
import { useGate } from '../lib/gate';
import { RETURN_KEY } from '../components/paywall';
import { ErrorText } from '../components/ui';
import { BUSINESS } from '../business';

const CLIENT_KEY = (import.meta.env.VITE_TOSS_CLIENT_KEY as string | undefined) ?? '';

function returnPath(): string {
  try {
    return sessionStorage.getItem(RETURN_KEY) || '/';
  } catch {
    return '/';
  }
}

/** 토스가 돌려보내는 주소(해시 라우터라 ? 쿼리로 받는다) */
const backUrl = (kind: 'success' | 'fail') => `${window.location.origin}${window.location.pathname}?pay=${kind}`;

export function PayPage() {
  const access = useAccess();
  const lib = useLibrary();
  const gate = useGate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = access.plan;

  const pay = async () => {
    if (!lib.user) {
      gate.openLogin();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const order = await api<{ orderId: string; amount: number; orderName: string; customerKey: string }>('/pay/order', {});
      const { loadTossPayments } = await import('@tosspayments/tosspayments-sdk');
      const toss = await loadTossPayments(CLIENT_KEY);
      await toss.payment({ customerKey: order.customerKey }).requestPayment({
        method: 'CARD',
        amount: { currency: 'KRW', value: order.amount },
        orderId: order.orderId,
        orderName: order.orderName,
        successUrl: backUrl('success'),
        failUrl: backUrl('fail'),
        customerEmail: lib.user.email ?? undefined,
        customerName: lib.user.name ?? undefined,
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== 'USER_CANCEL') setError(e instanceof ApiError || e instanceof Error ? e.message : '결제를 시작하지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  const ready = access.enabled && access.payReady && CLIENT_KEY !== '';
  return (
    <main className="container narrow page stack-lg">
      <div className="stack" style={{ gap: 8 }}>
        <span className="section-kicker">이용권</span>
        <h1>아이담 이용권</h1>
        <p style={{ color: 'var(--text-2)' }}>이름을 고르는 동안 마음껏 보고 비교하세요.</p>
      </div>

      {access.admin ? <p className="note-soft">관리자 계정이라 결제 없이 모두 쓸 수 있어요.</p> : null}
      {access.paid && access.until ? (
        <p className="note-soft">
          이용권이 <b>{dateKo(access.until)}</b>까지 있어요. 지금 결제하면 그 뒤로 {plan?.days ?? 30}일이 늘어나요.
        </p>
      ) : null}

      <section className="card stack plan-card">
        <div className="between">
          <b className="plan-name">{plan?.orderName ?? '아이담 이용권'}</b>
          <b className="plan-price num">{plan ? won(plan.amount) : ''}</b>
        </div>
        <ul className="pw-list">
          <li>추천 이름 전체(30개 이상), 쌍둥이·다둥이 세트 전체</li>
          <li>이름마다 항목별 자세한 풀이와 고쳐 보기, 같은 소리 더 좋은 한자</li>
          <li>
            {access.aiReady
              ? `AI가 써 주는 이 이름만의 풀이와 질문 답변(하루 ${access.ai?.limit ?? 20}번)`
              : 'AI 풀이 요청 글 만들기: 내 Claude 계정에 붙여 넣으면 이 이름만의 풀이를 받아요'}
          </li>
          <li>{plan?.days ?? 30}일 동안 이용, 자동으로 다시 결제되지 않아요</li>
        </ul>
        {ready ? (
          <button type="button" className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={() => void pay()}>
            {busy ? '결제창 여는 중…' : lib.user ? `${plan ? won(plan.amount) : ''} 결제하기` : '로그인하고 결제하기'}
          </button>
        ) : (
          <p className="small muted">결제 준비 중이에요. 곧 열려요.</p>
        )}
        {error ? <ErrorText>{error}</ErrorText> : null}
      </section>

      <section className="stack small" style={{ gap: 6, color: 'var(--text-2)' }} aria-label="환불 안내">
        <h2 className="h3">환불 안내</h2>
        <p>결제 후 7일 안에 AI 풀이를 한 번도 받지 않았다면 전액 환불해 드려요. 그 밖의 경우 남은 기간만큼 나누어 돌려드려요.</p>
        <p>환불은 {BUSINESS.email ? <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a> : '고객 문의'}로 결제한 Google 계정과 함께 알려 주세요.</p>
        <p>
          성명학 풀이는 전통 해석에 따른 참고 정보예요. AI 풀이는 Claude(Anthropic)가 사이트의 계산 결과를 글로 풀어 쓴 것이고, 생년월일 원문은 보내지 않아요.
        </p>
      </section>
      <Link to={returnPath()} className="text-btn">
        돌아가기
      </Link>
    </main>
  );
}

/** 토스 결제 뒤 돌아오는 화면: 서버에서 승인하고 이용권을 연다 */
export function PayDone() {
  const access = useAccess();
  const lib = useLibrary();
  const navigate = useNavigate();
  const [state, setState] = useState<{ kind: 'working' | 'ok' | 'fail'; msg?: string; until?: number }>({ kind: 'working' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !lib.cloudReady) return;
    const q = new URLSearchParams(window.location.search);
    const kind = q.get('pay');
    if (kind === 'fail') {
      started.current = true;
      const code = q.get('code');
      setState({ kind: 'fail', msg: code === 'PAY_PROCESS_CANCELED' ? '결제를 취소했어요.' : (q.get('message') ?? '결제가 끝나지 않았어요.') });
      window.history.replaceState(null, '', window.location.pathname + window.location.hash);
      return;
    }
    const paymentKey = q.get('paymentKey');
    const orderId = q.get('orderId');
    const amount = Number(q.get('amount'));
    if (!paymentKey || !orderId) {
      started.current = true;
      setState({ kind: 'fail', msg: '결제 정보가 없어요.' });
      return;
    }
    if (!lib.user) return; // 로그인 상태가 돌아올 때까지 기다린다
    started.current = true;
    api<{ paid: boolean; until: number }>('/pay/confirm', { paymentKey, orderId, amount })
      .then(async (r) => {
        window.history.replaceState(null, '', window.location.pathname + window.location.hash);
        await access.refresh();
        setState({ kind: 'ok', until: r.until });
      })
      .catch((e) => setState({ kind: 'fail', msg: e instanceof Error ? e.message : '결제 승인에 실패했어요.' }));
  }, [lib.cloudReady, lib.user, access]);

  return (
    <main className="container narrow page stack-lg">
      {state.kind === 'working' ? <h1>결제를 확인하고 있어요…</h1> : null}
      {state.kind === 'ok' ? (
        <>
          <h1>결제가 끝났어요</h1>
          <p style={{ color: 'var(--text-2)' }}>{state.until ? `${dateKo(state.until)}까지 모든 이름과 풀이를 볼 수 있어요.` : ''}</p>
          <button type="button" className="btn btn-primary btn-lg" onClick={() => navigate(returnPath(), { replace: true })}>
            보던 화면으로
          </button>
        </>
      ) : null}
      {state.kind === 'fail' ? (
        <>
          <h1>결제가 끝나지 않았어요</h1>
          <ErrorText>{state.msg ?? ''}</ErrorText>
          <div className="row">
            <Link className="btn btn-primary" to="/pay" replace>
              다시 결제하기
            </Link>
            <Link className="btn btn-outline" to={returnPath()} replace>
              돌아가기
            </Link>
          </div>
        </>
      ) : null}
    </main>
  );
}
