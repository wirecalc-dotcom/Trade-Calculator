// Browser script for every page: runs the calculators, logs page events. Ported from dnsmailcheck's src/client/app.ts
// (sections "attribution, visits, events", "engagement" and "init" kept as they were, with the ec_ storage names renamed
// wc_); its DNS checks, offers, forms and account app are not ported. New: the calculators and calc_run, formula_view,
// chart_view and copy_result, sent through the same sendEvent.

import { etDay } from "../lib/etday";
import { halfOnScreen, SEEN_THRESHOLDS, seenTimer } from "../lib/offerseen";
import { engagedClock, exitTracker, linkKind, newMarks, scrollPercent } from "../lib/engagement";
import { drain, enqueue, parseQueue } from "../lib/beaconq";
import { CALCS, resultHtml, type Out, type Values } from "../site/calculators";
import { gpcOn, initConsent } from "./consent";

// ---------- attribution, visits, events ----------

// The account-level Final URL suffix's keys (utm_campaign = campaign id, utm_adgroup = ad group id, utm_term = keyword)
// and Google's click ids: gclid, and gbraid / wbraid (iOS app and web-to-app clicks), all paid.
const CLICK_IDS = ["gclid", "gbraid", "wbraid"];
const ATTR_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_adgroup", "utm_term", "utm_content", "utm_device", "utm_match", ...CLICK_IDS];
const URL_TAGS = (() => {
  const p = new URLSearchParams(location.search);
  const fresh: Record<string, string> = {};
  // A cut click id can't be matched by Google's conversion import, so it gets the server's longer limit (events.ts attribution).
  for (const k of ATTR_KEYS) { const v = p.get(k); if (v) fresh[k] = v.slice(0, CLICK_IDS.includes(k) ? 300 : 150); }
  return fresh;
})();
const GOOGLE_CLICK = CLICK_IDS.some((k) => URL_TAGS[k]);
/** dnsmailcheck pass #114: the hit id the Worker put in a tagged landing's HTML (src/lib/hits.ts); null on every other page. */
const HIT_ID = document.querySelector('meta[name="wc-hit"]')?.getAttribute("content") ?? null;

/** A random visit token: 16 hex characters, drawn again with every landing page view. */
function newVisitToken(): string {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

const SEARCH_ENGINES = /(^|\.)(google|bing|duckduckgo|yahoo|baidu|yandex|ecosia|startpage|qwant|kagi|naver|seznam)\.[a-z.]+$|^search\.brave\.com$/i;

/** How this page was reached: no referrer (direct), a search engine (organic) or another site (referral). Null for our own pages. */
function referrerSource(): string | null {
  if (!document.referrer) return "direct";
  try {
    const host = new URL(document.referrer).hostname;
    if (host === location.hostname) return null;
    return SEARCH_ENGINES.test(host) ? "organic" : "referral";
  } catch { return "referral"; }
}

/**
 * Campaign tags, the landing page, the referrer source and the visit token, carried on every event of the visit (session
 * storage, this tab only). New tags in the address replace the old ones; the landing page is reset by new tags and by a new
 * visit (30 idle minutes), so it's always the first page of the current visit. The visit token is drawn with each landing,
 * so a token has exactly one landing page view.
 */
function attribution(newVisit: boolean): { attr: Record<string, string>; landed: boolean } {
  let stored: Record<string, string> = {};
  try { stored = JSON.parse(sessionStorage.getItem("wc_attr") ?? "{}"); } catch { /* storage blocked */ }
  if (Object.keys(URL_TAGS).length) stored = { ...URL_TAGS };
  const landed = !!Object.keys(URL_TAGS).length || newVisit || !stored.landing;
  if (landed) {
    stored.landing = location.pathname;
    stored.source = referrerSource() ?? stored.source ?? "direct";
    stored.visit_token = newVisitToken();
    // The landing's hit id follows the visit to its later pages; a landing without one drops the old one.
    if (HIT_ID) stored.hit_id = HIT_ID; else delete stored.hit_id;
  }
  try {
    sessionStorage.setItem("wc_attr", JSON.stringify(stored));
    // A new visit's first calc run counts again.
    if (newVisit) sessionStorage.removeItem("wc_calc");
  } catch { /* storage blocked */ }
  return { attr: stored, landed };
}

const DAY_S = 86_400;

/**
 * First-party visit cookie wc_v: "count.lastSeen.firstSeen.ad" (unix seconds; ad: 0 = the first visit wasn't from an ad,
 * 1 = it was (utm_source), 3 = it had a gclid; 2 and 4 = the same after its direct return has been counted). A new visit
 * starts after 30 idle minutes. Works out, without any identifier: the browser's first page view of the ET day (unique
 * visitors), whether this visit is the first direct return within 14 days of a first visit from an ad (stickiness), and
 * (new here) how many whole days after the first visit this return came (ret_days).
 */
function countVisit(): { count: number; isNewVisit: boolean; newToday: boolean; firstDay: string | null; retDays: number | null; sticky: boolean; stickyGclid: boolean } {
  const m = document.cookie.match(/(?:^|;\s*)wc_v=(\d+)\.(\d+)(?:\.(\d+)\.([0-4]))?/);
  const now = Math.floor(Date.now() / 1000);
  let count = m ? Number(m[1]) : 0;
  const last = m ? Number(m[2]) : 0;
  const isNewVisit = !m || now - last > 1800;
  const newToday = !m || etDay(last * 1000) !== etDay(now * 1000);
  let first = m?.[3] ? Number(m[3]) : 0;
  let ad = m?.[4] ? Number(m[4]) : 0;
  if (!m) { first = now; ad = GOOGLE_CLICK ? 3 : URL_TAGS.utm_source ? 1 : 0; }
  if (isNewVisit) count++;
  const sticky = isNewVisit && count >= 2 && (ad === 1 || ad === 3) && !document.referrer && !Object.keys(URL_TAGS).length && first > 0 && now - first <= 14 * DAY_S;
  const stickyGclid = sticky && ad === 3;
  if (sticky) ad++;
  document.cookie = `wc_v=${count}.${now}${first ? `.${first}.${ad}` : ""}; Max-Age=34560000; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  return { count, isNewVisit, newToday, firstDay: first ? etDay(first * 1000) : null, retDays: first ? Math.floor((now - first) / DAY_S) : null, sticky, stickyGclid };
}

const VISIT = countVisit();
const { attr: ATTR, landed: LANDED } = attribution(VISIT.isNewVisit);
/** This page load's random id (pv), on all its events. */
const PV = newVisitToken();
/** The last thing this page did (an event type), for its exit. */
let LAST_EVENT: string | null = null;
const noteEvent = (type: string) => { LAST_EVENT = type; };

/** This page view's events so far (pv_seq on each; the exit says how many: sent). */
let PV_SEQ = 0;
/** ms from the page's start to the first press, touch, key or wheel (-1: none yet), for the exit. */
let FIRST_INPUT = -1;
for (const t of ["pointerdown", "touchstart", "keydown", "wheel"]) {
  addEventListener(t, () => { if (FIRST_INPUT < 0) FIRST_INPUT = Math.round(performance.now()); }, { capture: true, passive: true });
}

/** Sends one event body; `failed` runs only when sendBeacon refused it and the fetch fallback failed too. */
function deliver(payload: string, failed: () => void) {
  try {
    if (navigator.sendBeacon?.("/api/event", new Blob([payload], { type: "application/json" }))) return;
  } catch { /* fall through */ }
  fetch("/api/event", { method: "POST", body: payload, headers: { "content-type": "application/json" }, keepalive: true }).catch(failed);
}

/** Events that couldn't be sent wait in session storage (src/lib/beaconq.ts) and go again with the next one. */
const QUEUE_KEY = "wc_q";
function queueAgain(body: string, tries: number) {
  try { sessionStorage.setItem(QUEUE_KEY, JSON.stringify(enqueue(parseQueue(sessionStorage.getItem(QUEUE_KEY)), body, tries))); } catch { /* storage blocked: lost */ }
}
function flushQueue() {
  let waiting;
  try {
    waiting = parseQueue(sessionStorage.getItem(QUEUE_KEY));
    if (!waiting.length) return;
    sessionStorage.removeItem(QUEUE_KEY);
  } catch { return; }
  for (const x of drain(waiting)) deliver(x.body, () => queueAgain(x.body, x.tries + 1));
}

function sendEvent(body: Record<string, unknown>) {
  const exit = body.type === "exit";
  if (!exit) noteEvent(String(body.type));
  const count = exit
    ? { sent: PV_SEQ, interacted: FIRST_INPUT >= 0 ? 1 : 0, first_interaction_ms: FIRST_INPUT >= 0 ? FIRST_INPUT : undefined }
    : { pv_seq: ++PV_SEQ };
  const payload = JSON.stringify({ page: location.pathname, ...ATTR, pv: PV, ...count, ...body });
  flushQueue();
  deliver(payload, () => queueAgain(payload, 0));
}

/** True the first time it's asked for `key` in this visit (session storage; blocked storage says true). */
function firstInVisit(key: string): boolean {
  try { const first = sessionStorage.getItem(key) !== "1"; sessionStorage.setItem(key, "1"); return first; } catch { return true; }
}

/** Calls onSeen once, when el has been half on screen for a second while the tab is showing (src/lib/offerseen.ts). */
function whenSeen(el: HTMLElement, onSeen: () => void) {
  if (typeof IntersectionObserver !== "function") return;
  let onScreen = false;
  const sync = () => timer.update(onScreen && document.visibilityState === "visible");
  const timer = seenTimer(() => {
    io.disconnect();
    document.removeEventListener("visibilitychange", sync);
    if (el.isConnected) onSeen();
  });
  const io = new IntersectionObserver((entries) => { onScreen = halfOnScreen(entries[entries.length - 1]); sync(); }, { threshold: SEEN_THRESHOLDS });
  document.addEventListener("visibilitychange", sync);
  io.observe(el);
}

// ---------- calculators (new) ----------

/** The page's tool name for formula_view / chart_view: the first calculator on the page, else the page's slug. */
const PAGE_TOOL = document.querySelector<HTMLFormElement>("form[data-calc]")?.dataset.calc ?? (location.pathname.replace(/^\/|\/$/g, "").replace(/-calculator$/, "") || "home");

/** calc_run: once a result has been stable for this long, once per distinct set of inputs per calculator per page view. */
export const CALC_SETTLE_MS = 1500;

function readValues(form: HTMLFormElement, names: string[]): Values {
  const v: Values = {};
  for (const name of names) {
    const el = form.elements.namedItem(name);
    if (el instanceof HTMLInputElement) v[name] = el.type === "checkbox" ? (el.checked ? "on" : "") : el.value;
    else if (el instanceof HTMLSelectElement) v[name] = el.value;
  }
  return v;
}

function initCalc(form: HTMLFormElement) {
  const def = CALCS[form.dataset.calc ?? ""];
  const box = document.querySelector<HTMLElement>(`[data-result="${def?.id}"]`);
  if (!def || !box) return;
  const names = def.fields.map((f) => f.name);
  const sent = new Set<string>();
  let shown = box.innerHTML.trim();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const update = () => {
    const v = readValues(form, names);
    for (const f of def.fields) {
      if (!f.when) continue;
      const wrap = form.querySelector<HTMLElement>(`[data-field="${f.name}"]`);
      if (wrap) wrap.hidden = !f.when(v);
    }
    const out: Out = def.run(v);
    // Redraw only when the result changed: the change event that follows input (on blur) would otherwise replace the Copy
    // button under a tap that comes right after typing, and the tap would be lost.
    const html = resultHtml(out); // built from our own numbers, every value escaped (calculators.ts esc)
    if (html !== shown) { box.innerHTML = html; shown = html; }
    clearTimeout(timer);
    if (!out.ok) return;
    const key = `${out.inputs}|${out.result}`;
    timer = setTimeout(() => {
      if (sent.has(key)) return;
      sent.add(key);
      sendEvent({ type: "calc_run", tool: def.id, inputs: out.inputs, result: out.result, first: firstInVisit("wc_calc") });
    }, CALC_SETTLE_MS);
  };
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  form.addEventListener("submit", (ev) => { ev.preventDefault(); update(); });
}

function initCalcBlocks() {
  document.querySelectorAll<HTMLFormElement>("form[data-calc]").forEach(initCalc);
  // formula_view / chart_view: half on screen for a second (the dnsmailcheck offer_view rule), once per block per page view.
  document.querySelectorAll<HTMLElement>("[data-formula]").forEach((el) =>
    whenSeen(el, () => sendEvent({ type: "formula_view", tool: el.dataset.formula, section: el.dataset.formula })));
  document.querySelectorAll<HTMLElement>("[data-chart]").forEach((el) =>
    whenSeen(el, () => sendEvent({ type: "chart_view", tool: PAGE_TOOL, section: el.dataset.chart })));
  // copy_result: the result's Copy button (the result is redrawn on every input, so the listener sits on the document).
  document.addEventListener("click", async (ev) => {
    const btn = (ev.target as Element | null)?.closest?.("[data-copy]") as HTMLButtonElement | null;
    if (!btn) return;
    const text = btn.dataset.copy ?? "";
    // Logged first: a clipboard promise that never settles (seen in headless Chrome) mustn't lose the event.
    const tool = btn.closest(".calc-card")?.querySelector<HTMLFormElement>("form[data-calc]")?.dataset.calc ?? PAGE_TOOL;
    sendEvent({ type: "copy_result", tool, result: text.split("\n")[0].slice(0, 200) });
    try { await navigator.clipboard.writeText(text); btn.textContent = "Copied"; }
    catch { btn.textContent = "Select the result to copy it"; }
    setTimeout(() => { if (btn.isConnected) btn.textContent = "Copy result"; }, 2500);
  });
}

// ---------- section opens ----------

const slug = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

/** A stable name for a <details>: "faq:<question>", or the section's heading. */
function sectionId(d: HTMLDetailsElement): string {
  const summary = d.querySelector(":scope > summary")?.textContent;
  if (d.classList.contains("faq")) return `faq:${slug(summary)}`;
  return slug(d.closest("section")?.querySelector("h2")?.textContent ?? summary) || "section";
}

// ---------- engagement (dnsmailcheck pass #103, src/lib/engagement.ts) ----------

/** How this page was reached: navigate, reload, back_forward or prerender (PerformanceNavigationTiming). */
function navType(): string | undefined {
  try { return (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type; } catch { return undefined; }
}

/**
 * The scroll marks this visit already sent for this page (session storage). The visit is the Google click id when there is
 * one, so a reload with the same click id doesn't send them again; else the visit token. Reset after 30 minutes without a mark.
 */
const MARK_KEY = CLICK_IDS.map((k) => ATTR[k]).find(Boolean) ?? ATTR.visit_token;
type Marks = { t?: string; at?: number; p?: Record<string, number> };
function marksOfVisit(): Record<string, number> {
  try {
    const s = JSON.parse(sessionStorage.getItem("wc_sd") ?? "{}") as Marks;
    return s.t === MARK_KEY && Date.now() - (s.at ?? 0) <= 1_800_000 ? s.p ?? {} : {};
  } catch { return {}; }
}
const sentMark = (): number => marksOfVisit()[location.pathname] ?? 0;
function saveMark(mark: number) {
  try {
    const p = marksOfVisit();
    p[location.pathname] = mark;
    sessionStorage.setItem("wc_sd", JSON.stringify({ t: MARK_KEY, at: Date.now(), p }));
  } catch { /* storage blocked: marks may repeat on the next page view */ }
}

/**
 * Scroll marks (25/50/75/100% of the page, once each per page per visit), visible time, and the exit beacon: sent when the
 * tab goes hidden or the page goes (pagehide); coming back resumes the clock, and the later exit replaces the earlier one.
 */
function initEngagement() {
  const clock = engagedClock(document.visibilityState === "visible", performance.now());
  const exits = exitTracker(PV);
  let deepest = 0;
  let sent = sentMark();
  const measure = () => {
    const pct = scrollPercent(window.scrollY, window.innerHeight, document.documentElement.scrollHeight);
    deepest = Math.max(deepest, pct);
    for (const mark of newMarks(sent, pct)) { sent = mark; saveMark(mark); sendEvent({ type: "scroll_depth", mark }); }
  };
  let queued = false;
  const onScroll = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; measure(); }); };
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll, { passive: true });
  if (document.readyState === "complete") onScroll(); else addEventListener("load", onScroll, { once: true });
  // Where the page is going: a link to another page of ours.
  document.addEventListener("click", (ev) => {
    const a = (ev.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a || ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    const kind = linkKind(a.href, location.origin, location.pathname, a.target, a.hasAttribute("download"));
    if (kind) exits.linkClick(kind, performance.now());
  }, true);
  const send = (body: ReturnType<typeof exits.gone>) => { if (body) sendEvent({ ...body }); };
  document.addEventListener("visibilitychange", () => {
    const now = performance.now();
    if (document.visibilityState === "visible") { clock.set(true, now); exits.show(); return; }
    clock.set(false, now);
    send(exits.hide(now, clock.ms(now), deepest, LAST_EVENT));
  });
  addEventListener("pagehide", () => {
    const now = performance.now();
    clock.set(false, now);
    send(exits.gone(now, clock.ms(now), deepest, LAST_EVENT));
  });
  // Back from the back/forward cache: the same page view carries on.
  addEventListener("pageshow", (ev) => {
    if (!ev.persisted) return;
    clock.set(document.visibilityState === "visible", performance.now());
    exits.show();
  });
}

// ---------- init ----------

/**
 * Theme: the system preference until the visitor picks one here; the choice ("dark" or "light") is kept in localStorage
 * (the pre-paint script applies it). With no choice stored, a change of the system setting is followed live.
 */
function storedTheme(): string | null {
  try { return localStorage.getItem("theme"); } catch { return null; }
}
const SYSTEM_DARK = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
SYSTEM_DARK?.addEventListener?.("change", (ev) => {
  if (storedTheme() === "dark" || storedTheme() === "light") return;
  if (ev.matches) document.documentElement.dataset.theme = "dark"; else delete document.documentElement.dataset.theme;
  document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]").forEach((b) => b.setAttribute("aria-pressed", String(ev.matches)));
});

function bindThemeToggle(btn: HTMLButtonElement) {
  const sync = () => btn.setAttribute("aria-pressed", String(document.documentElement.dataset.theme === "dark"));
  sync();
  btn.hidden = false;
  btn.addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme !== "dark";
    if (dark) document.documentElement.dataset.theme = "dark"; else delete document.documentElement.dataset.theme;
    try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch { /* storage blocked: this page only */ }
    sync();
  });
}

function init() {
  const visit = VISIT;
  const referrerEmpty = document.referrer === "";
  // visit_count only on a new visit's landing page: visit_count 1 there is a browser's first visit (the return denominator).
  sendEvent({ type: "page_view", referrer_empty: referrerEmpty, landing_view: LANDED || undefined, new_today: visit.newToday || undefined,
    visit_count: visit.isNewVisit && LANDED ? visit.count : undefined, nav: navType() });
  initEngagement();
  if (visit.isNewVisit && visit.count >= 2) {
    sendEvent({ type: "return_visit", visit_count: visit.count, referrer_empty: referrerEmpty, first_day: visit.firstDay ?? undefined,
      ret_days: visit.retDays ?? undefined, sticky: visit.sticky || undefined, sticky_gclid: visit.stickyGclid || undefined });
  }

  // Which sections people open, once per section per page view. toggle doesn't bubble, so it's caught on the way down.
  const opened = new Set<string>();
  document.addEventListener("toggle", (ev) => {
    const d = ev.target;
    if (!(d instanceof HTMLDetailsElement) || d.classList.contains("nav-menu")) return; // the header menu isn't a section
    if (!d.open) return;
    const id = sectionId(d);
    if (opened.has(id)) return;
    opened.add(id);
    sendEvent({ type: "details_open", section: id });
  }, true);

  initCalcBlocks();
  // Tier 2 is off (config.features.thirdPartyTags); with GPC on, say that it's honored (California, from Jan 2026).
  const cfg = (() => { try { return JSON.parse(document.getElementById("client-config")?.textContent ?? "{}"); } catch { return {}; } })() as { thirdPartyTags?: boolean };
  initConsent(cfg.thirdPartyTags === true);
  if (gpcOn()) document.querySelectorAll<HTMLElement>("[data-gpc-note]").forEach((el) => { el.hidden = false; });
  document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]").forEach(bindThemeToggle);

  // The header's menu (a native <details>) closes on Escape, back to its button, and on a click outside it.
  document.querySelectorAll<HTMLDetailsElement>("details.nav-menu").forEach((menu) => {
    document.addEventListener("click", (ev) => { if (menu.open && !menu.contains(ev.target as Node)) menu.open = false; });
    menu.addEventListener("keydown", (ev) => {
      if (ev.key !== "Escape" || !menu.open) return;
      menu.open = false;
      menu.querySelector<HTMLElement>("summary")?.focus();
    });
  });
  // dnsmailcheck pass #114: init finished; the hit script's exit beacon reports it (app_ran).
  (window as unknown as { __wcApp?: number }).__wcApp = 1;
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
