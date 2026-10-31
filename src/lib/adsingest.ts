// Pass #115: POST /api/ads-ingest. The Google Ads Script (scripts/google-ads/dnsmailcheck-export.js) posts our own account's
// reports for today and yesterday (the account's Pacific days), hourly: click_view (one row per click id), search terms,
// keywords and campaigns per day. Bearer ADS_INGEST_SECRET; anything else is a 401. Each row is checked and clipped; a row that
// doesn't fit is counted as rejected and skipped, a payload that isn't one is a 400. Every table upserts on its natural key,
// so the hourly re-post of the same day just refreshes it. Google-side ad data only: no personal data arrives.

import type { Env } from "../env";
import { json, safeEqual } from "./http";

export const INGEST_MAX_BYTES = 5_000_000;
export const INGEST_MAX_ROWS = 50_000;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^(\d{1,20}|test-[a-z0-9-]{1,40})$/i;
const GCLID = /^[A-Za-z0-9_-]{10,300}$/;
const ENUM = /^[A-Z_]{1,40}$/;

const str = (v: unknown, n = 200): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : typeof v === "number" ? String(v) : null);
const id = (v: unknown): string | null => { const s = str(v, 60); return s && ID.test(s) ? s : null; };
const en = (v: unknown): string | null => { const s = str(v, 40); return s && ENUM.test(s) ? s : null; };
/** A count or micros: a non-negative whole number (Ads Scripts give numbers or numeric strings). */
const count = (v: unknown): number | null => {
  const n = typeof v === "string" && /^\d+(\.\d+)?$/.test(v) ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};
/** An impression share, 0 to 1 (null when Google has none). */
const share = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1 ? Math.round(n * 10_000) / 10_000 : null;
};
/** A test campaign (id or name starting test-) is internal, like a test-tagged link. */
export const isTestCampaign = (campaignId: string | null, name: string | null): boolean => /^test-/i.test(campaignId ?? "") || /^test-/i.test(name ?? "");

export interface AdsClick { gclid: string; date: string; campaign_id: string | null; campaign_name: string | null; ad_group_id: string | null; ad_group_name: string | null;
  keyword_text: string | null; keyword_match_type: string | null; device: string | null; click_type: string | null; page_number: number | null }
export interface AdsSearchTerm { date: string; search_term: string; campaign_id: string | null; campaign_name: string | null; ad_group_id: string; ad_group_name: string | null;
  keyword_text: string; match_type: string | null; clicks: number; impressions: number; cost_micros: number }
export interface AdsKeyword { date: string; keyword_id: string; ad_group_id: string; campaign_id: string | null; keyword_text: string | null; match_type: string | null;
  clicks: number; impressions: number; cost_micros: number; average_cpc_micros: number | null }
export interface AdsCampaign { date: string; campaign_id: string; campaign_name: string | null; status: string | null; impressions: number; clicks: number; invalid_clicks: number;
  cost_micros: number; search_impression_share: number | null; search_budget_lost_impression_share: number | null; search_rank_lost_impression_share: number | null }

export interface Parsed { dates: string[]; clicks: AdsClick[]; search_terms: AdsSearchTerm[]; keywords: AdsKeyword[]; campaigns: AdsCampaign[]; rejected: number; errors: string[] }

const rowsOf = (v: unknown): Record<string, unknown>[] | null => (v === undefined ? [] : Array.isArray(v) ? v.filter((r) => r && typeof r === "object") as Record<string, unknown>[] : null);

/** The payload's rows, checked, or an error for a payload that isn't one. */
export function parseIngest(body: unknown): Parsed | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "not a JSON object" };
  const b = body as Record<string, unknown>;
  if (b.version !== 1) return { error: "version must be 1" };
  const lists = { clicks: rowsOf(b.clicks), search_terms: rowsOf(b.search_terms), keywords: rowsOf(b.keywords), campaigns: rowsOf(b.campaigns) };
  for (const [k, v] of Object.entries(lists)) if (v === null) return { error: `${k} must be an array` };
  const total = Object.values(lists).reduce((n, l) => n + l!.length, 0);
  if (total > INGEST_MAX_ROWS) return { error: `too many rows (${total} > ${INGEST_MAX_ROWS})` };
  const out: Parsed = { dates: [], clicks: [], search_terms: [], keywords: [], campaigns: [], rejected: 0, errors: [] };
  const reject = (what: string, i: number, why: string) => { out.rejected++; if (out.errors.length < 10) out.errors.push(`${what}[${i}]: ${why}`); };
  const date = (v: unknown) => (typeof v === "string" && DATE.test(v) ? v : null);
  lists.clicks!.forEach((r, i) => {
    const g = str(r.gclid, 300), d = date(r.date);
    if (!g || !GCLID.test(g)) return reject("clicks", i, "gclid");
    if (!d) return reject("clicks", i, "date");
    const page = count(r.page_number);
    out.clicks.push({ gclid: g, date: d, campaign_id: id(r.campaign_id), campaign_name: str(r.campaign_name), ad_group_id: id(r.ad_group_id), ad_group_name: str(r.ad_group_name),
      keyword_text: str(r.keyword_text, 80), keyword_match_type: en(r.keyword_match_type), device: en(r.device), click_type: en(r.click_type), page_number: page && page < 1000 ? page : null });
  });
  lists.search_terms!.forEach((r, i) => {
    const d = date(r.date), term = str(r.search_term, 300), ag = id(r.ad_group_id);
    const [c, im, cost] = [count(r.clicks), count(r.impressions), count(r.cost_micros)];
    if (!d || !term || !ag || c === null || im === null || cost === null) return reject("search_terms", i, "date, search_term, ad_group_id, clicks, impressions and cost_micros are required");
    out.search_terms.push({ date: d, search_term: term, campaign_id: id(r.campaign_id), campaign_name: str(r.campaign_name), ad_group_id: ag, ad_group_name: str(r.ad_group_name),
      keyword_text: str(r.keyword_text, 80) ?? "", match_type: en(r.match_type), clicks: c, impressions: im, cost_micros: cost });
  });
  lists.keywords!.forEach((r, i) => {
    const d = date(r.date), kw = id(r.keyword_id), ag = id(r.ad_group_id);
    const [c, im, cost] = [count(r.clicks), count(r.impressions), count(r.cost_micros)];
    if (!d || !kw || !ag || c === null || im === null || cost === null) return reject("keywords", i, "date, keyword_id, ad_group_id, clicks, impressions and cost_micros are required");
    out.keywords.push({ date: d, keyword_id: kw, ad_group_id: ag, campaign_id: id(r.campaign_id), keyword_text: str(r.keyword_text, 80), match_type: en(r.match_type),
      clicks: c, impressions: im, cost_micros: cost, average_cpc_micros: count(r.average_cpc_micros) });
  });
  lists.campaigns!.forEach((r, i) => {
    const d = date(r.date), cid = id(r.campaign_id);
    const [c, im, cost] = [count(r.clicks), count(r.impressions), count(r.cost_micros)];
    if (!d || !cid || c === null || im === null || cost === null) return reject("campaigns", i, "date, campaign_id, clicks, impressions and cost_micros are required");
    out.campaigns.push({ date: d, campaign_id: cid, campaign_name: str(r.campaign_name), status: en(r.status), impressions: im, clicks: c, invalid_clicks: count(r.invalid_clicks) ?? 0,
      cost_micros: cost, search_impression_share: share(r.search_impression_share), search_budget_lost_impression_share: share(r.search_budget_lost_impression_share),
      search_rank_lost_impression_share: share(r.search_rank_lost_impression_share) });
  });
  out.dates = [...new Set([...(Array.isArray(b.dates) ? b.dates.map(date).filter((x): x is string => !!x) : []),
    ...out.clicks.map((r) => r.date), ...out.search_terms.map((r) => r.date), ...out.keywords.map((r) => r.date), ...out.campaigns.map((r) => r.date)])].sort();
  return out;
}

/** The upserts for parsed rows (each table on its natural key; ads_clicks keeps when it was first seen). */
export function upserts(db: D1Database, p: Parsed, now: number): D1PreparedStatement[] {
  const up = (table: string, key: string[], cols: string[], keep: string[] = []) => {
    const all = [...cols, "is_internal", ...keep, "updated_at"];
    const set = [...cols.filter((c) => !key.includes(c)), "is_internal", "updated_at"].map((c) => `${c} = excluded.${c}`).join(", ");
    return `INSERT INTO ${table} (${all.join(", ")}) VALUES (${all.map(() => "?").join(", ")}) ON CONFLICT (${key.join(", ")}) DO UPDATE SET ${set}`;
  };
  const C = ["gclid", "date", "campaign_id", "campaign_name", "ad_group_id", "ad_group_name", "keyword_text", "keyword_match_type", "device", "click_type", "page_number"] as const;
  const S = ["date", "search_term", "campaign_id", "campaign_name", "ad_group_id", "ad_group_name", "keyword_text", "match_type", "clicks", "impressions", "cost_micros"] as const;
  const K = ["date", "keyword_id", "ad_group_id", "campaign_id", "keyword_text", "match_type", "clicks", "impressions", "cost_micros", "average_cpc_micros"] as const;
  const P = ["date", "campaign_id", "campaign_name", "status", "impressions", "clicks", "invalid_clicks", "cost_micros", "search_impression_share",
    "search_budget_lost_impression_share", "search_rank_lost_impression_share"] as const;
  const internal = (r: { campaign_id: string | null; campaign_name?: string | null }) => (isTestCampaign(r.campaign_id, r.campaign_name ?? null) ? 1 : 0);
  // Keywords and search terms carry no campaign name; their campaign's id or a known test campaign row says it.
  const testIds = new Set([...p.campaigns, ...p.clicks].filter((r) => internal(r)).map((r) => r.campaign_id));
  const internalById = (r: { campaign_id: string | null; campaign_name?: string | null }) => (internal(r) || testIds.has(r.campaign_id) ? 1 : 0);
  const sqlC = up("ads_clicks", ["gclid"], [...C], ["first_seen_at"]);
  const sqlS = up("ads_search_terms", ["date", "search_term", "ad_group_id", "keyword_text"], [...S]);
  const sqlK = up("ads_keywords_daily", ["date", "ad_group_id", "keyword_id"], [...K]);
  const sqlP = up("ads_campaigns_daily", ["date", "campaign_id"], [...P]);
  return [
    ...p.clicks.map((r) => db.prepare(sqlC).bind(...C.map((c) => r[c]), internalById(r), now, now)),
    ...p.search_terms.map((r) => db.prepare(sqlS).bind(...S.map((c) => r[c]), internalById(r), now)),
    ...p.keywords.map((r) => db.prepare(sqlK).bind(...K.map((c) => r[c]), internalById(r), now)),
    ...p.campaigns.map((r) => db.prepare(sqlP).bind(...P.map((c) => r[c]), internalById(r), now)),
  ];
}

const BATCH = 50;

/** Writes a parsed payload and logs the ingest. Returns the row counts. */
export async function ingest(db: D1Database, p: Parsed, now = Date.now()) {
  const stmts = upserts(db, p, now);
  for (let i = 0; i < stmts.length; i += BATCH) await db.batch(stmts.slice(i, i + BATCH));
  const n = { clicks: p.clicks.length, search_terms: p.search_terms.length, keywords: p.keywords.length, campaigns: p.campaigns.length };
  const rows = [...p.clicks, ...p.search_terms, ...p.keywords, ...p.campaigns];
  const allTest = rows.length > 0 && rows.every((r) => isTestCampaign(r.campaign_id, (r as { campaign_name?: string | null }).campaign_name ?? null));
  await db.prepare("INSERT INTO ads_ingests (at, dates, clicks, search_terms, keywords, campaigns, rejected, is_internal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(now, p.dates.join(","), n.clicks, n.search_terms, n.keywords, n.campaigns, p.rejected, allTest ? 1 : 0).run();
  return n;
}

/** POST /api/ads-ingest */
export async function adsIngestRoute(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!env.ADS_INGEST_SECRET || !token || !safeEqual(token, env.ADS_INGEST_SECRET)) {
    return json({ error: "Unauthorized." }, 401, { "www-authenticate": "Bearer", "cache-control": "no-store" });
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > INGEST_MAX_BYTES) return json({ error: "Too large." }, 413);
  const text = await request.text();
  if (text.length > INGEST_MAX_BYTES) return json({ error: "Too large." }, 413);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return json({ error: "Not JSON." }, 400); }
  const p = parseIngest(body);
  if ("error" in p) return json({ error: p.error }, 400);
  try {
    const upserted = await ingest(env.DB, p);
    return json({ ok: true, dates: p.dates, upserted, rejected: p.rejected, errors: p.errors }, 200, { "cache-control": "no-store" });
  } catch (e) {
    console.error("ads ingest failed", e);
    return json({ error: "Couldn't store it." }, 500);
  }
}
