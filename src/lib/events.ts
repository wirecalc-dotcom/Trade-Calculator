// Measurement events (spec section 1.5), stored in D1.
// No IPs, no user agents, no visitor IDs. The user agent is looked at when an event arrives, only to set
// is_bot (src/lib/traffic.ts); unique visitors, first checks and stickiness come from flags the browser
// works out from its own ec_v cookie and session storage. Since pass #76 the events of one visit (one tab, from one landing
// page view) share a random visit token; nothing links one visit to another. There are no accounts and no forms that take
// personal data: calc_run keeps calculator inputs (numbers and choices) only.
// Every event of a visit carries its landing page, UTM tags, Google click id and visit token (ATTRIBUTION_KEYS), kept in the
// browser's session storage and sent with each event and API call. The visit token (pass #76) is a random value the
// tab draws with each landing page view: it ties one visit's events together for the per-visit funnel, and nothing else.
// Pass #114: a visit that landed on a tagged link also carries that page request's hit id (src/lib/hits.ts), which ties the
// visit's events to the server's own row for the request (ad_hits) and its rungs.

export const EVENT_TYPES = [
  "page_view", "return_visit", "details_open", // dnsmailcheck M1
  "landing_404", // a page request with a Google click id or utm_ tags that got the 404 page (logged by the Worker)
  "scroll_depth", "exit", // dnsmailcheck pass #103: engagement (src/lib/engagement.ts)
  // NEW for wirecalculators.com, same mechanism (the page script, POST /api/event):
  //  calc_run      a calculator produced a result from inputs that settled (tool = calculator, inputs, result; first_in_visit)
  //  formula_view  a formula block half on screen for a second, or opened (tool, section = which formula)
  //  chart_view    a reference chart half on screen for a second (tool, section = which chart)
  //  copy_result   the result's Copy button (tool, result)
  "calc_run", "formula_view", "chart_view", "copy_result",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Events the browser may send directly; the rest (landing_404) are written by the server. */
export const CLIENT_EVENT_TYPES = new Set<EventType>(["page_view", "return_visit", "details_open", "scroll_depth", "exit",
  "calc_run", "formula_view", "chart_view", "copy_result"]);

export interface EventRow {
  type: EventType;
  page?: string | null;
  tool?: string | null;
  target?: string | null;
  check_name?: string | null;
  status?: string | null;
  offer?: string | null;
  ref?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  utm_adgroup?: string | null; // pass #76: the Final URL suffix's ad group id
  utm_device?: string | null;
  utm_match?: string | null;
  gclid?: string | null;
  gbraid?: string | null; // pass #76: Google's other click ids, paid like gclid
  wbraid?: string | null;
  visit_token?: string | null; // pass #76: the tab's visit token (see above)
  visit_count?: number | null;
  referrer_empty?: number | null;
  cached?: number | null;
  tips?: number | null; // capture: 1 when "Also send me occasional tips" was ticked
  landing?: string | null; // first page of the visit
  section?: string | null; // details_open
  record_type?: string | null; // tool_used (DNS lookup)
  grade?: string | null; // result_grade, offer_render, offer_view, offer_click, purchase
  score?: number | null; // result_grade
  caps?: string | null; // result_grade: comma-separated cap ids
  since_result_ms?: number | null; // offer_click
  user_id?: number | null; // set on events made while signed in (A1)
  source?: TrafficSource | null; // how the visit arrived (attribution())
  is_bot?: 0 | 1; // M1: traffic flags (src/lib/traffic.ts); /admin/stats and the conversions export leave these out
  bot_reason?: string | null;
  is_internal?: 0 | 1;
  new_today?: number | null; // page_view: this browser's first page view of the day (ET since pass #52, UTC before)
  first_in_visit?: number | null; // check_run, offer_render, offer_view, offer_click, overall warn/fail result: the visit's first one
  first_day?: string | null; // return_visit: day of the browser's first visit (ET since pass #52, UTC before)
  amount?: number | null; // refund: cents refunded on the charge so far
  plan?: string | null;
  offer_variant?: string | null; // offer_render, offer_view, offer_click: which offer box (src/lib/offerbox.ts); null before pass #52
  findings?: string | null; // offer_render, offer_view, offer_click: the finding code the box is about; result (overall): the warn/fail codes, comma-separated
  // Pass #103 (src/lib/engagement.ts)
  pv?: string | null; // page_view, scroll_depth, cta_view, exit: the page load's random id
  scroll_pct?: number | null; // scroll_depth: the mark; exit: the deepest scroll of the page view
  engaged_ms?: number | null; // exit: visible time on the page view
  nav?: string | null; // page_view: navigate | reload | back_forward | prerender; exit: internal | checkout | away | hidden
  last_event?: string | null; // exit: the page's last event before it
  seq?: number | null; // exit: its number within the page view (the highest is kept)
  // Pass #114 (src/lib/hits.ts, src/lib/hitverdict.ts)
  hit_id?: string | null; // the hit id of the tagged landing that started the visit (ad_hits.hit_id), on every event of the visit
  pv_seq?: number | null; // every browser event but exit: 1, 2, 3 ... within its page view
  sent?: number | null; // exit: how many events (pv_seq) the page view tried to send
  retry?: number | null; // 1: resent from the browser's queue after a failed send
  interacted?: number | null; // exit: 1 if anyone pressed, touched, typed or used a wheel on the page
  first_interaction_ms?: number | null; // exit: ms from the page's start to the first of those
  // NEW (wirecalculators.com)
  inputs?: string | null; // calc_run: the inputs in short form
  result?: string | null; // calc_run, copy_result: the headline result
  ret_days?: number | null; // return_visit: whole days since the browser's first visit
}

const CODE = /^[a-z0-9_]{1,40}$/;
/** An offer variant or a finding code from the browser (short lowercase ids), or null. */
export const cleanCode = (v: unknown): string | null => (typeof v === "string" && CODE.test(v) ? v : null);

export const TRAFFIC_SOURCES = ["gclid", "utm", "direct", "organic", "referral"] as const;
export type TrafficSource = (typeof TRAFFIC_SOURCES)[number];

const COLUMNS = ["type", "page", "tool", "target", "check_name", "status", "offer", "ref", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "visit_count", "referrer_empty", "cached", "tips",
  "landing", "section", "record_type", "grade", "score", "caps", "since_result_ms", "user_id",
  "source", "is_bot", "bot_reason", "is_internal", "new_today", "first_in_visit", "first_day", "amount", "plan", "offer_variant", "findings",
  "utm_adgroup", "utm_device", "utm_match", "gbraid", "wbraid", "visit_token",
  "pv", "scroll_pct", "engaged_ms", "nav", "last_event", "seq",
  "hit_id", "pv_seq", "sent", "retry", "interacted", "first_interaction_ms",
  "inputs", "result", "ret_days"] as const;
/** Carried on every event of a visit, and copied from the offer click onto the purchase and its refunds. */
export const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_adgroup", "utm_device", "utm_match",
  "gclid", "gbraid", "wbraid", "visit_token", "landing", "source", "hit_id"] as const;
/** Google Ads click ids: any of them makes a visit paid (source gclid). They get a longer limit, since a cut id can't be matched. */
export const CLICK_ID_KEYS = ["gclid", "gbraid", "wbraid"] as const;
const isClickId = (k: string) => (CLICK_ID_KEYS as readonly string[]).includes(k);
const VISIT_TOKEN = /^[A-Za-z0-9_-]{8,40}$/;
const HIT_ID = /^[A-Za-z0-9]{16}$/; // src/lib/hits.ts
const FLAGS = new Set(["is_bot", "is_internal"]);

const clip = (v: unknown, n = 200) => (v === undefined || v === null || v === "" ? null : String(v).slice(0, n));

/**
 * Pulls UTM tags, click ids, the visit token, the landing page and the traffic source from query params or a JSON body.
 * source: gclid (any Google click id), else utm (any utm_source), else what the browser saw at landing (direct, organic or referral).
 */
export function attribution(src: URLSearchParams | Record<string, unknown>): Partial<EventRow> {
  const get = (k: string) => (src instanceof URLSearchParams ? src.get(k) : src[k]);
  const out: Partial<EventRow> = {};
  for (const k of ATTRIBUTION_KEYS) {
    if (k === "source") continue;
    const raw = get(k);
    const v = k === "landing" ? cleanPage(raw) : k === "visit_token" ? (typeof raw === "string" && VISIT_TOKEN.test(raw) ? raw : null)
      : k === "hit_id" ? (typeof raw === "string" && HIT_ID.test(raw) ? raw : null) : clip(raw, isClickId(k) ? 300 : 150);
    if (v) out[k] = v;
  }
  const seen = get("source");
  const source: TrafficSource | null = hasClickId(out) ? "gclid" : out.utm_source ? "utm"
    : seen === "direct" || seen === "organic" || seen === "referral" ? seen : null;
  if (source) out.source = source;
  return out;
}

/** The row has a Google click id (gclid, gbraid or wbraid). */
export const hasClickId = (r: Partial<Record<(typeof CLICK_ID_KEYS)[number], string | null>>): boolean => CLICK_ID_KEYS.some((k) => !!r[k]);

/** Paid traffic: a Google click id, or a paid utm_medium. The same rule as the PAID SQL in src/lib/stats.ts. */
export const PAID_MEDIUMS = ["cpc", "ppc", "paid", "paidsearch", "paid_search"];
export const isPaid = (r: Partial<EventRow>): boolean => hasClickId(r) || PAID_MEDIUMS.includes((r.utm_medium ?? "").toLowerCase());

export function cleanPage(p: unknown): string | null {
  const s = clip(p, 200);
  return s && s.startsWith("/") ? s.split(/[?#]/)[0] : null;
}


const INSERT_SQL = `INSERT INTO events (ts, day, ${COLUMNS.join(", ")}) VALUES (?, ?, ${COLUMNS.map(() => "?").join(", ")})`;

const values = (r: EventRow, now: number) => [now, new Date(now).toISOString().slice(0, 10), ...COLUMNS.map((c) => {
  const v = r[c];
  if (FLAGS.has(c)) return v ? 1 : 0;
  return typeof v === "number" ? v : clip(v, c === "findings" ? 1000 : isClickId(c) ? 300 : 200);
})];

/** One event insert, for callers that put it in their own batch (the Stripe webhook). */
export function eventInsert(db: D1Database, r: EventRow, now = Date.now()): D1PreparedStatement {
  if (isTestTagged(r)) r = { ...r, is_internal: 1 };
  return db.prepare(INSERT_SQL).bind(...values(r, now));
}

/**
 * Pass #103: an exit replaces the page view's earlier exit (the final one wins), so a page view has at most one exit row.
 * A beacon that arrives after a later one (a higher seq) is dropped. Needs the row's pv and seq; without them, nothing is written.
 */
export async function logExit(db: D1Database | undefined, r: EventRow, now = Date.now()): Promise<Sink> {
  if (!db) return "none";
  if (r.type !== "exit" || !r.pv || !r.seq) return "none";
  if (isTestTagged(r)) r = { ...r, is_internal: 1 };
  const same = "type = 'exit' AND pv = ? AND visit_token IS ?";
  try {
    await db.batch([
      db.prepare(`DELETE FROM events WHERE ${same} AND seq < ?`).bind(r.pv, r.visit_token ?? null, r.seq),
      db.prepare(`INSERT INTO events (ts, day, ${COLUMNS.join(", ")}) SELECT ?, ?, ${COLUMNS.map(() => "?").join(", ")}
        WHERE NOT EXISTS (SELECT 1 FROM events WHERE ${same} AND seq >= ?)`).bind(...values(r, now), r.pv, r.visit_token ?? null, r.seq),
    ]);
    return "d1";
  } catch (e) {
    console.error("exit log failed", e);
    return "error";
  }
}

/** Our own test links (utm_source=test, utm_campaign test-*) count as internal traffic (src/lib/internal.ts, rule 1). */
import { isTestTagged } from "./internal";
export { isTestTagged };

export type Sink = "d1" | "none" | "error";

/** The same rows marked with the signed-in user, if there is one. */
export const asUser = (rows: EventRow[], userId: number | null | undefined): EventRow[] =>
  userId ? rows.map((r) => ({ ...r, user_id: userId })) : rows;

/** Writes events in one batch. Returns which sink took them, for the x-event-sink header. */
export async function logEvents(db: D1Database | undefined, rows: EventRow[], now = Date.now()): Promise<Sink> {
  if (!rows.length) return "none";
  if (!db) return "none";
  try {
    await db.batch(rows.map((r) => eventInsert(db, r, now)));
    return "d1";
  } catch (e) {
    console.error("event log failed", e);
    return "error";
  }
}
