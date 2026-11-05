import type { NameReport, SajuAnalysis, SajuResult } from '@aidam/engine';
import { ELEMENT_HANJA, type Element } from '@aidam/engine/src/core/elements';
import { FRAME_KO } from '@aidam/engine/src/name/suri';
import { SCHOOL_KO } from '@aidam/engine/src/name/sound';
import { HANJA_STORY } from '@aidam/engine/src/name/stories';
import { hanjaMeaning } from './format';

const WORD: Record<Element, string> = { wood: '나무', fire: '불', earth: '흙', metal: '쇠', water: '물' };
const el = (e: Element) => `${WORD[e]}(${ELEMENT_HANJA[e]})`;

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
      const m = h ? hanjaMeaning(h, syl) : '';
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
    .map((h, i) => (h && !h.negative ? `${h.ch} ${hanjaMeaning(h, given[i]?.hangul ?? '')}` : null))
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

/** 목록용 짧은 태그 (좋은 것 최대 3개 + 아쉬운 점 개수) */
export function shortTags(report: NameReport, saju: SajuAnalysis | null): { good: string[]; caution: number } {
  const tags: string[] = [];
  if (saju) {
    const fill = report.resource.filter((r) => saju.roles[r.element] === 'yong' || saju.roles[r.element] === 'hui');
    if (fill.length) tags.push(`부족한 ${[...new Set(fill.map((r) => WORD[r.element]))].join('·')} 기운을 채워요`);
  }
  if (report.frames && report.frameResults.every((f) => f.info.luck !== 'bad')) tags.push('평생 운이 좋은 획수');
  const flow = report.soundBySchool[report.options.soundSchool];
  if (flow.pairs.length && !flow.pairs.some((p) => p.kind === 'clash')) tags.push('부르는 소리가 어울려요');
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

/** 문장 끝 두 낱말을 붙여, 마지막 줄에 한두 글자만 떨어지지 않게 한다 */
export const tidy = (text: string): string => text.replace(/ (\S+)$/, '\u00a0$1');

/**
 * 미리 써 둔 문장 조각을 이름마다 골라 잇는다.
 * 같은 이름(같은 사주)이면 언제나 같은 글, 이름이 다르면 문장도 달라진다(난수 없음).
 */
function seedOf(text: string): number {
  let h = 2166136261;
  for (const c of text) {
    h ^= c.codePointAt(0) ?? 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function pick<T>(options: readonly T[], seed: number, salt: number): T {
  const i = (Math.imul((seed ^ Math.imul(salt, 0x9e3779b1)) >>> 0, 2654435761) >>> 0) % options.length;
  return options[i] as T;
}
/** 괄호 앞 낱말의 받침으로 조사 고르기: 예의(禮)를, 마음(仁)을 */
const josaText = (text: string, withFinal: string, without: string) => josa(text.replace(/\([^()]*\)$/, '').trim(), withFinal, without);

/** 사주 풀이 (2~3문장) */
export function sajuNarrative(a: SajuAnalysis): string {
  const img = DAY_MASTER_IMAGE[a.pillars.day.stem] ?? '';
  const stem = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'][a.pillars.day.stem] ?? '';
  const season = SEASON(a.pillars.month.branch);
  const seed = seedOf(JSON.stringify(a.pillars));
  const strong = ORDER.filter((e) => a.power[e] >= 30);
  const lacking = ORDER.filter((e) => a.counts[e] === 0 || a.power[e] < 10);
  const need = el(a.yongsin);
  const parts: string[] = [];
  const me = `${img}(${stem}${ELEMENT_HANJA[a.dayMaster]})`;
  parts.push(
    pick(
      [
        `${season}에 태어난 ${me} 같은 아이예요.`,
        `${me}의 기운을 품고 ${season}에 태어난 아이예요.`,
        `타고난 바탕은 ${season}의 ${me}${josa(img, '이에요', '예요')}.`,
      ],
      seed,
      1,
    ),
  );
  if (a.strength.level === 'strong' || a.strength.level === 'veryStrong') {
    const many = strong.length ? `${strong.map((e) => WORD[e]).join('·')} 기운이 넉넉해 ` : '';
    parts.push(
      pick(
        [
          `${many}스스로 힘이 센 사주라, 그 힘을 잘 쓰게 이끌어 줄 ${need} 기운이 필요해요.`,
          `${many}타고난 힘이 넘치는 편이에요. 그 힘이 한쪽으로 쏠리지 않게 ${need} 기운으로 물꼬를 터 주면 좋아요.`,
        ],
        seed,
        2,
      ),
    );
  } else if (a.strength.level === 'weak' || a.strength.level === 'veryWeak') {
    parts.push(
      pick(
        [
          `둘레의 기운에 비해 타고난 힘이 여린 편이라, 곁에서 받쳐 줄 ${need} 기운이 큰 힘이 돼요.`,
          `여린 새싹처럼 타고난 힘이 아직 작은 편이에요. ${need} 기운이 곁에서 받쳐 주면 단단하게 자라요.`,
        ],
        seed,
        2,
      ),
    );
  } else {
    const few = lacking.length ? `조금 모자란 ${lacking.map((e) => WORD[e]).join('·')}${josa(WORD[lacking[lacking.length - 1] as Element], '을', '를')} 채워 ` : '';
    parts.push(
      pick(
        [`기운이 고르게 잡힌 사주라, ${few}균형을 지켜 주면 좋아요.`, `다섯 기운이 비교적 고르게 놓인 사주예요. ${few}지금의 균형을 지켜 주는 이름이 잘 맞아요.`],
        seed,
        2,
      ),
    );
  }
  const virtue = VIRTUE[a.yongsin];
  const w = WORD[a.yongsin];
  parts.push(
    pick(
      [
        `${w}${josa(w, '은', '는')} ${virtue}${josaText(virtue, '을', '를')} 뜻해요. 이름에 이 기운을 담아 아이의 삶에 균형을 더해 주세요.`,
        `${w} 기운은 ${virtue}${josaText(virtue, '과', '와')} 이어져요. 이 기운을 이름에 담으면 아이가 자라는 내내 그 힘을 곁에 두게 돼요.`,
        `이름에 ${w} 기운을 담으면 ${virtue}${josaText(virtue, '이', '가')} 아이 곁에 오래 머물러요.`,
      ],
      seed,
      3,
    ),
  );
  return tidy(parts.join(' '));
}

/**
 * 총평: 한자마다 미리 써 둔 뜻 이야기(HANJA_STORY)를 이어 이름의 바람을 풀어 쓰고,
 * 사주·획수·소리를 덧붙인 뒤 맺음말로 끝낸다. 문단은 줄바꿈(\n)으로 나눈다.
 */
export function nameNarrative(report: NameReport, a: SajuAnalysis | null): string {
  const given = report.input.given;
  const name = given.map((g) => g.hangul).join('');
  const full = report.input.surname.map((c) => c.hangul).join('') + name;
  const seed = seedOf(`${report.fullHanja ?? ''}|${full}`);
  const parts: string[] = [];

  // 1) 뜻: 글자마다의 바람 → 두 글자를 합친 뜻
  const chars = report.chars.map((h, i) => {
    if (!h) return null;
    const reading = given[i]?.hangul ?? '';
    return { label: `${h.ch}(${hanjaMeaning(h, reading)})`, reading, story: HANJA_STORY.get(h.ch) };
  });
  const storied = chars.filter((c): c is { label: string; reading: string; story: NonNullable<ReturnType<typeof HANJA_STORY.get>> } => Boolean(c?.story));
  if (storied.length === chars.length && storied.length === 1) {
    const x = storied[0]!;
    parts.push(pick([`${x.label}에는 ${x.story.wish} 바라는 마음이 담겼어요.`, `${x.label}${josa(x.reading, '은', '는')} ${x.story.wish} 바라는 글자예요.`], seed, 1));
    parts.push(pick([`한 글자에 ‘${x.story.adj} 아이’라는 뜻을 오롯이 담은 이름이에요.`, `짧지만 ‘${x.story.adj} 아이’라는 바람이 또렷한 이름이에요.`], seed, 2));
  } else if (storied.length === chars.length && storied.length >= 2) {
    const x = storied[0]!;
    const y = storied[storied.length - 1]!;
    parts.push(
      pick(
        [
          `${x.label}에는 ${x.story.wish}, ${y.label}에는 ${y.story.wish} 바라는 마음이 담겼어요.`,
          `${x.label}에 ${x.story.wish}, ${y.label}에 ${y.story.wish} 바라는 뜻을 함께 담았어요.`,
          `${x.label}${josa(x.reading, '은', '는')} ${x.story.wish} 바라는 글자이고, ${y.label}${josa(y.reading, '은', '는')} ${y.story.wish} 바라는 글자예요.`,
        ],
        seed,
        1,
      ),
    );
    // 두 꾸밈말이 같은 낱말을 되풀이하면(터전이 든든하고 바탕이 든든한) 합친 뜻 대신 다른 문장을 쓴다
    const stems = (t: string) => t.split(/\s+/).map((w) => (w.length <= 2 ? w.slice(0, 1) : w.slice(0, 2)));
    const overlap = x.story.adj !== y.story.adj && stems(x.story.and).some((w) => stems(y.story.adj).includes(w));
    const phrase = x.story.adj === y.story.adj ? `더없이 ${y.story.adj}` : `${x.story.and} ${y.story.adj}`;
    parts.push(
      overlap
        ? pick(['두 글자의 바람이 한 이름 안에서 서로를 북돋아 줘요.', '두 글자의 뜻이 한 방향을 바라보고 있어, 바람이 더 또렷해요.'], seed, 2)
        : pick(
            [
              `두 글자를 함께 부르면 ‘${phrase} 아이’라는 뜻이 돼요.`,
              `그래서 ${name}${josa(name, '이라는', '라는')} 이름은 ‘${phrase} 아이’로 자라라는 바람을 품고 있어요.`,
              `이름 전체로 보면 ‘${phrase} 사람’이 되라는 뜻이에요.`,
            ],
            seed,
            2,
          ),
    );
  } else {
    const words = report.chars
      .map((h, i) => (h ? hanjaMeaning(h, given[i]?.hangul ?? '').split(/\s+/).slice(0, -1).join(' ') : null))
      .filter((w): w is string => Boolean(w));
    if (words.length && report.fullHanja) parts.push(`${report.fullHanja.slice(report.input.surname.length)}에는 ‘${words.join('’, ‘')}’의 뜻이 담겨 있어요.`);
  }

  // 문단을 나눈다: 뜻 / 사주·획수·소리 / 맺음말
  const meaningEnd = parts.length;
  // 2) 사주: 이름이 모자란 기운을 채우는지
  if (a) {
    const need = el(a.yongsin);
    const good = report.resource.filter((r) => a.roles[r.element] === 'yong' || a.roles[r.element] === 'hui');
    const bad = report.resource.filter((r) => a.roles[r.element] === 'gi');
    if (good.length) {
      const ch = good.map((r) => r.ch).join('·');
      const els = [...new Set(good.map((r) => el(r.element)))].join('·');
      parts.push(
        pick(
          [
            `이 아이에게 가장 필요한 기운은 ${need}${pj(a.yongsin, '이에요', '예요')}. ${ch}의 ${els} 기운이 바로 그 빈자리를 채워 줘요.`,
            `${ch}의 ${els} 기운이 사주에 모자란 자리를 채워 줘요. 이름이 평생 곁에서 부족한 기운을 보태 주는 셈이에요.`,
            `${ch}에 담긴 ${els} 기운은 이 아이의 사주와 손발이 잘 맞아요. 부를수록 모자란 기운이 채워지는 이름이에요.`,
          ],
          seed,
          3,
        ),
      );
    } else if (bad.length) {
      const ch = bad.map((r) => r.ch).join('·');
      const els = [...new Set(bad.map((r) => el(r.element)))].join('·');
      parts.push(
        pick(
          [
            `다만 ${ch}의 ${els} 기운은 이 아이의 사주와 잘 맞지 않아요. 같은 소리의 다른 한자도 함께 살펴보세요.`,
            `아쉬운 점은 ${ch}의 ${els} 기운이 사주와 부딪힌다는 거예요. 같은 소리의 다른 한자로 바꿔 볼 만해요.`,
          ],
          seed,
          3,
        ),
      );
    } else {
      parts.push(pick([`사주에 필요한 ${need} 기운을 가진 한자로 바꾸면 사주를 더 잘 채울 수 있어요.`, `이름 한자에 ${need} 기운이 들어가면 사주의 균형이 더 좋아져요.`], seed, 3));
    }
  }

  // 3) 획수
  if (report.frames) {
    const badF = report.frameResults.filter((f) => f.info.luck === 'bad');
    const periods = badF.map((f) => FRAME_KO[f.key].period).join('·');
    parts.push(
      badF.length
        ? pick([`획수로 본 운에서는 ${periods}이 아쉬워요.`, `획수를 따져 보면 ${periods}의 수가 아쉬운 편이에요.`], seed, 4)
        : pick(
            [
              '획수로 본 초년부터 말년까지의 운도 모두 좋은 수로 이어져요.',
              '획수를 따져 보면 어린 시절부터 노년까지 네 시기의 운이 모두 좋은 수예요.',
              '획수 풀이에서도 평생의 네 시기가 모두 좋은 수로 나와 든든해요.',
            ],
            seed,
            4,
          ),
    );
  }

  // 4) 소리
  const flow = report.soundBySchool[report.options.soundSchool];
  if (flow.pairs.length) {
    parts.push(
      flow.pairs.some((p) => p.kind === 'clash')
        ? pick(['부를 때 소리의 흐름에 부딪히는 곳이 한 군데 있어요.', '소리 기운이 한 번 부딪히는 곳이 있어, 부를 때 살짝 걸려요.'], seed, 5)
        : pick(
            [
              '성부터 이름까지 부르는 소리의 기운이 서로 살려 주며 자연스럽게 이어져요.',
              `소리 내어 ‘${full}’ 하고 불러 보면 첫소리 기운이 차례로 이어져 입에 잘 붙어요.`,
              '부르는 소리도 성에서 이름으로 기운을 살려 주며 흘러, 듣기에 편안해요.',
            ],
            seed,
            5,
          ),
    );
  }
  if (report.strokeYinYang?.balanced && report.vowel.level !== 'unbalanced') {
    parts.push(pick(['획수의 홀짝과 모음의 밝고 어두움도 고르게 섞여 균형이 맞아요.', '획수와 모음의 음양도 한쪽으로 치우치지 않아 균형이 맞아요.'], seed, 6));
  }

  // 5) 맺음말
  const g = report.score.grade;
  parts.push(
    g === 'S' || g === 'A'
      ? pick(
          [
            `‘${full}’${josa(full, '이라고', '라고')} 부를 때마다 이 바람이 아이에게 닿기를 바라요.`,
            '오래 불러도 질리지 않고, 부를수록 좋은 뜻이 더해지는 이름이에요.',
            '불릴 때마다 좋은 기운이 차곡차곡 쌓이는 이름이에요.',
          ],
          seed,
          7,
        )
      : g === 'B'
        ? '전체로 보면 무난한 이름이에요. 아쉬운 점은 아래 항목에서 고쳐 볼 수 있어요.'
        : '아쉬운 점이 있는 이름이에요. 아래 항목에서 무엇이 아쉬운지 보고 고쳐 볼 수 있어요.',
  );
  const closing = parts.pop() as string;
  return [parts.slice(0, meaningEnd).join(' '), parts.slice(meaningEnd).join(' '), closing].filter(Boolean).join('\n');
}

// ── 쉬운 말 풀이: 기준마다 "무엇이 있어서/없어서 좋은지, 왜 아쉬운지" ─────────
/** 일상어 오행 이름 */
export const PLAIN: Record<Element, string> = WORD;
const plain = (e: Element) => `${PLAIN[e]}(${ELEMENT_HANJA[e]})`;
/** 받침에 맞는 조사: 쇠(金)를, 불(火)을 */
const pj = (e: Element, withFinal: string, without: string) => josa(PLAIN[e], withFinal, without);

/** 상생: from이 to를 살린다 */
const GEN_STORY: Record<Element, string> = {
  wood: '나무가 불을 지펴 주듯',
  fire: '불이 타고 남은 재가 흙이 되듯',
  earth: '흙 속에서 쇠가 나오듯',
  metal: '쇠에 이슬이 맺혀 물이 되듯',
  water: '물이 나무를 키우듯',
};
/** 상극: from이 to를 누른다 */
const CTRL_STORY: Record<Element, string> = {
  wood: '나무 뿌리가 흙을 파고들듯',
  fire: '불이 쇠를 녹이듯',
  earth: '흙이 물길을 막듯',
  metal: '쇠도끼가 나무를 베듯',
  water: '물이 불을 끄듯',
};

export type Verdict = 'good' | 'ok' | 'bad';

export interface Criterion {
  key: 'yongsin' | 'sound' | 'suri' | 'yinyang' | 'meaning';
  title: string;
  /** 이 기준이 무엇이고 왜 보는지 (한 줄) */
  why: string;
  verdict: Verdict;
  verdictText: string;
  /** 좋은 점(있어서 좋은 것, 없어서 좋은 것) */
  pros: string[];
  /** 아쉬운 점과 이유 */
  cons: string[];
  score: number | null;
  max: number;
  /** 한 줄 요약 (목록·총평용) */
  summary: string;
  /** 학설별 비교 등 짧은 표 */
  table?: { label: string; value: string; tone: Verdict }[];
}

const verdictOf = (ratio: number | null): Verdict => (ratio === null ? 'ok' : ratio >= 0.8 ? 'good' : ratio >= 0.5 ? 'ok' : 'bad');
const VERDICT_TEXT: Record<Verdict, string> = { good: '좋아요', ok: '보통이에요', bad: '아쉬워요' };

/** 다섯 기준을 일반인이 이해하는 말로 풀이한다 */
export function explainCriteria(report: NameReport, a: SajuAnalysis | null): Criterion[] {
  const s = report.score;
  const given = report.input.given;
  const out: Criterion[] = [];

  // 1) 사주 보완(용신·자원오행)
  {
    const pros: string[] = [];
    const cons: string[] = [];
    if (!a) {
      cons.push('생일 정보가 없어 사주에 무엇이 부족한지는 보지 못했어요.');
    } else if (report.resource.length === 0) {
      cons.push('한자를 고르면 사주를 채워 주는지 볼 수 있어요.');
    } else {
      const need = `${plain(a.yongsin)}·${plain(a.huisin)}`;
      report.resource.forEach((r) => {
        const h = report.chars.find((c) => c?.ch === r.ch);
        const syl = given[report.chars.indexOf(h ?? null)]?.hangul ?? '';
        const m = h ? hanjaMeaning(h, syl) : '';
        const role = a.roles[r.element];
        const basis = r.confidence === 'C' ? '' : ` ${r.basis.replace('부수 ', '').replace(' (성명학 통설)', '')} 부수라`;
        if (role === 'yong' || role === 'hui') pros.push(`${r.ch}(${m})는${basis} ${plain(r.element)} 기운을 가진 한자예요. 이 아이에게 필요한 ${plain(r.element)}${pj(r.element, '을', '를')} 채워 줘요.`);
        else if (role === 'gi' || role === 'gu') cons.push(`${r.ch}(${m})는 ${plain(r.element)} 기운인데, 이 아이 사주에는 ${plain(r.element)}${pj(r.element, '이', '가')} 이미 넉넉하거나 부담이 돼서 더하면 균형이 기울어요.`);
        else pros.push(`${r.ch}(${m})는 ${plain(r.element)} 기운으로, 사주에 크게 해가 되지 않아요.`);
      });
      const bad = report.resource.filter((r) => a.roles[r.element] === 'gi' || a.roles[r.element] === 'gu');
      if (!bad.length) pros.push(`사주와 부딪히는 ${ORDER.filter((e) => a.roles[e] === 'gi').map(plain).join('')} 기운의 한자가 없어서 좋아요.`);
      const missing = [...new Set(report.resource.filter((r) => a.counts[r.element] === 0 && a.roles[r.element] !== 'gi' && a.roles[r.element] !== 'gu').map((r) => r.element))];
      if (missing.length) pros.push(`사주 여덟 글자에 하나도 없는 ${missing.map(plain).join('·')} 기운까지 채워 줘요.`);
      if (!report.resource.some((r) => a.roles[r.element] === 'yong' || a.roles[r.element] === 'hui')) cons.push(`이 아이에게 필요한 ${need} 기운을 채우는 한자가 없어요.`);
    }
    const ratio = s.partial && report.resource.length === 0 ? null : s.resource / 30;
    const ROLE_KO = { yong: '용신', hui: '희신', han: '한신', gu: '구신', gi: '기신' } as const;
    const table: Criterion['table'] = a
      ? [
          { label: '용신', value: `${plain(a.yongsin)} · 꼭 필요한 기운`, tone: 'good' },
          { label: '희신', value: `${plain(a.huisin)} · 용신을 돕는 기운`, tone: 'good' },
          { label: '피할 기운', value: `${ORDER.filter((e) => a.roles[e] === 'gi' || a.roles[e] === 'gu').map(plain).join('·')} · 기신·구신`, tone: 'bad' },
          ...(ORDER.some((e) => a.counts[e] === 0) ? [{ label: '없는 기운', value: `${ORDER.filter((e) => a.counts[e] === 0).map(plain).join('·')} · 사주 여덟 글자에 없음`, tone: 'ok' as Verdict }] : []),
          ...report.resource.map((r) => {
            const role = a.roles[r.element];
            return { label: r.ch, value: `${plain(r.element)} · ${ROLE_KO[role]}`, tone: (role === 'yong' || role === 'hui' ? 'good' : role === 'han' ? 'ok' : 'bad') as Verdict };
          }),
        ]
      : undefined;
    out.push({
      key: 'yongsin',
      title: '용신 오행에 맞나요',
      why: '사주에 꼭 필요한 기운(용신)과 이를 돕는 기운(희신)을 이름 한자의 오행(자원오행)으로 채우는지 봐요. 사주에 넘치는 기운(기신·구신)은 피해요.',
      ...(table ? { table } : {}),
      verdict: a ? verdictOf(ratio) : 'ok',
      verdictText: a ? VERDICT_TEXT[verdictOf(ratio)] : '생일 필요',
      pros,
      cons,
      score: report.resource.length ? s.resource : null,
      max: 30,
      summary: '',
    });
  }

  // 2) 소리오행
  {
    const school = report.options.soundSchool;
    const flow = report.soundBySchool[school];
    const syl = [...report.input.surname, ...given].map((c) => c.hangul);
    const known = flow.elements.filter((e): e is Element => e !== null);
    const pros: string[] = [];
    const cons: string[] = [];
    flow.pairs.forEach((p, i) => {
      const from = `${syl[i] ?? ''}(${PLAIN[p.from]})`;
      const to = `${syl[i + 1] ?? ''}(${PLAIN[p.to]})`;
      if (p.kind === 'forward') pros.push(`${from} → ${to}: ${GEN_STORY[p.from]} 앞소리가 뒷소리를 살려 줘요.`);
      else if (p.kind === 'backward') pros.push(`${from} → ${to}: 뒷소리가 앞소리를 살려 주는 관계라 무난해요.`);
      else if (p.kind === 'same') pros.push(`${from} → ${to}: 같은 기운이라 부딪히지 않아요.`);
      else cons.push(`${from} → ${to}: ${CTRL_STORY[p.from]} 앞소리가 뒷소리를 눌러요. 부를 때 기운이 끊긴다고 봐요.`);
    });
    if (flow.pairs.length && !flow.pairs.some((p) => p.kind === 'clash')) pros.push('서로 누르는 소리(상극)가 하나도 없어서 좋아요.');
    const schoolRow = (sc: 'haerye' | 'unhae') => {
      const f = report.soundBySchool[sc];
      const chain = f.elements.map((e, i) => `${syl[i] ?? ''}(${e ? PLAIN[e] : '?'})`).join(' → ');
      const clash = f.pairs.some((p) => p.kind === 'clash');
      return { label: sc === 'haerye' ? '해례본' : '운해본', value: `${chain} · ${clash ? '부딪히는 곳 있음' : '잘 어울림'}`, tone: (clash ? 'bad' : 'good') as Verdict };
    };
    const table = [schoolRow('haerye'), schoolRow('unhae')];
    out.push({
      table,
      key: 'sound',
      title: '부를 때 소리가 어울리나요',
      why: `이름 첫소리(ㄱ·ㄴ·ㅁ…)마다 나무·불·흙·쇠·물 기운이 있어요. 성부터 이름까지 서로 살려 주면 좋아요. 학설이 둘(해례본·운해본)이라 둘 다 보여 드려요. 점수는 해례본 기준이에요.${known.length ? '' : ''}`,
      verdict: verdictOf(s.sound / 20),
      verdictText: VERDICT_TEXT[verdictOf(s.sound / 20)],
      pros,
      cons,
      score: s.sound,
      max: 20,
      summary: '',
    });
  }

  // 3) 획수(81수리)
  {
    const pros: string[] = [];
    const cons: string[] = [];
    if (!report.frames) cons.push('모든 글자의 한자를 고르면 획수 운을 볼 수 있어요.');
    for (const f of report.frameResults) {
      const label = `${FRAME_KO[f.key].period} ${f.n}수(${f.info.name.split('(')[0]})`;
      if (f.info.luck === 'good') pros.push(`${label}: ${f.info.desc}. 좋은 수예요.`);
      else if (f.info.luck === 'half') pros.push(`${label}: ${f.info.desc}. 좋고 나쁨이 반반인 수예요.`);
      else cons.push(`${label}: ${f.info.desc}. 좋지 않은 수예요.`);
    }
    if (report.frames && !report.frameResults.some((f) => f.info.luck === 'bad')) pros.push('나쁜 수가 하나도 없어서 좋아요.');
    out.push({
      key: 'suri',
      title: '획수로 본 평생 운',
      why: '성과 이름 한자의 획수를 더해 초년·청년·장년·말년 네 시기의 운을 봐요(81수리).',
      verdict: report.frames ? verdictOf(s.suri / 25) : 'ok',
      verdictText: report.frames ? VERDICT_TEXT[verdictOf(s.suri / 25)] : '한자 필요',
      pros,
      cons,
      score: report.frames ? s.suri : null,
      max: 25,
      summary: '',
    });
  }

  // 4) 음양
  {
    const pros: string[] = [];
    const cons: string[] = [];
    if (report.strokeYinYang) {
      const odd = report.strokeYinYang.pattern.filter((p) => p === 'yang').length;
      if (report.strokeYinYang.balanced) pros.push(`획수가 홀수(양) ${odd}개, 짝수(음) ${report.strokeYinYang.pattern.length - odd}개로 섞여 균형이 맞아요.`);
      else cons.push(`획수가 모두 ${odd ? '홀수(양)' : '짝수(음)'}라 한쪽 기운으로 치우쳐요.`);
    }
    if (report.vowel.level === 'harmony') pros.push('밝은 모음(ㅏ·ㅗ)과 어두운 모음(ㅓ·ㅜ·ㅠ)이 섞여 소리가 조화로워요.');
    else if (report.vowel.level === 'unbalanced') cons.push('모음이 밝은 쪽이나 어두운 쪽 한쪽으로만 쏠려 있어요.');
    else pros.push('모음 소리가 크게 치우치지 않아요.');
    out.push({
      key: 'yinyang',
      title: '음양의 균형',
      why: '홀수·짝수 획, 밝은·어두운 모음이 고루 섞여야 이름의 기운이 한쪽으로 기울지 않는다고 봐요.',
      verdict: verdictOf(s.yinyang / 10),
      verdictText: VERDICT_TEXT[verdictOf(s.yinyang / 10)],
      pros,
      cons,
      score: s.yinyang,
      max: 10,
      summary: '',
    });
  }

  // 5) 뜻·발음
  {
    const pros: string[] = [];
    const cons: string[] = [];
    report.chars.forEach((h, i) => {
      if (!h) return;
      const m = hanjaMeaning(h, given[i]?.hangul ?? '');
      if (h.negative) cons.push(`${h.ch}(${m})는 이름에 피하는 뜻이에요.`);
      else pros.push(`${h.ch}: ‘${m}’`);
    });
    if (report.chars.length && !report.chars.some((h) => h?.negative)) pros.push('나쁜 뜻을 가진 한자가 없어서 좋아요.');
    for (const h of report.chars) if (h?.bulyong) cons.push(`${h.ch}는 옛 작명에서 이름에 잘 쓰지 않던 한자예요(요즘은 흔히 쓰기도 해요).`);
    const pron = report.pronunciation.join('');
    if (pron !== report.fullHangul) cons.push(`실제로는 [${pron}]으로 소리 나요. 부를 때 확인해 보세요.`);
    else pros.push('쓴 그대로 소리 나서 부르기 편해요.');
    for (const w of report.warnings) if (w.includes('놀림') || w.includes('인명용')) cons.push(w);
    out.push({
      key: 'meaning',
      title: '뜻과 발음',
      why: '한자의 뜻이 좋은지, 부르기 쉽고 놀림받을 소리가 없는지 봐요.',
      verdict: verdictOf(s.practical / 15),
      verdictText: VERDICT_TEXT[verdictOf(s.practical / 15)],
      pros,
      cons,
      score: s.practical,
      max: 15,
      summary: '',
    });
  }
  for (const c of out) {
    c.summary = criterionSummary(c, report, a);
    c.why = tidy(c.why);
    c.pros = c.pros.map(tidy);
    c.cons = c.cons.map(tidy);
  }
  return out;
}

/** 기준별 한 줄 요약 */
function criterionSummary(c: Criterion, report: NameReport, a: SajuAnalysis | null): string {
  switch (c.key) {
    case 'yongsin': {
      if (!a) return '생일을 넣으면 볼 수 있어요';
      if (!report.resource.length) return '한자를 고르면 볼 수 있어요';
      const fill = [...new Set(report.resource.filter((r) => a.roles[r.element] === 'yong' || a.roles[r.element] === 'hui').map((r) => PLAIN[r.element]))];
      const clash = report.resource.some((r) => a.roles[r.element] === 'gi' || a.roles[r.element] === 'gu');
      if (c.verdict === 'good') return `필요한 ${fill.join('·')} 기운을 채워요`;
      if (clash) return '사주에 넘치는 기운이 섞였어요';
      return fill.length ? `필요한 ${fill.join('·')} 기운을 조금 채워요` : '필요한 기운을 채우지 못해요';
    }
    case 'sound': {
      const h = report.soundBySchool.haerye.pairs.some((p) => p.kind === 'clash');
      const u = report.soundBySchool.unhae.pairs.some((p) => p.kind === 'clash');
      if (h && u) return '두 학설 모두 부딪히는 소리가 있어요';
      if (h) return '해례본으로 보면 부딪히는 소리가 있어요';
      if (u) return '해례본으로는 잘 어울려요 (운해본은 부딪힘)';
      return c.verdict === 'good' ? '두 학설 모두 소리가 잘 어울려요' : '소리 흐름이 무난해요';
    }
    case 'suri': {
      if (!report.frames) return '한자를 고르면 볼 수 있어요';
      const bad = report.frameResults.filter((f) => f.info.luck === 'bad');
      if (bad.length) return `${bad.map((f) => FRAME_KO[f.key].period).join('·')} 획수가 아쉬워요`;
      return c.verdict === 'good' ? '초년부터 말년까지 좋은 수예요' : '반반인 수가 섞였어요';
    }
    case 'yinyang': {
      if (c.verdict === 'good') return '음양이 고르게 섞였어요';
      if (report.strokeYinYang && !report.strokeYinYang.balanced) return '획수가 홀수나 짝수로만 쏠렸어요';
      if (report.vowel.level === 'unbalanced') return '모음 소리가 한쪽으로 쏠렸어요';
      return '음양이 조금 기울었어요';
    }
    default: {
      if (report.chars.some((h) => h?.negative)) return '피하는 뜻의 한자가 있어요';
      const pron = report.pronunciation.join('');
      if (pron !== report.fullHangul) return `실제로는 [${pron}]으로 소리 나요`;
      return c.verdict === 'good' ? '뜻이 좋고 부르기 편해요' : '뜻과 발음이 무난해요';
    }
  }
}

/** 총평: 좋은 점·아쉬운 점 한 줄씩 */
export function nameHighlights(criteria: Criterion[]): { good: string[]; bad: string[] } {
  return {
    good: criteria.filter((c) => c.verdict === 'good').map((c) => c.summary),
    bad: criteria.filter((c) => c.verdict !== 'good' && c.score !== null).map((c) => c.summary),
  };
}

/** 사주 한눈 요약 */
export function sajuBrief(a: SajuAnalysis): { title: string; need: Element[]; many: Element[]; few: Element[] } {
  const img = DAY_MASTER_IMAGE[a.pillars.day.stem] ?? '';
  const season = SEASON(a.pillars.month.branch);
  return {
    title: `${season}에 태어난 ${img} 같은 아이`,
    need: [a.yongsin, a.huisin],
    many: ORDER.filter((e) => a.power[e] >= 30),
    few: ORDER.filter((e) => a.counts[e] === 0 || a.power[e] < 10),
  };
}


// ── 만세력 평가: 한눈에 보는 세 가지 + 펼쳐 보기 ─────────────────
export interface SajuRow {
  key: 'strength' | 'balance' | 'need' | 'boundary';
  title: string;
  summary: string;
  verdict: Verdict | null;
  verdictText: string;
  detail: string[];
}

const STRENGTH_SHORT = { veryWeak: '아주 여린 편', weak: '여린 편', balanced: '고르게 잡힌 편', strong: '센 편', veryStrong: '아주 센 편' } as const;

export function sajuEval(saju: SajuResult): SajuRow[] {
  const a = saju.primary;
  const rows: SajuRow[] = [];
  const lv = a.strength.level;
  const sv: Verdict = lv === 'balanced' ? 'good' : lv === 'veryWeak' || lv === 'veryStrong' ? 'bad' : 'ok';
  rows.push({
    key: 'strength',
    title: '타고난 힘',
    summary: `${STRENGTH_SHORT[lv]}이에요`,
    verdict: sv,
    verdictText: sv === 'good' ? '균형' : lv === 'strong' || lv === 'veryStrong' ? '강함' : '약함',
    detail: [
      `나를 돕는 기운이 ${Math.round(a.strength.ratio * 100)}%예요. 태어난 날의 기운(${el(a.dayMaster)})을 돕는 기운과 힘을 빼는 기운을 견주어 봐요.`,
      lv === 'balanced'
        ? '양쪽이 비슷해 균형이 잡힌 사주예요.'
        : lv === 'strong' || lv === 'veryStrong'
          ? '돕는 기운이 많아 힘이 넘치는 사주예요. 그 힘을 덜어 주는 기운이 이름에 있으면 좋아요.'
          : '돕는 기운이 적어 힘이 여린 사주예요. 받쳐 주는 기운이 이름에 있으면 좋아요.',
    ].map(tidy),
  });
  const few = ORDER.filter((e) => a.counts[e] === 0);
  const many = ORDER.filter((e) => a.power[e] >= 30);
  const bv: Verdict = few.length === 0 && many.length === 0 ? 'good' : few.length >= 2 || many.some((e) => a.power[e] >= 45) ? 'bad' : 'ok';
  rows.push({
    key: 'balance',
    title: '다섯 기운의 균형',
    summary:
      many.length && few.length
        ? `${many.map((e) => WORD[e]).join('·')} 기운이 많고, ${few.map((e) => WORD[e]).join('·')} 기운이 없어요`
        : many.length
          ? `${many.map((e) => WORD[e]).join('·')} 기운이 많아요`
          : few.length
            ? `${few.map((e) => WORD[e]).join('·')} 기운이 없어요`
            : '다섯 기운이 고루 있어요',
    verdict: bv,
    verdictText: bv === 'good' ? '고름' : bv === 'ok' ? '조금 치우침' : '치우침',
    detail: ORDER.map((e) => `${el(e)} ${Math.round(a.power[e])}%${a.counts[e] === 0 ? ' · 사주에 없음' : a.power[e] >= 30 ? ' · 많음' : ''}`),
  });
  rows.push({
    key: 'need',
    title: '이름에 담을 기운',
    summary: a.huisin !== a.yongsin ? `${el(a.yongsin)}${josa(WORD[a.yongsin], '과', '와')} ${el(a.huisin)} 기운이 필요해요` : `${el(a.yongsin)} 기운이 필요해요`,
    verdict: null,
    verdictText: '',
    detail: [sajuNarrative(a), ...(ORDER.some((e) => a.roles[e] === 'gi') ? [`${ORDER.filter((e) => a.roles[e] === 'gi' || a.roles[e] === 'gu').map(el).join(', ')} 기운은 이름에 넣지 않는 게 좋아요.`] : [])].map(tidy),
  });
  if (saju.alternatives.length || saju.unknownTime) {
    const differs = saju.alternatives.some((x) => x.analysis.yongsin !== a.yongsin);
    rows.push({
      key: 'boundary',
      title: '태어난 시각',
      summary: saju.unknownTime ? '시각을 몰라 열두 때를 모두 따졌어요' : differs ? '경계에 가까워 결과가 달라질 수 있어요' : '경계에 가깝지만 필요한 기운은 같아요',
      verdict: saju.unknownTime || differs ? 'ok' : 'good',
      verdictText: saju.unknownTime ? '시간 모름' : differs ? '확인 필요' : '안정',
      detail: saju.unknownTime
        ? [`가장 많이 나온 결과를 썼어요(일치 ${Math.round(saju.unknownTime.confidence * 100)}%).`]
        : saju.alternatives.map((x) => `${x.label}: 필요한 기운 ${el(x.analysis.yongsin)}`),
    });
  }
  return rows;
}
