/**
 * 엔진 호출 모음. Web Worker 안에서 실행되고, Worker를 못 쓰는 환경에서는 메인 스레드에서 같은 코드를 쓴다.
 * 결과는 구조화 복제 가능한 순수 객체만 돌려준다.
 */
import {
  analyzeName,
  computeSaju,
  DATA_VERSION,
  ENGINE_VERSION,
  getHanja,
  hanjaByReading,
  isNameHanja,
  isPositiveMeaning,
  recommendNames,
  recommendSiblingSets,
  suggestBetterHanja,
  SURNAMES,
  surnameStrokes,
  type BirthInput,
  type Recommendation,
  type SajuOptions,
} from '@aidam/engine';
import { FAMILIAR_HANJA } from '@aidam/engine/src/recommend/syllables';
import type { AnalyzeState, NameState } from './state';
import { KID_LABELS, surnameChars } from './state';

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
    const surnames = SURNAMES.map((s) => ({ ...s, strokes: surnameStrokes(s.hanja), meaning: [...s.hanja].map((ch) => getHanja(ch)?.meaning ?? '').join(' / ') }));
    return { surnames, engineVersion: ENGINE_VERSION, dataVersion: DATA_VERSION };
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
  /** 다둥이: 아이마다 사주를 세우고 이름 세트를 추천 */
  recommendKids(state: NameState) {
    const kids = state.kids ?? [];
    const children = kids.map((k, i) => ({
      label: KID_LABELS[i] ?? `${i + 1}`,
      gender: k.gender,
      birth: state.birth ? { ...state.birth, time: k.time } : null,
    }));
    const sajus = children.map((c) => (c.birth ? computeSaju(c.birth, state.sajuOpts) : null));
    const sets = recommendSiblingSets(surnameChars(state.surname), children, state.prefs, state.sajuOpts, state.school, 10);
    const sameSaju = sajus.length > 1 && sajus.every((s) => s && JSON.stringify(s.base.pillars) === JSON.stringify(sajus[0]?.base.pillars));
    return { sajus, sets, sameSaju };
  },
  /**
   * 다둥이를 아이마다 따로: 아이별 사주로 각각 추천하되, 같은 이름이 두 아이에게 겹치지 않게 나눈다.
   * 사주·성별이 같으면 추천 목록도 같으므로, 아이들이 차례를 바꿔 가며 자기 순위가 가장 높은
   * 남은 이름을 하나씩 가져간다(드래프트). 결과는 언제나 같다.
   */
  recommendEach(state: NameState) {
    const kids = state.kids ?? [];
    const raw = kids.map((k, i) => {
      const birth = state.birth ? { ...state.birth, time: k.time } : null;
      const saju = birth ? computeSaju(birth, state.sajuOpts) : null;
      const recs = recommendNames({ surname: surnameChars(state.surname), gender: k.gender, saju: saju?.primary ?? null, prefs: state.prefs, options: state.school, limit: 100 });
      return { label: KID_LABELS[i] ?? `${i + 1}`, gender: k.gender, saju, recs };
    });
    const key = (r: { hangul: string }) => r.hangul;
    const taken = new Set<string>();
    const picked: Recommendation[][] = raw.map(() => []);
    const cursor = raw.map(() => 0);
    const n = raw.length;
    for (let round = 0; picked.some((p, i) => cursor[i]! < (raw[i]?.recs.length ?? 0)); round++) {
      for (let t = 0; t < n; t++) {
        const i = (round + t) % n;
        const list = raw[i]!.recs;
        while (cursor[i]! < list.length && taken.has(key(list[cursor[i]!]!))) cursor[i]! += 1;
        const rec = list[cursor[i]!];
        if (!rec) continue;
        cursor[i]! += 1;
        taken.add(key(rec));
        picked[i]!.push(rec);
      }
    }
    const pillarsOf = (s: (typeof raw)[number]['saju']) => (s ? JSON.stringify(s.base.pillars) : '');
    const sameSaju = n > 1 && raw.every((k) => k.saju && pillarsOf(k.saju) === pillarsOf(raw[0]!.saju));
    return { sameSaju, kids: raw.map((k, i) => ({ ...k, recs: picked[i] ?? [] })) };
  },
  analyze(state: AnalyzeState) {
    const saju = state.birth ? computeSaju(state.birth, state.sajuOpts) : null;
    const input = { surname: surnameChars(state.surname), given: state.given, gender: state.gender };
    const report = analyzeName(input, saju?.primary ?? null, state.school);
    const allHanja = state.given.every((g) => g.hanja);
    const better = allHanja ? suggestBetterHanja(input, saju?.primary ?? null, state.school, 20) : [];
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
};

export type Api = typeof api;
