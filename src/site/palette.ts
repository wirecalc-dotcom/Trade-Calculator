// Build-time reader for the colour tokens in site/static/assets/styles.css, so /brand-preview and the
// tests quote the same values the site uses: hex, hue angle and WCAG contrast ratio.

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const STYLES_PATH = join(import.meta.dirname, "../../site/static/assets/styles.css");

export interface Tokens { light: Record<string, string>; dark: Record<string, string> }

/** --c-* hex values from the :root block (light) and the html[data-theme="dark"] block. */
export function readTokens(css = readFileSync(STYLES_PATH, "utf8")): Tokens {
  const block = (sel: string) => {
    const i = css.indexOf(`${sel} {`);
    if (i < 0) throw new Error(`styles.css: no "${sel}" block`);
    const body = css.slice(i, css.indexOf("\n}", i));
    return Object.fromEntries([...body.matchAll(/--(c-[\w-]+):\s*(#[0-9A-Fa-f]{6})\b/g)].map((m) => [m[1], m[2].toUpperCase()]));
  };
  return { light: block(":root"), dark: block('html[data-theme="dark"]') };
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

/** HSL hue in degrees, rounded. */
export function hue(hex: string): number {
  const [r, g, b] = rgb(hex);
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round((h * 60 + 360) % 360);
}

export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio, rounded down to one decimal so a quoted 4.5 is never really 4.49. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.floor(((hi + 0.05) / (lo + 0.05)) * 10) / 10;
}
