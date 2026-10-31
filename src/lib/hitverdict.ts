// Pass #114: one honest verdict per paid click, from the server's hit (ad_hits, its rungs: src/lib/hits.ts) and the visit's
// events. Pure logic: /admin/clicks, /admin/stats's Data quality line and the daily digest all call these. The rows stay as
// written; only the reading changes.

/**
 * In the order they're tried: the first exclusion that matches wins (internal down to prefetch_unused), then how far the page
 * got (fetch_only down to events_blocked); a visit whose app ran and sent events is converted, else engaged (it was interacted
 * with), else app_no_interaction. burst: one of 3+ landings on the same page within 2 s from different tabs, none interacted
 * with (burstTokens). before_ladder: a hit logged before pass #114 with no events, so how far it got is unknown.
 */
export const VERDICTS = ["internal", "junk_id", "bot_ua", "burst", "datacenter", "prefetch_unused", "before_ladder", "fetch_only", "rendered_no_js",
  "bounced_before_app", "app_failed", "events_blocked", "converted", "engaged", "app_no_interaction"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const VERDICT_LABELS: Record<Verdict, string> = {
  internal: "internal or test traffic",
  junk_id: "click id isn't a Google one",
  bot_ua: "bot (user agent, verified bot or webdriver)",
  burst: "burst: 3+ landings on one page within 2 s, none interacted with",
  datacenter: "from a cloud or hosting network, and never booted",
  prefetch_unused: "prefetched, never shown",
  before_ladder: "server hit before pass #114, no events (stage unknown)",
  fetch_only: "server hit only: no HTML render, no script",
  rendered_no_js: "HTML rendered, no script ran",
  bounced_before_app: "inline script ran, left within 3 s before app.js",
  app_failed: "inline script ran, app.js never finished (blocked or errored)",
  events_blocked: "app ran, but no events reached /api/event",
  converted: "converted (ran a calculator: calc_run)",
  engaged: "engaged (pressed, touched, typed or scrolled)",
  app_no_interaction: "app ran, no interaction",
};

/** Excluded from the ladder's paid hits (not real paid visits). */
export const EXCLUDED: ReadonlySet<Verdict> = new Set(["internal", "junk_id", "bot_ua", "burst", "datacenter", "prefetch_unused"]);

/** One server hit of the visit and its rungs. */
export interface HitRungs { hitId: string | null; prefetch: boolean; prerender: boolean; rendered: boolean; boot: boolean }

export interface VisitFacts {
  internal: boolean;
  junkId: boolean;
  botUa: boolean;
  burst: boolean;
  datacenter: boolean;
  hits: HitRungs[];
  /** From the hit script's exit beacon: app.js finished init (null: no exit beacon). */
  appRan: boolean | null;
  /** From the same beacon: visible ms (null: no exit beacon). */
  dwellMs: number | null;
  /** Rows the browser sent to /api/event for the visit (page_view, scroll_depth, exit, ...). */
  browserEvents: number;
  /** Rows the server wrote for requests the script made (check_run, offer clicks through /api/go, ...). */
  serverEvents: number;
  interacted: boolean;
  converted: boolean;
}

/** A prefetched (or prerendered) hit was used if it booted, or (a plain prefetch) if its HTML was rendered. */
export const hitUsed = (h: HitRungs): boolean => h.boot || (h.rendered && !h.prerender);

export function verdictOf(f: VisitFacts): Verdict {
  if (f.internal) return "internal";
  if (f.junkId) return "junk_id";
  if (f.botUa) return "bot_ua";
  if (f.burst) return "burst";
  // Pass #115: only for a hit that never booted. A visit whose inline script ran is judged by the ladder whatever its network
  // (iCloud Private Relay and WARP leave from Cloudflare's 13335, Chrome's prefetch proxy from Google's networks: real people).
  if (f.datacenter && !f.hits.some((h) => h.boot)) return "datacenter";
  const js = f.browserEvents > 0 || f.serverEvents > 0;
  if (!js && f.hits.length && f.hits.every((h) => h.prefetch && !hitUsed(h))) return "prefetch_unused";
  if (!js && !f.hits.some((h) => h.hitId)) return "before_ladder";
  const shown = f.hits.filter((h) => !h.prefetch || hitUsed(h));
  const boot = shown.some((h) => h.boot);
  if (!js && !boot) return shown.some((h) => h.rendered) ? "rendered_no_js" : "fetch_only";
  const appRan = js || f.appRan === true;
  if (!appRan) return f.dwellMs !== null && f.dwellMs >= 3000 ? "app_failed" : "bounced_before_app";
  if (f.browserEvents === 0) return "events_blocked";
  if (f.converted) return "converted";
  return f.interacted ? "engaged" : "app_no_interaction";
}

/** The ladder's steps: how far a paid hit got (each one includes the ones after it). */
export const LADDER = ["rendered", "boot", "app", "interacted", "converted"] as const;
export type Rung = (typeof LADDER)[number];

/** The furthest rung a visit reached, for the ladder: -1 = only the server hit. */
export function ladderStep(f: VisitFacts, v: Verdict): number {
  if (v === "converted") return 4;
  if (v === "engaged") return 3;
  if (v === "app_no_interaction" || v === "events_blocked") return f.interacted ? 3 : 2;
  if (v === "bounced_before_app" || v === "app_failed") return 1;
  if (v === "rendered_no_js") return 0;
  return -1;
}

// ---------- burst (src/lib/stats.ts never sees it: it's worked out when reading) ----------

export const BURST_MS = 2000;
export const BURST_MIN = 3;

export interface BurstLanding { token: string; page: string; ts: number; interacted: boolean }

/**
 * Landings that are part of a burst: at least BURST_MIN landing page views of the same page within BURST_MS, from different
 * visit tokens, none of them interacted with (a landing that was interacted with is never part of one). groups: how many
 * separate bursts (overlapping windows are one burst).
 */
export function burstTokens(landings: BurstLanding[]): { tokens: Set<string>; groups: number } {
  const tokens = new Set<string>();
  let groups = 0;
  const byPage = new Map<string, BurstLanding[]>();
  for (const l of landings) if (!l.interacted) (byPage.get(l.page) ?? byPage.set(l.page, []).get(l.page)!).push(l);
  for (const ls of byPage.values()) {
    ls.sort((a, b) => a.ts - b.ts);
    let groupEnd = -Infinity;
    for (let i = 0, j = 0; i < ls.length; i++) {
      if (j < i) j = i;
      while (j + 1 < ls.length && ls[j + 1].ts - ls[i].ts <= BURST_MS) j++;
      const win = ls.slice(i, j + 1);
      if (new Set(win.map((l) => l.token)).size < BURST_MIN) continue;
      if (ls[i].ts > groupEnd) groups++;
      groupEnd = Math.max(groupEnd, ls[j].ts);
      for (const l of win) tokens.add(l.token);
    }
  }
  return { tokens, groups };
}

// ---------- delivery ----------

/** Per page view with an exit: events it tried (sent) and distinct pv_seq the server has. Page views without an exit can't say. */
export interface PageDelivery { sent: number; received: number }
export function lossOf(pvs: PageDelivery[]): { sent: number; lost: number; pct: number | null } {
  let sent = 0;
  let lost = 0;
  for (const p of pvs) { sent += p.sent; lost += Math.max(0, p.sent - p.received); }
  return { sent, lost, pct: sent ? Math.round((lost / sent) * 1000) / 10 : null };
}

// ---------- the Data quality line ----------

export interface DataQuality {
  /** Paid clicks in the window (not internal, not junk, not bots or bursts). */
  paidHits: number;
  /** Of those, the ones logged since pass #114 (with a hit id): the ladder's denominator. */
  laddered: number;
  reached: Record<Rung, number>;
  loss: { sent: number; lost: number; pct: number | null };
  junkIds: number;
  bursts: number;
  /** Pass #115: Google's side (src/lib/reconcile.ts), by the Ads account's Pacific day; absent where not computed. */
  ads?: AdsHealth;
}

/** Pass #115: billed clicks against arrivals, and how fresh the Ads import is. */
export interface AdsHealth {
  /** Pacific days covered. */
  days: string;
  billed: number; arrived: number; neverArrived: number;
  /** Last successful import that wasn't only test campaigns (ms), or null: none yet. */
  lastIngest: number | null;
  /** A campaign was ENABLED in the last two days' import. */
  campaignsOn: boolean;
  now: number;
}
export const INGEST_STALE_MS = 3 * 3_600_000;

const pctOf = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

/** ⚠ when app.js runs on under 70% of the pages whose inline script ran (5+ laddered paid hits), or more than 5% of events are lost. */
export function dataQualityWarn(d: DataQuality): string[] {
  const out: string[] = [];
  const boot = pctOf(d.reached.boot, d.laddered);
  const app = pctOf(d.reached.app, d.laddered);
  if (d.laddered >= 5 && boot !== null && app !== null && app < 0.7 * boot) out.push(`app ran on ${app}% vs boot ${boot}% (under 70% of boot)`);
  if (d.loss.pct !== null && d.loss.pct > 5) out.push(`event loss ${d.loss.pct}% (over 5%)`);
  const a = d.ads;
  if (a?.lastIngest !== null && a?.lastIngest !== undefined && a.campaignsOn && a.now - a.lastIngest > INGEST_STALE_MS) out.push(`Ads import ${ago(a.now - a.lastIngest)} old while campaigns are on (over 3 h)`);
  if (a && a.billed >= 5 && a.neverArrived / a.billed > 0.2) out.push(`${pctOf(a.neverArrived, a.billed)}% of billed clicks never arrived (over 20%)`);
  return out;
}

const ago = (ms: number) => (ms < 3_600_000 ? `${Math.max(0, Math.round(ms / 60_000))} min` : `${Math.round(ms / 360_000) / 10} h`);

/** The Ads part of the line: billed vs arrived and the import's freshness. */
export function adsHealthText(a: AdsHealth): string {
  const fresh = a.lastIngest === null ? "Ads import: none yet" : `last Ads import ${ago(a.now - a.lastIngest)} ago${a.campaignsOn ? "" : " (no campaign on)"}`;
  return `Ads billed clicks ${a.billed} vs arrived ${a.arrived} (Pacific ${a.days}), never arrived ${a.billed ? `${pctOf(a.neverArrived, a.billed)}%` : "–"}, ${fresh}`;
}

export function dataQualityLine(d: DataQuality): string {
  const p = (n: number) => { const x = pctOf(n, d.laddered); return x === null ? "–" : `${x}%`; };
  const warn = dataQualityWarn(d);
  return `${warn.length ? "⚠ " : ""}Data quality: paid hits ${d.paidHits}${d.laddered !== d.paidHits ? ` (${d.laddered} since the hit ladder)` : ""}, rendered ${p(d.reached.rendered)}, boot ${p(d.reached.boot)}, app ${p(d.reached.app)}, interacted ${p(d.reached.interacted)}, event loss ${d.loss.pct === null ? "–" : `${d.loss.pct}% (${d.loss.lost} of ${d.loss.sent})`}, junk ids ${d.junkIds}, bursts ${d.bursts}${d.ads ? `; ${adsHealthText(d.ads)}` : ""}${warn.length ? `. ⚠ ${warn.join("; ")}` : ""}`;
}
