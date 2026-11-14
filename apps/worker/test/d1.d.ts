/* eslint-disable @typescript-eslint/no-explicit-any -- 테스트용 */
export function makeD1(): D1Database & { raw: { prepare(sql: string): { get(...a: unknown[]): any; all(...a: unknown[]): any[]; run(...a: unknown[]): unknown }; exec(sql: string): void } };
