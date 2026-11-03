import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { NameReport, Recommendation, SajuResult, SajuAnalysis, PillarsResult } from '@aidam/engine';
import { ELEMENT_HANJA, ELEMENT_KO, ELEMENTS, type Element } from '@aidam/engine/src/core/elements';
import { BRANCHES, STEMS, branchElement, stemElement, ZODIAC_KO } from '@aidam/engine/src/core/ganji';
import { ROLE_KO, STRENGTH_KO } from '@aidam/engine/src/saju/analysis';
import { SCHOOL_KO, FLOW_KO } from '@aidam/engine/src/name/sound';
import { FRAME_KO } from '@aidam/engine/src/name/suri';
import { LUCK_KO } from '@aidam/engine/src/name/suri81';
import { meaningFor } from '../lib/format';
import { insights, nameNarrative, sajuNarrative, sajuSummary, scoreRows } from '../lib/insights';
import { useCountUp } from '../lib/motion';
import { useLibrary } from '../lib/library';
import { fromSearch, toQuery, type AnalyzeState } from '../lib/state';
import { ElementChip, Icon, Notice } from './ui';

const elName = (e: Element) => `${ELEMENT_KO[e]}(${ELEMENT_HANJA[e]})`;

export function NameHero({ report }: { report: NameReport }) {
  const sur = report.input.surname.map((c, i) => ({ c, h: report.surnameChars[i] ?? null, sur: true }));
  const giv = report.input.given.map((c, i) => ({ c, h: report.chars[i] ?? null, sur: false }));
  return (
    <div className="syls" aria-label={`${report.fullHangul} ${report.fullHanja ?? ''}`}>
      {[...sur, ...giv].map(({ c, h, sur: isSur }, i) => (
        <div key={i} className={`syl ${isSur ? 'surname' : ''}`}>
          <span className="syl-ko">{c.hangul}</span>
          <span className="syl-hanja">{c.hanja ?? '–'}</span>
          {!isSur && h ? <span className="syl-meaning">{meaningFor(h.meaning, c.hangul)}</span> : null}
        </div>
      ))}
    </div>
  );
}

export function ScoreTable({ report, saju }: { report: NameReport; saju: SajuAnalysis | null }) {
  const rows = scoreRows(report, saju);
  return (
    <div className="table-wrap">
      <table className="compare" aria-label="점수표">
        <thead>
          <tr>
            <th scope="col">항목</th>
            <th scope="col">평가</th>
            <th scope="col" style={{ textAlign: 'right' }}>점수</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td style={{ color: 'var(--text)', fontWeight: 600 }}>{r.label}</td>
              <td>
                <span className={`chip ${r.tone === 'good' ? 'chip-good' : r.tone === 'bad' ? 'chip-bad' : ''}`}>{r.verdict}</span>
              </td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                {r.score === null ? (
                  <span className="muted">–</span>
                ) : (
                  <>
                    <b>{r.score}</b>
                    <span className="muted"> / {r.max}</span>
                  </>
                )}
              </td>
            </tr>
          ))}
          <tr>
            <td style={{ color: 'var(--text)', fontWeight: 700 }}>합계</td>
            <td>{report.score.partial ? <span className="chip">한자 없는 글자 제외</span> : null}</td>
            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              <b>{report.score.total}</b>
              <span className="muted"> / 100</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function InsightBlock({ title, items, tone }: { title: string; items: string[]; tone: 'good' | 'primary' | 'bad' }) {
  if (!items.length) return null;
  const color = tone === 'good' ? 'var(--good)' : tone === 'bad' ? 'var(--bad)' : 'var(--primary)';
  return (
    <div className="stack" style={{ gap: 8 }}>
      <h3 style={{ color }}>{title}</h3>
      <ul className="stack" style={{ gap: 6, margin: 0, paddingLeft: 18, color: 'var(--text)' }}>
        {items.map((t, i) => (
          <li key={i} style={{ fontSize: 15 }}>
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WhySection({ report, saju }: { report: NameReport; saju: SajuAnalysis | null }) {
  const ins = insights(report, saju);
  return (
    <section className="stack" style={{ gap: 20 }} aria-label="추천 이유">
      <h2>이 이름을 이렇게 봤어요</h2>
      <InsightBlock title="사주에서 채워 주는 것" items={ins.complement} tone="primary" />
      <InsightBlock title="좋은 점" items={ins.good} tone="good" />
      <InsightBlock title="아쉬운 점" items={ins.caution} tone="bad" />
      {!ins.caution.length ? <p className="small muted">특별히 아쉬운 점이 없어요.</p> : null}
    </section>
  );
}

export function PillarTable({ base }: { base: PillarsResult }) {
  const p = base.pillars;
  const cols = [
    { head: '시', pl: p.hour },
    { head: '일', pl: p.day },
    { head: '월', pl: p.month },
    { head: '연', pl: p.year },
  ];
  const cell = (key: string, ch: string | null, e: Element | null) =>
    ch && e ? (
      <div key={key} className={`pillar-cell el-${e}`}>
        {ch}
        <small>{ELEMENT_KO[e]}</small>
      </div>
    ) : (
      <div key={key} className="pillar-cell empty">
        ?
      </div>
    );
  return (
    <div className="pillars" aria-label="사주 원국">
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

export function ElementStrip({ power }: { power: Record<Element, number> }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="element-strip" role="img" aria-label={ELEMENTS.map((e) => `${ELEMENT_KO[e]} ${Math.round(power[e])}%`).join(', ')}>
        {ELEMENTS.map((e) => (
          <span key={e} style={{ width: `${power[e]}%`, background: `var(--${e})` }} />
        ))}
      </div>
      <div className="row tiny num" style={{ gap: 10, color: 'var(--text-2)' }}>
        {ELEMENTS.map((e) => (
          <span key={e}>
            {ELEMENT_HANJA[e]} {Math.round(power[e])}%
          </span>
        ))}
      </div>
    </div>
  );
}

export function SajuView({ saju }: { saju: SajuResult }) {
  const a = saju.primary;
  const b = saju.base;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <PillarTable base={b} />
      <div className="row">
        <span className="chip chip-primary">용신 {ELEMENT_HANJA[a.yongsin]}</span>
        <span className="chip chip-primary">희신 {ELEMENT_HANJA[a.huisin]}</span>
        <span className="chip">{STRENGTH_KO[a.strength.level]}</span>
        <span className="chip">{ZODIAC_KO[a.pillars.year.branch]}띠</span>
      </div>
      <ElementStrip power={a.power} />
      <ul className="stack small" style={{ gap: 6, margin: 0, paddingLeft: 18, color: 'var(--text-2)' }}>
        {a.reasoning.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
      {saju.alternatives.map((alt, i) => (
        <Notice key={i} warn>
          {alt.label}: 용신 {elName(alt.analysis.yongsin)}
          {alt.analysis.yongsin === a.yongsin ? ' (같아요)' : ' (달라져요)'}
        </Notice>
      ))}
    </div>
  );
}

function CountUp({ value }: { value: number }) {
  const v = useCountUp(value);
  return <span className="num">{Number.isInteger(value) ? Math.round(v) : v.toFixed(1)}</span>;
}

function Acc({ title, value, children }: { title: string; value?: ReactNode; children: ReactNode }) {
  return (
    <details className="acc">
      <summary>
        <span className="grow">
          <b>{title}</b>
          {value ? <span className="v">{value}</span> : null}
        </span>
        {Icon.chevron}
      </summary>
      <div className="acc-body">{children}</div>
    </details>
  );
}

export function ReportView({ report, saju, better, query }: { report: NameReport; saju: SajuResult | null; better: Recommendation[]; query: string }) {
  const lib = useLibrary();
  const key = report.fullHanja ?? report.fullHangul;
  const entry = { hangul: report.fullHangul, hanja: key, total: report.score.total, grade: report.score.grade, query };
  const saved = lib.isBookmarked(key, query);
  const { record } = lib;
  // 풀어 본 이름은 '내 이름함 → 기록'에 자동 저장
  useEffect(() => {
    record({ hangul: report.fullHangul, hanja: key, total: report.score.total, grade: report.score.grade, query });
  }, [record, report.fullHangul, key, report.score.total, report.score.grade, query]);
  const [copied, setCopied] = useState(false);
  const a = saju?.primary ?? null;

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
    <div className="stack-lg">
      <section className="hero-name">
        <div className="between" style={{ alignItems: 'flex-start' }}>
          <NameHero report={report} />
          <div className="row" style={{ flexWrap: 'nowrap', gap: 0 }}>
            <button
              type="button"
              className="icon-btn"
              aria-pressed={saved}
              aria-label={saved ? '북마크 해제' : '북마크'}
              onClick={() => lib.toggleBookmark(entry)}
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
      </section>

      <WhySection report={report} saju={a} />

      <section className="stack" aria-label="점수표">
        <h2>점수표</h2>
        <ScoreTable report={report} saju={a} />
      </section>

      <section aria-label="자세히">
        <h2 style={{ marginBottom: 4 }}>자세히 보기</h2>
        {saju ? (
          <Acc title="사주" value={`용신 ${ELEMENT_HANJA[saju.primary.yongsin]} · 희신 ${ELEMENT_HANJA[saju.primary.huisin]}`}>
            <SajuView saju={saju} />
          </Acc>
        ) : null}
        {report.resource.length ? (
          <Acc title="한자별 오행" value={report.resource.map((r) => `${r.ch} ${ELEMENT_HANJA[r.element]}`).join(' · ')}>
            {report.resource.map((r) => (
              <div key={r.ch} className="kv">
                <span>
                  {r.ch} <ElementChip element={r.element} />
                </span>
                <span>
                  {r.role ?? ''} · {r.confidence === 'C' ? '추정' : r.basis.replace(' (성명학 통설)', '')}
                </span>
              </div>
            ))}
          </Acc>
        ) : null}
        {report.frames ? (
          <Acc title="획수 4격" value={report.frameResults.map((f) => `${f.n}`).join(' · ')}>
            {report.frameResults.map((f) => (
              <div key={f.key} className="kv">
                <span>
                  {FRAME_KO[f.key].period} · {f.n}
                </span>
                <span>
                  {f.info.name.split('(')[0]} <span className={`chip ${f.info.luck === 'good' ? 'chip-good' : f.info.luck === 'bad' ? 'chip-bad' : ''}`}>{LUCK_KO[f.info.luck]}</span>
                </span>
              </div>
            ))}
            <p className="tiny muted">획수: {[...report.surnameChars, ...report.chars].map((h) => (h ? `${h.ch} ${h.strokes}` : '?')).join(' · ')}</p>
          </Acc>
        ) : null}
        <Acc title="소리오행" value={`${SCHOOL_KO[report.options.soundSchool]} 기준`}>
          {(['haerye', 'unhae'] as const).map((s) => {
            const f = report.soundBySchool[s];
            return (
              <div key={s} className="kv">
                <span>{SCHOOL_KO[s]}</span>
                <span className="row" style={{ gap: 4 }}>
                  {f.elements.map((e, i) => (e ? <ElementChip key={i} element={e} /> : null))}
                  <span className="small">{f.pairs.map((p) => FLOW_KO[p.kind]).join('·')}</span>
                </span>
              </div>
            );
          })}
        </Acc>
        {a ? (
          <Acc title="오행 역할" value="용신·희신·기신">
            {ELEMENTS.map((e) => (
              <div key={e} className="kv">
                <span>
                  <ElementChip element={e} withName />
                </span>
                <span>{ROLE_KO[a.roles[e]]}</span>
              </div>
            ))}
          </Acc>
        ) : null}
      </section>

      {better.length ? (
        <section className="stack" aria-label="더 좋은 한자">
          <h2>같은 소리, 더 좋은 한자</h2>
          <div className="list">
            {better.map((b) => (
              <BetterRow key={b.hanja} rec={b} />
            ))}
          </div>
        </section>
      ) : null}
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
        <small>{rec.report.score.grade}</small>
      </span>
    </Link>
  );
}

/** 만세력 + 쉬운 분석: 무엇이 부족하고 많은지, 이름에 넣을/피할 기운 */
export function SajuCard({ saju }: { saju: SajuResult }) {
  const a = saju.primary;
  const s = sajuSummary(a);
  const b = saju.base;
  const when = b.corrected
    ? `${b.solar.year}.${b.solar.month}.${b.solar.day} ${String(b.corrected.hour).padStart(2, '0')}:${String(b.corrected.minute).padStart(2, '0')}(보정)`
    : `${b.solar.year}.${b.solar.month}.${b.solar.day} · 시간 모름`;
  const row = (label: string, els: Element[], cls: string) =>
    els.length ? (
      <div className="kv" style={{ alignItems: 'center' }}>
        <span>{label}</span>
        <span className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
          {els.map((e) => (
            <span key={e} className={`chip ${cls}`}>
              {ELEMENT_HANJA[e]} {ELEMENT_KO[e]}
            </span>
          ))}
        </span>
      </div>
    ) : null;
  return (
    <div className="card stack" style={{ gap: 16 }}>
      <div className="between">
        <b>{s.headline}</b>
        <span className="tiny muted num">{when}</span>
      </div>
      <blockquote className="expert">
        <span className="expert-label">작명가의 풀이</span>
        {sajuNarrative(a)}
      </blockquote>
      <PillarTable base={b} />
      <ElementStrip power={a.power} />
      <div className="stack" style={{ gap: 8 }}>
        {row('이름에 넣으면 좋은 기운', s.wanted, 'chip-primary')}
        {row('부족한 기운', s.lacking, '')}
        {row('많은 기운', s.strong, '')}
        {row('피하면 좋은 기운', s.avoid, 'chip-bad')}
      </div>
      <ul className="stack small" style={{ gap: 4, margin: 0, paddingLeft: 18, color: 'var(--text-2)' }}>
        {s.lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
      {saju.unknownTime ? <p className="tiny muted">시간을 몰라 12시진을 모두 따져 가장 많이 나온 용신을 썼어요(일치율 {Math.round(saju.unknownTime.confidence * 100)}%).</p> : null}
      {saju.alternatives.length ? (
        <p className="tiny" style={{ color: 'var(--warn)' }}>
          {saju.alternatives.some((x) => x.analysis.yongsin !== a.yongsin) ? '출생 시각이 경계에 가까워 용신이 달라질 수 있어요. 시각을 다시 확인해 주세요.' : '출생 시각이 경계에 가깝지만 용신은 같아요.'}
        </p>
      ) : null}
    </div>
  );
}
