// Pass #103: /admin/clicks, a trace of every paid click. One row per click visit (src/lib/clickvisits.ts: a Google click id,
// with its reloads and repeat landings within 30 minutes), newest first: where it came from (the Final URL suffix's
// campaign, ad group, keyword, match type and device), whether the Worker saw the request (ad_hits) and whether the page's
// script ran (any event), then what the visit did, in seconds since it landed, how long the tab was visible, how far it
// scrolled and when it left. Each row opens to the raw events. Bots and internal traffic follow the same toggles as
// /admin/stats. Only well-formed click ids (src/lib/adhits.ts) count as paid clicks.
// Pass #114: each paid click gets one verdict (src/lib/hitverdict.ts) from its hit's rungs (src/lib/hits.ts) and its events, and
// the page opens with the ladder (paid hits -> rendered -> boot -> app -> interacted -> converted) by device and campaign. A click
// id is a paid click once: its first visit is the paid click; a later one (after the 30-minute visit window) is a return via the
// ad URL, listed but never counted as a new paid click.

import { escapeHtml } from "./http";
import { etTime } from "./etday";
import { AD_HIT_TAGS, isWellFormedClickId } from "./adhits";
import { CLICK_ID_OF, CLICK_VISIT_MS, CLICK_VISIT_NOTE, RETURN_VISIT_NOTE } from "./clickvisits";
import { CLIENT_EVENT_TYPES, type EventType } from "./events";
import { isPrefetch, isPrerender } from "./hits";
import { burstsIn } from "./bursts";
import { EXCLUDED, LADDER, ladderStep, lossOf, VERDICT_LABELS, VERDICTS, verdictOf, type DataQuality, type Verdict, type VisitFacts } from "./hitverdict";
import { rangeBounds, statsRange, windowLabel, type StatsRange } from "./stats";

export interface ClicksRange extends StatsRange { campaign: string | null; device: string | null }

const ID = /^[A-Za-z0-9_-]{1,40}$/;
/** /admin/stats's range (default the last 7 days here), plus ?campaign= (id) and ?device= (m, c or t). */
export function clicksRange(p: URLSearchParams, now = Date.now()): ClicksRange {
  const q = new URLSearchParams(p);
  if (!q.has("days") && !q.has("from")) q.set("days", "7");
  const campaign = p.get("campaign") ?? "";
  const device = p.get("device") ?? "";
  return { ...statsRange(q, now), campaign: ID.test(campaign) ? campaign : null, device: ["m", "c", "t"].includes(device) ? device : null };
}

export interface ClickEvent {
  id: number; ts: number; type: string; page: string | null; status: string | null; tool: string | null; check_name: string | null; grade: string | null;
  offer: string | null; plan: string | null; section: string | null; offer_variant: string | null; result?: string | null; scroll_pct: number | null; engaged_ms: number | null;
  nav: string | null; last_event: string | null; pv: string | null; visit_token: string | null; seq: number | null;
  utm_campaign: string | null; utm_adgroup: string | null; utm_term: string | null; utm_match: string | null; utm_device: string | null;
  // Pass #114 (absent on rows built by older tests)
  hit_id?: string | null; pv_seq?: number | null; sent?: number | null; retry?: number | null; interacted?: number | null; is_bot?: number; is_internal?: number;
}
export interface ClickHit {
  id: number; ts: number; path: string; utm_campaign: string | null; utm_adgroup: string | null; utm_term: string | null; utm_match: string | null; utm_device: string | null;
  // Pass #114
  hit_id?: string | null; is_bot?: number; bot_reason?: string | null; is_internal?: number; sec_purpose?: string | null; datacenter?: number | null; asn?: number | null;
  device_class?: string | null; browser_family?: string | null; referrer_host?: string | null; sec_fetch_site?: string | null; country?: string | null;
  rendered_at?: number | null; boot_at?: number | null; boot_webdriver?: number | null; exit_at?: number | null; dwell_ms?: number | null; app_ran?: number | null; interacted?: number | null;
}

export interface TimelineStep { t: number; label: string }
export interface ClickVisit {
  clickId: string; start: number; campaign: string | null; adgroup: string | null; term: string | null; match: string | null; device: string | null;
  landing: string | null; hits: number; jsRan: boolean; landings: number;
  timeline: TimelineStep[]; engagedMs: number | null; maxScroll: number | null; exit: { t: number; last: string | null; kind: string } | null;
  /** The visit ran at least one calculator (calc_run). */
  reachedCalc: boolean; events: ClickEvent[];
  /** Pass #114: paid = the click id's first visit (the paid click); return = a later visit via the same ad URL. */
  kind: "paid" | "return";
  /** Pass #114: the click id isn't a Google one; set by computeClicks. */
  facts: VisitFacts | null; verdict: Verdict | null; loss: { sent: number; lost: number }; hitRows: ClickHit[];
  /** Device from the request (Sec-CH-UA-Mobile or the user agent): mobile, tablet, desktop; else the suffix's {device}. */
  deviceClass: string;
}

const secs = (ms: number) => Math.max(0, Math.round(ms / 1000));
const DEVICES: Record<string, string> = { m: "phone", c: "desktop", t: "tablet" };

/** One visit's trace from its hits and events (time order). */
export function traceOf(clickId: string, hits: ClickHit[], events: ClickEvent[]): ClickVisit {
  const start = Math.min(...hits.map((h) => h.ts), ...events.map((e) => e.ts));
  const at = (ts: number) => secs(ts - start);
  const landingsOf = events.filter((e) => e.type === "page_view" && e.status === "landing");
  const tagged = landingsOf.find((e) => e.utm_campaign) ?? events.find((e) => e.utm_campaign) ?? null;
  const hitTags = hits.find((h) => h.utm_campaign) ?? hits[0] ?? null;
  const tag = (k: (typeof AD_HIT_TAGS)[number]) => tagged?.[k] ?? hitTags?.[k] ?? null;
  const timeline: TimelineStep[] = [];
  const once = new Set<string>();
  const step = (e: ClickEvent, label: string, key = label) => { if (!once.has(key)) { once.add(key); timeline.push({ t: at(e.ts), label }); } };
  for (const h of hits) step({ ts: h.ts } as ClickEvent, `server hit ${h.path}`, `hit${h.id}`);
  for (const e of events) {
    switch (e.type) {
      case "page_view":
        if (e.status === "landing") step(e, `${e.nav === "reload" ? "reload" : landingsOf[0] === e ? "landed" : "landed again"} ${e.page ?? ""}`, `pv${e.id}`);
        else step(e, `${e.nav === "reload" ? "reload" : "page"} ${e.page ?? ""}`, `pv${e.id}`);
        break;
      case "calc_run": step(e, `calc ${e.tool ?? ""}${e.result ? `: ${e.result}` : ""}`, `cr${e.id}`); break;
      case "formula_view": step(e, `formula seen ${e.tool ?? ""}`, `fv${e.tool}${e.section}`); break;
      case "chart_view": step(e, `chart seen ${e.section ?? e.tool ?? ""}`, `cv${e.tool}${e.section}`); break;
      case "copy_result": step(e, `copied result ${e.tool ?? ""}`, `cp${e.id}`); break;
      case "details_open": step(e, `opened ${e.section ?? ""}`, `do${e.section}`); break;
      case "scroll_depth": step(e, `scroll ${e.scroll_pct}%${e.page && e.page !== landingsOf[0]?.page ? ` ${e.page}` : ""}`, `sd${e.page}${e.scroll_pct}`); break;
    }
  }
  // One exit per page view (the highest seq; logExit already keeps only that one).
  const exits = new Map<string, ClickEvent>();
  for (const e of events) if (e.type === "exit" && e.pv) { const x = exits.get(e.pv); if (!x || (e.seq ?? 0) > (x.seq ?? 0)) exits.set(e.pv, e); }
  const exitList = [...exits.values()].sort((a, b) => a.ts - b.ts);
  const last = exitList[exitList.length - 1] ?? null;
  // An exit followed by a reload of the page: the visitor reloaded.
  const reloadAfter = last ? events.some((e) => e.type === "page_view" && e.nav === "reload" && e.ts > last.ts) : false;
  const scrolls = [...exitList.map((e) => e.scroll_pct ?? 0), ...events.filter((e) => e.type === "scroll_depth").map((e) => e.scroll_pct ?? 0)];
  timeline.sort((a, b) => a.t - b.t);
  return {
    clickId, start, campaign: tag("utm_campaign"), adgroup: tag("utm_adgroup"), term: tag("utm_term"), match: tag("utm_match"), device: tag("utm_device"),
    landing: landingsOf[0]?.page ?? hits[0]?.path ?? events[0]?.page ?? null, hits: hits.length, jsRan: events.length > 0, landings: landingsOf.length,
    timeline,
    engagedMs: exitList.length ? exitList.reduce((n, e) => n + (e.engaged_ms ?? 0), 0) : null,
    maxScroll: scrolls.length ? Math.max(...scrolls) : null,
    exit: last ? { t: at(last.ts), last: last.last_event, kind: reloadAfter ? "reload" : last.nav ?? "?" } : null,
    reachedCalc: events.some((e) => e.type === "calc_run"),
    events,
    kind: "paid", facts: null, verdict: null, loss: visitLoss(events), hitRows: hits,
    deviceClass: hits.find((h) => h.device_class && h.device_class !== "unknown")?.device_class ?? SUFFIX_DEVICE[tag("utm_device") ?? ""] ?? "unknown",
  };
}

const SUFFIX_DEVICE: Record<string, string> = { m: "mobile", c: "desktop", t: "tablet" };

/** Pass #114: events the visit's page views tried to send and how many the server has (page views with an exit only). */
export function visitLoss(events: ClickEvent[]): { sent: number; lost: number } {
  const exits = new Map<string, number>();
  const got = new Map<string, Set<number>>();
  for (const e of events) {
    if (!e.pv) continue;
    const k = `${e.visit_token}|${e.pv}`;
    if (e.type === "exit" && typeof e.sent === "number") exits.set(k, Math.max(exits.get(k) ?? 0, e.sent));
    else if (typeof e.pv_seq === "number") (got.get(k) ?? got.set(k, new Set()).get(k)!).add(e.pv_seq);
  }
  const l = lossOf([...exits].map(([k, sent]) => ({ sent, received: got.get(k)?.size ?? 0 })));
  return { sent: l.sent, lost: l.lost };
}

/** Events that mean someone used the page (beyond the exit's own interacted flag). */
const INTERACTIVE = new Set<string>(["calc_run", "details_open", "copy_result"]);
/** wirecalculators.com: a visit "converts" when it runs a calculator (there is nothing to buy). */
const CONVERTED = new Set<string>(["calc_run"]);

/** Pass #114: what the verdict is decided on, for one visit. burst: the visit tokens in a burst (burstTokens). */
export function factsOf(v: ClickVisit, burst: Set<string>): VisitFacts {
  const ev = v.events;
  const hits = v.hitRows;
  const exits = hits.filter((h) => h.exit_at);
  return {
    internal: hits.some((h) => h.is_internal === 1) || ev.some((e) => e.is_internal === 1),
    junkId: !!v.clickId && !v.clickId.startsWith("hit:") && !isWellFormedClickId(v.clickId),
    botUa: hits.some((h) => (h.is_bot === 1 && h.bot_reason !== "bad_click_id") || h.boot_webdriver === 1) || ev.some((e) => e.is_bot === 1),
    burst: ev.some((e) => e.type === "page_view" && e.status === "landing" && !!e.visit_token && burst.has(e.visit_token)),
    datacenter: hits.some((h) => h.datacenter === 1),
    hits: hits.map((h) => ({ hitId: h.hit_id ?? null, prefetch: isPrefetch(h.sec_purpose), prerender: isPrerender(h.sec_purpose), rendered: !!h.rendered_at, boot: !!h.boot_at })),
    appRan: hits.some((h) => h.app_ran === 1) ? true : exits.length ? false : null,
    dwellMs: exits.length ? Math.max(...exits.map((h) => h.dwell_ms ?? 0)) : null,
    browserEvents: ev.filter((e) => CLIENT_EVENT_TYPES.has(e.type as EventType)).length,
    serverEvents: ev.filter((e) => !CLIENT_EVENT_TYPES.has(e.type as EventType)).length,
    interacted: hits.some((h) => h.interacted === 1) || ev.some((e) => (e.type === "exit" && e.interacted === 1) || INTERACTIVE.has(e.type)),
    converted: ev.some((e) => CONVERTED.has(e.type)),
  };
}

/**
 * Splits one click id's hits and events into visits: by time, a hit or a visit token starting more than 30 minutes after the
 * one before starts a new visit. A token's events all go with the token's first event.
 */
export function visitsOf(clickId: string, hits: ClickHit[], events: ClickEvent[]): ClickVisit[] {
  const tokenStart = new Map<string, number>();
  for (const e of events) if (e.visit_token) tokenStart.set(e.visit_token, Math.min(tokenStart.get(e.visit_token) ?? Infinity, e.ts));
  const anchor = (e: ClickEvent) => (e.visit_token ? tokenStart.get(e.visit_token)! : e.ts);
  const items = [...hits.map((h) => ({ ts: h.ts, hit: h, ev: null as ClickEvent | null })), ...events.map((e) => ({ ts: anchor(e), hit: null as ClickHit | null, ev: e }))]
    .sort((a, b) => a.ts - b.ts || (a.ev?.id ?? 0) - (b.ev?.id ?? 0));
  const groups: { hits: ClickHit[]; events: ClickEvent[] }[] = [];
  let lastTs = -Infinity;
  for (const it of items) {
    if (!groups.length || it.ts - lastTs > CLICK_VISIT_MS) groups.push({ hits: [], events: [] });
    lastTs = Math.max(lastTs, it.ts);
    const g = groups[groups.length - 1];
    if (it.hit) g.hits.push(it.hit); else g.events.push(it.ev!);
  }
  return groups.map((g) => traceOf(clickId, g.hits, g.events.sort((a, b) => a.ts - b.ts || a.id - b.id)));
}

export interface ClickSummary { segment: string; visits: number; jsRan: number; medianEngagedS: number | null; reachedCalc: number }
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export function summarize(visits: ClickVisit[]): ClickSummary[] {
  const seg = (segment: string, vs: ClickVisit[]): ClickSummary => ({
    segment, visits: vs.length, jsRan: vs.filter((v) => v.jsRan).length,
    medianEngagedS: median(vs.filter((v) => v.engagedMs !== null).map((v) => Math.round(v.engagedMs! / 1000))),
    reachedCalc: vs.filter((v) => v.reachedCalc).length,
  });
  return [seg("All", visits), seg("Phone", visits.filter((v) => v.device === "m")), seg("Desktop", visits.filter((v) => v.device === "c")),
    seg("Tablet or unknown", visits.filter((v) => v.device !== "m" && v.device !== "c"))];
}

const EVENT_COLS = `id, ts, type, page, status, tool, check_name, grade, offer, plan, section, offer_variant, result, scroll_pct, engaged_ms, nav, last_event, pv, visit_token, seq,
  utm_campaign, utm_adgroup, utm_term, utm_match, utm_device, hit_id, pv_seq, sent, retry, interacted, is_bot, is_internal`;
const HIT_COLS = `id, ts, path, ${AD_HIT_TAGS.join(", ")}, hit_id, is_bot, bot_reason, is_internal, sec_purpose, datacenter, asn, device_class, browser_family, referrer_host,
  sec_fetch_site, country, rendered_at, boot_at, boot_webdriver, exit_at, dwell_ms, app_ran, interacted`;
/** Events after the range still join a visit that started in it (a purchase days later, an exit), up to this long. */
const LATE_MS = 7 * 86_400_000;

/** Pass #114: the ladder for one segment (paid clicks, exclusions left out): how many reached each rung. */
export interface LadderRow { segment: string; hits: number; laddered: number; reached: number[] }
export interface ClicksData {
  range: ClicksRange; visits: ClickVisit[]; all: number; campaigns: string[]; summary: ClickSummary[];
  /** Pass #114: every paid click in the range (bots, internal and junk ids included) by verdict, and the ladder. */
  verdicts: Record<Verdict, number>; ladder: LadderRow[]; returns: number; bursts: number;
  /** Pass #115: every paid click (a click id's first visit) in range, whatever the toggles (src/lib/reconcile.ts joins Google's clicks to them). */
  paidAll: ClickVisit[];
}

export async function computeClicks(db: D1Database, r: ClicksRange): Promise<ClicksData> {
  const [lo, hi] = rangeBounds(r);
  // Every hit with a click id or a hit id, bots, internal and junk ids included: each gets a verdict; the list follows the toggles.
  // From a day before the range, so a visit that started before it isn't taken for one starting in it (it's dropped below).
  const hits = (await db.prepare(
    `SELECT ${HIT_COLS}, COALESCE(${CLICK_ID_OF()}, 'hit:' || hit_id) AS cid FROM ad_hits WHERE ts >= ? AND ts < ? AND (${CLICK_ID_OF()} IS NOT NULL OR hit_id IS NOT NULL) ORDER BY ts`,
  ).bind(lo - 86_400_000, hi).all<ClickHit & { cid: string }>()).results;
  const events = (await db.prepare(
    `SELECT ${EVENT_COLS}, COALESCE(${CLICK_ID_OF()}, 'hit:' || hit_id) AS cid FROM events WHERE ts >= ? AND ts < ? AND (${CLICK_ID_OF()} IS NOT NULL OR hit_id IS NOT NULL) ORDER BY ts, id`,
  ).bind(lo - 86_400_000, hi + LATE_MS).all<ClickEvent & { cid: string }>()).results;
  // A click id seen before the rows loaded here: every visit of it here is a return (pass #114: a paid click once, ever).
  const from = lo - 86_400_000;
  const seenBefore = new Set((await db.prepare(
    `WITH ids AS (SELECT ${CLICK_ID_OF()} AS cid FROM ad_hits WHERE ts >= ? AND ts < ? UNION SELECT ${CLICK_ID_OF()} FROM events WHERE ts >= ? AND ts < ?)
     SELECT cid FROM ids WHERE cid IS NOT NULL AND (EXISTS (SELECT 1 FROM ad_hits h WHERE ${CLICK_ID_OF("h.")} = ids.cid AND h.ts < ?)
       OR EXISTS (SELECT 1 FROM events e WHERE e.type = 'page_view' AND e.status = 'landing' AND ${CLICK_ID_OF("e.")} = ids.cid AND e.ts < ?))`,
  ).bind(from, hi, from, hi + LATE_MS, from, from).all<{ cid: string }>()).results.map((x) => x.cid));
  const burst = await burstsIn(db, lo, hi);
  const byId = new Map<string, { hits: ClickHit[]; events: ClickEvent[] }>();
  const get = (cid: string) => { let g = byId.get(cid); if (!g) byId.set(cid, (g = { hits: [], events: [] })); return g; };
  for (const h of hits) get(h.cid).hits.push({ ...h, ts: Number(h.ts) });
  for (const e of events) get(e.cid).events.push({ ...e, ts: Number(e.ts) });
  const every = [...byId].flatMap(([cid, g]) => visitsOf(cid, g.hits, g.events).map((v, i) => {
    v.kind = i === 0 && !seenBefore.has(cid) ? "paid" : "return";
    v.facts = factsOf(v, burst.tokens);
    v.verdict = verdictOf(v.facts);
    return v;
  })).filter((v) => v.start >= lo && v.start < hi).sort((a, b) => b.start - a.start);
  const paidClicks = every.filter((v) => v.kind === "paid" && !v.clickId.startsWith("hit:"));
  const verdicts = Object.fromEntries(VERDICTS.map((x) => [x, 0])) as Record<Verdict, number>;
  for (const v of paidClicks) verdicts[v.verdict!]++;
  // The list: well-formed click ids, with the bots and internal toggles as before (a visit is a bot or internal if any row of it is).
  const all = every.filter((v) => !v.clickId.startsWith("hit:") && !v.facts!.junkId
    && (r.includeBots || !(v.facts!.botUa || v.facts!.burst)) && (r.includeInternal || !v.facts!.internal));
  const campaigns = [...new Set(all.map((v) => v.campaign).filter((c): c is string => !!c))].sort();
  const visits = all.filter((v) => (!r.campaign || v.campaign === r.campaign) && (!r.device || v.device === r.device));
  const tagged = every.filter((v) => v.clickId.startsWith("hit:") && (r.includeInternal || !v.facts!.internal) && (r.includeBots || !v.facts!.botUa));
  return {
    range: r, visits, all: all.length, campaigns, summary: summarize(visits.filter((v) => v.kind === "paid")),
    verdicts, ladder: ladderRows(visits.filter((v) => v.kind === "paid"), tagged), returns: visits.filter((v) => v.kind === "return").length, bursts: burst.groups,
    paidAll: paidClicks,
  };
}

/** The ladder for paid clicks (exclusions left out), all and by device and campaign, then utm-tagged landings with no click id. */
export function ladderRows(paid: ClickVisit[], tagged: ClickVisit[] = []): LadderRow[] {
  const row = (segment: string, vs: ClickVisit[]): LadderRow => {
    const real = vs.filter((v) => !EXCLUDED.has(v.verdict!));
    const lad = real.filter((v) => v.facts!.hits.some((h) => h.hitId));
    return { segment, hits: real.length, laddered: lad.length, reached: LADDER.map((_, i) => lad.filter((v) => ladderStep(v.facts!, v.verdict!) >= i).length) };
  };
  const devices = ["mobile", "desktop", "tablet", "unknown"];
  const camps = [...new Set(paid.map((v) => v.campaign ?? "(none)"))].sort();
  return [row("All paid clicks", paid), ...devices.map((d) => row(`Device: ${d}`, paid.filter((v) => v.deviceClass === d))).filter((x) => x.hits),
    ...camps.map((c) => row(`Campaign: ${c}`, paid.filter((v) => (v.campaign ?? "(none)") === c))).filter((x) => x.hits),
    ...(tagged.length ? [row("Tagged links with no click id", tagged)] : [])];
}

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 1000) / 10}% (${a} of ${b})` : "–");
const e = escapeHtml;

function filterForm(d: ClicksData): string {
  const r = d.range;
  const opt = (v: string, label: string, cur: string | null) => `<option value="${e(v)}"${cur === v ? " selected" : ""}>${e(label)}</option>`;
  return `<form method="get" action="/admin/clicks" class="card stack-sm" aria-label="Filters">
  <div class="row"><label class="grow">From <input type="date" name="from" value="${e(r.from)}"></label>
  <label class="grow">To <input type="date" name="to" value="${e(r.to)}"></label></div>
  <div class="row-wrap"><label>Campaign <select name="campaign">${opt("", "All", r.campaign ?? "")}${d.campaigns.map((c) => opt(c, c, r.campaign)).join("")}</select></label>
  <label>Device <select name="device">${opt("", "All", r.device ?? "")}${opt("m", "Phone (m)", r.device)}${opt("c", "Desktop (c)", r.device)}${opt("t", "Tablet (t)", r.device)}</select></label>
  <span class="check-row"><input type="checkbox" id="f-bots" name="bots" value="1"${r.includeBots ? " checked" : ""}><label for="f-bots">Include bots</label></span>
  <span class="check-row"><input type="checkbox" id="f-internal" name="internal" value="1"${r.includeInternal ? " checked" : ""}><label for="f-internal">Include internal</label></span>
  <span class="check-row"><input type="checkbox" id="f-old" name="old" value="1"${r.includeOld ? " checked" : ""}><label for="f-old">Include before 27 Oct</label></span></div>
  <div class="row-wrap"><button class="btn btn-secondary btn-small" type="submit">Show</button></div>
</form>`;
}

/** Pass #114: the first hit's request shape and rungs, under the verdict. */
function hitDetail(v: ClickVisit): string {
  const h = v.hitRows.find((x) => x.hit_id) ?? v.hitRows[0];
  if (!h) return "";
  const at = (t: number | null | undefined) => (t ? `${secs(t - h.ts)}s` : "–");
  const bits = [h.device_class, h.browser_family, h.country, h.asn ? `AS${h.asn}${h.datacenter ? " (cloud)" : ""}` : null, h.referrer_host ? `from ${h.referrer_host}` : null,
    h.sec_fetch_site ? `fetch-site ${h.sec_fetch_site}` : null, h.sec_purpose ? `purpose ${h.sec_purpose}` : null].filter(Boolean);
  const rungs = h.hit_id ? `render ${at(h.rendered_at)}, boot ${at(h.boot_at)}, app ${h.app_ran ? "y" : h.exit_at ? "n" : "?"}, dwell ${h.dwell_ms !== null && h.dwell_ms !== undefined ? `${secs(h.dwell_ms)}s` : "?"}` : "";
  return `<br><small>${e([...bits, rungs].filter(Boolean).join(", "))}</small>`;
}

function eventTable(v: ClickVisit): string {
  const cell = (x: unknown) => `<td>${x === null || x === undefined || x === "" ? "–" : e(String(x))}</td>`;
  const detail = (x: ClickEvent) => [x.tool, x.check_name, x.grade && `grade ${x.grade}`, x.offer, x.plan, x.section, x.offer_variant, x.result,
    x.scroll_pct !== null && `${x.scroll_pct}%`, x.engaged_ms !== null && `engaged ${secs(x.engaged_ms)}s`, x.nav && `nav ${x.nav}`, x.last_event && `last ${x.last_event}`].filter(Boolean).join(", ");
  return `<details><summary>${v.events.length} event${v.events.length === 1 ? "" : "s"}${v.hits ? `, ${v.hits} server hit${v.hits === 1 ? "" : "s"}` : ""}</summary>
<table><thead><tr><th>+s</th><th>Event</th><th>Page</th><th>Status</th><th>Detail</th><th>Tab (visit token)</th></tr></thead><tbody>${
  v.events.map((x) => `<tr>${cell(secs(x.ts - v.start))}${cell(x.type)}${cell(x.page)}${cell(x.status)}${cell(detail(x))}${cell(x.visit_token?.slice(0, 8))}</tr>`).join("") || '<tr><td colspan="6">No events: the page never ran its script.</td></tr>'
}</tbody></table></details>`;
}

/** Pass #115: Google's side, from src/lib/reconcile.ts: a summary above the ladder, and each click's billed y/n and est. cost. */
export interface AdsView { top: string; cell: (clickId: string) => string }

export function renderClicks(d: ClicksData, ads: AdsView | null = null): string {
  const row = (v: ClickVisit) => `<tr>
<td>${e(etTime(v.start))}</td>
<td>${e([v.campaign ?? "–", v.adgroup ?? "–", v.term ?? "–", v.match ?? "–", v.device ? `${v.device} (${DEVICES[v.device] ?? "?"})` : "–"].join(" / "))}</td>
<td>${e(v.landing ?? "–")}${v.landings > 1 ? `<br><small>${v.landings} landings, one visit</small>` : ""}</td>
<td>${v.kind === "return" ? "<b>return_via_ad_url</b><br><small>not a new paid click</small>" : v.verdict ? `<b>${e(v.verdict)}</b><br><small>${e(VERDICT_LABELS[v.verdict])}</small>` : "–"}${hitDetail(v)}</td>
${ads ? `<td>${v.kind === "paid" ? ads.cell(v.clickId) : "–"}</td>` : ""}<td>${v.hits ? "y" : "n"}</td><td>${v.jsRan ? "y" : "n"}</td>
<td class="pre-wrap">${v.timeline.map((s) => `${s.t}s ${e(s.label)}`).join("<br>") || "–"}</td>
<td>${v.engagedMs === null ? "–" : `${secs(v.engagedMs)}s`}</td><td>${v.maxScroll === null ? "–" : `${v.maxScroll}%`}</td>
<td>${v.exit ? `${v.exit.t}s, ${e(v.exit.kind)}${v.exit.last ? `<br><small>last: ${e(v.exit.last)}</small>` : ""}` : "–"}</td>
<td>${v.loss.sent ? `${v.loss.lost} of ${v.loss.sent}` : "–"}</td>
<td>${eventTable(v)}</td></tr>`;
  const sum = d.summary.map((s) => `<tr><th scope="row">${e(s.segment)}</th><td>${s.visits}</td><td>${pct(s.jsRan, s.visits)}</td><td>${s.medianEngagedS === null ? "–" : `${s.medianEngagedS}s`}</td><td>${pct(s.reachedCalc, s.visits)}</td></tr>`).join("");
  return `<div class="admin-stats stack">
<h1>Paid clicks</h1>
<p class="muted">${e(windowLabel(d.range))}. One row per click visit: a well-formed Google click id (gclid, gbraid or wbraid) with its reloads and repeat landings. ${e(CLICK_VISIT_NOTE)} Verdict (pass #114): how far the click got, below. Events lost: what the page views tried to send against what arrived (page views with an exit only). Server hit: the Worker logged the page request (ad_hits). JS ran: the page's script sent at least one event. Times are seconds since the click landed. Engaged: time the tab was visible, summed over the visit's page views; exit: the last page view's exit (internal = a link to another page here, away = closed, back or typed address, reload = reloaded, hidden = the tab or app was switched and never came back). Bots ${d.range.includeBots ? "included" : "left out"}, internal and test traffic ${d.range.includeInternal ? "included" : "left out"}. <a href="/admin/stats">/admin/stats</a></p>
${filterForm(d)}
${ads?.top ?? ""}
<h2>Ladder: how far each paid click got${d.range.campaign || d.range.device ? " (filtered)" : ""}</h2>
<div class="table-wrap"><table><thead><tr><th></th><th>Paid hits</th><th>Since the ladder</th>${LADDER.map((k) => `<th>${e(k[0].toUpperCase() + k.slice(1))}</th>`).join("")}</tr></thead><tbody>${
  d.ladder.map((l) => `<tr><th scope="row">${e(l.segment)}</th><td>${l.hits}</td><td>${l.laddered}</td>${l.reached.map((n) => `<td>${pct(n, l.laddered)}</td>`).join("")}</tr>`).join("")
}</tbody></table></div>
<p class="small muted">Paid hits: paid clicks in the list below (a click id's first visit; return visits, bots, bursts, junk ids and internal traffic left out, following the toggles). Since the ladder: the ones logged since pass #114, which carry a hit id; the steps are shares of those. Rendered: the page's HTML was parsed by a browser (its no-JS pixel was fetched). Boot: the inline head script ran. App: app.js finished (its exit beacon or any event). Interacted: a press, touch, key or wheel, or an event only a person makes. Converted: ran a calculator (calc_run). Each step counts the visits that got at least that far. Device: from the request (Sec-CH-UA-Mobile or the browser name), else the suffix's {device}. ${d.bursts ? `Bursts in range: ${d.bursts}.` : ""}</p>
<h2>Verdicts: every paid click in range, nothing left out</h2>
<div class="table-wrap"><table><thead><tr><th>Verdict</th><th>Paid clicks</th><th>What it means</th></tr></thead><tbody>${
  VERDICTS.filter((x) => d.verdicts[x]).map((x) => `<tr><th scope="row">${e(x)}</th><td>${d.verdicts[x]}</td><td>${e(VERDICT_LABELS[x])}</td></tr>`).join("") || '<tr><td colspan="3">No paid clicks in this range.</td></tr>'
}</tbody></table></div>
<p class="small muted">One verdict per click id's first visit, the first that matches in this order: ${VERDICTS.map(e).join(" · ")}. Bots, junk ids and internal traffic are counted here whatever the toggles say. ${e(RETURN_VISIT_NOTE)} Return visits in the list: ${d.returns}.</p>
<h2>Summary${d.range.campaign || d.range.device ? " (filtered)" : ""}</h2>
<div class="table-wrap"><table><thead><tr><th></th><th>Paid visits</th><th>JS ran</th><th>Median engaged time</th><th>Ran a calculator</th></tr></thead><tbody>${sum}</tbody></table></div>
<p class="small muted">Median engaged time: over visits with an exit beacon. Ran a calculator: at least one calc_run, of all paid visits in the row. Device is the Final URL suffix's {device}: m phone, c desktop, t tablet.</p>
<h2>Clicks, newest first (${d.visits.length}${d.visits.length !== d.all ? ` of ${d.all}` : ""})</h2>
<div class="table-wrap"><table><thead><tr><th>Time (ET)</th><th>Campaign / ad group / keyword / match / device</th><th>Landing page</th><th>Verdict</th>${ads ? "<th>Billed (Google)</th>" : ""}<th>Server hit</th><th>JS ran</th><th>Timeline (s since landing)</th><th>Engaged</th><th>Max scroll</th><th>Exit</th><th>Events lost</th><th>Raw events</th></tr></thead><tbody>${
  d.visits.map(row).join("") || `<tr><td colspan="${ads ? 13 : 12}">No paid clicks in this range.</td></tr>`
}</tbody></table></div></div>`;
}
