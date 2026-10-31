// Minimal Chrome DevTools Protocol client plus a headless Chrome launcher, shared by
// browser-check.ts (layout and accessibility checks) and brand-assets.ts (PNG renders).

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Cdp {
  private id = 0;
  private pending = new Map<number, (v: any) => void>();
  private listeners: ((m: any) => void)[] = [];
  constructor(private ws: WebSocket) {
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && this.pending.has(msg.id)) {
        this.pending.get(msg.id)!(msg);
        this.pending.delete(msg.id);
      } else for (const l of this.listeners) l(msg);
    });
  }
  static async connect(url: string) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.addEventListener("open", res); ws.addEventListener("error", rej); });
    return new Cdp(ws);
  }
  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result))));
  }
  once(method: string, timeoutMs = 20000): Promise<any> {
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error(`timeout waiting for ${method}`)), timeoutMs);
      const l = (m: any) => { if (m.method === method) { clearTimeout(t); this.listeners = this.listeners.filter((x) => x !== l); res(m.params); } };
      this.listeners.push(l);
    });
  }
  async eval<T>(expression: string): Promise<T> {
    const r = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`eval failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value as T;
  }
  close() { this.ws.close(); }
}

/** Starts headless Chrome, opens one tab, and hands its CDP session to `fn`. Always cleans up. */
export async function withChrome<T>(port: number, fn: (cdp: Cdp) => Promise<T>): Promise<T> {
  const profile = mkdtempSync(join(tmpdir(), "ec-chrome-"));
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  try {
    let target: any;
    for (let i = 0; i < 50 && !target; i++) {
      try { target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json(); } catch { await sleep(200); }
    }
    if (!target) throw new Error("Chrome didn't start");
    const cdp = await Cdp.connect(target.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    try { return await fn(cdp); } finally { cdp.close(); }
  } finally {
    chrome.kill();
    await sleep(300);
    rmSync(profile, { recursive: true, force: true });
  }
}

/**
 * Pass #92: which seeded fixture account the next mock-Google sign-in is (scripts/seed-fixtures.ts, scripts/mock-google.ts
 * /as): "subscriber" (an active Watch, 1 of 5) or "free" (no subscription). Throws when the mock isn't running.
 */
export async function mockSignInAs(who: string, mock = process.env.MOCK_GOOGLE_URL ?? "http://127.0.0.1:8790"): Promise<string> {
  const r = await fetch(`${mock}/as?who=${encodeURIComponent(who)}`);
  if (!r.ok) throw new Error(`mock Google /as?who=${who}: HTTP ${r.status} (seeded with scripts/seed-fixtures.ts?)`);
  return ((await r.json()) as { email: string }).email;
}
