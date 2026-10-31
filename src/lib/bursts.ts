// Pass #115: the bursts in a time range (src/lib/hitverdict.ts burstTokens), read from the stored landings. Shared by
// /admin/clicks, the Data quality line and /admin/stats, which leaves burst visits out of its visit counts (rows untouched).

import { burstTokens } from "./hitverdict";

/** Interaction per landing, for the burst rule: the exit's flag, an event that needs a person, or the hit script's flag. */
const LANDINGS_SQL = `SELECT l.visit_token AS token, l.page AS page, l.ts AS ts,
  (EXISTS (SELECT 1 FROM events x WHERE x.visit_token = l.visit_token AND ((x.type = 'exit' AND x.interacted = 1) OR x.type IN ('check_run', 'details_open', 'tool_used', 'offer_click', 'quote_request', 'capture')))
   OR EXISTS (SELECT 1 FROM ad_hits h WHERE h.hit_id = l.hit_id AND h.interacted = 1)) AS interacted
  FROM events l WHERE l.type = 'page_view' AND l.status = 'landing' AND l.visit_token IS NOT NULL AND l.page IS NOT NULL AND l.is_internal = 0 AND l.ts >= ? AND l.ts < ?`;

/** The bursts in [lo, hi): visit tokens and how many separate bursts. */
export async function burstsIn(db: D1Database, lo: number, hi: number): Promise<{ tokens: Set<string>; groups: number }> {
  const rows = (await db.prepare(LANDINGS_SQL).bind(lo, hi).all<{ token: string; page: string; ts: number; interacted: number }>()).results;
  return burstTokens(rows.map((r) => ({ token: r.token, page: r.page, ts: Number(r.ts), interacted: !!Number(r.interacted) })));
}

const TOKEN = /^[A-Za-z0-9_-]{8,40}$/; // the events route's visit-token rule

/** SQL that leaves the burst tokens out (a visit token column), or "" when there are none. */
export function notBurstSql(tokens: Set<string>, col = "visit_token"): string {
  const ok = [...tokens].filter((t) => TOKEN.test(t));
  return ok.length ? ` AND (${col} IS NULL OR ${col} NOT IN (${ok.map((t) => `'${t}'`).join(", ")}))` : "";
}
