// Bindings and secrets available to the Worker (wrangler.toml). Same names as dnsmailcheck where the feature was ported.
export interface Env {
  ASSETS: Fetcher; // static files in public/
  DB: D1Database; // wirecalc (D1)
  KV?: KVNamespace; // wirecalc-kv: bound like dnsmailcheck's KV; no ported feature writes to it yet
  ADMIN_SECRET?: string; // /admin/* password (HTTP Basic, any username) and the internal-cookie HMAC key
  ADS_INGEST_SECRET?: string; // bearer secret the Google Ads Script sends to POST /api/ads-ingest
  // Third-party tags dnsmailcheck does not use (it has no GA4, Ads tag or Clarity). Named placeholders only: nothing reads them
  // yet, so nothing loads. Wiring them needs a consent decision first (they would set cookies; there is no consent banner).
  GA4_MEASUREMENT_ID?: string;
  GOOGLE_ADS_ID?: string;
  CLARITY_PROJECT_ID?: string;
}
