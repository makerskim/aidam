import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError, timeKo, useAccess, won, type Me } from '../lib/access';
import { useLibrary } from '../lib/library';
import { useGate } from '../lib/gate';
import { readPending } from '../components/paywall';
import { ErrorText } from '../components/ui';
import { BUSINESS } from '../business';

const CLIENT_KEY = (import.meta.env.VITE_TOSS_CLIENT_KEY as string | undefined) ?? '';

const backPath = () => readPending()?.back ?? '/';

/** 토스가 돌려보내는 주소(해시 라우터라 ? 쿼리로 받는다) */
const backUrl = (kind: 'success' | 'fail') => `${window.location.origin}${window.location.pathname}?pay=${kind}`;

/**
 * 관리자 번호: 관리자 계정에만 보인다.
 * '번호 받기'를 누르면 서버가 일회용 6자리 번호를 관리자의 휴대폰으로 보내고, 그 번호를 넣으면 결제 없이 열린다.
 */
function AdminCode({ onDone }: { onDone: () => void }) {
  const access = useAccess();
  const [sent, setSent] = useState<'sms' | 'push' | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '잠시 문제가 생겼어요.');
    } finally {
      setBusy(false);
    }
  };
  const request = () =>
    run(async () => {
      const r = await api<{ channel: 'sms' | 'push' }>('/admin/code', {});
      setSent(r.channel);
      setCode('');
    });
  const verify = () =>
    run(async () => {
      const r = await api<{ me: Me }>('/admin/verify', { code });
      await access.apply(r.me, true);
      onDone();
    });
  const off = () =>
    run(async () => {
      const r = await api<{ me: Me }>('/admin/off', {});
      await access.apply(r.me, true);
      setSent(null);
    });

  return (
    <section className="card stack admin-code" aria-label="관리자 번호">
      <div className="between">
        <b>관리자 번호</b>
        <span className="chip chip-primary">관리자 계정</span>
      </div>
      {access.adminOn ? (
        <>
          <p className="note-soft">
            관리자 모드가 켜져 있어요. <b>{timeKo(access.adminUntil)}</b>까지 결제 없이 모두 볼 수 있어요.
          </p>
          <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void off()}>
            관리자 모드 끄기 (일반 사용자 화면으로 보기)
          </button>
        </>
      ) : access.codeChannel === null ? (
        <p className="small muted">관리자 번호를 받을 휴대폰 설정이 아직 없어요. 설정 안내(docs/payment-setup.md)의 ‘관리자 번호 받을 휴대폰’ 단계를 해 주세요.</p>
      ) : (
        <>
          <p className="small" style={{ color: 'var(--text-2)' }}>
            번호는 누를 때마다 새로 만들어 내 휴대폰으로 보내요({access.codeChannel === 'sms' ? '문자' : '휴대폰 알림'}). 5분 안에 한 번만 쓸 수 있어요.
          </p>
          <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void request()}>
            {sent ? '번호 다시 받기' : '관리자 번호 받기'}
          </button>
          {sent ? (
            <form
              className="ai-ask"
              onSubmit={(e) => {
                e.preventDefault();
                if (code.length === 6) void verify();
              }}
            >
              <input
                className="input num"
                value={code}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="6자리 번호"
                aria-label="관리자 번호"
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
              <button type="submit" className="btn btn-primary" disabled={busy || code.length !== 6}>
                확인
              </button>
            </form>
          ) : null}
        </>
      )}
      {msg ? <ErrorText>{msg}</ErrorText> : null}
    </section>
  );
}

export function PayPage() {
  const access = useAccess();
  const lib = useLibrary();
  const gate = useGate();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = access.plan;
  const pending = readPending();
  const owned = pending ? access.can(pending.ticket) : false;

  const pay = async () => {
    if (!lib.user) {
      gate.openLogin();
      return;
    }
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const order = await api<{ orderId: string; amount: number; orderName: string; customerKey: string }>('/pay/order', { key: pending.ticket });
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
      if (e instanceof ApiError && e.code === 'ALREADY_OWNED') {
        await access.refresh();
        navigate(backPath(), { replace: true });
        return;
      }
      const code = (e as { code?: string }).code;
      if (code !== 'USER_CANCEL') setError(e instanceof Error ? e.message : '결제를 시작하지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  const ready = access.enabled && access.payReady && CLIENT_KEY !== '';
  return (
    <main className="container narrow page stack-lg">
      <div className="stack" style={{ gap: 8 }}>
        <span className="section-kicker">결제</span>
        <h1>이름 분석 1회</h1>
        <p style={{ color: 'var(--text-2)' }}>한 번 결제로 분석 한 건을 전부 볼 수 있어요.</p>
      </div>

      {owned ? (
        <div className="stack" style={{ gap: 12 }}>
          <p className="note-soft">{access.adminOn ? '관리자 모드라 결제 없이 볼 수 있어요.' : '이 분석은 이미 결제했어요. 언제든 다시 볼 수 있어요.'}</p>
          <button type="button" className="btn btn-primary btn-lg" onClick={() => navigate(backPath(), { replace: true })}>
            보던 화면으로
          </button>
        </div>
      ) : (
        <section className="card stack plan-card">
          <div className="between">
            <b className="plan-name">{plan?.orderName ?? '아이담 이름 분석 1회'}</b>
            <b className="plan-price num">{plan ? won(plan.amount) : ''}</b>
          </div>
          <ul className="pw-list">
            <li>이 조건의 추천 이름 전체(30개 이상), 쌍둥이·다둥이는 세트 전체</li>
            <li>이름마다 항목별 자세한 풀이와 고쳐 보기, 같은 소리 더 좋은 한자</li>
            <li>결제한 분석은 로그인하면 언제든 다시 볼 수 있어요</li>
            <li>아이 정보·이름 조건·계산 기준을 바꾸면 새 분석이라 따로 결제해요</li>
            <li>카드, 카카오페이·네이버페이·토스페이 같은 간편결제(결제창에서 선택)</li>
          </ul>
          {!pending ? (
            <p className="small muted">결제할 분석이 없어요. 이름 결과 화면에서 ‘이 분석 전체 보기’를 눌러 주세요.</p>
          ) : ready ? (
            <button type="button" className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={() => void pay()}>
              {busy ? '결제창 여는 중…' : lib.user ? `${plan ? won(plan.amount) : ''} 결제하기` : '로그인하고 결제하기'}
            </button>
          ) : (
            <p className="small muted">결제 준비 중이에요. 곧 열려요.</p>
          )}
          {error ? <ErrorText>{error}</ErrorText> : null}
        </section>
      )}

      {access.admin ? <AdminCode onDone={() => (pending ? navigate(backPath(), { replace: true }) : undefined)} /> : null}

      <section className="stack small" style={{ gap: 6, color: 'var(--text-2)' }} aria-label="환불 안내">
        <h2 className="h3">환불 안내</h2>
        <p>결제한 뒤 잠긴 내용(추천 이름 전체, 자세한 풀이)을 열어 보지 않았다면 전액 환불해 드려요. 열어 본 뒤에는 디지털 콘텐츠 특성상 환불이 어려워요.</p>
        <p>환불은 {BUSINESS.email ? <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a> : '고객 문의'}로 결제한 Google 계정과 함께 알려 주세요.</p>
        <p>성명학 풀이는 전통 해석에 따른 참고 정보예요. 자동으로 다시 결제되지 않아요.</p>
      </section>
      <Link to={backPath()} className="text-btn">
        돌아가기
      </Link>
    </main>
  );
}

/** 토스 결제 뒤 돌아오는 화면: 서버에서 승인하고 그 분석을 연다 */
export function PayDone() {
  const access = useAccess();
  const lib = useLibrary();
  const navigate = useNavigate();
  const [state, setState] = useState<{ kind: 'working' | 'ok' | 'fail'; msg?: string }>({ kind: 'working' });
  const started = useRef(false);
  const { apply } = access;

  useEffect(() => {
    if (started.current || !lib.cloudReady) return;
    const q = new URLSearchParams(window.location.search);
    const kind = q.get('pay');
    const clean = () => window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    if (kind === 'fail') {
      started.current = true;
      const code = q.get('code');
      setState({ kind: 'fail', msg: code === 'PAY_PROCESS_CANCELED' ? '결제를 취소했어요.' : (q.get('message') ?? '결제가 끝나지 않았어요.') });
      clean();
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
    api<{ key: string; me: Me }>('/pay/confirm', { paymentKey, orderId, amount })
      .then(async (r) => {
        clean();
        await apply(r.me);
        setState({ kind: 'ok' });
      })
      .catch((e) => setState({ kind: 'fail', msg: e instanceof Error ? e.message : '결제 승인에 실패했어요.' }));
  }, [lib.cloudReady, lib.user, apply]);

  return (
    <main className="container narrow page stack-lg">
      {state.kind === 'working' ? <h1>결제를 확인하고 있어요…</h1> : null}
      {state.kind === 'ok' ? (
        <>
          <h1>결제가 끝났어요</h1>
          <p style={{ color: 'var(--text-2)' }}>이 분석을 전부 볼 수 있어요. 로그인하면 언제든 다시 볼 수 있어요.</p>
          <button type="button" className="btn btn-primary btn-lg" onClick={() => navigate(backPath(), { replace: true })}>
            결과 보기
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
            <Link className="btn btn-outline" to={backPath()} replace>
              돌아가기
            </Link>
          </div>
        </>
      ) : null}
    </main>
  );
}
