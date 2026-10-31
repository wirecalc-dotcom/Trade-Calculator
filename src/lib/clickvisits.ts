// Pass #103: one visit per Google click. A reload, or a landing again with the same click id (gclid, gbraid or wbraid),
// draws a new visit token in the browser, so it used to count as a new visit. Now a landing with the same click id within
// CLICK_VISIT_MS of the one before it joins that visit (a chain: each repeat restarts the 30 minutes). The rows stay as
// written; only the counting changes: /admin/stats, the daily digest, /admin/clicks and conversions.csv count click visits.

export const CLICK_VISIT_MS = 30 * 60_000;
export const CLICK_VISIT_NOTE = "Deduped (pass #103): landings with the same Google click id (gclid, gbraid or wbraid) within 30 minutes of the one before are one visit, so a reload or a repeat landing doesn't count again; the raw rows are kept.";

/** A visit's click id, in SQL (the first of gclid, gbraid, wbraid). */
export const CLICK_ID_OF = (alias = "") => `COALESCE(${alias}gclid, ${alias}gbraid, ${alias}wbraid)`;

/**
 * SQL: this landing page view (the row `row`, e.g. "events.") repeats an earlier landing of the same click id less than
 * 30 minutes before it, so it isn't a new visit. flags(alias): the bots/internal filter, applied to the earlier landing too.
 */
export const repeatLandingSql = (row: string, flags: (alias: string) => string) =>
  `EXISTS (SELECT 1 FROM events rl WHERE rl.type = 'page_view' AND rl.status = 'landing' AND rl.ts < ${row}ts AND rl.ts >= ${row}ts - ${CLICK_VISIT_MS}
    AND ${CLICK_ID_OF("rl.")} = ${CLICK_ID_OF(row)}${flags("rl.")})`;

/** The same for the Worker's own log of ad clicks (ad_hits): a page request repeating the same click id within 30 minutes. */
export const repeatHitSql = (row: string, flags: (alias: string) => string) =>
  `EXISTS (SELECT 1 FROM ad_hits rh WHERE rh.ts < ${row}ts AND rh.ts >= ${row}ts - ${CLICK_VISIT_MS} AND ${CLICK_ID_OF("rh.")} = ${CLICK_ID_OF(row)}${flags("rh.")})`;

/**
 * Which visit each visit token belongs to: tokens whose click ids match and whose starts are within 30 minutes of the one
 * before (in time order) share the first one's token; every other token is its own visit. Returns token -> root token.
 */
export function clickVisitRoots(rows: { token: string; clickId: string | null; start: number }[]): Map<string, string> {
  const roots = new Map<string, string>();
  const last = new Map<string, { root: string; start: number }>();
  for (const r of [...rows].sort((a, b) => a.start - b.start || a.token.localeCompare(b.token))) {
    const prev = r.clickId ? last.get(r.clickId) : undefined;
    const root = prev && r.start - prev.start <= CLICK_VISIT_MS ? prev.root : r.token;
    roots.set(r.token, root);
    if (r.clickId) last.set(r.clickId, { root, start: r.start });
  }
  return roots;
}

// Pass #114: a click id is a paid click once, ever. Its first landing is the paid click; a later landing with the same id after
// the 30-minute visit window (the Oct 29 case: 08:49, then 15:14 from a bookmarked or reopened ad URL) is a return visit via the
// ad URL: counted apart, never as a new paid click. Rows stay as written.
export const RETURN_VISIT_NOTE = "A click id is a paid click once (pass #114): its first landing is the paid click; a later landing with the same id after the 30-minute window is a return visit via the ad URL, counted apart and never as a new paid click.";

/** SQL: an earlier landing page view with the same click id, ever (so this one isn't a new paid click). */
export const earlierLandingSql = (row: string, flags: (alias: string) => string) =>
  `EXISTS (SELECT 1 FROM events el WHERE el.type = 'page_view' AND el.status = 'landing' AND el.ts < ${row}ts AND ${CLICK_ID_OF("el.")} = ${CLICK_ID_OF(row)}${flags("el.")})`;

/** The same for the Worker's log of ad clicks (ad_hits). */
export const earlierHitSql = (row: string, flags: (alias: string) => string) =>
  `EXISTS (SELECT 1 FROM ad_hits eh WHERE eh.ts < ${row}ts AND ${CLICK_ID_OF("eh.")} = ${CLICK_ID_OF(row)}${flags("eh.")})`;

// Pass #117: /admin/stats filtered bots and internal traffic row by row, so a bot visit's unflagged rows still counted (the Oct 29
// visit: one ad_hits row flagged by its user agent, then 4 offer clicks from rows that weren't). /admin/clicks judges the visit
// (src/lib/clicks.ts factsOf: a visit is a bot or internal if any row of it is); /admin/stats and the digest now do the same.

/**
 * SQL, appended to an events query's WHERE (`row`: the events row's alias, e.g. "e."): leaves out the row when it, or its visit,
 * is a bot or internal (unless that toggle includes them). Its visit: any events row with the same visit token or click id, or
 * any ad_hits row with the same hit id or click id. A bot row: events is_bot; ad_hits is_bot or a webdriver boot (as factsOf).
 * The one definition: every events query on /admin/stats goes through it. "" when both toggles include them.
 */
export function visitFlagsSql(row: string, f: { includeBots: boolean; includeInternal: boolean }): string {
  if (f.includeBots && f.includeInternal) return "";
  const ev = (a: string) => [f.includeBots ? "" : `${a}is_bot = 1`, f.includeInternal ? "" : `${a}is_internal = 1`].filter(Boolean).join(" OR ");
  const hit = (a: string) => [f.includeBots ? "" : `${a}is_bot = 1 OR ${a}boot_webdriver = 1`, f.includeInternal ? "" : `${a}is_internal = 1`].filter(Boolean).join(" OR ");
  const own = `${f.includeBots ? "" : ` AND ${row}is_bot = 0`}${f.includeInternal ? "" : ` AND ${row}is_internal = 0`}`;
  const cid = CLICK_ID_OF(row);
  return `${own} AND NOT (
    (${row}visit_token IS NOT NULL AND ${row}visit_token IN (SELECT vf.visit_token FROM events vf WHERE vf.visit_token IS NOT NULL AND (${ev("vf.")})))
    OR (${row}hit_id IS NOT NULL AND ${row}hit_id IN (SELECT hf.hit_id FROM ad_hits hf WHERE hf.hit_id IS NOT NULL AND (${hit("hf.")})))
    OR (${cid} IS NOT NULL AND ${cid} IN (SELECT ${CLICK_ID_OF("cf.")} FROM ad_hits cf WHERE ${CLICK_ID_OF("cf.")} IS NOT NULL AND (${hit("cf.")})
      UNION SELECT ${CLICK_ID_OF("ce.")} FROM events ce WHERE ${CLICK_ID_OF("ce.")} IS NOT NULL AND (${ev("ce.")}))))`;
}
