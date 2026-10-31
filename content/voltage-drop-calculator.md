---
title: Voltage Drop Calculator (NEC Table 9 Method) | {{brand}}
description: Voltage drop in volts and percent from Chapter 9 Table 9 resistance and reactance, with power factor, raceway type, parallel sets and the smallest wire size within your target.
---

# Voltage drop calculator

Enter the circuit and the drop updates as you type. It uses Chapter 9 Table 9 with your power factor and raceway, and shows the K-method as a quick check. {.lead}

{{calculator}}

{{formula}}

## Code reference

summary: Where each value comes from, by table and section number. {.open}

- **Chapter 9, Table 9:** AC resistance and reactance per 1,000 ft for each wire size in PVC, aluminum and steel raceway, at 75 °C. The default method.
- **Chapter 9, Table 9, Note 2:** the effective impedance at a power factor, R × PF + XL × sin(arccos PF), where XL is the reactance.
- **Chapter 9, Table 8:** conductor area in circular mils and DC resistance at 75 °C. Used for DC circuits and for the K-method check.
- **210.19 and 215.2, Informational Notes:** 3% for a branch circuit and 5% for feeder plus branch are recommendations, not rules (90.5(C)).
- **647.4(D) and 695.7:** sensitive electronic equipment and fire pumps, where voltage drop limits are enforceable.

Wire makers' calculators can show slightly different numbers: they adjust the wire's resistance for its temperature under load, while this calculator uses the Table 9 values at 75 °C, the method the code publishes.

{{example}}

## Code editions

summary: {{editions}} {.open}

The Table 8 and Table 9 values this calculator uses for 14 AWG through 1000 kcmil didn't change between those editions. NEC 2026 adds rows for 16 AWG copper and 14 AWG copper-clad aluminum, which this calculator doesn't cover.

{{ahj}} {.notice}
