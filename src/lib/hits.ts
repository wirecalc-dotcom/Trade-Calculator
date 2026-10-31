// Pass #114: how far each tagged landing got, from the server's side. A page request with a Google click id or utm_ tags
// (src/lib/adhits.ts adHitOf) gets a random hit id. The Worker stores it on the ad_hits row and puts it in that one HTML
// response (injectHit): a <meta name="wc-hit"> and a small inline script in <head>, and a 1x1 pixel at the top of <body>.
// Then each rung reports back on its own path under /api/h/<hit id>/, which /api/event blockers don't match:
//   r.gif  the page's HTML was parsed by a browser (the pixel was fetched; no JavaScript needed): rendered_at
//   b      the inline head script ran, before app.js (webdriver, visibility, navigation type, prerendering, ms since start): boot_*
//   e      that script's beacon when the page goes hidden or away: visible time, whether app.js finished init (window.__wcApp)
//          and whether anyone pressed, touched, typed or scrolled with a wheel on the page
// app.js puts the same hit id on every event of the visit (events.hit_id), so the rungs join the events.
// The request's shape is kept as derived values only (requestSignals): no IP, no user agent. Untagged requests are served as
// before: no rewrite, no new headers.

import type { Env } from "../env";
import { isDatacenterAsn } from "./datacenter-asns";

/** 16 random letters and digits. */
export const HIT_ID = /^[A-Za-z0-9]{16}$/;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export function newHitId(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => ALPHABET[x % 62]).join(""); // 256 % 62 = 8: a negligible bias for an id that is only unguessable, not secret
}

/** Rungs are accepted for this long after the hit; later ones are ignored. */
export const RUNG_WINDOW_MS = 86_400_000;

// ---------- request shape ----------

export interface HitSignals {
  sec_fetch_site: string | null; sec_fetch_mode: string | null; sec_fetch_dest: string | null; sec_fetch_user: 0 | 1 | null;
  sec_purpose: string | null; referrer_host: string | null; has_accept_language: 0 | 1;
  device_class: "mobile" | "tablet" | "desktop" | "unknown"; browser_family: "chrome" | "safari" | "firefox" | "edge" | "samsung" | "other";
  asn: number | null; datacenter: 0 | 1; country: string | null;
}

const TOKEN = /^[a-z-]{1,24}$/;
const token = (v: string | null) => { const s = v?.trim().toLowerCase() ?? ""; return TOKEN.test(s) ? s : null; };

/** mobile, tablet or desktop from Sec-CH-UA-Mobile, else a coarse user-agent test; unknown with neither. */
export function deviceClass(chMobile: string | null, ua: string | null): HitSignals["device_class"] {
  const tablet = !!ua && (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)));
  if (chMobile === "?1") return "mobile";
  if (chMobile === "?0") return tablet ? "tablet" : "desktop";
  if (!ua?.trim()) return "unknown";
  if (tablet) return "tablet";
  return /Mobi|iPhone|iPod|Android/i.test(ua) ? "mobile" : "desktop";
}

/** The browser's family from its user agent (looked at here, never stored). */
export function browserFamily(ua: string | null): HitSignals["browser_family"] {
  if (!ua) return "other";
  if (/SamsungBrowser\//.test(ua)) return "samsung";
  if (/Edg(A|iOS)?\//.test(ua)) return "edge";
  if (/Firefox\/|FxiOS\//.test(ua)) return "firefox";
  if (/OPR\/|Opera|YaBrowser|Vivaldi/.test(ua)) return "other";
  if (/Chrome\/|CriOS\/|Chromium\//.test(ua)) return "chrome";
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return "safari";
  return "other";
}

/** The referring site's host name only, or null (no referrer, or not a web address). */
export function referrerHost(ref: string | null): string | null {
  if (!ref) return null;
  try {
    const u = new URL(ref);
    return /^https?:$/.test(u.protocol) && u.hostname ? u.hostname.toLowerCase().slice(0, 100) : null;
  } catch { return null; }
}

/** The values kept from a tagged page request. Nothing else from its headers. */
export function requestSignals(request: Request): HitSignals {
  const h = request.headers;
  const ua = h.get("user-agent");
  const cf = (request as { cf?: { asn?: unknown; country?: unknown } }).cf;
  const asn = typeof cf?.asn === "number" && Number.isInteger(cf.asn) ? cf.asn : null;
  const purpose = (h.get("sec-purpose") ?? h.get("purpose"))?.trim().toLowerCase().replace(/\s+/g, "") ?? "";
  const user = h.get("sec-fetch-user");
  return {
    sec_fetch_site: token(h.get("sec-fetch-site")),
    sec_fetch_mode: token(h.get("sec-fetch-mode")),
    sec_fetch_dest: token(h.get("sec-fetch-dest")),
    sec_fetch_user: user === "?1" ? 1 : user === null ? null : 0,
    sec_purpose: /^[a-z;=-]{1,60}$/.test(purpose) ? purpose : null,
    referrer_host: referrerHost(h.get("referer")),
    has_accept_language: h.get("accept-language")?.trim() ? 1 : 0,
    device_class: deviceClass(h.get("sec-ch-ua-mobile"), ua),
    browser_family: browserFamily(ua),
    asn,
    datacenter: isDatacenterAsn(asn) ? 1 : 0,
    country: typeof cf?.country === "string" && /^[A-Z0-9]{2}$/.test(cf.country) ? cf.country : null,
  };
}

/** Sec-Purpose says prefetch (a speculative load: prefetch, or prefetch;prerender). */
export const isPrefetch = (purpose: string | null | undefined): boolean => !!purpose && purpose.split(";").includes("prefetch");
export const isPrerender = (purpose: string | null | undefined): boolean => !!purpose && purpose.split(";").includes("prerender");

// ---------- the page side ----------

/**
 * The inline head script on a tagged landing (allowed by its hash: HIT_INLINE_SHA256, recomputed by tests/unit/tracking.test.ts).
 * It reads the hit id from the meta tag before it. Boot waits for a prerendered page to be shown. The exit beacon goes on
 * visibilitychange to hidden and on pagehide (the server keeps the largest values). No blocking work, no storage.
 */
export const HIT_INLINE = `(function(){var d=document,m=d.querySelector('meta[name="wc-hit"]');if(!m)return;var w=window,n=navigator,P=performance,u="/api/h/"+m.content+"/",f=-1,v=0,s=d.visibilityState=="visible"?P.now():-1;function b(p,o){var j=JSON.stringify(o);try{if(n.sendBeacon&&n.sendBeacon(u+p,j))return}catch(e){}try{fetch(u+p,{method:"POST",body:j,keepalive:true}).catch(function(){})}catch(e){}}["pointerdown","touchstart","keydown","wheel"].forEach(function(t){addEventListener(t,function(){if(f<0)f=Math.round(P.now())},{capture:true,passive:true})});function g(){var e=P.getEntriesByType?P.getEntriesByType("navigation")[0]:null;b("b",{wd:n.webdriver?1:0,vis:d.visibilityState,nav:e?e.type:null,pre:r?1:0,ms:Math.round(P.now())})}var r=!!d.prerendering;if(r)d.addEventListener("prerenderingchange",g,{once:true});else g();function x(){if(s>=0){v+=P.now()-s;s=-1}b("e",{dwell:Math.round(v),app:w.__wcApp?1:0,i:f<0?0:1,fi:f<0?null:f})}d.addEventListener("visibilitychange",function(){if(d.visibilityState=="visible"){if(s<0)s=P.now()}else x()});addEventListener("pagehide",x)})()`;
export const HIT_INLINE_SHA256 = "XkiylviVNADI8Vy+4m+Xg+huVZe5atiraeQa0todiZA=";

/** The 43-byte transparent GIF the no-JS rung answers with. */
export const PIXEL = Uint8Array.from(atob("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=="), (c) => c.charCodeAt(0));

/** What goes into a tagged landing's HTML: after <meta charset> in <head>, and first in <body>. */
export const hitHead = (id: string) => `\n<meta name="wc-hit" content="${id}">\n<script>${HIT_INLINE}</script>`;
export const hitBody = (id: string) => `\n<img src="/api/h/${id}/r.gif" alt="" width="1" height="1" hidden decoding="async">`;

/**
 * A tagged landing's HTML response with the hit id in it, never cached (each request is its own hit). Anything but a 200 HTML
 * page passes unchanged. HTMLRewriter is the Workers runtime's streaming rewriter (absent under Node: the page passes unchanged).
 */
export function injectHit(res: Response, id: string): Response {
  if (res.status !== 200 || !(res.headers.get("content-type") ?? "").includes("text/html") || !res.body || !HIT_ID.test(id)) return res;
  const Rewriter = (globalThis as { HTMLRewriter?: typeof HTMLRewriter }).HTMLRewriter;
  let head = false;
  let body = false;
  const out = Rewriter
    ? new Rewriter()
      .on("meta[charset]", { element(el) { if (!head) { head = true; el.after(hitHead(id), { html: true }); } } })
      .on("body", { element(el) { if (!body) { body = true; el.prepend(hitBody(id), { html: true }); } } })
      .transform(res)
    : new Response(res.body, res);
  const r = new Response(out.body, out);
  r.headers.set("cache-control", "private, no-store");
  r.headers.delete("etag");
  r.headers.delete("last-modified");
  r.headers.delete("content-length");
  return r;
}

// ---------- the rung endpoints ----------

type DB = Pick<Env, "DB">;
const int = (v: unknown, lo: number, hi: number): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : null);
const NAVS = new Set(["navigate", "reload", "back_forward", "prerender"]);

/** The UPDATE for a rung, or null for a body that isn't one. Exported for tests. */
export function rungUpdate(rung: "r" | "b" | "e", id: string, body: Record<string, unknown>, now: number): { sql: string; binds: (string | number | null)[] } | null {
  const since = now - RUNG_WINDOW_MS;
  if (rung === "r") return { sql: "UPDATE ad_hits SET rendered_at = ? WHERE hit_id = ? AND rendered_at IS NULL AND ts > ?", binds: [now, id, since] };
  if (rung === "b") {
    return {
      sql: `UPDATE ad_hits SET boot_at = ?, boot_webdriver = ?, boot_visibility = ?, boot_nav = ?, boot_prerender = ?, boot_ms = ?
        WHERE hit_id = ? AND boot_at IS NULL AND ts > ?`,
      binds: [now, body.wd === 1 ? 1 : 0, body.vis === "visible" || body.vis === "hidden" ? body.vis : null,
        typeof body.nav === "string" && NAVS.has(body.nav) ? body.nav : null, body.pre === 1 ? 1 : 0, int(body.ms, 0, RUNG_WINDOW_MS), id, since],
    };
  }
  // The exit beacon can come more than once (hidden, back, pagehide): each value only grows.
  const fi = int(body.fi, 0, RUNG_WINDOW_MS);
  return {
    sql: `UPDATE ad_hits SET exit_at = COALESCE(exit_at, ?), dwell_ms = MAX(COALESCE(dwell_ms, 0), ?), app_ran = MAX(COALESCE(app_ran, 0), ?),
      interacted = MAX(COALESCE(interacted, 0), ?), first_interaction_ms = COALESCE(first_interaction_ms, ?) WHERE hit_id = ? AND ts > ?`,
    binds: [now, int(body.dwell, 0, RUNG_WINDOW_MS) ?? 0, body.app === 1 ? 1 : 0, body.i === 1 || fi !== null ? 1 : 0, fi, id, since],
  };
}

/** The ad_hits row is written off the page's response path, so a fast rung can arrive first: it tries again a little later. */
export const RUNG_RETRY_MS = [1000, 3000];

/** Writes a rung. Never throws. Returns whether a row took it. */
export async function writeRung(env: DB, rung: "r" | "b" | "e", id: string, body: Record<string, unknown>, now = Date.now(),
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<boolean> {
  if (!env.DB || !HIT_ID.test(id)) return false;
  const u = rungUpdate(rung, id, body, now);
  if (!u) return false;
  try {
    for (let i = 0; ; i++) {
      const r = await env.DB.prepare(u.sql).bind(...u.binds).run();
      if ((r.meta?.changes ?? 0) > 0) return true;
      // Nothing changed: an unknown or too old id, a rung already written (first write wins), or a row not written yet.
      if (i >= RUNG_RETRY_MS.length || await env.DB.prepare("SELECT 1 FROM ad_hits WHERE hit_id = ?").bind(id).first()) return false;
      await wait(RUNG_RETRY_MS[i]);
    }
  } catch (e) {
    console.error("hit rung failed", rung, e);
    return false;
  }
}

/** GET /api/h/<id>/r.gif, POST /api/h/<id>/b and /e: always a 204 (or the GIF), whatever the id or body; the write is off the response path. */
export async function hitRoute(request: Request, env: Env, ctx: ExecutionContext, params: Record<string, string>): Promise<Response> {
  const rung = params.rung === "r.gif" ? "r" : params.rung === "b" ? "b" : params.rung === "e" ? "e" : null;
  let body: Record<string, unknown> = {};
  if (rung === "b" || rung === "e") {
    try {
      const text = await request.text();
      const parsed = text.length <= 1000 ? JSON.parse(text) : null;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed;
    } catch { /* an empty or broken body: the rung is still written with what it has */ }
  }
  if (rung) ctx.waitUntil(writeRung(env, rung, params.id ?? "", body));
  const headers = { "cache-control": "no-store", "x-robots-tag": "noindex" };
  return rung === "r" && request.method !== "POST"
    ? new Response(request.method === "HEAD" ? null : PIXEL, { status: 200, headers: { ...headers, "content-type": "image/gif" } })
    : new Response(null, { status: 204, headers });
}
