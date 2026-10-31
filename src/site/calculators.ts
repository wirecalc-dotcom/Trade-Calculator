// Every calculator's fields, defaults and result, shared by the build (src/site/pages.ts renders the form and the default
// result into the HTML, so the first paint already shows an answer) and the page script (src/client/calcs.ts recomputes on
// every input). All math comes from src/lib/calc.ts. Pure: no DOM, no Node.

import {
  ampsFromWatts, conduitFill, cToF, fToC, genSize, maxSameSize, minSizeForDrop, R_DC_AL, R_DC_CU, RACEWAYS, SIZES, sizeLabel,
  sizesFor, THHN_ALL, THHN_SIZES, TRADE_SIZES, UNVERIFIED_EXTENSIONS, vdK, voltageDrop, watts, wireSize, zEff,
  type Conduit, type Material, type Phase, type Raceway, type TempCol,
} from "../lib/calc";

export type Values = Record<string, string>;
export interface Field {
  name: string; label: string; kind: "number" | "select" | "checkbox" | "text";
  def: string; options?: [string, string][]; unit?: string; step?: string; hint?: string; placeholder?: string;
  /** Fields with the same row sit on one line (a load, a conductor line). */
  row?: string;
  /** Shown only when this returns true. */
  when?: (v: Values) => boolean;
  /** Blank is allowed (Ohm's law, optional inputs). */
  optional?: boolean;
}
export type Tone = "pass" | "warn" | "fail" | "info";
export interface Out {
  ok: boolean; tone: Tone; headline: string; sub?: string; rows: [string, string][]; notes: string[];
  /** For calc_run: the inputs in short form and the headline result. */
  inputs: string; result: string;
}
export interface CalcDef { id: string; label: string; fields: Field[]; run: (v: Values) => Out }

// ---------- helpers ----------

export const esc = (s: unknown): string => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const fmt = (n: number, digits = 2): string =>
  n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const fmtMax = (n: number, digits = 3): string => n.toLocaleString("en-US", { maximumFractionDigits: digits });
const num = (v: string | undefined): number | null => {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
const fail = (message: string, inputs = ""): Out => ({ ok: false, tone: "info", headline: message, rows: [], notes: [], inputs, result: "" });
const MAT: Record<Material, string> = { cu: "copper", al: "aluminum" };
const SYS: Record<string, string> = { "1": "single-phase AC", "3": "three-phase AC", dc: "DC" };
const SYS_SHORT: Record<string, string> = { "1": "1ph", "3": "3ph", dc: "DC" };
const CONDUIT: Record<Conduit, string> = { pvc: "PVC conduit", al: "aluminum conduit", steel: "steel conduit" };
const phaseOf = (s: string): Phase => (s === "dc" ? "dc" : s === "3" ? 3 : 1);

const sizeOptions = (sizes: readonly string[] = SIZES): [string, string][] => sizes.map((s) => [s, sizeLabel(s)]);
const materialField: Field = { name: "material", label: "Conductor", kind: "select", def: "cu", options: [["cu", "Copper"], ["al", "Aluminum"]] };
const systemField = (def = "1"): Field => ({ name: "system", label: "System", kind: "select", def, options: [["1", "Single-phase AC"], ["3", "Three-phase AC"], ["dc", "DC"]] });

/** Within one size of the table: index in SIZES. */
const sizeIdx = (s: string) => (SIZES as readonly string[]).indexOf(s);

// ---------- voltage drop ----------

export const voltageDropCalc: CalcDef = {
  id: "voltage-drop",
  label: "Voltage drop",
  fields: [
    systemField(),
    { name: "volts", label: "Source voltage", kind: "number", def: "120", unit: "V", step: "any" },
    { name: "amps", label: "Load current", kind: "number", def: "20", unit: "A", step: "any" },
    { name: "feet", label: "One-way length", kind: "number", def: "100", unit: "ft", step: "any", hint: "Distance from source to load, not the round trip." },
    materialField,
    { name: "size", label: "Wire size", kind: "select", def: "12", options: sizeOptions() },
    { name: "conduit", label: "Raceway", kind: "select", def: "pvc", options: [["pvc", "PVC"], ["al", "Aluminum"], ["steel", "Steel"]], when: (v) => v.system !== "dc" },
    { name: "pf", label: "Power factor", kind: "number", def: "0.85", step: "0.01", hint: "1.0 for resistive loads; 0.8 to 0.9 for motors and mixed loads.", when: (v) => v.system !== "dc" },
    { name: "sets", label: "Parallel sets", kind: "number", def: "1", step: "1" },
    { name: "limit", label: "Target drop", kind: "number", def: "3", unit: "%", step: "any" },
  ],
  run(v) {
    const phase = phaseOf(v.system);
    const material = v.material as Material;
    const [volts, amps, feet, pf, sets, limit] = [num(v.volts), num(v.amps), num(v.feet), phase === "dc" ? 1 : num(v.pf), num(v.sets), num(v.limit)];
    if (!volts || volts <= 0) return fail("Enter the source voltage.");
    if (!amps || amps <= 0) return fail("Enter the load current in amps.");
    if (!feet || feet <= 0) return fail("Enter the one-way length in feet.");
    if (pf === null || pf <= 0 || pf > 1) return fail("Power factor must be between 0.01 and 1.");
    if (!sets || sets < 1 || !Number.isInteger(sets)) return fail("Parallel sets must be a whole number, 1 or more.");
    if (!limit || limit <= 0) return fail("Enter a target drop in percent.");
    if (material === "al" && v.size === "14") return fail("14 AWG aluminum isn't listed in the tables. Pick 12 AWG or larger.");
    const conduit = (v.conduit || "pvc") as Conduit;
    const vd = voltageDrop(material, v.size, amps, feet, phase, pf, conduit, sets);
    const pct = (vd / volts) * 100;
    const k = vdK(material, v.size, amps, feet, phase, sets);
    const min = minSizeForDrop(material, amps, feet, phase, volts, limit, pf, conduit, sets);
    const method = phase === "dc"
      ? "Chapter 9 Table 8 DC resistance at 75 °C"
      : `Chapter 9 Table 9, ${CONDUIT[conduit]}, PF ${fmtMax(pf, 2)}: Zeff ${fmt(zEff(material, v.size, pf, conduit), 4)} Ω per 1,000 ft`;
    const within = pct <= limit + 1e-9;
    return {
      ok: true, tone: within ? "pass" : "warn",
      headline: `${fmt(vd)} V drop (${fmt(pct)}%)`,
      sub: `${fmt(volts - vd, 1)} V at the load. ${within ? `Within your ${fmtMax(limit)}% target.` : `Over your ${fmtMax(limit)}% target.`}`,
      rows: [
        ["Method", method],
        [`Smallest size within ${fmtMax(limit)}%`, min ? `${sizeLabel(min)} ${MAT[material]}` : "None up to 1000 kcmil: add parallel sets"],
        ["Quick check (K-method)", `${fmt(k)} V (${fmt((k / volts) * 100)}%), K = ${material === "cu" ? "12.9" : "21.2"}`],
      ],
      notes: [
        "The 3% branch and 5% feeder-plus-branch figures are recommendations in Informational Notes, not requirements (90.5(C)). Sensitive electronic equipment (647.4(D)) and fire pumps (695.7) have enforceable limits.",
        ...(phase !== "dc" && Math.abs(k - vd) / vd > 0.1 ? ["The K-method ignores reactance and power factor, so it differs from the Table 9 answer here. Table 9 is the closer one."] : []),
      ],
      inputs: `${material} ${sizeLabel(v.size)}, ${fmtMax(amps)} A, ${fmtMax(feet)} ft, ${SYS_SHORT[v.system]}, ${fmtMax(volts)} V${phase === "dc" ? "" : `, ${conduit}, PF ${fmtMax(pf, 2)}`}${sets > 1 ? `, ${sets} sets` : ""}`,
      result: `${fmt(vd)} V (${fmt(pct)}%)`,
    };
  },
};

// ---------- conduit fill ----------

const FILL_ROWS = 4;
const thhnOptions = sizeOptions(THHN_SIZES);
export const conduitFillCalc: CalcDef = {
  id: "conduit-fill",
  label: "Conduit fill",
  fields: [
    { name: "raceway", label: "Raceway", kind: "select", def: "emt", options: (Object.keys(RACEWAYS) as Raceway[]).map((k) => [k, RACEWAYS[k].label]) },
    { name: "trade", label: "Trade size", kind: "select", def: "3/4", options: TRADE_SIZES.map((t) => [t, `${t.replace("-", " ")} in.`]) },
    ...Array.from({ length: FILL_ROWS }, (_, i): Field[] => [
      { name: `size${i + 1}`, label: `Wire ${i + 1} size`, kind: "select", def: ["12", "10", "8", "6"][i], options: thhnOptions, row: `line${i + 1}` },
      { name: `count${i + 1}`, label: `How many`, kind: "number", def: i === 0 ? "9" : "0", step: "1", row: `line${i + 1}` },
    ]).flat(),
    { name: "nipple", label: "Nipple, 24 in. or shorter (60% fill)", kind: "checkbox", def: "" },
  ],
  run(v) {
    const raceway = v.raceway as Raceway;
    const lines = Array.from({ length: FILL_ROWS }, (_, i) => ({ size: v[`size${i + 1}`], count: num(v[`count${i + 1}`]) ?? 0 }));
    if (lines.some((l) => l.count < 0 || !Number.isInteger(l.count))) return fail("Counts must be whole numbers.");
    const used = lines.filter((l) => l.count > 0);
    if (!used.length) return fail("Enter how many wires of at least one size.");
    const nipple = v.nipple === "on";
    const r = conduitFill(raceway, v.trade, used, nipple);
    const same = new Set(used.map((l) => l.size)).size === 1 ? used[0].size : null;
    const maxSame = same ? maxSameSize(RACEWAYS[raceway].area40[v.trade], THHN_ALL[same]) : null;
    const q = same ? RACEWAYS[raceway].area40[v.trade] / THHN_ALL[same] : 0;
    const unverified = Object.keys(UNVERIFIED_EXTENSIONS.EMT40).includes(v.trade) || used.some((l) => l.size in UNVERIFIED_EXTENSIONS.THHN)
      || (r.smallest !== null && Object.keys(UNVERIFIED_EXTENSIONS.EMT40).includes(r.smallest));
    const traded = (t: string) => `${t.replace("-", " ")} in.`;
    return {
      ok: true, tone: r.fits ? "pass" : "fail",
      headline: `${r.fits ? "Fits" : "Too full"}: ${fmt(r.pct, 1)}% fill`,
      sub: `${r.conductors} conductor${r.conductors === 1 ? "" : "s"} in ${traded(v.trade)} ${RACEWAYS[raceway].label}. Limit ${r.fillPct}%${nipple ? " (nipple)" : ""}.`,
      rows: [
        ["Wire area (THHN/THWN-2)", `${fmt(r.area, 4)} in²`],
        [`Allowed at ${r.fillPct}%`, `${fmt(r.allowed, 4)} in²`],
        ["Smallest trade size that fits", r.smallest ? traded(r.smallest) : "Larger than 4 in."],
        ...(maxSame !== null && !nipple ? [[`Most ${sizeLabel(same!)} in ${traded(v.trade)}`, `${maxSame}${q - Math.floor(q) >= 0.8 ? ` (${fmt(q, 2)} rounds up, Note 7)` : ""}`] as [string, string]] : []),
      ],
      notes: [
        "Count every conductor, including equipment grounding conductors. Areas are for THHN/THWN-2.",
        ...(unverified ? ["Trade sizes over 2 in. and wires over 4/0 use values not yet checked against the printed tables."] : []),
      ],
      inputs: `${RACEWAYS[raceway].label} ${v.trade} in., ${used.map((l) => `${l.count}x${l.size}`).join(" + ")} THHN${nipple ? ", nipple" : ""}`,
      result: `${r.fits ? "fits" : "too full"} ${fmt(r.pct, 1)}%`,
    };
  },
};

/** The most conductors of one size a raceway takes (Chapter 9 Table 1 by count, Note 7 for 3 or more). */
export function maxConductors(raceway: Raceway, trade: string, size: string): number {
  const area40 = RACEWAYS[raceway].area40[trade];
  const a = THHN_ALL[size];
  const n3 = maxSameSize(area40, a);
  if (n3 >= 3) return n3;
  const total = area40 / 0.4;
  if (2 * a <= total * 0.31) return 2;
  if (a <= total * 0.53) return 1;
  return 0;
}

// ---------- Ohm's law ----------

export const ohmsLawCalc: CalcDef = {
  id: "ohms-law",
  label: "Ohm's law",
  fields: [
    { name: "v", label: "Voltage", kind: "number", def: "120", unit: "V", step: "any", optional: true },
    { name: "i", label: "Current", kind: "number", def: "10", unit: "A", step: "any", optional: true },
    { name: "r", label: "Resistance", kind: "number", def: "", unit: "Ω", step: "any", optional: true },
    { name: "p", label: "Power", kind: "number", def: "", unit: "W", step: "any", optional: true },
  ],
  run(v) {
    const g = { v: num(v.v), i: num(v.i), r: num(v.r), p: num(v.p) };
    const given = (Object.keys(g) as (keyof typeof g)[]).filter((k) => g[k] !== null);
    if (given.length !== 2) return fail(given.length < 2 ? "Enter any two values; the other two are worked out." : "Enter exactly two values. Clear the others.");
    if (given.some((k) => g[k]! <= 0)) return fail("Values must be greater than zero.");
    let { v: V, i: I, r: R, p: P } = g;
    const key = given.join("");
    if (key === "vi") { R = V! / I!; P = V! * I!; }
    else if (key === "vr") { I = V! / R!; P = (V! * V!) / R!; }
    else if (key === "vp") { I = P! / V!; R = (V! * V!) / P!; }
    else if (key === "ir") { V = I! * R!; P = I! * I! * R!; }
    else if (key === "ip") { V = P! / I!; R = P! / (I! * I!); }
    else { V = Math.sqrt(P! * R!); I = Math.sqrt(P! / R!); }
    const show = (n: number) => fmtMax(n, n < 1 ? 4 : 3);
    const labels = { v: "V", i: "A", r: "Ω", p: "W" };
    return {
      ok: true, tone: "info",
      headline: `${show(V!)} V · ${show(I!)} A · ${show(R!)} Ω · ${show(P!)} W`,
      sub: `From ${given.map((k) => `${show(g[k]!)} ${labels[k]}`).join(" and ")}.`,
      rows: [["Voltage", `${show(V!)} V`], ["Current", `${show(I!)} A`], ["Resistance", `${show(R!)} Ω`], ["Power", `${show(P!)} W (${show(P! / 1000)} kW)`]],
      notes: ["For DC and resistive AC loads. Motors and other loads with a power factor below 1 draw more current than P ÷ V: use the amps to watts calculator."],
      inputs: given.map((k) => `${k.toUpperCase()}=${show(g[k]!)}`).join(", "),
      result: `${show(V!)} V, ${show(I!)} A, ${show(R!)} Ω, ${show(P!)} W`,
    };
  },
};

export const wireResistanceCalc: CalcDef = {
  id: "wire-resistance",
  label: "Wire resistance",
  fields: [
    materialField,
    { name: "size", label: "Wire size", kind: "select", def: "12", options: sizeOptions() },
    { name: "feet", label: "Length of one conductor", kind: "number", def: "200", unit: "ft", step: "any" },
    { name: "amps", label: "Current (optional)", kind: "number", def: "", unit: "A", step: "any", optional: true },
  ],
  run(v) {
    const material = v.material as Material;
    const feet = num(v.feet);
    const amps = num(v.amps);
    if (!feet || feet <= 0) return fail("Enter the conductor length in feet.");
    if (material === "al" && v.size === "14") return fail("14 AWG aluminum isn't listed in the tables. Pick 12 AWG or larger.");
    const per = (material === "cu" ? R_DC_CU : R_DC_AL)[v.size];
    const r = (per * feet) / 1000;
    return {
      ok: true, tone: "info",
      headline: `${fmtMax(r, 4)} Ω`,
      sub: `${fmtMax(feet)} ft of ${sizeLabel(v.size)} ${MAT[material]} (DC, 75 °C). Out and back: ${fmtMax(2 * r, 4)} Ω.`,
      rows: [
        ["Table 8 resistance", `${per} Ω per 1,000 ft`],
        ...(amps && amps > 0 ? [["Drop at that current, out and back", `${fmt(2 * r * amps)} V, ${fmt(amps * amps * 2 * r, 1)} W lost as heat`] as [string, string]] : []),
      ],
      notes: [],
      inputs: `${material} ${sizeLabel(v.size)}, ${fmtMax(feet)} ft${amps ? `, ${fmtMax(amps)} A` : ""}`,
      result: `${fmtMax(r, 4)} ohm`,
    };
  },
};

// ---------- wire size ----------

const INSULATION: [string, string][] = [["90", "90 °C: THHN, THWN-2, XHHW-2"], ["75", "75 °C: THW, THWN, XHHW"], ["60", "60 °C: TW, UF"], ["nmb", "NM-B cable (60 °C limit)"]];
export const wireSizeCalc: CalcDef = {
  id: "wire-size",
  label: "Wire size",
  fields: [
    { name: "amps", label: "Load current", kind: "number", def: "40", unit: "A", step: "any" },
    materialField,
    { name: "insulation", label: "Insulation", kind: "select", def: "90", options: INSULATION },
    { name: "term", label: "Terminal rating", kind: "select", def: "auto", options: [["auto", "Default (110.14(C))"], ["60", "60 °C"], ["75", "75 °C (equipment marked 75 °C)"]] },
    { name: "ambient", label: "Ambient temperature", kind: "number", def: "86", unit: "°F", step: "any" },
    { name: "ccc", label: "Current-carrying conductors in the raceway or cable", kind: "number", def: "3", step: "1" },
    { name: "continuous", label: "Continuous load (size for 125%)", kind: "checkbox", def: "" },
    { name: "feet", label: "One-way length for a voltage-drop check (optional)", kind: "number", def: "", unit: "ft", step: "any", optional: true },
    { name: "volts", label: "Source voltage", kind: "number", def: "240", unit: "V", step: "any", when: (v) => (num(v.feet) ?? 0) > 0 },
    { name: "system", label: "System", kind: "select", def: "1", options: [["1", "Single-phase AC"], ["3", "Three-phase AC"], ["dc", "DC"]], when: (v) => (num(v.feet) ?? 0) > 0 },
  ],
  run(v) {
    const material = v.material as Material;
    const amps = num(v.amps);
    const ambientF = num(v.ambient);
    const ccc = num(v.ccc);
    if (!amps || amps <= 0) return fail("Enter the load current in amps.");
    if (ambientF === null) return fail("Enter the ambient temperature in °F.");
    if (!ccc || ccc < 1 || !Number.isInteger(ccc)) return fail("Current-carrying conductors must be a whole number, 1 or more.");
    const nmb = v.insulation === "nmb";
    const insulationC = (nmb ? 90 : Number(v.insulation)) as TempCol;
    const auto = v.term === "auto";
    const terminationC = (auto ? (amps > 100 ? 75 : 60) : Number(v.term)) as TempCol;
    const ambientC = fToC(ambientF);
    const r = wireSize({ material, amps, insulationC, terminationC, ambientC, ccc, nmb, continuous: v.continuous === "on" });
    const inputs = `${material}, ${fmtMax(amps)} A, ${nmb ? "NM-B" : `${insulationC}C insulation`}, ${terminationC}C terminals, ${fmtMax(ambientF)}F, ${ccc} CCC${v.continuous === "on" ? ", continuous" : ""}`;
    if (r.ambientFactor === null) return fail(`${fmtMax(ambientF)} °F is above what ${nmb ? "NM-B" : `${insulationC} °C`} insulation allows. Pick a higher-rated insulation.`, inputs);
    if (!r.size) return fail("No single conductor up to 1000 kcmil carries this load. Use parallel sets.", inputs);
    const last = r.steps.at(-1)!;
    let final = r.size;
    let vdLine: [string, string] | null = null;
    const feet = num(v.feet);
    const volts = num(v.volts);
    if (feet && feet > 0 && volts && volts > 0) {
      const phase = phaseOf(v.system);
      const vdSize = minSizeForDrop(material, amps, feet, phase, volts, 3, 0.85, "pvc");
      if (vdSize && sizeIdx(vdSize) > sizeIdx(final)) final = vdSize;
      const drop = voltageDrop(material, final, amps, feet, phase, 0.85, "pvc");
      vdLine = ["Voltage drop at that size", vdSize
        ? `${fmt(drop)} V (${fmt((drop / volts) * 100)}%) over ${fmtMax(feet)} ft; ${sizeIdx(vdSize) > sizeIdx(r.size) ? `upsized from ${sizeLabel(r.size)} to stay within 3%` : "within 3%"} (Table 9, PVC, PF 0.85)`
        : "Over 3% even at 1000 kcmil: use parallel sets"];
    }
    const termCap = last.cap;
    const limited = last.derated > termCap;
    return {
      ok: true, tone: "pass",
      headline: `${sizeLabel(final)} ${MAT[material]}`,
      sub: `Allowable ${fmtMax(last.allowable, 1)} A at ${sizeLabel(r.size)} for a ${fmtMax(r.required, 1)} A ${v.continuous === "on" ? "requirement (125% of the load)" : "load"}.`,
      rows: [
        [`Table 310.16, ${nmb ? 90 : insulationC} °C column`, `${last.base} A`],
        ["Ambient correction", `× ${fmtMax(r.ambientFactor, 2)} at ${fmtMax(ambientF)} °F (${fmtMax(ambientC, 1)} °C)`],
        ["Adjustment for conductors", `× ${fmtMax(r.adjust, 2)} for ${ccc}`],
        ["After correction and adjustment", `${fmtMax(last.derated, 2)} A`],
        [`Terminal limit (${nmb ? "334.80, 60 °C" : `${terminationC} °C column`})`, `${termCap} A${limited ? " (this sets the ampacity)" : ""}`],
        ...(last.ocpdLimit !== null ? [["Small-conductor limit, 240.4(D)", `${last.ocpdLimit} A overcurrent device`] as [string, string]] : []),
        ...(vdLine ? [vdLine] : []),
      ],
      notes: [
        auto ? `Terminals default to ${terminationC} °C: ${amps > 100 ? "over 100 A, 110.14(C)(1)(b)" : "100 A or less, 110.14(C)(1)(a), unless the equipment is marked 75 °C"}.` : "",
        "Sizes skipped above failed on ampacity or on the 240.4(D) limit. Check the breaker size against the load and 240.4 separately.",
      ].filter(Boolean),
      inputs,
      result: `${sizeLabel(final)} ${material}`,
    };
  },
};

// ---------- generator size ----------

const LOAD_ROWS = 6;
const LOAD_DEFAULTS: [string, string, string][] = [["Furnace fan", "600", "600"], ["Lights", "100", "100"], ["Refrigerator", "700", "2200"], ["", "", ""], ["", "", ""], ["", "", ""]];
export const generatorCalc: CalcDef = {
  id: "generator-size",
  label: "Generator size",
  fields: [
    ...Array.from({ length: LOAD_ROWS }, (_, i): Field[] => [
      { name: `name${i + 1}`, label: `Load ${i + 1}`, kind: "text", def: LOAD_DEFAULTS[i][0], placeholder: "Name (optional)", row: `load${i + 1}`, optional: true },
      { name: `run${i + 1}`, label: "Running", kind: "number", def: LOAD_DEFAULTS[i][1], unit: "W", step: "any", row: `load${i + 1}`, optional: true },
      { name: `start${i + 1}`, label: "Starting", kind: "number", def: LOAD_DEFAULTS[i][2], unit: "W", step: "any", row: `load${i + 1}`, optional: true },
    ]).flat(),
    { name: "method", label: "Starting-watts rule", kind: "select", def: "conservative", options: [["conservative", "Conservative: all running + largest start"], ["largest", "Largest start replaces its own running watts"]] },
    { name: "buffer", label: "Headroom", kind: "select", def: "0", options: [["0", "None"], ["10", "10%"], ["20", "20%"], ["25", "25%"]] },
    { name: "service", label: "Generator output", kind: "select", def: "240:1", options: [["240:1", "240 V single-phase"], ["120:1", "120 V single-phase"], ["208:3", "208 V three-phase"], ["480:3", "480 V three-phase"]] },
  ],
  run(v) {
    const loads: [number, number][] = [];
    for (let i = 1; i <= LOAD_ROWS; i++) {
      const run = num(v[`run${i}`]);
      const start = num(v[`start${i}`]);
      if (run === null && start === null) continue;
      if ((run ?? 0) < 0 || (start ?? 0) < 0) return fail("Watts can't be negative.");
      if (!run) return fail(`Enter running watts for load ${i}.`);
      loads.push([run, Math.max(run, start ?? run)]);
    }
    if (!loads.length) return fail("Enter at least one load's running watts.");
    const [run, surgeA] = genSize(loads, "add_full_start");
    const [, surgeB] = genSize(loads);
    const conservative = v.method !== "largest";
    const surge = conservative ? surgeA : surgeB;
    const buf = 1 + Number(v.buffer || 0) / 100;
    const needRun = Math.ceil(run * buf);
    const needSurge = Math.ceil(surge * buf);
    const [volts, ph] = (v.service || "240:1").split(":").map(Number) as [number, 1 | 3];
    const amps = ampsFromWatts(needRun, volts, ph);
    return {
      ok: true, tone: "info",
      headline: `${needSurge.toLocaleString("en-US")} W starting, ${needRun.toLocaleString("en-US")} W running`,
      sub: `Pick a generator rated at least this much for ${loads.length} load${loads.length === 1 ? "" : "s"}${buf > 1 ? `, with ${v.buffer}% headroom` : ""}.`,
      rows: [
        ["Running total", `${run.toLocaleString("en-US")} W`],
        ["Starting needed, conservative rule", `${surgeA.toLocaleString("en-US")} W${conservative ? " (used)" : ""}`],
        ["Starting needed, largest-start rule", `${surgeB.toLocaleString("en-US")} W${conservative ? "" : " (used)"}`],
        [`Output current at ${volts} V`, `${fmt(amps, 1)} A at the running rating; output conductors at 115%: ${fmt(amps * 1.15, 1)} A (445.13)`],
      ],
      notes: [
        "No NEC table sizes a generator. Sellers use two rules for starting watts; the conservative one assumes the largest motor starts while everything else runs.",
        "Use nameplate watts where you can. Motor starting current comes from its code letter (Table 430.7(B)).",
      ],
      inputs: `${loads.map(([r, s]) => `${r}/${s}`).join(", ")} W, ${conservative ? "conservative" : "largest-start"}, +${v.buffer || 0}%`,
      result: `${needSurge} W start, ${needRun} W run`,
    };
  },
};

// ---------- amps <-> watts ----------

export const ampsWattsCalc: CalcDef = {
  id: "amps-to-watts",
  label: "Amps and watts",
  fields: [
    { name: "mode", label: "Convert", kind: "select", def: "a2w", options: [["a2w", "Amps to watts"], ["w2a", "Watts to amps"]] },
    systemField(),
    { name: "volts", label: "Voltage", kind: "number", def: "240", unit: "V", step: "any", hint: "Line-to-line voltage for three-phase." },
    { name: "amps", label: "Current", kind: "number", def: "30", unit: "A", step: "any", when: (v) => v.mode !== "w2a" },
    { name: "watts", label: "Power", kind: "number", def: "7200", unit: "W", step: "any", when: (v) => v.mode === "w2a" },
    { name: "pf", label: "Power factor", kind: "number", def: "1", step: "0.01", hint: "1.0 for heaters and lights; about 0.8 to 0.9 for motors.", when: (v) => v.system !== "dc" },
  ],
  run(v) {
    const phase = phaseOf(v.system);
    const volts = num(v.volts);
    const pf = phase === "dc" ? 1 : num(v.pf);
    if (!volts || volts <= 0) return fail("Enter the voltage.");
    if (pf === null || pf <= 0 || pf > 1) return fail("Power factor must be between 0.01 and 1.");
    const kva = (a: number) => (phase === 3 ? Math.sqrt(3) : 1) * volts * a / 1000;
    if (v.mode === "w2a") {
      const w = num(v.watts);
      if (!w || w <= 0) return fail("Enter the power in watts.");
      const a = ampsFromWatts(w, volts, phase, pf);
      return {
        ok: true, tone: "info", headline: `${fmt(a)} A`, sub: `${fmtMax(w)} W at ${fmtMax(volts)} V ${SYS[v.system]}${phase === "dc" ? "" : `, PF ${fmtMax(pf, 2)}`}.`,
        rows: [["Power", `${fmtMax(w)} W (${fmtMax(w / 1000, 3)} kW)`], ...(phase === "dc" ? [] : [["Apparent power", `${fmt(kva(a), 3)} kVA`] as [string, string]])],
        notes: [], inputs: `${fmtMax(w)} W, ${fmtMax(volts)} V, ${SYS_SHORT[v.system]}${phase === "dc" ? "" : `, PF ${fmtMax(pf, 2)}`}`, result: `${fmt(a)} A`,
      };
    }
    const a = num(v.amps);
    if (!a || a <= 0) return fail("Enter the current in amps.");
    const w = watts(volts, a, phase, pf);
    return {
      ok: true, tone: "info", headline: `${fmtMax(w, 1)} W`, sub: `${fmtMax(a)} A at ${fmtMax(volts)} V ${SYS[v.system]}${phase === "dc" ? "" : `, PF ${fmtMax(pf, 2)}`}.`,
      rows: [["Kilowatts", `${fmtMax(w / 1000, 3)} kW`], ...(phase === "dc" ? [] : [["Apparent power", `${fmt(kva(a), 3)} kVA`] as [string, string]])],
      notes: [], inputs: `${fmtMax(a)} A, ${fmtMax(volts)} V, ${SYS_SHORT[v.system]}${phase === "dc" ? "" : `, PF ${fmtMax(pf, 2)}`}`, result: `${fmtMax(w, 1)} W`,
    };
  },
};

export const CALCS: Record<string, CalcDef> = Object.fromEntries(
  [voltageDropCalc, conduitFillCalc, ohmsLawCalc, wireResistanceCalc, wireSizeCalc, generatorCalc, ampsWattsCalc].map((c) => [c.id, c]));

// ---------- HTML (shared by the build and the page script) ----------

export const defaults = (c: CalcDef): Values => Object.fromEntries(c.fields.map((f) => [f.name, f.def]));

export function resultHtml(o: Out): string {
  if (!o.ok) return `<div class="calc-out tone-info"><p class="calc-message">${esc(o.headline)}</p></div>`;
  const copy = [o.headline, o.sub ?? "", ...o.rows.map(([k, val]) => `${k}: ${val}`)].filter(Boolean).join("\n");
  return `<div class="calc-out tone-${o.tone}">
<p class="calc-headline">${esc(o.headline)}</p>${o.sub ? `\n<p class="calc-sub">${esc(o.sub)}</p>` : ""}
${o.rows.length ? `<dl class="calc-rows">${o.rows.map(([k, val]) => `<div><dt>${esc(k)}</dt><dd>${esc(val)}</dd></div>`).join("")}</dl>` : ""}
${o.notes.length ? `<ul class="calc-notes">${o.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
<button class="btn btn-secondary btn-small calc-copy" type="button" data-copy="${esc(copy)}">Copy result</button>
</div>`;
}

function fieldHtml(c: CalcDef, f: Field, v: Values): string {
  const id = `${c.id}-${f.name}`;
  const hidden = f.when && !f.when(v) ? " hidden" : "";
  const hint = f.hint ? `<span class="hint" id="${id}-hint">${esc(f.hint)}</span>` : "";
  const desc = f.hint ? ` aria-describedby="${id}-hint"` : "";
  if (f.kind === "checkbox") {
    return `<div class="field field-check" data-field="${f.name}"${hidden}><label><input type="checkbox" id="${id}" name="${f.name}"${v[f.name] === "on" ? " checked" : ""}> ${esc(f.label)}</label>${hint}</div>`;
  }
  const control = f.kind === "select"
    ? `<select id="${id}" name="${f.name}"${desc}>${f.options!.map(([val, label]) => `<option value="${esc(val)}"${val === v[f.name] ? " selected" : ""}>${esc(label)}</option>`).join("")}</select>`
    : `<input id="${id}" name="${f.name}" ${f.kind === "number" ? `type="text" inputmode="decimal" autocomplete="off"` : `type="text" autocomplete="off"`} value="${esc(v[f.name])}"${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ""}${desc}>`;
  return `<div class="field" data-field="${f.name}"${hidden}><label for="${id}">${esc(f.label)}${f.unit ? ` <span class="unit">(${esc(f.unit)})</span>` : ""}</label>${f.unit && f.kind !== "select" ? `<div class="with-unit">${control}<span class="unit-tag" aria-hidden="true">${esc(f.unit)}</span></div>` : control}${hint}</div>`;
}

/** The calculator: its fields and its result area, with the default inputs' result already in place. */
export function calcHtml(c: CalcDef): string {
  const v = defaults(c);
  const parts: string[] = [];
  const rows = new Map<string, Field[]>();
  for (const f of c.fields) {
    if (!f.row) { parts.push(fieldHtml(c, f, v)); continue; }
    if (!rows.has(f.row)) { rows.set(f.row, []); parts.push(`\u0000${f.row}`); }
    rows.get(f.row)!.push(f);
  }
  const body = parts.map((p) => p.startsWith("\u0000") ? `<div class="field-row">${rows.get(p.slice(1))!.map((f) => fieldHtml(c, f, v)).join("")}</div>` : p).join("\n");
  return `<section class="calc-card" aria-label="${esc(c.label)} calculator">
<form class="calc" data-calc="${c.id}" novalidate>
<div class="calc-fields">
${body}
</div>
</form>
<div class="calc-result" aria-live="polite" data-result="${c.id}">${resultHtml(c.run(v))}</div>
</section>`;
}

export const tempRow = (c: number): string => `${fmtMax(cToF(c), 0)} °F`;
