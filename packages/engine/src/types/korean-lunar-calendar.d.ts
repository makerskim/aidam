declare module 'korean-lunar-calendar' {
  export default class KoreanLunarCalendar {
    setLunarDate(year: number, month: number, day: number, intercalation: boolean): boolean;
    setSolarDate(year: number, month: number, day: number): boolean;
    getSolarCalendar(): { year: number; month: number; day: number };
    getLunarCalendar(): { year: number; month: number; day: number; intercalation: boolean };
    /** 한국천문연구원 데이터 기준 간지 번호(천간 0=甲, 지지 0=子). 검증 테스트에서만 쓴다 */
    getGapJaIndex(): { cheongan: { year: number; month: number; day: number }; ganji: { year: number; month: number; day: number } };
  }
}
