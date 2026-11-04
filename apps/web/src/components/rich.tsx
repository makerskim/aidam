import { Fragment, type ReactNode } from 'react';

/**
 * 풀이 문장에서 중요한 말에 색과 굵기를 입힌다.
 * - 오행: 나무(木)·불(火)·흙(土)·쇠(金)·물(水) → 오행 색
 * - 한자와 뜻: 賀(축하할 하) → 굵게
 * - 좋은 말·아쉬운 말 → 초록·빨강 굵게
 * - 운의 시기·용어 → 강조색 굵게
 */
const ELEMENT_CLASS: Record<string, string> = { 木: 'wood', 火: 'fire', 土: 'earth', 金: 'metal', 水: 'water' };

const RULES: { re: RegExp; cls: (m: RegExpExecArray) => string }[] = [
  { re: /(?:나무|불|흙|쇠|물)\((木|火|土|金|水)\)/y, cls: (m) => `rx-el rx-${ELEMENT_CLASS[m[1] as string]}` },
  { re: /[一-鿿]\([^()]{1,14}\)/y, cls: () => 'rx-hanja' },
  { re: /(?:좋지 않은 수|부딪혀요|부딪히는|부딪힐|눌러요|기울어요|치우쳐요|피하는 뜻|아쉬워요|헷갈릴|좋지 않은)/y, cls: () => 'rx-bad' },
  { re: /(?:좋은 수|살려 줘요|살려 주는|채워 줘요|채워 주|균형이 맞아요|부딪히지 않아요|없어서 좋아요|조화로워요|부르기 편해요)/y, cls: () => 'rx-good' },
  { re: /(?:초년운|청년운|장년운|말년·총운|용신|희신|해례본|운해본|81수리)/y, cls: () => 'rx-key' },
  { re: /\d+수/y, cls: () => 'rx-key' },
  { re: /\d+(?:%|점|획)/y, cls: () => 'rx-num' },
  { re: /(?:필요해요|넉넉해|많아요|없어요|센 편|여린 편|고르게 잡힌 편|아주 센 편|아주 여린 편)/y, cls: () => 'rx-num' },
];

export function Rich({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let plain = '';
  let i = 0;
  while (i < text.length) {
    let hit: { len: number; cls: string } | null = null;
    for (const r of RULES) {
      r.re.lastIndex = i;
      const m = r.re.exec(text);
      if (m) {
        hit = { len: m[0].length, cls: r.cls(m) };
        break;
      }
    }
    if (hit) {
      if (plain) out.push(plain);
      plain = '';
      out.push(
        <b key={i} className={hit.cls}>
          {text.slice(i, i + hit.len)}
        </b>,
      );
      i += hit.len;
    } else {
      plain += text[i];
      i += 1;
    }
  }
  if (plain) out.push(plain);
  return <Fragment>{out}</Fragment>;
}
