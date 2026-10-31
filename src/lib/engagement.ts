// Pass #103: engagement events, so every paid click has a trace of what the visit did and when it left. Pure logic, shared
// by the browser script (src/client/app.ts) and the event route, so it can be tested without a browser.
//  - scroll_depth: once per mark (25, 50, 75, 100% of the page) per page per visit.
//  - cta_view: a Watch buy button (monthly or yearly) or the Fix quote button at least half on screen for one second
//    (the offer_view rule, src/lib/offerseen.ts), once per button and placement per page view.
//  - exit: on pagehide, or the tab going hidden, one beacon with the visible ("engaged") time, the deepest scroll, the
//    last event and where the page went. Coming back to the tab resumes the clock; each later exit replaces the one
//    before it (seq), so a page view has at most one exit row and the final one wins.
// No new personal data: numbers, short codes and a random page-view id (pv), tied to the visit like every other event.

export const SCROLL_MARKS = [25, 50, 75, 100] as const;

/** How far down the page the bottom of the screen is, 0-100. A page that fits on the screen is 100. */
export function scrollPercent(scrollY: number, viewport: number, docHeight: number): number {
  if (!(docHeight > 0) || docHeight <= viewport) return 100;
  return Math.max(0, Math.min(100, Math.round(((scrollY + viewport) / docHeight) * 100)));
}

/** The marks reached at `pct` that are above the highest one already sent (0 = none yet). */
export const newMarks = (sent: number, pct: number): number[] => SCROLL_MARKS.filter((m) => m > sent && m <= pct);

/** The buttons cta_view records: which one, as its offer and plan. */
export const CTAS = {
  watch_monthly: { offer: "watch", plan: "monthly" },
  watch_yearly: { offer: "watch", plan: "yearly" },
  // Pass #118b: Managed, per domain (offer managed): yearly first, monthly with the setup line.
  managed_yearly: { offer: "managed", plan: "yearly" },
  managed_monthly: { offer: "managed", plan: "monthly" },
  fix_quote: { offer: "fix", plan: null },
} as const;
export type Cta = keyof typeof CTAS;
/** Where the button was: a check result's offer box, the Watch landing pages' card, /account, or the /fix-intake card. */
export const CTA_PLACEMENTS = new Set(["result", "landing", "account", "fix_intake"]);
export const ctaOf = (offer: string | null, plan: string | null): Cta | null =>
  offer === "fix" ? "fix_quote" : offer === "watch" ? (plan === "yearly" ? "watch_yearly" : "watch_monthly")
    : offer === "managed" ? (plan === "monthly" ? "managed_monthly" : "managed_yearly") : null;

/** page_view: how the page was reached (PerformanceNavigationTiming.type). */
export const NAV_TYPES = new Set(["navigate", "reload", "back_forward", "prerender"]);
/**
 * exit: where the page went. internal: a link to another page here; checkout: a Watch checkout link (/api/go, then Stripe);
 * away: the page was unloaded otherwise (tab closed, back, typed address, or a reload: the next page view says reload);
 * hidden: the tab or app was switched away from and the page never came back.
 */
export const EXIT_KINDS = ["internal", "checkout", "away", "hidden"] as const;
export type ExitKind = (typeof EXIT_KINDS)[number];

/** A link click counts as where the page went if the page goes within this long after it. */
export const NAV_CLICK_MS = 5000;
/** The visible-time clock never claims more than a day for one page view. */
export const MAX_ENGAGED_MS = 86_400_000;

/** Visible time on the page: runs only while the tab is visible; `now` is injected for tests. */
export function engagedClock(visible: boolean, now: number) {
  let total = 0;
  let since: number | null = visible ? now : null;
  return {
    set(v: boolean, at: number) {
      if (v && since === null) since = at;
      else if (!v && since !== null) { total += Math.max(0, at - since); since = null; }
    },
    ms(at: number) { return Math.min(MAX_ENGAGED_MS, total + (since === null ? 0 : Math.max(0, at - since))); },
  };
}

export interface ExitBody { type: "exit"; pv: string; seq: number; engaged_ms: number; scroll_pct: number; nav: ExitKind; last_event: string | null }

/**
 * The exit beacons of one page view. hide() is the tab going hidden, gone() the pagehide; show() is the page coming back
 * (visible again, or restored from the back/forward cache). Each returns the beacon to send, or null: nothing new since
 * the last one, or the hidden that follows a pagehide (the pagehide already said where the page went).
 */
export function exitTracker(pv: string) {
  let seq = 0;
  let left = false;
  let lastSent = "";
  let navAt = -Infinity;
  let navKind: ExitKind | null = null;
  const body = (kind: ExitKind, at: number, engagedMs: number, scrollPct: number, lastEvent: string | null): ExitBody | null => {
    const nav = navKind && at - navAt <= NAV_CLICK_MS ? navKind : kind;
    const key = `${nav}|${Math.floor(engagedMs / 1000)}|${scrollPct}|${lastEvent}`;
    if (key === lastSent) return null;
    lastSent = key;
    return { type: "exit", pv, seq: ++seq, engaged_ms: Math.round(engagedMs), scroll_pct: scrollPct, nav, last_event: lastEvent };
  };
  return {
    /** A click on a link to another page of ours (internal) or to a Watch checkout (checkout). */
    linkClick(kind: "internal" | "checkout", at: number) { navKind = kind; navAt = at; },
    hide(at: number, engagedMs: number, scrollPct: number, lastEvent: string | null) { return left ? null : body("hidden", at, engagedMs, scrollPct, lastEvent); },
    gone(at: number, engagedMs: number, scrollPct: number, lastEvent: string | null) { left = true; return body("away", at, engagedMs, scrollPct, lastEvent); },
    show() { left = false; navKind = null; },
    get seq() { return seq; },
  };
}

/** Where a clicked link goes, for the exit: another page of ours, a Watch checkout, or null (another site, same page, new tab). */
export function linkKind(href: string, origin: string, currentPath: string, target = "", download = false): "internal" | "checkout" | null {
  if (download || (target && target !== "_self")) return null;
  let u: URL;
  try { u = new URL(href, origin); } catch { return null; }
  if (u.origin !== origin) return null;
  if (u.pathname.startsWith("/api/go/")) return "checkout";
  if (u.pathname === currentPath && u.hash) return null; // a jump within the page
  return "internal";
}

// Server side: what the event route accepts from the browser.
const PV = /^[a-f0-9]{16}$/;
export const cleanPv = (v: unknown): string | null => (typeof v === "string" && PV.test(v) ? v : null);
const int = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : null;
export const cleanScroll = (v: unknown): number | null => int(v, 0, 100);
export const cleanMark = (v: unknown): number | null => (SCROLL_MARKS as readonly number[]).includes(v as number) ? (v as number) : null;
export const cleanEngaged = (v: unknown): number | null => int(v, 0, MAX_ENGAGED_MS);
export const cleanSeq = (v: unknown): number | null => int(v, 1, 10_000);
export const cleanExitKind = (v: unknown): ExitKind | null => ((EXIT_KINDS as readonly string[]).includes(v as string) ? (v as ExitKind) : null);
export const cleanNavType = (v: unknown): string | null => (typeof v === "string" && NAV_TYPES.has(v) ? v : null);
