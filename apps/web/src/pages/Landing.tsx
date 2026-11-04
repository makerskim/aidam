import { useRef } from 'react';
import { useGate } from '../lib/gate';
import { useActiveStep, useReveal } from '../lib/motion';

const STEPS = [
  { n: '01', title: '사주를 세워요', text: '태어난 날과 시각으로 만세력을 봐요.' },
  { n: '02', title: '부족한 기운을 찾아요', text: '다섯 기운 가운데 무엇이 모자란지 알려 드려요.' },
  { n: '03', title: '그 기운을 담은 이름', text: '한자·소리·획수·뜻을 따져 점수로 보여 드려요.' },
];

const FEATURES = [
  { mark: '命', cls: 'el-fire', title: '사주를 채워요', text: '모자란 기운을 가진 한자로' },
  { mark: '音', cls: 'el-water', title: '소리가 어울려요', text: '부를 때 기운이 이어지게' },
  { mark: '數', cls: 'el-earth', title: '획수가 좋아요', text: '평생 운이 좋은 수로' },
  { mark: '意', cls: 'el-wood', title: '뜻이 고와요', text: '좋은 뜻의 인명용 한자만' },
];

function Visual({ i }: { i: number }) {
  if (i === 0) {
    const cells: [string, string][] = [['甲', 'el-wood'], ['丁', 'el-fire'], ['辛', 'el-metal'], ['丙', 'el-fire'], ['辰', 'el-earth'], ['亥', 'el-water'], ['卯', 'el-wood'], ['午', 'el-fire']];
    return (
      <div className="stack" style={{ alignItems: 'center', gap: 16 }}>
        <span className="chip">2026. 3. 14. 오전 9:30 · 서울</span>
        <div className="mini-pillars">
          {cells.map(([c, cls], k) => (
            <span key={k} className={cls}>
              {c}
            </span>
          ))}
        </div>
        <span className="small muted">시 · 일 · 월 · 연</span>
      </div>
    );
  }
  if (i === 1) {
    const bars: [string, number, string][] = [['나무', 48, 'var(--wood)'], ['불', 17, 'var(--fire)'], ['흙', 14, 'var(--earth)'], ['쇠', 9, 'var(--metal)'], ['물', 12, 'var(--water)']];
    return (
      <div className="mini-bars">
        {bars.map(([n, w, c]) => (
          <div key={n}>
            <span>{n}</span>
            <i className="grow-x" style={{ width: `${w * 1.6}%`, background: c }} />
          </div>
        ))}
        <div style={{ gridTemplateColumns: '1fr' }}>
          <span className="chip chip-primary" style={{ justifySelf: 'start' }}>
            쇠(金) 기운이 필요해요
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className="mini-card">
      <div className="between">
        <span style={{ fontSize: 30, fontWeight: 900, color: 'var(--ink)' }}>김서윤</span>
        <span className="scoreline" style={{ gap: 6 }}>
          <b style={{ fontSize: 30 }}>95</b>
          <span className="grade">S</span>
        </span>
      </div>
      <span style={{ fontSize: 18, color: 'var(--text-2)', fontWeight: 700 }}>金 瑞 潤</span>
      <div className="row">
        <span className="chip chip-primary">쇠 기운을 채워요</span>
        <span className="chip chip-good">획수 운이 좋아요</span>
      </div>
    </div>
  );
}

export function Landing() {
  const gate = useGate();
  const root = useRef<HTMLElement>(null);
  const storyRef = useRef<HTMLDivElement>(null);
  useReveal(root);
  const active = useActiveStep(storyRef, '.story-step');
  const start = () => gate.go('/name', true);
  const check = () => gate.go('/name?check=1', true);

  return (
    <main className="landing" ref={root}>
      <section className="hero">
        <span className="blob b1" aria-hidden="true" />
        <span className="blob b2" aria-hidden="true" />
        <span className="blob b3" aria-hidden="true" />
        <div className="container hero-inner">
          <h1 className="hero-brand">아이담</h1>
          <span className="hero-en">AIDAM</span>
          <p className="hero-tag">아이의 이름에 의미를 담다</p>
          <p className="hero-desc">사주에 꼭 맞는 아기 이름을 지어 드려요.</p>
          <div className="hero-cta">
            <button type="button" className="btn btn-primary btn-lg" onClick={start}>
              이름 짓기 시작
            </button>
            <button type="button" className="btn btn-outline btn-lg" onClick={check}>
              정한 이름 풀어보기
            </button>
          </div>
        </div>
        <div className="scroll-cue" aria-hidden="true">
          <i />
        </div>
      </section>

      <section className="band">
        <div className="container">
          <h2 className="band-title reveal">이름이 나오기까지</h2>
          <div className="story" ref={storyRef} style={{ marginTop: 40 }}>
            <div className="story-visual" aria-hidden="true">
              <span className="example-tag">예시</span>
              {STEPS.map((_, i) => (
                <div key={i} className={active === i ? 'on' : ''}>
                  <Visual i={i} />
                </div>
              ))}
            </div>
            <div className="story-steps">
              {STEPS.map((s, i) => (
                <div key={s.n} className={`story-step ${active === i ? 'on' : ''}`}>
                  <span className="n">{s.n}</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                  <div className="story-inline">
                    <span className="example-tag">예시</span>
                    <Visual i={i} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="band" style={{ background: 'var(--bg-3)' }}>
        <div className="container">
          <h2 className="band-title reveal">작명의 네 가지 기준</h2>
          <div className="feature-grid">
            {FEATURES.map((f, i) => (
              <div key={f.title} className={`feature reveal d${(i % 3) + 1}`} style={{ background: 'var(--bg)' }}>
                <span className={`mark ${f.cls}`}>{f.mark}</span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="band">
        <div className="container final">
          <h2 className="band-title reveal">아이에게 주는 첫 선물</h2>
          <button type="button" className="btn btn-primary btn-lg reveal d1" onClick={start}>
            이름 짓기 시작
          </button>
        </div>
      </section>
    </main>
  );
}
