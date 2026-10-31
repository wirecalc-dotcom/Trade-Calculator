// Fires one of each tracking event on a deployed site in a real browser, tagged as internal test traffic (utm_source=test),
// with a unique run id in utm_content so the rows can be found: npx tsx scripts/track-check.ts <base-url>
// Then query wirecalc-db for utm_content = the printed run id (the command is printed at the end).
// Events: page_view (landing), return_visit (a wc_v cookie aged 2 days), calc_run, formula_view, chart_view, copy_result,
// scroll_depth, exit; the tagged landing's ad_hits row with its rungs (pixel, boot, exit); landing_404.

import { chromium } from "playwright";

const base = (process.argv[2] ?? "").replace(/\/$/, "");
if (!/^https?:\/\//.test(base)) { console.error("usage: npx tsx scripts/track-check.ts <base-url>"); process.exit(2); }
const run = `trk${Date.now().toString(36)}`;
const gclid = `Test${run}Cj0KCQjw${"x".repeat(24)}`; // well-formed shape: 20+ chars, letters
const tags = `utm_source=test&utm_campaign=test-track&utm_content=${run}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
// A returning browser: first visit 2 days ago, last seen 2 hours ago (a new visit), no ad first.
const now = Math.floor(Date.now() / 1000);
await ctx.addCookies([{ name: "wc_v", value: `1.${now - 7200}.${now - 2 * 86400}.0`, url: base }]);
const page = await ctx.newPage();
const sent: string[] = [];
page.on("request", (r) => { if (r.url().endsWith("/api/event")) { try { sent.push(JSON.parse(r.postData() ?? "{}").type); } catch { /* */ } } });

await page.goto(`${base}/voltage-drop-calculator?${tags}&gclid=${gclid}`, { waitUntil: "networkidle" });
await page.fill('form[data-calc="voltage-drop"] [name="amps"]', "15");
await page.waitForTimeout(2200); // calc_run settles after 1.5 s
await page.locator("[data-formula]").scrollIntoViewIfNeeded();
await page.waitForTimeout(1600); // formula_view: half on screen for 1 s
await page.locator('[data-result="voltage-drop"] [data-copy]').click();
await page.waitForTimeout(500);
await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
await page.waitForTimeout(800);
// Next page of the same visit: the conduit fill chart.
await page.click('footer a[href="/conduit-fill-calculator"]');
await page.waitForLoadState("networkidle");
await page.locator("[data-chart]").first().scrollIntoViewIfNeeded();
await page.waitForTimeout(1600);
await page.goto(`${base}/no-such-page?${tags}`, { waitUntil: "networkidle" }); // landing_404, and the exit of the page before
await page.waitForTimeout(800);
await page.close(); // pagehide
await ctx.close();
await browser.close();
console.log(`run id: ${run}`);
console.log(`gclid: ${gclid}`);
console.log(`browser sent: ${sent.join(", ")}`);
console.log(`check: npx wrangler d1 execute wirecalc-db --remote --command "SELECT type, page, tool, inputs, result, section, status, visit_count, ret_days, source, is_internal, is_bot FROM events WHERE utm_content = '${run}' ORDER BY id"`);
