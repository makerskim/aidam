import { ELEMENT_HANJA, ELEMENT_KO, relation, type Element } from '../core/elements';
import { isHangulSyllable } from '../hangul/jamo';
import { applyDueum } from '../hangul/dueum';
import { pronounce } from '../hangul/pronounce';
import { ROLE_KO, type SajuAnalysis } from '../saju/analysis';
import { combineScore, type ScoreBreakdown } from '../score/score';
import { analysisCode } from '../share/hash';
import { DATA_VERSION, ENGINE_VERSION } from '../version';
import { getHanja, isNameHanja, type HanjaEntry } from './hanjaDb';
import { FLOW_KO, SCHOOL_KO, soundElement, soundFlow, vowelYinYang, type SoundFlow, type SoundSchool } from './sound';
import { FRAME_KO, fourFrames, strokeYinYang, suriElement, type FourFrames } from './suri';
import { LUCK_KO, suri81, type SuriInfo } from './suri81';
import { teaseWord } from './safety';

export interface NameChar {
  hangul: string;
  hanja: string | null;
}

export type Gender = 'male' | 'female' | 'unknown';

export interface NameInput {
  surname: NameChar[];
  given: NameChar[];
  gender: Gender;
}

export interface SchoolOptions {
  soundSchool: SoundSchool;
  /** 4격 흉수·음령 상극이 있으면 추천에서 제외 */
  strictMode: boolean;
  /** 여아 이름의 21·23·33·39를 강한 수로 보는 학설 */
  femaleStrongNumbers: boolean;
  /** 전통 불용한자를 추천에서 제외 */
  excludeBulyong: boolean;
  /** 받침 오행까지 음령오행에 포함 */
  includeFinalConsonant: boolean;
  /** 해례본·운해본 두 학설 모두에서 음령오행 상극이 없는 이름만 추천 */
  bothSchoolsNoClash?: boolean;
}

export const DEFAULT_SCHOOL_OPTIONS: SchoolOptions = {
  soundSchool: 'haerye',
  strictMode: true,
  femaleStrongNumbers: false,
  excludeBulyong: false,
  includeFinalConsonant: false,
};

export type ReasonArea = 'saju' | 'resource' | 'suri' | 'sound' | 'yinyang' | 'practical';
export interface Reason {
  area: ReasonArea;
  tone: 'good' | 'neutral' | 'bad';
  text: string;
}

export interface FrameResult {
  key: keyof FourFrames;
  n: number;
  info: SuriInfo;
  /** 1 길, 0.5 반길(또는 여성 강수), 0 흉 */
  value: number;
  element: Element;
}

export interface ResourceChar {
  ch: string;
  element: Element;
  confidence: 'A' | 'B' | 'C';
  basis: string;
  favor: number | null;
  role: string | null;
}

export interface NameReport {
  input: NameInput;
  fullHangul: string;
  fullHanja: string | null;
  surnameChars: (HanjaEntry | null)[];
  chars: (HanjaEntry | null)[];
  surnameStrokes: number | null;
  frames: FourFrames | null;
  frameResults: FrameResult[];
  soundBySchool: Record<SoundSchool, SoundFlow>;
  vowel: ReturnType<typeof vowelYinYang>;
  strokeYinYang: ReturnType<typeof strokeYinYang> | null;
  resource: ResourceChar[];
  pronunciation: string[];
  score: ScoreBreakdown;
  reasons: Reason[];
  warnings: string[];
  options: SchoolOptions;
  analysisCode: string;
  engineVersion: string;
  dataVersion: string;
}

const STRONG_NUMBERS = new Set([21, 23, 33, 39]);
const elName = (e: Element) => `${ELEMENT_KO[e]}(${ELEMENT_HANJA[e]})`;
const LUCK_VALUE = { good: 1, half: 0.5, bad: 0 } as const;
const FRAME_WEIGHTS = { won: 5, hyeong: 5, i: 5, jeong: 7 } as const;

/** ① 자원오행 점수(0..30). 추천 탐색과 분석이 같은 공식을 쓴다. */
export function resourcePointsFor(entries: readonly HanjaEntry[], saju: SajuAnalysis | null): number {
  if (saju) {
    let wsum = 0;
    let fsum = 0;
    for (const h of entries) {
      const w = h.elementConfidence === 'C' ? 0.5 : 1;
      wsum += w;
      fsum += w * saju.favor[h.element];
    }
    const avg = fsum / wsum;
    return Math.min(30, ((avg + 1) / 2) * 28 + (entries.some((h) => h.element === saju.yongsin) ? 2 : 0));
  }
  if (entries.length === 1) return 20;
  let s = 0;
  for (let i = 0; i < entries.length - 1; i++) {
    const rel = relation((entries[i] as HanjaEntry).element, (entries[i + 1] as HanjaEntry).element);
    s += rel === 'generates' || rel === 'generatedBy' ? 30 : rel === 'same' ? 20 : 10;
  }
  return s / (entries.length - 1);
}

/** ② 수리 점수(0..25)와 4격 결과 */
export function suriPointsFor(
  surnameStrokes: number,
  strokes: number[],
  gender: Gender,
  options: SchoolOptions,
): { frames: FourFrames; results: FrameResult[]; points: number; noBad: boolean; strongHits: (keyof FourFrames)[] } {
  const frames = fourFrames(surnameStrokes, strokes);
  const results: FrameResult[] = [];
  const strongHits: (keyof FourFrames)[] = [];
  let points = 0;
  let noBad = true;
  for (const key of ['won', 'hyeong', 'i', 'jeong'] as const) {
    const n = frames[key];
    const info = suri81(n);
    let value: number = LUCK_VALUE[info.luck];
    if (options.femaleStrongNumbers && gender === 'female' && STRONG_NUMBERS.has(n)) {
      value = Math.min(value, 0.5);
      strongHits.push(key);
    }
    // 외자 이름의 이격은 성 획수만으로 정해져 이름으로 바꿀 수 없으므로 엄격 기준에서 뺀다
    const fixedBySurname = strokes.length === 1 && key === 'i';
    if (info.luck === 'bad' && !fixedBySurname) noBad = false;
    points += FRAME_WEIGHTS[key] * value;
    results.push({ key, n, info, value, element: suriElement(n) });
  }
  let flow = 0;
  for (let i = 0; i < 3; i++) {
    const rel = relation((results[i] as FrameResult).element, (results[i + 1] as FrameResult).element);
    flow += rel === 'generates' || rel === 'generatedBy' ? 1 : rel === 'same' ? 0.5 : 0;
  }
  points += (flow / 3) * 3;
  return { frames, results, points, noBad, strongHits };
}

function resolve(c: NameChar, warnings: string[], initial: boolean): HanjaEntry | null {
  if (!c.hanja) return null;
  const h = getHanja(c.hanja);
  if (!h) {
    warnings.push(`${c.hanja}은(는) 데이터에 없는 한자라 획수·오행을 계산하지 못했어요. 대법원 인명용 한자인지 확인해 주세요.`);
    return null;
  }
  if (!isNameHanja(h)) {
    warnings.push(`${c.hanja}은(는) 인명용 한자 목록(2015·2018 기준)에 없어요. 최신 대법원 목록을 확인해 주세요.`);
  }
  const ok = h.readings.includes(c.hangul) || (initial && h.readings.some((r) => applyDueum(r) === c.hangul));
  if (!ok) warnings.push(`${c.hanja}의 음은 '${h.readings.join('·')}'인데 '${c.hangul}'로 입력됐어요.`);
  return h;
}

function validate(input: NameInput) {
  const okChars = (arr: NameChar[], min: number, max: number) =>
    arr.length >= min && arr.length <= max && arr.every((c) => isHangulSyllable(c.hangul));
  if (!okChars(input.surname, 1, 2) || !okChars(input.given, 1, 4)) throw new RangeError('INVALID_NAME');
}

export function analyzeName(
  input: NameInput,
  saju: SajuAnalysis | null,
  options: SchoolOptions = DEFAULT_SCHOOL_OPTIONS,
  preference = 1,
): NameReport {
  validate(input);
  const warnings: string[] = [];
  const reasons: Reason[] = [];
  const surnameChars = input.surname.map((c) => resolve(c, warnings, false));
  const chars = input.given.map((c, i) => resolve(c, warnings, i === 0));
  const syllables = [...input.surname, ...input.given].map((c) => c.hangul);
  const fullHangul = syllables.join('');
  const allHanja = [...input.surname, ...input.given].every((c) => c.hanja);
  const fullHanja = allHanja ? [...input.surname, ...input.given].map((c) => c.hanja).join('') : null;

  // ① 자원오행
  const givenKnown = chars.every((h): h is HanjaEntry => h !== null);
  const resource: ResourceChar[] = chars.filter((h): h is HanjaEntry => h !== null).map((h) => ({
    ch: h.ch,
    element: h.element,
    confidence: h.elementConfidence,
    basis: h.elementBasis,
    favor: saju ? saju.favor[h.element] : null,
    role: saju ? ROLE_KO[saju.roles[h.element]] : null,
  }));
  let resourcePts: number | null = null;
  if (givenKnown) {
    resourcePts = resourcePointsFor(chars as HanjaEntry[], saju);
    if (saju) {
      reasons.push({ area: 'saju', tone: 'neutral', text: `이 사주의 용신은 ${elName(saju.yongsin)}, 희신은 ${elName(saju.huisin)}입니다.` });
      for (const r of resource) {
        const tone = (r.favor ?? 0) > 0.25 ? 'good' : (r.favor ?? 0) < 0 ? 'bad' : 'neutral';
        const h = getHanja(r.ch);
        reasons.push({
          area: 'resource',
          tone,
          text: `${r.ch}(${h?.meaning.split(',')[0] ?? ''}) 자원오행 ${elName(r.element)} — ${r.role}${tone === 'good' ? '이라 사주를 보완해요' : tone === 'bad' ? '이라 사주와 맞지 않아요' : ''}${r.confidence === 'C' ? ' (오행 추정)' : ''}`,
        });
      }
    } else {
      warnings.push('출생 정보(사주)가 없어 용신 보완은 평가하지 못하고, 한자 오행끼리의 흐름만 봤어요.');
      for (const r of resource) reasons.push({ area: 'resource', tone: 'neutral', text: `${r.ch} 자원오행 ${elName(r.element)}` });
    }
  }

  // ② 수리
  const surnameKnown = surnameChars.every((h): h is HanjaEntry => h !== null);
  const surnameStrokes = surnameKnown ? surnameChars.reduce((s, h) => s + (h as HanjaEntry).strokes, 0) : null;
  let frames: FourFrames | null = null;
  const frameResults: FrameResult[] = [];
  let suriPts: number | null = null;
  let strictFrames = true;
  if (surnameStrokes !== null && givenKnown) {
    const s = suriPointsFor(surnameStrokes, chars.map((h) => (h as HanjaEntry).strokes), input.gender, options);
    frames = s.frames;
    suriPts = s.points;
    strictFrames = s.noBad;
    frameResults.push(...s.results);
    for (const key of s.strongHits) {
      warnings.push(`${FRAME_KO[key].name} ${frames[key]}은(는) 여아에게 너무 강한 수로 보는 학설이 있어요.`);
    }
    const iFrame = s.results.find((f) => f.key === 'i');
    if (input.given.length === 1 && iFrame && iFrame.info.luck === 'bad') {
      warnings.push(`외자 이름은 이격이 성 획수(${iFrame.n})로만 정해져 이름으로 바꿀 수 없어요. 그래서 엄격 기준에서는 이격을 빼고 봤어요.`);
    }
    for (const f of s.results) {
      reasons.push({
        area: 'suri',
        tone: f.info.luck === 'good' ? 'good' : f.info.luck === 'bad' ? 'bad' : 'neutral',
        text: `${FRAME_KO[f.key].name}(${FRAME_KO[f.key].period}) ${f.n} ${f.info.name} — ${LUCK_KO[f.info.luck]}: ${f.info.desc}`,
      });
    }
  }

  // ③ 음령오행
  const soundBySchool = {
    haerye: soundFlow(syllables, 'haerye', options.includeFinalConsonant),
    unhae: soundFlow(syllables, 'unhae', options.includeFinalConsonant),
  };
  const flow = soundBySchool[options.soundSchool];
  for (const pair of flow.pairs) {
    reasons.push({
      area: 'sound',
      tone: pair.kind === 'clash' ? 'bad' : pair.kind === 'same' ? 'neutral' : 'good',
      text: `${elName(pair.from)} → ${elName(pair.to)} ${FLOW_KO[pair.kind]} (${SCHOOL_KO[options.soundSchool]})`,
    });
  }
  const other: SoundSchool = options.soundSchool === 'haerye' ? 'unhae' : 'haerye';
  reasons.push({
    area: 'sound',
    tone: 'neutral',
    text: `참고: ${SCHOOL_KO[other]} 기준으로는 ${syllables.map((s) => { const e = soundElement(s, other); return e ? ELEMENT_HANJA[e] : '?'; }).join('→')} (${Math.round(soundBySchool[other].score * 100)}점)`,
  });

  // ④ 음양
  const vowel = vowelYinYang(syllables);
  const allStrokesKnown = surnameKnown && givenKnown;
  const syy = allStrokesKnown ? strokeYinYang([...surnameChars, ...chars].map((h) => (h as HanjaEntry).strokes)) : null;
  const yyKo = { yang: '양', yin: '음', neutral: '중' } as const;
  if (syy) {
    reasons.push({ area: 'yinyang', tone: syy.balanced ? 'good' : 'bad', text: `수리음양 ${syy.pattern.map((x) => yyKo[x]).join('·')} — ${syy.balanced ? '조화' : '한쪽으로 치우침'}` });
  }
  reasons.push({
    area: 'yinyang',
    tone: vowel.level === 'harmony' ? 'good' : vowel.level === 'unbalanced' ? 'bad' : 'neutral',
    text: `소리음양(모음) ${vowel.pattern.map((x) => yyKo[x]).join('·')} — ${{ harmony: '조화', normal: '보통', unbalanced: '불균형' }[vowel.level]}`,
  });

  // ⑤ 뜻·어감·실용
  const pron = pronounce(syllables);
  const pronChanged = pron.join('') !== fullHangul;
  const given = input.given.map((c) => c.hangul);
  const repeated = given.some((s, i) => i > 0 && s === given[i - 1]);
  const tease = teaseWord(fullHangul);
  const negative = chars.some((h) => h?.negative);
  const bulyong = chars.some((h) => h?.bulyong);
  let pracPts = 0;
  let pracMax = 0;
  if (givenKnown) {
    pracMax += 5;
    pracPts += negative ? 0 : 5;
    pracMax += 3;
    pracPts += bulyong ? 0 : 3;
  }
  pracMax += 4;
  pracPts += tease ? 0 : Math.max(0, 4 - (pronChanged ? 2 : 0) - (repeated ? 2 : 0));
  pracMax += 3;
  pracPts += 3 * Math.max(0, Math.min(1, preference));
  if (negative) {
    for (const h of chars) if (h?.negative) {
      reasons.push({ area: 'practical', tone: 'bad', text: `${h.ch}(${h.meaning.split(',')[0]})는 이름에 피하는 뜻이에요.` });
      warnings.push(`${h.ch}(${h.meaning.split(',')[0]})는 이름에 쓰기 좋지 않은 뜻이에요.`);
    }
  } else if (givenKnown) reasons.push({ area: 'practical', tone: 'good', text: '한자 뜻에 피해야 할 의미가 없어요.' });
  if (bulyong) {
    const list = chars.filter((h) => h?.bulyong).map((h) => h?.ch).join(', ');
    reasons.push({ area: 'practical', tone: 'neutral', text: `${list}은(는) 일부 학설에서 불용한자로 봐요(요즘은 흔히 쓰기도 해요).` });
  }
  if (pronChanged) reasons.push({ area: 'practical', tone: 'neutral', text: `실제로는 [${pron.join('')}]로 소리 나요.` });
  if (repeated) reasons.push({ area: 'practical', tone: 'neutral', text: '같은 소리가 반복돼요.' });
  if (tease) {
    reasons.push({ area: 'practical', tone: 'bad', text: `'${tease}'처럼 들려 놀림받을 수 있어요.` });
    warnings.push(`'${tease}'처럼 들려 놀림받을 수 있어요.`);
  }

  const passesStrict = strictFrames && !flow.pairs.some((p) => p.kind === 'clash') && !negative && !tease;
  const score = combineScore({
    resource: resourcePts,
    suri: suriPts,
    sound: flow.score * 20,
    strokeYinYang: syy ? (syy.balanced ? 6 : 0) : null,
    vowelYinYang: vowel.score * 4,
    practical: { points: pracPts, max: pracMax },
    passesStrict,
  });
  if (score.partial) warnings.push('한자를 고르지 않은 글자가 있어 자원오행·수리는 빼고 계산했어요.');

  const code = analysisCode({
    input, options, preference,
    saju: saju ? { pillars: saju.pillars, favor: saju.favor } : null,
    engine: ENGINE_VERSION, data: DATA_VERSION,
  });

  return {
    input, fullHangul, fullHanja, surnameChars, chars, surnameStrokes, frames, frameResults, soundBySchool, vowel,
    strokeYinYang: syy, resource, pronunciation: pron, score, reasons, warnings: [...new Set(warnings)], options,
    analysisCode: code, engineVersion: ENGINE_VERSION, dataVersion: DATA_VERSION,
  };
}
