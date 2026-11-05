/**
 * 엔진 호출 모음. Web Worker 안에서 실행되고, Worker를 못 쓰는 환경에서는 메인 스레드에서 같은 코드를 쓴다.
 * 결과는 구조화 복제 가능한 순수 객체만 돌려준다.
 */
import {
  analyzeName,
  analyzeSiblings,
  computeSaju,
  DATA_VERSION,
  ENGINE_VERSION,
  getHanja,
  hanjaByReading,
  isNameHanja,
  isPositiveMeaning,
  recommendNames,
  recommendSiblingSets,
  sajuForMethod,
  suggestBetterHanja,
  SURNAMES,
  surnameStrokes,
  type BirthInput,
  type NameChar,
  type SajuAnalysis,
  type SajuOptions,
  type SajuResult,
  type SchoolOptions,
} from '@aidam/engine';
import { PRESETS } from './basis';
import { FAMILIAR_HANJA } from '@aidam/engine/src/recommend/syllables';
import type { AnalyzeState, NameState } from './state';
import { KID_LABELS, kidBirth, surnameChars } from './state';

export interface HanjaOption {
  ch: string;
  meaning: string;
  strokes: number;
  element: string;
  confidence: string;
  nameUse: boolean;
  negative: boolean;
  bulyong: boolean;
  familiar: boolean;
  favor: number | null;
}

/** 자주 쓰는 한자 목록의 순서(앞일수록 이름에 흔히 씀) */
const FAMILIAR_ORDER = new Map([...FAMILIAR_HANJA].map((c, i) => [c, i]));

/** 고른 용신 방법으로 사주 풀이를 바꾼다(만세력 화면과 이름 채점이 같은 용신을 쓰게) */
function sajuWith(birth: BirthInput, opts: SajuOptions, school: SchoolOptions): SajuResult {
  const r = computeSaju(birth, opts);
  const m = school.yongsinMethod;
  if (m !== 'lacking') return r;
  const t = (a: SajuAnalysis) => sajuForMethod(a, m) as SajuAnalysis;
  return { ...r, primary: t(r.primary), alternatives: r.alternatives.map((x) => ({ ...x, analysis: t(x.analysis) })) };
}

export const api = {
  init() {
    const surnames = SURNAMES.map((s) => ({ ...s, strokes: surnameStrokes(s.hanja), meaning: [...s.hanja].map((ch) => getHanja(ch)?.meaning ?? '').join(' / ') }));
    return { surnames, engineVersion: ENGINE_VERSION, dataVersion: DATA_VERSION };
  },
  saju(birth: BirthInput, opts: SajuOptions) {
    return computeSaju(birth, opts);
  },
  recommend(state: NameState) {
    const saju = state.birth ? sajuWith(state.birth, state.sajuOpts, state.school) : null;
    const recs = recommendNames({
      surname: surnameChars(state.surname),
      gender: state.gender,
      saju: saju?.primary ?? null,
      prefs: state.prefs,
      options: state.school,
      limit: 100,
    });
    return { saju, recs };
  },
  /** 다둥이: 아이마다 사주를 세우고 이름 세트를 추천 */
  recommendKids(state: NameState) {
    const kids = state.kids ?? [];
    const children = kids.map((k, i) => ({
      label: KID_LABELS[i] ?? `${i + 1}`,
      gender: k.gender,
      birth: state.birth ? { ...state.birth, time: k.time } : null,
    }));
    const sajus = children.map((c) => (c.birth ? sajuWith(c.birth, state.sajuOpts, state.school) : null));
    const sets = recommendSiblingSets(surnameChars(state.surname), children, state.prefs, state.sajuOpts, state.school, 20);
    const sameSaju = sajus.length > 1 && sajus.every((s) => s && JSON.stringify(s.base.pillars) === JSON.stringify(sajus[0]?.base.pillars));
    return { sajus, sets, sameSaju };
  },
  /**
   * 다둥이를 아이마다 따로: 아이별 사주로 각각 추천한다.
   * 사주·성별이 같으면 목록도 같고, 화면에서 아이마다 하나씩 고른다(같은 이름은 두 번 고를 수 없음).
   */
  recommendEach(state: NameState) {
    const kids = state.kids ?? [];
    const out = kids.map((k, i) => {
      const birth = state.birth ? { ...state.birth, time: k.time } : null;
      const saju = birth ? sajuWith(birth, state.sajuOpts, state.school) : null;
      const recs = recommendNames({ surname: surnameChars(state.surname), gender: k.gender, saju: saju?.primary ?? null, prefs: state.prefs, options: state.school, limit: 100 });
      return { label: KID_LABELS[i] ?? `${i + 1}`, gender: k.gender, saju, recs };
    });
    const pillarsOf = (s: (typeof out)[number]['saju']) => (s ? JSON.stringify(s.base.pillars) : '');
    const sameSaju = out.length > 1 && out.every((k) => k.saju && pillarsOf(k.saju) === pillarsOf(out[0]!.saju));
    return { sameSaju, kids: out };
  },
  /** 고른 이름들의 다둥이 궁합 */
  harmony(state: NameState, given: NameChar[][]) {
    const kids = state.kids ?? [];
    const children = kids.map((k, i) => ({ label: KID_LABELS[i] ?? `${i + 1}`, gender: k.gender, birth: kidBirth(state, i), given: given[i] ?? [] }));
    const r = analyzeSiblings(surnameChars(state.surname), children, state.sajuOpts, state.school);
    return { pairs: r.pairs, total: r.total };
  },
  analyze(state: AnalyzeState) {
    const saju = state.birth ? sajuWith(state.birth, state.sajuOpts, state.school) : null;
    const input = { surname: surnameChars(state.surname), given: state.given, gender: state.gender };
    const report = analyzeName(input, saju?.primary ?? null, state.school);
    const allHanja = state.given.every((g) => g.hanja);
    const better = allHanja ? suggestBetterHanja(input, saju?.primary ?? null, state.school, 20) : [];
    // 같은 이름을 두 기준(정통 성명학·일반 작명앱)으로 함께 채점해 비교해 보여 준다
    const base = state.birth ? computeSaju(state.birth, state.sajuOpts).primary : null;
    const compare = (Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((k) => {
      const r = analyzeName(input, base, { ...state.school, ...(PRESETS[k] as unknown as Partial<SchoolOptions>) });
      return { key: k, total: r.score.total, grade: r.score.grade, partial: r.score.partial };
    });
    return { saju, report, better, compare };
  },
  /** 셀프 작명용 한자 후보 (친숙·좋은 뜻·인명용 순) */
  hanjaOptions(syllable: string, initial: boolean, birth: BirthInput | null, opts: SajuOptions): HanjaOption[] {
    const favor = birth ? computeSaju(birth, opts).primary.favor : null;
    const list = hanjaByReading(syllable, { initial }).map((h) => ({
      ch: h.ch,
      meaning: h.meaning,
      strokes: h.strokes,
      element: h.element,
      confidence: h.elementConfidence,
      nameUse: isNameHanja(h),
      negative: h.negative,
      bulyong: h.bulyong,
      familiar: FAMILIAR_HANJA.has(h.ch) || isPositiveMeaning(h.meaning),
      favor: favor ? favor[h.element] : null,
    }));
    // 이름에 많이 쓰는 한자부터: 자주 쓰는 한자 목록의 순서 → 인명용·좋은 뜻 → 나머지, 피하는 뜻은 맨 뒤
    const tier = (o: HanjaOption) => (o.negative || !o.nameUse ? 3 : FAMILIAR_ORDER.has(o.ch) ? 0 : o.familiar ? 1 : 2);
    return list.sort(
      (a, b) =>
        tier(a) - tier(b) ||
        (FAMILIAR_ORDER.get(a.ch) ?? 0) - (FAMILIAR_ORDER.get(b.ch) ?? 0) ||
        a.strokes - b.strokes ||
        (a.ch.codePointAt(0) ?? 0) - (b.ch.codePointAt(0) ?? 0),
    );
  },
};

export type Api = typeof api;
