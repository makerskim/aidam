import { describe, expect, it } from 'vitest';
import { fourFrames, strokeYinYang, suriElement } from '../src/name/suri';
import { SURI81, suri81 } from '../src/name/suri81';
import { soundElement, soundFlow, vowelYinYang } from '../src/name/sound';
import { isNegativeMeaning, teaseWord } from '../src/name/safety';
import { SURNAMES, surnameStrokes } from '../src/name/surnames';
import { getHanja } from '../src/name/hanjaDb';

describe('수리 4격', () => {
  it('four frames shapes: 외자 鄭雄 → 원12 형31 이19 정31', () => {
    expect(fourFrames(19, [12])).toEqual({ won: 12, hyeong: 31, i: 19, jeong: 31 });
  });
  it('2자: 金瑞允 → 원18 형22 이12 정26', () => {
    expect(fourFrames(8, [14, 4])).toEqual({ won: 18, hyeong: 22, i: 12, jeong: 26 });
  });
  it('복성 남궁 + 외자 珉 → 형29', () => {
    expect(fourFrames(surnameStrokes('南宮'), [10]).hyeong).toBe(29);
  });
  it('3자 이름: 이격은 성 + 둘째 이후', () => {
    expect(fourFrames(7, [3, 5, 6])).toEqual({ won: 14, hyeong: 10, i: 18, jeong: 21 });
  });
});

describe('81수리', () => {
  it('81개 항목, 길흉 3단계', () => {
    expect(SURI81).toHaveLength(81);
    expect(suri81(15).luck).toBe('good');
    expect(suri81(9).luck).toBe('bad');
    expect(suri81(38).luck).toBe('half');
    expect(suri81(82).n).toBe(2);
    expect(suri81(81).luck).toBe('good');
  });
  it('길수 목록은 설계서와 같다', () => {
    const good = SURI81.filter((s) => s.luck === 'good').map((s) => s.n);
    expect(good).toEqual([1, 3, 5, 6, 7, 8, 11, 13, 15, 16, 17, 18, 21, 23, 24, 25, 29, 31, 32, 33, 35, 37, 39, 41, 45, 47, 48, 52, 57, 61, 63, 65, 67, 68, 81]);
    expect(SURI81.filter((s) => s.luck === 'half').map((s) => s.n)).toEqual([38, 51, 58, 71, 73, 75, 77]);
  });
  it('수리오행: 끝자리 1·2 木 … 9·0 水', () => {
    expect(suriElement(12)).toBe('wood');
    expect(suriElement(20)).toBe('water');
  });
  it('수리음양: 획수 홀짝이 섞이면 균형', () => {
    expect(strokeYinYang([8, 14, 4]).balanced).toBe(false);
    expect(strokeYinYang([7, 14, 4]).balanced).toBe(true);
  });
});

describe('음령오행', () => {
  it('학설별 ㅇ·ㅁ 배당', () => {
    expect(soundElement('이', 'haerye')).toBe('water');
    expect(soundElement('이', 'unhae')).toBe('earth');
    expect(soundElement('민', 'haerye')).toBe('earth');
    expect(soundElement('민', 'unhae')).toBe('water');
    expect(soundElement('김', 'haerye')).toBe('wood');
  });
  it('김(木)→서(金)는 상극, 서(金)→윤(水, 해례본)은 상생 → 평균 0.5', () => {
    const f = soundFlow(['김', '서', '윤'], 'haerye');
    expect(f.pairs.map((p) => p.kind)).toEqual(['clash', 'forward']);
    expect(f.score).toBe(0.5);
  });
  it('순상생은 만점: 김(木)→나(火)→미(土, 해례본)', () => {
    const f = soundFlow(['김', '나', '미'], 'haerye');
    expect(f.pairs.map((p) => p.kind)).toEqual(['forward', 'forward']);
    expect(f.score).toBe(1);
  });
  it('소리음양: 김하윤 → 조화', () => {
    expect(vowelYinYang(['김', '하', '윤']).level).toBe('harmony');
    expect(vowelYinYang(['박', '하', '나']).level).toBe('unbalanced');
  });
});

describe('안전 검사', () => {
  it('부정 뜻', () => expect(isNegativeMeaning('죽을 사')).toBe(true));
  it('놀림 위험 단어', () => {
    expect(teaseWord('방구리')).toBe('방구');
    expect(teaseWord('김서윤')).toBeNull();
  });
});

describe('성씨', () => {
  it('주요 성씨와 복성이 있고 모두 한자 DB에 있다', () => {
    expect(SURNAMES.length).toBeGreaterThanOrEqual(100);
    for (const s of SURNAMES) for (const ch of s.hanja) expect(getHanja(ch), `${s.hangul} ${ch}`).toBeDefined();
    expect(SURNAMES.find((s) => s.hanja === '李')?.readings).toEqual(['이', '리']);
    expect(SURNAMES.some((s) => s.hanja === '諸葛')).toBe(true);
  });
  it('성씨 원획: 金8 李7 朴6 鄭19 南宮19', () => {
    expect(surnameStrokes('金')).toBe(8);
    expect(surnameStrokes('李')).toBe(7);
    expect(surnameStrokes('鄭')).toBe(19);
    expect(surnameStrokes('南宮')).toBe(19);
  });
});
