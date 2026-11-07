import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { NameReport, Recommendation, SajuResult, PillarsResult, SchoolOptions } from '@aidam/engine';
import { ELEMENT_HANJA, ELEMENTS, type Element } from '@aidam/engine/src/core/elements';
import { BRANCHES, STEMS, branchElement, stemElement, ZODIAC_KO } from '@aidam/engine/src/core/ganji';
import { hanjaMeaning } from '../lib/format';
import { PRESET_LABEL, presetOf, withPreset } from '../lib/basis';
import { explainCriteria, nameHighlights, nameNarrative, PLAIN, sajuBrief, sajuEval, sajuNarrative, sajuSummary, tidy, type Criterion, type SajuRow } from '../lib/insights';
import { Rich } from './rich';
import { useLibrary } from '../lib/library';
import { useGate } from '../lib/gate';
import { useCountUp } from '../lib/motion';
import { DEFAULT_PREFS, fromSearch, STATE_VERSION, toQuery, type AnalyzeState, type NameState } from '../lib/state';
import { Icon } from './ui';

export function NameHero({ report }: { report: NameReport }) {
  const sur = report.input.surname.map((c, i) => ({ c, h: report.surnameChars[i] ?? null, sur: true }));
  const giv = report.input.given.map((c, i) => ({ c, h: report.chars[i] ?? null, sur: false }));
  return (
    <div className="syls" aria-label={`${report.fullHangul} ${report.fullHanja ?? ''}`}>
      {[...sur, ...giv].map(({ c, h, sur: isSur }, i) => (
        <div key={i} className={`syl ${isSur ? 'surname' : ''}`}>
          <span className="syl-ko">{c.hangul}</span>
          <span className="syl-hanja">{c.hanja ?? '–'}</span>
          {!isSur && h ? <span className="syl-meaning">{hanjaMeaning(h, c.hangul)}</span> : null}
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

export function PillarTable({ base, small = false, big = false }: { base: PillarsResult; small?: boolean; big?: boolean }) {
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
    <div className={`pillars ${small ? 'pillars-sm' : ''} ${big ? 'pillars-lg' : ''}`} aria-label="사주 원국(만세력)">
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

/** 만세력: 네 기둥 + 평가(펼쳐서 자세히) */
export function SajuPanel({ saju, label }: { saju: SajuResult; label?: string }) {
  const b = sajuBrief(saju.primary);
  const base = saju.base;
  const pad = (n: number) => String(n).padStart(2, '0');
  const when = base.corrected
    ? `${base.solar.year}.${base.solar.month}.${base.solar.day} ${pad(base.corrected.hour)}:${pad(base.corrected.minute)} (지역 보정)`
    : `${base.solar.year}.${base.solar.month}.${base.solar.day} · 시간 모름`;
  return (
    <section className="card saju-panel" aria-label={`${label ?? ''} 만세력`}>
      <div className="sp-head">
        <span className="section-kicker">{label ? `${label} 만세력` : '만세력'}</span>
        <h2 className="sp-title">{b.title}</h2>
        <p className="sp-when num">
          {when} · {ZODIAC_KO[saju.primary.pillars.year.branch]}띠
        </p>
      </div>
      <PillarTable base={base} big />
      <div className="stack" style={{ gap: 8 }}>
        {sajuEval(saju).map((r) => (
          <SajuEvalRow key={r.key} r={r} power={r.key === 'balance' ? saju.primary.power : null} />
        ))}
      </div>
    </section>
  );
}

function SajuEvalRow({ r, power }: { r: SajuRow; power: Record<Element, number> | null }) {
  const [open, setOpen] = useState(false);
  return (
    <article className={`crit-row sub ${open ? 'open' : ''}`}>
      <button type="button" className="crit-sum" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={`vdot ${r.verdict ?? 'need'}`} aria-hidden="true" />
        <span className="cr-text">
          {/* 판정 칩을 제목 옆에 두어 요약 문장이 한 줄을 다 쓰게 한다 */}
          <span className="cr-title">
            <b>{r.title}</b>
            {r.verdict ? <span className={`verdict ${VERDICT_CLS[r.verdict]}`}>{r.verdictText}</span> : null}
          </span>
          <span>
            <Rich text={r.summary} />
          </span>
        </span>
        <span className="cr-chev" aria-hidden="true">
          {Icon.down}
        </span>
      </button>
      {open ? (
        <div className="crit-detail">
          {power ? <ElementBars power={power} wanted={[]} avoid={[]} /> : null}
          {!power ? (
            <ul className="plain-list">
              {r.detail.map((t, i) => (
                <li key={i}>
                  <Rich text={t} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

const SCORE_FIELD = { yongsin: 'resource', sound: 'sound', suri: 'suri', yinyang: 'yinyang', meaning: 'practical' } as const;

/** 같은 소리의 다른 한자 링크 */
function altQuery(cur: AnalyzeState, rec: Recommendation): string {
  return toQuery({ ...cur, given: rec.report.input.given });
}

/** 아쉬운 항목을 고치는 방법 */
function FixOptions({ c, report, better, cur, hasSaju, recommendTo }: { c: Criterion; report: NameReport; better: Recommendation[]; cur: AnalyzeState; hasSaju: boolean; recommendTo: (key: Criterion['key']) => string }) {
  const field = SCORE_FIELD[c.key];
  const alts = c.key === 'sound' ? [] : better.filter((b) => b.report.score[field] > report.score[field]).slice(0, 3);
  const editTo = `/self?${toQuery(cur)}`;
  return (
    <div className="fix">
      <p className="fix-title">이렇게 바꿔 보세요</p>
      <div className="fix-list">
        {c.key === 'yongsin' && !hasSaju ? (
          <Link className="fix-opt" to={editTo}>
            <b>생일을 넣고 다시 보기</b>
            <span>사주에 맞는지까지 볼 수 있어요</span>
            {Icon.chevron}
          </Link>
        ) : null}
        {c.score === null && hasSaju ? (
          <Link className="fix-opt" to={editTo}>
            <b>한자 고르기</b>
            <span>한자를 고르면 이 항목을 볼 수 있어요</span>
            {Icon.chevron}
          </Link>
        ) : null}
        {alts.map((b) => {
          const meaning = b.report.chars.map((h, i) => (h ? hanjaMeaning(h, b.report.input.given[i]?.hangul ?? '') : '')).filter(Boolean).join(' · ');
          return (
            <Link key={b.hanja} className="fix-opt" to={`/report?${altQuery(cur, b)}`} replace>
              <b>
                {b.hanja} <span className="muted">같은 소리</span>
              </b>
              <span>
                {meaning} · {c.title} {Math.round(b.report.score[field])}/{c.max} · 총 {Math.round(b.report.score.total)}점
              </span>
              {Icon.chevron}
            </Link>
          );
        })}
        <Link className="fix-opt" to={recommendTo(c.key)}>
          <b>이 문제가 없는 새 이름 추천받기</b>
          <span>같은 생일로, 이 항목이 좋은 이름만 보여 드려요</span>
          {Icon.chevron}
        </Link>
      </div>
    </div>
  );
}

function CriterionRow({ c, children }: { c: Criterion; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ratio = c.score === null ? 0 : c.score / c.max;
  return (
    <article className={`crit-row ${open ? 'open' : ''}`}>
      <button type="button" className="crit-sum" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={`vdot ${VERDICT_CLS[c.verdict]}`} aria-hidden="true" />
        <span className="cr-text">
          <b>{c.title}</b>
          <span>
            <Rich text={c.summary} />
          </span>
        </span>
        <span className="cr-right">
          <span className={`verdict ${VERDICT_CLS[c.verdict]}`}>{c.verdictText}</span>
          {c.score !== null ? (
            <span className="cr-score num">
              {Math.round(c.score)}
              <small>/{c.max}</small>
            </span>
          ) : null}
        </span>
        <span className="cr-chev" aria-hidden="true">
          {Icon.down}
        </span>
      </button>
      {c.score !== null ? (
        <div className="meter cr-meter" aria-hidden="true">
          <i className={VERDICT_CLS[c.verdict]} style={{ width: `${Math.max(4, ratio * 100)}%` }} />
        </div>
      ) : null}
      {open ? (
        <div className="crit-detail">
          <p className="crit-why">
            <Rich text={c.why} />
          </p>
          {c.table ? (
            <dl className="mini-table">
              {c.table.map((t) => (
                <div key={t.label}>
                  <dt>{t.label}</dt>
                  <dd className={t.tone}>{t.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {c.pros.length ? (
            <ul className="pc pros" aria-label="좋은 점">
              {c.pros.map((t, i) => (
                <li key={i}>
                  <Rich text={t} />
                </li>
              ))}
            </ul>
          ) : null}
          {c.cons.length ? (
            <ul className="pc cons" aria-label="아쉬운 점">
              {c.cons.map((t, i) => (
                <li key={i}>
                  <Rich text={t} />
                </li>
              ))}
            </ul>
          ) : null}
          {children}
        </div>
      ) : null}
    </article>
  );
}

/** 점수만으로도 좋고 나쁨을 바로 알 수 있게 */
const VERDICT_OF_GRADE: Record<string, 'good' | 'ok' | 'bad'> = { S: 'good', A: 'good', B: 'ok', C: 'bad', D: 'bad' };
const VERDICT_WORD: Record<string, string> = { S: '아주 좋은 이름', A: '좋은 이름', B: '무난한 이름', C: '아쉬운 이름', D: '바꾸기를 권해요' };

const GRADE_LINE: Record<string, string> = {
  S: '이 아이에게 아주 잘 맞는 이름이에요.',
  A: '이 아이에게 잘 맞는 이름이에요.',
  B: '무난하게 잘 맞는 이름이에요.',
  C: '아쉬운 점이 몇 가지 있는 이름이에요.',
  D: '아쉬운 점이 많은 이름이에요.',
};

export interface BasisScore {
  key: 'classic' | 'app';
  total: number;
  grade: string;
  partial: boolean;
}

export function ReportView({
  report,
  saju,
  better,
  query,
  compare,
  onSchool,
}: {
  report: NameReport;
  saju: SajuResult | null;
  better: Recommendation[];
  query: string;
  compare?: BasisScore[];
  onSchool?: (s: SchoolOptions) => void;
}) {
  const lib = useLibrary();
  const gate = useGate();
  const location = useLocation();
  const navigate = useNavigate();
  const nav = (location.state ?? {}) as { from?: string; rank?: number };
  const cur = fromSearch<AnalyzeState>(`?${query}`) as AnalyzeState;
  const key = report.fullHanja ?? report.fullHangul;
  const entry = { hangul: report.fullHangul, hanja: key, total: report.score.total, grade: report.score.grade, query };
  const saved = lib.isBookmarked(key, query);
  const [copied, setCopied] = useState(false);
  const a = saju?.primary ?? null;
  const criteria = explainCriteria(report, a);
  const hl = nameHighlights(criteria);
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

  /** 이 항목이 좋은 이름만 다시 추천 */
  const recommendTo = (k: Criterion['key']) => {
    const from = nav.from && nav.from.startsWith('/results') ? fromSearch<NameState>(nav.from.slice(nav.from.indexOf('?'))) : null;
    const base: NameState = from && !(from.kids && from.kids.length > 1)
      ? from
      : {
          v: STATE_VERSION,
          surname: cur.surname,
          gender: cur.gender,
          birth: cur.birth,
          prefs: { ...DEFAULT_PREFS, length: cur.given.length === 1 ? 1 : 2 },
          school: cur.school,
          sajuOpts: cur.sajuOpts,
        };
    return `/results?${toQuery(base)}&fix=${k}`;
  };

  const canBack = Boolean(nav.from) || window.history.length > 1;
  return (
    <div className="report stack-lg">
      <div className="topbar">
        {canBack ? (
          <button type="button" className="icon-btn back-btn" aria-label="돌아가기" onClick={() => navigate(-1)}>
            {Icon.back}
          </button>
        ) : (
          <span />
        )}
        <div className="topbar-actions">
          <Link className="btn btn-outline btn-sm" to={`/self?${query}`}>
            한자 바꿔 보기
          </Link>
          <button type="button" className="icon-btn" aria-pressed={saved} aria-label={saved ? '저장 해제' : '저장'} onClick={() => (lib.user ? lib.toggleBookmark(entry) : gate.openLogin())}>
            {Icon.bookmark(saved)}
          </button>
          <button type="button" className="icon-btn" aria-label="공유하기" onClick={share}>
            {Icon.share}
          </button>
        </div>
      </div>
      {copied ? <p className="small muted" style={{ marginTop: -16 }}>링크를 복사했어요</p> : null}

      <section className="card hero-card">
        <NameHero report={report} />
        <div className="hc-score">
          {nav.rank ? <span className="rank-badge">추천 {nav.rank}위</span> : null}
          <b className="big-score">
            <CountUp value={Math.round(report.score.total)} />
            <small>점</small>
          </b>
          <span className={`grade-pill lg g-${report.score.grade}`}>{report.score.grade}등급</span>
          <span className={`verdict-line ${VERDICT_OF_GRADE[report.score.grade] ?? 'ok'}`}>{VERDICT_WORD[report.score.grade] ?? ''}</span>
        </div>
      </section>

      {compare?.length ? (
        <section className="card basis-compare" aria-label="두 기준 점수 비교">
          <span className="section-kicker">두 기준으로 보면</span>
          <div className="bc-row">
            {compare.map((c) => {
              const on = presetOf(report.options) === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  className={`bc-item ${on ? 'on' : ''}`}
                  aria-pressed={on}
                  onClick={() => onSchool?.(withPreset(report.options, c.key))}
                >
                  <span>{PRESET_LABEL[c.key]}</span>
                  <b className="num">{Math.round(c.total)}점</b>
                  <span className={`grade-pill g-${c.grade}`}>{c.grade}등급</span>
                </button>
              );
            })}
          </div>
          <p className="small muted">누르면 그 기준으로 자세한 풀이를 다시 보여 드려요. 항목마다 따로 고르려면 위의 ‘계산 기준’을 여세요.</p>
        </section>
      ) : null}

      <section className="card summary" aria-label="총평">
        <span className="section-kicker">총평</span>
        <p className="summary-lead">
          {report.fullHangul}
          {report.fullHanja ? <span className="muted"> {report.fullHanja}</span> : null}, {GRADE_LINE[report.score.grade] ?? ''}
        </p>
        <div className="summary-body">
          {nameNarrative(report, a)
            .split('\n')
            .map((para) => (
              <p key={para}>
                <Rich text={tidy(para)} />
              </p>
            ))}
        </div>
        <div className="hl">
          {hl.good.length ? (
            <div className="hl-col good">
              <span className="hl-head">좋은 점</span>
              <ul>
                {hl.good.map((t) => (
                  <li key={t}>
                    <Rich text={t} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {hl.bad.length ? (
            <div className="hl-col bad">
              <span className="hl-head">아쉬운 점</span>
              <ul>
                {hl.bad.map((t) => (
                  <li key={t}>
                    <Rich text={t} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        {!lib.user ? <p className="tiny muted">로그인하지 않아 이 결과는 저장되지 않아요.</p> : null}
      </section>

      {saju ? <SajuPanel saju={saju} /> : null}

      <section className="stack" style={{ gap: 10 }} aria-label="항목별 풀이">
        <div className="between">
          <h2>항목별 풀이</h2>
          <span className="small muted">눌러서 자세히</span>
        </div>
        {criteria.map((c) => (
          <CriterionRow key={c.key} c={c}>
            {c.verdict !== 'good' ? <FixOptions c={c} report={report} better={better} cur={cur} hasSaju={Boolean(saju)} recommendTo={recommendTo} /> : null}
          </CriterionRow>
        ))}
      </section>


      {better.length ? (
        <section className="stack" style={{ gap: 10 }} aria-label="같은 소리 더 좋은 한자">
          <h2>같은 소리, 점수가 더 높은 한자</h2>
          <div className="stack" style={{ gap: 10 }}>
            {better.slice(0, 3).map((b) => (
              <BetterRow key={b.hanja} rec={b} to={`/report?${altQuery(cur, b)}`} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function BetterRow({ rec, to }: { rec: Recommendation; to: string }) {
  const meaning = rec.report.chars.map((h, i) => (h ? hanjaMeaning(h, rec.report.input.given[i]?.hangul ?? '') : '')).filter(Boolean).join(' · ');
  return (
    <Link className="name-card nc-link solo" to={to} replace>
      <span className="nc-main">
        <span className="nc-name">
          <b>{rec.hangul}</b>
          <span className="hj">{rec.hanja}</span>
        </span>
        <span className="nc-meaning">{meaning}</span>
      </span>
      <span className="nc-score">
        <b className="num">{Math.round(rec.report.score.total)}</b>
        <span className={`grade-pill g-${rec.report.score.grade}`}>{rec.report.score.grade}등급</span>
      </span>
    </Link>
  );
}
