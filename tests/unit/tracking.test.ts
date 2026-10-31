// The ported tracker, dashboard and site, against a real SQLite with migrations/ applied (dnsmailcheck's tests/helpers/d1.ts).
// Covers what dnsmailcheck's m1/internal/pass103/pass114/speed/seo tests covered for the ported parts, plus the new events
// and the Phase 4 numbers.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { testD1 } from "../helpers/d1";
import { postEvent } from "../../src/routes/event";
import { computeStats } from "../../src/lib/stats";
import { internalCookie, isInternal } from "../../src/lib/internal";
import { uaBotReason } from "../../src/lib/traffic";
import { HIT_INLINE, HIT_INLINE_SHA256 } from "../../src/lib/hits";
import { THEME_INLINE, THEME_INLINE_SHA256 } from "../../src/site/seo";
import { canonicalRedirect } from "../../src/worker";
import { allPages } from "../../src/site/pages";
import { CALCS, defaults } from "../../src/site/calculators";
import { config } from "../../src/config";
import { addDays, etDay, etStart } from "../../src/lib/etday";
import type { Env } from "../../src/env";

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const post = (env: Env, body: unknown, ua = UA, cookie = "") => postEvent(new Request("https://wirecalculators.com/api/event", {
  method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "content-type": "application/json", "user-agent": ua, cookie },
}), env);
const envOf = () => ({ DB: testD1(), ADMIN_SECRET: "s3cret" } as unknown as Env & { DB: ReturnType<typeof testD1> });
const rows = (env: ReturnType<typeof envOf>) => env.DB.raw.prepare("SELECT * FROM events ORDER BY id").all() as Record<string, unknown>[];

describe("POST /api/event", () => {
  it("stores calc_run with tool, inputs, result and the visit's first flag", async () => {
    const env = envOf();
    const res = await post(env, { type: "calc_run", page: "/voltage-drop-calculator", tool: "voltage-drop", inputs: "cu 12 AWG, 20 A", result: "6.91 V (5.76%)", first: true,
      pv: "abcdef0123456789", pv_seq: 3, visit_token: "0123456789abcdef", landing: "/voltage-drop-calculator", source: "direct" });
    expect(res.status).toBe(204);
    expect(res.headers.get("x-event-sink")).toBe("d1");
    const [r] = rows(env);
    expect(r).toMatchObject({ type: "calc_run", tool: "voltage-drop", inputs: "cu 12 AWG, 20 A", result: "6.91 V (5.76%)", first_in_visit: 1, pv_seq: 3, source: "direct", is_bot: 0, is_internal: 0 });
  });
  it("stores formula_view, chart_view (section) and copy_result (result)", async () => {
    const env = envOf();
    await post(env, { type: "formula_view", page: "/x", tool: "wire-size", section: "wire-size" });
    await post(env, { type: "chart_view", page: "/x", tool: "conduit-fill", section: "fill-emt" });
    await post(env, { type: "copy_result", page: "/x", tool: "ohms-law", result: "120 V · 10 A" });
    expect(rows(env).map((r) => [r.type, r.tool, r.section, r.result])).toEqual([
      ["formula_view", "wire-size", "wire-size", null], ["chart_view", "conduit-fill", "fill-emt", null], ["copy_result", "ohms-law", null, "120 V · 10 A"]]);
  });
  it("rejects bad bodies", async () => {
    const env = envOf();
    expect((await post(env, { type: "purchase" })).status).toBe(400); // a dnsmailcheck server-only type
    expect((await post(env, { type: "calc_run", tool: "voltage-drop", result: "1 V" })).status).toBe(400); // no inputs
    expect((await post(env, { type: "calc_run", tool: "Bad Tool!", inputs: "x", result: "y" })).status).toBe(400);
    expect((await post(env, "{")).status).toBe(400);
    expect((await post(env, "x".repeat(4001))).status).toBe(413);
    expect(rows(env)).toHaveLength(0);
  });
  it("return_visit keeps ret_days, first_day and the sticky flag", async () => {
    const env = envOf();
    await post(env, { type: "return_visit", page: "/", visit_count: 2, referrer_empty: true, first_day: "2026-10-20", ret_days: 3, sticky: true, sticky_gclid: true });
    expect(rows(env)[0]).toMatchObject({ visit_count: 2, ret_days: 3, first_day: "2026-10-20", status: "sticky_gclid", referrer_empty: 1 });
  });
  it("flags bots by user agent and internal traffic by test tag and by the signed cookie", async () => {
    const env = envOf();
    await post(env, { type: "page_view", page: "/" }, "Mozilla/5.0 HeadlessChrome/140");
    await post(env, { type: "page_view", page: "/", utm_source: "test" });
    const cookie = (await internalCookie("s3cret")).split(";")[0];
    await post(env, { type: "page_view", page: "/" }, UA, cookie);
    expect(rows(env).map((r) => [r.is_bot, r.bot_reason, r.is_internal])).toEqual([[1, "headless", 0], [0, null, 1], [0, null, 1]]);
    expect(uaBotReason("curl/8.0")).toBe("ua");
    expect(await isInternal(new Request("https://x/", { headers: { cookie: `${cookie.slice(0, -1)}0` } }), "s3cret")).toBe(false);
  });
});

describe("Phase 4 numbers (/admin/stats)", () => {
  it("cost per visit, visits, 14-day returns without ads split by ads paused/running, calc runs per visitor", async () => {
    const env = envOf();
    const db = env.DB.raw;
    const now = Date.now();
    const cohortDay = addDays(etDay(now), -20);
    const t0 = etStart(cohortDay) + 15 * 3_600_000;
    const ins = db.prepare(`INSERT INTO events (ts, day, type, page, status, visit_count, new_today, source, gclid, ret_days, first_day, first_in_visit, visit_token, tool)
      VALUES (?, '', ?, '/', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    // 20 first visits: 10 from Google Ads (gclid), 10 direct.
    for (let i = 0; i < 20; i++) {
      const g = i < 10 ? `Cj0KCQjwTEST${String(i).padStart(12, "0")}abc` : null;
      ins.run(t0 + i * 60_000, "page_view", "landing", 1, 1, g ? "gclid" : "direct", g, null, null, null, `tok${i}`.padEnd(16, "x"), null);
    }
    // 5 calc runs, 2 visits with one.
    for (let i = 0; i < 5; i++) ins.run(t0 + 100_000 + i, "calc_run", null, null, null, "direct", null, null, null, i < 2 ? 1 : 0, "tok0".padEnd(16, "x"), "voltage-drop");
    // Returns (first return, within 14 days): 3 direct on day +2 (ads paused), 1 direct on day +5 (ads running), 1 via an ad.
    const ret = (days: number, source: string) => ins.run(t0 + days * 86_400_000, "return_visit", null, 2, null, source, null, days, cohortDay, null, null, null);
    ret(2, "direct"); ret(2, "direct"); ret(2, "organic"); ret(5, "direct"); ret(6, "gclid");
    ret(20, "direct"); // too late: not within 14 days
    // Google's report: $4.00 on the cohort day, clicks on day +5 (running); nothing on day +2 (paused).
    const camp = db.prepare("INSERT INTO ads_campaigns_daily (date, campaign_id, clicks, cost_micros, updated_at) VALUES (?, 'c1', ?, ?, 0)");
    camp.run(cohortDay, 10, 4_000_000);
    camp.run(addDays(cohortDay, 5), 3, 1_000_000);
    db.prepare("INSERT INTO ads_ingests (at, dates) VALUES (?, '')").run(t0 - 86_400_000);
    const s = await computeStats(env.DB, { from: cohortDay, to: etDay(now), includeBots: false, includeInternal: false }, now);
    const p = s.phase4;
    expect(p.visits).toBe(20);
    expect(p.paidVisits).toBe(10);
    expect(p.costMicros).toBe(5_000_000);
    expect(p.costPerVisit).toBe(500_000); // $5.00 / 10 paid visits
    expect(p.cohort).toBe(20);
    expect(p.returned).toMatchObject({ num: 5, den: 20, pct: 25 });
    expect(p.returnedNoAds).toMatchObject({ num: 4, den: 20, pct: 20 });
    expect(p.returnedNoAdsPaused.num).toBe(3);
    expect(p.returnedNoAdsRunning.num).toBe(1);
    expect(p.verdict).toBe("pass"); // 20% >= 15%
    expect(p.calcRuns).toBe(5);
    expect(p.calcRunsPerVisitor).toBe(0.25); // 5 / 20 unique visitors
    expect(p.visitsWithCalc.num).toBe(2);
  });
});

describe("site", () => {
  const pages = allPages();
  it("inline scripts match their CSP hashes", () => {
    const h = (s: string) => createHash("sha256").update(s).digest("base64");
    expect(h(HIT_INLINE)).toBe(HIT_INLINE_SHA256);
    expect(h(THEME_INLINE)).toBe(THEME_INLINE_SHA256);
  });
  it("www and plain http go to https://wirecalculators.com", () => {
    expect(canonicalRedirect(new Request("https://www.wirecalculators.com/ampacity-chart?a=1"))!.headers.get("location")).toBe("https://wirecalculators.com/ampacity-chart?a=1");
    expect(canonicalRedirect(new Request("https://wirecalc-site.clutcharchive2006.workers.dev/"))).toBeNull();
  });
  it("brand text never says NEC; titles are unique", () => {
    expect(config.brandName).not.toMatch(/\bNEC\b/);
    expect(new Set(pages.map((p) => p.title)).size).toBe(pages.length);
    for (const p of pages) expect(p.title.split("|").pop()).not.toMatch(/\bNEC\b/);
  });
  it("every calculator page has the calculator, formula (MathML), code reference, worked example, editions note and AHJ line", () => {
    for (const p of pages.filter((x) => x.path.endsWith("-calculator"))) {
      expect(p.body, p.path).toContain('data-calc="');
      expect(p.body, p.path).toContain("<math");
      expect(p.body, p.path).toMatch(/Code\sreference/);
      expect(p.body, p.path).toContain("data-example");
      expect(p.body, p.path).toContain(config.editionsLine);
      expect(p.body, p.path).toContain(config.ahjLine);
    }
  });
  it("every calculator's default inputs give a result", () => {
    for (const c of Object.values(CALCS)) expect(c.run(defaults(c)).ok, c.id).toBe(true);
  });
  it("no paid features, accounts or dnsmailcheck copy on any page", () => {
    for (const p of pages) expect(p.body, p.path).not.toMatch(/dnsmailcheck|DNS Mail Check|Watch my domain|Stripe|Sign in|checkout|DMARC/i);
  });
});

describe("privacy, Tier 1 (privacy-consent-research.md §0.1)", () => {
  it("stores no IP address in any form, and no user agent", async () => {
    const env = envOf();
    const ip = "203.0.113.77";
    await postEvent(new Request("https://wirecalculators.com/api/event", { method: "POST", body: JSON.stringify({ type: "page_view", page: "/" }),
      headers: { "content-type": "application/json", "user-agent": UA, "cf-connecting-ip": ip, "x-forwarded-for": ip, "x-real-ip": ip } }), env);
    const all = JSON.stringify(rows(env));
    expect(all).not.toContain("203.0.113");
    expect(all).not.toContain("Safari");
    const cols = (env.DB.raw.prepare("PRAGMA table_info(events)").all() as { name: string }[]).map((c) => c.name)
      .concat((env.DB.raw.prepare("PRAGMA table_info(ad_hits)").all() as { name: string }[]).map((c) => c.name));
    expect(cols.filter((c) => /(^|_)ip($|_)|user_agent|^ua$/.test(c))).toEqual([]);
  });
  it("never puts typed text in calc_run: the generator's load names stay in the browser", () => {
    const g = CALCS["generator-size"];
    const o = g.run({ ...defaults(g), name1: "Jane's garage freezer", name2: "555-0100" });
    expect(`${o.inputs} ${o.result}`).not.toMatch(/Jane|freezer|555/);
  });
  it("the Tier 2 flag is off: no third-party tags", () => {
    expect(config.features.thirdPartyTags).toBe(false);
  });
});

describe("results show the inputs, the formula with the numbers, and the code reference", () => {
  it("every calculator's default result has all three", () => {
    for (const c of Object.values(CALCS)) {
      const o = c.run(defaults(c));
      expect(o.echo, c.id).toBeTruthy();
      expect(o.math?.length, c.id).toBeGreaterThan(0);
      expect(o.math!.some((m) => /\d/.test(m) && /=/.test(m)), c.id).toBe(true);
      expect(o.cite, c.id).toBeTruthy();
    }
  });
  it("wire size says which limit decided the size and that 240.4(D) and 110.14(C) were applied", () => {
    const w = CALCS["wire-size"];
    const o = w.run({ ...defaults(w), amps: "20", term: "75" });
    const rows2 = Object.fromEntries(o.rows);
    expect(o.headline).toBe("12 AWG copper");
    expect(rows2["What decided the size"]).toMatch(/^240\.4\(D\): 14 AWG/);
    expect(rows2["Checks applied"]).toMatch(/240\.4\(D\).*110\.14\(C\)/);
    expect(o.math!.join(" ")).toMatch(/90 °C column/);
  });
  it("voltage drop's 120/240 V 3-wire preset uses 240 V line to line", () => {
    const vd = CALCS["voltage-drop"];
    const o = vd.run({ ...defaults(vd), system: "split", amps: "20", feet: "100", size: "12" });
    expect(o.headline).toBe("6.91 V drop (2.88%)");
    expect(Object.fromEntries(o.rows)["Each 120 V leg"]).toMatch(/^3\.46 V/);
  });
  it("conduit fill shows the Note 7 max count beside the fill", () => {
    const cf = CALCS["conduit-fill"];
    const o = cf.run({ ...defaults(cf), raceway: "pvc40", trade: "3/4", size1: "14", count1: "10" });
    expect(o.sub).toMatch(/Most that fit: 21 × 14 AWG \(Note 7 applied\)/);
  });
});
