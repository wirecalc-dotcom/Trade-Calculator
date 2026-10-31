// The one place for brand strings, URLs and feature flags (same role as dnsmailcheck's src/config.ts).
// Changing the real domain or name later is an edit here and nowhere else.

export const config = {
  brandName: "Wire Calculators",
  siteUrl: "https://wirecalculators.com", // no trailing slash
  // Receives mail once Cloudflare Email Routing is set up on wirecalculators.com (Colin: docs/setup-steps in the report).
  supportEmail: "support@wirecalculators.com",
  /** One line under every calculator. */
  ahjLine: "Verify against your adopted code edition and your authority having jurisdiction (AHJ).",
  /** Research §0.6: the values used are identical in NEC 2017, 2020, 2023 and 2026. */
  editionsLine: "Same in NEC 2017, 2020, 2023 and 2026.",

  // false while the site is a preview: every response says X-Robots-Tag: noindex, nofollow, pages carry a robots meta tag,
  // and robots.txt disallows everything (dnsmailcheck ran as a noindex preview until its launch the same way). Stays false
  // until the table values pass the NFPA 70 check (calculator-math-research.md §9). Google Ads landing pages work either way.
  indexable: false,

  features: {
    // Display ads (AdSense): off. The privacy page's advertising section follows it.
    adsEnabled: false,
  },
} as const;
