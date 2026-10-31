// Every page on the site: path, its copy file in content/, sitemap flag, and the blocks that stay in code (calculators,
// formulas, worked examples, charts). Same structure as dnsmailcheck's src/site/pages.ts. Titles, descriptions and page
// text live in content/*.md (format: content/README.md). Worked examples and charts are computed from src/lib/calc.ts at
// build time, so they can't drift from the calculators. Charts are our own layout and cite tables by number (CLAUDE.md rule 5).

import { config } from "../config";
import {
  ADJ_310_15C1, AMBIENT_310_15B1, ambientRowFrom, AMP_AL, AMP_CU, CMIL, OCPD_LIMIT_240_4D, R_DC_AL, R_DC_CU, RACEWAYS, SIZES, sizeLabel,
  THHN, THHN_ALL, THHN_SIZES, TRADE_SIZES, T9, vdK, vdTable9, wireSize, zEff, ampsFromWatts, genSize, maxSameSize, EMT40, PVC40_40,
  type Raceway,
} from "../lib/calc";
import {
  ampsWattsCalc, calcHtml, conduitFillCalc, esc, fmt, generatorCalc, maxConductors, ohmsLawCalc, voltageDropCalc, wireResistanceCalc, wireSizeCalc, tempRow,
} from "./calculators";
import { defaultFlags, readContent, renderBody, type Flags } from "./content";
import { PAGE_LABELS } from "./layout";

export interface PageDef {
  path: string;
  title: string;
  description: string;
  body: string;
  sitemap: boolean;
  noindex?: boolean;
}

// ---------- formulas (MathML) ----------

const mi = (x: string) => `<mi>${x}</mi>`;
const mn = (x: string) => `<mn>${x}</mn>`;
const mo = (x: string) => `<mo>${x}</mo>`;
const sub = (b: string, s: string) => `<msub>${b}${s}</msub>`;
const frac = (a: string, b: string) => `<mfrac><mrow>${a}</mrow><mrow>${b}</mrow></mfrac>`;
const row = (...xs: string[]) => `<mrow>${xs.join("")}</mrow>`;
const sqrt = (x: string) => `<msqrt>${x}</msqrt>`;
const math = (label: string, body: string) => `<math display="block" aria-label="${esc(label)}">${body}</math>`;
const T = (x: string) => `<mtext>${x}</mtext>`;

/** A formula section: data-formula for formula_view, the equations, then what each symbol means. */
const formulaSection = (id: string, heading: string, equations: string[], where: [string, string][], note = "") =>
  `<section class="stack section-card formula" data-formula="${id}">
<h2>${esc(heading)}</h2>
<div class="math-block">${equations.join("\n")}</div>
<dl class="symbols">${where.map(([s, d]) => `<div><dt>${s}</dt><dd>${esc(d)}</dd></div>`).join("")}</dl>${note ? `\n<p class="small muted">${esc(note)}</p>` : ""}
</section>`;

const FORMULAS: Record<string, string> = {
  "voltage-drop": formulaSection("voltage-drop", "The formula", [
    math("Z effective equals R times cos theta plus X L times sin theta, theta equals arccos of PF",
      row(sub(mi("Z"), T("eff")), mo("="), mi("R"), mo("&#x2062;"), mi("cos"), mi("θ"), mo("+"), sub(mi("X"), mi("L")), mo("&#x2062;"), mi("sin"), mi("θ"), mo(",&#x2003;"), mi("θ"), mo("="), mi("arccos"), mo("("), T("PF"), mo(")"))),
    math("VD equals k times I times Z effective times L over 1000",
      row(T("VD"), mo("="), frac(row(mi("k"), mo("&#x2062;"), mi("I"), mo("&#x2062;"), sub(mi("Z"), T("eff")), mo("&#x2062;"), mi("L")), mn("1000")), mo(",&#x2003;"), mi("k"), mo("="), mn("2"), T(" (single-phase, DC)"), T(" or "), sqrt(mn("3")), T(" (three-phase)"))),
    math("Quick check: VD equals k times K times I times L over CM",
      row(T("Quick check:&#x2002;"), T("VD"), mo("="), frac(row(mi("k"), mo("&#x2062;"), mi("K"), mo("&#x2062;"), mi("I"), mo("&#x2062;"), mi("L")), T("CM")), mo(",&#x2003;"), mi("K"), mo("="), mn("12.9"), T(" Cu, "), mn("21.2"), T(" Al"))),
    math("Percent drop equals VD over source voltage times 100", row(T("% drop"), mo("="), frac(T("VD"), sub(mi("V"), T("source"))), mo("×"), mn("100"))),
  ], [
    ["R, X<sub>L</sub>", "AC resistance and reactance per 1,000 ft for the wire and raceway, from Chapter 9 Table 9 (DC uses Table 8 resistance)"],
    ["PF", "power factor of the load"], ["I", "load current in amps (divided by parallel sets)"], ["L", "one-way length in feet"],
    ["K", "ohm-circular mils per foot at 75 °C"], ["CM", "conductor area in circular mils, Chapter 9 Table 8"],
  ], "Z_eff is computed from the raw R and X_L values. Table 9's printed column for 0.85 PF is rounded and can be off by about 2%."),
  "conduit-fill": formulaSection("conduit-fill", "The formula", [
    math("Fill percent equals the sum of n times wire area over raceway area times 100",
      row(T("Fill %"), mo("="), frac(row(mo("∑"), sub(mi("n"), mi("i")), mo("&#x2062;"), sub(mi("A"), mi("i"))), sub(mi("A"), T("raceway"))), mo("×"), mn("100"), mo("≤"), mn("53"), T(", "), mn("31"), T(" or "), mn("40"))),
    math("N equals floor of A forty over A wire, plus one if the remainder is 0.8 or more",
      row(mi("N"), mo("="), mo("⌊"), frac(sub(mi("A"), mn("40%")), sub(mi("A"), T("wire"))), mo("⌋"), mo("+"), mn("1"), T(" if the decimal part ≥ 0.8"))),
  ], [
    ["n<sub>i</sub>, A<sub>i</sub>", "number of conductors of each size and the area of one, Chapter 9 Table 5 (THHN/THWN-2)"],
    ["A<sub>raceway</sub>", "internal area of the raceway, Chapter 9 Table 4"],
    ["53 / 31 / 40", "percent allowed for 1, 2, or more than 2 conductors, Chapter 9 Table 1 (60% for nipples of 24 in. or less)"],
    ["N", "the most conductors of one size; the round-up is Note 7 to the Chapter 9 tables"],
  ]),
  "ohms-law": formulaSection("ohms-law", "The formulas", [
    math("V equals I times R", row(mi("V"), mo("="), mi("I"), mo("&#x2062;"), mi("R"), mo(",&#x2003;"), mi("I"), mo("="), frac(mi("V"), mi("R")), mo(",&#x2003;"), mi("R"), mo("="), frac(mi("V"), mi("I")))),
    math("P equals V times I equals I squared R equals V squared over R",
      row(mi("P"), mo("="), mi("V"), mo("&#x2062;"), mi("I"), mo("="), `<msup>${mi("I")}${mn("2")}</msup>`, mo("&#x2062;"), mi("R"), mo("="), frac(`<msup>${mi("V")}${mn("2")}</msup>`, mi("R"))),
    ),
    math("Wire resistance equals table 8 resistance times length over 1000", row(sub(mi("R"), T("wire")), mo("="), sub(mi("R"), T("Table 8")), mo("×"), frac(mi("L"), mn("1000")))),
  ], [["V", "volts"], ["I", "amps"], ["R", "ohms"], ["P", "watts"], ["R<sub>Table 8</sub>", "DC resistance per 1,000 ft at 75 °C, Chapter 9 Table 8"], ["L", "conductor length in feet"]]),
  "wire-size": formulaSection("wire-size", "The formula", [
    math("Allowable ampacity equals the minimum of table ampacity times ambient factor times adjustment factor, and the terminal column ampacity",
      row(sub(mi("I"), T("allowed")), mo("="), mi("min"), mo("("), sub(mi("I"), T("insulation")), mo("×"), sub(mi("F"), T("ambient")), mo("×"), sub(mi("F"), T("adjust")), mo(","), sub(mi("I"), T("terminal")), mo(")"))),
    math("F ambient equals the square root of T c minus T a over T c minus 30",
      row(sub(mi("F"), T("ambient")), mo("="), sqrt(frac(row(sub(mi("T"), mi("c")), mo("−"), sub(mi("T"), mi("a"))), row(sub(mi("T"), mi("c")), mo("−"), mn("30"))))),
    ),
  ], [
    ["I<sub>insulation</sub>", "Table 310.16 ampacity in the insulation's temperature column (60, 75 or 90 °C)"],
    ["F<sub>ambient</sub>", "ambient correction, Table 310.15(B)(1)(1); the equation is the one in 310.15(B), rounded to two places in the table"],
    ["F<sub>adjust</sub>", "adjustment for more than three current-carrying conductors, Table 310.15(C)(1)"],
    ["I<sub>terminal</sub>", "Table 310.16 ampacity in the terminal's column, 110.14(C)"],
    ["T<sub>c</sub>, T<sub>a</sub>", "conductor temperature rating and ambient temperature, °C"],
  ], "The smallest size that clears the load wins, except 14, 12 and 10 AWG copper (and 12 and 10 aluminum), which 240.4(D) limits to 15, 20 and 30 A (15 and 25 A) overcurrent protection."),
  "generator-size": formulaSection("generator-size", "The formulas", [
    math("Conservative starting watts equals the sum of running watts plus the largest starting watts",
      row(sub(mi("W"), T("start")), mo("="), mo("∑"), sub(mi("W"), T("run")), mo("+"), mi("max"), mo("("), sub(mi("W"), T("start,i")), mo(")"))),
    math("Largest-start rule: maximum over loads of sum of running minus that load's running plus its starting",
      row(sub(mi("W"), T("start")), mo("="), sub(mi("max"), mi("i")), mo("("), mo("∑"), sub(mi("W"), T("run")), mo("−"), sub(mi("W"), T("run,i")), mo("+"), sub(mi("W"), T("start,i")), mo(")"))),
    math("Output conductors at 115 percent of nameplate current", row(sub(mi("I"), T("conductors")), mo("≥"), mn("1.15"), mo("×"), sub(mi("I"), T("nameplate")))),
  ], [["W<sub>run</sub>", "running watts of each load"], ["W<sub>start</sub>", "starting (surge) watts of each load"], ["I<sub>nameplate</sub>", "generator nameplate current; 445.13 sets the 115%"]]),
  "amps-to-watts": formulaSection("amps-to-watts", "The formulas", [
    math("DC: P equals V times I", row(T("DC:&#x2002;"), mi("P"), mo("="), mi("V"), mo("&#x2062;"), mi("I"))),
    math("Single-phase: P equals V times I times PF", row(T("Single-phase:&#x2002;"), mi("P"), mo("="), mi("V"), mo("&#x2062;"), mi("I"), mo("&#x2062;"), T("PF"))),
    math("Three-phase: P equals root 3 times V line to line times I times PF", row(T("Three-phase:&#x2002;"), mi("P"), mo("="), sqrt(mn("3")), mo("&#x2062;"), sub(mi("V"), T("LL")), mo("&#x2062;"), mi("I"), mo("&#x2062;"), T("PF"))),
    math("Amps equals P divided by the same factors", row(mi("I"), mo("="), frac(mi("P"), row(mi("V"), mo("&#x2062;"), T("PF"), T(" (× "), sqrt(mn("3")), T(" for three-phase)"))))),
  ], [["P", "real power, watts"], ["V", "volts (line-to-line for three-phase)"], ["I", "amps"], ["PF", "power factor, 1.0 for resistive loads"]], "Apparent power: kVA = V × I (× √3) ÷ 1000."),
};

// ---------- worked examples (computed) ----------

const ex = (heading: string, lines: string[]) => `<section class="stack section-card example" data-example>
<h2>${esc(heading)}</h2>
<ol class="steps">${lines.map((l) => `<li>${l}</li>`).join("")}</ol>
</section>`;

function examples(): Record<string, string> {
  // Voltage drop: 20 A at 120 V, 100 ft of 12 AWG copper in PVC, PF 0.85.
  const r12 = T9["12"][1][0], x12 = T9["12"][0][0];
  const z = zEff("cu", "12", .85, "pvc");
  const vd = vdTable9("cu", "12", 20, 100, 1, .85, "pvc");
  const k = vdK("cu", "12", 20, 100, 1);
  // Conduit fill: 12 AWG THHN in 3/4 EMT; 14 AWG in 3/4 PVC (Note 7).
  const q1 = EMT40["3/4"] / THHN["12"], q2 = PVC40_40["3/4"] / THHN["14"];
  // Wire size: 6 AWG THHN, 40 C ambient, 75 C terminals.
  const ws = wireSize({ material: "cu", amps: 65, insulationC: 90, terminationC: 75, ambientC: 40 });
  const ws6 = ws.steps.at(-1)!;
  const [gRun, gA] = genSize([[600, 600], [100, 100], [700, 2200]], "add_full_start");
  const [, gB] = genSize([[600, 600], [100, 100], [700, 2200]]);
  const a15 = ampsFromWatts(15000, 480, 3);
  return {
    "voltage-drop": ex("Worked example", [
      "A 20 A load on a 120 V single-phase circuit, 100 ft from the panel, on 12 AWG copper THHN in PVC conduit, power factor 0.85.",
      `Chapter 9 Table 9 for 12 AWG copper in PVC: R = ${r12.toFixed(1)} Ω and X<sub>L</sub> = ${x12} Ω per 1,000 ft.`,
      `θ = arccos(0.85) = ${fmt(Math.acos(.85) * 180 / Math.PI, 2)}°, so Z<sub>eff</sub> = ${r12.toFixed(1)} × 0.85 + ${x12} × ${fmt(Math.sin(Math.acos(.85)), 4)} = ${fmt(z, 4)} Ω per 1,000 ft.`,
      `VD = 2 × 20 × ${fmt(z, 4)} × 100 ÷ 1000 = <b>${fmt(vd)} V</b>, which is ${fmt(vd / 1.2)}% of 120 V. That's over 3%, so this run wants a larger wire.`,
      `The K-method quick check gives 2 × 12.9 × 20 × 100 ÷ 6,530 = ${fmt(k)} V. It runs high here because it uses DC resistance at full current and ignores the power factor.`,
    ]),
    "conduit-fill": ex("Worked examples", [
      `How many 12 AWG THHN fit in ¾ in. EMT? Table 4 gives ${EMT40["3/4"]} in² at 40%; Table 5 gives ${THHN["12"]} in² per wire. ${EMT40["3/4"]} ÷ ${THHN["12"]} = ${fmt(q1, 2)}, so <b>${maxSameSize(EMT40["3/4"], THHN["12"])}</b>.`,
      `How many 14 AWG THHN fit in ¾ in. PVC Schedule 40? ${PVC40_40["3/4"]} ÷ ${THHN["14"]} = ${fmt(q2, 2)}. The decimal is 0.8 or more, so Note 7 rounds up: <b>${maxSameSize(PVC40_40["3/4"], THHN["14"])}</b>. Charts that cut the decimal off show 20.`,
      `Mixed sizes: three 2 AWG, one 4 AWG and one 8 AWG THHN total ${fmt(3 * THHN["2"] + THHN["4"] + THHN["8"], 4)} in². The smallest EMT whose 40% area covers that is 1¼ in. (${EMT40["1-1/4"]} in²).`,
    ]),
    "ohms-law": ex("Worked example", [
      "A 2,500 W water heater element on 240 V.",
      `I = P ÷ V = 2,500 ÷ 240 = <b>${fmt(2500 / 240)} A</b>.`,
      `R = V² ÷ P = 240² ÷ 2,500 = <b>${fmt(240 * 240 / 2500)} Ω</b>.`,
      `Wire resistance: 200 ft of 12 AWG copper is ${R_DC_CU["12"]} × 200 ÷ 1000 = ${fmt(R_DC_CU["12"] * 0.2, 3)} Ω per conductor (Chapter 9 Table 8).`,
    ]),
    "wire-size": ex("Worked example", [
      "A 65 A load on 6 AWG copper THHN, three current-carrying conductors, ambient 40 °C (104 °F), equipment terminals rated 75 °C.",
      `Start in the 90 °C column of Table 310.16: ${ws6.base} A. Ambient correction at 40 °C for 90 °C insulation: × ${ws.ambientFactor}.`,
      `${ws6.base} × ${ws.ambientFactor} = ${fmt(ws6.derated, 2)} A. Three conductors need no adjustment.`,
      `The terminals are rated 75 °C, so the conductor can't be credited with more than the 75 °C column: ${ws6.cap} A.`,
      `Allowable ampacity: <b>${ws6.allowable} A</b>. 6 AWG carries the 65 A load; smaller sizes fall short.`,
    ]),
    "generator-size": ex("Worked example", [
      "A furnace fan (600 W running), lights (100 W) and a refrigerator (700 W running, 2,200 W starting).",
      `Running total: 600 + 100 + 700 = ${gRun.toLocaleString("en-US")} W.`,
      `Conservative rule: ${gRun.toLocaleString("en-US")} + 2,200 = <b>${gA.toLocaleString("en-US")} W</b> starting.`,
      `Largest-start rule: the refrigerator's 2,200 W replaces its own 700 W: 600 + 100 + 2,200 = ${gB.toLocaleString("en-US")} W starting.`,
      "A generator rated 3,600 W starting and 1,400 W running covers both rules.",
    ]),
    "amps-to-watts": ex("Worked example", [
      "A 15 kW heater on 480 V three-phase, power factor 1.0.",
      `I = 15,000 ÷ (√3 × 480 × 1.0) = 15,000 ÷ ${fmt(Math.sqrt(3) * 480, 1)} = <b>${fmt(a15)} A</b>.`,
      "The other way: 30 A at 240 V single-phase, PF 1.0, is 240 × 30 = 7,200 W.",
    ]),
  };
}

// ---------- reference charts (our own layout, computed from the math module) ----------

const chart = (id: string, heading: string, intro: string, head: string[], rows: string[][], foot = "", rowHeads = true) =>
  `<section class="stack section-card chart" id="${id}" data-chart="${id}">
<h2>${esc(heading)}</h2>
${intro ? `<p class="small">${intro}</p>` : ""}
<div class="table-wrap chart-wrap"><table class="ref-table">
<thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead>
<tbody>${rows.map((r) => `<tr>${r.map((c, i) => (i === 0 && rowHeads ? `<th scope="row">${c}</th>` : `<td>${c}</td>`)).join("")}</tr>`).join("")}</tbody>
</table></div>${foot ? `\n<p class="small muted">${foot}</p>` : ""}
</section>`;

/** Our own wording of the two rules every ampacity chart needs beside it. */
const NOTE_240_4D = "† Small conductors (240.4(D)): the wire can carry this much, but its breaker or fuse can't be larger than 15 A on 14 AWG copper, 20 A on 12 AWG copper or 30 A on 10 AWG copper; on aluminum, 15 A on 12 AWG and 25 A on 10 AWG.";
const NOTE_110_14C = "Terminals (110.14(C)): use the column of the lowest-rated part of the circuit. Equipment for circuits of 100 A or less, or for 14 through 1 AWG, is treated as 60 °C unless it's marked 75 °C; over 100 A, 75 °C. The 90 °C column is a starting point for derating 90 °C wire, not the final ampacity at a 60 °C or 75 °C terminal.";
const ocpdMark = (mat: "cu" | "al", s: string, amps: number) => {
  const lim = OCPD_LIMIT_240_4D[`${mat}:${s}`];
  return lim !== undefined && lim < amps ? `${amps}<sup>†</sup>` : `${amps}`;
};
function ampacityCharts(): string[] {
  const cu = chart("ampacity-copper", "Copper ampacity", "Allowable amps for copper building wire at 30 °C (86 °F) ambient with up to three current-carrying conductors, by insulation temperature rating. From NEC Table 310.16.",
    ["Size", "60 °C<br><small>TW, UF</small>", "75 °C<br><small>THW, THWN, XHHW</small>", "90 °C<br><small>THHN, THWN-2, XHHW-2</small>", "Most overcurrent protection"],
    SIZES.map((s) => [sizeLabel(s), ...AMP_CU[s].map((a) => ocpdMark("cu", s, a)), OCPD_LIMIT_240_4D[`cu:${s}`] ? `${OCPD_LIMIT_240_4D[`cu:${s}`]} A (240.4(D))` : "Per 240.4"]),
    NOTE_240_4D + " " + NOTE_110_14C);
  const alSizes = SIZES.filter((s) => s in AMP_AL);
  const al = chart("ampacity-aluminum", "Aluminum ampacity", "The same for aluminum and copper-clad aluminum conductors. From NEC Table 310.16.",
    ["Size", "60 °C", "75 °C", "90 °C", "Most overcurrent protection"],
    alSizes.map((s) => [sizeLabel(s), ...AMP_AL[s].map((a) => ocpdMark("al", s, a)), OCPD_LIMIT_240_4D[`al:${s}`] ? `${OCPD_LIMIT_240_4D[`al:${s}`]} A (240.4(D))` : "Per 240.4"]),
    NOTE_240_4D + " " + NOTE_110_14C);
  const amb = chart("ambient-correction", "Ambient temperature correction", "Multiply the 30 °C ampacity by this factor. From NEC Table 310.15(B)(1)(1); each value is the 310.15(B) equation at the top of its range.",
    ["Ambient", "60 °C wire", "75 °C wire", "90 °C wire"],
    AMBIENT_310_15B1.map(([max, ...f], i) => {
      const from = ambientRowFrom(i);
      const label = from === -Infinity ? `${max} °C (${tempRow(max)}) or less` : `${from}–${max} °C (${tempRow(from)}–${tempRow(max)})`;
      return [label, ...f.map((x) => (x === null ? "not allowed" : x.toFixed(2)))];
    }));
  const adj = chart("bundling-adjustment", "More than three current-carrying conductors", "Multiply the ampacity by this factor when a raceway or cable holds more than three current-carrying conductors. From NEC Table 310.15(C)(1).",
    ["Current-carrying conductors", "Factor"],
    ADJ_310_15C1.slice(1).map(([n, f], i) => [i === ADJ_310_15C1.length - 2 ? `${ADJ_310_15C1[i][0] + 1} or more` : `${ADJ_310_15C1[i][0] + 1}–${n}`, `${Math.round(f * 100)}%`]));
  return [cu + "\n" + al, amb + "\n" + adj];
}

function conduitCharts(): string {
  const tables = (Object.keys(RACEWAYS) as Raceway[]).map((rw) => chart(`fill-${rw}`, `${RACEWAYS[rw].label}: most THHN/THWN-2 of one size`,
    "", ["Wire", ...TRADE_SIZES.map((t) => `${t.replace("-", " ")}″`)],
    THHN_SIZES.map((s) => [sizeLabel(s), ...TRADE_SIZES.map((t) => String(maxConductors(rw, t, s)))])));
  return `${tables.join("\n")}
<p class="small muted">Computed from Chapter 9 Tables 1, 4 and 5 with Note 7's round-up (a decimal of 0.8 or more counts as one more). Trade sizes over 2 in. and wires over 4/0 use values not yet checked against the printed tables.</p>`;
}

function gaugeChart(): string {
  return chart("wire-gauge", "Wire gauge chart", "Conductor area and DC resistance from NEC Chapter 9 Table 8 (stranded, uncoated, 75 °C), with Table 310.16 ampacity at 75 °C.",
    ["Size", "Area (circular mils)", "Copper Ω per 1,000 ft", "Aluminum Ω per 1,000 ft", "Copper amps, 75 °C", "Aluminum amps, 75 °C"],
    SIZES.map((s) => [sizeLabel(s), CMIL[s].toLocaleString("en-US"), R_DC_CU[s].toPrecision(3), R_DC_AL[s].toPrecision(3), String(AMP_CU[s][1]), AMP_AL[s] ? String(AMP_AL[s][1]) : "–"]));
}

// ---------- the home page tiles ----------

export const CALC_PAGES: [string, string, string][] = [
  ["/voltage-drop-calculator", "Voltage drop", "Table 9 method with power factor and raceway, plus the K-method check."],
  ["/conduit-fill-calculator", "Conduit fill", "EMT, PVC and rigid, mixed sizes, with Note 7's round-up."],
  ["/ohms-law-calculator", "Ohm's law", "Any two of volts, amps, ohms and watts, plus wire resistance."],
  ["/wire-size-calculator", "Wire size", "Ampacity with ambient and bundling derates, 240.4(D) and terminals."],
  ["/generator-size-calculator", "Generator size", "Running and starting watts by both sizing rules."],
  ["/amps-to-watts-calculator", "Amps to watts", "DC, single-phase and three-phase, with power factor."],
  ["/ampacity-chart", "Ampacity chart", "Copper and aluminum, 60/75/90 °C, with derating factors."],
];
const ICONS: Record<string, string[]> = {
  "/voltage-drop-calculator": ["M4 6h16", "M4 12h10", "M4 18h5", "M18 14l3 3-3 3"],
  "/conduit-fill-calculator": ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M9 10a1.5 1.5 0 1 0 0-.01", "M15 10a1.5 1.5 0 1 0 0-.01", "M12 15a1.5 1.5 0 1 0 0-.01"],
  "/ohms-law-calculator": ["M5 19h4v-2a6 6 0 1 1 6 0v2h4"],
  "/wire-size-calculator": ["M3 12h4l2-5 3 10 3-10 2 5h4"],
  "/generator-size-calculator": ["M4 7h16v12H4z", "M13 9l-3 4h4l-3 4"],
  "/amps-to-watts-calculator": ["M7 4v16", "M3 16l4 4 4-4", "M17 20V4", "M13 8l4-4 4 4"],
  "/ampacity-chart": ["M4 4h16v16H4z", "M4 10h16", "M4 15h16", "M10 4v16"],
};
const explore = () => `<section class="stack explore"><ul class="tiles">${CALC_PAGES.map(([href, label, line]) =>
  `<li><a class="tile" href="${href}"><span class="tile-icon"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[href].map((d) => `<path d="${d}"/>`).join("")}</svg></span><span class="tile-name">${esc(label)}</span><span class="tile-line">${esc(line)}</span></a></li>`).join("")}</ul></section>`;

// ---------- the page list ----------

interface Entry { path: string; file: string; sitemap: boolean; noindex?: boolean; forms?: Record<string, string> }

function entries(): Entry[] {
  const X = examples();
  const [ampTables, derateTables] = ampacityCharts();
  return [
    { path: "/", file: "index.md", sitemap: true, forms: { explore: explore() } },
    { path: "/voltage-drop-calculator", file: "voltage-drop-calculator.md", sitemap: true, forms: { calculator: calcHtml(voltageDropCalc), formula: FORMULAS["voltage-drop"], example: X["voltage-drop"] } },
    { path: "/conduit-fill-calculator", file: "conduit-fill-calculator.md", sitemap: true, forms: { calculator: calcHtml(conduitFillCalc), formula: FORMULAS["conduit-fill"], example: X["conduit-fill"], chart: conduitCharts() } },
    { path: "/ohms-law-calculator", file: "ohms-law-calculator.md", sitemap: true, forms: { calculator: calcHtml(ohmsLawCalc), calculator2: calcHtml(wireResistanceCalc), formula: FORMULAS["ohms-law"], example: X["ohms-law"] } },
    { path: "/wire-size-calculator", file: "wire-size-calculator.md", sitemap: true, forms: { calculator: calcHtml(wireSizeCalc), formula: FORMULAS["wire-size"], example: X["wire-size"], chart: gaugeChart() } },
    { path: "/generator-size-calculator", file: "generator-size-calculator.md", sitemap: true, forms: { calculator: calcHtml(generatorCalc), formula: FORMULAS["generator-size"], example: X["generator-size"] } },
    { path: "/amps-to-watts-calculator", file: "amps-to-watts-calculator.md", sitemap: true, forms: { calculator: calcHtml(ampsWattsCalc), formula: FORMULAS["amps-to-watts"], example: X["amps-to-watts"] } },
    { path: "/ampacity-chart", file: "ampacity-chart.md", sitemap: true, forms: { chart: ampTables, chart2: derateTables } },
    { path: "/privacy", file: "privacy.md", sitemap: true },
    { path: "/terms", file: "terms.md", sitemap: true },
    { path: "/404", file: "404.md", sitemap: false, noindex: true },
  ];
}

const label = (path: string) => PAGE_LABELS[path] ?? path;
const brand = (s: string) => s.replaceAll("{{brand}}", config.brandName);

export function allPages(flags: Flags = defaultFlags()): PageDef[] {
  return entries().map((x) => {
    const c = readContent(x.file);
    return {
      path: x.path, title: brand(c.title), description: brand(c.description), sitemap: x.sitemap, noindex: x.noindex,
      body: renderBody(c, flags, { forms: x.forms ?? {}, label }, `content/${x.file}`),
    };
  });
}

// Re-exported for tests.
export { THHN_ALL };
