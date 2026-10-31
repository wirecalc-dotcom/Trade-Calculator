// M1: which events are bots and which are Colin's own browsers, so /admin/stats and the Google Ads
// conversions export count real visitors only. Decided when the event arrives; only the flags are stored,
// never the user agent.
//  - is_bot: a crawler, monitor, HTTP library or headless/automation user agent, or none at all; Cloudflare's
//    verified-bot signal when the zone has it (request.cf.botManagement, Bot Management plans only); or a
//    server-side event whose request never ran our script (the browser script sends js=1 on every API call
//    and offer link, so a bare curl of /api/check is a bot).
//  - is_internal: every rule is in src/lib/internal.ts (pass #92): the signed cookie here, test-tagged links in
//    eventInsert, internal Stripe customers and fixture accounts in the webhook.

import type { Env } from "../env";
import type { EventRow } from "./events";
import { isInternal } from "./internal";

export type BotReason = "no_ua" | "ua" | "headless" | "cf_verified" | "no_js";

// Self-declared crawlers, previewers, uptime/SEO monitors and HTTP libraries.
const CRAWLER_UA = new RegExp([
  "(?<!cu)bot\\b", "bot/", "crawl", "spider", "slurp", "mediapartners", "adsbot", "feedfetcher", "facebookexternalhit", "facebookcatalog",
  "embedly", "bingpreview", "whatsapp/", "skypeuripreview", "linkpreview", "validator", "archive\\.org",
  "uptime", "pingdom", "statuscake", "site24x7", "monitor", "checkly", "datadog", "newrelic", "synthetic", "gtmetrix", "pagespeed",
  "ahrefs", "semrush", "mj12", "dotbot", "petalbot", "bytespider", "gptbot", "claudebot", "ccbot", "perplexity", "amazonbot", "applebot",
  "curl/", "wget/", "python-requests", "python-urllib", "python/", "aiohttp", "httpx", "go-http-client", "java/", "okhttp", "apache-httpclient",
  "node-fetch", "undici", "axios", "got \\(", "libwww-perl", "php/", "guzzle", "ruby", "scrapy", "postman", "insomnia", "httpie", "powershell",
].join("|"), "i");

// Browsers driven by automation (our own browser checks and Lighthouse runs included).
const HEADLESS_UA = /headlesschrome|phantomjs|puppeteer|playwright|selenium|webdriver|chrome-lighthouse|cypress/i;

/** Why this user agent looks automated, or null for an ordinary browser. */
export function uaBotReason(ua: string | null): BotReason | null {
  if (!ua || !ua.trim()) return "no_ua";
  if (HEADLESS_UA.test(ua)) return "headless";
  if (CRAWLER_UA.test(ua)) return "ua";
  return null;
}

/** Cloudflare's verified-bot flag. Only zones with Bot Management get request.cf.botManagement; elsewhere it's absent. */
export function cfVerifiedBot(request: Request): boolean | null {
  const bm = (request as { cf?: { botManagement?: { verifiedBot?: boolean } } }).cf?.botManagement;
  return bm && typeof bm.verifiedBot === "boolean" ? bm.verifiedBot : null;
}

// The internal cookie and every other internal rule live in src/lib/internal.ts (pass #92); re-exported for callers.
export { clearInternalCookie, INTERNAL_COOKIE, internalCookie, isInternal } from "./internal";

/**
 * The flags for every event this request logs. `js`: for server-side events, whether the request shows the
 * browser script made it (js=1); undefined for browser beacons, which can only come from the script.
 */
export async function trafficFlags(request: Request, env: Pick<Env, "ADMIN_SECRET">, js?: unknown): Promise<Pick<EventRow, "is_bot" | "bot_reason" | "is_internal">> {
  const reason: BotReason | null = cfVerifiedBot(request) ? "cf_verified"
    : uaBotReason(request.headers.get("user-agent"))
    ?? (js !== undefined && String(js) !== "1" ? "no_js" : null);
  return { is_bot: reason ? 1 : 0, bot_reason: reason, is_internal: (await isInternal(request, env.ADMIN_SECRET)) ? 1 : 0 };
}
