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
  /** 용신을 정한 방법: 억부·조후(기본) / 부족한 오행 */
  method?: YongsinMethod;
}

/** 용신 정하는 법. eokbu: 억부·조후(사주 힘의 강약과 계절), lacking: 사주 여덟 글자에서 적은 오행을 채움(많은 작명 앱) */
export type YongsinMethod = 'eokbu' | 'lacking';

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
  const g = (k: TenGodGroup) => `${GROUP_KO[k]} ${el(groupElement[k])}`;
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
  const favor = favorFor(roles, dayMaster, level);
  // 사주 여덟 글자에 하나도 없는 오행은, 해가 되는 기운(기신·구신)이 아니면 채워 주는 게 좋다고 본다.
  // 많은 작명 앱이 쓰는 '부족한 오행 채우기'와도 어긋나지 않게 한다.
  for (const e of ELEMENTS) if (counts[e] === 0 && roles[e] === 'han') favor[e] = Math.max(favor[e], 0.5);
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
    favor,
    reasoning,
  };
}

/** 용신·희신을 바꿔 역할과 선호도를 다시 계산 (시간 모름 다수결용) */
export function withYongsin(a: SajuAnalysis, yong: Element, hui: Element, note: string): SajuAnalysis {
  const roles = rolesFor(yong, hui);
  const favor = favorFor(roles, a.dayMaster, a.strength.level);
  // 사주 여덟 글자에 하나도 없는 오행은, 해가 되는 기운(기신·구신)이 아니면 채워 주는 게 좋다고 본다.
  // 많은 작명 앱이 쓰는 '부족한 오행 채우기'와도 어긋나지 않게 한다.
  for (const e of ELEMENTS) if (a.counts[e] === 0 && roles[e] === 'han') favor[e] = Math.max(favor[e], 0.5);
  return {
    ...a,
    yongsin: yong,
    huisin: hui,
    roles,
    favor,
    reasoning: [...a.reasoning, note],
  };
}

/**
 * '부족한 오행' 방식: 사주 여덟 글자를 세어 가장 적은 오행을 용신, 다음으로 적은 오행을 희신,
 * 가장 많은 오행을 기신, 다음으로 많은 오행을 구신으로 본다(같으면 세력이 약한 쪽을 적다고 본다).
 */
export function lackingMethod(a: SajuAnalysis): SajuAnalysis {
  if (a.method === 'lacking') return a;
  const order = [...ELEMENTS].sort((x, y) => a.counts[x] - a.counts[y] || a.power[x] - a.power[y] || ELEMENTS.indexOf(x) - ELEMENTS.indexOf(y));
  const [yong, hui, han, gu, gi] = order as [Element, Element, Element, Element, Element];
  const roles = { [yong]: 'yong', [hui]: 'hui', [han]: 'han', [gu]: 'gu', [gi]: 'gi' } as Record<Element, Role>;
  const favor = emptyElementRecord();
  favor[yong] = 1;
  favor[hui] = 0.8;
  favor[han] = 0.2;
  favor[gu] = -0.5;
  favor[gi] = -1;
  return {
    ...a,
    roles,
    yongsin: yong,
    huisin: hui,
    favor,
    method: 'lacking',
    reasoning: [
      ...a.reasoning.slice(0, 1),
      `부족한 오행 방식: 사주 여덟 글자를 세어 가장 적은 ${el(yong)}(${a.counts[yong]}개)을 용신, 다음으로 적은 ${el(hui)}(${a.counts[hui]}개)을 희신으로 봅니다. 가장 많은 ${el(gi)}(${a.counts[gi]}개)은 피합니다.`,
    ],
  };
}

/** 고른 용신 방법에 맞는 사주 풀이 */
export function sajuForMethod(a: SajuAnalysis | null, method: YongsinMethod | undefined): SajuAnalysis | null {
  if (!a) return null;
  return method === 'lacking' ? lackingMethod(a) : a;
}
