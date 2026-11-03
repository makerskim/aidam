import { describe, expect, it } from 'vitest';
import { controls, controllerOf, generates, generatorOf, relation, ELEMENTS } from '../src/core/elements';
import { cycleIndex, pillarFromCycle, pillarHanja, stemElement, branchElement, stemIsYang } from '../src/core/ganji';

describe('오행 관계', () => {
  it('상생 순환: 木→火→土→金→水→木', () => {
    expect(generates('wood')).toBe('fire');
    expect(generates('water')).toBe('wood');
    expect(generatorOf('fire')).toBe('wood');
  });
  it('상극: 木→土, 土→水, 水→火, 火→金, 金→木', () => {
    expect(controls('wood')).toBe('earth');
    expect(controls('metal')).toBe('wood');
    expect(controllerOf('wood')).toBe('metal');
  });
  it('relation 분류', () => {
    expect(relation('water', 'wood')).toBe('generates');
    expect(relation('wood', 'water')).toBe('generatedBy');
    expect(relation('wood', 'earth')).toBe('controls');
    expect(relation('earth', 'wood')).toBe('controlledBy');
    expect(relation('fire', 'fire')).toBe('same');
  });
  it('ELEMENTS는 목화토금수 순', () => {
    expect(ELEMENTS).toEqual(['wood', 'fire', 'earth', 'metal', 'water']);
  });
});

describe('간지', () => {
  it('60갑자 0 = 甲子, 54 = 戊午', () => {
    expect(pillarHanja(pillarFromCycle(0))).toBe('甲子');
    expect(pillarHanja(pillarFromCycle(54))).toBe('戊午');
    expect(pillarHanja(pillarFromCycle(59))).toBe('癸亥');
  });
  it('cycleIndex 왕복', () => {
    for (let i = 0; i < 60; i++) expect(cycleIndex(pillarFromCycle(i))).toBe(i);
  });
  it('천간·지지 오행과 음양', () => {
    expect(stemElement(0)).toBe('wood'); // 甲
    expect(stemElement(9)).toBe('water'); // 癸
    expect(stemIsYang(0)).toBe(true);
    expect(stemIsYang(1)).toBe(false);
    expect(branchElement(0)).toBe('water'); // 子
    expect(branchElement(4)).toBe('earth'); // 辰
    expect(branchElement(6)).toBe('fire'); // 午
  });
});
