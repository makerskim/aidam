import { useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { NameReport, SajuAnalysis } from '@aidam/engine';
import { ELEMENT_HANJA, type Element } from '@aidam/engine/src/core/elements';
import { api, useAccess } from '../lib/access';
import { useGate } from '../lib/gate';
import { useLibrary } from '../lib/library';
import { PRESET_LABEL, presetOf } from '../lib/basis';
import { hanjaMeaning } from '../lib/format';
import { PLAIN, type Criterion } from '../lib/insights';
import { rememberReturn } from './paywall';
import { ErrorText } from './ui';

const el = (e: Element) => `${PLAIN[e]}(${ELEMENT_HANJA[e]})`;
const plain = (s: string) => s.replace(/\*\*/g, '');
const ROLE_KO = { yong: '용신', hui: '희신', han: '한신', gu: '구신', gi: '기신' } as Record<string, string>;
const STRENGTH_KO = { veryWeak: '매우 약함', weak: '약함', balanced: '균형', strong: '강함', veryStrong: '매우 강함' } as Record<string, string>;
const FRAME_KO = { won: '원격', hyeong: '형격', i: '이격', jeong: '정격' } as Record<string, string>;

/** AI에 보낼 요약: 사이트가 계산한 값만 담는다(생년월일 원문은 넣지 않는다) */
export function aiSummary(report: NameReport, saju: SajuAnalysis | null, criteria: Criterion[], gender: string | null) {
  return {
    계산기준: ((p) => (p ? PRESET_LABEL[p] : '직접 고른 기준'))(presetOf(report.options)),
    성별: gender === 'male' ? '남자아이' : gender === 'female' ? '여자아이' : null,
    이름: {
      한글: report.fullHangul,
      한자: report.fullHanja,
      글자: report.input.given.map((g, i) => {
        const h = report.chars[i];
        return h
          ? { 소리: g.hangul, 한자: h.ch, 뜻: hanjaMeaning(h, g.hangul), 자원오행: el(h.element), 획수: h.strokes }
          : { 소리: g.hangul, 한자: null };
      }),
    },
    점수: { 총점: Math.round(report.score.total), 등급: report.score.grade },
    항목: criteria.map((c) => ({
      항목: c.title,
      판정: c.verdictText,
      점수: c.score === null ? null : `${Math.round(c.score)}/${c.max}`,
      좋은점: c.pros.slice(0, 4).map(plain),
      아쉬운점: c.cons.slice(0, 4).map(plain),
    })),
    수리: report.frameResults.map((f) => ({ 격: FRAME_KO[f.key] ?? f.key, 수: f.n, 길흉: f.value === 1 ? '길' : f.value === 0 ? '흉' : '반길' })),
    사주: saju
      ? {
          일간: el(saju.dayMaster),
          강약: STRENGTH_KO[saju.strength.level] ?? saju.strength.level,
          용신: el(saju.yongsin),
          희신: el(saju.huisin),
          역할: Object.fromEntries(Object.entries(saju.roles).map(([k, v]) => [el(k as Element), ROLE_KO[v] ?? v])),
          오행개수: Object.fromEntries(Object.entries(saju.counts).map(([k, v]) => [el(k as Element), v])),
        }
      : null,
  };
}

/** **굵게**, ## 소제목, - 목록만 읽는 작은 변환기(HTML을 그대로 넣지 않는다) */
function AiText({ text }: { text: string }) {
  const inline = (s: string): ReactNode[] => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : p));
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={`u${blocks.length}`}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      list.push(line.replace(/^[-*]\s+/, ''));
      continue;
    }
    flush();
    const h = /^#{1,4}\s+(.*)$/.exec(line);
    if (h) blocks.push(<h3 key={`h${blocks.length}`}>{inline(h[1] ?? '')}</h3>);
    else blocks.push(<p key={`p${blocks.length}`}>{inline(line)}</p>);
  }
  flush();
  return <div className="ai-text">{blocks}</div>;
}

export function AiSection({ summary }: { summary: ReturnType<typeof aiSummary> }) {
  const access = useAccess();
  const lib = useLibrary();
  const gate = useGate();
  const navigate = useNavigate();
  const loc = useLocation();
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<{ q: string; text: string }[]>([]);
  if (!access.enabled || !access.aiReady) return null;

  const ask = async (q: string) => {
    if (!lib.user) {
      gate.openLogin();
      return;
    }
    if (!access.unlocked) {
      rememberReturn(loc.pathname + loc.search);
      navigate('/pay');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ text: string; cached: boolean; left: number }>('/ai/explain', { summary, question: q || undefined });
      setAnswers((a) => [...a, { q, text: r.text }]);
      access.setAiLeft(r.left);
      setQuestion('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI 풀이를 받지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card ai-card stack" aria-label="AI 풀이">
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div>
          <span className="section-kicker">AI 풀이</span>
          <h2 style={{ marginTop: 4 }}>이 이름만의 이야기</h2>
        </div>
        {access.ai && access.unlocked ? <span className="chip num">오늘 {access.ai.left}번 남음</span> : null}
      </div>
      {answers.length === 0 ? (
        <>
          <p className="small" style={{ color: 'var(--text-2)' }}>
            사이트가 계산한 점수와 사주를 바탕으로, AI가 이 이름의 뜻과 어울림을 자연스러운 글로 풀어 드려요.
          </p>
          <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={() => void ask('')}>
            {busy ? 'AI가 풀이를 쓰고 있어요…' : access.unlocked ? 'AI 풀이 받기' : '이용권으로 AI 풀이 받기'}
          </button>
        </>
      ) : null}
      {answers.map((a, i) => (
        <div key={i} className="ai-answer">
          {a.q ? <p className="ai-q">“{a.q}”</p> : null}
          <AiText text={a.text} />
        </div>
      ))}
      {answers.length > 0 ? (
        <form
          className="ai-ask"
          onSubmit={(e) => {
            e.preventDefault();
            if (question.trim()) void ask(question.trim());
          }}
        >
          <input
            className="input"
            value={question}
            maxLength={300}
            placeholder="더 궁금한 점을 물어보세요 (예: 첫째 이름과 어울리나요?)"
            aria-label="AI에게 질문"
            onChange={(e) => setQuestion(e.target.value)}
          />
          <button type="submit" className="btn btn-outline" disabled={busy || !question.trim()}>
            {busy ? '쓰는 중…' : '묻기'}
          </button>
        </form>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <p className="tiny muted">AI(Claude)가 쓴 글이라 틀릴 수 있어요. 점수와 등급은 사이트 계산이 기준이에요. 생년월일 원문은 보내지 않아요.</p>
    </section>
  );
}
