# Competitor Pages Research — wirecalculators.com

Date: 2026-10-31. Rankings: US Google SERP via TinyFish search (location=US); single snapshot, positions shift. The plain WebSearch tool gave spam/scraper results, so I didn't use it for rankings.
Method: fetched each #1 page (raw HTML + rendered text), read the calculator JS or endpoint where I could, and ran test cases against `docs/research/calc_reference.py` (in `/home/claude/trade-calculator`).
Legend: **[tested]** = I ran it. **[read]** = from page text or code. **[uncertain]** = not verified.

## SERP snapshot (top 3 organic)

| Term | #1 | #2 | #3 |
|---|---|---|---|
| voltage drop calculator | southwire.com/calculator-vdrop | calculator.net/voltage-drop-calculator.html | grealpha.com (DC load wiring) |
| conduit fill calculator | southwire.com/calculator-conduit | conduitfillcalculator.com | Southwire Conduit Fill app (Google Play); then encorewire.com, conduit-fill-calculator.com |
| conduit fill chart | elliottelectric.com Conduit_Fill_Table.aspx | southwire.com/calculator-conduit | solutions.borderstates.com/resources/conduit-fill-table |
| ohms law calculator | calculator.net/ohms-law-calculator.html | ohmslawcalculator.com | rapidtables.com |
| wire size calculator | paigeconnected.com/calculators/wiresize-calculator | southwire.com/calculator-vdrop | omnicalculator.com/physics/wire-size |
| wire gauge calculator | paigeconnected.com (same page) | southwire.com/calculator-vdrop | shop.explorist.life (DC/ABYC) |
| ampacity chart | cerrowire.com …/ampacity-charts/ | usawire-cable.com NEC ampacities PDF | encorewire.com wire-size-table |
| generator size calculator | lowes.com/l/help/wattage-calculator | generac.com solution finder | powerequipment.honda.com |
| amps to watts calculator | electricalsafetyfirst.org.uk (a UK charity) | rapidtables.com Amp_to_Watt | a1solarstore.com |

## Per-term table (#1 page, plus #2 where the rule applied)

| Term | #1 URL | Inputs | Outputs | Formula / NEC refs shown? | Instant? | Chart on page? | Monetization | Accuracy issues found |
|---|---|---|---|---|---|---|---|---|
| voltage drop calculator | southwire.com/calculator-vdrop | Mode (Residential / Commercial 60/75/90°C, with a click-through agreement), PF (commercial modes only, default 0.9), AC/DC, ft/m, phase 1/3 (residential = 1 only), Cu/Al, installation (non-steel conduit/cable/burial, steel conduit, overhead, free air), calc type (min size / max distance / VD), size 14 AWG–1000 kcmil, length, volts, max VD %, amps, parallel sets [read] | VD %, min size or max distance, "rated ampacity", R and X used (Ω/kft), PF, allowed vs actual VD, PDF download [tested] | **No formula. No NEC table cited.** Shows the R and X values only | No. Calculate button, server-side POST | No | None on page. Brand/product promos, app download links. Scripts: GTM, PriceSpider, BrightEdge, OneLink, Pingdom; 2.6 MB `bundle2.js` + 343 KB `bundle.js` | **R doesn't match NEC Table 9:** 12 AWG Cu in steel uses R = 2.076 Ω/kft (Table 9: 2.0). Test 12 Cu, steel, 16 A, 100 ft, 120 V 1φ, PF 0.85 gives **4.78%**; Table 9 Note 2 gives 4.63% (5.55 V) [tested]. A Mike Holt PE thread found its result matches Note 2 only at PF 0.9, not at 0.8 or 1.0 ("guess is a bug") [read]. Good: enforces 240.4(D) (24 A at 75°C → 10 AWG, not 12) [tested] |
| voltage drop calculator (#2, calculator.net) | calculator.net/voltage-drop-calculator.html | Tabs: NEC data (Cu/Al, 14–1000, conduit PVC/Al/steel, PF), estimated resistance (Cu/Al/silver/gold, 40 AWG–600 kcmil), custom Ω; volts, DC / AC 1φ / AC 3φ, 1–9 parallel sets, one-way distance in ft/m/mi/km, amps | VD (V), VD %, voltage at end | Shows V = 2·I·R·L and √3·I·R·L (R only), plus an AWG resistance table. **The displayed formula doesn't match the NEC tab's R+X method**; no NEC table numbers | No. Calculate reloads the page (GET) | Yes, AWG resistance table | Google Ad Manager (GPT) display ads | Same test gives **5.59 V / 4.66%** vs 5.555 V by Note 2. That's consistent with the exact phasor formula (≈ +0.6%), so a method difference, not an error [tested/inferred]. No ampacity check and no warning past 3/5% |
| conduit fill calculator | southwire.com/calculator-conduit | Conduit type and size; conductor rows: about 30 wire types (Cu/Al THHN, XHHW, RHH-USE, PV wire, MV 5–35 kV, user-defined OD), size, count [read] | Fill %, jam probability (≥3 wires, 5% bend factor) | Says "per NEC" but cites no table. Explains jam ratio | No (button, JS app) | No | Product/app promos | Al entries use **compact-conductor** dimensions. A Mike Holt thread found that confusing vs. standard THHN math [read]. App reviewers want a **max-count** answer it doesn't give [read]. Note 7 n/a (it outputs %, not counts) |
| conduit fill calculator (#2) | conduitfillcalculator.com | Conduit type (12: EMT, ENT, FMC, IMC, LFNB, LFNA, LFMC, RMC, PVC-80, PVC-40/HDPE, PVC-A, PVC-EB), 1/2–6 in; rows of insulation (4 groups) × gauge 18 AWG–900 kcmil × count | Total wire area, conduit area, fill % — **in mm²** | No formula or table refs in the tool | No (button) | No (separate blog post) | AdSense (11 slots) + Amazon ads, "sponsored by Electrician Calculator Pro" app | Outputs mm² to US users who work in in². Old WordPress/jQuery 1.10 over plain http. No pass/fail or min-size answer visible [read] |
| conduit fill chart | elliottelectric.com …/Conduit_Fill_Table.aspx | Static tables: THHN/THWN 14–750 × EMT/IMC/RMC/FMC trade sizes (non-PVC only) | Max same-size conductor counts | Cites 2020 NEC Annex C Tables C.1/C.3/C.4/C.9. No method shown | n/a (static) | Yes, the page is the chart | Each wire and conduit size links to Elliott's store (own e-commerce); app badges | Counts I spot-checked match Note 7 math (e.g. 1-1/2 EMT 1/0 = 4) [tested]. **2020 edition, no PVC.** Bot-hostile (curl timed out) |
| conduit fill chart (#3, Border States) | solutions.borderstates.com/resources/conduit-fill-table | Trade size selector; THHN 14–750 × EMT/IMC/GRC | Counts | None | n/a | Yes | Distributor catalog | **1-1/4 EMT #6 THHN = 12**, but Table 4/5 math gives 0.598/0.0507 = 11.79, so 11 under Note 7 (the reference script agrees) [tested]. **Likely error** |
| ohms law calculator | calculator.net/ohms-law-calculator.html | Any 2 of V (kV/V/mV), I (A/mA), R (Ω/kΩ/MΩ), P (W/kW/MW/hp/BTU/h) | Other two values | V=IR, P=VI, P=V²/R, P=I²R; formula wheel | No (Calculate, reload) | Formula wheel | Display ads (GPT) | None found. DC/resistive only; no AC/PF variant |
| wire size / wire gauge calculator | paigeconnected.com/calculators/wiresize-calculator | Volts (120/240/480 radio only), 1φ/3φ, amps (max 3 digits), one-way ft, VD % (max 5) | One Cu size and one Al size | Shows the CM formula with K = 11.2 Cu / 17.4 Al "at 53°C". Cites **old NEC numbering** (210-19 FPN 4, 430-148/150) | No (button, client JS) | No | Manufacturer page (pump wire), GTM. **3.9 MB HTML** plus jQuery, GSAP, ScrollMagic, parallax | **Ignores 240.4(D):** a 15 A, 120 V, 10 ft run returns **16 AWG Cu** (its table allows 16 AWG to 18 A) [read from JS]. Ampacity table mixes 60°C and 75°C columns (10 Cu = 30, 12 Cu = 25). **3/0 commented out** (jumps 2/0 → 4/0). 8 AWG area typo 15,510 (should be 16,510 cmil). No 110.14(C) choice. K at 53°C instead of 75°C Table 8 basis |
| wire size (#3, Omni) | omnicalculator.com/physics/wire-size | DC/AC 1φ or 3φ, source V, allowable VD, Cu/Al, current, one-way distance, max wire temperature | Area (mm²), AWG, diameter | Resistivity formula A = 2ρIL/V; worked example | Yes (live) | No | Omni platform (Next.js, 724 KB HTML, Stripe sign-up); ads not visible in static HTML [uncertain] | **VD-only sizing, no ampacity / 240.4(D) / 110.14(C) check** visible, so short high-amp runs come back undersized. Its 3-phase FAQ says "multiply by √3/2" |
| ampacity chart | cerrowire.com/…/ampacity-charts/ | Static chart: Cu 60/75/90°C, Al 75/90°C, 14–1000 | Ampacities, PDF download | Labels the columns with insulation types; page references the **2017 NEC**. No table numbers in the chart | n/a | Yes | Manufacturer. Contact form with email field ("I am a…" lead capture); links to its ampacity calculator (which can email results) | **No 240.4(D) footnote** on 14/12/10 Cu (15/20/30 A). Encore's #3 table has one [read]. Its companion calculator uses 2017 numbering (310.15(B)(16), (B)(2)(a), (B)(3)(a)) but applies 110.14(C)(1) correctly [read] |
| generator size calculator | lowes.com/l/help/wattage-calculator | Use case (home backup / recreation / job site / events), pick appliances, custom item + watts | Total running watts, recommended running-watt range, product recommendations | No formula | Live tally (JS) [uncertain] | No | Retail. Product recommendations, "Ask Mylow" assistant | No starting/surge-watt handling visible in the text [uncertain]. #2 Generac = 5-step dealer lead funnel ("Get an Estimate") |
| amps to watts calculator | electricalsafetyfirst.org.uk/units-calculator/ | Tabs: A→W, W→A, Ohm's law; DC / AC 1φ / AC 3φ; line-to-line vs line-to-neutral | Result value | Shows "Amps × Volts = Watts" | No (Calculate) | No | UK charity; CookiePro, ShareThis | **UK-oriented (50 Hz text). No PF field visible** in the A→W tab text [uncertain]. #2 RapidTables has PF and 3φ L-L/L-N inputs, a Calculate button, and an amps→watts table at 120 V; no ads detected in HTML |

## Electrician-focused competitors seen repeatedly
- **Southwire** (VD, conduit fill, cable pull; web + iOS/Android): ranks #1–2 on 4 of 9 terms. Free, no ads, but slow server-side calls and no formula shown.
- **Cerrowire** (ampacity chart and calculator, VD, raceway fill), **Encore Wire** (raceway fill, ampacity table with the 240.4(D) note), **Paige Electric**: wire makers.
- **Distributors with static charts:** Elliott Electric, Border States.
- **Generic giants:** calculator.net, Omni, RapidTables, Inch Calculator.
- **Mike Holt** (Toolbox app; forum is the pro discussion venue), **Ugly's** ($12.99 app), **ElectriCalc Pro / Electrical Calc Elite** (paid apps; NEC 2023 sold as an in-app purchase).

## New entrants (2026)

| Site | Inputs | Outputs | Method / NEC citations | Edition picker | Monetization | Accuracy notes |
|---|---|---|---|---|---|---|
| fulcrumvdc.com/calculators/conduit-fill-calculator | Edition (2017/2020/2023), 9 raceway types with Article numbers, conductor rows (size 14–1000 × THHN/XHHW/THW/TW/RHH/**bare EGC**), nipple ≤24 in toggle (60%, Note 4) | Min trade size, fill %, total area, allowed area, "Show the math" step table (formula, substitution, value) | **Every result cites a specific table** (Ch. 9 Tables 1/4/5/8). VD on a Table 9 basis; ampacity from 310.16 + correction + adjustment, capped by 110.14(C). Says it's checked against Annex C | **Yes**, and citations renumber per edition | None detected. 16.8 KB HTML, runs client-side, cross-links to HVAC calcs (VDC firm) | None found. Displays 0.0399 in² as "0.04" (coarse rounding in display only). **Closest match to our positioning** |
| conduitfilltool.com/voltage-drop-calculator/ | Amps, one-way ft/m, Cu/Al, size, PF presets 1.0–0.80, raceway (steel/PVC), parallel 1–6 | VD V and %, end voltage, I²R watts, max distance for 3% and 5%, Z_eff, ampacity, 250.122(B) EGC upsize notice, multi-gauge comparison grid | Shows Z = R·cosθ + X·sinθ and K/Table 8 formulas. Cites Table 9, 210.19(A) IN 4, 250.122(B) | No (claims "NEC 2023/2026") | **AdSense**, WordPress + React, 339 KB HTML | Its comparison table claims calculator.net uses a "generic DC formula". **False:** calculator.net's NEC tab uses R+X+PF [tested]. Its reference table lists **solid**-conductor Table 8 R for 14–8 AWG (3.07/1.93/1.21/0.764) vs stranded (3.14/1.98/1.24/0.778), inconsistent with larger sizes. Shows "25 A" for 12 AWG on a 20 A circuit with no 240.4(D) flag [uncertain whether it flags elsewhere]. "Master Electrician Verified" is unverifiable |
| conduitcalculator.com | Imperial/metric, conduit EMT/IMC/RMC/PVC40/PVC80 1/2–4 in, multiple conduits, manufacturer cable picker or custom OD | Live fill results, conduit size, cable capacity, jam ratio, export (record with formulas) | Methodology page; cable-OD based (aimed at cables, not THHN) | Not seen | None detected; "Conduit Calculator Pro" label suggests a planned paid tier [uncertain]. Next.js | Not tested |
| voltagedropcalculator.net/conduit-fill-calculator/ | Raceway EMT/PVC40/PVC80/RMC, trade size; hot/neutral/EGC rows (THHN/THWN-2 only) | Total area, allowable area, rule (53/31/40%), recommended size, pass/over % for every trade size | Names the Ch. 9 fill limits; no table numbers per result | No ("NEC 2023") | **AdSense**, Next.js | Treats EGC as insulated THHN only (no bare/Table 8 option). Claims "1M+ monthly, 50K+ professionals, IEEE accuracy" are unverifiable. Math on its sample (3×#3 + #3 + #8 = 0.426 in²) is correct |

App-only competitors (from store listings and snippets):
- **IDEAL Electrician's Sidekick**: free (IDEAL); level, offset bending, conduit fill, wire size and VD, box fill, data-comm; Play 4.0★ / 81 reviews.
- **VoltWirer**: no store listing or site found in search [uncertain; may be very new or renamed].
- **ConduitLab** (Teleios AI): ampacity, VD, conduit fill with 2D/X-ray visualizer, PDF reports, NEC 2017–2026, offline; Play lists "Contains ads" + Pro subscription; 50+ downloads.
- **QuickNEC**: iOS, NEC 2023; conduit fill, ampacity, VD, grounding (250.122/250.66), table browser, "Inspector Mode"; one-time purchase, no ads.
- **Dakota** (Dakota Prep): apprentice-focused; AI voice-first calcs (load, conduit, VD, motor, transformer), hours tracking, NEC flashcards; claims 20k students.

## Patterns

**Table stakes (most top pages have these):**
1. Cu/Al, 1φ/3φ, parallel sets, and ft/m on voltage-drop pages (Southwire, calculator.net).
2. A min-size / max-distance / VD-% mode switch (Southwire; new entrants add max distance for 3% and 5%).
3. Static charts are HTML tables with a PDF download (Cerrowire, Elliott, Border States).
4. A brand-trust domain (wire makers and distributors hold #1 on 5 of 9 terms).

**Gaps nobody in the top 3 covers (ranked by likely impact):**
1. **Code correctness on wire size.** The #1 "wire size/gauge calculator" (Paige) recommends 16 AWG for a 15 A circuit; #3 (Omni) has no ampacity check at all. Only Southwire enforces 240.4(D). The biggest accuracy gap on two high-volume terms.
2. **Formula + NEC table citations on every result.** None of the #1 pages show the formula with table numbers, and calculator.net shows the wrong formula for its own method. A Mike Holt poster won't trust a calculator when "one does not know the algorithm". Only new entrant Fulcrum does this.
3. **Instant results.** Every #1 calculator except Omni needs a Calculate button, and Southwire does a server round-trip. Lowe's tallies live but is a shopping tool.
4. **Current-edition data.** Elliott (2020), Cerrowire (2017 numbering) and Paige (pre-2014 numbering) are all stale. No top page lets you pick an edition (2017/2020/2023 are all enforced somewhere).
5. **Chart + calculator on one page.** Ranking for "conduit fill chart" means a static table. No top page pairs a correct Note-7 chart with a calculator, and Border States has a likely Note 7 error.
6. **Max-count answer for conduit fill.** Southwire gives % only; reviewers ask for "total number of wires".
7. **US-specific amps→watts with PF.** A UK charity page ranks #1 for a US query.
8. **Generator sizing with starting watts.** Retail and dealer funnels rank; no neutral running + surge calculator ranks.
9. **Lightweight pages.** Paige is 3.9 MB HTML and Southwire ships 2.9 MB of JS. Hard numbers on load time weren't measured.

## Pro complaints (quotes <15 words)
1. "I see lots of apps but none are using the NEC values." — https://forums.mikeholt.com/threads/conduit-fill-voltage-drop-applications.2577577
2. "Unfortunately the developers long ago abandoned the app." — same thread
3. Wants to check whether existing conduit can take more wire (service work). — same thread
4. "My guess is a bug in the calculator." (Southwire VD vs Table 9 Note 2) — https://forums.mikeholt.com/threads/is-the-southwire-voltage-drop-calculator-wrong.2581858
5. "I am leery of any internet voltage drop calculator where one does not know the algorithm" — https://forums.mikeholt.com/threads/voltage-drop-and-the-90-degree-column.2549160
6. Southwire Al fill silently uses compact-conductor dimensions, which confused users — https://forums.mikeholt.com/threads/conduit-fill-discrepancy-southwire-vs-nec.2583291
7. "The voltage drop calculator works fine too but a little confusing." — thread in #1
8. "Only suggestion would be, add split phase (dual phase) selections" — https://play.google.com/store/apps/details?id=com.southwire.voltageDrop
9. "nice to have a separate table showing max amps on a specific awg wire" — same listing
10. "should have an option to tell you the total number of wires per type" — https://apps.apple.com/us/app/southwire-conduit-fill-calc/id509204523
11. "you have to have the manual in front of you" — https://apps.apple.com/us/app/electrical-calc-elite/id510284903?platform=iphone&see-all=reviews
12. "now they switched to a rip-off scheme…with subscription" (ElectriCalc Pro) — https://play.google.com/store/apps/details?hl=en_ZA&id=com.calculated.carmencita
13. "It would be great to see amps, voltages, distances on the display." — same listing
14. "A bad joke for a journeyman electrician. Not at all worth the $12.99." (Ugly's) — https://play.google.com/store/apps/details?hl=en_GB&id=com.ascendlearning.uglys.purchase
15. "It will take getting used to before you trust that your using it right." — https://www.electriciantalk.com/threads/electrical-apps.247409

## Recommendations for our pages (ranked)
1. **Wire size/gauge page: enforce 240.4(D) and 110.14(C) and say so in the result** ("12 AWG limited to 20 A OCPD, 240.4(D)"). This beats Paige's 16 AWG / 15 A error and Omni's missing ampacity check on two terms. (Evidence: Paige JS, Omni inputs, Southwire test.)
2. **Every result shows the formula, substituted numbers and the table cited** (Ch. 9 Table 9 Note 2, Table 310.16). This answers complaints 1, 4, 5 and 15 and matches Fulcrum, the strongest new entrant.
3. **Compute instantly, client-side, no Calculate button**, and keep pages tiny. Southwire, calculator.net and Paige all make you submit; Paige and Southwire are heavy.
4. **Voltage drop: Table 9 R+X with PF and conduit material, from raw table values, and state the method.** Show the R and X used (as Southwire does) plus the formula (which Southwire doesn't). Optionally note the exact-phasor difference (calculator.net's ~0.6%).
5. **Conduit fill: output the max count per Note 7, the min trade size and fill %**, with a bare-EGC option and an explicit compact-Al toggle. (Evidence: Southwire reviews, compact-Al confusion, voltagedropcalculator.net THHN-only EGC.)
6. **Conduit fill chart page: a correct HTML chart generated from Table 4/5 math (Note 7), with the calculator on the same page**, all raceway types including PVC. Spot-check against Annex C. Border States has a likely 1-1/4 EMT #6 error; Elliott omits PVC and is on 2020.
7. **Ampacity chart: include the 240.4(D) footnote and the 110.14(C) column guidance**, cite Table 310.16 by number (values only, not NFPA layout), and cover the current edition. Cerrowire's #1 chart lacks the footnote and is 2017-based.
8. **Add 120/240 V split-phase as a named choice and echo all inputs in the result line** (complaints 8 and 13).
9. **Amps-to-watts: US voltages (120/208/240/277/480), PF, 1φ/3φ L-L** plus a quick table. A UK page holding #1 suggests weak competition.
10. **Generator size: running + starting watts using a stated convention** (reference `gen_size` has both methods), neutral and not a product funnel. Lowe's and Generac are retail/lead funnels.

## Sources
- https://www.southwire.com/calculator-vdrop (plus `/calculator-vdrop/results`, `/changePhase`, `/changeInstallation` endpoints)
- https://www.southwire.com/calculator-conduit
- https://www.calculator.net/voltage-drop-calculator.html
- https://www.calculator.net/ohms-law-calculator.html
- http://conduitfillcalculator.com/
- https://www.elliottelectric.com/StaticPages/ElectricalReferences/ElectricalTables/Conduit_Fill_Table.aspx
- https://solutions.borderstates.com/resources/conduit-fill-table/
- https://paigeconnected.com/calculators/wiresize-calculator
- https://www.omnicalculator.com/physics/wire-size
- https://www.cerrowire.com/products/resources/tables-calculators/ampacity-charts/
- https://www.cerrowire.com/products/resources/tables-calculators/ampacity-calculator/
- https://www.encorewire.com/products/tools-and-resources/calculators/wire-size-table.html
- https://www.lowes.com/l/help/wattage-calculator
- https://www.generac.com/home-standby-generators/find-the-right-generator/
- https://www.electricalsafetyfirst.org.uk/units-calculator/
- https://www.rapidtables.com/calc/electric/Amp_to_Watt_Calculator.html
- https://www.fulcrumvdc.com/calculators/conduit-fill-calculator
- https://conduitfilltool.com/voltage-drop-calculator/
- https://conduitcalculator.com/
- https://voltagedropcalculator.net/conduit-fill-calculator/
- https://conduitlab.app/ ; https://play.google.com/store/apps/details?id=com.teleiosai.conduitlab
- https://quicknec.app/
- https://www.dakotaprep.com/electrician-app
- https://idealelectricalinc.com/sidekick ; https://play.google.com/store/apps/details?id=com.ideal.electriciansidekick
- Forum and review URLs listed under "Pro complaints"
