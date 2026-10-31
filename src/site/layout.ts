// Page shell: per-page title, description, canonical; header, footer; client config. Ported from dnsmailcheck's
// src/site/layout.ts: same head, header (pills, menu, theme toggle, CTA), footer (columns, trust strip, base row).

import { config } from "../config";
import { escapeHtml as e } from "../lib/http";
import { markInline } from "./brand";
import { NOINDEX, THEME_INLINE } from "./seo";

export interface PageOpts {
  path: string; // "/" or "/voltage-drop-calculator" (no .html; Workers assets serve foo.html at /foo)
  title: string;
  description: string;
  body: string;
  noindex?: boolean;
  assets: { css: string; js: string }; // hashed URLs
}

export const NAV = [
  { href: "/voltage-drop-calculator", label: "Voltage drop" },
  { href: "/wire-size-calculator", label: "Wire size" },
  { href: "/conduit-fill-calculator", label: "Conduit fill" },
  { href: "/ampacity-chart", label: "Ampacity chart" },
];

export const FOOTER_CALCS = [
  ["/voltage-drop-calculator", "Voltage drop"], ["/conduit-fill-calculator", "Conduit fill"], ["/ohms-law-calculator", "Ohm's law"],
  ["/wire-size-calculator", "Wire size"], ["/generator-size-calculator", "Generator size"], ["/amps-to-watts-calculator", "Amps to watts"],
];
export const FOOTER_CHARTS = [["/ampacity-chart", "Ampacity chart"], ["/conduit-fill-calculator#fill-emt", "Conduit fill chart"], ["/wire-size-calculator#wire-gauge", "Wire gauge chart"]];
export const FOOTER_SITE = [["/", "All calculators"], ["/privacy", "Privacy"], ["/terms", "Terms"]];

/** Link text for {{links ...}} in content files: every page's short name. */
export const PAGE_LABELS: Record<string, string> = Object.fromEntries([...FOOTER_CALCS, ...FOOTER_CHARTS, ...FOOTER_SITE]);

/** Values the browser script needs. Read from a JSON script tag (never executed). */
export const clientConfig = () => ({ brand: config.brandName });

// The system preference picks light or dark until the visitor chooses here (stored by the browser script, applied
// before paint by the inline THEME_INLINE script, same logic as /assets/theme.js). Without JavaScript the button stays hidden.
export const THEME_TOGGLE = `<button class="theme-toggle" type="button" aria-pressed="false" data-theme-toggle hidden>`
  + `<svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>`
  + `<svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`
  + `<span class="toggle-word">Dark theme</span></button>`;

const navLinks = (path: string) => NAV.map((n) => `<a href="${n.href}"${n.href === path ? ' aria-current="page"' : ""}>${e(n.label)}</a>`).join("");

// dnsmailcheck pass #87: the header is one row at every width. Where the nav pills don't fit (styles.css), they move into this
// menu: a native <details>, so it opens without the script; the script closes it on Escape and on a click outside it.
const NAV_MENU = (path: string) => `<details class="nav-menu"><summary class="icon-btn nav-menu-btn" aria-label="Menu">`
  + `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M4 12h16M4 17h16"/></svg></summary>`
  + `<div class="nav-menu-panel"><nav class="nav-menu-links" aria-label="Main menu">${navLinks(path)}</nav>${THEME_TOGGLE.replace('class="theme-toggle"', 'class="theme-toggle menu-theme"')}</div></details>`;

/** The self-hosted Google Sans Flex (OFL, latin subset, weights 300-800); styles.css has its @font-face. */
export const FONT_URL = "/assets/fonts/google-sans-flex-latin.woff2";

/** Footer trust lines. Each one has to stay true. Icons drawn like the home tiles'. */
const TRUST: [string[], string][] = [
  [["M4 6h16", "M4 12h16", "M4 18h10"], "Formula and code reference on every page"],
  [["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M4 21a8 8 0 0 1 16 0"], "No account, no sign-up"],
  [["M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6l-7-3Z", "m9 12 2 2 4-4"], "Tested against published worked examples"],
];
export const trustStrip = (cls = "") => `<ul class="trust-strip${cls ? ` ${cls}` : ""}">${TRUST.map(([paths, t]) =>
  `<li><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths.map((d) => `<path d="${d}"/>`).join("")}</svg><span>${e(t)}</span></li>`).join("")}</ul>`;

const FOOTER_BASE = `<div class="footer-base"><p><span class="nowrap">\u00a9 ${new Date().getUTCFullYear()} ${e(config.brandName)}</span> <span class="footer-sep" aria-hidden="true">\u00b7</span> `
  + `<span>Electrical calculators for working electricians.</span> </p>`
  + `<a class="back-to-top" href="#top">Back to top<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg></a></div>`;

export function layout(o: PageOpts): string {
  const canonical = `${config.siteUrl}${o.path === "/" ? "/" : o.path}`;
  const links = (items: string[][]) => items.map(([href, label]) => `<li><a href="${href}">${e(label)}</a></li>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0F1213" media="(prefers-color-scheme: dark)">
<title>${e(o.title)}</title>
<meta name="description" content="${e(o.description)}">
<link rel="canonical" href="${e(canonical)}">
${o.noindex || !config.indexable ? `<meta name="robots" content="${config.indexable ? "noindex" : NOINDEX}">\n` : ""}<meta property="og:title" content="${e(o.title)}">
<meta property="og:description" content="${e(o.description)}">
<meta property="og:url" content="${e(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${e(config.brandName)}">
<meta property="og:image" content="${config.siteUrl}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${e(config.brandName)}: a stranded wire seen end-on">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preload" href="${FONT_URL}" as="font" type="font/woff2" crossorigin>
<script>${THEME_INLINE}</script>
<link rel="stylesheet" href="${o.assets.css}">
<script type="application/json" id="client-config">${JSON.stringify(clientConfig()).replace(/</g, "\\u003c")}</script>
<script src="${o.assets.js}" defer></script>
</head>
<body id="top"${o.path === "/" ? ' class="page-home"' : ""}>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="container">
    <a class="brand" href="/">${markInline(1, 28)}<span>${e(config.brandName)}</span></a>
    <nav class="site-nav" aria-label="Main">${navLinks(o.path)}</nav>
    <div class="header-actions">${THEME_TOGGLE}${o.path === "/" ? "" : `<a class="btn btn-primary btn-chrome header-cta" href="/">All calculators</a>`}${NAV_MENU(o.path)}</div>
  </div>
</header>
<main id="main" class="container stack-lg">
${o.body}
</main>
<footer class="site-footer">
  <div class="container stack-lg">
    <a class="footer-brand" href="/">${markInline(1, 28)}<span>${e(config.brandName)}</span></a>
    <div class="footer-cols">
      <div><h2>Calculators</h2><ul>${links(FOOTER_CALCS)}</ul></div>
      <div><h2>Charts</h2><ul>${links(FOOTER_CHARTS)}</ul></div>
      <div><h2>${e(config.brandName)}</h2><ul>${links(FOOTER_SITE)}</ul></div>
    </div>
    ${trustStrip("footer-trust")}
    <p class="fineprint">Not affiliated with NFPA. NEC® is a registered trademark of the National Fire Protection Association; tables are cited by number, and values are used inside the calculators. ${e(config.ahjLine)}</p>
    ${FOOTER_BASE}
  </div>
</footer>
</body>
</html>
`;
}
