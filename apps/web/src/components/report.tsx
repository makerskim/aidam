import { useState } from 'react';
import { meaningFor } from '../lib/format';
import { Link } from 'react-router-dom';
import type { NameReport, Recommendation, SajuResult, SajuAnalysis, PillarsResult } from '@aidam/engine';
import { ELEMENT_HANJA, ELEMENT_KO, ELEMENTS, type Element } from '@aidam/engine/src/core/elements';
import { BRANCHES, BRANCHES_KO, STEMS, STEMS_KO, branchElement, stemElement, ZODIAC_KO } from '@aidam/engine/src/core/ganji';
import { GROUP_KO, ROLE_KO, STRENGTH_KO, type TenGodGroup } from '@aidam/engine/src/saju/analysis';
import { SCHOOL_KO, FLOW_KO } from '@aidam/engine/src/name/sound';
import { FRAME_KO } from '@aidam/engine/src/name/suri';
import { LUCK_KO } from '@aidam/engine/src/name/suri81';
import { JIE_NAMES } from '@aidam/engine/src/calendar/solarTerms';
import { ElementChip, Notice, Saekdong } from './ui';
import { useFavorites } from '../lib/storage';
import { fromSearch, toQuery, type AnalyzeState } from '../lib/state';

const elName = (e: Element) => `${ELEMENT_KO[e]}(${ELEMENT_HANJA[e]})`;

export function NameTag({ report, animate = false }: { report: NameReport; animate?: boolean }) {
  const all = [...report.input.surname.map((c, i) => ({ c, h: report.surnameChars[i] ?? null, sur: true })), ...report.input.given.map((c, i) => ({ c, h: report.chars[i] ?? null, sur: false }))];
  return (
    <div className="nametag">
      <Saekdong />
      <div className="nametag-body">
        <div className="nametag-syllables" aria-label={`${report.fullHangul} ${report.fullHanja ?? ''}`}>
          {all.map(({ c, h, sur }, i) => (
            <div key={i} className={`syl ${sur ? 'surname' : ''}`}>
              <span className="syl-ko">{c.hangul}</span>
              <span className="syl-hanja">{c.hanja ?? '·'}</span>
              <span className="syl-meaning">{sur || !h ? '' : meaningFor(h.meaning, c.hangul)}</span>
            </div>
          ))}
        </div>
        <div className={`seal ${animate ? 'press' : ''}`} aria-label={`등급 ${report.score.grade}, ${report.score.total}점`}>
          <div>
            <b>{report.score.grade}</b>
            <small>{report.score.total}점</small>
          </div>
        </div>
      </div>
    </div>
  );
}

const AREAS = [
  { key: 'resource', label: '자원오행 × 용희신', max: 30 },
  { key: 'suri', label: '수리(81수)', max: 25 },
  { key: 'sound', label: '음령오행', max: 20 },
  { key: 'yinyang', label: '음양 조화', max: 10 },
  { key: 'practical', label: '뜻·어감', max: 15 },
] as const;

export function ScoreBars({ report }: { report: NameReport }) {
  return (
    <div className="bars">
      {AREAS.map((a) => {
        const v = report.score[a.key];
        const unavailable = report.score.partial && (a.key === 'resource' || a.key === 'suri') && !report.frames;
        return (
          <div key={a.key} className="bar-row">
            <span>{a.label.split(' ')[0]}</span>
            <div className="bar" role="img" aria-label={`${a.label} ${v}/${a.max}`}>
              <i style={{ width: `${unavailable ? 0 : (v / a.max) * 100}%` }} />
            </div>
            <span className="val">{unavailable ? '—' : `${v}/${a.max}`}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ElementStrip({ power }: { power: Record<Element, number> }) {
  return (
    <div>
      <div className="element-strip" role="img" aria-label={ELEMENTS.map((e) => `${ELEMENT_KO[e]} ${Math.round(power[e])}%`).join(', ')}>
        {ELEMENTS.map((e) => (
          <span key={e} style={{ width: `${power[e]}%`, background: `var(--${e})` }} />
        ))}
      </div>
      <div className="row tiny muted" style={{ marginTop: 6, gap: 12 }}>
        {ELEMENTS.map((e) => (
          <span key={e}>
            {ELEMENT_HANJA[e]} {Math.round(power[e])}%
          </span>
        ))}
      </div>
    </div>
  );
}

export function PillarTable({ base }: { base: PillarsResult }) {
  const p = base.pillars;
  const cols = [
    { head: '시주', pl: p.hour },
    { head: '일주', pl: p.day },
    { head: '월주', pl: p.month },
    { head: '연주', pl: p.year },
  ];
  return (
    <div className="pillars" role="table" aria-label="사주 원국">
      {cols.map((c) => (
        <div key={c.head} className="pillar-head" role="columnheader">
          {c.head}
        </div>
      ))}
      {cols.map((c) =>
        c.pl ? (
          <div key={c.head + 's'} className={`pillar-cell el-${stemElement(c.pl.stem)}`} role="cell">
            {STEMS[c.pl.stem]}
            <small>{STEMS_KO[c.pl.stem]} · {ELEMENT_KO[stemElement(c.pl.stem)]}</small>
          </div>
        ) : (
          <div key={c.head + 's'} className="pillar-cell empty" role="cell">모름</div>
        ),
      )}
      {cols.map((c) =>
        c.pl ? (
          <div key={c.head + 'b'} className={`pillar-cell el-${branchElement(c.pl.branch)}`} role="cell">
            {BRANCHES[c.pl.branch]}
            <small>{BRANCHES_KO[c.pl.branch]} · {ELEMENT_KO[branchElement(c.pl.branch)]}</small>
          </div>
        ) : (
          <div key={c.head + 'b'} className="pillar-cell empty" role="cell">모름</div>
        ),
      )}
    </div>
  );
}

function RoleList({ a }: { a: SajuAnalysis }) {
  const order: ('yong' | 'hui' | 'han' | 'gu' | 'gi')[] = ['yong', 'hui', 'han', 'gu', 'gi'];
  return (
    <div className="row" style={{ gap: 8 }}>
      {order.map((r) => {
        const e = ELEMENTS.find((x) => a.roles[x] === r) as Element;
        return (
          <span key={r} className={`chip ${r === 'yong' || r === 'hui' ? 'chip-good' : r === 'gi' || r === 'gu' ? 'chip-bad' : ''}`}>
            {ROLE_KO[r]} <ElementChip element={e} />
          </span>
        );
      })}
    </div>
  );
}

export function SajuView({ saju }: { saju: SajuResult }) {
  const a = saju.primary;
  const b = saju.base;
  return (
    <div className="stack">
      <PillarTable base={b} />
      <p className="small muted">
        {b.solar.year}년 {b.solar.month}월 {b.solar.day}일(양력)
        {b.corrected ? ` · 보정시각 ${String(b.corrected.hour).padStart(2, '0')}:${String(b.corrected.minute).padStart(2, '0')} (${b.correctionMin >= 0 ? '+' : ''}${b.correctionMin}분)` : ' · 시간 모름'}
        {` · ${ZODIAC_KO[a.pillars.year.branch]}띠 · ${JIE_NAMES[b.monthTerm]} 절기 이후`}
      </p>
      <div>
        <h3 style={{ marginBottom: 8 }}>오행 세력</h3>
        <ElementStrip power={a.power} />
      </div>
      <div className="panel-quiet stack">
        <p>
          일간 <span className="hanja">{STEMS[a.pillars.day.stem]}</span> {elName(a.dayMaster)} · <b>{STRENGTH_KO[a.strength.level]}</b>
          <span className="muted"> (돕는 기운 {Math.round(a.strength.ratio * 100)}%)</span>
        </p>
        <RoleList a={a} />
        <ul className="plain stack small">
          {a.reasoning.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
        <div className="row tiny muted" style={{ gap: 10 }}>
          {(Object.keys(a.groups) as TenGodGroup[]).map((g) => (
            <span key={g}>
              {GROUP_KO[g]} {ELEMENT_HANJA[a.groupElement[g]]} {Math.round(a.groups[g])}%
            </span>
          ))}
        </div>
      </div>
      {saju.unknownTime ? (
        <Notice>
          출생 시간을 몰라 12시진을 모두 계산했어요. 용신 일치율 {Math.round(saju.unknownTime.confidence * 100)}% (
          {ELEMENTS.filter((e) => saju.unknownTime!.votes[e] > 0).map((e) => `${ELEMENT_HANJA[e]} ${saju.unknownTime!.votes[e]}`).join(', ')})
        </Notice>
      ) : null}
      {saju.alternatives.map((alt, i) => (
        <Notice key={i} warn>
          <b>다른 경우의 수:</b> {alt.label} → 용신 {elName(alt.analysis.yongsin)}, 희신 {elName(alt.analysis.huisin)}
          {alt.analysis.yongsin === a.yongsin ? ' (용신은 같아요)' : ' (용신이 달라져요. 출생 시각을 다시 확인해 보세요)'}
        </Notice>
      ))}
    </div>
  );
}

const TABS = [
  { key: 'summary', label: '총평' },
  { key: 'saju', label: '사주·용희신' },
  { key: 'resource', label: '자원오행' },
  { key: 'suri', label: '수리' },
  { key: 'sound', label: '음령오행' },
  { key: 'etc', label: '음양·뜻' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

function Reasons({ report, areas }: { report: NameReport; areas: string[] }) {
  const list = report.reasons.filter((r) => areas.includes(r.area));
  if (!list.length) return <p className="small muted">이 항목은 한자를 고르면 볼 수 있어요.</p>;
  return (
    <div>
      {list.map((r, i) => (
        <div key={i} className="reason">
          <span className={`dot ${r.tone}`} aria-hidden="true" />
          <span>
            <span className="sr-only">{r.tone === 'good' ? '좋음: ' : r.tone === 'bad' ? '주의: ' : ''}</span>
            {r.text}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ReportView({ report, saju, better, query }: { report: NameReport; saju: SajuResult | null; better: Recommendation[]; query: string }) {
  const [tab, setTab] = useState<TabKey>('summary');
  const fav = useFavorites();
  const hanjaKey = report.fullHanja ?? report.fullHangul;
  const saved = fav.has(hanjaKey);
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: `${report.fullHangul} 이름 풀이 — 아이담`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      }
    } catch {
      /* 사용자가 취소 */
    }
  };

  const other = report.options.soundSchool === 'haerye' ? 'unhae' : 'haerye';
  return (
    <div className="stack-lg">
      <NameTag report={report} animate />
      <div className="row">
        <button
          type="button"
          className={`btn ${saved ? 'btn-soft' : 'btn-line'}`}
          aria-pressed={saved}
          onClick={() => fav.toggle({ hangul: report.fullHangul, hanja: hanjaKey, total: report.score.total, grade: report.score.grade, query })}
        >
          {saved ? '♥ 찜했어요' : '♡ 찜하기'}
        </button>
        <button type="button" className="btn btn-line" onClick={share}>
          {copied ? '링크를 복사했어요' : '공유하기'}
        </button>
        <button type="button" className="btn btn-line" onClick={() => window.print()}>
          저장·인쇄
        </button>
      </div>

      {report.warnings.length ? (
        <Notice warn>
          <ul className="plain stack small">
            {report.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <div className="tabs" role="tablist" aria-label="풀이 항목">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <section className="panel stack" role="tabpanel" aria-label={TABS.find((t) => t.key === tab)?.label}>
        {tab === 'summary' ? (
          <>
            <h2>
              {report.score.total}점 · {report.score.grade}등급
            </h2>
            <p className="small muted">
              {report.score.passesStrict ? '4격 흉수와 소리 상극이 없는 이름이에요.' : '엄격 기준에서 아쉬운 부분이 있어요. 아래 항목을 확인해 보세요.'}
              {report.score.partial ? ' 한자가 없는 글자가 있어 가능한 항목만 100점으로 환산했어요.' : ''}
            </p>
            <ScoreBars report={report} />
            <Reasons report={report} areas={['saju', 'resource']} />
          </>
        ) : null}
        {tab === 'saju' ? (saju ? <SajuView saju={saju} /> : <p className="muted">출생 정보를 넣지 않아 사주 분석이 없어요.</p>) : null}
        {tab === 'resource' ? (
          <>
            <p className="small muted">한자 자체의 오행이 사주에 부족한 기운(용신·희신)을 채워 주는지 봐요.</p>
            <ul className="plain stack">
              {report.resource.map((r) => (
                <li key={r.ch} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                  <span className="hanja" style={{ fontSize: 34, lineHeight: 1 }}>{r.ch}</span>
                  <span>
                    <ElementChip element={r.element} withName /> {r.role ? <b>{r.role}</b> : null}
                    <span className="small muted" style={{ display: 'block' }}>
                      {r.basis} · 신뢰도 {r.confidence}
                      {r.confidence === 'C' ? ' (사전마다 다를 수 있어요)' : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <Reasons report={report} areas={['resource']} />
          </>
        ) : null}
        {tab === 'suri' ? (
          report.frames ? (
            <>
              <p className="small muted">성과 이름 획수(원획)를 더한 4격이 81수리에서 길한 수인지 봐요.</p>
              <div className="table-wrap">
                <table className="compare">
                  <thead>
                    <tr>
                      <th>격</th>
                      <th>수</th>
                      <th>이름</th>
                      <th>길흉</th>
                      <th>오행</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.frameResults.map((f) => (
                      <tr key={f.key}>
                        <td>
                          {FRAME_KO[f.key].name}
                          <br />
                          <span className="tiny">{FRAME_KO[f.key].period}</span>
                        </td>
                        <td>{f.n}</td>
                        <td>{f.info.name.split('(')[0]}</td>
                        <td>
                          <span className={`chip ${f.info.luck === 'good' ? 'chip-good' : f.info.luck === 'bad' ? 'chip-bad' : ''}`}>{LUCK_KO[f.info.luck]}</span>
                        </td>
                        <td>
                          <ElementChip element={f.element} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="tiny muted">
                획수: {[...report.surnameChars, ...report.chars].map((h) => (h ? `${h.ch} ${h.strokes}` : '?')).join(' · ')}
              </p>
              <Reasons report={report} areas={['suri']} />
            </>
          ) : (
            <p className="muted">모든 글자의 한자를 고르면 수리를 볼 수 있어요.</p>
          )
        ) : null}
        {tab === 'sound' ? (
          <>
            <p className="small muted">이름 첫소리(초성)의 오행이 성 → 이름 순서로 서로 살려 주는지(상생) 봐요.</p>
            {(['haerye', 'unhae'] as const).map((school) => {
              const f = report.soundBySchool[school];
              return (
                <div key={school} className="panel-quiet">
                  <p>
                    <b>{SCHOOL_KO[school]}</b>
                    {school === report.options.soundSchool ? ' · 점수에 사용' : ' · 참고'} — {Math.round(f.score * 100)}점
                  </p>
                  <div className="row" style={{ marginTop: 8 }}>
                    {f.elements.map((e, i) => (e ? <ElementChip key={i} element={e} /> : <span key={i}>?</span>))}
                  </div>
                  <p className="small muted" style={{ marginTop: 6 }}>
                    {f.pairs.map((p) => FLOW_KO[p.kind]).join(' → ') || '비교할 소리가 없어요'}
                  </p>
                </div>
              );
            })}
            <p className="tiny muted">두 학설에서 모두 상극이 없으면 어느 기준으로 봐도 무난한 이름이에요. ({SCHOOL_KO[other]} 기준도 함께 확인하세요)</p>
          </>
        ) : null}
        {tab === 'etc' ? (
          <>
            <Reasons report={report} areas={['yinyang', 'practical']} />
            <p className="small muted">실제 발음: [{report.pronunciation.join('')}]</p>
          </>
        ) : null}
      </section>

      {better.length ? (
        <section className="stack">
          <h2>같은 소리, 더 좋은 한자</h2>
          {better.map((b) => (
            <BetterRow key={b.hanja} rec={b} />
          ))}
        </section>
      ) : null}

      <p className="tiny muted">
        분석 코드 {report.analysisCode} · 엔진 v{report.engineVersion} · 데이터 {report.dataVersion}. 같은 입력이면 언제나 같은 결과가 나와요.
      </p>
    </div>
  );
}

function BetterRow({ rec }: { rec: Recommendation }) {
  const meaning = rec.report.chars.map((h, i) => (h ? meaningFor(h.meaning, rec.report.input.given[i]?.hangul ?? '') : '')).filter(Boolean).join(' · ');
  return (
    <Link className="name-row" to={`/report?${betterQuery(rec)}`}>
      <span className="who">
        <span className="ko">{rec.hangul}</span>
        <span className="hj">{rec.hanja}</span>
        <span className="meaning" style={{ display: 'block' }}>{meaning}</span>
      </span>
      <span className="score">
        <b>{rec.report.score.total}</b>
        <small>{rec.report.score.grade}등급</small>
      </span>
    </Link>
  );
}

// 리포트 링크용: 현재 URL 상태를 재사용하면서 이름만 바꾼다
function betterQuery(rec: Recommendation): string {
  const cur = fromSearch<AnalyzeState>(window.location.hash.split('?')[1] ?? '');
  if (!cur) return '';
  return toQuery({ ...cur, given: rec.report.input.given });
}
