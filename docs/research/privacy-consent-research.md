# Privacy and consent — research item 6 (Oct 31 2026)

Scope: what wirecalculators.com must do to run analytics, click tracking, Google Ads, a 5-question survey and email capture, and later sell aggregate survey data and opt-in leads. US audience only. Not legal advice; get a 30-min lawyer read before collecting emails or selling anything.

## 0. Decisions for the build (ranked)
1. **Split tracking into two tiers.**
   - **Tier 1, always on:** our own first-party tracker (Worker → D1/Analytics Engine). It records page views, calc runs and clicks. It never sends data to a third party, never stores form text, keeps no full IPs (hash or truncate) and has no session replay. This is enough to measure the Phase 4 rule (return visits, calc runs, cost per visit via stored gclid).
   - **Tier 2, consent-gated:** GA4, the Google Ads tag, Clarity and anything third-party. These load only after "Accept", never when GPC is on, and are off by default.
   - Why: the strongest defense against California wiretap (CIPA §631/632) suits is blocking third-party trackers until consent [1]. Those suits target third parties "intercepting" content, so a first-party tracker that never shares data carries far less risk. Phase 4 then still gets complete numbers, because Tier 1 doesn't depend on consent rates.
2. **No session replay (Clarity) at launch.** Session replay and chat are the main targets of the remaining CIPA §631 suits [1]. If dnsmailcheck uses Clarity, port it in Tier 2 only, or drop it.
3. **Honor Global Privacy Control (GPC) everywhere, from day one.** 12 states require honoring it (CA, CO, CT, DE, MD, MN, MT, NE, NH, NJ, OR, TX), and most have no small-business exemption once their thresholds are met [2]. Texas and Nebraska have no consumer-count threshold [3]. When `navigator.globalPrivacyControl` is true, Tier 2 never loads. Show a small confirmation, "Your opt-out signal is honored", which California requires from Jan 2026 [2]. Costs nothing and removes a whole class of risk.
4. **Survey answers: sell only aggregate, de-identified numbers.** A report like "38% of shops use X software" isn't personal data, so selling it isn't a "sale" under state laws. Never sell or share row-level survey answers tied to an email.
5. **Leads (later): explicit, separate opt-in per category, never pre-checked.** No phone collection, so no TCPA (the federal robocall law) exposure. A lead hand-off is a "sale" or "share", which triggers notice and opt-out rights in every state law and consent in some.
6. **Email: double opt-in and CAN-SPAM basics.** Every email gets a physical mailing address and one-click unsubscribe. Use a PO box or virtual address, not a home address.
7. **Google Ads: privacy policy needs the 4 data-segment disclosures** (§3) if we ever use remarketing. Consent Mode v2 is required only for EEA/UK/CH traffic [4][5]. We target the US only, but set the Consent Mode default to `denied` and update it on Accept, so the tags stay ready for that.

## 1. Which state laws apply to us now
- None of the comprehensive state laws apply at launch, on volume. Thresholds start at 25,000–100,000 consumers per state per year (lowest: Montana and Alabama at 25,000; CT, DE, NH, MD, RI at 35,000) [3]. Visitors count as consumers.
- **Exceptions to watch:**
  - Texas and Nebraska have no numeric threshold; small businesses are exempt except for the rule against selling sensitive data without consent [3].
  - Connecticut applies to *any* sale of personal data [3]. Lead sales could trigger it below 35K.
- **Pennsylvania** (home state): no comprehensive law enacted as of this research. A House bill passed in 2025; verify before launch [6].
- **Practical read:** build to the strictest common denominator now (GPC, opt-out link, clear policy, no row-level sales). It costs little, and the site may cross 35K–100K visitors in some states within a year if the calculators rank.

## 2. Website tracking litigation (CIPA)
- SB 690 removes private "pen register" (§638.51) suits over websites. It passed Aug 28 2026; if signed, it's operative Jan 1 2027. Check the signature status [1].
- It does **not** touch §631 wiretap or §632 claims, or other states' wiretap laws. Plaintiffs are shifting to those, aimed at pixels, session replay and chat [1].
- Risk reducers [1]: block non-essential trackers until consent and test that the block works; keep consent records; make the policy match reality; audit tags; never send form contents to ad or analytics tools.

## 3. Privacy policy must include
1. What we collect: pages, calc inputs and results (no names), clicks, device and browser, truncated or hashed IP, ad click IDs (gclid), survey answers, email (if given).
2. Why: run the calculators, measure use, improve pages, measure ads, publish aggregate survey reports, send the emails people asked for.
3. Who gets it: Cloudflare (hosting and analytics storage), Google (only after consent), the email provider. No sale of personal data, **or**, once leads exist, a plain "Do Not Sell or Share" section.
4. **Google Ads data-segment disclosures** (if remarketing is ever used) [7]:
   - how we use data to advertise online;
   - that third-party vendors, including Google, show our ads on other sites;
   - that they use cookies or device IDs to show ads based on past visits;
   - how to opt out: Google Ads Settings, or the NAI opt-out page.
5. Rights: access, delete, correct, opt out of sale, share or targeted ads; a contact email; reply within 45 days (the common state standard).
6. GPC: that we honor it, and what it turns off.
7. Retention: raw events 13 months, then aggregated. Emails until unsubscribe plus 30 days.
8. Not directed to children under 13 (COPPA).
9. Effective date and change log.

## 4. Ready-to-use text (drafts)
**Banner (Tier 2 only):**
> We use our own privacy-friendly analytics to keep the calculators working. With your OK, we'll also use Google tools to measure our ads. [Accept] [No thanks] · Privacy

**GPC confirmation (small line in footer or banner):**
> Your browser's Global Privacy Control signal is on, so we don't load advertising or third-party analytics.

**Survey (under the 5 questions):**
> Optional. Answers are combined with other electricians' answers and published or shared only as totals. Never sold with your name or email. Privacy

**Email capture (save full report):**
> Email me my report. You'll get this report and occasional calculator updates. Unsubscribe anytime. We never sell your email.
> (Double opt-in confirmation email follows.)

**Lead opt-in (later; unchecked box per category):**
> ☐ Send my contact info to up to 3 contractor-insurance providers so they can email me quotes. (Separate box per category. Names listed on the next screen.)

**Footer links:** Privacy · Terms · "Your privacy choices" (opens the banner again; needed once any sale or share exists).

## 5. Build checklist for Claude Code
- [ ] Tier 1 tracker: first-party only, IP truncated or hashed, no form text, no replay.
- [ ] Tier 2 tags load only after Accept AND when GPC is not on; Consent Mode default `denied`.
- [ ] Consent choice stored first-party (localStorage + cookie), 12 months; record a consent log row in D1 (timestamp, choice, banner version, no PII).
- [ ] GPC detection and confirmation line.
- [ ] Privacy policy rewritten from §3; "DRAFT – pending review" until a lawyer read.
- [ ] Playwright test: on first load with no consent, no request goes to google*, doubleclick or clarity domains; same with GPC on after Accept.
- [ ] Survey and email (later build): the consent lines in §4, double opt-in, CAN-SPAM footer with mailing address.

## Sources
1. Goodwin, "California Curbs CIPA 'Pen Register' Suits — But the Website Tracking Litigation Wave Isn't Over" (Sep 2026) — https://www.goodwinlaw.com/en/insights/publications/2026/09/alerts-technology-cldr-california-curbs-cipa-pen-register-suits
2. Clym, "What is Global Privacy Control — the opt-out signal 12 US states now require you to honor" — https://www.clym.io/blog/what-is-global-privacy-control-the-opt-out-signal-12-us-states-now-require-you-to-honor
3. Privacy Law Map, State privacy law comparison (24 laws) — https://privacylawmap.com/compare
4. OneTrust, "What Google's June 2026 consent mode changes mean for Google Ads" (Jul 24 2026) — https://www-onetrust-com.lprx.bates.edu/blog/what-googles-june-2026-consent-mode-changes-mean-for-google-ads/
5. Google Ad Manager Help, About European regulations messages — https://support.google.com/admanager/answer/10076805
6. Fisher Phillips, "Pennsylvania House passes consumer privacy bill" — https://www.fisherphillips.com/print/v2/content/43627/pennsylvania-house-passes-consumer-privacy-bill.pdf
7. Google Ads Help, What to include in your privacy policy for your data segments — https://support.google.com/google-ads/answer/2549063?hl=en-GB
8. Google Ads, Customer data policies — https://support.google.com/adspolicy/answer/7475709
