# Page structure and SEO — research item 4 (Oct 31 2026)

Question: should calculator + chart + formula sit on one page, or be split? Data: live US SERPs (TinyFish, Oct 31; snapshot, positions shift) plus Screen 26 volumes (Planner buckets: order of magnitude only).

## 0. Decisions (ranked)
1. **Split charts into their own pages; keep formula + worked example on the calculator page.** Every chart term's #1 is a dedicated static chart page. Calculator pages also rank #2 for chart terms and #1 for "formula" terms. So: calculator pages carry the formula (and a small linked chart). Each 50K chart term gets its own page that links back.
2. **Add two pages; the site goes from 9 to 11:**
   - `/conduit-fill-chart`: max same-size conductor counts by raceway type, Note 7 applied, generated from the math module. Tabs: EMT, PVC 40, PVC 80, RMC, IMC, FMC, LFMC. Beats Elliott (no PVC; 2020 code) and Border States (1996 references; the 1¼" EMT #6 error).
   - `/wire-gauge-chart`: AWG physical data (size, diameter, cmil, DC resistance Cu/Al at 75 °C, area of THHN). Targets "wire gauge chart". Pelican Wire and Wikipedia rank on dimension tables, not ampacity.
   - The existing `/ampacity-chart` also targets "wire size chart": Cerrowire's ampacity page ranks #1 for "wire size chart" and #3 for "wire gauge chart".
3. **Ohm's law page = calculator + formula wheel + "Ohm's law formula" section.** calculator.net ranks with this combo for both terms. Fluke's explainer is #1 for the formula term, so lead the formula section with plain E = I × R wording.
4. **Voltage drop page should own "voltage drop formula" too.** Southwire's calculator is #1 for the formula query while showing no formula; Mike Holt's explainer is #3. Our formula + plugged-in numbers section should be able to win it. No separate formula page for now.
5. **Page basics (each page):**
   - title = "[Term] — [what it does] (NEC 2017–2026)";
   - one H1 matching the term;
   - the calculator above the fold;
   - formula, worked example and an FAQ with 4–6 real questions pulled from the competitor complaints;
   - links to the related chart and calculators;
   - `WebApplication` or `Dataset`/`Table` structured data plus `FAQPage`;
   - visible "last checked against NFPA 70" date.
6. **Don't build separate pages for "calc" vs "calculator" variants.** Planner gives them shared volume (Screen 26 note), so one page per concept.

## 1. SERP evidence
| Term (Screen 26 volume) | #1 | #2 | #3 | Page type that wins |
|---|---|---|---|---|
| voltage drop calculator (50K) | Southwire calculator | calculator.net | GreAlpha DC | calculator |
| voltage drop formula | Southwire calculator | busybusy calculator | Mike Holt explainer | calculator (formula intent served by calculators) |
| conduit fill calculator (50K) | Southwire | conduitfillcalculator.com | Southwire app | calculator |
| conduit fill chart (50K) | Elliott Electric chart | Southwire calculator | Border States chart | dedicated chart, calculator #2 |
| conduit fill table | Elliott chart | Southwire calculator | Border States chart | same |
| ampacity chart (50K) | Cerrowire chart | USA Wire PDF | Encore table | dedicated chart |
| wire size chart (50K) | Cerrowire ampacity chart | Pelican gauge chart | Nassau "NEC wire gauge chart" | chart (ampacity-style wins) |
| wire gauge chart (50K) | Pelican gauge (dimensions) | Wikipedia AWG | Cerrowire ampacity | chart (dimension-style wins) |
| ohms law calculator (50K) | calculator.net | ohmslawcalculator.com | RapidTables | calculator |
| ohms law formula | Fluke explainer | YouTube | calculator.net | explainer / calculator with formulas |
| wire size calculator (5K) | Paige (unsafe answers) | Southwire VD | Omni | calculator |
(Rows from competitor-pages-research.md SERP snapshot plus 5 new SERPs pulled Oct 31.)

## 2. Why this beats the incumbents
- **Chart pages:** all three chart leaders are static, dated (2017/2020/1996 code references), partly wrong or missing raceway types, and cite no method. Ours: generated from tested math, every raceway type, current edition note, method shown.
- **Calculator pages:** no #1 shows the formula with table numbers, and all need a Calculate button (competitor research). Ours already does both.
- Manufacturer domains (Southwire, Cerrowire) carry strong authority. Expect positions 5–15 for months. Backlinks from the quarterly survey (survey-research.md) are the lever.

## 3. Build spec for Claude Code (with the indexing pass)
- Add `/conduit-fill-chart` and `/wire-gauge-chart`, generated at build time from the math module (no hand-typed numbers), with tests: chart cells must equal calculator outputs. Spot checks: 1¼" EMT #6 THHN = 11; ¾" EMT #12 THHN = 16.
- Retitle `/ampacity-chart` to cover "Ampacity Chart & Wire Size Chart".
- Add formula sections to Ohm's law ("Ohm's law formula") and voltage drop ("Voltage drop formula") with H2s matching those terms.
- Per-page FAQ (4–6 items) from the competitor complaints; FAQPage + WebApplication JSON-LD; sitemap.xml; canonical tags; internal links (calculator ↔ chart).
- Keep noindex until the NFPA 70 check and lawyer read; then flip `indexable: true` and submit the sitemap in Search Console (Colin's step).

## Sources
- Live US SERPs via TinyFish search, Oct 31 2026: wire gauge chart, wire size chart, ohms law formula, voltage drop formula, conduit fill table.
- competitor-pages-research.md (9-term SERP snapshot, Oct 31 2026).
- screen26-results.md (volumes and bids).
- Pages cited: https://pelicanwire.com/resources/product-design-tools/wire-gauge-size-chart/ · https://en.wikipedia.org/wiki/American_wire_gauge · https://www.cerrowire.com/products/resources/tables-calculators/ampacity-charts/ · https://www.elliottelectric.com/StaticPages/ElectricalReferences/ElectricalTables/Conduit_Fill_Table.aspx · https://solutions.borderstates.com/resources/conduit-fill-table/ · https://www.fluke.com/en-us/learn/blog/electrical/what-is-ohms-law · https://www.calculator.net/ohms-law-calculator.html · https://www.southwire.com/calculator-vdrop · https://www.mikeholt.com/technnical-voltage-drop-calculations-part-one.php
