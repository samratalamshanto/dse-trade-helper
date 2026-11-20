export const CODE_RE = /^[A-Z0-9][A-Z0-9&()-]{0,19}$/;

export const DHAKA_OFFSET_MS = 6 * 3_600_000;

export const dhakaToday = (now: Date | number = Date.now()): string =>
  new Date(+now + DHAKA_OFFSET_MS).toISOString().slice(0, 10);

const FRIDAY = 5, SATURDAY = 6;
const isWeekend = (d: Date): boolean => d.getUTCDay() === FRIDAY || d.getUTCDay() === SATURDAY;

// DSE trades Sunday to Thursday; counts trading days from fromIso to toIso, both included (no holiday list).
export function tradingDaysBetween(fromIso: string, toIso: string): number {
  let n = 0;
  for (const d = new Date(fromIso + 'T00:00:00Z'), end = Date.parse(toIso + 'T00:00:00Z'); d.getTime() <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (!isWeekend(d)) n++;
  }
  return n;
}

export function previousTradingDay(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  do d.setUTCDate(d.getUTCDate() - 1); while (isWeekend(d));
  return d.toISOString().slice(0, 10);
}
