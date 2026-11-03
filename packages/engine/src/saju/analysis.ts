import {
  controllerOf, controls, ELEMENT_HANJA, ELEMENT_KO, ELEMENTS, emptyElementRecord, generates, generatorOf, type Element,
} from '../core/elements';
import { BRANCHES, branchElement, STEMS, stemElement } from '../core/ganji';
import { HIDDEN_STEMS } from './hiddenStems';
import type { Pillars } from './pillars';

export type StrengthLevel = 'veryWeak' | 'weak' | 'balanced' | 'strong' | 'veryStrong';
export type Role = 'yong' | 'hui' | 'han' | 'gu' | 'gi';
export type TenGodGroup = 'bigyeop' | 'inseong' | 'siksang' | 'jaeseong' | 'gwanseong';

export const STRENGTH_KO: Record<StrengthLevel, string> = {
  veryWeak: '극신약', weak: '신약', balanced: '중화', strong: '신강', veryStrong: '극신강',
};
export const ROLE_KO: Record<Role, string> = { yong: '용신', hui: '희신', han: '한신', gu: '구신', gi: '기신' };
export const GROUP_KO: Record<TenGodGroup, string> = {
  bigyeop: '비겁', inseong: '인성', siksang: '식상', jaeseong: '재성', gwanseong: '관성',
};

export interface SajuAnalysis {
  pillars: Pillars;
  dayMaster: Element;
  /** 8글자(시간 모름이면 6글자) 본기 기준 개수. 일간 포함 */
  counts: Record<Element, number>;
  /** 일간을 뺀 가중 세력(%) */
  power: Record<Element, number>;
  groups: Record<TenGodGroup, number>;
  groupElement: Record<TenGodGroup, Element>;
  strength: { ratio: number; level: StrengthLevel };
  johu: Element | null;
  roles: Record<Element, Role>;
  yongsin: Element;
  huisin: Element;
  /** 이름 오행 선호도 (−1..1) */
  favor: Record<Element, number>;
  reasoning: string[];
}

const W = { yearStem: 10, monthStem: 10, hourStem: 10, yearBranch: 10, monthBranch: 30, dayBranch: 20, hourBranch: 10 };

const el = (e: Element) => `${ELEMENT_KO[e]}(${ELEMENT_HANJA[e]})`;
const pct = (n: number) => `${Math.round(n)}%`;

function addBranch(power: Record<Element, number>, branch: number, weight: number) {
  for (const [stem, days] of HIDDEN_STEMS[branch] ?? []) power[stemElement(stem)] += (weight * days) / 30;
}

function levelOf(ratio: number): StrengthLevel {
  if (ratio < 0.25) return 'veryWeak';
  if (ratio < 0.45) return 'weak';
  if (ratio <= 0.55) return 'balanced';
  if (ratio <= 0.75) return 'strong';
  return 'veryStrong';
}

function rolesFor(yong: Element, hui: Element): Record<Element, Role> {
  const gi = controllerOf(yong);
  const gu = generatorOf(gi);
  const roles = {} as Record<Element, Role>;
  for (const e of ELEMENTS) {
    roles[e] = e === yong ? 'yong' : e === hui ? 'hui' : e === gi ? 'gi' : e === gu ? 'gu' : 'han';
  }
  return roles;
}

function favorFor(roles: Record<Element, Role>, dayMaster: Element, level: StrengthLevel): Record<Element, number> {
  const supportive = new Set([dayMaster, generatorOf(dayMaster)]);
  const favor = emptyElementRecord();
  for (const e of ELEMENTS) {
    switch (roles[e]) {
      case 'yong': favor[e] = 1; break;
      case 'hui': favor[e] = 0.8; break;
      case 'gu': favor[e] = -0.5; break;
      case 'gi': favor[e] = -1; break;
      case 'han':
        if (level === 'balanced') favor[e] = 0.1;
        else {
          const yongSideSupportive = level === 'weak' || level === 'veryWeak';
          favor[e] = supportive.has(e) === yongSideSupportive ? 0.3 : -0.2;
        }
    }
  }
  return favor;
}

export function analyzePillars(p: Pillars): SajuAnalysis {
  const dayMaster = stemElement(p.day.stem);
  const power = emptyElementRecord();
  power[stemElement(p.year.stem)] += W.yearStem;
  power[stemElement(p.month.stem)] += W.monthStem;
  addBranch(power, p.year.branch, W.yearBranch);
  addBranch(power, p.month.branch, W.monthBranch);
  addBranch(power, p.day.branch, W.dayBranch);
  if (p.hour) {
    power[stemElement(p.hour.stem)] += W.hourStem;
    addBranch(power, p.hour.branch, W.hourBranch);
  }
  const total = ELEMENTS.reduce((s, e) => s + power[e], 0);
  for (const e of ELEMENTS) power[e] = (power[e] / total) * 100;

  const counts = emptyElementRecord();
  for (const pl of [p.year, p.month, p.day, p.hour]) {
    if (!pl) continue;
    counts[stemElement(pl.stem)] += 1;
    counts[branchElement(pl.branch)] += 1;
  }

  const groupElement: Record<TenGodGroup, Element> = {
    bigyeop: dayMaster,
    inseong: generatorOf(dayMaster),
    siksang: generates(dayMaster),
    jaeseong: controls(dayMaster),
    gwanseong: controllerOf(dayMaster),
  };
  const groups = {} as Record<TenGodGroup, number>;
  for (const g of Object.keys(groupElement) as TenGodGroup[]) groups[g] = power[groupElement[g]];

  const ratio = (groups.bigyeop + groups.inseong) / 100;
  const level = levelOf(ratio);
  const reasoning: string[] = [];
  const dm = `${STEMS[p.day.stem]}${el(dayMaster)}`;
  reasoning.push(
    `일간은 ${dm}입니다. 나를 돕는 비겁·인성의 세력이 ${pct(ratio * 100)}로 ${STRENGTH_KO[level]} 사주입니다.`,
  );

  const mb = p.month.branch;
  let johu: Element | null = null;
  if ([11, 0, 1].includes(mb) && power.fire < 10) johu = 'fire';
  if ([5, 6, 7].includes(mb) && power.water < 10) johu = 'water';

  let yong: Element;
  let hui: Element;
  const g = (k: TenGodGroup) => `${GROUP_KO[k]}${el(groupElement[k])}`;
  if (level === 'weak' || level === 'veryWeak') {
    const order: TenGodGroup[] = ['gwanseong', 'siksang', 'jaeseong'];
    const strongest = order.reduce((best, k) => (groups[k] > groups[best] ? k : best), order[0] as TenGodGroup);
    if (strongest === 'jaeseong') {
      yong = groupElement.bigyeop;
      hui = groupElement.inseong;
    } else {
      yong = groupElement.inseong;
      hui = groupElement.bigyeop;
    }
    reasoning.push(
      `나를 약하게 하는 기운 중 ${g(strongest)}이 ${pct(groups[strongest])}로 가장 강해, ${strongest === 'jaeseong' ? `${g('bigyeop')}을 용신, ${g('inseong')}을 희신` : `${g('inseong')}을 용신, ${g('bigyeop')}을 희신`}으로 봅니다.`,
    );
  } else if (level === 'strong' || level === 'veryStrong') {
    if (groups.bigyeop >= groups.inseong) {
      if (groups.gwanseong >= 5) {
        yong = groupElement.gwanseong;
        reasoning.push(`비겁이 ${pct(groups.bigyeop)}로 넘쳐 ${g('gwanseong')}으로 다스리는 것을 용신으로, ${g('jaeseong')}을 희신으로 봅니다.`);
      } else {
        yong = groupElement.siksang;
        reasoning.push(`비겁이 넘치지만 관성이 너무 약해(${pct(groups.gwanseong)}), 기운을 빼주는 ${g('siksang')}을 용신으로, ${g('jaeseong')}을 희신으로 봅니다.`);
      }
      hui = groupElement.jaeseong;
    } else {
      yong = groupElement.jaeseong;
      hui = groupElement.siksang;
      reasoning.push(`인성이 ${pct(groups.inseong)}로 과해 ${g('jaeseong')}로 눌러주는 것을 용신으로, ${g('siksang')}을 희신으로 봅니다.`);
    }
  } else if (johu) {
    yong = johu;
    hui = generatorOf(johu);
    reasoning.push(`세력은 균형(중화)이지만 계절 기운이 치우쳐, 조후로 ${el(johu)}을 용신으로 봅니다.`);
  } else {
    yong = ELEMENTS.reduce((min, e) => (power[e] < power[min] ? e : min), ELEMENTS[0] as Element);
    hui = generatorOf(yong);
    reasoning.push(`세력이 균형(중화)이라, 가장 약한 ${el(yong)}을 용신으로, 이를 돕는 ${el(hui)}을 희신으로 봅니다.`);
  }

  if (johu && johu !== yong && level !== 'balanced') {
    const gi = controllerOf(yong);
    if (johu !== gi && johu !== generatorOf(gi)) {
      hui = johu;
      reasoning.push(`${BRANCHES[mb]}월(${[11, 0, 1].includes(mb) ? '겨울' : '여름'})생이라 ${el(johu)} 기운이 ${pct(power[johu])}로 부족해, 조후로 희신에 올립니다.`);
    } else {
      reasoning.push(`계절상 ${el(johu)}이 부족하지만 용신과 부딪혀 조후는 참고로만 봅니다.`);
    }
  }

  const roles = rolesFor(yong, hui);
  return {
    pillars: p,
    dayMaster,
    counts,
    power,
    groups,
    groupElement,
    strength: { ratio, level },
    johu,
    roles,
    yongsin: yong,
    huisin: hui,
    favor: favorFor(roles, dayMaster, level),
    reasoning,
  };
}

/** 용신·희신을 바꿔 역할과 선호도를 다시 계산 (시간 모름 다수결용) */
export function withYongsin(a: SajuAnalysis, yong: Element, hui: Element, note: string): SajuAnalysis {
  const roles = rolesFor(yong, hui);
  return {
    ...a,
    yongsin: yong,
    huisin: hui,
    roles,
    favor: favorFor(roles, a.dayMaster, a.strength.level),
    reasoning: [...a.reasoning, note],
  };
}
