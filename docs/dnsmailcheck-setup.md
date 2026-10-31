# dnsmailcheck setup audit (read-only, 31 Oct 2026)

Source read: `clutcharchive2006-glitch/email-checker`, local `main` at `097ee25` ("Asset mode..."), exported with `git archive` from `~/email-checker` (checked out in `~/email-checker-asset`). GitHub's `main` is 6 commits behind (`aee6405`); the 6 local commits are the "asset mode" pass (paid plans paused, crons off, DNS checks moved into the browser). Nothing in either folder was changed.

Paths below are relative to the dnsmailcheck repo root. Secret **names** only, never values.

---

## 1. Hosting

| Item | dnsmailcheck |
|---|---|
| Cloudflare account | `Clutcharchive2006@gmail.com's Account`, id `7d7dca81744b302a5cdcd2e322488b2a`, login **clutcharchive2006@gmail.com** (CLAUDE.md here says "the stackbrief.co login"; the live wrangler login and every dnsmailcheck resource are on clutcharchive2006) |
| Pages / Workers | **One Worker with static assets** (`wrangler.toml` comment: "migrated from Pages + Functions"). No Pages project. |
| Worker name | `email-checker` |
| Framework / build tool | No framework. TypeScript, `esbuild` (client bundles), `tsx scripts/build.ts` (renders `content/*.md` into `public/*.html`). |
| Node | Not pinned (no `engines`, no `.nvmrc`). Machine has v24.15.0. The test D1 shim needs `node:sqlite` (Node 22.5+). |
| Build command | `npm run build` = `tsx scripts/build.ts`; wrangler runs it before every `dev`/`deploy` (`[build] command`). |
| Output folder | `public/` (gitignored), bound as `ASSETS`. |
| Deploy method | Manual: `npx --yes wrangler deploy`. **No CI** (no `.github/`). A local pre-push hook (`.githooks/pre-push`) runs typecheck, unit tests, a layout sweep and a Stripe copy check. |
| workers.dev / preview URLs | `workers_dev = false`, `preview_urls = false` (Durable Objects block version preview URLs). |

### Folder tree (2 levels)

```
.githooks/            pre-push gate
content/  content/guides/   page copy, one .md per page
data/                 Public Suffix List
docs/  docs/outreach/  docs/research/
migrations/           29 D1 migrations (0001-0029)
scripts/  scripts/google-ads/   build, browser checks, layout sweep, Ads Script
site/  site/static/   static files copied to public/ (styles.css, fonts, icons)
smtp-probe/  smtp-probe/src/    SMTP test service on a VPS
src/  src/checks/ src/client/ src/lib/ src/routes/ src/site/
tests/  tests/baseline/ tests/fixtures/ tests/helpers/ tests/integration/ tests/unit/
```

### wrangler.toml (every binding)

```toml
name = "email-checker"
main = "src/worker.ts"
compatibility_date = "2026-10-01"
workers_dev = false
preview_urls = false
routes = [
  { pattern = "dnsmailcheck.com", custom_domain = true },
  { pattern = "www.dnsmailcheck.com", custom_domain = true },
]
[dev]
upstream_protocol = "https"
[build]
command = "npm run build"
watch_dir = ["src", "site", "data", "content"]
[assets]
directory = "./public"
binding = "ASSETS"
not_found_handling = "404-page"
html_handling = "auto-trailing-slash"
run_worker_first = true
[vars]
GOOGLE_CLIENT_ID = "<public OAuth client id>"
[observability]
enabled = true
head_sampling_rate = 1
[observability.logs]
invocation_logs = false   # privacy: would keep URLs and IPs
[triggers]
crons = []                # asset mode; was ["0 7 * * *", "30 7 * * *", "*/15 * * * *"]
[limits]
subrequests = 150_000
[[durable_objects.bindings]]
name = "LIMITER"
class_name = "IpLimiter"
[[migrations]]
tag = "v1"
new_sqlite_classes = ["IpLimiter"]
[[d1_databases]]
binding = "DB"
database_name = "email-checker"
database_id = "fcbc9340-..."
migrations_dir = "migrations"
# queues RUA_QUEUE / email-checker-dmarc: commented out (asset mode)
[[kv_namespaces]]
binding = "KV"
id = "f9c14626..."        # title "email-checker"
```

| Binding type | Present |
|---|---|
| D1 | `DB` → `email-checker` |
| KV | `KV` → `email-checker` (DNS result cache, Google JWKS cache) |
| R2 | none bound (`RUA_RAW` optional in `src/env.ts`, never bound) |
| Analytics Engine | **none** |
| Queues | none bound (queue `email-checker-dmarc` exists in the account, unbound) |
| Durable Objects | `LIMITER` (`IpLimiter`, per-IP rate limits) |

### Env vars and secrets (names)

- Deployed secrets (`wrangler secret list`, 31 Oct): `ADMIN_SECRET`, `ADS_INGEST_SECRET`, `GOOGLE_CLIENT_SECRET`, `IP_HASH_SALT`, `RESEND_API_KEY`, `RESEND_FROM`, `SMTP_PROBE_KEY`, `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`.
- Var: `GOOGLE_CLIENT_ID`.
- Declared in `src/env.ts` but optional / local only: `EMAIL_SAMPLES_KEY`, `SPAMHAUS_DQS_KEY`, `SMTP_PROBE_URL`, `RESEND_API_URL`, `GOOGLE_REDIRECT_URI`, `GOOGLE_AUTH_URL`, `GOOGLE_TOKEN_URL`, `GOOGLE_JWKS_URL`.
- Local: `.dev.vars` (gitignored), template `.dev.vars.example`.

### Custom domain and DNS

- `dnsmailcheck.com` is on Cloudflare Registrar in the same account (nameservers `lina` / `tim`.ns.cloudflare.com).
- Connected as **Workers Custom Domains** (`custom_domain = true` routes for the apex and `www`); Cloudflare creates the DNS records and certificates.
- www → apex and http → https are done **in the Worker** (`canonicalRedirect` in `src/worker.ts`, 301 to `config.siteUrl`).
- HSTS `max-age=31536000` (no includeSubDomains, no preload).

### _headers / _redirects / _routes.json

- `_headers`: generated by `scripts/build.ts` from `src/site/seo.ts` (`headersFile()`). Because `run_worker_first = true`, the Worker sets the same headers in code (`withSecurityHeaders`), plus `X-Robots-Tag` per URL and the CSP on HTML.
- `_redirects`: none (redirects are in `src/worker.ts`: `MOVED_PAGES`).
- `_routes.json`: none (not a Pages project).

---

## 2. Analytics matrix

| Tool | Used | Where |
|---|---|---|
| Cloudflare Web Analytics | Yes, **zone-injected** (no snippet in the repo). CSP allows `static.cloudflareinsights.com` / `cloudflareinsights.com` (`src/site/seo.ts` `CF_ANALYTICS`). Disclosed in `content/privacy.md`. A fetch of the live home page on 31 Oct showed no beacon tag in the HTML, so it may be off or injected only on some responses: check in the dashboard. |
| GA4 | **none** |
| Google Ads tag (gtag / AW-) | **none**. Conversions go to Google Ads by **offline import** of a CSV (`/admin/conversions.csv`). |
| Microsoft Clarity | **none** |
| Custom first-party tracker | Yes: the core of the matrix (below). |
| Logs | Workers Logs (`[observability]`), own `console` output only, invocation logs off. |
| Google Ads data import | Google Ads Script `scripts/google-ads/dnsmailcheck-export.js` POSTs clicks, search terms, keywords and campaign cost hourly to `/api/ads-ingest` (bearer `ADS_INGEST_SECRET`). |

### Custom tracker

| Part | Where |
|---|---|
| Client | `src/client/app.ts` (sections "attribution, visits, events", "engagement"), with `src/lib/engagement.ts`, `src/lib/beaconq.ts`, `src/lib/offerseen.ts`, `src/lib/etday.ts` |
| Event endpoint | `POST /api/event` → `src/routes/event.ts` (`postEvent`); writes with `logEvents` / `logExit` in `src/lib/events.ts`; replies `204` with `x-event-sink: d1 | none | error` |
| Ad-hit rungs | Worker logs every page request with a click id or `utm_*` into `ad_hits` (`src/lib/adhits.ts`), injects a hit id, an inline head script and a 1×1 pixel (`src/lib/hits.ts`); rungs at `GET /api/h/<id>/r.gif`, `POST /api/h/<id>/b`, `POST /api/h/<id>/e` |
| Ads ingest | `POST /api/ads-ingest` → `src/lib/adsingest.ts` |
| Storage | D1 tables `events`, `ad_hits`, `ads_clicks`, `ads_search_terms`, `ads_keywords_daily`, `ads_campaigns_daily`, `ads_ingests`, `stats_daily` |
| Bot filter | `src/lib/traffic.ts` (`trafficFlags`, `uaBotReason`, `cfVerifiedBot`), `src/lib/adhits.ts` (`bad_click_id`), `src/lib/hitverdict.ts` + `src/lib/bursts.ts` (verdicts: internal, junk_id, bot_ua, burst, datacenter, prefetch_unused...), `src/lib/datacenter-asns.ts` |
| Internal traffic | `src/lib/internal.ts`: test-tagged links (`utm_source=test`, `utm_campaign=test-*`), signed cookie `__Host-ec_internal` (HMAC with `ADMIN_SECRET`, set at `/admin/internal`), internal Stripe customers, `fixture-*@` accounts |
| Retention | `src/lib/retention.ts` (`purgeExpired`, run by the daily cron; events 25 months). Crons are off in asset mode, so **no purge runs today**. |

#### Final schema (all 29 migrations applied, analytics tables)

```sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, day TEXT NOT NULL, type TEXT NOT NULL,
  page TEXT, tool TEXT, target TEXT, check_name TEXT, status TEXT, offer TEXT, ref TEXT,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_term TEXT, utm_content TEXT, gclid TEXT,
  visit_count INTEGER, referrer_empty INTEGER, cached INTEGER,
  tips INTEGER, landing TEXT, section TEXT, record_type TEXT, grade TEXT, score INTEGER, caps TEXT, since_result_ms INTEGER,
  user_id INTEGER, is_bot INTEGER NOT NULL DEFAULT 0, bot_reason TEXT, is_internal INTEGER NOT NULL DEFAULT 0, source TEXT,
  new_today INTEGER, first_in_visit INTEGER, first_day TEXT, amount INTEGER, plan TEXT, offer_variant TEXT, findings TEXT,
  visit_token TEXT, gbraid TEXT, wbraid TEXT, utm_adgroup TEXT, utm_device TEXT, utm_match TEXT,
  pv TEXT, scroll_pct INTEGER, engaged_ms INTEGER, nav TEXT, last_event TEXT, seq INTEGER,
  hit_id TEXT, pv_seq INTEGER, sent INTEGER, retry INTEGER, interacted INTEGER, first_interaction_ms INTEGER);
-- indexes: (day,type), ref, (gclid,day), ts, visit_token, pv, hit_id, (COALESCE(gclid,gbraid,wbraid), ts) WHERE landing page_view

CREATE TABLE ad_hits (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, path TEXT NOT NULL, gclid TEXT, gbraid TEXT, wbraid TEXT,
  is_bot INTEGER NOT NULL DEFAULT 0, is_internal INTEGER NOT NULL DEFAULT 0,
  utm_campaign TEXT, utm_adgroup TEXT, utm_term TEXT, utm_match TEXT, utm_device TEXT, hit_id TEXT,
  has_click_id INTEGER NOT NULL DEFAULT 1, bot_reason TEXT, utm_source TEXT, utm_medium TEXT,
  sec_fetch_site TEXT, sec_fetch_mode TEXT, sec_fetch_dest TEXT, sec_fetch_user INTEGER, sec_purpose TEXT, referrer_host TEXT,
  has_accept_language INTEGER, device_class TEXT, browser_family TEXT, asn INTEGER, datacenter INTEGER, country TEXT,
  rendered_at INTEGER, boot_at INTEGER, boot_webdriver INTEGER, boot_visibility TEXT, boot_nav TEXT, boot_prerender INTEGER,
  boot_ms INTEGER, exit_at INTEGER, dwell_ms INTEGER, app_ran INTEGER, interacted INTEGER, first_interaction_ms INTEGER);

CREATE TABLE ads_clicks (gclid TEXT PRIMARY KEY, date TEXT NOT NULL, campaign_id, campaign_name, ad_group_id, ad_group_name,
  keyword_text, keyword_match_type, device, click_type, page_number INTEGER, is_internal INTEGER, first_seen_at INTEGER, updated_at INTEGER);
CREATE TABLE ads_search_terms (date, search_term, campaign_id, campaign_name, ad_group_id, ad_group_name, keyword_text, match_type,
  clicks, impressions, cost_micros, is_internal, updated_at, PRIMARY KEY (date, search_term, ad_group_id, keyword_text));
CREATE TABLE ads_keywords_daily (date, ad_group_id, keyword_id, campaign_id, keyword_text, match_type, clicks, impressions,
  cost_micros, average_cpc_micros, is_internal, updated_at, PRIMARY KEY (date, ad_group_id, keyword_id));
CREATE TABLE ads_campaigns_daily (date, campaign_id, campaign_name, status, impressions, clicks, invalid_clicks, cost_micros,
  search_impression_share, search_budget_lost_impression_share, search_rank_lost_impression_share, is_internal, updated_at,
  PRIMARY KEY (date, campaign_id));
CREATE TABLE ads_ingests (id, at, dates, clicks, search_terms, keywords, campaigns, rejected, is_internal);
CREATE TABLE stats_daily (day TEXT PRIMARY KEY, json TEXT, emailed_at TEXT, resend_id TEXT);
```

#### Metrics the matrix reports and their queries (`src/lib/stats.ts`, `src/lib/clicks.ts`, `src/lib/reconcile.ts`)

Every query filters `ts` to the ET range (`rangeBounds`, America/New_York days, `src/lib/etday.ts`) and, unless ticked, `is_bot = 0 AND is_internal = 0`.

| Metric | Query (core) |
|---|---|
| Unique visitors | `SUM(type = 'page_view' AND new_today = 1)` (browser's first page view of the ET day) |
| Page views | `SUM(type = 'page_view')` |
| Visits (landings) | `type = 'page_view' AND status = 'landing'` (one per visit token) |
| Paid clicks (script) | `SUM(type='page_view' AND status='landing' AND (gclid OR gbraid OR wbraid) IS NOT NULL AND NOT <earlier landing with same click id>)` |
| Return visits via ad URL | same click id landing again after the 30-minute window (`src/lib/clickvisits.ts`) |
| Paid clicks reached the server | `ad_hits` first request per well-formed click id (`wellFormedClickIdSql`) |
| Rejected click ids | `ad_hits` rows whose id fails `isWellFormedClickId` |
| Tagged 404 landings | `SUM(type = 'landing_404')` |
| Per-source split | `GROUP BY COALESCE(source,'unknown')` over gclid / utm / direct / organic / referral |
| Return direct | `SUM(type = 'return_visit' AND referrer_empty = 1)` |
| **Stickiness (14-day return)** | denominator: `type='page_view' AND status='landing' AND visit_count=1 AND (gclid IS NOT NULL OR utm_source IS NOT NULL)` over cohorts whose 14 days are over; numerator: `type='return_visit' AND status IN ('sticky','sticky_gclid') AND first_day BETWEEN from AND matured`. Pass line `STICKY_TARGET = 3`%. Separate gclid-only line (`sticky_gclid`). |
| Per-visit funnel | visit_token steps: visits → check → offer rendered → seen → clicked (`tokenFunnelSql`) |
| Paid click trace (/admin/clicks) | per click id: `ad_hits` rungs (rendered, boot, app ran, interacted) + events timeline; verdict per visit; loss = sent − distinct pv_seq |
| Google vs site (/admin/clicks top) | `ads_clicks` ⨝ `ad_hits` on gclid: billed+arrived, billed never arrived, arrived not billed, braid-only; est. cost per click = keyword cost ÷ clicks that Pacific day |
| Cost | `ads_campaigns_daily.cost_micros`, `ads_keywords_daily.cost_micros` (Pacific days) |
| Bot share | `SUM(is_bot)`, `GROUP BY bot_reason` |

Offer, check, capture, purchase, refund and Watch metrics also live in `stats.ts` but are product-specific (STRIP).

#### Where it's viewed

- `GET /admin/stats?from=&to=&days=&bots=1&internal=1&old=1` (HTTP Basic, any user, password `ADMIN_SECRET`).
- `GET /admin/clicks?from=&to=&campaign=&device=m|c|t` (same auth).
- `GET|POST /admin/internal` (mark this browser internal).
- `GET /admin/conversions.csv?days=90` (Google Ads offline import).
- Daily email digest (`src/lib/digest.ts`), off while crons are off.
- CLI: `scripts/trace.ts` (`npm run trace`).

#### Visitor ID, returning visitor, attribution

- **No visitor ID.** Cookie `ec_v` = `count.lastSeen.firstSeen.ad` (unix seconds; `ad` 0 none, 1 utm, 3 gclid, 2/4 = return counted). `Max-Age=34560000` (400 days), `SameSite=Lax`, `Secure` on https. A new visit starts after 30 idle minutes.
- **Visit token**: 16 hex chars in session storage (`ec_attr.visit_token`), redrawn on each landing. **Page view id** `pv` per page load.
- **Returning visitor**: `return_visit` event on a new visit with `count >= 2`. **Sticky** = the first such return within 14 days of a first visit that came from an ad (`ad` 1 or 3), with no referrer and no tags in the URL.
- **gclid / gbraid / wbraid / UTM**: read from the landing URL (`utm_source`, `utm_medium`, `utm_campaign`, `utm_adgroup`, `utm_term`, `utm_content`, `utm_device`, `utm_match`, and the three click ids), stored in session storage `ec_attr` with `landing`, `source` and `visit_token`, sent on every event. Server re-derives `source` (`attribution()` in `src/lib/events.ts`).
- **Referrer**: only the class (direct / organic / referral) on events; `ad_hits.referrer_host` keeps the host name only.
- **Join to Ads search terms**: `ads_clicks` (gclid → campaign, ad group, keyword, match type, device) joins `ad_hits` / `events` on gclid; `ads_search_terms` is per day + ad group + keyword (Google doesn't expose search term per gclid), so search terms join by keyword/ad group/day.
- **Bot filtering**: UA regexes (crawlers, HTTP libraries, headless/Playwright/Lighthouse), no UA, Cloudflare verified-bot flag (Bot Management only), `no_js` for server events without `js=1`, malformed click ids, datacenter ASNs, bursts (≥3 landings within 2 s), unused prefetches. Only the flag and reason are stored, never the UA.

---

## 3. Click tracking

| Item | dnsmailcheck |
|---|---|
| Mechanism | One script (`/assets/app.js`, built from `src/client/app.ts`). `sendBeacon('/api/event', Blob(json))` with `fetch(..., {keepalive:true})` fallback; failures queue in session storage `ec_q` (max 50, `src/lib/beaconq.ts`) and resend with the next event. |
| Default (automatic) events | `page_view` (with `landing_view`, `new_today`, `visit_count`, `referrer_empty`, `nav`), `return_visit`, `scroll_depth` (25/50/75/100 once per page per visit), `exit` (engaged ms, deepest scroll, `nav` internal/checkout/away/hidden, `last_event`, `sent`, `interacted`, `first_interaction_ms`; sent on hidden/pagehide, later exit replaces earlier), `details_open` (any `<details>` opened, once per section per page view; global capture listener on `toggle`) |
| Opt-in elements | Code-attached, not data-attributes: offer boxes (`offer_render`, `offer_view` = half on screen 1 s), CTA buttons (`cta_view`), forms with `data-tool` (check runs are logged server-side by `/api/check`), `data-watch-offer`, `data-watch-strip`, `form[data-contact]` |
| Fields on every event | `page`, `pv`, `pv_seq`, `retry`, plus attribution: `utm_*` (8), `gclid`, `gbraid`, `wbraid`, `visit_token`, `landing`, `source`, `hit_id` |
| Outbound links | Not logged as clicks. A capture-phase `click` listener classifies `a[href]` as internal or checkout (`linkKind`) only to set the exit's `nav`. |
| Form submits | Check forms → server `check_run`/`result` events; contact/quote/report forms → server events. |
| Google Ads conversion events | No on-page tag. Offline import CSV with actions `fix_purchase`, `watch_start`, `quote_request`, `sign_up`, `report_capture`, `check_run_first` (click id, time, value). |

---

## 4. UI

- **CSS approach**: one hand-written stylesheet, `site/static/assets/styles.css` (1,285 lines), all values as custom properties in `:root`; components use only `var(--…)`. Cache-busted by content hash (`?v=`).
- **Design tokens** (light; the violet family is from the logo):

```css
--c-bg: #FFFFFF; --c-surface: #FFFFFF; --c-tint: #F5F4FB; --c-tint-2: #E8E6F4;
--c-heading: #17161F; --c-text: #1B1C24; --c-text-muted: #545867; --c-border: #6B778A; --c-divider: #E2E0EC;
--c-cta: #1A4CD5; --c-cta-hover: #1742BA; --c-cta-active: #1238A1; --c-cta-text: #FFFFFF;
--c-accent: #4B32C3; --c-accent-hover: #35219A; --c-brand-deep: #4B32C3; --c-brand-soft: #A99BFF; --c-focus: #4B32C3;
--c-glow: #D9D2FF; --c-dots: rgb(75 50 195 / 0.11);
--c-pass: #146C3E; --c-pass-bg: #E8F5EE; --c-warn: #874A00; --c-warn-bg: #FDF1DE;
--c-fail: #B0261C; --c-fail-bg: #FCEBEA; --c-info: #3A4A63; --c-info-bg: #F1F0F7; --c-code-bg: #F0EEF6;
--c-offer-edge: #B9AEEB; --c-offer-bg: #F8F7FE;
--font-sans: "Google Sans Flex", "Segoe UI Variable Text", "Segoe UI", system-ui, ...;
--fs-12 .75rem; --fs-13 .8125rem; --fs-15 .9375rem; --fs-17 1.0625rem; --fs-22 1.375rem; --fs-28 1.75rem; --fs-36 2.25rem;
--sp-1 .25rem … --sp-9 6rem; --r-1 4px; --r-2 8px; --r-3 16px; --r-4 24px; --r-pill 9999px;
--container: 1120px; --column: 760px; --measure: 40rem; --tap: 44px;
--control-h: 36px; --button-h: 44px; --hero-h: 64px; --focus-w: 3px;
```

  Dark: `html[data-theme="dark"]` block redefines the colours (canvas `#0F0F13`).
- **Fonts**: Google Sans Flex, self-hosted `site/static/assets/fonts/google-sans-flex-latin.woff2` (OFL, latin subset, weights 300–800), `@font-face` in styles.css, `<link rel="preload">` in `src/site/layout.ts`.
- **Icons**: inline SVG paths in code (`src/site/layout.ts`, `src/site/content.ts` `SEV_PATHS`, `src/client/app.ts`). No icon library.
- **Logo / favicon**: `src/site/brand.ts` (envelope + heart, two violet tones); `scripts/brand-assets.ts` renders `favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `og.png`, `site.webmanifest` into `site/static/` with headless Chrome (`scripts/cdp.ts`).
- **Shared components**:
  - Page shell (head, header, footer, theme toggle, nav menu): `src/site/layout.ts` `layout()`
  - Header: `.site-header` with `.brand`, `.site-nav` pills, `.header-actions` (theme toggle, CTA, `details.nav-menu`)
  - Footer: `.site-footer`, `.footer-cols`, `.trust-strip`, `.footer-base`
  - Tool form: `checkForm()` (`.check-form`, `.pill-field`, `.hint`, `.error-msg`), `.result` (aria-live), `resultPlaceholder()`
  - Result box: built in `src/client/app.ts` (`statusBanner`, `.badge-*`, `row()`, `copyButton()`, `.record`)
  - Section cards / Read more / FAQ: `src/site/content.ts` `renderBody()` (`.section-card`, `details.more`, `details.faq`)
  - Buttons: `.btn .btn-primary | .btn-secondary | .btn-small | .btn-chrome`; inputs: `.field`, `.pill-field`
  - Toasts: **none** (inline status text instead)
  - Admin pages: `simplePage()` in `src/lib/http.ts`
- **Light/dark**: system preference until the visitor toggles; choice in `localStorage.theme`; applied pre-paint by an inline script allowed by CSP hash (`THEME_INLINE` / `THEME_INLINE_SHA256` in `src/site/seo.ts`).
- **Breakpoints**: 360, 420, 540, 620, 720, 860, 900, 1100 px (`min-width` / `max-width: N-0.02px`).

---

## 5. Email

- Provider: **Resend** (`src/lib/resend.ts`, `sendAndLog`, logged in `email_sends`, overflow to `email_outbox`).
- Sending domain: `mail.dnsmailcheck.com` (`RESEND_FROM` = `DNS Mail Check <alerts@mail.dnsmailcheck.com>`); Reply-To `support@dnsmailcheck.com`.
- SPF / DKIM / DMARC: per `README.md` / `docs/emails.md`: `send.mail` MX + TXT `v=spf1 include:amazonses.com ~all`, `resend._domainkey.mail` TXT (Resend DKIM); apex MX + SPF + DMARC + `cf2024-1` DKIM from Cloudflare Email Routing. (Not re-checked live: DNS lookups are blocked from this shell and the wrangler token has no DNS-read scope.)
- Inbound: Cloudflare Email Routing for `support@` and `alerts@` on the apex.
- Signup forms: "Email me this report" (`report_emails`, `tips_subscribers`, `email_prefs`), contact form (`contact_messages`, no email sent), quote form. All paused or off in asset mode except contact.

---

## 6. Legal and consent

- Pages: `content/privacy.md` (`/privacy`), `content/terms.md` (`/terms`), both `layout: prose`.
- **Consent banner: none.** Analytics **do not wait for consent**: the first-party tracker and the `ec_v` cookie run on every page load; Cloudflare Web Analytics is cookieless. The privacy page discloses all of it ("Your choices": block the cookie in the browser).
- Advertising cookies: none (`adsEnabled` off).

---

## 7. Testing and gotchas

**Tests**: Vitest (`vitest.config.ts`, node env). `npm test` = `vitest run tests/unit` (85 files). D1 is a real SQLite via `node:sqlite` with all migrations applied (`tests/helpers/d1.ts`). `npm run typecheck` runs `tsc` for the Worker and client separately. Browser checks: `scripts/browser-check.ts` (Chrome via CDP, `scripts/cdp.ts`, 320–1440 px, light/dark, overflow, tap targets, contrast), `scripts/layout-sweep.ts`, `scripts/layout-baseline.ts`. Pre-push hook in `.githooks/pre-push`. No CI.

**What broke and how it was fixed** (from code comments and commit history):

1. `_headers` doesn't apply to Worker responses once `run_worker_first` is on: every header is set in `src/worker.ts` too.
2. `html_handling = "auto-trailing-slash"` answers `*.html` with a 307, which broke Search Console's HTML-file verification: the Worker fetches the extensionless asset (`VERIFICATION_FILES`).
3. The Workers rate-limiting binding only counted per machine live (90 of 90 requests got through); KV day counters undercounted under bursts. Replaced with a Durable Object per salted IP hash.
4. Durable Objects disable version preview URLs (`preview_urls = false`); uploads are checked with `wrangler dev`.
5. `wrangler dev --test-scheduled`'s `/__scheduled` is answered by the assets layer: `npm run cron:local` uses the Local Explorer endpoint.
6. Workers Free allows 50 subrequests per invocation; a health check needs 60–150. Needed Workers Paid, then `[limits] subrequests = 150_000`.
7. A blocking `/assets/theme.js` cost ~0.5 s on mobile: made inline, allowed by CSP hash, with a test recomputing the hash.
8. Pass #95 audit: 69 of 75 logged "gclids" were 8–10-digit numbers, not Google click ids. Only well-formed ids count as ad clicks; the rest are bots (`bad_click_id`).
9. `offer_view` changed meaning (built → seen) on 27 Oct; stats split at that timestamp, then a "clean start" hides older rows.
10. Reloads and repeat landings double-counted paid clicks: one visit per click id within 30 minutes; a later landing with the same id is a return, not a new click.
11. Lost beacons: `pv_seq` numbering plus a session-storage retry queue; exit carries `sent` so loss is measurable.
12. Per-request invocation logs would have stored URLs with tokens and IPs, contradicting /privacy: turned off.
13. Stats days were UTC while Colin reads ET: every stats day became America/New_York (`etday.ts`), stored `day` stays UTC.
14. Stale local rate-limiter state answered 429 during sweeps: the pre-push hook clears `.wrangler/state/v3/do/...`.

---

## PORT / STRIP

### PORT (to wirecalculators.com)

- **Infra**: one Worker with static assets, `wrangler.toml` shape (assets, `run_worker_first`, `auto-trailing-slash`, `404-page`, observability with invocation logs off, D1 + KV, custom domains apex + www with the Worker's 301), `scripts/build.ts`, `src/worker.ts` router and security headers, `src/site/seo.ts`, `src/lib/http.ts`, `.dev.vars.example`.
- **Analytics**: `events`, `ad_hits`, `ads_*`, `stats_daily` schema (only the columns/tables the ported code uses); `src/routes/event.ts`; `src/lib/{events,traffic,internal,adhits,hits,datacenter-asns,engagement,beaconq,offerseen,etday,clickvisits,clicks,hitverdict,bursts,adsingest,reconcile,retention}.ts`; `/admin/stats` (core M1 metrics), `/admin/clicks`, `/admin/internal`; the Google Ads Script; `ec_v` cookie, visit token, stickiness rule.
- **Click tracking**: client tracker (attribution, visit counter, sendBeacon + retry queue, page_view, return_visit, scroll_depth, exit, details_open, first-interaction).
- **UI system**: `styles.css` tokens and components, Google Sans Flex, theme toggle, `layout.ts` shell, `content.ts` Markdown renderer, `checkForm` pill style, result banner and badges, section cards and FAQ.
- **Legal pages**: privacy and terms (rebranded, product sections removed).
- **Tests**: Vitest + `node:sqlite` D1 shim; tracker and worker tests that apply to ported code; browser checks (rewritten for Playwright per this project's brief).

### STRIP (not ported)

- DNS/email-checking logic: `src/checks/*`, `src/lib/dns.ts`, `psl.ts`, `headers.ts`, `src/client/checks.ts`, `psl.ts`, `rua-worker.ts`, Public Suffix List, `smtp-probe/`.
- Watch, Managed, DMARC reports/analyzer: `watch*.ts`, `managed.ts`, `probe.ts`, `rua-*.ts`, `dmarc-setup.ts`, `cron.ts`, `weekly.ts`, `renewals.ts`, crons, queue, R2.
- Accounts and auth: `accounts.ts`, `google.ts`, `routes/auth.ts`, `routes/account.ts`, sessions, `GOOGLE_*`.
- Payments and checkout: `stripe.ts`, `routes/stripe-webhook.ts`, `routes/go.ts`, `fixorders.ts`, `fixprice.ts`, `quote*.ts`, `intake.ts`, offer boxes (`offerbox.ts`, `placements.ts`), conversions CSV for purchases, every Payment Link.
- Email sending: Resend, report emails, digest, unsubscribe, tips (no email capture in this build).
- Rate-limit Durable Object (`IpLimiter`): it only guarded DNS checks and emails.
- All dnsmailcheck copy and brand: `content/*`, the envelope-heart logo, violet accent, `og.png`, guides.

---

## What the port did (build steps 2–6, 31 Oct 2026)

### Cloudflare resources

**Current (since 31 Oct 2026, follow-up build):** Stackbriefco@gmail.com's Account (`1552e47f096ee67d67374d48d09873a8`, login stackbriefco@gmail.com), which holds the wirecalculators.com zone: Worker `wirecalc-site` on Workers Custom Domains wirecalculators.com and www.wirecalculators.com (no workers.dev), D1 `wirecalc-db` (`bd55cd2b-7b5c-4e4c-9391-063d81a3a644`), KV `wirecalc-kv` (`eecafc8a7f35443cb35bd0689fcf6e67`), fresh `ADMIN_SECRET` and `ADS_INGEST_SECRET`. The daily retention cron (`0 7 * * *`) is scheduled since 31 Oct 2026 (it needed the account's workers.dev subdomain first).

**First preview (left in place, untouched), dnsmailcheck's account clutcharchive2006:**

| Resource | Name / id | dnsmailcheck's equivalent |
|---|---|---|
| Worker | `wirecalc-site` → https://wirecalc-site.clutcharchive2006.workers.dev | `email-checker` |
| D1 | `wirecalc-db` (`87aa0b73-caf4-4f31-8e75-941ef31f2cf3`), migration `0001_init.sql` | `email-checker` |
| KV | `wirecalc-kv` (`34a0c5cc05284e458b7ed3d10423cdb5`), bound as `KV`, unused | `email-checker` |
| Analytics Engine | none (dnsmailcheck has none; its tracker writes to D1) | none |
| Secrets | `ADMIN_SECRET`, `ADS_INGEST_SECRET` (values in local `.dev.vars` only) | same names |
| Cron | `0 7 * * *`: retention purge only | crons off in asset mode |

Checked after the tracking test: dnsmailcheck's `email-checker` D1 has 0 rows from this work.

Differences from dnsmailcheck's wrangler.toml, and why: `account_id` pinned (the login sees two accounts); `preview_urls` on (no Durable Object to block them); no `[limits]`, no Durable Object, no queue, no `[vars]` (no DNS checks, no rate limits, no accounts). Same as dnsmailcheck: `workers_dev = false`, apex + www as Workers Custom Domains, www → apex 301 in the Worker.

### D1 schema

`events`, `ad_hits`, `ads_clicks`, `ads_search_terms`, `ads_keywords_daily`, `ads_campaigns_daily`, `ads_ingests`: dnsmailcheck's final shapes (all columns kept, so ported queries run unchanged). New columns on `events`: `inputs`, `result` (calc_run, copy_result), `ret_days` (return_visit). Not created: the 30-odd product tables (Stripe, Watch, accounts, email, DMARC, quotes), `stats_daily` (digest email), `counters`, `cron_runs`.

### Rebrand (what changed in the UI system)

- Name "Wire Calculators", domain wirecalculators.com (`src/config.ts`).
- Logo: a stranded wire seen end-on (`src/site/brand.ts`), rendered to favicon.svg/.ico, apple-touch-icon, icon-192/512, og.png and site.webmanifest by dnsmailcheck's own `scripts/brand-assets.ts`.
- **One accent colour swapped:** dnsmailcheck's logo violet `#4B32C3` (hue 250°) → teal `#1B5F6A` (hue 188°), 7.3:1 on white. The violet-derived tokens moved to the same saturation and lightness at the new hue: `--c-tint #F4FAFB`, `--c-tint-2 #E6F2F4`, `--c-divider #E0EAEC`, `--c-accent`/`--c-focus`/`--c-brand-deep`/`--c-avatar #1B5F6A`, `--c-accent-hover #124C55`, `--c-brand-soft #7CC4CE`, `--c-glow #D2F4F8`, `--c-dots`, `--c-info-bg`, `--c-code-bg`, `--c-offer-*`, and the dark block's canvas, surfaces and accent (`#86D3DE`, 7.6:1 on surface 2). Copper was tried first and rejected: it lands on top of the warning amber `#874A00`.
- Unchanged: every other token, the type scale, Google Sans Flex, spacing, radii, controls, the royal-blue CTA, status colours, header/footer/menu/theme toggle, section cards, tables.
- Removed CSS: the brand-preview, accounts (A1), account app shell and Watch dashboard blocks (95 KB → 64 KB). Added: calculator, result, formula, worked example and reference-chart styles at the end of styles.css, built from the same tokens.

### Analytics and click tracking: what's identical, what's new

Identical (code ported with the `ec_` names renamed `wc_`): the `wc_v` visit cookie and its stickiness rule, session-storage attribution (`wc_attr`), visit token, page-view id, sendBeacon with fetch fallback and the `wc_q` retry queue, `pv_seq`/`sent` loss accounting, page_view, return_visit, details_open, scroll_depth, exit, landing_404; the Worker's ad_hits log with hit id, inline boot/exit script and no-JS pixel (CSP hash recomputed after renaming `ec-hit`/`__ecApp`); bot rules (UA, headless, no UA, cf verified, bad click id, datacenter, bursts, prefetch); internal rules 1–2 (`__Host-wc_internal`); /admin/stats range rules and per-visit flagging; /admin/clicks with verdicts and ladder; the Google Ads Script and /api/ads-ingest; reconciliation of Google's clicks and cost against arrivals; 25-month retention.

New (same mechanism): `calc_run` (tool, inputs, result, first in visit; sent when a valid result has been stable for 1.5 s, once per distinct input set per page view), `formula_view` and `chart_view` (half on screen for 1 s, dnsmailcheck's offer_view rule), `copy_result`; `ret_days` on return_visit; the Phase 4 block on /admin/stats (cost per visit, visits, returned within 14 days, without ads, split by ads paused/running from Google's campaign report, calc runs per visitor, dnsmailcheck's stickiness line). On /admin/clicks, "converted" means ran a calculator.

Not ported (no counterpart here): check/offer/capture/purchase events and funnels, offer placements, the Watch ad test, the daily digest email, the conversions CSV (no conversions to upload yet), the `cta_view` event.

Consent: identical to dnsmailcheck: no banner, and the first-party tracker and `wc_v` cookie run on page load, before any consent. GA4/Ads tag/Clarity are not loaded (dnsmailcheck has none).

### Gotchas met during this build

1. JS objects list integer-like keys ("1", "2", "10") before others, so iterating a size table's keys gives the wrong order; Python dicts keep insertion order. Every size loop in `src/lib/calc.ts` goes through `SIZES`/`TRADE_ORDER`.
2. Redrawing a calculator's result on the `change` event that follows typing replaced the Copy button under the tap; results now redraw only when they change.
3. `navigator.clipboard.writeText` can hang (headless Chrome): copy_result is sent before the clipboard call.
4. wrangler's OAuth token can't be refreshed from a non-interactive session; it has to be passed as `CLOUDFLARE_API_TOKEN` and dies at its expiry.

### Follow-up build (31 Oct 2026): privacy, cross-check, result display

- **Privacy, Tier 1** (docs/research/privacy-consent-research.md): confirmed the tracker stores no IP in any form (no column for one; the unused `clientIp` helper ported from dnsmailcheck was deleted), no user agent, no typed text (the generator's load names never leave the page), no session replay, and sends nothing to any third party. Retention cut from dnsmailcheck's 25 months to 13. `config.features.thirdPartyTags` (off) and `src/client/consent.ts` (Consent Mode v2 default denied, never granted under GPC) are ready for Tier 2; a footer line confirms GPC when the browser sends it. `scripts/privacy-check.ts` (Playwright) asserts no request leaves wirecalculators.com except Cloudflare's beacon, with no consent and with GPC on. Privacy policy rewritten from research §3, still DRAFT.
- **Manufacturer cross-check:** the 22 Southwire cases in `tests/unit/calc.test.ts`, reported, never failing.
- **Results:** every result echoes the inputs, shows the formula with those numbers and cites the code tables; wire size names the limit that decided the size and says 240.4(D) and 110.14(C) were applied; voltage drop has a 120/240 V 3-wire balanced preset; conduit fill shows the Note 7 max count beside the fill; the ampacity chart carries 240.4(D) and 110.14(C) notes in our own words. `scripts/browser-check.ts` checks every calculator has no Calculate button and updates within 500 ms of typing.
