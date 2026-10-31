/**
 * wirecalculators.com: Google Ads -> /api/ads-ingest. Ported unchanged from dnsmailcheck's scripts/google-ads/dnsmailcheck-export.js
 * (pass #115); only INGEST_URL differs.
 *
 * Paste into Google Ads: Tools -> Bulk actions -> Scripts -> + (new script). Fill in ADS_INGEST_SECRET below (the same value
 * as the Worker secret), authorize, run it once with DRY_RUN = true and read the log (Logger output: row counts and a sample
 * of each report, nothing is sent), then set DRY_RUN = false, run once more, and schedule it Hourly.
 *
 * What it sends, for today and yesterday in the account's time zone (Pacific), as one JSON POST:
 *   clicks        click_view: one row per click id (gclid), its campaign, ad group, keyword, match type, device, click type, page
 *   search_terms  search_term_view: per day, search term, ad group and keyword: clicks, impressions, cost
 *   keywords      keyword_view: per day and keyword: clicks, impressions, cost, average CPC
 *   campaigns     campaign: per day: impressions, clicks, invalid clicks, cost, search impression share and the share lost
 * Our own account's ad data only; nothing about the people who clicked. The site upserts every row on its key (gclid; day +
 * term + ad group + keyword; day + ad group + keyword id; day + campaign), so re-sending the same day changes nothing.
 * click_view only answers for a single day, so it runs once per day. If Google rejects one of the optional fields, the script
 * drops it, runs the query again, and says which in the log.
 */

var INGEST_URL = "https://wirecalculators.com/api/ads-ingest"; // until the domain is connected: https://wirecalc-site.clutcharchive2006.workers.dev/api/ads-ingest
var ADS_INGEST_SECRET = "PASTE-THE-SECRET-HERE";
var DRY_RUN = true; // true: log what would be sent, send nothing. false: send it.

var CLICK_REQUIRED = ["click_view.gclid", "segments.date", "campaign.id", "campaign.name", "ad_group.id", "ad_group.name"];
var CLICK_OPTIONAL = ["click_view.keyword_info.text", "click_view.keyword_info.match_type", "segments.device", "segments.click_type", "click_view.page_number"];
var TERM_REQUIRED = ["segments.date", "search_term_view.search_term", "campaign.id", "campaign.name", "ad_group.id", "ad_group.name", "metrics.clicks", "metrics.impressions", "metrics.cost_micros"];
var TERM_OPTIONAL = ["segments.keyword.info.text", "segments.keyword.info.match_type"];
var KEYWORD_REQUIRED = ["segments.date", "campaign.id", "ad_group.id", "ad_group_criterion.criterion_id", "ad_group_criterion.keyword.text", "ad_group_criterion.keyword.match_type",
  "metrics.clicks", "metrics.impressions", "metrics.cost_micros"];
var KEYWORD_OPTIONAL = ["metrics.average_cpc"];
var CAMPAIGN_REQUIRED = ["segments.date", "campaign.id", "campaign.name", "campaign.status", "metrics.impressions", "metrics.clicks", "metrics.cost_micros"];
var CAMPAIGN_OPTIONAL = ["metrics.invalid_clicks", "metrics.search_impression_share", "metrics.search_budget_lost_impression_share", "metrics.search_rank_lost_impression_share"];

var dropped = {};

function main() {
  var tz = AdsApp.currentAccount().getTimeZone();
  var today = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  var yesterday = addDays(today, -1);
  var days = [yesterday, today];
  var payload = { version: 1, source: "google-ads-script", account_time_zone: tz, generated_at: new Date().toISOString(), dates: days,
    clicks: [], search_terms: [], keywords: [], campaigns: [] };

  for (var i = 0; i < days.length; i++) {
    run("click_view", CLICK_REQUIRED, CLICK_OPTIONAL, "segments.date = '" + days[i] + "'", function (r) {
      var cv = r.clickView || {};
      var ki = cv.keywordInfo || {};
      payload.clicks.push({ gclid: cv.gclid, date: r.segments.date, campaign_id: str(r.campaign.id), campaign_name: r.campaign.name,
        ad_group_id: str(r.adGroup.id), ad_group_name: r.adGroup.name, keyword_text: ki.text || null, keyword_match_type: ki.matchType || null,
        device: (r.segments || {}).device || null, click_type: (r.segments || {}).clickType || null, page_number: cv.pageNumber === undefined ? null : Number(cv.pageNumber) });
    });
  }
  var between = "segments.date BETWEEN '" + yesterday + "' AND '" + today + "'";
  run("search_term_view", TERM_REQUIRED, TERM_OPTIONAL, between, function (r) {
    var kw = ((r.segments || {}).keyword || {}).info || {};
    payload.search_terms.push({ date: r.segments.date, search_term: r.searchTermView.searchTerm, campaign_id: str(r.campaign.id), campaign_name: r.campaign.name,
      ad_group_id: str(r.adGroup.id), ad_group_name: r.adGroup.name, keyword_text: kw.text || "", match_type: kw.matchType || null,
      clicks: num(r.metrics.clicks), impressions: num(r.metrics.impressions), cost_micros: num(r.metrics.costMicros) });
  });
  run("keyword_view", KEYWORD_REQUIRED, KEYWORD_OPTIONAL, between, function (r) {
    var c = r.adGroupCriterion || {};
    var k = c.keyword || {};
    payload.keywords.push({ date: r.segments.date, keyword_id: str(c.criterionId), ad_group_id: str(r.adGroup.id), campaign_id: str(r.campaign.id),
      keyword_text: k.text || null, match_type: k.matchType || null, clicks: num(r.metrics.clicks), impressions: num(r.metrics.impressions),
      cost_micros: num(r.metrics.costMicros), average_cpc_micros: r.metrics.averageCpc === undefined ? null : Math.round(Number(r.metrics.averageCpc)) });
  });
  run("campaign", CAMPAIGN_REQUIRED, CAMPAIGN_OPTIONAL, between + " AND campaign.status != 'REMOVED'", function (r) {
    var m = r.metrics || {};
    payload.campaigns.push({ date: r.segments.date, campaign_id: str(r.campaign.id), campaign_name: r.campaign.name, status: r.campaign.status,
      impressions: num(m.impressions), clicks: num(m.clicks), invalid_clicks: num(m.invalidClicks), cost_micros: num(m.costMicros),
      search_impression_share: share(m.searchImpressionShare), search_budget_lost_impression_share: share(m.searchBudgetLostImpressionShare),
      search_rank_lost_impression_share: share(m.searchRankLostImpressionShare) });
  });

  Logger.log("Days (" + tz + "): " + days.join(", "));
  Logger.log("Rows: clicks " + payload.clicks.length + ", search_terms " + payload.search_terms.length + ", keywords " + payload.keywords.length + ", campaigns " + payload.campaigns.length);
  for (var report in dropped) Logger.log("Dropped from " + report + " (Google rejected them): " + dropped[report].join(", "));
  if (DRY_RUN) {
    Logger.log("DRY RUN: nothing sent. Samples:");
    ["clicks", "search_terms", "keywords", "campaigns"].forEach(function (k) { Logger.log(k + ": " + JSON.stringify(payload[k].slice(0, 3))); });
    return;
  }
  if (ADS_INGEST_SECRET.indexOf("PASTE") === 0) throw new Error("Fill in ADS_INGEST_SECRET first.");
  var res = UrlFetchApp.fetch(INGEST_URL, { method: "post", contentType: "application/json", payload: JSON.stringify(payload),
    headers: { Authorization: "Bearer " + ADS_INGEST_SECRET }, muteHttpExceptions: true });
  Logger.log("POST " + INGEST_URL + ": " + res.getResponseCode() + " " + res.getContentText().slice(0, 500));
  if (res.getResponseCode() !== 200) throw new Error("Ingest failed: " + res.getResponseCode());
}

/** Runs a GAQL query; if Google rejects an optional field, drops it (the one the error names, else the last) and tries again. */
function run(resource, required, optional, where, each) {
  var gone = dropped[resource] || [];
  var opt = optional.filter(function (f) { return gone.indexOf(f) < 0; }); // a field Google rejected once stays out
  for (;;) {
    var query = "SELECT " + required.concat(opt).join(", ") + " FROM " + resource + " WHERE " + where;
    try {
      var rows = AdsApp.search(query);
      while (rows.hasNext()) each(rows.next());
      return;
    } catch (e) {
      if (!opt.length) throw e;
      var msg = String(e && e.message ? e.message : e);
      var named = opt.filter(function (f) { return msg.indexOf(f) >= 0; });
      var drop = named.length ? named[0] : opt[opt.length - 1];
      opt = opt.filter(function (f) { return f !== drop; });
      (dropped[resource] = dropped[resource] || []).push(drop);
      Logger.log(resource + ": Google rejected the query (" + msg.slice(0, 200) + "); trying again without " + drop);
    }
  }
}

function addDays(day, n) {
  var d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function str(v) { return v === undefined || v === null ? null : String(v); }
function num(v) { return v === undefined || v === null ? 0 : Math.round(Number(v)); }
function share(v) { return v === undefined || v === null || isNaN(Number(v)) ? null : Number(v); }
