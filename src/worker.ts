// The one Worker, ported from dnsmailcheck's src/worker.ts. It runs first for every request (assets.run_worker_first = true):
// it redirects www and plain http to https://<apex>, answers /api/* and /admin/*, logs tagged landings (ad_hits) and puts their
// hit id in the page, and serves everything else from the assets binding with the security headers. Its scheduled handler runs
// the daily retention purge.

import { config } from "./config";
import type { Env } from "./env";
import { json } from "./lib/http";
import { DAY_CACHE, DAY_CACHED, HTML_CSP, robotsHeader, siteHeaders } from "./site/seo";
import { adHitOf, logAdHit, logNotFoundLanding, notFoundLandingOf } from "./lib/adhits";
import { hitRoute, injectHit, newHitId } from "./lib/hits";
import { adsIngestRoute } from "./lib/adsingest";
import { purgeExpired } from "./lib/retention";
import { adminClicks, adminInternal, adminStats } from "./routes/admin-stats";
import { postEvent } from "./routes/event";

type Handler = (request: Request, env: Env, ctx: ExecutionContext, params: Record<string, string>) => Promise<Response>;

interface Route { method: "GET" | "POST"; pattern: RegExp; keys: string[]; handler: Handler }

// Same URLs as dnsmailcheck for every ported endpoint.
export const ROUTES: Route[] = [
  { method: "POST", pattern: /^\/api\/event$/, keys: [], handler: postEvent },
  // A tagged landing's rungs (src/lib/hits.ts): the no-JS pixel, the inline script's boot and exit beacons.
  { method: "GET", pattern: /^\/api\/h\/([^/]+)\/(r\.gif)$/, keys: ["id", "rung"], handler: hitRoute },
  { method: "POST", pattern: /^\/api\/h\/([^/]+)\/(b|e)$/, keys: ["id", "rung"], handler: hitRoute },
  // Our own Google Ads reports from the Ads Script (src/lib/adsingest.ts), bearer ADS_INGEST_SECRET.
  { method: "POST", pattern: /^\/api\/ads-ingest$/, keys: [], handler: adsIngestRoute },
  { method: "GET", pattern: /^\/admin\/stats$/, keys: [], handler: adminStats },
  { method: "GET", pattern: /^\/admin\/clicks$/, keys: [], handler: adminClicks },
  { method: "GET", pattern: /^\/admin\/internal$/, keys: [], handler: adminInternal },
  { method: "POST", pattern: /^\/admin\/internal$/, keys: [], handler: adminInternal },
];

// _headers doesn't apply to responses that pass through the Worker, which is every response, so the same headers are set
// here. X-Robots-Tag: every URL while config.indexable is false; after the flip, still the admin pages, the API and the 404.
function withSecurityHeaders(res: Response, url: URL): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(siteHeaders())) out.headers.set(k, v);
  // Asset URLs carrying a content hash (?v=, written by scripts/build.ts) never change: cache them for a year.
  if (res.status === 200 && url.pathname.startsWith("/assets/") && url.searchParams.has("v")) out.headers.set("cache-control", "public, max-age=31536000, immutable");
  else if (res.status === 200 && DAY_CACHED.has(url.pathname)) out.headers.set("cache-control", DAY_CACHE);
  const robots = robotsHeader(url);
  if (robots) out.headers.set("X-Robots-Tag", robots);
  else out.headers.delete("X-Robots-Tag");
  if ((out.headers.get("content-type") ?? "").includes("text/html") && !out.headers.has("content-security-policy")) {
    out.headers.set("content-security-policy", HTML_CSP);
  }
  return out;
}

const CANONICAL = new URL(config.siteUrl);

/** 301 to https://<apex> for www.<apex> and for plain http on the apex. Other hosts (workers.dev, local dev) pass. */
export function canonicalRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  const www = url.hostname === `www.${CANONICAL.hostname}`;
  const insecure = url.protocol === "http:" && url.hostname === CANONICAL.hostname;
  if (!www && !insecure) return null;
  return new Response(null, { status: 301, headers: { location: `${CANONICAL.origin}${url.pathname}${url.search}` } });
}

export async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const redirect = canonicalRedirect(request);
  if (redirect) return redirect;
  // A page request with a Google click id or utm_ tags: logged for the ad-click reconciliation (src/lib/adhits.ts), off the
  // response path, with a new hit id that goes into this page's HTML (src/lib/hits.ts). Other requests pass as before.
  if (!adHitOf(request)) return serve(request, env, ctx);
  const hitId = newHitId();
  ctx.waitUntil(logAdHit(request, env, Date.now(), hitId));
  return injectHit(await serve(request, env, ctx), hitId);
}

async function serve(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const { pathname } = new URL(request.url);
  const method = request.method === "HEAD" ? "GET" : request.method;
  const matches = ROUTES.map((r) => ({ r, m: pathname.match(r.pattern) })).filter((x) => x.m);
  const hit = matches.find((x) => x.r.method === method);
  if (hit) {
    const params = Object.fromEntries(hit.r.keys.map((k, i) => [k, decodeURIComponent(hit.m![i + 1])]));
    return hit.r.handler(request, env, ctx, params);
  }
  if (matches.length) {
    return json({ error: "Method not allowed." }, 405, { allow: [...new Set(matches.map((x) => x.r.method))].join(", ") });
  }
  if (pathname.startsWith("/api/")) return json({ error: "Not found." }, 404);
  // The not-found page exists as an asset (404.html), so asking for it by name would get a 200.
  if (pathname === "/404" || pathname === "/404.html") return notFoundPage(request, env);
  return env.ASSETS.fetch(request); // static file, 307 to the extensionless URL, or the 404 page (status 404)
}

async function notFoundPage(request: Request, env: Env): Promise<Response> {
  const page = await env.ASSETS.fetch(new Request(new URL("/404", request.url), { method: request.method }));
  return new Response(page.body, { status: 404, headers: page.headers });
}

export default {
  async fetch(request, env, ctx) {
    try {
      const res = await route(request, env, ctx);
      // An ad or tagged link that landed on the 404 page (a broken Final URL), off the response path.
      if (notFoundLandingOf(request, res.status)) ctx.waitUntil(logNotFoundLanding(request, res.status, env));
      return withSecurityHeaders(res, new URL(request.url));
    } catch (e) {
      console.error("unhandled", e);
      return withSecurityHeaders(json({ error: "Something went wrong." }, 500), new URL(request.url));
    }
  },

  // Daily: the retention purge (src/lib/retention.ts), so /privacy's 25 months holds.
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(purgeExpired(env.DB).then((n) => console.log("purge", JSON.stringify(n)), (e) => console.error("purge failed", e)));
  },
} satisfies ExportedHandler<Env>;
