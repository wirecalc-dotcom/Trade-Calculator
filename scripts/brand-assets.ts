// Renders the logo (variant 1, src/site/brand.ts) into the static icon files with headless Chrome:
// favicon.svg, favicon.ico (16/32/48), apple-touch-icon.png (180), icon-192.png, icon-512.png,
// site.webmanifest and og.png (1200x630). Output goes to site/static/, which the build copies.
// Run after changing the mark:  npx tsx scripts/brand-assets.ts

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../src/config";
import { BRAND, markFile } from "../src/site/brand";
import { readTokens } from "../src/site/palette";
import { Cdp, withChrome } from "./cdp";

const out = join(import.meta.dirname, "../site/static");
const PAGE = "#FFFFFF";
const TINT = readTokens().light["c-tint"]; // the site's soft panel tint (styles.css)
const NAVY = "#17161F";

async function shot(cdp: Cdp, html: string, w: number, h: number, transparent: boolean): Promise<Buffer> {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await cdp.send("Emulation.setDefaultBackgroundColorOverride", transparent ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {});
  const loaded = cdp.once("Page.loadEventFired");
  await cdp.send("Page.navigate", { url: `data:text/html;base64,${Buffer.from(`<!doctype html><html><body style="margin:0">${html}</body></html>`).toString("base64")}` });
  await loaded;
  const r = await cdp.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
  return Buffer.from(r.data, "base64");
}

/** The mark centred on a square; `pad` is the share of the side left empty around it. */
const square = (size: number, bg: string | null, pad: number) => {
  const inner = Math.round(size * (1 - pad * 2));
  return `<div style="width:${size}px;height:${size}px;display:grid;place-items:center;${bg ? `background:${bg};` : ""}">${markFile(1, { size: inner, seam: bg ?? PAGE })}</div>`;
};

/** ICO with PNG-compressed images (supported by every current browser). */
function ico(images: { size: number; png: Buffer }[]): Buffer {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach((im, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(im.size >= 256 ? 0 : im.size, e); head.writeUInt8(im.size >= 256 ? 0 : im.size, e + 1);
    head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3); head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(im.png.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += im.png.length;
  });
  return Buffer.concat([head, ...images.map((im) => im.png)]);
}

const og = `<div style="width:1200px;height:630px;box-sizing:border-box;background:${PAGE};padding:56px;font-family:'Segoe UI Variable Display','Segoe UI',system-ui,-apple-system,'Helvetica Neue',Arial,sans-serif">
  <div style="height:100%;box-sizing:border-box;background:${TINT};border-radius:24px;padding:64px 72px;display:flex;flex-direction:column;justify-content:space-between">
    <div style="display:flex;align-items:center;gap:20px;color:${NAVY};font-size:40px;font-weight:600;letter-spacing:-0.01em">${markFile(1, { size: 88, seam: TINT })}<span>${config.brandName}</span></div>
    <div style="color:${NAVY};font-size:64px;line-height:72px;font-weight:500;letter-spacing:-0.025em;max-width:900px">Electrical calculators that show their work</div>
    <div style="display:flex;gap:12px;flex-wrap:wrap">${["Voltage drop", "Conduit fill", "Wire size", "Ampacity"].map((t) => `<span style="font-size:26px;color:${NAVY};border:2px solid ${BRAND.deep};border-radius:200px;padding:8px 24px">${t}</span>`).join("")}</div>
  </div>
</div>`;

await withChrome(9342, async (cdp) => {
  writeFileSync(join(out, "favicon.svg"), `${markFile(1, { size: 32 })}\n`);
  const icoImgs = [];
  for (const size of [16, 32, 48]) icoImgs.push({ size, png: await shot(cdp, square(size, null, 0), size, size, true) });
  writeFileSync(join(out, "favicon.ico"), ico(icoImgs));
  // Apple and Android icons get the page colour behind the mark (iOS fills transparency with black).
  writeFileSync(join(out, "apple-touch-icon.png"), await shot(cdp, square(180, PAGE, 0.12), 180, 180, false));
  writeFileSync(join(out, "icon-192.png"), await shot(cdp, square(192, PAGE, 0.14), 192, 192, false));
  writeFileSync(join(out, "icon-512.png"), await shot(cdp, square(512, PAGE, 0.14), 512, 512, false));
  writeFileSync(join(out, "og.png"), await shot(cdp, og, 1200, 630, false));
});

writeFileSync(join(out, "site.webmanifest"), `${JSON.stringify({
  name: config.brandName, short_name: config.brandName, start_url: "/", display: "browser",
  background_color: PAGE, theme_color: PAGE,
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    { src: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
  ],
}, null, 2)}\n`);
console.log("wrote favicon.svg, favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png, og.png, site.webmanifest to site/static/");
