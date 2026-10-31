// dnsmailcheck pass #92: every rule that makes traffic "internal" (ours, left out of /admin/stats and /admin/clicks), in one place.
// Callers ask here; nobody writes their own test. (dnsmailcheck's rules 3 and 4, internal Stripe customers and fixture accounts,
// have nothing to apply to here: no payments, no accounts.)
//  1. Test-tagged links: utm_source=test, or utm_campaign starting test- (marked on every event in eventInsert).
//  2. The signed internal cookie (__Host-wc_internal, HMAC with ADMIN_SECRET): set from /admin/internal.
// tests/unit/tracking.test.ts checks both.

import type { EventRow } from "./events";
import { readCookie, setCookie } from "./http";

export const INTERNAL_RULES = [
  "utm_source=test or utm_campaign test-*",
  "the internal cookie (/admin/internal)",
] as const;

/** Rule 1: our own test links. */
export const isTestTagged = (r: Pick<Partial<EventRow>, "utm_source" | "utm_campaign"> | { utm_source?: string | null; utm_campaign?: string | null }): boolean =>
  r.utm_source === "test" || /^test-/.test(r.utm_campaign ?? "");

// ---------- rule 2: the internal cookie ----------

export const INTERNAL_COOKIE = "__Host-wc_internal";
const INTERNAL_DAYS = 400; // the most a browser keeps a cookie

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`internal:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The Set-Cookie header that marks this browser as internal: "<issued ms>.<hmac>". maxDays: shorter for a smoke session. */
export async function internalCookie(secret: string, now = Date.now(), maxDays = INTERNAL_DAYS): Promise<string> {
  const issued = String(now);
  return setCookie(INTERNAL_COOKIE, `${issued}.${await hmac(secret, issued)}`, Math.round(maxDays * 86_400));
}

export const clearInternalCookie = () => setCookie(INTERNAL_COOKIE, "", 0);

/** True when the request carries a valid internal cookie. Changing ADMIN_SECRET invalidates every one. */
export async function isInternal(request: Request, secret: string | undefined): Promise<boolean> {
  if (!secret) return false;
  const v = readCookie(request, INTERNAL_COOKIE);
  const m = v?.match(/^(\d{10,16})\.([0-9a-f]{64})$/);
  if (!m) return false;
  const want = await hmac(secret, m[1]);
  let d = 0;
  for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ m[2].charCodeAt(i);
  return d === 0;
}
