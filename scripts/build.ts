// Builds public/: HTML for every page, the client bundle, static assets, robots.txt, sitemap.xml. Ported from dnsmailcheck's
// scripts/build.ts (its PSL, report-analyzer, DNS-check and confirm-dialog bundles dropped).
// Asset URLs carry a content hash (?v=), so a changed file always gets a new URL whatever the edge has cached.

import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { build } from "esbuild";
import { config } from "../src/config";
import { layout } from "../src/site/layout";
import { allPages } from "../src/site/pages";
import { headersFile, robotsTxt } from "../src/site/seo";

const root = join(import.meta.dirname, "..");
const out = join(root, "public");
const hash = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex").slice(0, 10);


rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "assets"), { recursive: true });
cpSync(join(root, "site/static"), out, { recursive: true });

const bundle = await build({
  entryPoints: [join(root, "src/client/app.ts")],
  bundle: true, minify: true, format: "iife", target: "es2020", write: false, legalComments: "none",
});
const js = bundle.outputFiles[0].contents;
writeFileSync(join(out, "assets/app.js"), js);
const css = readFileSync(join(out, "assets/styles.css"));
// /assets/theme.js stays for the Worker's simple pages; site pages carry the same logic inline (seo.ts THEME_INLINE).
const assets = { css: `/assets/styles.css?v=${hash(css)}`, js: `/assets/app.js?v=${hash(js)}` };

const pages = allPages();
for (const p of pages) {
  const file = p.path === "/" ? "index.html" : `${p.path.slice(1)}.html`;
  mkdirSync(dirname(join(out, file)), { recursive: true });
  writeFileSync(join(out, file), layout({ ...p, assets }));
}

writeFileSync(join(out, "robots.txt"), robotsTxt());
writeFileSync(join(out, "_headers"), headersFile());

const today = new Date().toISOString().slice(0, 10);
const urls = pages.filter((p) => p.sitemap && !p.noindex)
  .map((p) => `  <url><loc>${config.siteUrl}${p.path}</loc><lastmod>${today}</lastmod></url>`).join("\n");
writeFileSync(join(out, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);

console.log(`built ${pages.length} pages (${config.indexable ? "indexable" : "noindex preview"}), app.js ${js.length} bytes, styles.css ${css.length} bytes`);
