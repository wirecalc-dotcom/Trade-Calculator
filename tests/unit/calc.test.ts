// The 50 sourced cases and the 64-cell Cerrowire check from docs/research/calc_reference.py, ported one for one (same order,
// same tolerances, same sources). Python on 30 Oct: 49/50 pass, 59/64 Cerrowire cells match. These must match that exactly.

import { describe, expect, it } from "vitest";
import {
  AMBIENT_310_15B1, AMP_AL, AMP_CU, ampacity, ampsFromWatts, cerroMin, conduitFill, EMT40, genSize, lockedRotorAmps, maxSameSize,
  minSizeForDrop, minSizeForLoad, PVC40_40, R_DC_CU, RMC40, THHN, TRADE_ORDER, vdK, vdTable9, watts, wireSize, type Material, type TempCol,
} from "../../src/lib/calc";

type Case = { name: string; got: () => unknown; exp: unknown; tol: number; src: string; expectedFail?: string };
const close = (a: unknown, b: unknown, tol: number) =>
  typeof b === "number" ? Math.abs((a as number) - b) <= tol : JSON.stringify(a) === JSON.stringify(b);

const mix = 3 * THHN["2"] + THHN["4"] + THHN["8"];
const firstEmtFor = (area: number) => TRADE_ORDER.find((k) => k in EMT40 && EMT40[k] >= area); // Python dict order = TRADE_ORDER
const loads: [number, number][] = [[600, 600], [100, 100], [700, 2200]]; // furnace (listed run only), lamp, fridge

export const CASES: Case[] = [
  // Voltage drop
  { name: "VD K: 12Cu 12A 100ft 1ph", got: () => vdK("cu", "12", 12, 100, 1), exp: 4.74, tol: .01, src: "PDHonline E426 Ex.2" },
  {
    name: "VD Zeff .85: 12Cu PVC 12A 100ft 1ph", got: () => vdTable9("cu", "12", 12, 100, 1, .85, "pvc"), exp: 4.08, tol: .02, src: "PDHonline E426 Ex.1 (table Zeff 1.7)",
    // Known failure, kept on purpose (research §0.2): the source used Table 9's pre-rounded "Effective Z at 0.85 PF" (1.7 ohm/kft).
    // From the raw R and XL the real value is 1.729 ohm/kft, so 4.15 V, not 4.08 V. We compute from raw values; the source is off.
    expectedFail: "source used the rounded Zeff 1.7; raw R and XL give 1.729 (4.15 V)",
  },
  { name: "VD K: 4Cu 65A 200ft 3ph", got: () => vdK("cu", "4", 65, 200, 3), exp: 6.96, tol: .01, src: "PDHonline E426 Ex.4" },
  { name: "VD Zeff: 12Cu steel 14A 200ft 3ph pf.85", got: () => vdTable9("cu", "12", 14, 200, 3, .85, "steel"), exp: 8.418, tol: .01, src: "PDHonline E426 Fig.23" },
  { name: "VD R only: 10Cu steel 18A 200ft 3ph pf1", got: () => vdTable9("cu", "10", 18, 200, 3, 1.0, "steel"), exp: 7.482, tol: .01, src: "PDHonline E426 Fig.24" },
  { name: "VD Zeff: 500Cu steel 302A 200ft 3ph pf.9", got: () => vdTable9("cu", "500", 302, 200, 3, .9, "steel"), exp: 4.92, tol: .02, src: "PDHonline E426 Fig.25" },
  { name: "VD Zeff: 10Cu steel 10A 100ft 1ph pf.9", got: () => vdTable9("cu", "10", 10, 100, 1, .9, "steel"), exp: 2.215, tol: .01, src: "PDHonline E426 Ex.7" },
  { name: "VD Zeff: 3/0Cu steel 150A 500ft 3ph pf.8", got: () => vdTable9("cu", "3/0", 150, 500, 3, .8, "steel"), exp: 12.26, tol: .02, src: "PDHonline E426 EGC example" },
  { name: "VD Zeff: 4/0Cu steel 150A 500ft 3ph pf.8", got: () => vdTable9("cu", "4/0", 150, 500, 3, .8, "steel"), exp: 10.52, tol: .02, src: "PDHonline E426 EGC example" },
  { name: "VD Zeff: 600Al PVC 270A 250ft 3ph pf.7", got: () => vdTable9("al", "600", 270, 250, 3, .7, "pvc"), exp: 6.208, tol: .02, src: "electrical-knowhow Ex.5" },
  { name: "VD Zeff: 1Cu Al-conduit 100A 150ft 3ph pf.85", got: () => vdTable9("cu", "1", 100, 150, 3, .85, "al"), exp: 4.157, tol: .03, src: "electrical-knowhow Ex.4 (NEC Handbook ex.)" },
  { name: "Table 8 Note 2: 500Cu at 90C (ohm/kft)", got: () => R_DC_CU["500"] * (1 + .00323 * 15), exp: 0.02705, tol: .00002, src: "electrical-knowhow Ex.1" },
  { name: "Table 8 Note 2: 8Cu at 90C (ohm/kft)", got: () => R_DC_CU["8"] * (1 + .00323 * 15), exp: 0.8157, tol: .0002, src: "EC&M 'How to use Chapter 9'" },
  { name: "Circular mils needed: 115V 52A 110ft 3%", got: () => 2 * 12.9 * 52 * 110 / (115 * .03), exp: 42775, tol: 5, src: "Mike Holt forum exam answer key inputs" },

  // Conduit fill
  { name: "12 THHN in 3/4 EMT", got: () => maxSameSize(EMT40["3/4"], THHN["12"]), exp: 16, tol: 0, src: "Annex C C.1 via open-exam-prep / PES" },
  { name: "12 THHN in 1/2 EMT", got: () => maxSameSize(EMT40["1/2"], THHN["12"]), exp: 9, tol: 0, src: "PES EMT chart" },
  { name: "14 THHN in 1/2 EMT", got: () => maxSameSize(EMT40["1/2"], THHN["14"]), exp: 12, tol: 0, src: "PES EMT chart" },
  { name: "10 THHN in 1/2 EMT", got: () => maxSameSize(EMT40["1/2"], THHN["10"]), exp: 5, tol: 0, src: "PES EMT chart" },
  { name: "12 THHN in 1 PVC40", got: () => maxSameSize(PVC40_40["1"], THHN["12"]), exp: 25, tol: 0, src: "PES PVC chart" },
  { name: "14 THHN in 3/4 PVC40 (Note 7 round-up)", got: () => maxSameSize(PVC40_40["3/4"], THHN["14"]), exp: 21, tol: 0, src: "Note 7 math; PES shows 20" },
  { name: "#12 that fit in 1-1/4 RMC after 12x#10", got: () => Math.floor((RMC40["1-1/4"] - 12 * .0211) / THHN["12"]), exp: 26, tol: 0, src: "ICC/Holt sample 8950P229" },
  { name: "Mixed 3x2+4+8 THHN area", got: () => mix, exp: .4664, tol: .0001, src: "open-exam-prep worked ex.1" },
  { name: "Mixed 3x2+4+8 -> smallest EMT", got: () => firstEmtFor(mix), exp: "1-1/4", tol: 0, src: "Table 4 40% col" },
  { name: "3x4 + 1x8 THHN -> smallest EMT", got: () => firstEmtFor(3 * THHN["4"] + THHN["8"]), exp: "1", tol: 0, src: "open-exam-prep (MN)" },

  // Ohm's law
  { name: "V=IR 2A x 60ohm", got: () => 2 * 60, exp: 120, tol: 0, src: "definition" },
  { name: "I=V/R 120V/12ohm", got: () => 120 / 12, exp: 10, tol: 0, src: "definition" },
  { name: "P=V^2/R 240V/9.6ohm (2500W heater)", got: () => 240 ** 2 / 23.04, exp: 2500, tol: .01, src: "definition" },
  { name: "R of 200ft 12Cu (Table 8)", got: () => R_DC_CU["12"] * 200 / 1000, exp: .396, tol: .0005, src: "Mike Holt sample 8.2" },
  { name: "I^2R loss 20A thru .396ohm", got: () => 20 ** 2 * .396, exp: 158.4, tol: .01, src: "definition" },

  // Wire size / ampacity
  { name: "30A Cu 75C term", got: () => minSizeForLoad("cu", 30, 75), exp: "10", tol: 0, src: "Table 310.16 + 240.4(D)" },
  { name: "20A Cu 75C (240.4D blocks 14)", got: () => minSizeForLoad("cu", 20, 75), exp: "12", tol: 0, src: "240.4(D)" },
  { name: "50A Cu 60C (<=100A default)", got: () => minSizeForLoad("cu", 50, 60), exp: "6", tol: 0, src: "110.14(C)(1)(a)" },
  { name: "100A Al 75C", got: () => minSizeForLoad("al", 100, 75), exp: "1", tol: 0, src: "Table 310.16" },
  { name: "200A Cu 75C", got: () => minSizeForLoad("cu", 200, 75), exp: "3/0", tol: 0, src: "Cerrowire VD table ***" },
  { name: "6 THHN 90C x .91 ambient, capped at 75C", got: () => Math.min(ampacity("cu", "6", 90, .91), ampacity("cu", "6", 75)), exp: 65, tol: 0, src: "ecalpro worked example" },
  { name: "9 x 12 THHN bundled (90C col x .70)", got: () => ampacity("cu", "12", 90, 1.0, 9), exp: 21, tol: .01, src: "PES / Table 310.15(C)(1)" },
  { name: "6 AWG Cu 90C column", got: () => AMP_CU["6"][2], exp: 75, tol: 0, src: "WireRef" },
  { name: "4/0 Cu 60/75/90", got: () => AMP_CU["4/0"], exp: [195, 230, 260], tol: 0, src: "Encore (via search snippet)" },
  { name: "500 Cu 60/75/90", got: () => AMP_CU["500"], exp: [320, 380, 430], tol: 0, src: "aboutdarwin table" },
  { name: "350 Al 60/75/90", got: () => AMP_AL["350"], exp: [210, 250, 280], tol: 0, src: "aboutdarwin table" },

  // Amps <-> watts
  { name: "1ph 240V 30A pf1", got: () => watts(240, 30, 1), exp: 7200, tol: 0, src: "definition" },
  { name: "3ph 480V 14A pf.85", got: () => watts(480, 14, 3, .85), exp: 9893.5, tol: 1, src: "definition" },
  { name: "3ph 480V 15kW -> A (pf1)", got: () => ampsFromWatts(15000, 480, 3), exp: 18.04, tol: .01, src: "PDHonline E426 (18 A)" },
  { name: "DC 12V 100W -> A", got: () => ampsFromWatts(100, 12), exp: 8.333, tol: .001, src: "definition" },
  { name: "1ph 120V 1500W -> A", got: () => ampsFromWatts(1500, 120, 1), exp: 12.5, tol: 0, src: "definition" },

  // Generator
  { name: "Murdoch's example, add-full-start", got: () => genSize(loads, "add_full_start")[1], exp: 3600, tol: 0, src: "Murdoch's Ranch & Home" },
  { name: "same loads, Cummins convention", got: () => genSize(loads)[1], exp: 2900, tol: 0, src: "Cummins method applied" },
  { name: "Locked-rotor A: 20hp code G 460V 3ph", got: () => lockedRotorAmps(20, 6.29, 460, 3), exp: 157.9, tol: .3, src: "Table 430.7(B) worked ex." },
  { name: "Locked-rotor A: 2hp code G 240V 1ph", got: () => lockedRotorAmps(2, 6.29, 240, 1), exp: 52.42, tol: .01, src: "Mike Holt forum" },
  { name: "445.13: 20kW 240V 1ph nameplate x115%", got: () => 20000 / 240 * 1.15, exp: 95.83, tol: .01, src: "445.13 (115%)" },
];

describe("calc_reference.py cases", () => {
  it("has all 50 cases, one marked expected-fail", () => {
    expect(CASES).toHaveLength(50);
    expect(CASES.filter((c) => c.expectedFail)).toHaveLength(1);
  });
  for (const c of CASES) {
    if (c.expectedFail) {
      // Expected to fail: if this ever passes, the data or method changed and the research note needs updating.
      it.fails(`${c.name} [${c.src}] (expected fail: ${c.expectedFail})`, () => { expect(close(c.got(), c.exp, c.tol)).toBe(true); });
    } else {
      it(`${c.name} [${c.src}]`, () => { expect(close(c.got(), c.exp, c.tol), `got ${JSON.stringify(c.got())}, want ${JSON.stringify(c.exp)} ±${c.tol}`).toBe(true); });
    }
  }
  it("the expected-fail case gives 4.15 V from raw values", () => {
    expect(vdTable9("cu", "12", 12, 100, 1, .85, "pvc")).toBeCloseTo(4.1483, 3);
  });
});

// Cerrowire 120V/240V 3% table (steel conduit, pf .9) vs our min-size logic.
type Row = [Material, number, number, TempCol, (string | null)[]];
const ROWS: Row[] = [["cu", 15, 120, 60, ["14", "12", "10", "8", "6"]], ["cu", 20, 120, 60, ["12", "12", "8", "6", "4"]],
  ["cu", 30, 120, 60, ["10", "10", "6", "4", "4"]], ["cu", 100, 120, 60, ["1", "1", "1", "2/0", "4/0"]],
  ["al", 100, 120, 60, ["1/0", "1/0", "2/0", "4/0", "300"]], ["cu", 200, 120, 75, ["3/0", "3/0", "3/0", "300", "500"]],
  ["al", 200, 120, 75, ["250", "250", "300", "600", null]],
  ["cu", 15, 240, 60, ["14", "14", "12", "10", "10"]], ["cu", 20, 240, 60, ["12", "12", "10", "10", "8"]],
  ["cu", 30, 240, 60, ["10", "10", "10", "8", "6"]], ["al", 30, 240, 60, ["8", "8", "8", "6", "4"]],
  ["cu", 40, 240, 75, ["8", "8", "8", "6", "4"]], ["cu", 50, 240, 60, ["6", "6", "6", "6", "4"]]];
export const CERRO = ROWS.flatMap(([mat, a, v, tc, exp]) => [25, 50, 100, 150, 200].flatMap((ft, i) =>
  exp[i] === null ? [] : [{ name: `${mat} ${a}A ${v}V ${ft}ft`, got: cerroMin(mat, a, ft, v, tc), exp: exp[i] }]));
// The 5 known differences (research §7): two where Cerrowire rounds 3.05% down to 3%, three 200 A Cu cells that only work
// if steel-conduit reactance is ignored. We keep ours (more conservative).
const KNOWN_DIFF = ["cu 20A 120V 50ft", "cu 30A 120V 200ft", "cu 200A 120V 100ft", "cu 200A 120V 150ft", "cu 200A 120V 200ft"];

describe("Cerrowire voltage-drop table", () => {
  it("reproduces 59 of 64 cells, and the 5 differences are the documented ones", () => {
    const match = CERRO.filter((c) => c.got === c.exp);
    const diff = CERRO.filter((c) => c.got !== c.exp).map((c) => c.name);
    console.log(`cerrowire matches: ${match.length} / ${CERRO.length}; differences: ${diff.join(", ")}`);
    expect(CERRO).toHaveLength(64);
    expect(match).toHaveLength(59);
    expect(diff.sort()).toEqual([...KNOWN_DIFF].sort());
  });
});

describe("extras used by the pages", () => {
  it("every ambient factor equals 310.15(B)(1)'s equation at the row's end, to two places", () => {
    for (const [max, ...f] of AMBIENT_310_15B1) {
      [60, 75, 90].forEach((tc, i) => {
        const v = (tc - max) / (tc - 30);
        const want = v <= 0 ? null : Math.round(Math.sqrt(v) * 100) / 100;
        expect(f[i], `${tc} C column at ${max} C`).toBe(want);
      });
    }
  });
  it("wireSize with no derating equals minSizeForLoad", () => {
    for (const m of ["cu", "al"] as Material[]) for (const t of [60, 75] as TempCol[]) for (let a = 5; a <= 400; a += 5) {
      expect(wireSize({ material: m, amps: a, insulationC: t, terminationC: t }).size ?? undefined, `${m} ${a}A ${t}C`).toBe(minSizeForLoad(m, a, t));
    }
  });
  it("wireSize: 6 THHN at 40 C is limited by the 75 C termination (65 A)", () => {
    const r = wireSize({ material: "cu", amps: 65, insulationC: 90, terminationC: 75, ambientC: 40 });
    expect(r.size).toBe("6");
    expect(r.steps.at(-1)!.allowable).toBe(65);
  });
  it("wireSize: 240.4(D) keeps 14 AWG off a 20 A load even when derated ampacity allows it", () => {
    expect(wireSize({ material: "cu", amps: 20, insulationC: 90, terminationC: 75 }).size).toBe("12");
  });
  it("wireSize: NM-B is capped at the 60 C column", () => {
    expect(wireSize({ material: "cu", amps: 25, insulationC: 90, terminationC: 75, nmb: true }).size).toBe("10");
  });
  it("minSizeForDrop picks the first size at or under the limit", () => {
    expect(minSizeForDrop("cu", 20, 50, 1, 120, 3, .9, "steel")).toBe("10"); // 12 AWG gives 3.05%, over 3%
  });
  it("conduitFill: same-size fill follows Note 7, mixed fill follows the area", () => {
    expect(conduitFill("pvc40", "3/4", [{ size: "14", count: 21 }]).fits).toBe(true);
    expect(conduitFill("pvc40", "3/4", [{ size: "14", count: 22 }]).fits).toBe(false);
    expect(conduitFill("emt", "1", [{ size: "2", count: 3 }, { size: "4", count: 1 }, { size: "8", count: 1 }]).smallest).toBe("1-1/4");
    expect(conduitFill("emt", "1/2", [{ size: "12", count: 1 }]).fillPct).toBe(53);
    expect(conduitFill("emt", "1/2", [{ size: "12", count: 2 }]).fillPct).toBe(31);
  });
});
