// Pass #76: a server-side log of page requests that arrive with a Google click id (gclid, gbraid or wbraid), written
// by the Worker before the page's script runs, so /admin/stats can set "Ad clicks that reached the server" beside
// Google Ads' click count and the script's own "Gclid visits". Stored: the path, the time, the id, and the bot and
// internal flags (src/lib/traffic.ts); no IP and no user agent. API calls carry the visit's click id too, so only page
// requests count. Pass #97: only well-formed click ids count as ad clicks (isWellFormedClickId); the rest are rejected click ids.
// Pass #103: also the Final URL suffix's campaign, ad group, keyword, match type and device (AD_HIT_TAGS), so /admin/clicks can say
// which campaign and device a click came from when its page never ran the script.
// Pass #114: also utm-tagged landings with no click id (has_click_id 0), so tagged links get the same ladder; each row gets a hit
// id and the request's shape (src/lib/hits.ts: derived values only); a malformed click id is a bot (bot_reason bad_click_id).

import type { Env } from "../env";
import { attribution, CLICK_ID_KEYS, isTestTagged, logEvents, type EventRow } from "./events";
import { cfVerifiedBot, isInternal, trafficFlags, uaBotReason } from "./traffic";
import { requestSignals, type HitSignals } from "./hits";

export type AdHit = { path: string; has_click_id: 0 | 1 } & Record<(typeof CLICK_ID_KEYS)[number], string | null>;

const NOT_PAGES = /^\/(api|admin|auth|assets|cdn-cgi)\//;

/**
 * Pass #97: a click id with the shape Google's have (gclid, gbraid, wbraid: base64url text, dozens of characters). The
 * #95 audit found 69 of 75 logged "gclids" were 8-10 digit numbers with no events behind them: not Google click ids. Rows
 * are kept as written; /admin/stats counts only well-formed ids as ad clicks and shows the rest as rejected click ids.
 */
export const CLICK_ID_MIN = 20;
export const isWellFormedClickId = (v: string | null | undefined): boolean =>
  !!v && v.length >= CLICK_ID_MIN && /^[A-Za-z0-9_-]+$/.test(v) && /[A-Za-z]/.test(v);
/** The same rule in SQL, for a column or expression. */
export const wellFormedClickIdSql = (x: string) =>
  `(length(${x}) >= ${CLICK_ID_MIN} AND ${x} GLOB '*[A-Za-z]*' AND NOT ${x} GLOB '*[^A-Za-z0-9_-]*')`;
/** An ad_hits row's click id (the first of gclid, gbraid, wbraid it has). */
export const AD_HIT_ID = "COALESCE(gclid, gbraid, wbraid)";

/** The hit to log for this request, or null: a GET of a page whose URL has a Google click id, or (pass #114) any utm_ tag. */
export function adHitOf(request: Request): AdHit | null {
  if (request.method !== "GET") return null;
  const url = new URL(request.url);
  if (NOT_PAGES.test(url.pathname) || /\.[a-z0-9]+$/i.test(url.pathname.replace(/\.html$/i, ""))) return null;
  const ids = Object.fromEntries(CLICK_ID_KEYS.map((k) => [k, url.searchParams.get(k)?.trim().slice(0, 300) || null])) as Record<(typeof CLICK_ID_KEYS)[number], string | null>;
  const clickId = CLICK_ID_KEYS.some((k) => ids[k]);
  if (!clickId && ![...url.searchParams].some(([k, v]) => k.startsWith("utm_") && v.trim())) return null;
  return { ...ids, has_click_id: clickId ? 1 : 0, path: url.pathname.slice(0, 200) };
}

/** Why an ad hit is a bot, or null: Cloudflare's verified bot, the user agent, or (pass #114) a click id that isn't a Google one. */
export function adHitBotReason(request: Request, hit: AdHit): string | null {
  if (cfVerifiedBot(request)) return "cf_verified";
  const ua = uaBotReason(request.headers.get("user-agent"));
  if (ua) return ua;
  const id = hit.gclid ?? hit.gbraid ?? hit.wbraid;
  return id && !isWellFormedClickId(id) ? "bad_click_id" : null;
}

/** The Final URL suffix's tags kept on an ad hit (pass #103). */
export const AD_HIT_TAGS = ["utm_campaign", "utm_adgroup", "utm_term", "utm_match", "utm_device"] as const;

const SIGNAL_COLUMNS = ["sec_fetch_site", "sec_fetch_mode", "sec_fetch_dest", "sec_fetch_user", "sec_purpose", "referrer_host", "has_accept_language",
  "device_class", "browser_family", "asn", "datacenter", "country"] as const satisfies readonly (keyof HitSignals)[];
const HIT_TAGS = [...AD_HIT_TAGS, "utm_source", "utm_medium"] as const;
const INSERT_HIT = `INSERT INTO ad_hits (ts, path, gclid, gbraid, wbraid, is_bot, bot_reason, is_internal, hit_id, has_click_id, ${HIT_TAGS.join(", ")}, ${SIGNAL_COLUMNS.join(", ")})
  VALUES (${Array(10 + HIT_TAGS.length + SIGNAL_COLUMNS.length).fill("?").join(", ")})`;

/** Logs the hit, if the request is one, with its hit id (pass #114). Never throws: a page must load whatever D1 does. */
export async function logAdHit(request: Request, env: Pick<Env, "DB" | "ADMIN_SECRET">, now = Date.now(), hitId: string | null = null): Promise<boolean> {
  const hit = adHitOf(request);
  if (!hit || !env.DB) return false;
  const p = new URL(request.url).searchParams;
  const reason = adHitBotReason(request, hit);
  const internal = (await isInternal(request, env.ADMIN_SECRET)) || isTestTagged({ utm_source: p.get("utm_source"), utm_campaign: p.get("utm_campaign") });
  try {
    const tags = HIT_TAGS.map((k) => p.get(k)?.trim().slice(0, 150) || null);
    const signals = requestSignals(request);
    await env.DB.prepare(INSERT_HIT)
      .bind(now, hit.path, hit.gclid, hit.gbraid, hit.wbraid, reason ? 1 : 0, reason, internal ? 1 : 0, hitId, hit.has_click_id, ...tags, ...SIGNAL_COLUMNS.map((c) => signals[c])).run();
    return true;
  } catch (e) {
    console.error("ad hit log failed", e);
    return false;
  }
}

/**
 * Pass #97: a tagged landing that hit the 404 page (a Google click id or any utm_ tag in the URL), or null. A broken ad
 * Final URL shows up on /admin/stats as these rows instead of only as a lost visit.
 */
export function notFoundLandingOf(request: Request, status: number): EventRow | null {
  if (status !== 404 || request.method !== "GET") return null;
  const url = new URL(request.url);
  if (NOT_PAGES.test(url.pathname) || /\.(?!html$)[a-z0-9]+$/i.test(url.pathname)) return null;
  const tagged = [...url.searchParams.keys()].some((k) => (CLICK_ID_KEYS as readonly string[]).includes(k) || k.startsWith("utm_"));
  if (!tagged) return null;
  return { type: "landing_404", page: url.pathname.slice(0, 200), ...attribution(url.searchParams) };
}

/** Logs the 404 landing, if the response is one. Never throws. */
export async function logNotFoundLanding(request: Request, status: number, env: Pick<Env, "DB" | "ADMIN_SECRET">): Promise<boolean> {
  const row = notFoundLandingOf(request, status);
  if (!row || !env.DB) return false;
  return (await logEvents(env.DB, [{ ...row, ...(await trafficFlags(request, env)) }])) === "d1";
}
