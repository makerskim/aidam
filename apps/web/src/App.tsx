import { Component, type ReactNode, useEffect } from 'react';
import { HashRouter, NavLink, Route, Routes, Link, useLocation } from 'react-router-dom';
import { Home } from './pages/Home';
import { NameWizard } from './pages/NameWizard';
import { Results } from './pages/Results';
import { Report } from './pages/Report';
import { SelfAnalyze } from './pages/SelfAnalyze';
import { MyNames } from './pages/MyNames';
import { LibraryProvider, useLibrary } from './lib/library';
import { Guide } from './pages/Guide';

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed) {
      return (
        <main className="stack">
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
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function AccountButton() {
  const lib = useLibrary();
  if (lib.user) {
    return (
      <Link to="/me" className="avatar" aria-label="내 계정">
        {lib.user.photo ? <img src={lib.user.photo} alt="" width={30} height={30} referrerPolicy="no-referrer" /> : (lib.user.name ?? 'G').slice(0, 1)}
      </Link>
    );
  }
  return (
    <Link to="/me" className="login-link">
      로그인
    </Link>
  );
}

function Shell() {
  return (
    <div className="app">
      <ScrollTop />
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand" aria-label="아이담 처음으로">
            <i aria-hidden="true" />
            아이담
          </Link>
          <nav aria-label="주 메뉴">
            <NavLink to="/name">짓기</NavLink>
            <NavLink to="/self">풀이</NavLink>
            <NavLink to="/me">이름함</NavLink>
          </nav>
          <AccountButton />
        </div>
      </header>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/name" element={<NameWizard />} />
          <Route path="/results" element={<Results />} />
          <Route path="/report" element={<Report />} />
          <Route path="/self" element={<SelfAnalyze />} />
          <Route path="/siblings" element={<NameWizard />} />
          <Route path="/manse" element={<NameWizard />} />
          <Route path="/me" element={<MyNames />} />
          <Route path="/favorites" element={<MyNames />} />
          <Route path="/guide" element={<Guide />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </ErrorBoundary>
      <footer className="footer">
        <Link to="/guide">작명 원리와 출처</Link>
        <span>만든 사람 makerskim</span>
      </footer>
    </div>
  );
}

export function App() {
  return (
    <HashRouter>
      <LibraryProvider>
        <Shell />
      </LibraryProvider>
    </HashRouter>
  );
}
