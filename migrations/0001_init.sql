-- wirecalc D1 schema. The tables dnsmailcheck's ported analytics use, in their final shape after dnsmailcheck's migrations
-- 0001-0029 (events, ad_hits, the Google Ads import tables). Same columns, types and indexes; the columns only dnsmailcheck's
-- products wrote (checks, offers, Stripe, accounts) are kept so ported queries and tools keep working, and stay NULL here.
-- New for wirecalculators.com (marked NEW): inputs, result (calc_run) and ret_days (return_visit).

-- Events. No IPs, no user agents, no visitor IDs (src/lib/events.ts).
CREATE TABLE events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ts             INTEGER NOT NULL,           -- unix ms
  day            TEXT    NOT NULL,           -- YYYY-MM-DD (UTC)
  type           TEXT    NOT NULL,           -- page_view | return_visit | calc_run | formula_view | chart_view | copy_result | details_open | scroll_depth | exit | landing_404
  page           TEXT,                       -- path the event came from
  tool           TEXT,                       -- calc_run, formula_view, chart_view, copy_result: the calculator or chart (voltage-drop, ...)
  target         TEXT,
  check_name     TEXT,
  status         TEXT,                       -- page_view: landing; return_visit: sticky | sticky_gclid
  offer          TEXT,
  ref            TEXT,
  utm_source     TEXT,
  utm_medium     TEXT,
  utm_campaign   TEXT,
  utm_term       TEXT,
  utm_content    TEXT,
  gclid          TEXT,
  visit_count    INTEGER,                    -- page_view (landing) and return_visit: visit number from the ec_v cookie
  referrer_empty INTEGER,                    -- page_view / return_visit: 1 when document.referrer was empty
  cached         INTEGER,
  tips           INTEGER,
  landing        TEXT,                       -- first page of the visit
  section        TEXT,                       -- details_open: which section; chart_view / formula_view: which block
  record_type    TEXT,
  grade          TEXT,
  score          INTEGER,
  caps           TEXT,
  since_result_ms INTEGER,
  user_id        INTEGER,
  is_bot         INTEGER NOT NULL DEFAULT 0,
  bot_reason     TEXT,
  is_internal    INTEGER NOT NULL DEFAULT 0,
  source         TEXT,                       -- gclid | utm | direct | organic | referral
  new_today      INTEGER,                    -- page_view: this browser's first page view of the ET day
  first_in_visit INTEGER,                    -- calc_run: the visit's first one
  first_day      TEXT,                       -- return_visit: ET day of the browser's first visit
  amount         INTEGER,
  plan           TEXT,
  offer_variant  TEXT,
  findings       TEXT,
  visit_token    TEXT,
  gbraid         TEXT,
  wbraid         TEXT,
  utm_adgroup    TEXT,
  utm_device     TEXT,
  utm_match      TEXT,
  pv             TEXT,                       -- the page load's random id
  scroll_pct     INTEGER,
  engaged_ms     INTEGER,
  nav            TEXT,
  last_event     TEXT,
  seq            INTEGER,
  hit_id         TEXT,
  pv_seq         INTEGER,
  sent           INTEGER,
  retry          INTEGER,
  interacted     INTEGER,
  first_interaction_ms INTEGER,
  inputs         TEXT,                       -- NEW calc_run: the inputs, short form ("cu 12 AWG, 20 A, 100 ft, 1ph, 120 V")
  result         TEXT,                       -- NEW calc_run / copy_result: the headline result ("3.6 V (3.0%)")
  ret_days       INTEGER                     -- NEW return_visit: whole days since the browser's first visit
);
CREATE INDEX events_day_type ON events (day, type);
CREATE INDEX events_ref ON events (ref) WHERE ref IS NOT NULL;
CREATE INDEX events_gclid ON events (gclid, day) WHERE gclid IS NOT NULL;
CREATE INDEX events_ts ON events (ts);
CREATE INDEX events_visit_token ON events (visit_token) WHERE visit_token IS NOT NULL;
CREATE INDEX events_pv ON events (pv) WHERE pv IS NOT NULL;
CREATE INDEX events_hit_id ON events (hit_id) WHERE hit_id IS NOT NULL;
CREATE INDEX events_landing_click ON events (COALESCE(gclid, gbraid, wbraid), ts) WHERE type = 'page_view' AND status = 'landing';

-- Page requests with a Google click id or utm_ tags, logged by the Worker (src/lib/adhits.ts), and their rungs (src/lib/hits.ts).
CREATE TABLE ad_hits (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          INTEGER NOT NULL,
  path        TEXT NOT NULL,
  gclid       TEXT,
  gbraid      TEXT,
  wbraid      TEXT,
  is_bot      INTEGER NOT NULL DEFAULT 0,
  is_internal INTEGER NOT NULL DEFAULT 0,
  utm_campaign TEXT, utm_adgroup TEXT, utm_term TEXT, utm_match TEXT, utm_device TEXT,
  hit_id TEXT, has_click_id INTEGER NOT NULL DEFAULT 1, bot_reason TEXT, utm_source TEXT, utm_medium TEXT,
  sec_fetch_site TEXT, sec_fetch_mode TEXT, sec_fetch_dest TEXT, sec_fetch_user INTEGER, sec_purpose TEXT, referrer_host TEXT,
  has_accept_language INTEGER, device_class TEXT, browser_family TEXT, asn INTEGER, datacenter INTEGER, country TEXT,
  rendered_at INTEGER, boot_at INTEGER, boot_webdriver INTEGER, boot_visibility TEXT, boot_nav TEXT, boot_prerender INTEGER, boot_ms INTEGER,
  exit_at INTEGER, dwell_ms INTEGER, app_ran INTEGER, interacted INTEGER, first_interaction_ms INTEGER
);
CREATE INDEX ad_hits_ts ON ad_hits (ts);
CREATE UNIQUE INDEX ad_hits_hit_id ON ad_hits (hit_id) WHERE hit_id IS NOT NULL;
CREATE INDEX ad_hits_click_id ON ad_hits (COALESCE(gclid, gbraid, wbraid), ts);

-- Our own Google Ads reports, from the Ads Script (scripts/google-ads/wirecalc-export.js -> POST /api/ads-ingest).
CREATE TABLE ads_clicks (
  gclid              TEXT PRIMARY KEY,
  date               TEXT NOT NULL,   -- Pacific day of the click
  campaign_id        TEXT,
  campaign_name      TEXT,
  ad_group_id        TEXT,
  ad_group_name      TEXT,
  keyword_text       TEXT,
  keyword_match_type TEXT,
  device             TEXT,
  click_type         TEXT,
  page_number        INTEGER,
  is_internal        INTEGER NOT NULL DEFAULT 0,
  first_seen_at      INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);
CREATE INDEX ads_clicks_date ON ads_clicks (date);

CREATE TABLE ads_search_terms (
  date          TEXT NOT NULL,
  search_term   TEXT NOT NULL,
  campaign_id   TEXT,
  campaign_name TEXT,
  ad_group_id   TEXT NOT NULL,
  ad_group_name TEXT,
  keyword_text  TEXT NOT NULL DEFAULT '',
  match_type    TEXT,
  clicks        INTEGER NOT NULL DEFAULT 0,
  impressions   INTEGER NOT NULL DEFAULT 0,
  cost_micros   INTEGER NOT NULL DEFAULT 0,
  is_internal   INTEGER NOT NULL DEFAULT 0,
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (date, search_term, ad_group_id, keyword_text)
);

CREATE TABLE ads_keywords_daily (
  date               TEXT NOT NULL,
  ad_group_id        TEXT NOT NULL,
  keyword_id         TEXT NOT NULL,
  campaign_id        TEXT,
  keyword_text       TEXT,
  match_type         TEXT,
  clicks             INTEGER NOT NULL DEFAULT 0,
  impressions        INTEGER NOT NULL DEFAULT 0,
  cost_micros        INTEGER NOT NULL DEFAULT 0,
  average_cpc_micros INTEGER,
  is_internal        INTEGER NOT NULL DEFAULT 0,
  updated_at         INTEGER NOT NULL,
  PRIMARY KEY (date, ad_group_id, keyword_id)
);

CREATE TABLE ads_campaigns_daily (
  date                          TEXT NOT NULL,
  campaign_id                   TEXT NOT NULL,
  campaign_name                 TEXT,
  status                        TEXT,
  impressions                   INTEGER NOT NULL DEFAULT 0,
  clicks                        INTEGER NOT NULL DEFAULT 0,
  invalid_clicks                INTEGER NOT NULL DEFAULT 0,
  cost_micros                   INTEGER NOT NULL DEFAULT 0,
  search_impression_share       REAL,
  search_budget_lost_impression_share REAL,
  search_rank_lost_impression_share   REAL,
  is_internal                   INTEGER NOT NULL DEFAULT 0,
  updated_at                    INTEGER NOT NULL,
  PRIMARY KEY (date, campaign_id)
);

CREATE TABLE ads_ingests (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  at            INTEGER NOT NULL,
  dates         TEXT,
  clicks        INTEGER NOT NULL DEFAULT 0,
  search_terms  INTEGER NOT NULL DEFAULT 0,
  keywords      INTEGER NOT NULL DEFAULT 0,
  campaigns     INTEGER NOT NULL DEFAULT 0,
  rejected      INTEGER NOT NULL DEFAULT 0,
  is_internal   INTEGER NOT NULL DEFAULT 0
);
