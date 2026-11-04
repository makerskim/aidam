import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { NameReport, Recommendation, SajuResult, PillarsResult } from '@aidam/engine';
import { ELEMENT_HANJA, ELEMENTS, type Element } from '@aidam/engine/src/core/elements';
import { BRANCHES, STEMS, branchElement, stemElement, ZODIAC_KO } from '@aidam/engine/src/core/ganji';
import { meaningFor } from '../lib/format';
import { explainCriteria, nameNarrative, PLAIN, sajuNarrative, sajuSummary, type Criterion } from '../lib/insights';
import { useLibrary } from '../lib/library';
import { useGate } from '../lib/gate';
import { useCountUp } from '../lib/motion';
import { fromSearch, toQuery, type AnalyzeState } from '../lib/state';
import { Icon } from './ui';

export function NameHero({ report, clan }: { report: NameReport; clan?: string }) {
  const sur = report.input.surname.map((c, i) => ({ c, h: report.surnameChars[i] ?? null, sur: true }));
  const giv = report.input.given.map((c, i) => ({ c, h: report.chars[i] ?? null, sur: false }));
  return (
    <div className="syls" aria-label={`${report.fullHangul} ${report.fullHanja ?? ''}`}>
      {[...sur, ...giv].map(({ c, h, sur: isSur }, i) => (
        <div key={i} className={`syl ${isSur ? 'surname' : ''}`}>
          <span className="syl-ko">{c.hangul}</span>
          <span className="syl-hanja">{c.hanja ?? '–'}</span>
          {!isSur && h ? <span className="syl-meaning">{meaningFor(h.meaning, c.hangul)}</span> : null}
          {isSur && i === 0 && clan ? <span className="syl-meaning">{clan} {report.input.surname.map((x) => x.hangul).join('')}씨</span> : null}
        </div>
      ))}
    </div>
  );
}

function CountUp({ value }: { value: number }) {
  const v = useCountUp(value);
  return <span className="num">{Number.isInteger(value) ? Math.round(v) : v.toFixed(1)}</span>;
}

const VERDICT_CLS = { good: 'good', ok: 'ok', bad: 'bad' } as const;

/** 점수표: 기준·한 줄 평가·점수 막대 */
export function ScoreTable({ criteria, total }: { criteria: Criterion[]; total: number }) {
  return (
    <div className="table-wrap">
      <table className="compare" aria-label="점수표">
        <thead>
          <tr>
            <th scope="col">기준</th>
            <th scope="col">평가</th>
            <th scope="col" style={{ textAlign: 'right' }}>
              점수
            </th>
          </tr>
        </thead>
        <tbody>
          {criteria.map((c) => (
            <tr key={c.key}>
              <td>{c.title}</td>
              <td>
                <span className={`verdict ${VERDICT_CLS[c.verdict]}`} style={{ padding: '3px 10px', fontSize: 14 }}>
                  {c.verdictText}
                </span>
              </td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                {c.score === null ? (
                  <span className="muted">–</span>
                ) : (
                  <>
                    <b style={{ color: 'var(--ink)' }}>{c.score}</b>
                    <span className="muted"> / {c.max}</span>
                  </>
                )}
              </td>
            </tr>
          ))}
          <tr>
            <td>합계</td>
            <td />
            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              <b style={{ color: 'var(--ink)', fontSize: 18 }}>{total}</b>
              <span className="muted"> / 100</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function CriterionCard({ c }: { c: Criterion }) {
  const ratio = c.score === null ? 0 : c.score / c.max;
  return (
    <article className="crit">
      <div className="crit-head">
        <h3>{c.title}</h3>
        <span className={`verdict ${VERDICT_CLS[c.verdict]}`}>{c.verdictText}</span>
      </div>
      {c.score !== null ? (
        <div className="row" style={{ flexWrap: 'nowrap', gap: 12 }}>
          <div className="meter" style={{ flex: 1 }}>
            <i className={`${VERDICT_CLS[c.verdict]} grow-x`} style={{ width: `${Math.max(4, ratio * 100)}%` }} />
          </div>
          <span className="num small" style={{ fontWeight: 800, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
            {c.score} / {c.max}
          </span>
        </div>
      ) : null}
      <p className="crit-why">{c.why}</p>
      {c.pros.length ? (
        <ul className="pc pros" aria-label="좋은 점">
          {c.pros.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      ) : null}
      {c.cons.length ? (
        <ul className="pc cons" aria-label="아쉬운 점">
          {c.cons.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export function PillarTable({ base }: { base: PillarsResult }) {
  const p = base.pillars;
  const cols = [
    { head: '태어난 시', pl: p.hour },
    { head: '태어난 날', pl: p.day },
    { head: '태어난 달', pl: p.month },
    { head: '태어난 해', pl: p.year },
  ];
  const cell = (key: string, ch: string | null, e: Element | null) =>
    ch && e ? (
      <div key={key} className={`pillar-cell el-${e}`}>
        {ch}
        <small>{PLAIN[e]}</small>
      </div>
    ) : (
      <div key={key} className="pillar-cell empty">
        모름
      </div>
    );
  return (
    <div className="pillars" aria-label="사주 원국(만세력)">
      {cols.map((c) => (
        <div key={c.head} className="pillar-head">
          {c.head}
        </div>
      ))}
      {cols.map((c) => cell(c.head + 's', c.pl ? (STEMS[c.pl.stem] as string) : null, c.pl ? stemElement(c.pl.stem) : null))}
      {cols.map((c) => cell(c.head + 'b', c.pl ? (BRANCHES[c.pl.branch] as string) : null, c.pl ? branchElement(c.pl.branch) : null))}
    </div>
  );
}

function ElementBars({ power, wanted, avoid }: { power: Record<Element, number>; wanted: Element[]; avoid: Element[] }) {
  return (
    <div className="stack" style={{ gap: 10 }}>
      {ELEMENTS.map((e) => (
        <div key={e} style={{ display: 'grid', gridTemplateColumns: '68px 1fr 48px', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 800, color: 'var(--ink)' }}>
            {PLAIN[e]} <span className="muted">{ELEMENT_HANJA[e]}</span>
          </span>
          <div className="meter" style={{ height: 12 }}>
            <i className="grow-x" style={{ width: `${Math.max(2, power[e])}%`, background: `var(--${e})` }} />
          </div>
          <span className="num small" style={{ textAlign: 'right', fontWeight: 700, color: wanted.includes(e) ? 'var(--primary-ink)' : avoid.includes(e) ? 'var(--bad)' : 'var(--text-2)' }}>
            {Math.round(power[e])}%
          </span>
        </div>
      ))}
    </div>
  );
}

/** 만세력 + 쉬운 분석 */
export function SajuCard({ saju }: { saju: SajuResult }) {
  const a = saju.primary;
  const s = sajuSummary(a);
  const b = saju.base;
  const when = b.corrected ? `${b.solar.year}.${b.solar.month}.${b.solar.day} ${String(b.corrected.hour).padStart(2, '0')}:${String(b.corrected.minute).padStart(2, '0')} (지역 보정)` : `${b.solar.year}.${b.solar.month}.${b.solar.day} · 시간 모름`;
  const chips = (els: Element[], cls: string) =>
    els.map((e) => (
      <span key={e} className={`chip ${cls}`}>
        {PLAIN[e]}({ELEMENT_HANJA[e]})
      </span>
    ));
  return (
    <div className="card stack" style={{ gap: 22 }}>
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div>
          <span className="section-kicker">만세력 · 사주 분석</span>
          <h2 style={{ marginTop: 4 }}>{s.headline}</h2>
        </div>
        <span className="chip">{ZODIAC_KO[a.pillars.year.branch]}띠</span>
      </div>
      <p className="tiny muted num">{when}</p>
      <PillarTable base={b} />
      <blockquote className="expert">
        <span className="expert-label">작명가의 풀이</span>
        {sajuNarrative(a)}
      </blockquote>
      <div className="stack" style={{ gap: 6 }}>
        <h3>다섯 기운의 세기</h3>
        <ElementBars power={a.power} wanted={s.wanted} avoid={s.avoid} />
      </div>
      <div className="stack" style={{ gap: 12 }}>
        <div className="kv">
          <span>이름에 넣으면 좋은 기운</span>
          <span className="row" style={{ justifyContent: 'flex-end' }}>
            {chips(s.wanted, 'chip-primary')}
          </span>
        </div>
        {s.lacking.length ? (
          <div className="kv">
            <span>없거나 약한 기운</span>
            <span className="row" style={{ justifyContent: 'flex-end' }}>
              {chips(s.lacking, '')}
            </span>
          </div>
        ) : null}
        {s.strong.length ? (
          <div className="kv">
            <span>넘치는 기운</span>
            <span className="row" style={{ justifyContent: 'flex-end' }}>
              {chips(s.strong, '')}
            </span>
          </div>
        ) : null}
        {s.avoid.length ? (
          <div className="kv">
            <span>피하면 좋은 기운</span>
            <span className="row" style={{ justifyContent: 'flex-end' }}>
              {chips(s.avoid, 'chip-bad')}
            </span>
          </div>
        ) : null}
      </div>
      {saju.unknownTime ? <p className="small muted">태어난 시각을 몰라 하루 열두 때를 모두 따져, 가장 많이 나온 결과를 썼어요(일치 {Math.round(saju.unknownTime.confidence * 100)}%).</p> : null}
      {saju.alternatives.length ? (
        <p className="small" style={{ color: 'var(--ok)', fontWeight: 600 }}>
          {saju.alternatives.some((x) => x.analysis.yongsin !== a.yongsin) ? '태어난 시각이 경계에 가까워 필요한 기운이 달라질 수 있어요. 출생 기록을 다시 확인해 주세요.' : '태어난 시각이 경계에 가깝지만 필요한 기운은 같아요.'}
        </p>
      ) : null}
    </div>
  );
}

export function ReportView({ report, saju, better, query, clan }: { report: NameReport; saju: SajuResult | null; better: Recommendation[]; query: string; clan?: string }) {
  const lib = useLibrary();
  const gate = useGate();
  const key = report.fullHanja ?? report.fullHangul;
  const entry = { hangul: report.fullHangul, hanja: key, total: report.score.total, grade: report.score.grade, query };
  const saved = lib.isBookmarked(key, query);
  const [copied, setCopied] = useState(false);
  const a = saju?.primary ?? null;
  const criteria = explainCriteria(report, a);
  const { record } = lib;

  // 로그인했다면 풀어 본 이름을 '내 이름함 → 기록'에 자동 저장
  useEffect(() => {
    record({ hangul: report.fullHangul, hanja: key, total: report.score.total, grade: report.score.grade, query });
  }, [record, report.fullHangul, key, report.score.total, report.score.grade, query]);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: `${report.fullHangul} — 아이담`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      }
    } catch {
      /* 취소하거나 막힌 환경 */
    }
  };

  return (
    <div className="split">
      <aside className="sticky-col stack" style={{ gap: 24 }}>
        <div className="card stack" style={{ gap: 20 }}>
          <div className="between" style={{ alignItems: 'flex-start' }}>
            <NameHero report={report} clan={clan} />
            <div className="row" style={{ flexWrap: 'nowrap', gap: 0 }}>
              <button
                type="button"
                className="icon-btn"
                aria-pressed={saved}
                aria-label={saved ? '북마크 해제' : '북마크'}
                onClick={() => (lib.user ? lib.toggleBookmark(entry) : gate.openLogin())}
              >
                {Icon.bookmark(saved)}
              </button>
              <button type="button" className="icon-btn" aria-label="공유하기" onClick={share}>
                {Icon.share}
              </button>
            </div>
          </div>
          <div className="scoreline">
            <b>
              <CountUp value={report.score.total} />점
            </b>
            <span className="grade pop">{report.score.grade}</span>
            {copied ? <span className="small muted">링크를 복사했어요</span> : null}
          </div>
          <blockquote className="expert">
            <span className="expert-label">작명가의 한마디</span>
            {nameNarrative(report, a)}
          </blockquote>
          {!lib.user ? <p className="small muted">로그인하지 않아 이 결과는 저장되지 않아요.</p> : null}
        </div>
        <div className="card stack">
          <h3>점수표</h3>
          <ScoreTable criteria={criteria} total={report.score.total} />
        </div>
      </aside>

      <section className="stack" style={{ gap: 18 }} aria-label="기준별 풀이">
        <div>
          <span className="section-kicker">기준별 풀이</span>
          <h2 style={{ marginTop: 4 }}>무엇이 좋고, 무엇이 아쉬운지</h2>
        </div>
        <div className="stack list-anim" style={{ gap: 16 }}>
          {criteria.map((c) => (
            <CriterionCard key={c.key} c={c} />
          ))}
        </div>
        {saju ? <SajuCard saju={saju} /> : null}
        {better.length ? (
          <div className="stack" style={{ gap: 12 }}>
            <h2>같은 소리, 더 좋은 한자</h2>
            <div className="list">
              {better.map((b) => (
                <BetterRow key={b.hanja} rec={b} />
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function betterQuery(rec: Recommendation): string {
  const cur = fromSearch<AnalyzeState>(window.location.hash.split('?')[1] ?? '');
  if (!cur) return '';
  return toQuery({ ...cur, given: rec.report.input.given });
}

function BetterRow({ rec }: { rec: Recommendation }) {
  const meaning = rec.report.chars.map((h, i) => (h ? meaningFor(h.meaning, rec.report.input.given[i]?.hangul ?? '') : '')).filter(Boolean).join(' · ');
  return (
    <Link className="name-row" to={`/report?${betterQuery(rec)}`}>
      <span className="who">
        <span className="ko">{rec.hangul}</span>
        <span className="hj">{rec.hanja}</span>
        <span className="meaning">{meaning}</span>
      </span>
      <span className="score">
        <b>{rec.report.score.total}</b>
        <small>{rec.report.score.grade}등급</small>
      </span>
      {Icon.chevron}
    </Link>
  );
}
