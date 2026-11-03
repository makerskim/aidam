import type { Element } from '../core/elements';
import raw from '../data/hanja-raw.json';
import { applyDueum } from '../hangul/dueum';
import { computeWonStrokes, primaryRadical } from './strokes';
import { resourceElementOf, type Confidence } from './resourceElement';
import { BULYONG, isNegativeMeaning } from './safety';

export interface HanjaEntry {
  ch: string;
  readings: string[];
  meaning: string;
  strokes: number;
  totalStrokes: number;
  radical: number;
  element: Element;
  elementBasis: string;
  elementConfidence: Confidence;
  /** 대법원 인명용 추가 한자 */
  nameUse: boolean;
  /** 교육용 기초한자(인명용에 포함) */
  edu: boolean;
  negative: boolean;
  bulyong: boolean;
}

type RawRow = [ch: string, readings: string, meaning: string, rs: string, total: number, flags: number];

let cache: { list: HanjaEntry[]; byChar: Map<string, HanjaEntry>; byReading: Map<string, HanjaEntry[]> } | null = null;

function build(row: RawRow): HanjaEntry {
  const [ch, readings, meaning, rs, total, flags] = row;
  const strokes = computeWonStrokes(ch, rs, total);
  const radical = primaryRadical(rs).radical;
  const el = resourceElementOf(ch, radical, meaning, strokes);
  return {
    ch,
    readings: readings.split('|').filter(Boolean),
    meaning,
    strokes,
    totalStrokes: total,
    radical,
    element: el.element,
    elementBasis: el.basis,
    elementConfidence: el.confidence,
    nameUse: (flags & 1) === 1,
    edu: (flags & 2) === 2,
    negative: isNegativeMeaning(meaning),
    bulyong: BULYONG.has(ch),
  };
}

function db() {
  if (cache) return cache;
  const list = (raw as RawRow[]).map(build);
  const byChar = new Map(list.map((h) => [h.ch, h]));
  const byReading = new Map<string, HanjaEntry[]>();
  for (const h of list) {
    for (const r of h.readings) {
      const arr = byReading.get(r) ?? [];
      arr.push(h);
      byReading.set(r, arr);
    }
  }
  cache = { list, byChar, byReading };
  return cache;
}

export const allHanja = (): readonly HanjaEntry[] => db().list;
export const getHanja = (ch: string): HanjaEntry | undefined => db().byChar.get(ch);
export const isNameHanja = (h: HanjaEntry): boolean => h.nameUse || h.edu;

const byCodePoint = (a: HanjaEntry, b: HanjaEntry) => (a.ch.codePointAt(0) ?? 0) - (b.ch.codePointAt(0) ?? 0);

/**
 * 음절로 한자 찾기. initial=true(이름 첫 자)면 두음법칙 적용 음도 매칭한다(예: "이" → 李(리)).
 * 결과는 코드포인트 순.
 */
export function hanjaByReading(syllable: string, opts: { initial?: boolean } = {}): HanjaEntry[] {
  const { byReading } = db();
  const found = new Set<HanjaEntry>(byReading.get(syllable) ?? []);
  if (opts.initial) {
    for (const [reading, list] of byReading) {
      if (reading !== syllable && applyDueum(reading) === syllable) for (const h of list) found.add(h);
    }
  }
  return [...found].sort(byCodePoint);
}
