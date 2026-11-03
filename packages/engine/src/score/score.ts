/** 100점 채점 (설계서 9절) */
export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';

export interface ScoreBreakdown {
  /** ① 자원오행 × 용희신 (0..30) */
  resource: number;
  /** ② 수리 (0..25) */
  suri: number;
  /** ③ 음령오행 (0..20) */
  sound: number;
  /** ④ 음양 (0..10) */
  yinyang: number;
  /** ⑤ 뜻·어감·실용 (0..15) */
  practical: number;
  /** 0..100 (부분 분석이면 가능한 영역 만점 기준으로 환산) */
  total: number;
  grade: Grade;
  /** 한자가 없는 글자가 있어 일부 영역을 계산하지 못함 */
  partial: boolean;
  /** 엄격 기준(4격 흉수 없음, 음령오행 상극 없음, 부정 뜻·놀림 없음) 통과 */
  passesStrict: boolean;
}

export const MAX = { resource: 30, suri: 25, sound: 20, yinyang: 10, practical: 15 } as const;

export function gradeOf(total: number): Grade {
  if (total >= 90) return 'S';
  if (total >= 80) return 'A';
  if (total >= 70) return 'B';
  if (total >= 60) return 'C';
  return 'D';
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface ScoreParts {
  resource: number | null;
  suri: number | null;
  sound: number;
  /** 수리음양(0..6), 계산 불가면 null */
  strokeYinYang: number | null;
  /** 소리음양(0..4) */
  vowelYinYang: number;
  /** 실용 점수와 가능한 만점 */
  practical: { points: number; max: number };
  passesStrict: boolean;
}

export function combineScore(p: ScoreParts): ScoreBreakdown {
  let got = 0;
  let max = 0;
  const add = (v: number | null, m: number) => {
    if (v === null) return;
    got += v;
    max += m;
  };
  add(p.resource, MAX.resource);
  add(p.suri, MAX.suri);
  add(p.sound, MAX.sound);
  const yinyang = (p.strokeYinYang ?? 0) + p.vowelYinYang;
  add(yinyang, p.strokeYinYang === null ? 4 : MAX.yinyang);
  add(p.practical.points, p.practical.max);
  const total = max > 0 ? round1((got / max) * 100) : 0;
  return {
    resource: round1(p.resource ?? 0),
    suri: round1(p.suri ?? 0),
    sound: round1(p.sound),
    yinyang: round1(yinyang),
    practical: round1(p.practical.points),
    total,
    grade: gradeOf(total),
    partial: max < 100,
    passesStrict: p.passesStrict,
  };
}
