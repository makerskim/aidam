import { Component, type ReactNode, useEffect } from 'react';
import { HashRouter, NavLink, Route, Routes, Link, useLocation } from 'react-router-dom';
import { Saekdong } from './components/ui';
import { Home } from './pages/Home';
import { NameWizard } from './pages/NameWizard';
import { Results } from './pages/Results';
import { Report } from './pages/Report';
import { SelfAnalyze } from './pages/SelfAnalyze';
import { Siblings } from './pages/Siblings';
import { Manse } from './pages/Manse';
import { Favorites } from './pages/Favorites';
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
          <h1>화면을 그리지 못했어요</h1>
          <p className="muted">입력 링크가 손상됐을 수 있어요. 처음 화면에서 다시 시작해 주세요.</p>
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

function Shell() {
  return (
    <div className="app">
      <ScrollTop />
      <header className="topbar">
        <Saekdong />
        <div className="topbar-inner">
          <Link to="/" className="brand" aria-label="아이담 처음으로">
            아이담 <small>이름에 의미를 담다</small>
          </Link>
          <nav aria-label="주 메뉴">
            <NavLink to="/name">짓기</NavLink>
            <NavLink to="/self">풀이</NavLink>
            <NavLink to="/favorites">찜</NavLink>
          </nav>
        </div>
      </header>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/name" element={<NameWizard />} />
          <Route path="/results" element={<Results />} />
          <Route path="/report" element={<Report />} />
          <Route path="/self" element={<SelfAnalyze />} />
          <Route path="/siblings" element={<Siblings />} />
          <Route path="/manse" element={<Manse />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/guide" element={<Guide />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </ErrorBoundary>
      <footer className="footer stack">
        <div className="row" style={{ gap: 14 }}>
          <Link to="/manse">만세력</Link>
          <Link to="/siblings">다둥이 이름</Link>
          <Link to="/guide">작명 원리·출처</Link>
        </div>
        <p>입력한 정보는 이 기기 안에서만 계산하고 어디에도 보내지 않아요.</p>
      </footer>
    </div>
  );
}

export function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}
