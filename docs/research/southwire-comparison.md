# Southwire cross-check — research item 2 follow-up (Oct 31 2026)

I ran 22 cases through Southwire's live web calculators in Chrome: 12 voltage drop, 10 conduit fill. IDEAL's calculator is app-only (Electrician's Sidekick), so it wasn't checked.

## Verdict (ranked)
1. **Ampacity and wire-limit logic: 12/12 match.** That includes the 240.4(D) cap: Southwire shows 20 A for 12 AWG Cu at 75 °C, the same as us.
2. **Voltage drop: within ±0.1 pp on 7/12 cases; up to 0.28 pp apart on the rest.** Southwire mixes values: DC resistance from Table 8 plus reactance from Table 9. It also applies a load-dependent temperature adjustment (at PF 1.0 its results run 1–6% above pure resistance math, rising with load ÷ ampacity). On big conductors at low PF it reads 10–20% *lower* than NEC Table 9 Note 2. **Keep our NEC Table 9 method**: it's the published code method and matches the engineering examples to ±0.02 V. Add one line on the page: "Manufacturer calculators may differ slightly; they adjust for conductor temperature under load."
   - It matters: on the 3/0 Cu, 150 A, 500 ft, 480 V 3φ example, Southwire says 2.27% (passes a 2.5% limit). NEC Table 9 and the PDHonline worked example say 2.55% (fails).
3. **Conduit fill: Southwire reads 1.0–1.6 pp lower than NEC.** It uses Southwire's own THHN diameters (12 STR = 0.128 in) instead of Ch. 9 Table 5 areas. One case flips: 13× #14 THHN in ½" EMT. Southwire 39.92% says OK; Table 5 gives 41.48%, max 12. **Default to Table 5** (what inspectors check). Optionally add "with your wire maker's actual diameters you may fit more."
4. Southwire's conduit fill shows a fill % only. It doesn't state a max count or apply Note 7, so our max-count + Note 7 output is a real feature gap.

## Voltage drop cases (% of system voltage)
| Case | Southwire | Ours (Table 9) | Diff |
|---|---|---|---|
| 12 Cu PVC 1φ 120 V 12 A 100 ft PF .85 | 3.41 | 3.46 | +0.05 |
| 12 Cu steel 3φ 480 V 14 A 200 ft PF .85 | 1.73 | 1.75 | +0.02 |
| 10 Cu steel 3φ 480 V 18 A 200 ft PF 1 | 1.65 | 1.56 | −0.09 |
| 500 Cu steel 3φ 480 V 302 A 200 ft PF .9 | 0.96 | 1.02 | +0.06 |
| 10 Cu steel 1φ 120 V 10 A 100 ft PF .9 | 1.91 | 1.85 | −0.06 |
| 3/0 Cu steel 3φ 480 V 150 A 500 ft PF .8 | 2.27 | 2.55 | +0.28 |
| 4/0 Cu steel 3φ 480 V 150 A 500 ft PF .8 | 1.92 | 2.19 | +0.27 |
| 600 Al PVC 3φ 480 V 270 A 250 ft PF .7 | 1.02 | 1.29 | +0.27 |
| 12 Cu PVC 1φ 120 V 20 A 50 ft PF 1 | 3.34 | 3.33 | −0.01 |
| 6 Cu PVC 1φ 240 V 50 A 150 ft PF 1 | 3.21 | 3.06 | −0.15 |
| 2 Al PVC 1φ 240 V 90 A 200 ft PF 1 | 5.08 | 4.80 | −0.28 |
| 1/0 Cu steel 3φ 208 V 120 A 150 ft PF .85 | 1.91 | 1.96 | +0.05 |

Southwire's displayed R/X per case: Table 8 DC R (e.g. 1.98 for 12 AWG) + Table 9 X_L by conduit. Its ampacity column matched ours in all 12.

## Conduit fill cases (THHN Cu, % fill)
| Case | NEC Table 5 | Southwire | Diff |
|---|---|---|---|
| ¾" EMT 16× #12 | 39.92 | 38.61 | +1.31 |
| ¾" EMT 17× #12 | 42.42 | 41.02 | +1.40 |
| ½" EMT 9× #12 | 39.38 | 38.11 | +1.27 |
| ½" EMT 12× #14 | 38.29 | 36.85 | +1.44 |
| ½" EMT 13× #14 | **41.48 (fails)** | **39.92 (passes)** | +1.56 |
| ¾" PVC40 20× #14 | 38.19 | 36.76 | +1.43 |
| ¾" PVC40 21× #14 | 40.10 (allowed via Note 7) | 38.60 | +1.50 |
| 1" PVC40 25× #12 | 39.96 | 38.68 | +1.28 |
| ¾" EMT 10× #10 | 39.59 | 38.18 | +1.41 |
| 1" EMT 9× #8 | 38.12 | 37.11 | +1.02 |

## For the build
- Add these 22 cases to the JS test file as a **"manufacturer cross-check"** group: report the differences, never fail on them.
- Page copy: one line on each calculator explaining why results can differ from wire-maker tools.
- Sources: https://www.southwire.com/calculator-vdrop , https://www.southwire.com/calculator-conduit (run Oct 31 2026, Commercial 75 °C mode).
