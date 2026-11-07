import { applyDueum } from '@aidam/engine/src/hangul/dueum';
import { HANJA_STORY } from '@aidam/engine/src/name/stories';

/** 훈음 여러 개 중 해당 음절로 읽는 뜻을 고른다. 例) "고를 조, 아침 주" + "주" → "아침 주" */
export function meaningFor(meaning: string, syllable: string): string {
  const segs = meaning.split(',').map((s) => s.trim()).filter(Boolean);
  if (segs.length === 0) return '';
  const lastOf = (s: string) => s.split(/\s+/).pop() ?? '';
  // 1) 그 소리로 읽는 훈음, 2) 음이 붙은 첫 훈음, 3) 뜻만 있으면 음을 붙인다("땅이름" → "땅이름 을")
  const hit =
    segs.find((s) => lastOf(s) === syllable || applyDueum(lastOf(s)) === syllable || applyDueum(syllable) === lastOf(s)) ??
    segs.find((s) => /^[가-힣]$/.test(lastOf(s)) && s.split(/\s+/).length > 1 && !/同字|俗字|本字/.test(s));
  if (hit) return hit;
  const first = segs.find((s) => !/同字|俗字|本字/.test(s)) ?? '';
  return first ? `${first} ${syllable}` : '';
}

/** 한자 한 글자의 훈음. 자료의 훈음이 비었거나 어색하면 이름 한자 이야기의 뜻풀이를 쓴다 */
export function hanjaMeaning(h: { ch: string; meaning: string }, syllable: string): string {
  return HANJA_STORY.get(h.ch)?.hun ?? meaningFor(h.meaning, syllable);
}

/** 많은 글꼴에 없어 네모로 보일 수 있는 드문 한자(확장 A·B 이후) */
export function isRareGlyph(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (c >= 0x3400 && c <= 0x4dbf) || c > 0xffff;
}
