// /admin/stats numbers. Ported from dnsmailcheck's src/lib/stats.ts: the same range rules (ET days, ?from/&to or ?days,
// bots and internal left out unless ticked, a visit judged as a whole by visitFlagsSql), the same visitor, page-view, source,
// paid-click (deduped per click id) and stickiness queries. dnsmailcheck's check, offer, capture and purchase funnels are
// not ported (STRIP in docs/dnsmailcheck-setup.md). New here: the Phase 4 block (docs/plan.md) and the calculator table.
// No visitor IDs: see src/lib/events.ts for how visitors are counted.

import { escapeHtml } from "./http";
import { addDays, etDay, etDaySql, etStart, ptDay } from "./etday";
import { AD_HIT_ID, CLICK_ID_MIN, wellFormedClickIdSql } from "./adhits";
import { dataQualityLine, type DataQuality } from "./hitverdict";
import { CLICK_ID_OF, CLICK_VISIT_MS, CLICK_VISIT_NOTE, earlierHitSql, earlierLandingSql, RETURN_VISIT_NOTE, visitFlagsSql } from "./clickvisits";
import { TRAFFIC_SOURCES } from "./events";

export interface StatsRange { from: string; to: string; includeBots: boolean; includeInternal: boolean; includeOld?: boolean }

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** [start, end) of the ET days from..to, in unix ms. (dnsmailcheck also clamps to a "clean start"; this site has none.) */
export const rangeBounds = (r: StatsRange): [number, number] => [etStart(r.from), etStart(addDays(r.to, 1))];

/** The last `days` ET days, today included. */
export function rangeOfDays(days: number, now = Date.now()): StatsRange {
  const n = Math.max(1, Math.min(800, Math.floor(days) || 30));
  const to = etDay(now);
  return { from: addDays(to, -(n - 1)), to, includeBots: false, includeInternal: false };
}

/** ?from=&to= (YYYY-MM-DD, ET), else ?days= (default 30); ?bots=1 and ?internal=1 include those events. */
export function statsRange(p: URLSearchParams, now = Date.now()): StatsRange {
  const r = rangeOfDays(Number(p.get("days")) || 30, now);
  const from = p.get("from") ?? "";
  const to = p.get("to") ?? "";
  if (DAY_RE.test(from)) r.from = from;
  if (DAY_RE.test(to)) r.to = to;
  if (r.from > r.to) [r.from, r.to] = [r.to, r.from];
  return { ...r, includeBots: p.get("bots") === "1", includeInternal: p.get("internal") === "1" };
}

export const windowLabel = (r: StatsRange): string => `${r.from} (ET) to ${r.to} (ET)`;

const CLICK_ID = "(gclid IS NOT NULL OR gbraid IS NOT NULL OR wbraid IS NOT NULL)";
const WELL_FORMED = wellFormedClickIdSql(AD_HIT_ID);
export const SOURCES = [...TRAFFIC_SOURCES, "unknown"] as const;

/** Stickiness pass line carried over from dnsmailcheck (Colin, 21 Oct): 3%+ of ad visitors come back direct within 14 days. */
export const STICKY_TARGET = 3;
/** Phase 4 (docs/plan.md): pass at 15%+ of visitors returning without ads within 14 days; fail under 5%. */
export const PHASE4_PASS = 15;
export const PHASE4_FAIL = 5;
export const RETURN_DAYS = 14;

export const DAY_COLUMNS = ["visitors", "page_views", "visits", "paid_clicks", "paid_returns", "ad_hits", "calc_runs", "calc_visits",
  "formula_views", "chart_views", "copies", "return_visits", "return_direct", "landing_404"] as const;
export type DayColumn = (typeof DAY_COLUMNS)[number];
export type Counts = Record<DayColumn, number>;
const LABELS: Record<DayColumn, string> = {
  visitors: "Unique visitors", page_views: "Page views", visits: "Visits", paid_clicks: "Paid clicks (script, first landing per click id)",
  paid_returns: "Return visits via ad URL", ad_hits: "Paid clicks that reached the server", calc_runs: "Calc runs", calc_visits: "Visits with a calc run",
  formula_views: "Formula views", chart_views: "Chart views", copies: "Results copied", return_visits: "Return visits", return_direct: "Return direct",
  landing_404: "Tagged landings on a 404",
};
const zero = (): Counts => Object.fromEntries(DAY_COLUMNS.map((c) => [c, 0])) as Counts;

export interface Rate { num: number; den: number; pct: number | null }
const pctOf = (num: number, den: number): number | null => (den ? Math.round((num / den) * 1000) / 10 : null);
const rate = (num: number, den: number): Rate => ({ num, den, pct: pctOf(num, den) });

export interface Phase4 {
  costMicros: number; googleClicks: number; adsImported: boolean; adsDaysRunning: number; adsDaysPaused: number;
  costPerVisit: number | null; costPerGoogleClick: number | null;
  visitors: number; visits: number; paidVisits: number;
  /** First visits whose 14 days are over (the cohort) and how many came back within 14 days. */
  cohortFrom: string; cohortTo: string | null; cohort: number; open: number;
  returned: Rate; returnedNoAds: Rate; returnedNoAdsPaused: Rate; returnedNoAdsRunning: Rate; returnedUnknownAds: number;
  /** dnsmailcheck's stickiness: ad-first visitors who came back direct within 14 days. */
  sticky: Rate; stickyGclid: Rate;
  calcRuns: number; calcRunsPerVisitor: number | null; calcRunsPerVisit: number | null; visitsWithCalc: Rate;
  verdict: "pass" | "fail" | "in between" | "too early";
}

export interface CalcRow { tool: string; runs: number; visits: number; formulaViews: number; chartViews: number; copies: number }
export interface Stats {
  range: StatsRange;
  traffic: { events: number; bots: number; internal: number; botReasons: { reason: string; count: number }[] };
  daily: (Counts & { day: string })[];
  totals: Counts;
  bySource: (Counts & { source: string })[];
  rejectedIds: number;
  calcs: CalcRow[];
  phase4: Phase4;
}

export async function computeStats(db: D1Database, range: StatsRange | number = 30, now = Date.now()): Promise<Stats> {
  const r = typeof range === "number" ? rangeOfDays(range, now) : range;
  const B = rangeBounds(r);
  const FLG = (alias = "") => visitFlagsSql(alias, r);
  const F = (alias = "") => `${alias}ts >= ? AND ${alias}ts < ?${FLG(alias)}`;
  const HFLG = (alias = "") => `${r.includeBots ? "" : ` AND ${alias}is_bot = 0`}${r.includeInternal ? "" : ` AND ${alias}is_internal = 0`}`;
  const D = (alias = "") => etDaySql(`${alias}ts`, B[0], B[1]);
  const SRC = "COALESCE(source, 'unknown')";
  const LANDING = "type = 'page_view' AND status = 'landing'";

  const select = `
    SUM(type = 'page_view' AND new_today = 1) AS visitors,
    SUM(type = 'page_view') AS page_views,
    SUM(${LANDING} AND NOT (${CLICK_ID} AND ${repeatLandingSqlInline(FLG)})) AS visits,
    SUM(${LANDING} AND ${CLICK_ID} AND NOT ${earlierLandingSql("events.", FLG)}) AS paid_clicks,
    SUM(${LANDING} AND ${CLICK_ID} AND NOT ${repeatLandingSqlInline(FLG)} AND ${earlierLandingSql("events.", FLG)}) AS paid_returns,
    SUM(type = 'calc_run') AS calc_runs,
    SUM(type = 'calc_run' AND first_in_visit = 1) AS calc_visits,
    SUM(type = 'formula_view') AS formula_views,
    SUM(type = 'chart_view') AS chart_views,
    SUM(type = 'copy_result') AS copies,
    SUM(type = 'return_visit') AS return_visits,
    SUM(type = 'return_visit' AND referrer_empty = 1) AS return_direct,
    SUM(type = 'landing_404') AS landing_404`;
  const rows = (await db.prepare(`SELECT ${D()} AS day, ${SRC} AS src, ${select} FROM events WHERE ${F()} GROUP BY 1, 2`).bind(...B).all<Record<string, number | string>>()).results;

  const byDay = new Map<string, Counts & { day: string }>();
  const bySrc = new Map<string, Counts & { source: string }>(SOURCES.map((x) => [x, { ...zero(), source: x }]));
  const totals = zero();
  for (const row of rows) {
    const day = String(row.day);
    const src = String(row.src);
    if (!byDay.has(day)) byDay.set(day, { ...zero(), day });
    if (!bySrc.has(src)) bySrc.set(src, { ...zero(), source: src });
    for (const c of DAY_COLUMNS) {
      if (c === "ad_hits") continue;
      const n = Number(row[c] ?? 0);
      byDay.get(day)![c] += n;
      bySrc.get(src)![c] += n;
      totals[c] += n;
    }
  }

  // The Worker's log of paid clicks (ad_hits), first request per well-formed click id, filtered row by row as dnsmailcheck does.
  const HF = `ts >= ? AND ts < ?${HFLG()}`;
  const hitRows = (await db.prepare(
    `SELECT ${D()} AS day, SUM(${WELL_FORMED} AND NOT ${earlierHitSql("ad_hits.", HFLG)}) AS hits, SUM(NOT ${WELL_FORMED}) AS rejected
     FROM ad_hits WHERE ${HF} AND ${AD_HIT_ID} IS NOT NULL GROUP BY 1`,
  ).bind(...B).all<{ day: string; hits: number; rejected: number }>()).results;
  let rejectedIds = 0;
  for (const h of hitRows) {
    if (!byDay.has(h.day)) byDay.set(h.day, { ...zero(), day: h.day });
    byDay.get(h.day)!.ad_hits += Number(h.hits ?? 0);
    totals.ad_hits += Number(h.hits ?? 0);
    rejectedIds += Number(h.rejected ?? 0);
  }

  const t = await db.prepare("SELECT COUNT(*) AS n, SUM(is_bot = 1) AS bots, SUM(is_internal = 1) AS internal FROM events WHERE ts >= ? AND ts < ?")
    .bind(...B).first<{ n: number; bots: number | null; internal: number | null }>();
  const reasons = (await db.prepare("SELECT COALESCE(bot_reason, '?') AS reason, COUNT(*) AS n FROM events WHERE is_bot = 1 AND ts >= ? AND ts < ? GROUP BY 1 ORDER BY n DESC")
    .bind(...B).all<{ reason: string; n: number }>()).results;

  const calcs = (await db.prepare(
    `SELECT tool, SUM(type = 'calc_run') AS runs, SUM(type = 'calc_run' AND first_in_visit = 1) AS visits, SUM(type = 'formula_view') AS fv,
       SUM(type = 'chart_view') AS cv, SUM(type = 'copy_result') AS cp
     FROM events WHERE type IN ('calc_run', 'formula_view', 'chart_view', 'copy_result') AND tool IS NOT NULL AND ${F()} GROUP BY tool ORDER BY runs DESC`,
  ).bind(...B).all<{ tool: string; runs: number; visits: number; fv: number; cv: number; cp: number }>()).results
    .map((x) => ({ tool: x.tool, runs: Number(x.runs), visits: Number(x.visits), formulaViews: Number(x.fv), chartViews: Number(x.cv), copies: Number(x.cp) }));

  return {
    range: r,
    traffic: { events: Number(t?.n ?? 0), bots: Number(t?.bots ?? 0), internal: Number(t?.internal ?? 0), botReasons: reasons.map((x) => ({ reason: x.reason, count: Number(x.n) })) },
    daily: [...byDay.values()].sort((a, b) => (a.day < b.day ? 1 : -1)),
    totals,
    bySource: SOURCES.map((x) => bySrc.get(x)!).concat([...bySrc.values()].filter((v) => !(SOURCES as readonly string[]).includes(v.source))),
    rejectedIds,
    calcs,
    phase4: await computePhase4(db, r, totals, FLG, now),
  };
}

/** dnsmailcheck's repeatLandingSql, bound to the events table's own row. */
const repeatLandingSqlInline = (FLG: (a: string) => string) =>
  `EXISTS (SELECT 1 FROM events rl WHERE rl.type = 'page_view' AND rl.status = 'landing' AND rl.ts < events.ts AND rl.ts >= events.ts - ${CLICK_VISIT_MS}
    AND ${CLICK_ID_OF("rl.")} = ${CLICK_ID_OF("events.")}${FLG("rl.")})`;

/**
 * The Phase 4 numbers (docs/plan.md): cost per visit, visits, returning visitors within 14 days (without ads; split by whether
 * ads were running on the day of the return), and calc runs per visitor.
 *  - Cohort: first visits (landing page view with visit_count 1 from the ec cookie) whose 14 days are over.
 *  - Returned: that browser's first return (return_visit with visit_count 2) came within 14 days (ret_days <= 14).
 *  - Without ads: the return didn't arrive on a tagged or ad link (its source isn't gclid or utm).
 *  - Ads running on a day: Google's campaign report (ads_campaigns_daily, from the Ads Script) shows clicks or cost that Pacific
 *    day for a non-test campaign. Before the first import there is no way to tell: those returns count as "unknown".
 */
async function computePhase4(db: D1Database, r: StatsRange, totals: Counts, FLG: (a?: string) => string, now: number): Promise<Phase4> {
  const matured = addDays(etDay(now), -RETURN_DAYS);
  const cohortTo = r.to < matured ? r.to : matured;
  const openFrom = r.from > matured ? r.from : addDays(matured, 1);
  const flags = FLG("");
  const countIn = async (where: string, from: string, to: string) => from <= to
    ? Number((await db.prepare(`SELECT COUNT(*) AS n FROM events WHERE ${where}${flags} AND ts >= ? AND ts < ?`).bind(...rangeBounds({ ...r, from, to })).first<{ n: number }>())?.n ?? 0) : 0;

  const FIRST = "type = 'page_view' AND status = 'landing' AND visit_count = 1";
  const cohort = await countIn(FIRST, r.from, cohortTo);
  const open = await countIn(FIRST, openFrom, r.to);
  const returns = r.from <= cohortTo ? (await db.prepare(
    `SELECT ts, source FROM events WHERE type = 'return_visit' AND visit_count = 2 AND ret_days IS NOT NULL AND ret_days <= ${RETURN_DAYS} AND first_day BETWEEN ? AND ?${flags}`,
  ).bind(r.from, cohortTo).all<{ ts: number; source: string | null }>()).results : [];

  // Ads state per Pacific day, from Google's own report.
  const hi = rangeBounds({ ...r, to: addDays(r.to, RETURN_DAYS) })[1];
  const camp = (await db.prepare(
    "SELECT date, SUM(clicks) AS clicks, SUM(cost_micros) AS cost FROM ads_campaigns_daily WHERE is_internal = 0 AND date >= ? AND date <= ? GROUP BY date",
  ).bind(ptDay(rangeBounds(r)[0]), ptDay(hi)).all<{ date: string; clicks: number; cost: number }>()).results;
  const ingests = await db.prepare("SELECT MIN(at) AS first FROM ads_ingests WHERE is_internal = 0").first<{ first: number | null }>();
  const imported = ingests?.first !== null && ingests?.first !== undefined;
  const running = new Set(camp.filter((c) => Number(c.clicks) > 0 || Number(c.cost) > 0).map((c) => c.date));
  const inRange = camp.filter((c) => c.date >= ptDay(rangeBounds(r)[0]) && c.date <= ptDay(rangeBounds(r)[1] - 1));
  const costMicros = inRange.reduce((n, c) => n + Number(c.cost), 0);
  const googleClicks = inRange.reduce((n, c) => n + Number(c.clicks), 0);

  const noAds = returns.filter((x) => x.source !== "gclid" && x.source !== "utm");
  const known = (x: { ts: number }) => imported && x.ts >= Number(ingests!.first) - 86_400_000;
  const paused = noAds.filter((x) => known(x) && !running.has(ptDay(x.ts)));
  const runningReturns = noAds.filter((x) => known(x) && running.has(ptDay(x.ts)));

  // dnsmailcheck's stickiness, unchanged: returns flagged sticky by the browser over ad-first cohorts.
  const sticky = async (adFirst: string, statuses: string[]) => {
    const den = await countIn(`${FIRST} AND ${adFirst}`, r.from, cohortTo);
    const num = r.from <= cohortTo ? Number((await db.prepare(
      `SELECT COUNT(*) AS n FROM events WHERE type = 'return_visit' AND status IN (${statuses.map((x) => `'${x}'`).join(", ")}) AND first_day BETWEEN ? AND ?${flags}`,
    ).bind(r.from, cohortTo).first<{ n: number }>())?.n ?? 0) : 0;
    return rate(num, den);
  };

  const returnedNoAds = rate(noAds.length, cohort);
  const verdict: Phase4["verdict"] = cohort < 20 ? "too early" : returnedNoAds.pct! >= PHASE4_PASS ? "pass" : returnedNoAds.pct! < PHASE4_FAIL ? "fail" : "in between";
  const visitors = totals.visitors;
  return {
    costMicros, googleClicks, adsImported: imported, adsDaysRunning: inRange.filter((c) => running.has(c.date)).length,
    adsDaysPaused: imported ? Math.max(0, daysBetween(r) - inRange.filter((c) => running.has(c.date)).length) : 0,
    costPerVisit: totals.paid_clicks ? Math.round(costMicros / totals.paid_clicks) : null,
    costPerGoogleClick: googleClicks ? Math.round(costMicros / googleClicks) : null,
    visitors, visits: totals.visits, paidVisits: totals.paid_clicks,
    cohortFrom: r.from, cohortTo: r.from <= cohortTo ? cohortTo : null, cohort, open,
    returned: rate(returns.length, cohort), returnedNoAds,
    returnedNoAdsPaused: rate(paused.length, cohort), returnedNoAdsRunning: rate(runningReturns.length, cohort),
    returnedUnknownAds: noAds.length - paused.length - runningReturns.length,
    sticky: await sticky("(gclid IS NOT NULL OR utm_source IS NOT NULL)", ["sticky", "sticky_gclid"]),
    stickyGclid: await sticky("gclid IS NOT NULL", ["sticky_gclid"]),
    calcRuns: totals.calc_runs,
    calcRunsPerVisitor: visitors ? Math.round((totals.calc_runs / visitors) * 100) / 100 : null,
    calcRunsPerVisit: totals.visits ? Math.round((totals.calc_runs / totals.visits) * 100) / 100 : null,
    visitsWithCalc: rate(totals.calc_visits, totals.visits),
    verdict,
  };
}

const daysBetween = (r: StatsRange) => Math.round((Date.parse(`${r.to}T00:00:00Z`) - Date.parse(`${r.from}T00:00:00Z`)) / 86_400_000) + 1;

// ---------- rendering ----------

const e = escapeHtml;
const usd = (micros: number | null) => (micros === null ? "–" : `$${(micros / 1_000_000).toFixed(2)}`);
const pctCell = (p: number | null) => (p === null ? "–" : `${p}%`);
const rateCell = (x: Rate) => `${x.num} of ${x.den} = ${pctCell(x.pct)}`;

function rangeForm(r: StatsRange): string {
  const q = (days: number) => `/admin/stats?days=${days}${r.includeBots ? "&bots=1" : ""}${r.includeInternal ? "&internal=1" : ""}`;
  return `<form class="stats-range" method="get" action="/admin/stats">
<label>From <input type="date" name="from" value="${e(r.from)}"></label> <label>To <input type="date" name="to" value="${e(r.to)}"></label>
<label><input type="checkbox" name="bots" value="1"${r.includeBots ? " checked" : ""}> Include bots</label>
<label><input type="checkbox" name="internal" value="1"${r.includeInternal ? " checked" : ""}> Include internal</label>
<button class="btn btn-secondary btn-small" type="submit">Show</button>
<span class="small">Quick: <a href="${q(1)}">today</a> · <a href="${q(7)}">7 days</a> · <a href="${q(30)}">30 days</a> · <a href="${q(90)}">90 days</a></span></form>`;
}

const table = (head: string[], rows: string[], empty = "No events yet.") =>
  `<div class="table-wrap"><table><thead><tr>${head.map((h) => `<th>${e(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="${head.length}">${e(empty)}</td></tr>`}</tbody></table></div>`;

export interface RenderOpts { internal?: boolean; cfBotSignal?: boolean; dataQuality?: DataQuality }

export function renderStats(s: Stats, opts: RenderOpts = {}): string {
  const p = s.phase4;
  const t = s.traffic;
  const VERDICT: Record<Phase4["verdict"], string> = {
    pass: `PASS: ${pctCell(p.returnedNoAds.pct)} returned without ads (pass line ${PHASE4_PASS}%)`,
    fail: `FAIL: ${pctCell(p.returnedNoAds.pct)} returned without ads (fail line under ${PHASE4_FAIL}%)`,
    "in between": `IN BETWEEN: ${pctCell(p.returnedNoAds.pct)} returned without ads (pass ${PHASE4_PASS}%, fail under ${PHASE4_FAIL}%)`,
    "too early": `TOO EARLY: ${p.cohort} first visits have had their 14 days (needs 20+)`,
  };
  const dayCols = DAY_COLUMNS;
  return `<div class="admin-stats stack">
<h1>Stats</h1>
${rangeForm(s.range)}
<p class="muted">${e(windowLabel(s.range))}, days in ET (America/New_York). ${t.events} events in range: ${t.bots} from bots (${s.range.includeBots ? "included" : "left out"}${t.botReasons.length ? `; ${t.botReasons.map((b) => `${e(b.reason)} ${b.count}`).join(", ")}` : ""}), ${t.internal} internal (${s.range.includeInternal ? "included" : "left out"}).
This browser is ${opts.internal ? "marked internal" : "<b>not</b> marked internal"}: <a href="/admin/internal">change</a>. Cloudflare verified-bot signal: ${opts.cfBotSignal ? "available" : "not available on this plan (user-agent rules only)"}. Per paid click: <a href="/admin/clicks">/admin/clicks</a>.</p>
${opts.dataQuality ? `<p class="small">${e(dataQualityLine(opts.dataQuality))}</p>` : ""}
<section class="card stack-sm" id="phase4">
  <h2>Phase 4 test</h2>
  <p><b>${e(VERDICT[p.verdict])}</b></p>
  ${table(["Number", "Value", "How it's counted"], [
    `<tr><th scope="row">Cost per visit</th><td>${usd(p.costPerVisit)}</td><td>Google Ads cost in range ${usd(p.costMicros)} ÷ paid visits ${p.paidVisits} (first landing per click id). Per Google click: ${usd(p.costPerGoogleClick)} (${p.googleClicks} clicks).${p.adsImported ? "" : " <b>No Google Ads import yet</b>: cost reads $0 until the Ads Script runs."}</td></tr>`,
    `<tr><th scope="row">Visits</th><td>${p.visits}</td><td>Landing page views (one per visit; a reload or repeat landing of the same click id within 30 minutes isn't a new one). Unique visitors (first page view of the ET day): ${p.visitors}. Paid: ${p.paidVisits}.</td></tr>`,
    `<tr><th scope="row">Returned within 14 days</th><td>${rateCell(p.returned)}</td><td>First visits ${p.cohortTo ? `${e(p.cohortFrom)} to ${e(p.cohortTo)}` : "(none old enough yet)"} whose 14 days are over; returned = that browser's first return came within 14 days. ${p.open} newer first visits still open.</td></tr>`,
    `<tr><th scope="row">… without ads</th><td>${rateCell(p.returnedNoAds)}</td><td>The return didn't come through an ad or tagged link (source not gclid or utm). <b>This is the Phase 4 number.</b></td></tr>`,
    `<tr><th scope="row">… without ads, ads paused that day</th><td>${rateCell(p.returnedNoAdsPaused)}</td><td>Google's report shows no clicks and no cost that Pacific day. Days in range: ${p.adsDaysRunning} running, ${p.adsDaysPaused} paused.</td></tr>`,
    `<tr><th scope="row">… without ads, ads running that day</th><td>${rateCell(p.returnedNoAdsRunning)}</td><td>${p.returnedUnknownAds ? `${p.returnedUnknownAds} returns came before the first Google Ads import (ads state unknown).` : "&nbsp;"}</td></tr>`,
    `<tr><th scope="row">Calc runs per visitor</th><td>${p.calcRunsPerVisitor ?? "–"}</td><td>${p.calcRuns} calc runs ÷ ${p.visitors} unique visitors. Per visit: ${p.calcRunsPerVisit ?? "–"}. Visits with a calc run: ${rateCell(p.visitsWithCalc)}.</td></tr>`,
    `<tr><th scope="row">Stickiness (dnsmailcheck rule)</th><td>${rateCell(p.sticky)}</td><td>Ad-first visitors (gclid or utm) who came back direct (no referrer, no tags) within 14 days. Google Ads only: ${rateCell(p.stickyGclid)}. dnsmailcheck's pass line: ${STICKY_TARGET}%.</td></tr>`,
  ])}
  <p class="small muted">Rule written before launch (docs/plan.md): pass at ${PHASE4_PASS}%+ of visitors returning without ads within 14 days (and cost per completed survey ≤ $2, once the survey exists); fail under ${PHASE4_FAIL}%. Pause the ads for a week and watch the "ads paused" line.</p>
</section>
<section class="card stack-sm">
  <h2>Calculators</h2>
  ${table(["Calculator", "Calc runs", "Visits with a run", "Formula views", "Chart views", "Results copied"],
    s.calcs.map((c) => `<tr><th scope="row">${e(c.tool)}</th><td>${c.runs}</td><td>${c.visits}</td><td>${c.formulaViews}</td><td>${c.chartViews}</td><td>${c.copies}</td></tr>`))}
  <p class="small muted">calc_run: inputs settled for 1.5 s with a valid result (once per distinct set of inputs per page view). formula_view and chart_view: half on screen for a second, once per block per page view.</p>
</section>
<section class="stack-sm">
  <h2>By source</h2>
  ${table(["Source", ...dayCols.map((c) => LABELS[c])], s.bySource.filter((x) => dayCols.some((c) => x[c])).map((x) => `<tr><th scope="row">${e(x.source)}</th>${dayCols.map((c) => `<td>${x[c]}</td>`).join("")}</tr>`))}
</section>
<section class="stack-sm">
  <h2>Per day</h2>
  ${table(["Day (ET)", ...dayCols.map((c) => LABELS[c])], [
    `<tr><th scope="row">Total</th>${dayCols.map((c) => `<td><b>${s.totals[c]}</b></td>`).join("")}</tr>`,
    ...s.daily.map((d) => `<tr><th scope="row">${e(d.day)}</th>${dayCols.map((c) => `<td>${d[c]}</td>`).join("")}</tr>`)])}
  <p class="small muted">${e(CLICK_VISIT_NOTE)} ${e(RETURN_VISIT_NOTE)} Rejected click ids (not a Google click id: all digits, shorter than ${CLICK_ID_MIN} characters, or other characters): ${s.rejectedIds}.</p>
</section>
</div>`;
}
