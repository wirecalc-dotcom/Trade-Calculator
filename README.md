# Wire Calculators (wirecalculators.com)

Free electrical calculators for working electricians: voltage drop, conduit fill, Ohm's law, wire size, generator size, amps ↔ watts, and an ampacity chart. Built as a clone of dnsmailcheck's stack (one Cloudflare Worker with static assets, same analytics and click tracking, same UI system), rebranded, with every dnsmailcheck product feature removed. How dnsmailcheck is built and what was ported: [docs/dnsmailcheck-setup.md](docs/dnsmailcheck-setup.md). Steps only Colin can do: [docs/setup-steps.md](docs/setup-steps.md).

Live preview: https://wirecalc-site.clutcharchive2006.workers.dev (noindex until the NFPA 70 check; `config.indexable`).

## Run locally

```sh
npm install
cp .dev.vars.example .dev.vars        # then fill in local values
npm run db:migrate:local              # local D1 only
npm run dev                           # wrangler dev on :8787 (runs `npm run build` first)
```

## Build, test, deploy

```sh
npm run build                 # public/: every page, app.js, styles.css, robots.txt, sitemap.xml
npm test                      # math (tests/unit/calc.test.ts) and tracking/site tests
npm run typecheck
npx tsx scripts/browser-check.ts <base-url> [--shots=dir]   # Playwright, every page at 390 and 1280 px
npx tsx scripts/track-check.ts <base-url>                   # fires every tracking event; prints the D1 query to check them
npx --yes wrangler deploy                                   # builds, then deploys the Worker
```

CI (`.github/workflows/test.yml`) runs the math tests, the tracking/site tests, the type check and the build on every push.

## Layout

| Path | What |
|---|---|
| `src/lib/calc.ts` | The one math module: a port of `docs/research/calc_reference.py` (same tables, same functions) plus marked extras |
| `src/site/calculators.ts` | Each calculator's fields and result, shared by the build (default result in the HTML) and the page script |
| `src/site/pages.ts` | Page list, MathML formulas, worked examples and reference charts computed from `calc.ts` |
| `content/` | Page copy, one Markdown file per page (`content/README.md`) |
| `src/client/app.ts` | Page script: calculators, dnsmailcheck's tracker, new events (calc_run, formula_view, chart_view, copy_result) |
| `src/worker.ts`, `src/routes/`, `src/lib/` | Worker: redirects, headers, `/api/event`, ad-hit rungs, `/api/ads-ingest`, `/admin/stats`, `/admin/clicks`, `/admin/internal`, retention cron |
| `migrations/` | D1 schema (`wirecalc-db`) |
| `site/static/` | styles.css (tokens), font, icons |
| `scripts/google-ads/wirecalc-export.js` | Google Ads Script: clicks, search terms, keywords and cost to `/api/ads-ingest` hourly |
