import { getHanja } from './hanjaDb';

export interface Surname {
  /** 대표 읽기 */
  hangul: string;
  hanja: string;
  /** 고를 수 있는 읽기 (두음법칙 전후) */
  readings: string[];
  /** 흔히 쓰는 성인지. 드문 성은 같은 소리의 흔한 성이 없을 때만 보여 준다 */
  common: boolean;
}

const DUAL: Record<string, string[]> = {
  李: ['이', '리'], 柳: ['유', '류'], 劉: ['유', '류'], 林: ['임', '림'], 羅: ['나', '라'], 盧: ['노', '로'],
  呂: ['여', '려'], 梁: ['양', '량'], 龍: ['용', '룡'], 陸: ['육', '륙'], 廉: ['염', '렴'],
};

const LIST =
  '김金 이李 박朴 최崔 정鄭 강姜 조趙 윤尹 장張 임林 한韓 오吳 서徐 신申 권權 황黃 안安 송宋 류柳 전全 홍洪 고高 문文 양梁 손孫 배裵 조曺 백白 허許 유劉 남南 심沈 노盧 정丁 하河 곽郭 성成 차車 주朱 우禹 구具 신辛 임任 전田 민閔 유兪 류柳 나羅 진陳 지池 엄嚴 채蔡 원元 천千 방方 공孔 강康 현玄 함咸 변卞 염廉 양楊 변邊 여呂 추秋 노魯 도都 소蘇 신愼 석石 선宣 설薛 마馬 길吉 주周 연延 방房 위魏 표表 명明 기奇 반潘 왕王 금琴 옥玉 육陸 진秦 인印 맹孟 제諸 모牟 장蔣 남궁南宮 탁卓 국鞠 여余 진晋 어魚 은殷 편片 용龍 구丘 예芮 경慶 봉奉 사史 부夫 황보皇甫 제갈諸葛 사공司空 선우鮮于 서문西門 독고獨孤 동방東方 태太 견甄 갈葛 계桂 두杜 당唐 목睦 범范 빈賓 승承 엽葉 온溫 요姚 음陰 종鍾 좌左 창昌 초楚 팽彭 평平 포包 풍馮 피皮 형邢 호胡 환桓 후侯 경景 하夏 강强 장章 정程 석昔 모毛 우于 단段 운雲 탄彈 판判 상尙 곡曲 가賈 간簡 감甘 강剛 개介 내乃 담譚 대大 돈頓 라羅';

/** LIST는 인구가 많은 순서. 이 성(선우)까지가 흔히 쓰는 성이고, 뒤는 인구가 아주 적은 성이다 */
const LAST_COMMON = '鮮于';

function parse(): Surname[] {
  const out: Surname[] = [];
  const seen = new Set<string>();
  let common = true;
  for (const tok of LIST.split(' ')) {
    const m = /^([가-힣]+)(\p{Script=Han}+)$/u.exec(tok);
    if (!m) continue;
    const [, hangul, hanja] = m as unknown as [string, string, string];
    if (seen.has(hanja) || hanja.length !== hangul.length) continue;
    if ([...hanja].some((ch) => !getHanja(ch))) continue;
    seen.add(hanja);
    out.push({ hangul, hanja, readings: DUAL[hanja]?.length ? (DUAL[hanja] as string[]) : [hangul], common });
    if (hanja === LAST_COMMON) common = false;
  }
  return out;
}

export const SURNAMES: readonly Surname[] = parse();

/** 성 원획 합(복성은 두 글자 합) */
export function surnameStrokes(hanja: string): number {
  return [...hanja].reduce((sum, ch) => {
    const h = getHanja(ch);
    if (!h) throw new RangeError(`UNKNOWN_SURNAME_HANJA:${ch}`);
    return sum + h.strokes;
  }, 0);
}
