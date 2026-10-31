// Playwright privacy check (docs/research/privacy-consent-research.md §5): load every page with no consent given, then again
// with Global Privacy Control on (navigator.globalPrivacyControl = true and the Sec-GPC: 1 header). On both passes, assert
// zero requests to google*, doubleclick*, googletagmanager*, clarity*, facebook*, or any host other than the site itself and
// Cloudflare's own Web Analytics beacon; with GPC on, the footer's confirmation line shows.
// Usage: npx tsx scripts/privacy-check.ts [base-url]   (default https://wirecalculators.com)

import { chromium } from "playwright";

const base = (process.argv.find((a: string) => /^https?:\/\//.test(a)) ?? "https://wirecalculators.com").replace(/\/$/, "");
const site = new URL(base).hostname;
const PAGES = ["/", "/voltage-drop-calculator", "/conduit-fill-calculator", "/ohms-law-calculator", "/wire-size-calculator",
  "/generator-size-calculator", "/amps-to-watts-calculator", "/ampacity-chart", "/privacy", "/terms"];
const BANNED = /(^|\.)(google[a-z-]*|doubleclick|googletagmanager|googleadservices|googlesyndication|clarity|facebook|fbcdn)\./i;
const ALLOWED = (host: string) => host === site || host === "static.cloudflareinsights.com" || host === "cloudflareinsights.com";

const browser = await chromium.launch();
let checks = 0;
let failures = 0;
const ok = (cond: boolean, what: string) => { checks++; if (!cond) { failures++; console.log(`  FAIL ${what}`); } };

for (const gpc of [false, true]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, extraHTTPHeaders: gpc ? { "Sec-GPC": "1" } : {} });
  // A string, not a function: tsx rewrites functions with a __name helper that doesn't exist in the page.
  if (gpc) await ctx.addInitScript('Object.defineProperty(Navigator.prototype, "globalPrivacyControl", { get: function () { return true; }, configurable: true });');
  const hosts = new Set<string>();
  ctx.on("request", (r) => { try { hosts.add(new URL(r.url()).hostname); } catch { /* data: urls */ } });
  for (const path of PAGES) {
    const page = await ctx.newPage();
    const before = new Set(hosts);
    await page.goto(`${base}${path}?utm_source=test&utm_campaign=test-privacy-check`, { waitUntil: "networkidle" });
    // Use the page a little so anything lazy would load: scroll, type into the first calculator, wait for calc_run.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const input = page.locator('form[data-calc] input[inputmode="decimal"]').first();
    if (await input.count()) { await input.fill("7"); await page.waitForTimeout(1800); }
    const mine = [...hosts].filter((h) => !before.has(h));
    const banned = mine.filter((h) => BANNED.test(h));
    const other = mine.filter((h) => !ALLOWED(h));
    ok(banned.length === 0, `${gpc ? "GPC" : "no consent"} ${path}: requests to ${banned.join(", ")}`);
    ok(other.length === 0, `${gpc ? "GPC" : "no consent"} ${path}: third-party hosts ${other.join(", ")}`);
    if (gpc) ok(await page.locator("[data-gpc-note]").isVisible(), `GPC ${path}: confirmation line visible`);
    else ok(!(await page.locator("[data-gpc-note]").isVisible()), `no consent ${path}: GPC line hidden`);
    await page.close();
  }
  console.log(`${gpc ? "GPC on" : "no consent"}: hosts requested: ${[...hosts].sort().join(", ")}`);
  await ctx.close();
}
await browser.close();
console.log(`${checks - failures} of ${checks} privacy checks passed on ${base} (${PAGES.length} pages, no consent and GPC on)`);
process.exit(failures ? 1 : 0);
