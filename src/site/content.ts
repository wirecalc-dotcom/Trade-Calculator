// Renders the page copy in content/*.md (format: content/README.md) into page bodies at build time.
// Front matter holds title and description; the body is a small Markdown subset plus {{...}} directives
// for the parts that come from code (forms, link lists, prices, the support address).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config";
import { escapeHtml as e } from "../lib/http";

export const CONTENT_DIR = join(import.meta.dirname, "../../content");

export interface Flags { adsEnabled: boolean }
const FLAG_NAMES = ["adsEnabled"];
const flagOn = (flags: Flags, name: string): boolean => !!flags[name as keyof Flags];
export const defaultFlags = (): Flags => ({ adsEnabled: config.features.adsEnabled });

export interface ContentFile { title: string; description: string; layout: "default" | "prose" | "home"; body: string }

/** Code-made pieces a content file can place: forms (own line) and link lists. */
export interface Blocks { forms: Record<string, string>; label: (path: string) => string }

export function readContent(file: string): ContentFile {
  return parseContent(readFileSync(join(CONTENT_DIR, file), "utf8"), file);
}

export function parseContent(src: string, file = "content"): ContentFile {
  const m = src.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing the --- front matter block`);
  const meta: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const i = line.indexOf(":");
    if (i < 0) throw new Error(`${file}: front matter line "${line}" has no colon`);
    meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  for (const k of ["title", "description"]) if (!meta[k]) throw new Error(`${file}: front matter needs "${k}"`);
  const layout = (meta.layout ?? "default") as ContentFile["layout"];
  if (!["default", "prose", "home"].includes(layout)) throw new Error(`${file}: layout must be default, prose or home`);
  return { title: meta.title, description: meta.description, layout, body: m[2] };
}

/** {{#if flag}} ... {{else}} ... {{/if}} on their own lines. No nesting. */
export function applyFlags(body: string, flags: Flags, file = "content"): string {
  const out: string[] = [];
  let mode: "out" | "keep" | "drop" = "out";
  for (const line of body.split("\n")) {
    const t = line.trim();
    const open = t.match(/^\{\{#if (\w+)\}\}$/);
    if (open) {
      if (mode !== "out") throw new Error(`${file}: {{#if}} blocks can't be nested`);
      if (!FLAG_NAMES.includes(open[1])) throw new Error(`${file}: unknown flag "${open[1]}" (known: ${FLAG_NAMES.join(", ")})`);
      mode = flagOn(flags, open[1]) ? "keep" : "drop";
      continue;
    }
    if (t === "{{else}}") { if (mode === "out") throw new Error(`${file}: {{else}} outside {{#if}}`); mode = mode === "keep" ? "drop" : "keep"; continue; }
    if (t === "{{/if}}") { if (mode === "out") throw new Error(`${file}: {{/if}} without {{#if}}`); mode = "out"; continue; }
    if (mode !== "drop") out.push(line);
  }
  if (mode !== "out") throw new Error(`${file}: {{#if}} without {{/if}}`);
  return out.join("\n");
}

const VARS: Record<string, () => string> = {
  brand: () => e(config.brandName),
  supportEmail: () => `<a href="mailto:${e(config.supportEmail)}">${e(config.supportEmail)}</a>`,
  editions: () => e(config.editionsLine),
  ahj: () => e(config.ahjLine),
};

// Pass #104: the status pills the result uses (.badge-*), drawn at build time. Same paths as ICON_PATHS in src/client/app.ts.
const SEV_PATHS: Record<string, string[]> = {
  pass: ["M20 6 9 17l-5-5"],
  warn: ["M12 3 2 20h20L12 3Z", "M12 10v4", "M12 17h.01"],
  fail: ["M18 6 6 18", "M6 6l12 12"],
  info: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z", "M12 16v-4", "M12 8h.01"],
};
/** A status pill: the severity's icon and its word, in the result's badge colours. */
export function sevBadge(kind: string, word: string): string {
  if (!SEV_PATHS[kind]) throw new Error(`unknown badge "${kind}" (known: ${Object.keys(SEV_PATHS).join(", ")})`);
  return `<span class="badge badge-${kind}"><svg viewBox="0 0 24 24" class="sev-icon" aria-hidden="true" focusable="false">${SEV_PATHS[kind].map((d) => `<path d="${d}"/>`).join("")}</svg>${e(word)}</span>`;
}

/** Inline Markdown: **bold**, *italic*, `code`, [text](url), and {{variables}}. Everything else is escaped. */
export function inline(text: string, file = "content"): string {
  const saved: string[] = [];
  const keep = (html: string) => `\u0000${saved.push(html) - 1}\u0000`;
  let s = text
    .replace(/\{\{badge (pass|warn|fail|info) ([^}]+)\}\}/g, (_, kind: string, word: string) => keep(sevBadge(kind, word.trim())))
    .replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
      if (!VARS[name]) throw new Error(`${file}: unknown {{${name}}} (known: ${Object.keys(VARS).join(", ")}, badge)`);
      return keep(VARS[name]());
    })
    .replace(/`([^`]+)`/g, (_, code: string) => keep(`<code>${e(code)}</code>`));
  if (/\{\{|\}\}/.test(s)) throw new Error(`${file}: unrecognised {{...}} in "${text}"`);
  s = e(s)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, href: string) => `<a href="${href}">${label}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => saved[Number(i)]);
}

/**
 * Keeps the last two words of a heading, summary or lead on one line (a no-break space between them), so
 * text-wrap: balance or a narrow screen never leaves one word alone on the last line. Only when the pair is
 * 24 characters or fewer (32 when the last word is `code`, set in a smaller font), so it fits a phone's line.
 */
export function bindLastWords(text: string): string {
  const m = text.match(/^([\s\S]*\S) +(\S+ *)$/);
  if (!m) return text;
  const lastTwo = `${m[1].split(/\s+/).pop()} ${m[2].trim()}`.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/`/g, "");
  const limit = m[2].includes("`") ? 32 : 24;
  return lastTwo.length <= limit && !/\]\([^)]*$/.test(m[1]) ? `${m[1]}\u00a0${m[2]}` : text;
}

/** A paragraph may end with {.class} or {.a .b}: lead, notice, muted, small. */
function classes(text: string): { text: string; cls: string } {
  const m = text.match(/\s*\{((?:\.[\w-]+\s*)+)\}\s*$/);
  if (!m) return { text, cls: "" };
  return { text: text.slice(0, m.index), cls: m[1].trim().split(/\s+/).map((c) => c.slice(1)).join(" ") };
}

/**
 * Body Markdown -> HTML. Blocks are separated by blank lines.
 *  # / ## / ### headings; "- " bullet lists; "1. " numbered lists; anything else is a paragraph.
 *  ``` fenced blocks ``` are shown exactly as written (records, tool output); <!-- comments --> are dropped.
 *  {{calculator}} (and {{calculator2}}) on its own line: the page's code-made calculator, placed between sections; {{formula}},
 *  {{example}}, {{chart}} (and {{chart2}}, {{chart3}}): code-made sections (MathML formula, worked example computed by
 *  src/lib/calc.ts, reference chart); {{explore}}: the home page's tiles.
 *  {{links /a /b}} on its own line: a grid of links, labelled from the site's page list; {{chips /a /b}}: the same as pills.
 *  "summary: ..." as the first paragraph under a ## heading: the section becomes a card that shows the
 *  heading and that one sentence, with the rest of the section in a native <details> ("Read more").
 *  "summary: ... {.faq}": the same card, but with no "Read more": each ### question shows, and its answer
 *  sits in that question's own <details>.
 *  "summary: ... {.open}": the same card with nothing collapsed: the rest of the section shows under the
 *  summary (/tools, whose link lists stay visible).
 *  The full text stays in the HTML, so it is still read by search engines.
 * Default layout: the H1 block and each H2 open a <section class="stack">. Home layout: the same, but the
 * H1 block is the hero, the form sits inside it, and forms["after-hero"] (the result area) follows it.
 * Prose layout: one <section class="prose"> around the copy (legal and contact pages).
 */
/** Code-made blocks that are sections themselves (a heading and their content), so they may follow a summary card. */
const SECTION_BLOCKS = ["formula", "example", "chart", "chart2", "chart3", "calculator2"];

export function renderBody(c: ContentFile, flags: Flags, blocks: Blocks, file = "content"): string {
  const fences: string[] = [];
  const text = applyFlags(c.body, flags, file)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^```[^\n]*\n([\s\S]*?)\n```[ \t]*$/gm, (_, code: string) => `\n\n\u0001${fences.push(code) - 1}\u0001\n\n`);
  if (text.includes("```")) throw new Error(`${file}: a \`\`\` block isn't closed (it needs \`\`\` on a line of its own)`);
  if (text.includes("<!--")) throw new Error(`${file}: a <!-- comment isn't closed with -->`);
  const chunks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const out: string[] = [];
  let open: "" | "plain" | "hero" | "card" | "faq" = "";
  let faqItem = false; // an FAQ answer's <details> is open
  let sawHeading = false;
  let heading = ""; // text of the current section's heading, for the "Read more" label
  let expectSummary = false; // the chunk right after a ## heading may be its summary
  const current = () => open;
  // Pass #104: the default layout's first section (the H1, its lead and notes) is the page head, with the hero's glow.
  const openSection = (kind: "plain" | "hero" = "plain") => {
    if (open) return;
    out.push(c.layout === "prose" ? `<section class="prose">` : kind === "hero" ? `<section class="hero">` : !sawHeading && c.layout === "default" ? `<section class="stack page-head">` : `<section class="stack">`);
    open = kind;
  };
  const closeSection = () => {
    if (!open) return;
    if (open === "faq" && faqItem) out.push("</div></details>");
    out.push(open === "card" ? "</div></details>\n</section>" : open === "faq" ? "</div>\n</section>" : "</section>");
    faqItem = false;
    if (open === "hero" && blocks.forms["after-hero"]) out.push(blocks.forms["after-hero"]);
    open = "";
  };

  for (const chunk of chunks) {
    const summary = chunk.match(/^summary:\s*(.+)$/s);
    if (summary) {
      if (!expectSummary || c.layout === "prose") throw new Error(`${file}: "summary:" must be the first paragraph after a ## heading`);
      expectSummary = false;
      // Turn the plain section just opened into a card: heading, summary, then everything else in <details>.
      const h2 = out.pop()!;
      out.pop(); // the <section class="stack"> opened for the heading
      const { text: sum, cls } = classes(summary[1].replace(/\s+/g, " ").trim());
      if (cls && cls !== "faq" && cls !== "open") throw new Error(`${file}: a summary can only end with {.faq} or {.open}`);
      if (cls === "open") {
        out.push(`<section class="stack section-card">`, h2, `<p class="section-summary">${inline(bindLastWords(sum), file)}</p>`);
        open = "plain"; // closes with a plain </section>
        continue;
      }
      if (cls === "faq") {
        out.push(`<section class="stack section-card">`, h2, `<p class="section-summary">${inline(bindLastWords(sum), file)}</p>`, `<div class="faq-list">`);
        open = "faq";
        continue;
      }
      out.push(`<section class="stack section-card">`, h2,
        `<p class="section-summary">${inline(bindLastWords(sum), file)}</p>`,
        `<details class="more"><summary><span class="more-word">Read more</span><span class="less-word">Show less</span><span class="visually-hidden">: ${e(heading)}</span></summary><div class="more-body">`);
      open = "card";
      continue;
    }
    expectSummary = false;
    const fence = chunk.match(/^\u0001(\d+)\u0001$/);
    if (fence) {
      openSection();
      out.push(`<pre><code>${e(fences[Number(fence[1])])}</code></pre>`);
      continue;
    }
    const form = chunk.match(/^\{\{(calculator|calculator2|formula|example|chart|chart2|chart3|explore)\}\}$/);
    if (form) {
      const key = form[1];
      if (!blocks.forms[key]) throw new Error(`${file}: {{${form[1]}}} isn't available on this page`);
      const state = current(); // read through a function: TypeScript can't see the closures change `open`
      // Pass #106: the blocks that are whole sections of their own end a card above them instead; a form can't.
      if ((state === "card" || state === "faq") && !SECTION_BLOCKS.includes(key)) throw new Error(`${file}: {{${form[1]}}} can't go inside a section with a summary`);
      if (state !== "hero" || key !== "calculator") closeSection();
      out.push(blocks.forms[key]);
      continue;
    }
    const links = chunk.match(/^\{\{(links|chips) ([^}]+)\}\}$/);
    if (links) {
      openSection();
      const items = links[2].trim().split(/\s+/);
      out.push(`<ul class="${links[1] === "chips" ? "chip-grid" : "link-grid"}">${items.map((p) => `<li><a href="${e(p)}">${e(blocks.label(p))}</a></li>`).join("")}</ul>`);
      continue;
    }
    const h = chunk.match(/^(#{1,3}) (.+)$/);
    if (h && !chunk.includes("\n")) {
      const level = h[1].length;
      if (level === 3 && current() === "faq") {
        if (faqItem) out.push("</div></details>");
        out.push(`<details class="faq"><summary><h3>${inline(bindLastWords(h[2]), file)}</h3></summary><div class="more-body">`);
        faqItem = true;
        continue;
      }
      // The first heading joins anything above it (an eyebrow line); later H1/H2s start a new section.
      if (c.layout !== "prose" && level <= 2 && sawHeading) { closeSection(); openSection(); } else openSection(c.layout === "home" && !sawHeading ? "hero" : "plain");
      sawHeading = true;
      out.push(`<h${level}>${inline(bindLastWords(h[2]), file)}</h${level}>`);
      if (level === 2) { heading = h[2].replace(/[`*]/g, ""); expectSummary = c.layout !== "prose"; }
      continue;
    }
    openSection(c.layout === "home" && !sawHeading ? "hero" : "plain");
    const lines = chunk.split("\n");
    if (lines.every((l) => /^- /.test(l))) {
      // A list may carry {.tools} at the end of any one line: each "[Label](/path): text" item shows its link
      // as a button. The ": " stays in the text for screen readers and copy-paste, hidden on screen.
      const tagged = lines.map((l) => classes(l));
      const listCls = tagged.map((t) => t.cls).filter(Boolean).join(" ");
      if (listCls && listCls !== "tools") throw new Error(`${file}: a list can only end a line with {.tools}`);
      if (listCls) {
        out.push(`<ul class="tool-list">${tagged.map(({ text: l }) => {
          const m = l.slice(2).match(/^\[([^\]]+)\]\(([^)\s]+)\):\s*(.+)$/);
          if (!m) throw new Error(`${file}: every {.tools} item must be "- [Label](/path): description"`);
          return `<li><a class="btn btn-secondary" href="${e(m[2])}">${inline(m[1], file)}</a><span class="tool-desc"><span class="visually-hidden">: </span>${inline(m[3], file)}</span></li>`;
        }).join("")}</ul>`);
      } else out.push(`<ul>${lines.map((l) => `<li>${inline(l.slice(2), file)}</li>`).join("")}</ul>`);
    } else if (lines.every((l) => /^\d+\. /.test(l))) {
      out.push(`<ol>${lines.map((l) => `<li>${inline(l.replace(/^\d+\. /, ""), file)}</li>`).join("")}</ol>`);
    } else {
      const { text: t, cls } = classes(lines.join(" "));
      out.push(`<p${cls ? ` class="${cls}"` : ""}>${inline(cls.split(" ").includes("lead") ? bindLastWords(t) : t, file)}</p>`);
    }
  }
  closeSection();
  return out.join("\n");
}
