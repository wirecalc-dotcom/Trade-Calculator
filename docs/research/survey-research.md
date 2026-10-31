# Survey design — research item 5 (Oct 31 2026)

Goal: the 5 questions on the calculator result screen whose answers tool brands, supply houses, software companies and insurers will pay for, plus realistic completion rates. Survey answers are sold only as totals (privacy-consent-research.md §0.4).

## 0. Decisions (ranked)
1. **5 fixed tap-to-answer questions + 1 rotating question. No free text, one screen.** Every paid contractor study below is built from the same blocks: firm size, work mix, where they buy, brand use, software, plus a topical question. Fixed questions give comparable data quarter to quarter. The rotating one gives each quarterly report a fresh headline, which is what earns press and backlinks.
2. **Ask once per visitor, after their first calculator result, dismissible.** Returning visitors see only the rotating question. Never block the result.
3. **Sellable report target: 400 completes per quarter** (±4.9% margin at 95% confidence). Published studies run 200–1,000: Klein 200, EstimatorSuite 287, L.E.K. 550, ECmag 926, Farnsworth ~1,000 [1][3][4][5][6]. Below 300 (±5.7%), sell it as "early read" only.
4. **Phase 4 cost per survey easily passes.** $75 at a $0.06 CPC buys ~1,250 visits. At a 10–15% completion rate that's 125–190 surveys, or $0.40–0.60 each, against the ≤ $2 rule. Even a 5% completion rate ($1.20) passes. Volume for a sellable quarterly report needs ~2,700–4,000 calculator users per quarter at 10–15%.
5. **Build it in the existing tracker** (same D1, first-party, no third parties). Store answers keyed to the anonymous visitor ID only. Email stays in a separate table and is never joined into exported data.

## 1. The questions
| # | Question | Answers (tap one) | Who pays for it | Evidence |
|---|---|---|---|---|
| 1 | How big is your shop? | Just me · 2–9 · 10–49 · 50+ · I'm an apprentice / student | Everyone. It's the first cut in every report. | ECmag Profile: 58% of firms have 1–9 employees [1]; Farnsworth weights by revenue band [6] |
| 2 | What's most of your work? | Residential · Commercial / industrial · Service & repair · Mixed | Brands, distributors, insurers | ECmag measures resi vs CII vs MSR split (39% / 49% / MSR 40% of sales) [1] |
| 3 | Where do you buy most of your tools and material? | Electrical supply house · Home Depot / Lowe's · Online · Mix | Supply houses, tool and wire brands | Klein: 64% buy at Home Depot, 56% at supply houses [3]; L.E.K. tracks spend by channel for manufacturers [4] |
| 4 | Which cordless tool platform are you on? | Milwaukee · DeWalt · Makita · Ridgid / Ryobi · Other · Company supplies tools | Tool brands | EMA: brand "very influential" for ~half, electricians the most brand-loyal trade [2]. *Battery-platform wording is my hypothesis*: no published study found asking it, but it's the lock-in brands fight over. |
| 5 | What do you use for estimates and invoices? | Paper / spreadsheet · ServiceTitan · Housecall Pro · Jobber · Other software · Not my job | Contractor software | EstimatorSuite asks primary estimating tool, spend and switching [5]; ServiceTitan funds a 1,000-contractor survey for PR [7] |
| R | Rotating (one per quarter) | e.g. "Buying a new truck, major tool or software in the next 6 months?" · "When does your business insurance renew?" (month) · "Which code edition does your area use?" | Insurers (renewal timing), brands (buying plans), training companies | L.E.K. and EMA ask purchase drivers and switching triggers [2][4]. Insurance-renewal value is a hypothesis to test in Phase 2 emails. |

Wording rules: plain trade language, 4–6 answers max, an "other / not my job" exit on each, all answerable in under 30 seconds on a phone.

## 2. Completion rate evidence
- In-app/web micro-surveys average **27.5% response and 24.8% completion** (Refiner, 1,382 surveys) [8].
- Drop-off rises fastest over the first 15 questions; 5 questions sits well inside the low-drop zone (SurveyMonkey, 100,000 surveys) [9].
- Planning numbers: assume **10%** of calculator users finish (conservative, anonymous traffic, phone users on a job), with **25%** as the upside.

## 3. What buyers do with this data (why it sells)
- **Manufacturers** buy channel-share, brand-use and switching data: L.E.K.'s contractor survey is written for branded building-product managers [4]. Farnsworth gives a brand-ratings report free and sells custom brand-health tracking [6].
- **Software companies** fund surveys for PR and leads (ServiceTitan) [7]. Small publishers use them for backlinks: EstimatorSuite asks citers to link back and offers custom cuts [5].
- **Trade media** run biennial profiles (ECmag, 926 responses via Renaissance Research) [1]. A quarterly, larger, electrician-only dataset fills the gap between their editions.
- Open gap: no source shows what an insurer or distributor *pays* per report. That's exactly what the Phase 2 sell-before-build emails test.

## 4. Build spec for Claude Code (when approved)
- One card under the result: "Help us build the 2026 electrician report — 5 taps, anonymous." Show progress dots; skip link always visible.
- Store: survey_responses(visitor_id, question_id, answer, quarter, created_at). No IP, no free text. Respect the internal-browser filter.
- Rotating question: config file with a quarter → question map.
- Dashboard: completion rate (shown / started / finished), answers by question, completes this quarter vs the 400 target, cost per completed survey (Ads cost ÷ completes) for the Phase 4 rule.
- Consent line under the card (privacy-consent-research.md §4). Email capture for the full report is a separate, optional step after the survey.

## Sources
1. ELECTRICAL CONTRACTOR, 2026 Profile of the Electrical Contractor — https://www.ecmag.com/magazine/articles/article-detail/2026-profile-of-the-electrical-contractor
2. EC&M, Electrical Contractors Hold Strong Brand Preferences (EMA study) — https://www.ecmweb.com/construction/article/20897550/electrical-contractors-hold-strong-brand-preferences
3. Global Sources, Survey reveals electricians' tool purchasing decisions (Klein Tools / Russell Research) — https://www.globalsources.com/knowledge/survey-reveals-electricians-tool-purchasing-decisions/
4. L.E.K., Contractor Behavior Survey — https://www.lek.com/sites/default/files/insights/pdf-attachments/LEK_1602_ContractorBehaviorSurvey_Web2.pdf
5. EstimatorSuite, 2026 Contractor Software Adoption Survey — https://estimatorsuite.com/research/2026-contractor-software-adoption-survey/
6. The Farnsworth Group, Top brands rated by contractors — https://www.thefarnsworthgroup.com/blog/top-brands-rated-by-contractors
7. ServiceTitan 2026 Residential State of the Trades (via Finviz/GlobeNewswire) — https://finviz.com/news/342846/servicetitan-report-finds-74-of-residential-contractors-see-ai-as-key-to-efficiency-as-industry-shifts-toward-execution-led-growth
8. Refiner, In-app survey response rates — https://refiner.io/blog/?p=2545
9. SurveyMonkey, Survey questions and completion rates — https://www.surveymonkey.com/curiosity/survey_questions_and_completion_rates/
