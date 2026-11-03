import { useRef } from 'react';
import { useGate } from '../lib/gate';
import { useActiveStep, useReveal } from '../lib/motion';

const STEPS = [
  { n: '01', title: '태어난 순간을 읽어요', text: '생년월일·시각·태어난 곳으로 만세력(사주팔자)을 세워요. 절기는 천문 계산으로 분 단위까지 맞춰요.' },
  { n: '02', title: '부족한 기운을 찾아요', text: '나무·불·흙·쇠·물 다섯 기운 가운데 무엇이 넘치고 모자란지, 이름에 무엇을 채워야 하는지 알려 드려요.' },
  { n: '03', title: '그 기운을 채우는 이름', text: '한자의 기운, 부르는 소리, 획수, 뜻까지 따져 점수가 높은 이름을 추천해요. 쌍둥이는 어울리는 세트로.' },
  { n: '04', title: '이유까지 쉽게 풀어 드려요', text: '무엇이 좋고 무엇이 아쉬운지, 왜 그런지 작명가가 상담하듯 알기 쉽게 설명해요.' },
];

const FEATURES = [
  { mark: '命', cls: 'el-fire', title: '사주를 채워요', text: '사주에 가장 필요한 기운(용신)을 가진 한자를 골라 부족함을 채워요.' },
  { mark: '音', cls: 'el-water', title: '소리가 어울려요', text: '성부터 이름까지 첫소리의 기운이 서로 살려 주는지 봐요.' },
  { mark: '數', cls: 'el-earth', title: '획수가 좋아요', text: '획수로 본 초년·청년·장년·말년 네 시기 운이 모두 좋은 수인지 봐요.' },
  { mark: '意', cls: 'el-wood', title: '뜻이 고와요', text: '좋은 뜻의 인명용 한자만 쓰고, 부르기 쉬운지까지 확인해요.' },
];

function Visual({ i }: { i: number }) {
  if (i === 0) {
    const cells: [string, string][] = [['甲', 'el-wood'], ['丁', 'el-fire'], ['辛', 'el-metal'], ['丙', 'el-fire'], ['辰', 'el-earth'], ['亥', 'el-water'], ['卯', 'el-wood'], ['午', 'el-fire']];
    return (
      <div className="stack" style={{ alignItems: 'center', gap: 18 }}>
        <span className="chip">2026년 3월 14일 오전 9시 30분 · 서울</span>
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
          <span className="chip chip-primary" style={{ justifySelf: 'start' }}>이름에 쇠(金) 기운이 필요해요</span>
        </div>
      </div>
    );
  }
  if (i === 2) {
    return (
      <div className="mini-card">
        <div className="between">
          <span style={{ fontSize: 30, fontWeight: 900, color: 'var(--ink)' }}>김서윤</span>
          <span className="scoreline" style={{ gap: 6 }}>
            <b style={{ fontSize: 28 }}>95</b>
            <span className="grade">S</span>
          </span>
        </div>
        <span style={{ fontSize: 18, color: 'var(--text-2)', fontWeight: 700 }}>金 瑞 潤 · 상서롭고 윤택하게</span>
        <div className="row">
          <span className="chip chip-primary">쇠 기운을 채워요</span>
          <span className="chip chip-good">평생 운 모두 좋은 수</span>
        </div>
      </div>
    );
  }
  return (
    <div className="mini-card">
      <b style={{ color: 'var(--ink)', fontSize: 18 }}>이 이름은 이래서 좋아요</b>
      <ul className="pc pros">
        <li>瑞는 구슬 옥 부수라 쇠 기운이에요. 필요한 기운을 채워요.</li>
        <li>부르는 소리에 서로 누르는 곳이 없어요.</li>
      </ul>
      <ul className="pc cons">
        <li>실제로는 [기마경]처럼 소리 나는 이름은 미리 알려 드려요.</li>
      </ul>
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
          <p className="hero-desc">태어난 순간의 사주를 먼저 읽고, 부족한 기운을 채우는 이름을 지어 드려요. 쌍둥이·세쌍둥이도 함께요.</p>
          <button type="button" className="btn btn-primary btn-lg" onClick={start}>
            이름 짓기 시작
          </button>
        </div>
        <div className="scroll-cue" aria-hidden="true">
          <span>아래로</span>
          <i />
        </div>
      </section>

      <section className="band">
        <div className="container">
          <h2 className="band-title reveal">
            이름 하나를 짓기까지
            <br />
            네 걸음을 걸어요
          </h2>
          <div className="story" ref={storyRef} style={{ marginTop: 48 }}>
            <div className="story-visual" aria-hidden="true">
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
          <h2 className="band-title reveal">정통 성명학의 네 가지 기준</h2>
          <p className="reveal d1" style={{ marginTop: 16, fontSize: 19, color: 'var(--text-2)', maxWidth: 640 }}>
            작명소에서 보는 기준을 그대로, 누구나 알기 쉬운 말로 풀어 드려요.
          </p>
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
          <h2 className="band-title reveal">
            아이에게 주는
            <br />
            첫 번째 선물
          </h2>
          <button type="button" className="btn btn-primary btn-lg reveal d1" onClick={start}>
            이름 짓기 시작
          </button>
        </div>
      </section>
    </main>
  );
}
