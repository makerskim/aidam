import type { SchoolOptions } from '@aidam/engine';

/**
 * 계산 기준. 작명 이론은 학파·서비스마다 달라, 보는 사람이 항목마다 두 가지 중에서 고른다.
 * - 정통 성명학(아이담 기본): 억부·조후 용신, 해례본, 정통 배점, 부수 기준 한자오행
 * - 실용 작명법: 부족한 오행 용신, 운해본, 실용 배점(수리오행 15점), 부수 기준 한자오행 — 시중 작명 앱·작명소에서 널리 쓰는 방식
 * 알고리즘 전체는 docs/naming-algorithm.md
 */
export type BasisKey = 'yongsinMethod' | 'soundSchool' | 'scoring' | 'hanjaElement';

export interface BasisItem {
  key: BasisKey;
  label: string;
  desc: string;
  options: { value: string; label: string }[];
}

export const BASIS_ITEMS: BasisItem[] = [
  {
    key: 'yongsinMethod',
    label: '용신 정하는 법',
    desc: '억부·조후는 사주 힘의 강약과 태어난 계절로, 부족한 오행은 여덟 글자 중 적은 오행으로 정해요.',
    options: [
      { value: 'eokbu', label: '억부·조후' },
      { value: 'lacking', label: '부족한 오행' },
    ],
  },
  {
    key: 'soundSchool',
    label: '발음오행',
    desc: 'ㅇ·ㅎ과 ㅁ·ㅂ·ㅍ의 오행이 학설마다 반대예요. 해례본은 훈민정음 원문, 운해본은 많은 작명소가 써요.',
    options: [
      { value: 'haerye', label: '해례본' },
      { value: 'unhae', label: '운해본' },
    ],
  },
  {
    key: 'scoring',
    label: '배점 (수리오행 포함)',
    desc: '정통: 한자오행 30 · 수리 25(수리오행 3) · 발음 20 · 음양 10 · 뜻 15. 실용: 한자오행 25 · 수리 40(수리오행 15) · 발음 20 · 음양 15.',
    options: [
      { value: 'classic', label: '정통 배점' },
      { value: 'app', label: '실용 배점' },
    ],
  },
  {
    key: 'hanjaElement',
    label: '한자오행',
    desc: '한자의 오행을 부수(氵→물)로 먼저 볼지, 뜻(하늘·빛…)으로 먼저 볼지예요.',
    options: [
      { value: 'radical', label: '부수 기준' },
      { value: 'meaning', label: '뜻 기준' },
    ],
  },
];

export const PRESETS = {
  classic: { yongsinMethod: 'eokbu', soundSchool: 'haerye', scoring: 'classic', hanjaElement: 'radical' },
  app: { yongsinMethod: 'lacking', soundSchool: 'unhae', scoring: 'app', hanjaElement: 'radical' },
} as const satisfies Record<string, Record<BasisKey, string>>;

export const PRESET_LABEL = { classic: '정통 성명학', app: '실용 작명법' } as const;
/** 묶음 한 줄 설명 */
export const PRESET_DESC = {
  classic: '억부·조후 용신 · 해례본 · 뜻까지 보는 배점',
  app: '부족한 오행 용신 · 운해본 · 수리 중심 배점',
} as const;

export function basisValue(school: SchoolOptions, key: BasisKey): string {
  const defaults: Record<BasisKey, string> = PRESETS.classic;
  return (school[key] as string | undefined) ?? defaults[key];
}

/** 지금 기준이 어느 묶음과 같은지(둘 다 아니면 null) */
export function presetOf(school: SchoolOptions): keyof typeof PRESETS | null {
  for (const k of Object.keys(PRESETS) as (keyof typeof PRESETS)[]) {
    if (BASIS_ITEMS.every((it) => basisValue(school, it.key) === PRESETS[k][it.key])) return k;
  }
  return null;
}

export function withPreset(school: SchoolOptions, k: keyof typeof PRESETS): SchoolOptions {
  return { ...school, ...(PRESETS[k] as unknown as Partial<SchoolOptions>) };
}

/** 한 줄 요약: "억부·조후 · 해례본 · 수리오행 가볍게 · 부수 기준" */
export function basisSummary(school: SchoolOptions): string {
  const p = presetOf(school);
  if (p) return PRESET_LABEL[p];
  return BASIS_ITEMS.map((it) => {
    const v = it.options.find((o) => o.value === basisValue(school, it.key))?.label ?? '';
    return v;
  }).join(' · ');
}
