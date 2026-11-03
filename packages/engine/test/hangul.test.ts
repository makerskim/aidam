import { describe, expect, it } from 'vitest';
import { compose, decompose, isHangulSyllable, toSyllables } from '../src/hangul/jamo';
import { applyDueum } from '../src/hangul/dueum';
import { pronounce } from '../src/hangul/pronounce';

describe('자모', () => {
  it('분해와 조합', () => {
    expect(decompose('한')).toEqual({ initial: 'ㅎ', medial: 'ㅏ', final: 'ㄴ' });
    expect(compose('ㅎ', 'ㅏ', 'ㄴ')).toBe('한');
    expect(decompose('A')).toBeNull();
    expect(isHangulSyllable('가')).toBe(true);
    expect(toSyllables('서윤')).toEqual(['서', '윤']);
    expect(toSyllables('서1')).toBeNull();
  });
});

describe('두음법칙', () => {
  it('ㄹ·ㄴ 첫소리 변화', () => {
    expect(applyDueum('리')).toBe('이');
    expect(applyDueum('녀')).toBe('여');
    expect(applyDueum('라')).toBe('나');
    expect(applyDueum('류')).toBe('유');
    expect(applyDueum('서')).toBe('서');
  });
});

describe('실제 발음 추정', () => {
  it('비음화: 석민 → 성민', () => expect(pronounce(['석', '민'])).toEqual(['성', '민']));
  it('유음화: 신라 → 실라', () => expect(pronounce(['신', '라'])).toEqual(['실', '라']));
  it('연음: 민아 → 미나', () => expect(pronounce(['민', '아'])).toEqual(['미', '나']));
  it('격음화: 국화 → 구콰', () => expect(pronounce(['국', '화'])).toEqual(['구', '콰']));
  it('ㅇ 받침은 넘어가지 않음: 영아 → 영아', () => expect(pronounce(['영', '아'])).toEqual(['영', '아']));
  it('변화 없음: 서윤', () => expect(pronounce(['서', '윤'])).toEqual(['서', '윤']));
});
