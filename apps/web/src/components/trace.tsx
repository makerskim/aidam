import { useState } from 'react';
import type { NameReport, SajuResult } from '@aidam/engine';
import { ELEMENT_HANJA, ELEMENTS, type Element } from '@aidam/engine/src/core/elements';
import { FRAME_KO } from '@aidam/engine/src/name/suri';
import { BRANCHES, STEMS } from '@aidam/engine/src/core/ganji';
import { basisSummary } from '../lib/basis';
import { Icon } from './ui';

const KO: Record<Element, string> = { wood: '나무', fire: '불', earth: '흙', metal: '쇠', water: '물' };
const el = (e: Element | null | undefined) => (e ? `${KO[e]}(${ELEMENT_HANJA[e]})` : '?');
const ROLE = { yong: '용신', hui: '희신', han: '한신', gu: '구신', gi: '기신' } as const;
const LUCK = { good: '길', half: '반길', bad: '흉' } as const;
const FLOW = { forward: '상생', backward: '역상생', same: '같음', clash: '상극' } as const;
const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * 계산 과정: 이 점수가 어떻게 나왔는지 단계마다 실제 숫자로 보여 준다.
 * 같은 입력·같은 기준이면 언제나 같은 숫자가 나온다(엔진 버전과 함께 표시).
 */
export function CalcTrace({ report, saju }: { report: NameReport; saju: SajuResult | null }) {
  const [open, setOpen] = useState(false);
  const a = saju?.primary ?? null;
  const s = report.score;
  const m = s.max;
  const school = report.options.soundSchool;
  const flow = report.soundBySchool[school];
  const syl = [...report.input.surname, ...report.input.given].map((c) => c.hangul);
  const steps: { title: string; lines: string[] }[] = [];

  steps.push({ title: '계산 기준', lines: [`${basisSummary(report.options)} · 엔진 ${report.engineVersion} · 자료 ${report.dataVersion}`] });
  if (a) {
    const p = a.pillars;
    const pillar = (x: { stem: number; branch: number } | null) => (x ? `${STEMS[x.stem]}${BRANCHES[x.branch]}` : '모름');
    steps.push({
      title: '① 만세력과 다섯 기운',
      lines: [
        `시·일·월·연: ${pillar(p.hour)} ${pillar(p.day)} ${pillar(p.month)} ${pillar(p.year)}`,
        `글자 수: ${ELEMENTS.map((e) => `${KO[e]} ${a.counts[e]}`).join(' · ')}`,
        `세력: ${ELEMENTS.map((e) => `${KO[e]} ${Math.round(a.power[e])}%`).join(' · ')}`,
      ],
    });
    steps.push({
      title: `② 용신 (${a.method === 'lacking' ? '부족한 오행' : '억부·조후'})`,
      lines: [...a.reasoning, `역할: ${ELEMENTS.map((e) => `${KO[e]}=${ROLE[a.roles[e]]}`).join(' · ')}`],
    });
  }
  if (report.resource.length) {
    steps.push({
      title: `③ 한자오행 ${r1(s.resource)} / ${m.resource}`,
      lines: [
        ...report.resource.map((rc) => `${rc.ch}: ${el(rc.element)} — ${rc.basis}${rc.role ? ` · ${rc.role}` : ''}${rc.favor !== null ? ` · 선호도 ${rc.favor}` : ''}`),
        a ? `(선호도 평균+1)/2×28 + 용신 한자 2 + 없는 기운 채움 1, 최대 30 → 만점 ${m.resource}점 기준으로 환산` : '사주가 없어 한자 오행끼리의 흐름만 봤어요',
      ],
    });
  }
  if (report.frames) {
    const strokes = report.chars.map((h) => (h ? `${h.ch} ${h.strokes}` : '?')).join(' · ');
    steps.push({
      title: `④ 수리 ${r1(s.suri)} / ${m.suri}`,
      lines: [
        `원획: 성 ${report.surnameStrokes}획 · ${strokes}`,
        ...report.frameResults.map((f) => `${FRAME_KO[f.key].name.split('(')[0]}(${FRAME_KO[f.key].period}) ${f.n} — ${f.info.name} ${LUCK[f.info.luck]} · 수리오행 ${el(f.element)}`),
        `4격 길흉(원·형·이·정 5:5:5:7) + 수리오행 상생 ${report.options.scoring === 'app' ? '15' : report.options.suriElement === 'strong' ? '8' : '3'}점`,
      ],
    });
  }
  steps.push({
    title: `⑤ 발음오행(${school === 'unhae' ? '운해본' : '해례본'}${report.options.includeFinalConsonant ? '·받침까지' : ''}) ${r1(s.sound)} / ${m.sound}`,
    lines: [
      flow.elements.map((e, i) => `${syl[i] ?? ''}(${e ? KO[e] : '?'})`).join(' → '),
      ...flow.pairs.map((q) => `${KO[q.from]}→${KO[q.to]} ${FLOW[q.kind]} ${q.score}`),
      `평균 ${r1(flow.score)} × 20`,
    ],
  });
  steps.push({
    title: `⑥ 음양 ${r1(s.yinyang)} / ${m.yinyang}`,
    lines: [
      report.strokeYinYang ? `획수 홀짝: ${report.strokeYinYang.pattern.map((x) => (x === 'yang' ? '양' : '음')).join('')} → ${report.strokeYinYang.balanced ? '섞임' : '한쪽'}` : '획수 음양: 한자가 없어 계산 못 함',
      `모음: ${report.vowel.pattern.map((x) => (x === 'yang' ? '양' : x === 'yin' ? '음' : '중')).join('')} → ${report.vowel.level === 'harmony' ? '조화' : report.vowel.level === 'normal' ? '보통' : '치우침'}`,
    ],
  });
  steps.push({
    title: `⑦ 뜻·발음 ${m.practical ? `${r1(s.practical)} / ${m.practical}` : '(실용 배점은 점수 미반영)'}`,
    lines: [report.pronunciation.length ? `실제 발음: [${report.pronunciation.join('')}]` : '', report.warnings.length ? `참고: ${report.warnings.join(' / ')}` : ''].filter(Boolean),
  });
  steps.push({
    title: `합계 ${r1(s.total)}점 → ${s.grade}등급`,
    lines: [`${r1(s.resource)} + ${r1(s.suri)} + ${r1(s.sound)} + ${r1(s.yinyang)} + ${r1(s.practical)}${s.partial ? ' (한자 없는 글자가 있어 가능한 만점 기준으로 환산)' : ''}`, '등급: S 90↑ · A 80↑ · B 70↑ · C 60↑ · D'],
  });

  return (
    <section className={`card trace ${open ? 'open' : ''}`} aria-label="계산 과정">
      <button type="button" className="trace-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="section-kicker">계산 과정</span>
        <span className="small muted">점수가 나온 과정을 숫자로 보기</span>
        <span className="cr-chev">{Icon.down}</span>
      </button>
      {open ? (
        <ol className="trace-steps">
          {steps.map((st) => (
            <li key={st.title}>
              <b>{st.title}</b>
              {st.lines.map((l, i) => (
                <span key={i}>{l}</span>
              ))}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
