// Playwright check of every page at 390 px and 1280 px (dnsmailcheck's browser-check did the same with Chrome over CDP).
// For each page and width: no horizontal scroll, no console errors or failed requests, and on each calculator one known case
// from tests/unit/calc.test.ts typed into the real inputs, with the result read back from the page.
// Usage: npx tsx scripts/browser-check.ts [base-url] [--shots=dir]   (default base: http://127.0.0.1:8787)
// Requests carry ?utm_source=test so the tracker marks them internal (src/lib/internal.ts rule 1); Playwright is also a bot by UA.

import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const base = (process.argv.find((a: string) => /^https?:\/\//.test(a)) ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const shots = process.argv.find((a: string) => a.startsWith("--shots="))?.slice(8) ?? null;
if (shots) mkdirSync(shots, { recursive: true });

type Case = { set: [string, string][]; expect: RegExp; check?: [string, string][] };
const fill = async (page: Page, calc: string, set: [string, string][]) => {
  for (const [name, value] of set) {
    const el = page.locator(`form[data-calc="${calc}"] [name="${name}"]`);
    const tag = await el.evaluate((n) => n.tagName);
    if (tag === "SELECT") await el.selectOption(value);
    else if ((await el.getAttribute("type")) === "checkbox") { if ((value === "on") !== (await el.isChecked())) await el.click(); }
    else await el.fill(value);
  }
};

const PAGES: { path: string; calc?: string; cases?: Case[]; text?: RegExp }[] = [
  { path: "/", text: /Electrical calculators that show their\swork/ },
  // PDHonline E426 Ex.7: 10 AWG Cu, steel, 10 A, 100 ft, 1ph, PF 0.9 -> 2.215 V
  { path: "/voltage-drop-calculator", calc: "voltage-drop", cases: [{ set: [["system", "1"], ["volts", "120"], ["amps", "10"], ["feet", "100"], ["material", "cu"], ["size", "10"], ["conduit", "steel"], ["pf", "0.9"], ["sets", "1"]], expect: /2\.21 V drop/ }] },
  // Note 7: 21 x 14 AWG THHN in 3/4 PVC 40 fits, 22 doesn't
  { path: "/conduit-fill-calculator", calc: "conduit-fill", cases: [
    { set: [["raceway", "pvc40"], ["trade", "3/4"], ["size1", "14"], ["count1", "21"]], expect: /^Fits:/, check: [["Most 14 AWG in 3 4 in", "21"]] },
    { set: [["count1", "22"]], expect: /^Too full:/ },
  ] },
  // 2500 W at 240 V: 10.417 A, 23.04 ohm
  { path: "/ohms-law-calculator", calc: "ohms-law", cases: [{ set: [["v", "240"], ["i", ""], ["r", ""], ["p", "2500"]], expect: /10\.417 A · 23\.04 Ω/ }] },
  // ecalpro: 6 AWG THHN, 40 C (104 F), 75 C terminals, 65 A
  { path: "/wire-size-calculator", calc: "wire-size", cases: [{ set: [["amps", "65"], ["material", "cu"], ["insulation", "90"], ["term", "75"], ["ambient", "104"], ["ccc", "3"]], expect: /^6 AWG copper$/ }] },
  // Murdoch's: 3,600 W starting (conservative)
  { path: "/generator-size-calculator", calc: "generator-size", cases: [{ set: [["method", "conservative"], ["buffer", "0"]], expect: /^3,600 W starting, 1,400 W running$/ }] },
  // PDHonline: 15 kW at 480 V 3ph -> 18.04 A
  { path: "/amps-to-watts-calculator", calc: "amps-to-watts", cases: [{ set: [["mode", "w2a"], ["system", "3"], ["volts", "480"], ["watts", "15000"], ["pf", "1"]], expect: /^18\.04 A$/ }] },
  { path: "/ampacity-chart", text: /Copper ampacity/ },
  { path: "/privacy", text: /Privacy/ },
  { path: "/terms", text: /Terms/ },
];

const browser = await chromium.launch();
let failures = 0;
let checks = 0;
const ok = (cond: boolean, what: string) => { checks++; if (!cond) { failures++; console.log(`  FAIL ${what}`); } };

for (const width of [390, 1280]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  for (const p of PAGES) {
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("requestfailed", (r) => { if (!r.url().includes("cloudflareinsights")) errors.push(`request failed ${r.url()} ${r.failure()?.errorText}`); });
    const res = await page.goto(`${base}${p.path}?utm_source=test&utm_campaign=test-browser-check`, { waitUntil: "networkidle" });
    ok(res?.status() === 200, `${p.path} @${width}: status ${res?.status()}`);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(over <= 0, `${p.path} @${width}: horizontal scroll ${over}px`);
    if (p.text) ok(p.text.test(await page.locator("main").innerText()), `${p.path} @${width}: text ${p.text}`);
    for (const c of p.cases ?? []) {
      await fill(page, p.calc!, c.set);
      const head = page.locator(`[data-result="${p.calc}"] .calc-headline`);
      await page.waitForTimeout(100);
      const got = (await head.innerText()).trim();
      ok(c.expect.test(got), `${p.path} @${width}: ${JSON.stringify(c.set)} -> "${got}" (want ${c.expect})`);
      for (const [label, value] of c.check ?? []) {
        const rows = await page.locator(`[data-result="${p.calc}"] .calc-rows > div`).allInnerTexts();
        const row = rows.find((r) => r.replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").includes(label));
        ok(!!row && row.includes(value), `${p.path} @${width}: row "${label}" = ${value} (got ${row})`);
      }
      const over2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      ok(over2 <= 0, `${p.path} @${width}: horizontal scroll after result ${over2}px`);
    }
    if (shots) await page.screenshot({ path: join(shots, `${p.path === "/" ? "home" : p.path.slice(1)}-${width}.png`), fullPage: true });
    ok(errors.length === 0, `${p.path} @${width}: console/network errors: ${errors.join(" | ")}`);
    await page.close();
  }
  await ctx.close();
}
await browser.close();
console.log(`${checks - failures} of ${checks} checks passed on ${base} (${PAGES.length} pages x 2 widths)`);
process.exit(failures ? 1 : 0);
