import { Component, type ReactNode, useEffect, useRef, useState } from 'react';
import { HashRouter, Link, Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { Landing } from './pages/Landing';
import { NameWizard } from './pages/NameWizard';
import { Results } from './pages/Results';
import { Report } from './pages/Report';
import { SelfAnalyze } from './pages/SelfAnalyze';
import { MyNames } from './pages/MyNames';
import { SettingsPage } from './pages/Settings';
import { SajuPage } from './pages/Saju';
import { LibraryProvider, useLibrary } from './lib/library';
import { GateProvider, useGate } from './lib/gate';
import { AccessProvider, timeKo, useAccess } from './lib/access';
import { PayDone, PayPage } from './pages/Pay';
import { ConnectPage } from './pages/Connect';
import { BUSINESS } from './business';

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed) {
      return (
        <main className="container narrow page stack">
          <h1>화면을 열지 못했어요</h1>
          <p className="muted">링크가 손상됐을 수 있어요.</p>
          <a className="btn btn-primary" href="#/" onClick={() => this.setState({ failed: false })}>
            처음으로
          </a>
        </main>
      );
    }
    return this.props.children;
  }
}

function ScrollTop() {
  const { pathname } = useLocation();
  const navType = useNavigationType();
  useEffect(() => {
    // 뒤로 가기(POP)는 각 화면이 보던 자리를 되살린다
    if (navType !== 'POP') window.scrollTo(0, 0);
  }, [pathname, navType]);
  return null;
}

function AccountMenu() {
  const lib = useLibrary();
  const access = useAccess();
  const gate = useGate();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!lib.user) {
    return (
      <button type="button" className="btn btn-sm btn-secondary" onClick={gate.openLogin}>
        로그인
      </button>
    );
  }
  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };
  return (
    <div className="account" ref={ref}>
      <button type="button" className="avatar" aria-haspopup="menu" aria-expanded={open} aria-label="내 계정" onClick={() => setOpen((o) => !o)}>
        {lib.user.photo ? <img src={lib.user.photo} alt="" referrerPolicy="no-referrer" /> : (lib.user.name ?? 'A').slice(0, 1)}
      </button>
      {open ? (
        <div className="menu" role="menu">
          <div className="menu-head">
            <b>
              {lib.user.name ?? 'Google 계정'}
              {access.admin ? <span className="chip chip-primary admin-chip">관리자</span> : null}
            </b>
            <span className="tiny muted">{lib.user.email ?? (lib.isPreview ? '이 기기에만 저장돼요' : '')}</span>
          </div>
          {access.enabled ? (
            <button type="button" role="menuitem" onClick={() => go('/pay')}>
              {access.admin ? '이용권 (관리자 무료)' : access.paid && access.until ? `이용권 · ${timeKo(access.until)}까지` : '이용권'}
            </button>
          ) : null}
          <button type="button" role="menuitem" onClick={() => go('/me?tab=saved')}>
            저장한 이름
          </button>
          <button type="button" role="menuitem" onClick={() => go('/me?tab=history')}>
            검색 기록
          </button>
          {access.admin ? (
            <button type="button" role="menuitem" onClick={() => go('/connect')}>
              내 Claude Code 연결
            </button>
          ) : null}
          <button type="button" role="menuitem" onClick={() => go('/settings')}>
            설정
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void lib.signOut();
              navigate('/');
            }}
          >
            로그아웃
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Header() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <header className={`site-header ${scrolled ? 'scrolled' : ''}`}>
      <div className="container">
        <Link to="/" className="brand" aria-label="아이담 AIDAM 처음으로">
          <b>아이담</b>
          <span>AIDAM</span>
        </Link>
        <div className="header-right">
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}

export function AboutPanel() {
  return (
    <div className="about-panel" id="about">
      <h3>점수는 정해진 규칙으로 계산해요</h3>
      <p>
        점수와 등급은 전통 성명학의 규칙을 그대로 옮긴 계산식으로, 이용자의 브라우저 안에서 계산해요. 그래서 같은 정보를 넣으면 <b>언제나 같은 결과</b>가 나와요. 이용권의 <b>AI 풀이</b>는 이 계산 결과를 Claude(Anthropic)가 자연스러운 글로 풀어 쓴 것이에요.
      </p>
      <h3>이름을 고르는 순서</h3>
      <ol className="stack" style={{ margin: 0, paddingLeft: 20, gap: 4 }}>
        <li>태어난 날·시각·지역으로 만세력(사주 여덟 글자)을 세워요. 해와 달은 입춘·절기 시각으로 바뀌어요.</li>
        <li>나무·불·흙·쇠·물 다섯 기운의 세기를 따져 이름에 담을 기운(용신·희신)을 정해요.</li>
        <li>실제로 많이 쓰는 이름 가운데, 그 기운을 가진 인명용 한자를 붙여 아래 기준으로 100점 만점을 매겨요.</li>
        <li>90점 이상(S등급) 이름만 추천해요.</li>
      </ol>
      <h3>두 가지 계산 기준</h3>
      <ul className="stack" style={{ margin: 0, paddingLeft: 18, gap: 4 }}>
        <li><b>정통 성명학</b>: 사주의 강약과 계절로 필요한 기운(억부·조후 용신)을 정하고, 해례본 첫소리로 소리를 봐요. 한자 기운 30 · 획수 25 · 소리 20 · 음양 10 · 뜻과 발음 15점.</li>
        <li><b>실용 작명법</b>: 사주 여덟 글자에 적은 기운을 채우고, 운해본으로 받침까지 소리를 봐요. 한자 기운 25 · 획수 40(수리오행 15 포함) · 소리 20 · 음양 15점.</li>
        <li><b>두 기준 모두</b>: 두 기준 모두 A등급(80점) 이상인 이름만 골라, 두 점수의 평균이 높은 순으로 보여 드려요.</li>
      </ul>
      <h3>출처</h3>
      <p>
        인명용 한자·음·획수 Unicode Unihan Database · 한자 훈음 libhangul · 절기 astronomy-engine · 음력 한국천문연구원 데이터 · 표준시 IANA tz · 글꼴 Pretendard
      </p>
      <p className="tiny muted">전통 성명학에 따른 참고 정보예요. 출생신고 전에 대법원 인명용 한자인지 확인하세요.</p>
    </div>
  );
}

function Footer() {
  const [open, setOpen] = useState(false);
  return (
    <footer className="site-footer">
      <div className="container">
        <button type="button" className="text-btn" aria-expanded={open} aria-controls="about" onClick={() => setOpen((o) => !o)}>
          작명 원리와 출처 {open ? '닫기' : '보기'}
        </button>
        {open ? <AboutPanel /> : null}
        <BusinessInfo />
        <span className="made-by">Made by makerskim</span>
      </div>
    </footer>
  );
}

/** 토스 결제창에서 돌아오면(?pay=...) 결제 확인 화면으로 보낸다 */
function PayReturn() {
  const navigate = useNavigate();
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('pay')) navigate('/pay/done', { replace: true });
  }, [navigate]);
  return null;
}

function BusinessInfo() {
  const b = BUSINESS;
  const parts = [b.name && `상호 ${b.name}`, b.owner && `대표 ${b.owner}`, b.regNo && `사업자등록번호 ${b.regNo}`, b.mailOrderNo && `통신판매업 ${b.mailOrderNo}`, b.address, b.phone, b.email].filter(Boolean);
  return parts.length ? <p className="tiny muted biz-info">{parts.join(' · ')}</p> : null;
}

function RequireUser({ children }: { children: ReactNode }) {
  const lib = useLibrary();
  const gate = useGate();
  if (lib.user) return <>{children}</>;
  return (
    <main className="container narrow page stack" style={{ alignItems: 'flex-start' }}>
      <h1>로그인이 필요해요</h1>
      <p style={{ color: 'var(--text-2)' }}>저장한 이름과 검색 기록은 로그인하면 볼 수 있어요.</p>
      <button type="button" className="btn btn-primary" onClick={gate.openLogin}>
        로그인
      </button>
    </main>
  );
}

function Shell() {
  return (
    <div className="app">
      <ScrollTop />
      <Header />
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/name" element={<NameWizard />} />
          <Route path="/results" element={<Results />} />
          <Route path="/report" element={<Report />} />
          <Route path="/saju" element={<SajuPage />} />
          <Route path="/self" element={<SelfAnalyze />} />
          <Route path="/me" element={<RequireUser><MyNames /></RequireUser>} />
          <Route path="/settings" element={<RequireUser><SettingsPage /></RequireUser>} />
          <Route path="/pay" element={<PayPage />} />
          <Route path="/pay/done" element={<PayDone />} />
          <Route path="/connect" element={<ConnectPage />} />
          <Route path="*" element={<Landing />} />
        </Routes>
      </ErrorBoundary>
      <Footer />
    </div>
  );
}

export function App() {
  return (
    <HashRouter>
      <LibraryProvider>
        <AccessProvider>
          <GateProvider>
            <PayReturn />
            <Shell />
          </GateProvider>
        </AccessProvider>
      </LibraryProvider>
    </HashRouter>
  );
}
