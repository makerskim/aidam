import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, Modal } from '../components/ui';
import { AFTER_LOGIN, useAccess, type Provider } from './access';
import { useLibrary } from './library';

/** 로그인 안내 창: "로그인하고 시작" 또는 "로그인 없이 하기" */
interface Gate {
  /** 로그인되어 있으면 바로 to로, 아니면 안내 창을 연다. allowGuest면 '로그인 없이 하기'를 보여 준다 */
  go: (to: string, allowGuest?: boolean) => void;
  openLogin: () => void;
  guest: boolean;
}

const Ctx = createContext<Gate | null>(null);
const GUEST_KEY = 'aidam:guest';

export function GateProvider({ children }: { children: ReactNode }) {
  const lib = useLibrary();
  const access = useAccess();
  const navigate = useNavigate();
  const [state, setState] = useState<{ open: boolean; to: string | null; allowGuest: boolean }>({ open: false, to: null, allowGuest: false });
  const [guest, setGuest] = useState(() => {
    try {
      return sessionStorage.getItem(GUEST_KEY) === '1';
    } catch {
      return false;
    }
  });
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);

  const go = useCallback<Gate['go']>(
    (to, allowGuest = true) => {
      if (lib.user || (allowGuest && guest)) navigate(to);
      else setState({ open: true, to, allowGuest });
    },
    [lib.user, guest, navigate],
  );

  const login = async (provider: Provider) => {
    // 서버가 있으면 로그인 화면에 다녀온다. 돌아와서 가려던 화면(state.to)으로 간다
    await lib.signIn(provider, state.to ?? undefined);
    if (!access.enabled) {
      close();
      if (state.to) navigate(state.to);
    }
  };

  // 로그인 화면에서 돌아왔을 때: 주소를 정리하고, 가려던 화면으로 보낸다
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const result = q.get('login');
    if (!result) return;
    window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    let back: string | null = null;
    try {
      back = sessionStorage.getItem(AFTER_LOGIN);
      sessionStorage.removeItem(AFTER_LOGIN);
    } catch {
      /* 저장이 막힌 환경 */
    }
    if (result === 'ok') {
      if (back && back !== '/') navigate(back, { replace: true });
    } else {
      setFailed(true);
      setState({ open: true, to: back, allowGuest: false });
    }
  }, [navigate]);
  const asGuest = () => {
    try {
      sessionStorage.setItem(GUEST_KEY, '1');
    } catch {
      /* 무시 */
    }
    setGuest(true);
    close();
    if (state.to) navigate(state.to);
  };

  return (
    <Ctx.Provider value={{ go, openLogin: () => setState({ open: true, to: null, allowGuest: false }), guest }}>
      {children}
      <Modal open={state.open} onClose={close} labelledBy="gate-title">
        <h2 id="gate-title">{state.allowGuest ? '로그인하고 시작할까요?' : '로그인이 필요해요'}</h2>
        <p style={{ color: 'var(--text-2)' }}>로그인하면 첫 분석 1회가 무료예요. 본 이름이 저장되고, 마음에 드는 이름을 모아 둘 수 있어요.</p>
        {access.enabled && !access.login.google && !access.login.kakao ? <p className="small muted">로그인이 아직 준비 중이에요.</p> : null}
        {!access.enabled || access.login.google ? (
          <button type="button" className="btn btn-lg btn-block google-btn" onClick={() => void login('google')}>
            {Icon.google}
            {access.enabled ? 'Google로 계속하기' : '미리보기 계정으로 로그인'}
          </button>
        ) : null}
        {access.enabled && access.login.kakao ? (
          <button type="button" className="btn btn-lg btn-block kakao-btn" onClick={() => void login('kakao')}>
            {Icon.kakao}
            카카오로 계속하기
          </button>
        ) : null}
        {!access.enabled ? <p className="tiny muted">미리보기에서는 이 기기에만 저장돼요.</p> : null}
        {failed ? <p className="error">로그인하지 못했어요. 다시 시도해 주세요.</p> : null}
        {lib.syncError ? <p className="error">{lib.syncError}</p> : null}
        {state.allowGuest ? (
          <div className="stack" style={{ gap: 6, alignItems: 'center' }}>
            <button type="button" className="text-btn" onClick={asGuest}>
              로그인 없이 하기
            </button>
            <p className="tiny muted">로그인 없이 하면 결과가 저장되지 않아요.</p>
          </div>
        ) : null}
      </Modal>
    </Ctx.Provider>
  );
}

export function useGate(): Gate {
  const v = useContext(Ctx);
  if (!v) throw new Error('GateProvider missing');
  return v;
}
