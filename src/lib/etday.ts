// America/New_York days (pass #52): /admin/stats buckets every day in ET, and the browser's visit cookie works out
// "first page view of the day" and the first-visit day in ET to match. The US rule since 2007: daylight time
// (UTC-4) from the second Sunday of March at 02:00 local (07:00 UTC) to the first Sunday of November at 02:00
// local (06:00 UTC), standard time (UTC-5) otherwise. Plain arithmetic, so it runs the same in the Worker, the
// browser and (as a CASE expression) in D1, and tests/unit/pass52.test.ts checks it against Intl hour by hour.

const HOUR = 3_600_000;
const DAY = 86_400_000;

/** [start, end) of daylight time in `year`, in UTC ms. */
export function dstSpan(year: number): [number, number] {
  // Day of the month of the nth Sunday.
  const sunday = (month: number, nth: number) => 1 + ((7 - new Date(Date.UTC(year, month, 1)).getUTCDay()) % 7) + (nth - 1) * 7;
  return [Date.UTC(year, 2, sunday(2, 2), 7), Date.UTC(year, 10, sunday(10, 1), 6)];
}

/** ET's offset from UTC at an instant, in ms: -4 h in daylight time, -5 h otherwise. */
export function etOffset(ms: number): number {
  const [start, end] = dstSpan(new Date(ms).getUTCFullYear());
  return ms >= start && ms < end ? -4 * HOUR : -5 * HOUR;
}

/** The ET calendar day (YYYY-MM-DD) of an instant. */
export const etDay = (ms: number): string => new Date(ms + etOffset(ms)).toISOString().slice(0, 10);

/** "YYYY-MM-DD HH:MM" on ET's clock. */
export const etTime = (ms: number): string => new Date(ms + etOffset(ms)).toISOString().replace("T", " ").slice(0, 16);

/** The instant an ET day starts. Midnight is never inside a clock change (those happen at 02:00 local). */
export function etStart(day: string): number {
  const utcMidnight = Date.parse(`${day}T00:00:00Z`);
  return utcMidnight - etOffset(utcMidnight + 4 * HOUR);
}

/** A calendar day `n` days from `day` (calendar days, so a 23- or 25-hour day doesn't skip or repeat one). */
export const addDays = (day: string, n: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** SQL for the ET day of a unix-ms column, correct for instants from fromMs to toMs (one WHEN per year). */
export function etDaySql(col: string, fromMs: number, toMs: number): string {
  const whens: string[] = [];
  for (let y = new Date(fromMs).getUTCFullYear(); y <= new Date(toMs).getUTCFullYear(); y++) {
    const [start, end] = dstSpan(y);
    whens.push(`WHEN ${col} >= ${start} AND ${col} < ${end} THEN ${4 * HOUR}`);
  }
  return `date((${col} - CASE ${whens.join(" ")} ELSE ${5 * HOUR} END) / 1000, 'unixepoch')`;
}

// Pass #115: the Google Ads account's day is America/Los_Angeles (Pacific). Same US rule, switching at 02:00 Pacific
// (10:00 UTC in March, 09:00 UTC in November).
/** [start, end) of Pacific daylight time in `year`, in UTC ms. */
export function ptDstSpan(year: number): [number, number] {
  const [s, e] = dstSpan(year);
  return [s + 3 * HOUR, e + 3 * HOUR];
}
export function ptOffset(ms: number): number {
  const [start, end] = ptDstSpan(new Date(ms).getUTCFullYear());
  return ms >= start && ms < end ? -7 * HOUR : -8 * HOUR;
}
/** The Pacific calendar day (YYYY-MM-DD) of an instant. */
export const ptDay = (ms: number): string => new Date(ms + ptOffset(ms)).toISOString().slice(0, 10);
/** The instant a Pacific day starts. */
export function ptStart(day: string): number {
  const utcMidnight = Date.parse(`${day}T00:00:00Z`);
  return utcMidnight - ptOffset(utcMidnight + 8 * HOUR);
}
