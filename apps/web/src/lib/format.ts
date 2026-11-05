import { applyDueum } from '@aidam/engine/src/hangul/dueum';
import { HANJA_STORY } from '@aidam/engine/src/name/stories';

/** 훈음 여러 개 중 해당 음절로 읽는 뜻을 고른다. 例) "고를 조, 아침 주" + "주" → "아침 주" */
export function meaningFor(meaning: string, syllable: string): string {
  const segs = meaning.split(',').map((s) => s.trim()).filter(Boolean);
  const hit = segs.find((s) => {
    const last = s.split(/\s+/).pop() ?? '';
    return last === syllable || applyDueum(last) === syllable;
  });
  return hit ?? segs[0] ?? '';
}

/** 한자 한 글자의 훈음. 자료의 훈음이 비었거나 어색하면 이름 한자 이야기의 뜻풀이를 쓴다 */
export function hanjaMeaning(h: { ch: string; meaning: string }, syllable: string): string {
  return HANJA_STORY.get(h.ch)?.hun ?? meaningFor(h.meaning, syllable);
}
