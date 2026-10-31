---
title: Wire Size Calculator with Derating (Table 310.16) | {{brand}}
description: Wire size from Table 310.16 with ambient temperature and bundling derates, the terminal temperature limit (110.14(C)) and the small-conductor rule (240.4(D)), plus an optional voltage drop check.
---

# Wire size calculator

Enter the load and the conditions. It picks the smallest copper or aluminum wire that carries it, after derating and the terminal limit. {.lead}

{{calculator}}

{{formula}}

## Code reference

summary: Where each value and rule comes from, by table and section number. {.open}

- **Table 310.16:** ampacity of building wire at 30 °C ambient with up to three current-carrying conductors, in the 60, 75 and 90 °C columns.
- **Table 310.15(B)(1)(1):** ambient temperature correction.
- **Table 310.15(C)(1):** adjustment for more than three current-carrying conductors in a raceway or cable.
- **110.14(C):** terminal temperature. Circuits of 100 A or less (or 14 through 1 AWG) use the 60 °C column unless the equipment is marked for 75 °C; above 100 A, 75 °C.
- **240.4(D):** 14, 12 and 10 AWG copper are limited to 15, 20 and 30 A overcurrent protection; 12 and 10 AWG aluminum to 15 and 25 A.
- **334.80:** NM-B cable's ampacity is the 60 °C column; the 90 °C rating may be used for derating.
- **210.19(A) and 215.2(A):** conductors for continuous loads are sized at 125% of the continuous load.

{{example}}

{{chart}}

## Code editions

summary: {{editions}} {.open}

The ampacities and factors didn't change, but the numbering did: in NEC 2017 the ampacity table is Table 310.15(B)(16), and the correction and adjustment tables are 310.15(B)(2)(a) and 310.15(B)(3)(a). NEC 2026 adds a row for 16 AWG copper, which this calculator doesn't cover.

{{ahj}} {.notice}
