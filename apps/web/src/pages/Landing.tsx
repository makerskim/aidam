import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useGate } from '../lib/gate';
import { useReveal } from '../lib/motion';

/** 히어로에서 천천히 바뀌는 한 줄 */
const LINES = ['불릴 때마다, 좋은 기운이 닿도록', '태어난 순간의 빛을 이름에 담아요', '평생 함께할 첫 번째 선물'];

const STEPS = [
  { n: '01', title: '태어난 순간', text: '만세력으로 사주를 세워요' },
  { n: '02', title: '필요한 기운', text: '모자란 기운을 찾아요' },
  { n: '03', title: '꼭 맞는 이름', text: '그 기운을 담아 지어요' },
];

const FEATURES = [
  { mark: '命', cls: 'el-fire', title: '사주를 채워요', text: '모자란 기운을 가진 한자로' },
  { mark: '音', cls: 'el-water', title: '소리가 어울려요', text: '부를 때 기운이 이어지게' },
  { mark: '數', cls: 'el-earth', title: '획수가 좋아요', text: '평생 운이 좋은 수로' },
  { mark: '意', cls: 'el-wood', title: '뜻이 고와요', text: '좋은 뜻의 인명용 한자만' },
];

/** 히어로 둘레를 떠다니는 글자: [글자, 위치(top,left %), 깊이, 오행] */
const FLOATS: [string, number, number, number, string][] = [
  ['木', 18, 12, 1.2, 'el-wood'],
  ['火', 70, 8, 0.7, 'el-fire'],
  ['土', 12, 84, 0.9, 'el-earth'],
  ['金', 66, 88, 1.4, 'el-metal'],
  ['水', 40, 94, 0.6, 'el-water'],
  ['名', 84, 30, 1.1, 'el-fire'],
  ['福', 30, 4, 0.8, 'el-earth'],
  ['愛', 86, 70, 1.3, 'el-wood'],
];

const STEP_MS = 3800;
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const Arrow = (
  <svg className="arr" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

function Visual({ i }: { i: number }) {
  if (i === 0) {
    const cells: [string, string][] = [['甲', 'el-wood'], ['丁', 'el-fire'], ['辛', 'el-metal'], ['丙', 'el-fire'], ['辰', 'el-earth'], ['亥', 'el-water'], ['卯', 'el-wood'], ['午', 'el-fire']];
    return (
      <div className="stack" style={{ alignItems: 'center', gap: 16 }}>
        <span className="chip">2026. 3. 14. 오전 9:30 · 서울</span>
        <div className="mini-pillars">
          {cells.map(([c, cls], k) => (
            <span key={k} className={cls} style={{ '--k': k } as CSSProperties}>
              {c}
            </span>
          ))}
        </div>
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
          <span className="chip chip-primary pulse" style={{ justifySelf: 'start' }}>
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
          <span className="grade pop">S</span>
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
  const heroRef = useRef<HTMLElement>(null);
  const showRef = useRef<HTMLDivElement>(null);
  useReveal(root);
  const start = () => gate.go('/name', true);
  const check = () => gate.go('/name?check=1', true);

  // 바뀌는 한 줄
  const [line, setLine] = useState(0);
  useEffect(() => {
    if (reduced()) return;
    const id = window.setInterval(() => setLine((l) => (l + 1) % LINES.length), 3200);
    return () => window.clearInterval(id);
  }, []);

  // 스크롤하면 브랜드가 작아지며 물러나고, 떠다니는 글자는 깊이에 따라 다르게 움직인다
  useEffect(() => {
    const el = heroRef.current;
    if (!el || reduced()) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const p = Math.min(1, Math.max(0, window.scrollY / (el.offsetHeight * 0.75)));
        el.style.setProperty('--p', p.toFixed(3));
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // 세 단계는 화면에 보이면 저절로 넘어간다(누르면 그 단계로)
  const [cur, setCur] = useState(0);
  const [tick, setTick] = useState(0);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = showRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setVisible(Boolean(e?.isIntersecting)), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || reduced()) return;
    const id = window.setTimeout(() => setCur((c) => (c + 1) % STEPS.length), STEP_MS);
    return () => window.clearTimeout(id);
  }, [cur, visible, tick]);
  const select = (i: number) => {
    setCur(i);
    setTick((t) => t + 1);
  };

  return (
    <main className="landing" ref={root}>
      <section className="hero" ref={heroRef}>
        <span className="blob b1" aria-hidden="true" />
        <span className="blob b2" aria-hidden="true" />
        <span className="blob b3" aria-hidden="true" />
        <div className="floats" aria-hidden="true">
          {FLOATS.map(([c, top, left, depth, cls], i) => (
            <span key={c} className="fl" style={{ top: `${top}%`, left: `${left}%`, '--d': depth, '--i': i } as CSSProperties}>
              <i className={cls}>{c}</i>
            </span>
          ))}
        </div>
        <div className="container hero-inner">
          <h1 className="hero-brand" aria-label="아이담">
            {['아', '이', '담'].map((c, i) => (
              <span key={c} style={{ '--i': i } as CSSProperties} aria-hidden="true">
                {c}
              </span>
            ))}
          </h1>
          <span className="hero-en">AIDAM</span>
          <p className="hero-tag">아이의 이름에 의미를 담다</p>
          <p className="hero-line" aria-live="polite">
            <span key={line}>{LINES[line]}</span>
          </p>
          <div className="hero-cta">
            <button type="button" className="btn btn-primary btn-lg btn-shine" onClick={start}>
              이름 짓기 {Arrow}
            </button>
            <button type="button" className="btn btn-glass btn-lg" onClick={check}>
              이름 풀이
            </button>
          </div>
        </div>
      </section>

      <section className="band">
        <div className="container">
          <h2 className="band-title reveal">이름에 담기까지</h2>
          <div className="show" ref={showRef}>
            <div className="show-tabs" role="tablist" aria-label="이름이 나오는 과정">
              {STEPS.map((s, i) => (
                <button key={s.n} type="button" role="tab" aria-selected={cur === i} className={`show-tab reveal d${i + 1}`} onClick={() => select(i)}>
                  <span className="n">{s.n}</span>
                  <b>{s.title}</b>
                  <span className="t">{s.text}</span>
                  {cur === i ? <i className={`prog ${visible ? 'run' : ''}`} key={`${cur}-${tick}-${visible}`} style={{ animationDuration: `${STEP_MS}ms` }} /> : null}
                </button>
              ))}
            </div>
            <div className="show-visual reveal d2" aria-hidden="true">
              <span className="example-tag">예시</span>
              {STEPS.map((_, i) => (
                <div key={i} className={cur === i ? 'on' : ''}>
                  {cur === i ? <Visual i={i} /> : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="band band-soft">
        <div className="container">
          <h2 className="band-title reveal">작명의 네 가지 기준</h2>
          <div className="feature-grid">
            {FEATURES.map((f, i) => (
              <div key={f.title} className={`feature reveal d${(i % 3) + 1}`}>
                <span className={`mark ${f.cls}`}>{f.mark}</span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            ))}
          </div>
          <div className="final reveal">
            <p className="final-line">아이에게 주는 첫 선물</p>
            <button type="button" className="btn btn-primary btn-lg btn-shine" onClick={start}>
              이름 짓기 {Arrow}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
