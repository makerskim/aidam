export interface YMD {
  year: number;
  month: number;
  day: number;
}

/** 그레고리력 날짜의 율리우스일(정오 기준 정수) */
export function jdn(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

export function fromJdn(j: number): YMD {
  const a = j + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return {
    day: e - Math.floor((153 * m + 2) / 5) + 1,
    month: m + 3 - 12 * Math.floor(m / 10),
    year: 100 * b + d - 4800 + Math.floor(m / 10),
  };
}

export function isValidSolarDate(year: number, month: number, day: number): boolean {
  if (![year, month, day].every(Number.isInteger)) return false;
  if (month < 1 || month > 12 || day < 1) return false;
  const f = fromJdn(jdn(year, month, day));
  return f.year === year && f.month === month && f.day === day;
}

export function addDays(d: YMD, n: number): YMD {
  return fromJdn(jdn(d.year, d.month, d.day) + n);
}
