# Calculator math and code tables — research item 2 (Oct 30 2026)

Covers the 6 MVP calculators: voltage drop, conduit fill, Ohm's law, wire size, generator size, amps↔watts.
Companion code: `claude/calc_reference.py` (reference implementation + 50 sourced test cases + 64-cell Cerrowire table check). Run `python3 calc_reference.py`. Result Oct 30: **49/50 tests pass, 59/64 Cerrowire cells match** (misses explained in §7).

## 0. Decisions for the build (ranked)
1. **Voltage drop: use Ch. 9 Table 9 (AC R + XL, power factor) as the default, show the K-method (12.9/21.2) as "quick check."** Table 9 matched every engineering example to ±0.02 V; the K-method overstates large-conductor drop (500 kcmil example: K-method off by ~20%, PDHonline E426).
2. **Compute everything from the raw table values (R, XL, areas), never from pre-rounded columns** (e.g. Table 9 "Effective Z at 0.85 PF"). The one failing test is exactly this: the source used printed Zeff 1.7 Ω, the real value is 1.729 Ω (4.15 V vs 4.08 V).
3. **Conduit fill must apply Ch. 9 Note 7 (round up at ≥ .8).** At least one ranking competitor (PES Supply chart) truncates and under-counts (14 THHN in ¾" PVC: 20 shown, 21 correct). Easy accuracy win to market.
4. **Wire size must enforce 240.4(D) and 110.14(C)** (60 °C column for ≤100 A / ≤1 AWG unless equipment is marked 75 °C). Derating = 90 °C column × ambient × bundling, then cap at the termination column.
5. **Generator: show both conventions and default to the conservative one** (running total + highest single starting watts). Sites disagree; see §5.
6. **Support NEC 2017–2026 with one dataset.** Values used here are identical across 2017, 2020, 2023 and 2026 for 14 AWG–1000 kcmil; 2026 only *adds* rows (16 AWG Cu, 14 AWG CCA) [6][7]. Adoption is a patchwork: ~20 states on 2023, 6+ on 2026 (Texas from Sep 1 2026), PA still on 2017 [8][9][10]. Show "same in NEC 2017–2026" on each page.

## 1. Voltage drop
**Formulas**
- K-method (Ch. 9 Table 8 basis): single-phase VD = (2·K·I·L) ÷ CM; three-phase VD = (√3·K·I·L) ÷ CM. K = 12.9 Cu, 21.2 Al (Ω·cmil/ft at 75 °C, from 1000 kcmil resistance) [1][2].
- Resistance method: VD = 2·I·R·L ÷ 1000 (1φ), √3·I·R·L ÷ 1000 (3φ), R from Table 8 (DC) [3].
- **Table 9 method (default):** Z_eff = R·cosθ + X_L·sinθ, θ = arccos(PF); VD = (2 or √3)·I·Z_eff·L ÷ 1000. R and X_L chosen by conduit (PVC / aluminum / steel) [4][5].
- Solve-for forms: CM_min = 2·K·I·L ÷ VD_allowed; L_max = CM·VD ÷ (2·K·I) [2].
- Temperature correction (Table 8 Note 2): R₂ = R₁[1 + α(T₂ − 75)], α = 0.00323 Cu, 0.00330 Al [4].
- Parallel sets: divide I by number of sets.
- Optional "exact" (IEEE 141/241): Vr = √(Vs² − (IX·cosθ − IR·sinθ)²) − (IR·cosθ + IX·sinθ), line-to-neutral; adds <0.02 V in all examples [3]. Not needed for MVP.

**Limits to display:** 3% branch, 5% feeder+branch — Informational Notes only (210.19(A) IN, 215.2(A) IN), **not enforceable** per 90.5(C). Enforceable exceptions: 647.4(D) sensitive electronics (1.5%/2.5%), 695.7 fire pumps [3][11].

**Tables used:** Ch. 9 Table 8 (cmil, DC Ω/kft at 75 °C), Table 9 (AC R, X_L per conduit, 75 °C, 60 Hz, 3 single conductors in conduit) [4].

## 2. Conduit fill
- Max fill (Ch. 9 Table 1): 1 conductor 53%, 2 conductors 31%, >2 conductors 40%; nipples ≤24 in: 60% and no bundling derate (Note 4) [12][13].
- Mixed sizes: Σ(Table 5 area) ≤ Table 4 allowable area for that raceway type/size [12].
- Same size: N = floor(Table 4 area ÷ Table 5 area), +1 if remainder ≥ .8 (Note 7) [12].
- Annex C gives precomputed counts; it is informative and must equal the Table 4/5 math [13].
- Raceway types needed for MVP: EMT, PVC Sch 40, PVC Sch 80, RMC, IMC, FMC, LFMC (Table 4 has a sub-table per type). Conductors: THHN/THWN-2, XHHW-2, THW, RHH (Table 5); compact Al in Table 5A.
- Key values verified: THHN 14/12/10/8/6 = .0097/.0133/.0211/.0366/.0507 in² [12][14]; EMT 40%: ½" .122, ¾" .213, 1" .346, 1¼" .598 [13][15].

## 3. Ohm's law (and power wheel)
V = I·R, I = V/R, R = V/I; P = V·I = I²R = V²/R. No code table. Add "wire resistance" helper: R = (Table 8 Ω/kft) × L/1000 (12 AWG × 200 ft = 0.396 Ω) [16].

## 4. Wire size / ampacity
- Base ampacity: Table 310.16 (30 °C ambient, ≤3 current-carrying conductors), columns 60/75/90 °C, Cu and Al [6][17].
- Small-conductor OCPD limits 240.4(D): 14 Cu 15 A, 12 Cu 20 A, 10 Cu 30 A; 12 Al 15 A, 10 Al 25 A [17].
- Termination column 110.14(C)(1): ≤100 A or 14–1 AWG → 60 °C unless equipment marked 75 °C; >100 A → 75 °C [18].
- Ambient correction Table 310.15(B)(1)(1); bundling Table 310.15(C)(1): 4–6 80%, 7–9 70%, 10–20 50%, 21–30 45%, 31–40 40%, 41+ 35% [17].
- Derate order: 90 °C value × ambient × bundling, then final ampacity = min(that, termination-column value) — worked example 6 THHN: 75 × 0.91 = 68.25 → capped at 65 A [18].
- NM-B (Romex): forced to 60 °C column (334.80) [6].
- Combine with voltage drop: size = max(ampacity size, VD size) — this is exactly how Cerrowire builds its table [19].

## 5. Generator size
- No NEC table sizes a portable/standby generator. Industry convention only.
- **Convention A (Champion, Murdoch's, most retail):** surge needed = total running W + highest single starting W. Murdoch's example: 1,400 running + 2,200 fridge start = 3,600 W [20].
- **Convention B (Cummins):** surge needed = starting W of largest load + running W of all *other* loads (physically correct; smaller). Cummins example: 2,950 running → 3,950 starting [21].
- Many guides add a 20–25% buffer [22]. Show it as a toggle, not a default.
- Motor surge from nameplate code letter (Table 430.7(B)): LRA = hp × kVA/hp × 1000 ÷ V (1φ) or ÷ (√3·V) (3φ); code G = 5.6–6.29 kVA/hp [23].
- Conductors from generator: ≥115% of nameplate current (445.13) [24].
- kVA = kW ÷ PF for three-phase standby sizing.

## 6. Amps ↔ watts
DC: W = V·I. 1φ AC: W = V·I·PF. 3φ AC: W = √3·V_LL·I·PF. Reverse by division. kVA = V·I(·√3)/1000. PF default 1.0 resistive; show PF input for motors. (Checked: 15 kW at 480 V 3φ = 18.04 A, matching PDHonline's 18 A [3].)

## 7. Test results vs manufacturer output
- **Southwire:** web calculator is JS-only; could not be driven (Chrome extension not connected tonight). Its method per page text: AC/DC, PF input, phase, Cu/Al, conduit type, parallel sets, ampacity mode 60/75/90 °C — i.e. Table 9-style [25]. **Open item:** run 10 cases through Southwire in a browser and add them to the test file.
- **IDEAL:** app only; not checked. Same open item.
- **Cerrowire voltage-drop table (120/240 V, max 3%, steel conduit, PF 0.9, 60/75 °C) [19]:** our min-size logic matches 59 of 64 cells.
  - 2 misses (20 A/50 ft, 30 A/200 ft): our pick is one size bigger because their size gives 3.05% — they round to 3%; we don't.
  - 3 misses (200 A Cu at 100/150/200 ft): Cerrowire's sizes only work if steel-conduit reactance is ignored (DC R). So the PDF's "steel conduit" footnote doesn't hold for large copper. We're more conservative. Decision: keep ours, show % drop so users see why.
- **Engineering examples (PDHonline E426, electrical-knowhow, NEC Handbook ex.):** all voltage-drop cases pass ±0.02 V except the rounded-Zeff case (see §0.2) [3][5].

## 8. What table values can legally be reproduced
- NFPA owns copyright in the NEC; in NFPA v. UpCodes the parties didn't dispute validity [26]. The court later rejected UpCodes' fair-use summary judgment; the case settled with a license (~Mar 2025) [27][28].
- Fair use for posting *incorporated* standards has won non-commercially (ASTM v. Public.Resource.Org, D.C. Cir. 2023) and, preliminarily, for a commercial platform (ASTM v. UpCodes, 3d Cir. Apr 7 2026) [29][30]. Not settled law for a for-profit site; NFPA has sued before.
- Facts are not copyrightable (Feist); physical constants (copper resistivity, wire cmil from AWG geometry, insulation dimensions from UL/manufacturer spec sheets) can be sourced outside the NEC.
- **Practical rule for the site (not legal advice):**
  1. Use values inside calculators freely; cite "NEC Ch. 9 Table 8" etc. by number.
  2. Don't reproduce whole tables in NFPA's layout, titles, notes or footnotes. Reference charts (e.g. ampacity chart, a 50K/mo term) should be our own selection/format, cite the table, and say "verify in your adopted code."
  3. Where possible, source raw data from non-NFPA publications (ASTM B8/B33 resistances, manufacturer spec sheets for THHN diameters, Annex-C-equivalent counts computed by our code).
  4. Never use "NEC" in brand/domain (trademark — already decided in domain-name-research.md).
  5. Before monetizing reference charts, get a 30-min lawyer read. Cost is small vs the risk.

## 9. Verification status of the dataset in calc_reference.py
- **Confirmed by ≥1 published source:** K values; Table 8 resistances for 14–6 AWG Cu, 500/1000 kcmil, Al 12/8/250/500/1000; Table 9 R/X for 10, 12, 1, 3/0, 4/0, 250, 500, 600 Al, 1000; Table 5 THHN 14–4/0; EMT/RMC/PVC 40% areas used in tests; 310.16 rows 6, 4/0, 350 Al, 500 Cu; 240.4(D); bundling factors; Table 1 percentages; 430.7(B) code G; 445.13.
- **From working knowledge, not yet source-checked:** remaining Table 8/9 rows (esp. 8 AWG steel X_L — I have .065, PDHonline uses .066), full 310.16 Al column, PVC 80/IMC/FMC areas, ambient correction table. **Before launch: one pass against a purchased NFPA 70 (2023) — ~2 hours.**

## Sources
1. IAEI Magazine, Voltage drop calculations (Sep 2019) — https://iaeimagazine.org/electrical-fundamentals/voltage-drop-calculations/
2. IAEI Magazine, Voltage drop formulas — https://iaeimagazine.org/electrical-fundamentals/voltage-drop-formulas/
3. PDHonline E426, Voltage Drop Calculations (Snyder) — https://pdhonline.com/courses/e426/e426content.pdf
4. Electrical Knowhow, NEC Chapter 9 Tables 8 & 9 — http://www.electrical-knowhow.com/2013/05/NEC-Chapter-9-Tables.html
5. Mike Holt sample, Ch. 9 Table 9 impedance — https://www.mikeholt.com/img/product/pdf/1038225525sample.pdf
6. WireRef, NEC 2026 changes for wire sizing — https://wireref.com/nec-2026/
7. Electrical License Renewal, 2026 Table 310.16 change — https://www.electricallicenserenewal.com/Electrical-Continuing-Education-Courses/NEC-Content.php?sectionID=1911
8. EC&M, Unpacking key revisions to the 2026 NEC — https://www.ecmweb.com/industry-viewpoint/blog/55330015/unpacking-key-revisions-to-the-2026-nec
9. EC Mag, Wisconsin adopts 2023 NEC (6 states on 2026) — https://www.ecmag.com/magazine/articles/article-detail/wisconsin-updates-national-electrical-code-to-2023-edition
10. TDLR bulletin, Texas 2026 NEC from Sep 1 2026 — https://content.govdelivery.com/accounts/TXDLR/bulletins/422bc69
11. IAEI Magazine, voltage drop in the NEC (informational notes list) — https://iaeimagazine.org/?p=17791
12. open-exam-prep, Conduit fill: Chapter 9 tables and Annex C — https://open-exam-prep.com/study-guides/ak-electrician/ch05/ch05-sec06
13. open-exam-prep, Raceway sizing (Note 4 nipples, Table 4) — https://open-exam-prep.com/study-guides/icc-electrical-plans-examiner/wiring-methods/raceway-sizing-conduit-fill
14. Steel Tube Institute, NEC conduit and EMT fill tables — https://steeltubeinstitute.org/resources/nec-conduit-and-emt-fill-tables/
15. PES Supply, Conduit fill chart (EMT/PVC) — https://portlandiaelectric.supply/blogs/electrical-accessories/conduit-fill-chart
16. Mike Holt sample, Table 8 conductor resistance — https://www.mikeholt.com/instructor2/img/product/pdf/1220452413sample.pdf
17. ExpertCE, NEC 310.16 ampacity tables — https://expertce.com/learn-articles/nec-310-16-ampacity-tables-guide/
18. eCalPro, NEC 2026 conductor sizing — https://ecalpro.com/standards/nec/conductor-sizing-2026
19. Cerrowire Voltage Drop Table (PDF) — https://www.cerrowire.com/wp-content/uploads/2018/09/Cerrowire_Voltage-Drop_210521.pdf
20. Murdoch's, How to choose a generator — https://www.murdochs.com/the-dirt/power-equipment/how-to-choose-a-generator/
21. Cummins, What size portable generator do you need (2025) — https://www.cummins.com/en-eu/news/2025/06/24/what-size-portable-generator-do-you-need-heres-how-decide
22. EWEB, Generator sizing considerations — https://www.eweb.org/documents/emergency-preparedness/generator-sizing-considerations.pdf
23. Building Code Forum, LRA from Table 430.7(B) — https://www.thebuildingcodeforum.com/forum/threads/determine-the-maximum-locked-rotor-current-for-a-motor.35488/
24. EC&M, Understanding requirements for generators (445.13) — https://www.ecmweb.com/national-electrical-code/code-basics/article/20903521/understanding-requirements-for-generators
25. Southwire Voltage Drop Calculator — https://www.southwire.com/calculator-vdrop
26. NFPA v. UpCodes (2021 PI order), Wikisource — https://en.wikisource.org/wiki/National_Fire_Protection_Association_v._UpCodes_(2021)
27. Munger Tolles & Olson, NFPA v. UpCodes summary — https://www.mto.com/capability/copyright/
28. IFSJ, NFPA and UpCodes settle — https://internationalfireandsafetyjournal.com/nfpa-and-upcodes-settle-copyright-lawsuit-with-licensing-agreement/
29. D.C. Cir., ASTM v. Public.Resource.Org (Sep 12 2023) — https://law.resource.org/pub/us/cfr/regulations.gov.astm.appeal2/D.C.%20Cir.%2022-07063%20dckt%20_000%20filed%202023-09-12.2.pdf
30. U.S. Copyright Office summary, ASTM v. UpCodes, 172 F.4th 253 (3d Cir. 2026) — https://www.copyright.gov/fair-use/summaries/ASTM-v-UpCodes-Inc-172-F-4th-253-3d-Cir-2026.pdf
