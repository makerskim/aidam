/** 아이담 성명학 엔진 공개 API */
export * from './core/elements';
export * from './core/ganji';
export { PLACES, findPlace, type Place } from './calendar/places';
export { lunarToSolar, LUNAR_MIN_YEAR, LUNAR_MAX_YEAR } from './calendar/lunar';
export { JIE_NAMES } from './calendar/solarTerms';
export {
  computePillars, pillarsForHourBranch, DEFAULT_SAJU_OPTIONS,
  type BirthInput, type SajuOptions, type Pillars, type PillarsResult, type LocalTime,
} from './saju/pillars';
export {
  analyzePillars, STRENGTH_KO, ROLE_KO, GROUP_KO,
  type SajuAnalysis, type StrengthLevel, type Role, type TenGodGroup,
} from './saju/analysis';
export { computeSaju, type SajuResult, type SajuAlternative } from './saju';
export { HIDDEN_STEMS } from './saju/hiddenStems';
export { branchRelations, stemRelation, BRANCH_RELATION_KO } from './saju/relations';
export { decompose, compose, isHangulSyllable, toSyllables } from './hangul/jamo';
export { applyDueum } from './hangul/dueum';
export { pronounce } from './hangul/pronounce';
export { allHanja, getHanja, hanjaByReading, isNameHanja, type HanjaEntry } from './name/hanjaDb';
export { SURNAMES, surnameStrokes, type Surname } from './name/surnames';
export { SURI81, suri81, LUCK_KO, type SuriInfo, type Luck } from './name/suri81';
export { fourFrames, FRAME_KO, type FourFrames } from './name/suri';
export { soundElement, soundFlow, vowelYinYang, SCHOOL_KO, FLOW_KO, type SoundSchool, type SoundFlow } from './name/sound';
export { isNegativeMeaning, isPositiveMeaning, BULYONG } from './name/safety';
export {
  analyzeName, DEFAULT_SCHOOL_OPTIONS,
  type NameChar, type NameInput, type NameReport, type SchoolOptions, type Reason, type ReasonArea, type Gender,
  type FrameResult, type ResourceChar,
} from './name/analyze';
export { MAX as SCORE_MAX, gradeOf, type ScoreBreakdown, type Grade } from './score/score';
export {
  recommendNames, suggestBetterHanja, DEFAULT_PREFERENCES, type Preferences, type Recommendation,
} from './recommend/recommend';
export { analyzeSiblings, recommendSiblingSets, nameDistinctness, type ChildInput, type PairHarmony, type SiblingReport, type SiblingSet } from './siblings/siblings';
export { encodeState, decodeState } from './share/state';
export { fnv1a, analysisCode, stableStringify } from './share/hash';
export { ENGINE_VERSION, DATA_VERSION } from './version';
