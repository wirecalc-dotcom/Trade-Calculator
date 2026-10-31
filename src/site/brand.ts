// The Wire Calculators mark: a stranded wire seen end-on, an insulation ring around seven conductor strands, in two tones of
// the brand teal. Same shape of module as dnsmailcheck's src/site/brand.ts (only the drawing and colours changed): one source
// for the header, footer, favicons, app icons and the OG image. Variant 1 is the one used site-wide.

export const BRAND = {
  /** Dark tone: the insulation (7.3:1 on white). */
  deep: "#1B5F6A",
  /** Light tone: the strands. */
  soft: "#7CC4CE",
  /** Dark-theme tones, same hue. */
  deepOnDark: "#7FCCD7",
  softOnDark: "#2F8E9C",
} as const;

export type MarkVariant = 1 | 2 | 3;

type Tone = "a" | "b" | "seam" | "paper"; // a = deep, b = soft, seam = the gap between planes (page colour), paper = white
type Paint = (fill: Tone | null, stroke?: Tone) => string;

// Seven strands in a hexagonal lay (one centre, six around), radius 6.2, centres 12.6 apart.
const STRANDS: [number, number][] = [[32, 32], ...[0, 60, 120, 180, 240, 300].map((deg): [number, number] => {
  const r = (deg * Math.PI) / 180;
  return [+(32 + 12.6 * Math.cos(r)).toFixed(2), +(32 + 12.6 * Math.sin(r)).toFixed(2)];
})];

function shapes(v: MarkVariant, p: Paint): string {
  const circle = (cx: number, cy: number, r: number, fill: Tone | null, stroke?: Tone, w = 2) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" ${p(fill, stroke)}${stroke ? ` stroke-width="${w}"` : ""}/>`;
  const strands = (fill: Tone, seam: Tone) => STRANDS.map(([x, y]) => circle(x, y, 6.2, fill, seam, 1.4)).join("");
  if (v === 1) return circle(32, 32, 29, "a") + circle(32, 32, 20.6, "seam") + strands("b", "seam");
  if (v === 2) return circle(32, 32, 29, "b") + circle(32, 32, 20.6, "a") + strands("b", "a");
  // 3: an app tile. Deep square, paper ring, soft strands.
  return `<rect x="0" y="0" width="64" height="64" rx="14" ${p("a")}/>`
    + `<g transform="translate(6.4 6.4) scale(0.8)">` + circle(32, 32, 29, "paper") + circle(32, 32, 20.6, "a") + strands("b", "a") + `</g>`;
}

/** Standalone SVG file (favicon, PNG renders): fixed colours. */
export function markFile(v: MarkVariant = 1, opts: { size?: number; seam?: string } = {}): string {
  const s = opts.size ?? 64;
  const c: Record<Tone, string> = { a: BRAND.deep, b: BRAND.soft, seam: opts.seam ?? "#FFFFFF", paper: "#FFFFFF" };
  const paint: Paint = (f, st) => `fill="${f ? c[f] : "none"}"${st ? ` stroke="${c[st]}"` : ""}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${s}" height="${s}">${shapes(v, paint)}</svg>`;
}

/** Inline SVG for pages: tones come from CSS classes (f-a, s-seam, ...), so dark mode follows the theme. */
export function markInline(v: MarkVariant = 1, size = 32, cls = "brand-mark"): string {
  const paint: Paint = (f, st) => `class="${[f ? `f-${f}` : "f-none", st ? `s-${st}` : ""].filter(Boolean).join(" ")}"`;
  return `<svg class="${cls}" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true" focusable="false">${shapes(v, paint)}</svg>`;
}
