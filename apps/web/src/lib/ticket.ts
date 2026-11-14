/**
 * 분석 열쇠. 1회 결제 = 분석 1건.
 * 분석 입력(성·아이 정보·이름 조건·계산 기준)으로 열쇠를 만든다. 같은 입력이면 늘 같은 열쇠가 나와
 * 결제한 분석은 언제든 다시 볼 수 있고, 입력을 바꾸면 열쇠가 달라져 새 분석이 된다.
 *   추천 결과:  r.(아이 열쇠)-(아이 열쇠).(이름 조건).(계산 기준)
 *   이름 풀이:  a.(아이 열쇠).(이름).(계산 기준)
 * 추천 결과를 결제하면, 같은 아이·같은 계산 기준의 이름 풀이도 함께 열린다.
 */
import type { BirthInput, Gender, SajuOptions } from '@aidam/engine';
import { kidBirth, type AnalyzeState, type NameState, type SurnameSel } from './state';

/** 키 순서와 상관없이 같은 글이 되게 */
function stable(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

/** 53비트 해시(cyrb53) → 영문 소문자·숫자 */
function h(s: string): string {
  let a = 0xdeadbeef ^ 0x51ed;
  let b = 0x41c6ce57 ^ 0x51ed;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 2654435761);
    b = Math.imul(b ^ c, 1597334677);
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return (4294967296 * (2097151 & b) + (a >>> 0)).toString(36).padStart(8, '0');
}

const kidKey = (surname: SurnameSel, gender: Gender, birth: BirthInput | null, sajuOpts: SajuOptions) =>
  h(stable({ s: surname.hangul, sh: surname.hanja, g: gender, b: birth, o: sajuOpts }));

/** 이름 추천 결과의 열쇠 */
export function resultKey(state: NameState): string {
  const multi = (state.kids?.length ?? 0) > 1;
  const kids = multi
    ? (state.kids ?? []).map((k, i) => kidKey(state.surname, k.gender, kidBirth(state, i), state.sajuOpts))
    : [kidKey(state.surname, state.gender, state.birth, state.sajuOpts)];
  const prefs = h(stable({ p: state.prefs, m: multi ? (state.kidMode ?? 'set') : null }));
  return `r.${kids.join('-')}.${prefs}.${h(stable(state.school))}`;
}

/** 이름 하나를 풀이한 결과의 열쇠 */
export function reportKey(state: AnalyzeState): string {
  const name = h(stable(state.given.map((c) => [c.hangul, c.hanja ?? null])));
  return `a.${kidKey(state.surname, state.gender, state.birth, state.sajuOpts)}.${name}.${h(stable(state.school))}`;
}

/** 가진 열쇠로 이 분석을 볼 수 있는지 */
export function covers(keys: readonly string[], want: string): boolean {
  if (keys.includes(want)) return true;
  const [type, kid, , school] = want.split('.');
  if (type !== 'a' || !kid || !school) return false;
  // 추천 결과를 결제했다면 같은 아이·같은 계산 기준의 이름 풀이도 열린다
  return keys.some((k) => {
    const p = k.split('.');
    return p[0] === 'r' && p[3] === school && (p[1] ?? '').split('-').includes(kid);
  });
}
