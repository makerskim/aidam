import { Link } from 'react-router-dom';
import { Icon } from '../components/ui';

const STEPS = [
  ['1', '태어난 순간으로 만세력을 세워요'],
  ['2', '부족한 기운과 넘치는 기운을 풀어 드려요'],
  ['3', '그 기운을 채우는 이름을 골라 드려요'],
];

export function Home() {
  return (
    <main className="stack-lg">
      <section className="stack rise" style={{ gap: 14, paddingTop: 20 }}>
        <h1 className="hero-title">
          아이의 이름에
          <br />
          의미를 담다
        </h1>
        <p style={{ color: 'var(--text-2)', fontSize: 17 }}>사주를 먼저 읽고, 꼭 맞는 이름을 지어 드려요.</p>
      </section>

      <ol className="list rise" style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="이름 짓는 순서">
        {STEPS.map(([n, t]) => (
          <li key={n} className="list-row" style={{ cursor: 'default', fontSize: 16 }}>
            <span className="ico" style={{ background: 'var(--primary-soft)', color: 'var(--primary)', width: 36, height: 36, borderRadius: 12, fontSize: 15 }} aria-hidden="true">
              {n}
            </span>
            <span className="grow">{t}</span>
          </li>
        ))}
      </ol>

      <div className="stack rise">
        <Link className="btn btn-primary btn-block" to="/name">
          이름 짓기 시작
        </Link>
        <p className="tiny muted" style={{ textAlign: 'center' }}>
          쌍둥이·세쌍둥이도 함께 지을 수 있어요
        </p>
      </div>

      <nav className="list" aria-label="다른 기능">
        <Link to="/self" className="list-row">
          <span className="grow">
            지은 이름 풀어보기
            <span className="sub">좋은 점, 아쉬운 점을 알려 드려요</span>
          </span>
          {Icon.chevron}
        </Link>
        <Link to="/me" className="list-row">
          <span className="grow">
            내 이름함
            <span className="sub">풀어 본 이름과 북마크를 모아 봐요</span>
          </span>
          {Icon.chevron}
        </Link>
      </nav>

      <section className="credit stack" aria-label="작명 원리와 출처">
        <h2>작명 원리와 출처</h2>
        <p style={{ color: 'var(--text-2)', fontSize: 15 }}>
          정통 성명학의 네 가지 기준(사주와 용신, 자원오행, 소리오행, 81수리)으로 이름을 살펴요. 절기는 천문 계산으로, 한자 정보는 Unicode Unihan과 libhangul 사전으로 확인해요.
        </p>
        <div className="between">
          <span className="small muted">만든 사람 · makerskim</span>
          <Link to="/guide" className="small" style={{ color: 'var(--primary)', fontWeight: 600 }}>
            자세히 보기
          </Link>
        </div>
      </section>
    </main>
  );
}
