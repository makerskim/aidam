import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useGate } from '../lib/gate';
import { useReveal } from '../lib/motion';

const STEPS = [
  { n: '01', title: '태어난 순간', text: '태어난 날과 시각, 지역으로 만세력을 펼쳐 아이만의 사주 여덟 글자를 세워요.' },
  { n: '02', title: '필요한 기운', text: '나무·불·흙·쇠·물 다섯 기운 가운데 넘치는 것과 모자란 것을 살펴, 이름에 담을 기운을 정해요.' },
  { n: '03', title: '꼭 맞는 이름', text: '그 기운을 지닌 한자에 부르는 소리와 획수, 뜻까지 맞춰 오래 불러도 좋은 이름을 골라요.' },
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
  useReveal(root);
  const start = () => gate.go('/name', true);
  const check = () => gate.go('/name?check=1', true);

  // 스크롤하면 떠다니는 글자가 깊이에 따라 다르게 움직인다(브랜드는 고정)
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

  // 스크롤 스토리: 그림 한가운데와 가장 가까운 단계가 켜진다(그림과 글이 같은 높이에서 바뀜)
  const storyRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const root = storyRef.current;
    if (!root) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const visual = root.querySelector<HTMLElement>('.story-visual');
        const steps = [...root.querySelectorAll<HTMLElement>('.story-step')];
        const v = visual && getComputedStyle(visual).display !== 'none' ? visual.getBoundingClientRect() : null;
        const target = v ? v.top + v.height / 2 : window.innerHeight / 2;
        let best = 0;
        let dist = Infinity;
        steps.forEach((st, k) => {
          const r = st.getBoundingClientRect();
          const d = Math.abs(r.top + r.height / 2 - target);
          if (d < dist) {
            dist = d;
            best = k;
          }
        });
        setActive(best);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

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
          <h1 className="hero-brand">아이담</h1>
          <span className="hero-en">AIDAM</span>
          <p className="hero-tag">아이의 이름에 의미를 담다</p>
          <p className="hero-line">불릴 때마다, 좋은 기운이 닿도록</p>
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
          <h2 className="band-title reveal">이름을 담기 위해</h2>
          <div className="story" ref={storyRef}>
            <div className="story-visual" aria-hidden="true">
              <span className="example-tag">예시</span>
              {STEPS.map((_, i) => (
                <div key={i} className={active === i ? 'on' : ''}>
                  {active === i ? <Visual i={i} /> : null}
                </div>
              ))}
            </div>
            <div className="story-steps">
              {STEPS.map((st, i) => (
                <div key={st.n} className={`story-step ${active === i ? 'on' : ''}`}>
                  <span className="n">{st.n}</span>
                  <h3>{st.title}</h3>
                  <p>{st.text}</p>
                  <div className="story-inline" aria-hidden="true">
                    <span className="example-tag">예시</span>
                    <Visual i={i} />
                  </div>
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
