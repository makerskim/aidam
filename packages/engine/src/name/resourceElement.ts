import type { Element } from '../core/elements';
import { suriElementOfStrokes } from './suriElement';

/**
 * 자원오행(字源五行) 산정 — 설계서 5.4.
 * A: 부수가 오행을 직접 나타냄 / B: 성명학 통설 부수 배당 / C: 훈(뜻) 키워드, 그래도 없으면 획수 끝자리.
 */
export type Confidence = 'A' | 'B' | 'C';

export interface ResourceElement {
  element: Element;
  basis: string;
  confidence: Confidence;
}

const RADICAL_NAMES: Record<number, string> = {
  75: '木(나무 목)', 140: '艸·艹(풀 초)', 118: '竹(대 죽)', 115: '禾(벼 화)',
  86: '火·灬(불 화)', 72: '日(날 일)',
  32: '土(흙 토)', 46: '山(뫼 산)', 102: '田(밭 전)', 170: '阜·阝(언덕 부)',
  167: '金(쇠 금)', 96: '玉·王(구슬 옥)', 112: '石(돌 석)',
  85: '水·氵(물 수)', 15: '冫(얼음 빙)', 173: '雨(비 우)',
  120: '糸(실 사)', 145: '衣·衤(옷 의)', 119: '米(쌀 미)',
  61: '心·忄(마음 심)', 9: '人·亻(사람 인)', 187: '馬(말 마)', 196: '鳥(새 조)',
  38: '女(여자 녀)', 166: '里(마을 리)', 163: '邑·阝(고을 읍)', 201: '黃(누를 황)',
  18: '刀·刂(칼 도)', 62: '戈(창 과)', 69: '斤(도끼 근)', 154: '貝(조개 패)', 106: '白(흰 백)', 149: '言(말씀 언)',
  39: '子(아들 자)', 195: '魚(물고기 어)',
};

const TIER_A: Record<number, Element> = {
  75: 'wood', 140: 'wood', 118: 'wood', 115: 'wood',
  86: 'fire', 72: 'fire',
  32: 'earth', 46: 'earth', 102: 'earth', 170: 'earth',
  167: 'metal', 96: 'metal', 112: 'metal',
  85: 'water', 15: 'water', 173: 'water',
};

const TIER_B: Record<number, Element> = {
  120: 'wood', 145: 'wood', 119: 'wood',
  61: 'fire', 9: 'fire', 187: 'fire', 196: 'fire',
  38: 'earth', 166: 'earth', 163: 'earth', 201: 'earth',
  18: 'metal', 62: 'metal', 69: 'metal', 154: 'metal', 106: 'metal', 149: 'metal',
  39: 'water', 195: 'water',
};

/** 훈(뜻) 낱말 → 오행. 훈의 낱말과 정확히 일치할 때만 쓴다. */
const KEYWORDS: Record<Element, string[]> = {
  wood: ['나무', '풀', '꽃', '숲', '수풀', '잎', '뿌리', '가지', '벼', '싹', '봄', '동녘', '동쪽', '버들', '소나무', '오동나무', '뽕나무'],
  fire: ['불', '빛', '밝을', '빛날', '해', '따뜻할', '붉을', '여름', '남녘', '남쪽', '불꽃', '비칠', '햇빛', '번개'],
  earth: ['흙', '땅', '산', '언덕', '돌', '밭', '들', '성', '뫼', '가운데', '터', '고개', '누를'],
  metal: ['쇠', '금', '옥', '구슬', '보배', '칼', '돈', '은', '가을', '서녘', '서쪽', '흴', '옥돌', '거울', '방울'],
  water: ['물', '바다', '강', '시내', '샘', '못', '이슬', '흐를', '물결', '젖을', '윤택할', '맑을', '겨울', '북녘', '북쪽', '비', '눈', '얼음', '배'],
};

/** 훈음 "물 하, 강 하" → 훈 낱말 목록(음절 독음 제외) */
export function meaningWords(meaning: string): string[] {
  const words: string[] = [];
  for (const seg of meaning.split(',')) {
    const toks = seg.trim().split(/\s+/).filter(Boolean);
    words.push(...toks.slice(0, -1));
  }
  return words;
}

export function resourceElementOf(ch: string, radical: number, meaning: string, strokes: number): ResourceElement {
  const a = TIER_A[radical];
  if (a) return { element: a, basis: `부수 ${RADICAL_NAMES[radical] ?? radical}`, confidence: 'A' };
  const b = TIER_B[radical];
  if (b) return { element: b, basis: `부수 ${RADICAL_NAMES[radical] ?? radical} (성명학 통설)`, confidence: 'B' };

  const words = meaningWords(meaning);
  for (const w of words) {
    for (const [el, kws] of Object.entries(KEYWORDS) as [Element, string[]][]) {
      if (kws.includes(w)) return { element: el, basis: `뜻 '${w}'에서 추정`, confidence: 'C' };
    }
  }
  const el = suriElementOfStrokes(strokes);
  return { element: el, basis: `${ch}의 원획 ${strokes}획 끝자리로 추정`, confidence: 'C' };
}
