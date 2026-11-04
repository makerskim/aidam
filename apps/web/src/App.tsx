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
            <b>{lib.user.name ?? 'Google 계정'}</b>
            <span className="tiny muted">{lib.user.email ?? (lib.isPreview ? '이 기기에만 저장돼요' : '')}</span>
          </div>
          <button type="button" role="menuitem" onClick={() => go('/me')}>
            내 이름함
          </button>
          <button type="button" role="menuitem" onClick={() => go('/self')}>
            정한 이름 풀어보기
          </button>
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
      <h3>작명 원리</h3>
      <p>
        태어난 순간의 절기를 천문 계산으로 찾아 사주팔자(만세력)를 세우고, 나무·불·흙·쇠·물 다섯 기운의 세기를 따져 가장 필요한 기운(용신)을 찾아요. 그다음 네 가지 기준으로 이름을 봐요.
      </p>
      <ul className="stack" style={{ margin: 0, paddingLeft: 18, gap: 4 }}>
        <li>사주 보완(자원오행): 한자의 기운이 부족한 기운을 채우는지</li>
        <li>소리오행: 이름 첫소리의 기운이 서로 살려 주는지(해례본·운해본)</li>
        <li>81수리: 획수로 본 초년·청년·장년·말년 운이 좋은 수인지</li>
        <li>음양과 뜻: 획수·모음의 균형, 한자의 뜻과 발음</li>
      </ul>
      <h3>출처</h3>
      <p>
        인명용 한자·음·획수 Unicode Unihan Database · 한자 훈음 libhangul · 절기 astronomy-engine · 음력 한국천문연구원 데이터 · 표준시 IANA tz · 글꼴 Pretendard
      </p>
      <p className="tiny muted">전통 성명학에 따른 참고 정보예요. 출생신고 전에 대법원 인명용 한자인지 확인하세요. 같은 정보를 넣으면 언제나 같은 결과가 나와요.</p>
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
        <span className="made-by">Made by makerskim</span>
      </div>
    </footer>
  );
}

function RequireUser({ children }: { children: ReactNode }) {
  const lib = useLibrary();
  const gate = useGate();
  if (lib.user) return <>{children}</>;
  return (
    <main className="container narrow page stack" style={{ alignItems: 'flex-start' }}>
      <h1>로그인이 필요해요</h1>
      <p style={{ color: 'var(--text-2)' }}>내 이름함은 로그인하면 쓸 수 있어요.</p>
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
          <Route path="/self" element={<RequireUser><SelfAnalyze /></RequireUser>} />
          <Route path="/me" element={<RequireUser><MyNames /></RequireUser>} />
          <Route path="/settings" element={<RequireUser><SettingsPage /></RequireUser>} />
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
        <GateProvider>
          <Shell />
        </GateProvider>
      </LibraryProvider>
    </HashRouter>
  );
}
