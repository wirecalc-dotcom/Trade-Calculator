// /admin/*: HTTP Basic auth; the password is ADMIN_SECRET (any username). With no ADMIN_SECRET set, none of it exists.
// Ported from dnsmailcheck's src/routes/admin-stats.ts (stats, clicks, internal); its digest, Watch, fix-order, smoke-session,
// email-sample and conversions routes are not ported.
//  GET  /admin/stats?from=YYYY-MM-DD&to=YYYY-MM-DD&bots=1&internal=1  (or ?days=N)  — the matrix, with the Phase 4 block
//  GET  /admin/clicks?from=&to=&campaign=&device=m|c|t&bots=1&internal=1  — a trace of every paid click (src/lib/clicks.ts)
//  GET  /admin/internal   — whether this browser is marked as internal (Colin's own), with a button to change it
//  POST /admin/internal   — on=1 sets the signed __Host-wc_internal cookie, on=0 clears it

import { config } from "../config";
import type { Env } from "../env";
import { escapeHtml, html, safeEqual, simplePage } from "../lib/http";
import { computeStats, renderStats, statsRange } from "../lib/stats";
import { cfVerifiedBot, clearInternalCookie, internalCookie, isInternal } from "../lib/traffic";
import { clicksRange, computeClicks, renderClicks } from "../lib/clicks";
import { adsCell, dataQuality, reconcile, renderRecon } from "../lib/reconcile";

function password(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  if (h.startsWith("Bearer ")) return h.slice(7);
  if (!h.startsWith("Basic ")) return null;
  try {
    const decoded = atob(h.slice(6));
    return decoded.slice(decoded.indexOf(":") + 1);
  } catch {
    return null;
  }
}

/** null when the request may see /admin pages; otherwise the 404 or 401 to send. */
export function denied(request: Request, env: Env): Response | null {
  if (!env.ADMIN_SECRET) return new Response("Not found", { status: 404 });
  const pw = password(request);
  if (!pw || !safeEqual(pw, env.ADMIN_SECRET)) {
    return new Response("Authentication required", { status: 401, headers: { "www-authenticate": 'Basic realm="stats", charset="UTF-8"', "cache-control": "no-store" } });
  }
  return null;
}

export async function adminStats(request: Request, env: Env): Promise<Response> {
  const no = denied(request, env);
  if (no) return no;
  const range = statsRange(new URL(request.url).searchParams);
  const [stats, quality] = await Promise.all([computeStats(env.DB, range), dataQuality(env.DB, range)]);
  const internal = await isInternal(request, env.ADMIN_SECRET);
  return html(simplePage("Stats", renderStats(stats, { internal, cfBotSignal: cfVerifiedBot(request) !== null, dataQuality: quality })), 200, { "x-robots-tag": "noindex" });
}

export async function adminClicks(request: Request, env: Env): Promise<Response> {
  const no = denied(request, env);
  if (no) return no;
  const range = clicksRange(new URL(request.url).searchParams);
  const [data, recon] = await Promise.all([computeClicks(env.DB, range), reconcile(env.DB, range)]);
  return html(simplePage("Paid clicks", renderClicks(data, { top: renderRecon(recon), cell: (id) => adsCell(recon, id) })), 200, { "x-robots-tag": "noindex" });
}

function internalPage(on: boolean, note = ""): string {
  return `<h1>This browser</h1>
${note ? `<p role="status"><b>${escapeHtml(note)}</b></p>` : ""}
<p>This browser is <b>${on ? "marked as internal" : "not marked as internal"}</b>. ${on
    ? "Its page views, calculator runs and clicks are flagged internal and left out of /admin/stats and /admin/clicks (unless you tick Include internal)."
    : "Mark every browser you use (phone, laptop, each browser) so your own visits don't count as visitors."}</p>
<p class="muted">The mark is a signed cookie on ${escapeHtml(new URL(config.siteUrl).hostname)} that lasts 400 days. Clearing cookies removes it; changing ADMIN_SECRET voids every mark.</p>
<form method="post" action="/admin/internal"><input type="hidden" name="on" value="${on ? "0" : "1"}">
<button class="btn ${on ? "btn-secondary" : "btn-primary"}" type="submit">${on ? "Unmark this browser" : "Mark this browser as internal"}</button></form>
<p><a href="/admin/stats">Back to stats</a></p>`;
}

export async function adminInternal(request: Request, env: Env): Promise<Response> {
  const no = denied(request, env);
  if (no) return no;
  if (request.method !== "POST") return html(simplePage("This browser", internalPage(await isInternal(request, env.ADMIN_SECRET))), 200, { "x-robots-tag": "noindex" });
  // Basic auth credentials ride along on cross-site POSTs too, so the Origin must be ours.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  const on = new URLSearchParams(await request.text()).get("on") === "1";
  const cookie = on ? await internalCookie(env.ADMIN_SECRET!) : clearInternalCookie();
  return html(simplePage("This browser", internalPage(on, on ? "Done: this browser is now internal." : "Done: this browser counts as a visitor again.")), 200,
    { "x-robots-tag": "noindex", "set-cookie": cookie });
}
