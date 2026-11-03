import type { NameReport, SajuAnalysis } from '@aidam/engine';
import { ELEMENT_HANJA, ELEMENT_KO, type Element } from '@aidam/engine/src/core/elements';
import { FRAME_KO } from '@aidam/engine/src/name/suri';
import { SCHOOL_KO } from '@aidam/engine/src/name/sound';
import { meaningFor } from './format';

const el = (e: Element) => `${ELEMENT_KO[e]}(${ELEMENT_HANJA[e]})`;

export interface Insights {
  /** 좋은 점 */
  good: string[];
  /** 사주에서 보완해 주는 점 */
  complement: string[];
  /** 아쉬운 점 */
  caution: string[];
}

export interface ScoreRow {
  key: 'resource' | 'suri' | 'sound' | 'yinyang' | 'practical';
  label: string;
  max: number;
  score: number | null;
  verdict: string;
  tone: 'good' | 'neutral' | 'bad';
}

/** 리포트를 "왜 추천했는지"로 정리한다: 좋은 점 / 보완하는 점 / 아쉬운 점 */
export function insights(report: NameReport, saju: SajuAnalysis | null): Insights {
  const good: string[] = [];
  const complement: string[] = [];
  const caution: string[] = [];
  const given = report.input.given;

  // 보완: 자원오행이 용신·희신
  if (saju) {
    report.resource.forEach((r) => {
      const role = saju.roles[r.element];
      const h = report.chars.find((c) => c?.ch === r.ch);
      const syl = given[report.chars.indexOf(h ?? null)]?.hangul ?? '';
      const m = h ? meaningFor(h.meaning, syl) : '';
      if (role === 'yong') complement.push(`${r.ch}(${m})의 ${el(r.element)} 기운이 사주에 가장 필요한 용신을 채워요.`);
      else if (role === 'hui') complement.push(`${r.ch}(${m})의 ${el(r.element)} 기운이 용신을 돕는 희신이에요.`);
      else if (role === 'gi') caution.push(`${r.ch}의 ${el(r.element)} 기운은 사주와 맞지 않아요(기신).`);
      else if (role === 'gu') caution.push(`${r.ch}의 ${el(r.element)} 기운은 사주에 조금 부담이 돼요(구신).`);
      if (saju.counts[r.element] === 0 && (role === 'yong' || role === 'hui')) complement.push(`사주에 없는 ${el(r.element)} 기운을 이름으로 더해요.`);
      if (saju.johu && r.element === saju.johu) complement.push(`태어난 계절에 부족한 ${el(r.element)} 기운을 보충해요.`);
    });
    if (report.resource.length > 0 && complement.length === 0) {
      caution.push(`사주에 필요한 ${el(saju.yongsin)}·${el(saju.huisin)} 기운을 채우는 한자가 없어요.`);
    }
  }

  // 수리
  if (report.frames) {
    const bad = report.frameResults.filter((f) => f.info.luck === 'bad');
    const half = report.frameResults.filter((f) => f.info.luck === 'half');
    if (bad.length === 0 && half.length === 0) good.push('초년·청년·장년·말년 운을 뜻하는 4격이 모두 좋은 수예요.');
    else if (bad.length === 0) good.push(`4격에 나쁜 수가 없어요(${half.map((f) => FRAME_KO[f.key].period).join('·')}은 보통).`);
    for (const f of bad) caution.push(`${FRAME_KO[f.key].period}(${FRAME_KO[f.key].name.split('(')[0]}) ${f.n}수는 좋지 않은 수예요.`);
  }

  // 소리
  const school = report.options.soundSchool;
  const other = school === 'haerye' ? 'unhae' : 'haerye';
  const flow = report.soundBySchool[school];
  const clash = flow.pairs.filter((p) => p.kind === 'clash');
  if (flow.pairs.length && clash.length === 0) {
    const forward = flow.pairs.every((p) => p.kind === 'forward' || p.kind === 'backward');
    good.push(forward ? '부르는 소리의 오행이 서로 살려 줘요(상생).' : '부르는 소리의 오행이 부딪히지 않아요.');
    if (!report.soundBySchool[other].pairs.some((p) => p.kind === 'clash')) good.push(`${SCHOOL_KO[school]}·${SCHOOL_KO[other]} 두 학설 모두 소리 상극이 없어요.`);
  }
  for (const p of clash) caution.push(`소리 오행 ${el(p.from)}→${el(p.to)}이 부딪혀요(상극).`);

  // 음양
  if (report.strokeYinYang?.balanced && report.vowel.level === 'harmony') good.push('획수와 소리의 음양이 고르게 섞였어요.');
  else {
    if (report.strokeYinYang && !report.strokeYinYang.balanced) caution.push('획수 음양이 한쪽으로 치우쳤어요.');
    if (report.vowel.level === 'unbalanced') caution.push('모음 음양이 한쪽으로 치우쳤어요.');
  }

  // 뜻·어감
  const meanings = report.chars
    .map((h, i) => (h && !h.negative ? `${h.ch} ${meaningFor(h.meaning, given[i]?.hangul ?? '')}` : null))
    .filter(Boolean);
  if (meanings.length && meanings.length === report.chars.length) good.push(`뜻이 좋아요: ${meanings.join(', ')}.`);
  for (const h of report.chars) if (h?.negative) caution.push(`${h.ch}(${h.meaning.split(',')[0]})는 이름에 피하는 뜻이에요.`);
  for (const h of report.chars) if (h?.bulyong) caution.push(`${h.ch}는 일부 학설에서 이름에 쓰지 않는 한자예요.`);
  const pron = report.pronunciation.join('');
  if (pron !== report.fullHangul) caution.push(`실제로는 [${pron}]으로 소리 나요.`);
  for (const w of report.warnings) {
    if (w.includes('인명용') || w.includes('놀림') || w.includes('이격') || w.includes('강한 수') || w.includes('데이터에 없는')) caution.push(w);
  }

  return { good, complement: [...new Set(complement)], caution: [...new Set(caution)] };
}

/** 점수표: 항목·점수·한 줄 평가 */
export function scoreRows(report: NameReport, saju: SajuAnalysis | null): ScoreRow[] {
  const s = report.score;
  const hasHanja = report.frames !== null;
  const bad = report.frameResults.filter((f) => f.info.luck === 'bad').length;
  const flow = report.soundBySchool[report.options.soundSchool];
  const clash = flow.pairs.some((p) => p.kind === 'clash');
  const yong = saju ? report.resource.filter((r) => saju.roles[r.element] === 'yong' || saju.roles[r.element] === 'hui') : [];
  const against = saju ? report.resource.filter((r) => saju.roles[r.element] === 'gi' || saju.roles[r.element] === 'gu') : [];
  const negative = report.chars.some((h) => h?.negative);
  return [
    {
      key: 'resource',
      label: '사주 보완(자원오행)',
      max: 30,
      score: report.resource.length === report.input.given.length && report.resource.length > 0 ? s.resource : null,
      verdict: !saju ? '사주 없이 계산' : yong.length ? `${yong.map((r) => ELEMENT_HANJA[r.element]).join('·')} 기운 보완` : against.length ? '사주와 맞지 않음' : '보완 약함',
      tone: !saju ? 'neutral' : yong.length && !against.length ? 'good' : against.length ? 'bad' : 'neutral',
    },
    {
      key: 'suri',
      label: '획수(81수리)',
      max: 25,
      score: hasHanja ? s.suri : null,
      verdict: !hasHanja ? '한자를 고르면 계산' : bad ? `나쁜 수 ${bad}개` : '4격 모두 좋음',
      tone: !hasHanja ? 'neutral' : bad ? 'bad' : 'good',
    },
    {
      key: 'sound',
      label: '소리오행',
      max: 20,
      score: s.sound,
      verdict: clash ? '상극 있음' : flow.pairs.every((p) => p.kind === 'forward' || p.kind === 'backward') ? '상생' : '무난',
      tone: clash ? 'bad' : 'good',
    },
    {
      key: 'yinyang',
      label: '음양 조화',
      max: 10,
      score: s.yinyang,
      verdict: report.strokeYinYang?.balanced === false || report.vowel.level === 'unbalanced' ? '한쪽으로 치우침' : '고름',
      tone: report.strokeYinYang?.balanced === false || report.vowel.level === 'unbalanced' ? 'bad' : 'good',
    },
    {
      key: 'practical',
      label: '뜻·발음',
      max: 15,
      score: s.practical,
      verdict: negative ? '피하는 뜻 있음' : report.pronunciation.join('') !== report.fullHangul ? '발음 변화 있음' : '좋음',
      tone: negative ? 'bad' : report.pronunciation.join('') !== report.fullHangul ? 'neutral' : 'good',
    },
  ];
}

/** 목록용 짧은 태그 (좋은 것 최대 3개 + 주의 개수) */
export function shortTags(report: NameReport, saju: SajuAnalysis | null): { good: string[]; caution: number } {
  const tags: string[] = [];
  if (saju) {
    const roles = report.resource.map((r) => saju.roles[r.element]);
    if (roles.includes('yong')) tags.push(`용신 ${ELEMENT_HANJA[saju.yongsin]} 보완`);
    else if (roles.includes('hui')) tags.push(`희신 ${ELEMENT_HANJA[saju.huisin]} 보완`);
  }
  if (report.frames && report.frameResults.every((f) => f.info.luck === 'good')) tags.push('4격 모두 길');
  const flow = report.soundBySchool[report.options.soundSchool];
  if (flow.pairs.length && flow.pairs.every((p) => p.kind === 'forward' || p.kind === 'backward')) tags.push('소리 상생');
  return { good: tags.slice(0, 3), caution: insights(report, saju).caution.length };
}

export interface SajuSummary {
  /** 일간·신강약 한 줄 */
  headline: string;
  /** 없거나 약한 오행 */
  lacking: Element[];
  /** 넘치는 오행 */
  strong: Element[];
  /** 이름에 넣으면 좋은 오행 (용신, 희신) */
  wanted: Element[];
  /** 피하면 좋은 오행 (기신, 구신) */
  avoid: Element[];
  /** 쉬운 말 설명 */
  lines: string[];
}

const STRENGTH_PLAIN = { veryWeak: '아주 약한 편', weak: '약한 편', balanced: '균형 잡힌 편', strong: '강한 편', veryStrong: '아주 강한 편' } as const;
const ORDER: Element[] = ['wood', 'fire', 'earth', 'metal', 'water'];

/** 만세력 분석을 쉬운 말로: 무엇이 부족하고, 무엇이 많고, 이름에 무엇을 넣으면 좋은지 */
export function sajuSummary(a: SajuAnalysis): SajuSummary {
  const lacking = ORDER.filter((e) => a.counts[e] === 0 || a.power[e] < 10);
  const strong = ORDER.filter((e) => a.power[e] >= 30);
  const wanted = [a.yongsin, a.huisin];
  const avoid = ORDER.filter((e) => a.roles[e] === 'gi' || a.roles[e] === 'gu');
  const lines: string[] = [];
  lines.push(`타고난 기운이 ${STRENGTH_PLAIN[a.strength.level]}이에요 (나를 돕는 기운 ${Math.round(a.strength.ratio * 100)}%).`);
  if (lacking.length) lines.push(`${lacking.map(el).join(', ')} 기운이 없거나 약해요.`);
  if (strong.length) lines.push(`${strong.map(el).join(', ')} 기운이 많아요.`);
  lines.push(`그래서 이름에 ${el(a.yongsin)}(용신)과 ${el(a.huisin)}(희신) 기운을 넣으면 좋아요.`);
  if (avoid.length) lines.push(`${avoid.map(el).join(', ')} 기운은 피하는 게 좋아요.`);
  return {
    headline: `일간 ${el(a.dayMaster)} · ${STRENGTH_PLAIN[a.strength.level]}`,
    lacking,
    strong,
    wanted,
    avoid,
    lines,
  };
}

// ── 작명가의 풀이: 명리학의 전통 비유로 쉽게 ─────────────────────
/** 일간(타고난 나)의 전통 비유 */
const DAY_MASTER_IMAGE = ['큰 나무', '풀과 꽃', '한낮의 태양', '따뜻한 등불', '큰 산', '기름진 논밭', '단단한 바위', '빛나는 보석', '넓은 바다', '맑은 이슬비'] as const;
/** 오행이 상징하는 덕목(오상)과 성향 */
const VIRTUE: Record<Element, string> = {
  wood: '자라나는 힘과 어진 마음(仁)',
  fire: '밝은 열정과 예의(禮)',
  earth: '든든한 믿음(信)과 안정',
  metal: '바른 결단과 의리(義)',
  water: '깊은 지혜(智)와 유연함',
};
const SEASON = (branch: number) => (([2, 3, 4].includes(branch) ? '봄' : [5, 6, 7].includes(branch) ? '여름' : [8, 9, 10].includes(branch) ? '가을' : '겨울'));
const josa = (word: string, a: string, b: string) => {
  const c = word.charCodeAt(word.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0 ? a : b;
};

/** 사주 풀이 (2~3문장) */
export function sajuNarrative(a: SajuAnalysis): string {
  const img = DAY_MASTER_IMAGE[a.pillars.day.stem] ?? '';
  const season = SEASON(a.pillars.month.branch);
  const strong = ORDER.filter((e) => a.power[e] >= 30);
  const lacking = ORDER.filter((e) => a.counts[e] === 0 || a.power[e] < 10);
  const parts: string[] = [];
  parts.push(`${season}에 태어난 ${img}(${['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'][a.pillars.day.stem]}${ELEMENT_HANJA[a.dayMaster]}) 같은 아이예요.`);
  if (a.strength.level === 'strong' || a.strength.level === 'veryStrong') {
    parts.push(`${strong.length ? `${strong.map((e) => ELEMENT_KO[e]).join('·')} 기운이 넉넉해 ` : ''}스스로 힘이 센 사주라, 그 힘을 잘 쓰게 이끌어 줄 ${el(a.yongsin)} 기운이 필요해요.`);
  } else if (a.strength.level === 'weak' || a.strength.level === 'veryWeak') {
    parts.push(`둘레의 기운에 비해 타고난 힘이 여린 편이라, 곁에서 받쳐 줄 ${el(a.yongsin)} 기운이 큰 힘이 돼요.`);
  } else {
    parts.push(`기운이 고르게 잡힌 사주라, ${lacking.length ? `조금 모자란 ${lacking.map((e) => ELEMENT_KO[e]).join('·')}을 채워 ` : ''}균형을 지켜 주면 좋아요.`);
  }
  parts.push(`${ELEMENT_KO[a.yongsin]}${josa(ELEMENT_KO[a.yongsin], '은', '는')} ${VIRTUE[a.yongsin]}을 뜻해요. 이름에 이 기운을 담아 아이의 삶에 균형을 더해 주세요.`);
  return parts.join(' ');
}

/** 이 이름을 추천하는 까닭 (작명가의 한마디) */
export function nameNarrative(report: NameReport, a: SajuAnalysis | null): string {
  const given = report.input.given;
  const parts: string[] = [];
  const words = report.chars
    .map((h, i) => (h ? meaningFor(h.meaning, given[i]?.hangul ?? '').split(/\s+/).slice(0, -1).join(' ') : null))
    .filter((w): w is string => Boolean(w));
  if (words.length && report.fullHanja) {
    parts.push(`${report.fullHanja.slice(report.input.surname.length)}에는 ‘${words.join('’, ‘')}’의 뜻이 담겨 있어요.`);
  }
  if (a) {
    const good = report.resource.filter((r) => a.roles[r.element] === 'yong' || a.roles[r.element] === 'hui');
    const bad = report.resource.filter((r) => a.roles[r.element] === 'gi');
    if (good.length) parts.push(`${good.map((r) => r.ch).join('·')}의 ${[...new Set(good.map((r) => ELEMENT_KO[r.element]))].join('·')} 기운이 사주에 필요한 자리를 채워 주어, 이름이 아이의 부족한 기운을 보태요.`);
    else if (bad.length) parts.push(`다만 ${bad.map((r) => r.ch).join('·')}의 기운은 사주와 부딪혀요. 같은 소리의 다른 한자를 함께 살펴보세요.`);
  }
  if (report.frames) {
    const badF = report.frameResults.filter((f) => f.info.luck === 'bad');
    parts.push(badF.length ? `획수로 본 운에서는 ${badF.map((f) => FRAME_KO[f.key].period).join('·')}이 아쉬워요.` : '획수로 본 초년부터 말년까지의 운도 모두 좋은 수로 이어져요.');
  }
  const flow = report.soundBySchool[report.options.soundSchool];
  if (flow.pairs.length) parts.push(flow.pairs.some((p) => p.kind === 'clash') ? '소리의 흐름에 부딪히는 곳이 한 군데 있어요.' : '부를 때 소리의 기운도 자연스럽게 이어져요.');
  return parts.join(' ');
}
