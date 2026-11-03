import { describe, expect, it } from 'vitest';
import * as engine from '../src/index';

describe('공유 상태', () => {
  it('왕복 동일(한글 포함)', () => {
    const obj = { v: 1, surname: '김', given: ['서', '윤'], hanja: '金瑞潤', n: 3 };
    expect(engine.decodeState(engine.encodeState(obj))).toEqual(obj);
  });
  it('URL 안전 문자만 쓴다', () => {
    expect(engine.encodeState({ a: '서윤?&/+' })).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it('깨진 문자열 → null', () => {
    expect(engine.decodeState('%%%')).toBeNull();
    expect(engine.decodeState('')).toBeNull();
  });
  it('fnv1a 기준값', () => expect(engine.fnv1a('')).toBe('811c9dc5'));
});

describe('공개 API', () => {
  it('주요 함수와 버전을 내보낸다', () => {
    for (const k of ['computeSaju', 'analyzeName', 'recommendNames', 'analyzeSiblings', 'recommendSiblingSets', 'suggestBetterHanja', 'SURNAMES', 'PLACES', 'hanjaByReading']) {
      expect(engine).toHaveProperty(k);
    }
    expect(engine.ENGINE_VERSION).toBe('1.0.0');
  });
});

describe('같은 음, 더 좋은 한자', () => {
  const saju = engine.computeSaju({ calendar: 'solar', year: 2026, month: 3, day: 14, time: { hour: 9, minute: 30 }, placeId: 'seoul' }).primary;
  const input = { surname: [{ hangul: '김', hanja: '金' }], given: [{ hangul: '서', hanja: '西' }, { hangul: '윤', hanja: '允' }], gender: 'female' as const };
  const current = engine.analyzeName(input, saju);
  const better = engine.suggestBetterHanja(input, saju, engine.DEFAULT_SCHOOL_OPTIONS);
  it('최대 3개, 모두 현재보다 점수가 높고 소리는 같다', () => {
    expect(better.length).toBeLessThanOrEqual(3);
    for (const b of better) {
      expect(b.report.score.total).toBeGreaterThan(current.score.total);
      expect(b.report.input.given.map((g) => g.hangul)).toEqual(['서', '윤']);
    }
  });
});
