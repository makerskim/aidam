import { describe, expect, it } from 'vitest';
import { computeWonStrokes } from '../src/name/strokes';
import { resourceElementOf } from '../src/name/resourceElement';
import { allHanja, getHanja, hanjaByReading } from '../src/name/hanjaDb';
import { DATA_VERSION, ENGINE_VERSION } from '../src/version';
import { fnv1a } from '../src/share/hash';
import hanjaRaw from '../src/data/hanja-raw.json';

const GOLDEN: Record<string, number> = {
  河: 9, 洙: 10, 炫: 9, 瑞: 14, 珉: 10, 道: 16, 英: 11, 陳: 16, 鄭: 19, 萬: 15, 王: 4, 琴: 13,
  表: 9, 育: 10, 李: 7, 金: 8, 朴: 6, 崔: 11, 四: 4, 五: 5, 十: 10, 漢: 15, 泰: 10, 允: 4,
};

describe('원획(성명학 획수)', () => {
  for (const [ch, n] of Object.entries(GOLDEN)) {
    it(`${ch} = ${n}획`, () => {
      expect(getHanja(ch)?.strokes).toBe(n);
    });
  }
  it('computeWonStrokes: 변형부수 원형 획수 적용', () => {
    expect(computeWonStrokes('河', '85.5', 8)).toBe(9);
    expect(computeWonStrokes('萬', '114.8 140.9', 13)).toBe(15);
    expect(computeWonStrokes('王', '96.0', 4)).toBe(4);
  });
});

describe('자원오행', () => {
  it('부수가 명확한 글자는 신뢰도 A', () => {
    expect(resourceElementOf('河', 85, '물 하', 9)).toMatchObject({ element: 'water', confidence: 'A' });
    expect(resourceElementOf('林', 75, '수풀 림', 8)).toMatchObject({ element: 'wood', confidence: 'A' });
    expect(resourceElementOf('炫', 86, '밝을 현', 9)).toMatchObject({ element: 'fire', confidence: 'A' });
    expect(resourceElementOf('珉', 96, '옥돌 민', 10)).toMatchObject({ element: 'metal', confidence: 'A' });
    expect(resourceElementOf('坤', 32, '땅 곤', 8)).toMatchObject({ element: 'earth', confidence: 'A' });
  });
  it('근거 문장이 비어 있지 않다', () => {
    expect(resourceElementOf('河', 85, '물 하', 9).basis.length).toBeGreaterThan(0);
  });
  it('모든 한자에 오행이 정해진다', () => {
    for (const h of allHanja()) expect(['wood', 'fire', 'earth', 'metal', 'water']).toContain(h.element);
  });
});

describe('한자 DB', () => {
  it('인명용(교육용 포함) 한자가 8,000자 이상', () => {
    expect(allHanja().filter((h) => h.nameUse || h.edu).length).toBeGreaterThanOrEqual(8000);
  });
  it('음으로 찾기', () => {
    expect(hanjaByReading('하').map((h) => h.ch)).toContain('河');
  });
  it('이름 첫 자 두음법칙: "이"로 李 찾기', () => {
    expect(hanjaByReading('이', { initial: true }).map((h) => h.ch)).toContain('李');
  });
  it('훈음이 있다', () => {
    expect(getHanja('河')?.meaning).toContain('물');
  });
  it('결과는 코드포인트 순으로 정렬', () => {
    const list = hanjaByReading('서').map((h) => h.ch.codePointAt(0) ?? 0);
    expect([...list].sort((a, b) => a - b)).toEqual(list);
  });
});

describe('버전', () => {
  it('ENGINE_VERSION은 semver', () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
  it('DATA_VERSION은 hanja-raw.json의 FNV-1a', () => {
    expect(DATA_VERSION).toBe(fnv1a(JSON.stringify(hanjaRaw)));
  });
  it('fnv1a 기준값', () => {
    expect(fnv1a('')).toBe('811c9dc5');
    expect(fnv1a('a')).toBe('e40c292c');
  });
});

describe('부정 뜻 판정(대표 훈 기준)', () => {
  it('健(굳셀 건, 병 없을 건)은 부정 뜻이 아니다', () => {
    expect(getHanja('健')?.negative).toBe(false);
  });
  it('儉(검소할 검, …가난할 검)은 부정 뜻이 아니다', () => {
    expect(getHanja('儉')?.negative).toBe(false);
  });
  it('亡(망할 망), 凶(흉할 흉)은 부정 뜻', () => {
    expect(getHanja('亡')?.negative).toBe(true);
    expect(getHanja('凶')?.negative).toBe(true);
  });
});
