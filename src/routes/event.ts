// POST /api/event: browser-side events, ported from dnsmailcheck's src/routes/event.ts with the same body limits, cleaning,
// attribution, bot/internal flags and x-event-sink reply. Events: page_view, return_visit, details_open, scroll_depth, exit
// (dnsmailcheck's), and calc_run, formula_view, chart_view, copy_result (new, same mechanism).
// Body: {type, page, landing?, utm_*?, gclid?, gbraid?, wbraid?, visit_token?, source?, hit_id?, pv, pv_seq | (exit: seq, sent,
//   engaged_ms, scroll_pct, nav, last_event, interacted, first_interaction_ms), retry?,
//   page_view: {landing_view?, new_today?, visit_count?, referrer_empty?, nav?},
//   return_visit: {visit_count, referrer_empty, first_day?, ret_days?, sticky?, sticky_gclid?},
//   details_open: {section}, scroll_depth: {mark},
//   calc_run: {tool, inputs, result, first?}, formula_view / chart_view: {tool, section?}, copy_result: {tool, result}}

import type { Env } from "../env";
import { attribution, CLIENT_EVENT_TYPES, EVENT_TYPES, cleanPage, logEvents, logExit, type EventRow, type EventType } from "../lib/events";
import { cleanEngaged, cleanExitKind, cleanMark, cleanNavType, cleanPv, cleanScroll, cleanSeq } from "../lib/engagement";
import { trafficFlags } from "../lib/traffic";

const TOOL = /^[a-z0-9-]{2,40}$/;
const SECTION = /^[a-z0-9:_-]{1,80}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** A calculator's input summary or result: printable text, trimmed and capped. */
const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return s || null;
};

export async function postEvent(request: Request, env: Env): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 4000) return new Response(null, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }
  const type = String(body.type) as EventType;
  if (!CLIENT_EVENT_TYPES.has(type)) return new Response(null, { status: 400 });
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(10_000, Math.floor(v))) : null);
  const exit = type === "exit";
  const calc = type === "calc_run" || type === "formula_view" || type === "chart_view" || type === "copy_result";
  const tool = calc && typeof body.tool === "string" && TOOL.test(body.tool) ? body.tool : null;
  if (calc && !tool) return new Response(null, { status: 400 });
  const flags = await trafficFlags(request, env);
  const row: EventRow = {
    type,
    page: cleanPage(body.page),
    tool,
    section: (type === "details_open" || type === "formula_view" || type === "chart_view") && typeof body.section === "string" && SECTION.test(body.section) ? body.section : null,
    // page_view on the visit's first page: counted as a visit (landing). return_visit "sticky": the first direct return (no
    // referrer, no tags) within 14 days of a first visit from an ad; "sticky_gclid" when that first visit had a gclid.
    status: type === "page_view" && body.landing_view === true ? "landing"
      : type === "return_visit" && body.sticky === true ? (body.sticky_gclid === true ? "sticky_gclid" : "sticky") : null,
    new_today: type === "page_view" && body.new_today === true ? 1 : null,
    first_in_visit: type === "calc_run" ? (body.first === true ? 1 : 0) : null,
    first_day: type === "return_visit" && typeof body.first_day === "string" && DAY.test(body.first_day) ? body.first_day : null,
    ret_days: type === "return_visit" ? n(body.ret_days) : null,
    visit_count: n(body.visit_count),
    referrer_empty: body.referrer_empty === undefined ? null : body.referrer_empty ? 1 : 0,
    inputs: type === "calc_run" ? text(body.inputs, 300) : null,
    result: type === "calc_run" || type === "copy_result" ? text(body.result, 200) : null,
    // dnsmailcheck pass #103: engagement.
    pv: cleanPv(body.pv),
    scroll_pct: type === "scroll_depth" ? cleanMark(body.mark) : exit ? cleanScroll(body.scroll_pct) : null,
    engaged_ms: exit ? cleanEngaged(body.engaged_ms) : null,
    nav: type === "page_view" ? cleanNavType(body.nav) : exit ? cleanExitKind(body.nav) : null,
    last_event: exit && (EVENT_TYPES as readonly string[]).includes(body.last_event as string) ? String(body.last_event) : null,
    seq: exit ? cleanSeq(body.seq) : null,
    // dnsmailcheck pass #114: delivery and interaction.
    pv_seq: exit ? null : cleanSeq(body.pv_seq),
    sent: exit ? n(body.sent) : null,
    retry: body.retry === 1 || body.retry === true ? 1 : null,
    interacted: exit && body.interacted !== undefined ? (body.interacted === 1 || body.interacted === true ? 1 : 0) : null,
    first_interaction_ms: exit ? cleanEngaged(body.first_interaction_ms) : null,
    ...attribution(body),
    ...flags,
  };
  if (type === "scroll_depth" && row.scroll_pct === null) return new Response(null, { status: 400 });
  if (type === "calc_run" && (!row.inputs || !row.result)) return new Response(null, { status: 400 });
  const sink = exit ? await logExit(env.DB, row) : await logEvents(env.DB, [row]);
  return new Response(null, { status: 204, headers: { "x-event-sink": sink } });
}
