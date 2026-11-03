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
  hanjaByReading,
  isNameHanja,
  isPositiveMeaning,
  recommendNames,
  recommendSiblingSets,
  suggestBetterHanja,
  SURNAMES,
  type BirthInput,
  type SajuOptions,
} from '@aidam/engine';
import { FAMILIAR_HANJA } from '@aidam/engine/src/recommend/syllables';
import type { AnalyzeState, NameState, SiblingState } from './state';
import { surnameChars } from './state';

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

export const api = {
  init() {
    return { surnames: SURNAMES.map((s) => ({ ...s })), engineVersion: ENGINE_VERSION, dataVersion: DATA_VERSION };
  },
  saju(birth: BirthInput, opts: SajuOptions) {
    return computeSaju(birth, opts);
  },
  recommend(state: NameState) {
    const saju = state.birth ? computeSaju(state.birth, state.sajuOpts) : null;
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
  analyze(state: AnalyzeState) {
    const saju = state.birth ? computeSaju(state.birth, state.sajuOpts) : null;
    const input = { surname: surnameChars(state.surname), given: state.given, gender: state.gender };
    const report = analyzeName(input, saju?.primary ?? null, state.school);
    const allHanja = state.given.every((g) => g.hanja);
    const better = allHanja ? suggestBetterHanja(input, saju?.primary ?? null, state.school, 3) : [];
    return { saju, report, better };
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
    const rank = (o: HanjaOption) =>
      (o.nameUse ? 4 : 0) + (o.familiar ? 2 : 0) + (o.meaning ? 1 : 0) - (o.negative ? 5 : 0) + (o.favor ?? 0) * 0.5;
    return list.sort((a, b) => rank(b) - rank(a) || (a.ch.codePointAt(0) ?? 0) - (b.ch.codePointAt(0) ?? 0));
  },
  siblings(state: SiblingState) {
    const surname = surnameChars(state.surname);
    if (state.mode === 'analyze') {
      return { kind: 'analyze' as const, result: analyzeSiblings(surname, state.children, state.sajuOpts, state.school) };
    }
    return { kind: 'recommend' as const, result: recommendSiblingSets(surname, state.children, state.prefs, state.sajuOpts, state.school, 10) };
  },
};

export type Api = typeof api;
