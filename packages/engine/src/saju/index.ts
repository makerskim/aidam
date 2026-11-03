import { ELEMENT_HANJA, ELEMENT_KO, ELEMENTS, emptyElementRecord, generatorOf, type Element } from '../core/elements';
import { BRANCHES } from '../core/ganji';
import { addDays } from '../calendar/julian';
import { DATA_VERSION, ENGINE_VERSION } from '../version';
import { analyzePillars, withYongsin, type SajuAnalysis } from './analysis';
import { computePillars, DEFAULT_SAJU_OPTIONS, pillarsForHourBranch, type BirthInput, type PillarsResult, type SajuOptions } from './pillars';

export interface SajuAlternative {
  label: string;
  base: PillarsResult;
  analysis: SajuAnalysis;
}

export interface SajuResult {
  birth: BirthInput;
  options: SajuOptions;
  base: PillarsResult;
  primary: SajuAnalysis;
  alternatives: SajuAlternative[];
  unknownTime: { votes: Record<Element, number>; confidence: number } | null;
  engineVersion: string;
  dataVersion: string;
}

const samePillars = (a: PillarsResult, b: PillarsResult) => JSON.stringify(a.pillars) === JSON.stringify(b.pillars);

/** 벽시계 시각을 분 단위로 옮긴 출생 정보(양력 기준) */
function shiftBirth(birth: BirthInput, base: PillarsResult, deltaMin: number): BirthInput {
  const t = birth.time as { hour: number; minute: number };
  let minutes = t.hour * 60 + t.minute + deltaMin;
  let date = base.solar;
  while (minutes < 0) { minutes += 1440; date = addDays(date, -1); }
  while (minutes >= 1440) { minutes -= 1440; date = addDays(date, 1); }
  return { ...birth, calendar: 'solar', isLeapMonth: false, ...date, time: { hour: Math.floor(minutes / 60), minute: minutes % 60 } };
}

export function computeSaju(birth: BirthInput, options: SajuOptions = DEFAULT_SAJU_OPTIONS): SajuResult {
  const base = computePillars(birth, options);
  const alternatives: SajuAlternative[] = [];
  const pushAlt = (label: string, r: PillarsResult) => {
    if (samePillars(r, base) || alternatives.some((a) => samePillars(a.base, r))) return;
    alternatives.push({ label, base: r, analysis: analyzePillars(r.pillars) });
  };

  let primary: SajuAnalysis;
  let unknownTime: SajuResult['unknownTime'] = null;

  if (!birth.time) {
    const three = analyzePillars(base.pillars);
    const scenarios = BRANCHES.map((_, b) => analyzePillars(pillarsForHourBranch(birth, b, options).pillars));
    const votes = emptyElementRecord();
    for (const s of scenarios) votes[s.yongsin] += 1;
    const best = ELEMENTS.reduce((m, e) => {
      if (votes[e] > votes[m]) return e;
      if (votes[e] === votes[m] && e === three.yongsin) return e;
      return m;
    }, three.yongsin);
    if (best === three.yongsin) {
      primary = { ...three, reasoning: [...three.reasoning, `출생 시간을 몰라 12시진을 모두 따져 보니 ${votes[best]}개에서 용신이 ${ELEMENT_KO[best]}(${ELEMENT_HANJA[best]})로 같았습니다.`] };
    } else {
      const huiVotes = emptyElementRecord();
      for (const s of scenarios) if (s.yongsin === best) huiVotes[s.huisin] += 1;
      const hui = ELEMENTS.reduce((m, e) => (huiVotes[e] > huiVotes[m] ? e : m), generatorOf(best));
      primary = withYongsin(three, best, hui, `출생 시간을 몰라 12시진을 모두 따져 보니 ${votes[best]}개에서 용신이 ${ELEMENT_KO[best]}(${ELEMENT_HANJA[best]})여서 다수결로 정했습니다.`);
    }
    unknownTime = { votes, confidence: votes[primary.yongsin] / 12 };
    if (base.flags.nearTermBoundary) {
      for (const h of [0, 23]) {
        pushAlt('절입일 출생(시간에 따라 월주가 달라짐)', computePillars({ ...birth, time: { hour: h, minute: 30 } }, options));
      }
    }
  } else {
    primary = analyzePillars(base.pillars);
    if (options.trueSolarTime) {
      pushAlt('진태양시 보정 없이(표준시 그대로) 본 사주', computePillars(birth, { ...options, trueSolarTime: false, equationOfTime: false }));
    }
    if (base.flags.nearHourBoundary && base.corrected) {
      const m = base.corrected.hour * 60 + base.corrected.minute;
      const boundary = Math.round((m - 60) / 120) * 120 + 60;
      const delta = m < boundary ? boundary - m + 1 : -(m - boundary + 1);
      pushAlt('시진 경계 근처 출생 — 옆 시진으로 본 사주', computePillars(shiftBirth(birth, base, delta), options));
    }
    if (base.flags.nearTermBoundary) {
      pushAlt('절입 시각 근처 출생 — 절입 반대편으로 본 사주', computePillars(shiftBirth(birth, base, base.monthTerm === computePillars(shiftBirth(birth, base, 31), options).monthTerm ? -31 : 31), options));
    }
  }

  return { birth, options, base, primary, alternatives, unknownTime, engineVersion: ENGINE_VERSION, dataVersion: DATA_VERSION };
}

export type { BirthInput, SajuOptions, PillarsResult };
export { DEFAULT_SAJU_OPTIONS, computePillars };
