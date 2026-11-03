import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, Modal } from '../components/ui';
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

  const login = async () => {
    await lib.signIn();
    close();
    if (state.to) navigate(state.to);
  };
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
        <p style={{ color: 'var(--text-2)' }}>로그인하면 지은 이름이 내 이름함에 자동으로 저장되고, 북마크해 두고 언제든 다시 볼 수 있어요.</p>
        <button type="button" className="btn btn-lg btn-block google-btn" onClick={() => void login()}>
          {Icon.google}
          {lib.cloudConfigured ? 'Google로 계속하기' : '미리보기 계정으로 로그인'}
        </button>
        {!lib.cloudConfigured ? <p className="tiny muted">Google 로그인은 연결 준비 중이에요. 지금은 미리보기 계정으로 이 기기에만 저장돼요.</p> : null}
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
