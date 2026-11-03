import { applyDueum } from '@aidam/engine/src/hangul/dueum';

/** 훈음 여러 개 중 해당 음절로 읽는 뜻을 고른다. 例) "고를 조, 아침 주" + "주" → "아침 주" */
export function meaningFor(meaning: string, syllable: string): string {
  const segs = meaning.split(',').map((s) => s.trim()).filter(Boolean);
  const hit = segs.find((s) => {
    const last = s.split(/\s+/).pop() ?? '';
    return last === syllable || applyDueum(last) === syllable;
  });
  return hit ?? segs[0] ?? '';
}
