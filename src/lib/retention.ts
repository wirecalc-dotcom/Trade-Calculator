// Data retention, from dnsmailcheck's src/lib/retention.ts (Colin's 21 Oct 2026 decisions), trimmed to the tables this site has:
//  - visit and page events: 13 months (dnsmailcheck: 25); ad_hits and our own Google Ads reports: the same, like the events they reconcile with.
// Run once a day by the Worker's scheduled() handler (wrangler.toml [triggers]). dnsmailcheck ran it inside the daily Watch
// cron, which asset mode turned off; here it is the cron's only job, so the /privacy promise holds.
// Deletes run in batches (BATCH rows a statement, at most MAX_BATCHES a table a run); anything left over goes on the next run.

// 13 months: docs/research/privacy-consent-research.md §3.7 (dnsmailcheck keeps 25). /privacy says the same.
export const RETENTION = { eventMonths: 13 } as const;

const BATCH = 500;

const MAX_BATCHES = 20;

/** now minus whole calendar months (UTC), in unix ms. */
export function monthsAgo(now: number, months: number): number {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.getTime();
}

interface Rule { table: string; key: string; where: string; binds: (now: number) => (string | number)[] }

export const RULES: Rule[] = [
  { table: "events", key: "id", where: "ts < ?", binds: (n) => [monthsAgo(n, RETENTION.eventMonths)] },
  // Pass #76: page requests with a Google click id, like the page events they reconcile with.
  { table: "ad_hits", key: "id", where: "ts < ?", binds: (n) => [monthsAgo(n, RETENTION.eventMonths)] },
  // Pass #115: our own Google Ads reports, kept as long as the hits they reconcile with.
  { table: "ads_clicks", key: "gclid", where: "first_seen_at < ?", binds: (n) => [monthsAgo(n, RETENTION.eventMonths)] },
  { table: "ads_search_terms", key: "rowid", where: "updated_at < ?", binds: (n) => [monthsAgo(n, RETENTION.eventMonths)] },
  { table: "ads_keywords_daily", key: "rowid", where: "updated_at < ?", binds: (n) => [monthsAgo(n, RETENTION.eventMonths)] },
  { table: "ads_campaigns_daily", key: "rowid", where: "updated_at < ?", binds: (n) => [monthsAgo(n, RETENTION.eventMonths)] },
  { table: "ads_ingests", key: "id", where: "at < ?", binds: (n) => [monthsAgo(n, RETENTION.eventMonths)] },
];

export type PurgeCounts = Record<string, number>;

/**
 * Deletes what has passed its retention period. dryRun counts the rows instead of deleting them.
 * Returns the count per table.
 */
export async function purgeExpired(db: D1Database, now = Date.now(), opts: { dryRun?: boolean } = {}): Promise<PurgeCounts> {
  const out: PurgeCounts = {};
  for (const r of RULES) {
    const label = r.table;
    let n = 0;
    if (opts.dryRun) {
      n = Number((await db.prepare(`SELECT COUNT(*) AS n FROM ${r.table} WHERE ${r.where}`).bind(...r.binds(now)).first<{ n: number }>())?.n ?? 0);
    } else {
      for (let i = 0; i < MAX_BATCHES; i++) {
        const res = await db.prepare(
          `DELETE FROM ${r.table} WHERE ${r.key} IN (SELECT ${r.key} FROM ${r.table} WHERE ${r.where} LIMIT ${BATCH})`,
        ).bind(...r.binds(now)).run();
        const changed = Number(res.meta.changes ?? 0);
        n += changed;
        if (changed < BATCH) break;
      }
    }
    out[label] = (out[label] ?? 0) + n;
  }
  return out;
}
