// The site's one math module: a port of docs/research/calc_reference.py (same table data, same functions, same names in
// camelCase), plus the few extras the pages need, each marked EXTRA. Every calculator page, every reference chart and the
// build-time default results come from here; tests/unit/calc.test.ts runs the Python file's 50 cases and the Cerrowire check.
// Values: NEC Chapter 9 Tables 1, 4, 5, 8, 9; Table 310.16; 240.4(D); Table 310.15(B)(1)(1) and 310.15(C)(1).
// Every table value must be re-checked against the adopted code book before launch (calculator-math-research.md §9).
// Rules (CLAUDE.md): compute from raw table values, never pre-rounded columns; conduit fill applies Note 7; wire size
// enforces 240.4(D) and 110.14(C).

export const SIZES = ["14", "12", "10", "8", "6", "4", "3", "2", "1", "1/0", "2/0", "3/0", "4/0",
  "250", "300", "350", "400", "500", "600", "750", "1000"] as const;
export type Size = (typeof SIZES)[number];
export type Material = "cu" | "al";
export type Conduit = "pvc" | "al" | "steel";
export type Phase = "dc" | 1 | 3;
export type TempCol = 60 | 75 | 90;

const zip = <V>(keys: readonly string[], values: V[]): Record<string, V> => Object.fromEntries(keys.map((k, i) => [k, values[i]]));

// --- Chapter 9 Table 8: area (cmil), DC resistance ohm/kft at 75 C (stranded, uncoated Cu; Al)
export const CMIL: Record<string, number> = zip(SIZES, [4110, 6530, 10380, 16510, 26240, 41740, 52620, 66360, 83690, 105600, 133100,
  167800, 211600, 250000, 300000, 350000, 400000, 500000, 600000, 750000, 1000000]);
export const R_DC_CU: Record<string, number> = zip(SIZES, [3.14, 1.98, 1.24, 0.778, 0.491, 0.308, 0.245, 0.194, 0.154, 0.122, 0.0967,
  0.0766, 0.0608, 0.0515, 0.0429, 0.0367, 0.0321, 0.0258, 0.0214, 0.0171, 0.0129]);
export const R_DC_AL: Record<string, number> = zip(SIZES, [5.17, 3.25, 2.04, 1.28, 0.808, 0.508, 0.403, 0.319, 0.253, 0.201, 0.159,
  0.126, 0.100, 0.0847, 0.0707, 0.0605, 0.0529, 0.0424, 0.0353, 0.0282, 0.0212]);

// --- Chapter 9 Table 9 (ohm-to-neutral /kft, 75 C): XL (pvc_al, steel); R Cu (pvc, al, steel); R Al (pvc, al, steel)
type T9Row = [[number, number], [number, number, number], [number, number, number] | [null, null, null]];
export const T9: Record<string, T9Row> = {
  "14": [[.058, .073], [3.1, 3.1, 3.1], [null, null, null]],
  "12": [[.054, .068], [2.0, 2.0, 2.0], [3.2, 3.2, 3.2]],
  "10": [[.050, .063], [1.2, 1.2, 1.2], [2.0, 2.0, 2.0]],
  "8": [[.052, .065], [.78, .78, .78], [1.3, 1.3, 1.3]],
  "6": [[.051, .064], [.49, .49, .49], [.81, .81, .81]],
  "4": [[.048, .060], [.31, .31, .31], [.51, .51, .51]],
  "3": [[.047, .059], [.25, .25, .25], [.40, .41, .40]],
  "2": [[.045, .057], [.19, .20, .20], [.32, .32, .32]],
  "1": [[.046, .057], [.15, .16, .16], [.25, .26, .25]],
  "1/0": [[.044, .055], [.12, .13, .12], [.20, .21, .20]],
  "2/0": [[.043, .054], [.10, .11, .10], [.16, .16, .16]],
  "3/0": [[.042, .052], [.077, .082, .079], [.13, .13, .13]],
  "4/0": [[.041, .051], [.062, .067, .063], [.10, .11, .10]],
  "250": [[.041, .052], [.052, .057, .054], [.085, .090, .086]],
  "300": [[.041, .051], [.044, .049, .045], [.071, .076, .072]],
  "350": [[.040, .050], [.038, .043, .039], [.061, .066, .063]],
  "400": [[.040, .049], [.033, .038, .035], [.054, .059, .055]],
  "500": [[.039, .048], [.027, .032, .029], [.043, .048, .045]],
  "600": [[.039, .048], [.023, .028, .025], [.036, .041, .038]],
  "750": [[.038, .048], [.019, .024, .021], [.029, .034, .031]],
  "1000": [[.037, .046], [.015, .019, .018], [.023, .027, .025]],
};
export const CONDUIT_IDX: Record<Conduit, number> = { pvc: 0, al: 1, steel: 2 };

// --- Table 310.16 (60/75/90 C), 30 C ambient, <=3 CCC
export const AMP_CU: Record<string, [number, number, number]> = zip(SIZES, [[15, 20, 25], [20, 25, 30], [30, 35, 40], [40, 50, 55], [55, 65, 75], [70, 85, 95],
  [85, 100, 115], [95, 115, 130], [110, 130, 145], [125, 150, 170], [145, 175, 195], [165, 200, 225],
  [195, 230, 260], [215, 255, 290], [240, 285, 320], [260, 310, 350], [280, 335, 380], [320, 380, 430],
  [350, 420, 475], [400, 475, 535], [455, 545, 615]] as [number, number, number][]);
export const AMP_AL: Record<string, [number, number, number]> = zip(SIZES.slice(1), [[15, 20, 25], [25, 30, 35], [35, 40, 45], [40, 50, 55], [55, 65, 75],
  [65, 75, 85], [75, 90, 100], [85, 100, 115], [100, 120, 135], [115, 135, 150], [130, 155, 175],
  [150, 180, 205], [170, 205, 230], [195, 230, 260], [210, 250, 280], [225, 270, 305], [260, 310, 350],
  [285, 340, 385], [320, 385, 435], [375, 445, 500]] as [number, number, number][]);
/** 240.4(D) small-conductor overcurrent limits. */
export const OCPD_LIMIT_240_4D: Record<string, number> = { "cu:14": 15, "cu:12": 20, "cu:10": 30, "al:12": 15, "al:10": 25 };
/** Table 310.15(C)(1): [max current-carrying conductors, factor]. */
export const ADJ_310_15C1: [number, number][] = [[3, 1.0], [6, .80], [9, .70], [20, .50], [30, .45], [40, .40], [1e9, .35]];

/** Trade sizes in order. JS objects list integer-like keys ("1", "2") first, so never iterate a table's keys for order. */
export const TRADE_ORDER = ["1/2", "3/4", "1", "1-1/4", "1-1/2", "2", "2-1/2", "3", "3-1/2", "4"];
/** A table's keys in SIZES order (Python dicts keep insertion order; JS objects don't for keys like "10"). */
const ordered = (tbl: Record<string, unknown>): string[] => SIZES.filter((s) => s in tbl);

// --- Chapter 9 Table 4 (40% area, in^2) and Table 5 (THHN/THWN-2 area, in^2)
export const EMT40: Record<string, number> = { "1/2": .122, "3/4": .213, "1": .346, "1-1/4": .598, "1-1/2": .814, "2": 1.342 };
export const PVC40_40: Record<string, number> = { "1/2": .114, "3/4": .203, "1": .333, "1-1/4": .581, "1-1/2": .794, "2": 1.316 };
export const RMC40: Record<string, number> = { "1/2": .125, "3/4": .220, "1": .355, "1-1/4": .610, "1-1/2": .829, "2": 1.363 };
export const THHN: Record<string, number> = zip(SIZES.slice(0, 13), [.0097, .0133, .0211, .0366, .0507, .0824, .0973, .1158, .1562, .1855,
  .2223, .2679, .3237]);

// ---------------- calculators (same as calc_reference.py) ----------------

const col = (c: TempCol) => ({ 60: 0, 75: 1, 90: 2 })[c];
const mult = (phase: Phase) => (phase === 3 ? Math.sqrt(3) : 2);

/** Circular-mil method (Table 8 basis). K = 12.9 Cu / 21.2 Al. */
export function vdK(material: Material, size: string, amps: number, feet: number, phase: Phase, sets = 1): number {
  const K = material === "cu" ? 12.9 : 21.2;
  return mult(phase) * K * (amps / sets) * feet / CMIL[size];
}

export function vdTable8(material: Material, size: string, amps: number, feet: number, phase: Phase, sets = 1, tempC = 75): number {
  let R = (material === "cu" ? R_DC_CU : R_DC_AL)[size];
  const alpha = material === "cu" ? 0.00323 : 0.00330;
  R *= 1 + alpha * (tempC - 75); // Table 8 Note 2
  return mult(phase) * (amps / sets) * R * feet / 1000;
}

/** Ch. 9 Table 9 Note 2: Zeff = R*PF + XL*sin(acos PF). */
export function zEff(material: Material, size: string, pf = 0.85, conduit: Conduit = "pvc"): number {
  const xl = T9[size][0][conduit === "pvc" || conduit === "al" ? 0 : 1];
  const R = T9[size][material === "cu" ? 1 : 2][CONDUIT_IDX[conduit]];
  if (R === null) throw new Error(`no Table 9 value for ${material} ${size}`);
  return R * pf + xl * Math.sin(Math.acos(pf));
}

export function vdTable9(material: Material, size: string, amps: number, feet: number, phase: Phase, pf = 0.85, conduit: Conduit = "pvc", sets = 1): number {
  return mult(phase) * (amps / sets) * zEff(material, size, pf, conduit) * feet / 1000;
}

export function ampacity(material: Material, size: string, colC: TempCol, ambientFactor = 1.0, ccc = 3): number {
  const base = (material === "cu" ? AMP_CU : AMP_AL)[size][col(colC)];
  return base * ambientFactor * adjustmentFactor(ccc);
}

export const adjustmentFactor = (ccc: number): number => ADJ_310_15C1.find(([n]) => ccc <= n)![1];

export function minSizeForLoad(material: Material, amps: number, termC: TempCol): string | undefined {
  const tbl = material === "cu" ? AMP_CU : AMP_AL;
  for (const s of ordered(tbl)) {
    const a = tbl[s][col(termC)];
    const lim = OCPD_LIMIT_240_4D[`${material}:${s}`];
    if (a >= amps && (lim === undefined || lim >= amps)) return s;
  }
  return undefined;
}

export function maxSameSize(area40: number, conductorArea: number): number {
  const q = area40 / conductorArea;
  return Math.floor(q) + (q - Math.floor(q) >= 0.8 ? 1 : 0); // Ch. 9 Note 7
}

export function watts(volts: number, amps: number, phase: Phase = "dc", pf = 1.0): number {
  if (phase === "dc") return volts * amps;
  if (phase === 1) return volts * amps * pf;
  return Math.sqrt(3) * volts * amps * pf;
}

export const ampsFromWatts = (w: number, volts: number, phase: Phase = "dc", pf = 1.0): number => w / watts(volts, 1, phase, pf);

export type GenMethod = "add_full_start" | "largest_start_replaces_run";
/** loads: [running_w, starting_w]. Returns [running_total, surge_needed]. */
export function genSize(loads: [number, number][], method: GenMethod = "largest_start_replaces_run"): [number, number] {
  const run = loads.reduce((n, [r]) => n + r, 0);
  if (!loads.length) return [0, 0];
  if (method === "add_full_start") return [run, run + Math.max(...loads.map(([, s]) => s))]; // Champion/Murdoch's convention
  return [run, Math.max(...loads.map(([r, s]) => run - r + s))]; // Cummins convention
}

/** The Cerrowire voltage-drop-table rule from calc_reference.py: ampacity size first, then the first size within 3% (Table 9, steel, PF 0.9). */
export function cerroMin(material: Material, amps: number, feet: number, volts: number, termC: TempCol): string | undefined {
  const s0 = minSizeForLoad(material, amps, termC);
  const keys = ordered(material === "cu" ? AMP_CU : AMP_AL);
  for (const s of keys.slice(keys.indexOf(s0!))) {
    if (vdTable9(material, s, amps, feet, 1, .9, "steel") <= .03 * volts) return s;
  }
  return undefined;
}

// ---------------- EXTRA: what the pages need beyond calc_reference.py ----------------

/** EXTRA. Table 8 Note 2 temperature coefficient. */
export const ALPHA: Record<Material, number> = { cu: 0.00323, al: 0.00330 };

/** EXTRA. Sizes a material has data for (no 14 AWG aluminum in Tables 9 and 310.16). */
export const sizesFor = (material: Material): string[] => ordered(material === "cu" ? AMP_CU : AMP_AL);

/** EXTRA. Size labels: "12 AWG", "4/0 AWG", "250 kcmil". */
export const sizeLabel = (s: string): string => (/^\d{3,4}$/.test(s) ? `${s} kcmil` : `${s} AWG`);

/**
 * EXTRA. Table 310.15(B)(1)(1) ambient correction (30 C basis): [highest ambient C of the row, 60 C, 75 C, 90 C factors];
 * null = not permitted. Each value equals 310.15(B)(1)'s equation sqrt((Tc - Ta) / (Tc - 30)) at the row's end, rounded
 * to two places (tests/unit/calc.test.ts checks every cell that way).
 */
export const AMBIENT_310_15B1: [number, number | null, number | null, number | null][] = [
  [10, 1.29, 1.20, 1.15], [15, 1.22, 1.15, 1.12], [20, 1.15, 1.11, 1.08], [25, 1.08, 1.05, 1.04], [30, 1.00, 1.00, 1.00],
  [35, .91, .94, .96], [40, .82, .88, .91], [45, .71, .82, .87], [50, .58, .75, .82], [55, .41, .67, .76],
  [60, null, .58, .71], [65, null, .47, .65], [70, null, .33, .58], [75, null, null, .50], [80, null, null, .41], [85, null, null, .29],
];
/** EXTRA. The row's lowest ambient (the first row covers everything colder). */
export const ambientRowFrom = (i: number): number => (i === 0 ? -Infinity : AMBIENT_310_15B1[i - 1][0] + 1);

/** EXTRA. Ambient correction factor for a temperature column, or null when the conductor can't be used that hot. */
export function ambientFactor(ambientC: number, colC: TempCol): number | null {
  const row = AMBIENT_310_15B1.find(([max]) => Math.ceil(ambientC) <= max);
  return row ? row[col(colC) + 1] : null;
}

export const fToC = (f: number): number => (f - 32) * 5 / 9;
export const cToF = (c: number): number => c * 9 / 5 + 32;

export interface WireSizeInput {
  material: Material;
  amps: number;
  /** Insulation temperature rating: the column derating starts from (THHN/XHHW-2 90, THWN 75, UF 60). */
  insulationC: TempCol;
  /** Termination rating per 110.14(C): 60 for <= 100 A or 14-1 AWG unless the equipment is marked 75 C; 75 above 100 A. */
  terminationC: TempCol;
  ambientC?: number;
  ccc?: number;
  /** NM-B (334.80): derate from the 90 C column, final ampacity no more than the 60 C column. */
  nmb?: boolean;
  /** Continuous load: the conductor must carry 125% of it (210.19(A)(1), 215.2(A)(1)). */
  continuous?: boolean;
}
export interface WireSizeStep { size: string; base: number; derated: number; cap: number; allowable: number; ocpdLimit: number | null; ok: boolean; why: string }
export interface WireSizeResult { size: string | null; required: number; ambientFactor: number | null; adjust: number; steps: WireSizeStep[] }

/**
 * EXTRA. The smallest size whose allowable ampacity carries the load: insulation column x ambient x bundling, capped at
 * the termination column (110.14(C)), with the 240.4(D) limit for 14-10 AWG. With 30 C, <= 3 conductors and the insulation
 * column equal to the termination column it gives exactly minSizeForLoad (tested).
 */
export function wireSize(i: WireSizeInput): WireSizeResult {
  const insul: TempCol = i.nmb ? 90 : i.insulationC;
  const term: TempCol = i.nmb ? 60 : (Math.min(i.terminationC, insul) as TempCol);
  const af = ambientFactor(i.ambientC ?? 30, insul);
  const adj = adjustmentFactor(i.ccc ?? 3);
  const required = i.amps * (i.continuous ? 1.25 : 1);
  const tbl = i.material === "cu" ? AMP_CU : AMP_AL;
  const steps: WireSizeStep[] = [];
  if (af === null) return { size: null, required, ambientFactor: null, adjust: adj, steps };
  for (const s of ordered(tbl)) {
    const base = tbl[s][col(insul)];
    const derated = base * af * adj;
    const cap = tbl[s][col(term)];
    const allowable = Math.min(derated, cap);
    const lim = OCPD_LIMIT_240_4D[`${i.material}:${s}`] ?? null;
    const ok = allowable >= required - 1e-9 && (lim === null || lim >= i.amps);
    const why = allowable < required - 1e-9 ? "ampacity too low" : lim !== null && lim < i.amps ? `240.4(D) limits ${sizeLabel(s)} to ${lim} A` : "ok";
    steps.push({ size: s, base, derated, cap, allowable, ocpdLimit: lim, ok, why });
    if (ok) return { size: s, required, ambientFactor: af, adjust: adj, steps };
  }
  return { size: null, required, ambientFactor: af, adjust: adj, steps };
}

export type VdMethod = "table9" | "dc";
/** EXTRA. Voltage drop by the page's default method: Table 9 for AC, Table 8 (DC resistance at 75 C) for DC. */
export function voltageDrop(material: Material, size: string, amps: number, feet: number, phase: Phase, pf: number, conduit: Conduit, sets = 1): number {
  return phase === "dc" ? vdTable8(material, size, amps, feet, "dc", sets) : vdTable9(material, size, amps, feet, phase, pf, conduit, sets);
}

/** EXTRA. The smallest size whose drop is at or under the allowed percent of the source voltage (no rounding), or null. */
export function minSizeForDrop(material: Material, amps: number, feet: number, phase: Phase, volts: number, pct: number, pf: number, conduit: Conduit, sets = 1): string | null {
  for (const s of sizesFor(material)) if (voltageDrop(material, s, amps, feet, phase, pf, conduit, sets) <= volts * pct / 100) return s;
  return null;
}

/** EXTRA. Circular mils needed for an allowed drop, K-method solve-for form: CM = mult*K*I*L / VD. */
export const cmilNeeded = (material: Material, amps: number, feet: number, phase: Phase, vdAllowed: number): number =>
  mult(phase) * (material === "cu" ? 12.9 : 21.2) * amps * feet / vdAllowed;

/** EXTRA. Table 1: maximum fill by conductor count (nipples of 24 in. or less: 60%, Note 4). */
export const fillPercent = (conductors: number, nipple = false): number => (nipple ? 60 : conductors === 1 ? 53 : conductors === 2 ? 31 : 40);

/**
 * EXTRA. Table 4 40% columns past 2 in. and THHN past 4/0 (Table 5). Not in calc_reference.py and not yet source-checked:
 * verify in the NFPA 70 pass before launch (calculator-math-research.md §9).
 */
export const UNVERIFIED_EXTENSIONS = {
  EMT40: { "2-1/2": 2.343, "3": 3.538, "3-1/2": 4.618, "4": 5.901 },
  PVC40_40: { "2-1/2": 1.878, "3": 2.907, "3-1/2": 3.895, "4": 5.022 },
  RMC40: { "2-1/2": 1.946, "3": 3.000, "3-1/2": 4.004, "4": 5.153 },
  THHN: { "250": .3970, "300": .4608, "350": .5242, "400": .5863, "500": .7073, "600": .8676, "750": 1.0496, "1000": 1.3478 } as Record<string, number>,
};

export type Raceway = "emt" | "pvc40" | "rmc";
export const RACEWAYS: Record<Raceway, { label: string; area40: Record<string, number> }> = {
  emt: { label: "EMT", area40: { ...EMT40, ...UNVERIFIED_EXTENSIONS.EMT40 } },
  pvc40: { label: "PVC Schedule 40", area40: { ...PVC40_40, ...UNVERIFIED_EXTENSIONS.PVC40_40 } },
  rmc: { label: "Rigid metal (RMC)", area40: { ...RMC40, ...UNVERIFIED_EXTENSIONS.RMC40 } },
};
export const THHN_ALL: Record<string, number> = { ...THHN, ...UNVERIFIED_EXTENSIONS.THHN };
export const TRADE_SIZES = TRADE_ORDER;
/** THHN sizes with an area, in order. */
export const THHN_SIZES = ordered(THHN_ALL);

/** EXTRA. Total area at 100% for a trade size (the 40% column / 0.4), for the 53% and 31% rows. */
export const totalArea = (raceway: Raceway, trade: string): number => RACEWAYS[raceway].area40[trade] / 0.4;

export interface FillLine { size: string; count: number }
export interface FillResult { conductors: number; area: number; allowed: number; pct: number; fillPct: number; fits: boolean; smallest: string | null }

/** EXTRA. Mixed or same-size fill: sum of Table 5 areas against the Table 1 percentage of the raceway's Table 4 area. */
export function conduitFill(raceway: Raceway, trade: string, lines: FillLine[], nipple = false): FillResult {
  const conductors = lines.reduce((n, l) => n + l.count, 0);
  const area = lines.reduce((n, l) => n + THHN_ALL[l.size] * l.count, 0);
  const fillPct = fillPercent(conductors, nipple);
  const allowedFor = (t: string) => totalArea(raceway, t) * fillPct / 100;
  const allowed = allowedFor(trade);
  // Note 7 applies only to conductors all the same size: the count from maxSameSize may round up past the plain area check.
  const same = lines.filter((l) => l.count > 0).length === 1;
  const fitsIn = (t: string) => {
    if (same && !nipple && conductors > 2) {
      const l = lines.find((x) => x.count > 0)!;
      return conductors <= maxSameSize(RACEWAYS[raceway].area40[t], THHN_ALL[l.size]);
    }
    return area <= allowedFor(t) + 1e-12;
  };
  const smallest = TRADE_SIZES.find(fitsIn) ?? null;
  return { conductors, area, allowed, pct: (area / totalArea(raceway, trade)) * 100, fillPct, fits: fitsIn(trade), smallest };
}

/** EXTRA. Table 430.7(B) locked-rotor amps from kVA/hp (worked tests in calc_reference.py). */
export const lockedRotorAmps = (hp: number, kvaPerHp: number, volts: number, phase: 1 | 3): number =>
  (hp * kvaPerHp * 1000) / (phase === 3 ? Math.sqrt(3) * volts : volts);

/** EXTRA. 445.13: generator output conductors at 115% of nameplate current. */
export const generatorConductorAmps = (watts_: number, volts: number, phase: 1 | 3, pf = 1): number => ampsFromWatts(watts_, volts, phase, pf) * 1.15;
