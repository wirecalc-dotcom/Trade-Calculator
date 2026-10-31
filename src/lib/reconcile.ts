// Pass #115: Google's clicks against ours. Per click id, ads_clicks (what Google billed, from the Ads Script: src/lib/adsingest.ts)
// joins ad_hits (what reached the site, with its pass #114 verdict) on the gclid. Buckets:
//   billed_arrived      billed and reached the site: the visit's verdict says how far it got
//   billed_not_arrived  billed, never reached the site (no ad_hits row at all for that gclid)
//   arrived_not_billed  reached the site, not in Google's click report: not yet reported (its Pacific day hasn't been imported, or
//                       it's under 3 hours old) or likely filtered as invalid by Google
//   braid               arrived with gbraid or wbraid only: click_view gives gclids, so these can't match (by design)
// Google's own click count per day (campaigns) can exceed its click_view rows: "clicks without gclid".
// Estimated cost of one click = its keyword's cost / clicks that Pacific day (else its ad group's, else its campaign's), "est.".
// Roll-ups per keyword and per campaign per day put cost beside what the visits did. Dates on Google's side are Pacific.

import { computeClicks, type ClickVisit, type ClicksRange } from "./clicks";
import { addDays, etTime, ptDay } from "./etday";
import { escapeHtml as e } from "./http";
import { LADDER, lossOf, type AdsHealth, type DataQuality, type Verdict } from "./hitverdict";
import { rangeBounds, type StatsRange } from "./stats";

export const BUCKETS = ["billed_arrived", "billed_not_arrived", "arrived_not_billed", "braid"] as const;
export type Bucket = (typeof BUCKETS)[number];
export const BUCKET_LABELS: Record<Bucket, string> = {
  billed_arrived: "billed and arrived",
  billed_not_arrived: "billed, never arrived",
  arrived_not_billed: "arrived, not billed (not yet reported, or filtered by Google)",
  braid: "arrived with gbraid/wbraid only (Google's click report has gclids: unmatched by design)",
};
/** An arrival this young may simply not be in Google's report yet. */
export const REPORT_LAG_MS = 3 * 3_600_000;

export interface AdsClickRow { gclid: string; date: string; campaign_id: string | null; campaign_name: string | null; ad_group_id: string | null; ad_group_name: string | null;
  keyword_text: string | null; keyword_match_type: string | null; device: string | null; is_internal: number }
export interface KeywordDay { date: string; ad_group_id: string; keyword_id: string; campaign_id: string | null; keyword_text: string | null; match_type: string | null; clicks: number; cost_micros: number; is_internal: number }
export interface CampaignDay { date: string; campaign_id: string; campaign_name: string | null; status: string | null; clicks: number; cost_micros: number; invalid_clicks: number; is_internal: number }

export interface ReconRow {
  clickId: string; bucket: Bucket; internal: boolean;
  ads: AdsClickRow | null; visit: ClickVisit | null; verdict: Verdict | null;
  estCostMicros: number | null; estFrom: "keyword" | "ad_group" | "campaign" | null;
  /** arrived_not_billed: ms since it arrived, and why it may be missing. */
  ageMs: number | null; why: "not_yet_reported" | "likely_filtered" | null;
}
export interface RollRow {
  date: string; key: string; label: string; costMicros: number; billed: number; arrived: number; appRan: number; interacted: number; checks: number; offerViews: number; offerClicks: number;
}
export interface Recon {
  ptDays: string[]; rows: ReconRow[]; counts: Record<Bucket, number>;
  /** Per Pacific day: Google's click count (campaigns) and its click_view rows, where they differ. */
  noGclid: { date: string; campaignClicks: number; gclidRows: number }[];
  keywords: RollRow[]; campaigns: RollRow[];
  costMicros: number; importedDays: string[]; lastIngest: number | null; campaignsOn: boolean;
}

/** The Pacific days whose clicks can land in an ET range: the same dates (a Pacific day starts 3 hours after the ET one). */
export function ptDaysOf(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const key = (...xs: (string | null | undefined)[]) => xs.map((x) => (x ?? "").toLowerCase()).join("|");

/** Cost per click for one Ads click: its keyword's that day, else its ad group's, else its campaign's. Pure, for tests. */
export function estimateCost(c: Pick<AdsClickRow, "date" | "campaign_id" | "ad_group_id" | "keyword_text" | "keyword_match_type">, keywords: KeywordDay[], campaigns: CampaignDay[]):
  { micros: number; from: "keyword" | "ad_group" | "campaign" } | null {
  const per = (rows: { clicks: number; cost_micros: number }[]) => {
    const clicks = rows.reduce((n, r) => n + r.clicks, 0);
    return clicks ? Math.round(rows.reduce((n, r) => n + r.cost_micros, 0) / clicks) : null;
  };
  const kw = per(keywords.filter((k) => k.date === c.date && k.ad_group_id === c.ad_group_id && key(k.keyword_text, k.match_type) === key(c.keyword_text, c.keyword_match_type)));
  if (kw !== null && c.keyword_text) return { micros: kw, from: "keyword" };
  const ag = per(keywords.filter((k) => k.date === c.date && k.ad_group_id === c.ad_group_id));
  if (ag !== null) return { micros: ag, from: "ad_group" };
  const cp = per(campaigns.filter((k) => k.date === c.date && k.campaign_id === c.campaign_id));
  return cp !== null ? { micros: cp, from: "campaign" } : null;
}

/** Which bucket a click id is in. Pure, for tests. */
export function bucketOf(billed: boolean, arrived: boolean, braidOnly: boolean): Bucket | null {
  if (billed) return arrived ? "billed_arrived" : "billed_not_arrived";
  if (!arrived) return null;
  return braidOnly ? "braid" : "arrived_not_billed";
}

/** What a visit did, for the roll-ups. */
export function visitDid(v: ClickVisit | null) {
  const ev = v?.events ?? [];
  const f = v?.facts;
  return {
    appRan: !!f && (f.appRan === true || f.browserEvents > 0),
    interacted: !!f?.interacted,
    // wirecalculators.com: what a paid visit can do here (same three slots as dnsmailcheck's checks / offer views / offer clicks).
    checks: ev.some((e) => e.type === "calc_run"),
    offerViews: ev.some((e) => e.type === "formula_view" || e.type === "chart_view"),
    offerClicks: ev.some((e) => e.type === "copy_result"),
  };
}

export async function reconcile(db: D1Database, r: ClicksRange, now = Date.now()): Promise<Recon> {
  const ptDays = ptDaysOf(r.from, r.to);
  const marks = ptDays.map(() => "?").join(", ");
  const flag = r.includeInternal ? "" : " AND is_internal = 0";
  const billedRows = (await db.prepare(
    `SELECT gclid, date, campaign_id, campaign_name, ad_group_id, ad_group_name, keyword_text, keyword_match_type, device, is_internal FROM ads_clicks WHERE date IN (${marks})${flag}`,
  ).bind(...ptDays).all<AdsClickRow>()).results;
  const keywords = (await db.prepare(
    `SELECT date, ad_group_id, keyword_id, campaign_id, keyword_text, match_type, clicks, cost_micros, is_internal FROM ads_keywords_daily WHERE date IN (${marks})${flag}`,
  ).bind(...ptDays).all<KeywordDay>()).results.map((k) => ({ ...k, clicks: Number(k.clicks), cost_micros: Number(k.cost_micros) }));
  const campaigns = (await db.prepare(
    `SELECT date, campaign_id, campaign_name, status, clicks, cost_micros, invalid_clicks, is_internal FROM ads_campaigns_daily WHERE date IN (${marks})${flag}`,
  ).bind(...ptDays).all<CampaignDay>()).results.map((c) => ({ ...c, clicks: Number(c.clicks), cost_micros: Number(c.cost_micros), invalid_clicks: Number(c.invalid_clicks) }));
  // The site side: every paid click from a day either side (a Pacific day's click can reach the site on the next ET day).
  const wide = await computeClicks(db, { ...r, from: addDays(r.from, -1), to: addDays(r.to, 1), includeBots: true, includeInternal: true, campaign: null, device: null });
  const byId = new Map(wide.paidAll.map((v) => [v.clickId, v]));
  // A billed gclid that reached the site at any other time (outside this window) still arrived.
  const elsewhere = new Set((await db.prepare(
    `SELECT DISTINCT gclid FROM ad_hits WHERE gclid IN (SELECT gclid FROM ads_clicks WHERE date IN (${marks}))`,
  ).bind(...ptDays).all<{ gclid: string }>()).results.map((x) => x.gclid));
  const [lo, hi] = rangeBounds(r);
  const imported = new Set((await db.prepare("SELECT dates FROM ads_ingests WHERE is_internal = 0").all<{ dates: string | null }>()).results.flatMap((x) => (x.dates ?? "").split(",").filter(Boolean)));
  const last = await db.prepare("SELECT MAX(at) AS at FROM ads_ingests WHERE is_internal = 0").first<{ at: number | null }>();
  const on = await db.prepare("SELECT COUNT(*) AS n FROM ads_campaigns_daily WHERE status = 'ENABLED' AND is_internal = 0 AND date >= ?").bind(ptDay(now - 2 * 86_400_000)).first<{ n: number }>();

  const rows: ReconRow[] = [];
  const seen = new Set<string>();
  for (const a of billedRows) {
    const v = byId.get(a.gclid) ?? null;
    const est = estimateCost(a, keywords, campaigns);
    seen.add(a.gclid);
    rows.push({ clickId: a.gclid, bucket: bucketOf(true, !!v || elsewhere.has(a.gclid), false)!, internal: !!a.is_internal || !!v?.facts?.internal, ads: a, visit: v, verdict: v?.verdict ?? null,
      estCostMicros: est?.micros ?? null, estFrom: est?.from ?? null, ageMs: null, why: null });
  }
  const billedIds = new Set((await db.prepare(
    `SELECT gclid FROM ads_clicks WHERE gclid IN (SELECT DISTINCT gclid FROM ad_hits WHERE ts >= ? AND ts < ? AND gclid IS NOT NULL)`,
  ).bind(lo - 86_400_000, hi + 86_400_000).all<{ gclid: string }>()).results.map((x) => x.gclid));
  // Click ids that came as a gclid (the rest are gbraid or wbraid, which Google's click report doesn't carry).
  const gclids = new Set((await db.prepare(
    `SELECT DISTINCT gclid FROM ad_hits WHERE gclid IS NOT NULL AND ts >= ? AND ts < ? UNION SELECT DISTINCT gclid FROM events WHERE gclid IS NOT NULL AND type = 'page_view' AND ts >= ? AND ts < ?`,
  ).bind(lo - 86_400_000, hi + 86_400_000, lo - 86_400_000, hi + 86_400_000).all<{ gclid: string }>()).results.map((x) => x.gclid));
  for (const v of wide.paidAll) {
    if (v.start < lo || v.start >= hi || seen.has(v.clickId) || billedIds.has(v.clickId) || v.facts?.junkId) continue;
    if (!r.includeInternal && v.facts?.internal) continue;
    if (!r.includeBots && (v.facts?.botUa || v.facts?.burst)) continue;
    const braid = !gclids.has(v.clickId);
    const age = now - v.start;
    rows.push({ clickId: v.clickId, bucket: bucketOf(false, true, braid)!, internal: !!v.facts?.internal, ads: null, visit: v, verdict: v.verdict, estCostMicros: null, estFrom: null,
      ageMs: age, why: braid ? null : !imported.has(ptDay(v.start)) || age < REPORT_LAG_MS ? "not_yet_reported" : "likely_filtered" });
  }
  const counts = Object.fromEntries(BUCKETS.map((b) => [b, rows.filter((x) => x.bucket === b).length])) as Record<Bucket, number>;
  const noGclid = ptDays.map((date) => ({ date, campaignClicks: campaigns.filter((c) => c.date === date).reduce((n, c) => n + c.clicks, 0), gclidRows: billedRows.filter((b) => b.date === date).length }))
    .filter((x) => x.campaignClicks !== x.gclidRows && (x.campaignClicks > 0 || x.gclidRows > 0));

  // Roll-ups: Google's cost and clicks beside what the billed clicks did on the site.
  const roll = (date: string, k: string, label: string, costMicros: number, billed: number, clicks: AdsClickRow[]): RollRow => {
    const did = clicks.map((c) => visitDid(byId.get(c.gclid) ?? null));
    const arrived = clicks.filter((c) => byId.has(c.gclid) || elsewhere.has(c.gclid)).length;
    return { date, key: k, label, costMicros, billed, arrived, appRan: did.filter((d) => d.appRan).length, interacted: did.filter((d) => d.interacted).length,
      checks: did.filter((d) => d.checks).length, offerViews: did.filter((d) => d.offerViews).length, offerClicks: did.filter((d) => d.offerClicks).length };
  };
  const kwGroups = new Map<string, KeywordDay[]>();
  for (const k of keywords) (kwGroups.get(key(k.date, k.ad_group_id, k.keyword_text, k.match_type)) ?? kwGroups.set(key(k.date, k.ad_group_id, k.keyword_text, k.match_type), []).get(key(k.date, k.ad_group_id, k.keyword_text, k.match_type))!).push(k);
  const keywordRolls = [...kwGroups.values()].map((ks) => {
    const k = ks[0];
    const clicks = billedRows.filter((b) => b.date === k.date && b.ad_group_id === k.ad_group_id && key(b.keyword_text, b.keyword_match_type) === key(k.keyword_text, k.match_type));
    return roll(k.date, `${k.ad_group_id}/${k.keyword_id}`, `${k.keyword_text ?? "?"} [${(k.match_type ?? "?").toLowerCase()}]`, ks.reduce((n, x) => n + x.cost_micros, 0), ks.reduce((n, x) => n + x.clicks, 0), clicks);
  }).filter((x) => x.billed || x.costMicros).sort((a, b) => b.date.localeCompare(a.date) || b.costMicros - a.costMicros);
  const campaignRolls = campaigns.map((c) => roll(c.date, c.campaign_id, c.campaign_name ?? c.campaign_id, c.cost_micros, c.clicks, billedRows.filter((b) => b.date === c.date && b.campaign_id === c.campaign_id)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.costMicros - a.costMicros);
  return {
    ptDays, rows: rows.sort((a, b) => (b.visit?.start ?? 0) - (a.visit?.start ?? 0)), counts, noGclid, keywords: keywordRolls, campaigns: campaignRolls,
    costMicros: campaigns.reduce((n, c) => n + c.cost_micros, 0), importedDays: ptDays.filter((d) => imported.has(d)),
    lastIngest: last?.at === null || last?.at === undefined ? null : Number(last.at), campaignsOn: Number(on?.n ?? 0) > 0,
  };
}

/** "$1.23" from micros. */
export const usd = (micros: number | null) => (micros === null ? "–" : `$${(micros / 1_000_000).toFixed(2)}`);
/** Cost per something, or "–". */
export const per = (micros: number, n: number) => (n ? usd(Math.round(micros / n)) : "–");

/** The Ads health numbers for the Data quality line. */
export function adsHealthOf(x: Recon, now: number): AdsHealth {
  const billed = x.rows.filter((r) => r.ads && !r.internal);
  return { days: x.ptDays.length === 1 ? x.ptDays[0] : `${x.ptDays[0]} to ${x.ptDays[x.ptDays.length - 1]}`, billed: billed.length,
    arrived: billed.filter((r) => r.bucket === "billed_arrived").length, neverArrived: billed.filter((r) => r.bucket === "billed_not_arrived").length,
    lastIngest: x.lastIngest, campaignsOn: x.campaignsOn, now };
}

/** Pass #114 + #115: the Data quality line's numbers for a range (bots and internal left out, as on /admin/stats). */
export async function dataQuality(db: D1Database, r: StatsRange, now = Date.now()): Promise<DataQuality> {
  const range = { ...r, includeBots: false, includeInternal: false, campaign: null, device: null };
  const d = await computeClicks(db, range);
  const all = d.ladder[0];
  const [lo, hi] = rangeBounds(r);
  const pvs = (await db.prepare(
    `SELECT x.sent AS sent, (SELECT COUNT(DISTINCT e.pv_seq) FROM events e WHERE e.pv = x.pv AND e.visit_token IS x.visit_token AND e.pv_seq IS NOT NULL AND e.type != 'exit') AS received
     FROM events x WHERE x.type = 'exit' AND x.sent IS NOT NULL AND x.ts >= ? AND x.ts < ? AND x.is_bot = 0 AND x.is_internal = 0`,
  ).bind(lo, hi).all<{ sent: number; received: number }>()).results;
  return {
    paidHits: all.hits, laddered: all.laddered,
    reached: Object.fromEntries(LADDER.map((k, i) => [k, all.reached[i]])) as DataQuality["reached"],
    loss: lossOf(pvs.map((p) => ({ sent: Number(p.sent), received: Number(p.received) }))),
    junkIds: d.verdicts.junk_id, bursts: d.bursts,
    ads: adsHealthOf(await reconcile(db, range, now), now),
  };
}

// ---------- /admin/clicks ----------


const n0 = (a: number, b: number) => (b ? `${a} (${Math.round((a / b) * 100)}%)` : `${a}`);

export function renderRecon(x: Recon): string {
  const days = x.ptDays.length === 1 ? x.ptDays[0] : `${x.ptDays[0]} to ${x.ptDays[x.ptDays.length - 1]}`;
  const missing = x.ptDays.filter((d) => !x.importedDays.includes(d));
  const rollTable = (title: string, rows: RollRow[]) => `<h3>${e(title)}</h3>
<div class="table-wrap"><table><thead><tr><th>Day (Pacific)</th><th>${title.startsWith("Per keyword") ? "Keyword" : "Campaign"}</th><th>Cost</th><th>Billed clicks</th><th>Arrived</th><th>App ran</th><th>Interacted</th><th>Ran a calc</th><th>Saw a formula or chart</th><th>Copied a result</th><th>Cost per interacted visit</th><th>Cost per calc visit</th><th>Cost per formula/chart view</th></tr></thead><tbody>${
  rows.map((r) => `<tr><td>${e(r.date)}</td><td>${e(r.label)}</td><td>${usd(r.costMicros)}</td><td>${r.billed}</td><td>${n0(r.arrived, r.billed)}</td><td>${r.appRan}</td><td>${r.interacted}</td><td>${r.checks}</td><td>${r.offerViews}</td><td>${r.offerClicks}</td><td>${per(r.costMicros, r.interacted)}</td><td>${per(r.costMicros, r.checks)}</td><td>${per(r.costMicros, r.offerViews)}</td></tr>`).join("")
  || '<tr><td colspan="13">No Google Ads data for these days yet.</td></tr>'
}</tbody></table></div>`;
  const never = x.rows.filter((r) => r.bucket === "billed_not_arrived");
  const notBilled = x.rows.filter((r) => r.bucket === "arrived_not_billed");
  return `<h2>Google Ads: billed against arrived (Pacific ${e(days)})</h2>
<p>${BUCKETS.map((b) => `${e(BUCKET_LABELS[b])}: <b>${x.counts[b]}</b>`).join("; ")}. Cost: <b>${usd(x.costMicros)}</b>. ${
  x.lastIngest === null ? "<b>No Google Ads import yet</b> (the Ads Script posts to /api/ads-ingest hourly once it's set up)." : `Last import ${e(etTime(x.lastIngest))} ET.`}${
  missing.length && x.lastIngest !== null ? ` Not imported yet: ${missing.map(e).join(", ")}.` : ""}${
  x.noGclid.length ? ` Google reports ${x.noGclid.map((g) => `${g.campaignClicks} clicks on ${e(g.date)} against ${g.gclidRows} in its click report`).join(", ")}: the difference is clicks without a gclid (or not in the click report yet).` : ""}</p>
<p class="small muted">Google's days are the Ads account's (Pacific); a click late on a Pacific day reaches the site early the next ET day, so arrivals are looked up a day either side. Billed: in Google's click report (click_view, a gclid each). Arrived: the Worker logged a page request with that gclid. Est. cost: the keyword's cost that day divided by its clicks (else the ad group's, else the campaign's). Cost per interacted visit, per calc visit and per formula/chart view divide Google's cost by the billed clicks that did it on the site.</p>
${never.length ? `<details><summary>Billed, never arrived (${never.length})</summary><div class="table-wrap"><table><thead><tr><th>Day</th><th>Click id</th><th>Campaign</th><th>Ad group</th><th>Keyword</th><th>Device</th><th>Est. cost</th></tr></thead><tbody>${
  never.map((r) => `<tr><td>${e(r.ads!.date)}</td><td>${e(r.clickId.slice(0, 10))}…</td><td>${e(r.ads!.campaign_name ?? r.ads!.campaign_id ?? "–")}${r.internal ? " <small>(internal)</small>" : ""}</td><td>${e(r.ads!.ad_group_name ?? "–")}</td><td>${e(r.ads!.keyword_text ?? "–")}</td><td>${e(r.ads!.device ?? "–")}</td><td>${usd(r.estCostMicros)} est.</td></tr>`).join("")
}</tbody></table></div></details>` : ""}
${notBilled.length ? `<details><summary>Arrived, not billed (${notBilled.length})</summary><ul>${notBilled.map((r) => `<li>${e(r.clickId.slice(0, 10))}… arrived ${r.visit ? e(etTime(r.visit.start)) : "?"} ET (${Math.round((r.ageMs ?? 0) / 3_600_000)} h ago): ${r.why === "not_yet_reported" ? "not yet reported" : "likely filtered (invalid) by Google"}</li>`).join("")}</ul></details>` : ""}
${rollTable("Per keyword per day", x.keywords)}
${rollTable("Per campaign per day", x.campaigns)}`;
}

/** Per click visit on /admin/clicks: billed y/n and its estimated cost. */
export function adsCell(x: Recon | null, clickId: string): string {
  if (!x) return "–";
  const r = x.rows.find((y) => y.clickId === clickId);
  if (!r) return "n";
  if (r.bucket === "braid") return "n/a <small>(gbraid/wbraid)</small>";
  if (!r.ads) return `n <small>(${r.why === "not_yet_reported" ? "not yet reported" : "likely filtered"})</small>`;
  return `y<br><small>${usd(r.estCostMicros)} est.</small>`;
}
