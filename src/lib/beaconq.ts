// Pass #114: events the browser couldn't send. When sendBeacon refuses an event and the fetch fallback fails too, the event
// waits in session storage (ec_q, this tab only) and goes again with the next event, or on the next page of the visit, marked
// retry = 1. At most QUEUE_CAP wait (the oldest go first) and each is tried QUEUE_TRIES more times. Pure logic, used by
// src/client/app.ts.

export const QUEUE_CAP = 50;
export const QUEUE_TRIES = 3;

/** A waiting event: its JSON body and how many resends have failed. */
export interface Queued { body: string; tries: number }

/** The queue with this event added (or put back after a failed resend), or without it once it's out of tries. */
export function enqueue(q: Queued[], body: string, tries = 0): Queued[] {
  if (tries >= QUEUE_TRIES) return q;
  return [...q, { body, tries }].slice(-QUEUE_CAP);
}

/** Everything waiting, each body marked retry = 1, to send now; the queue is then empty until a resend fails. */
export function drain(q: Queued[]): Queued[] {
  return q.flatMap((x) => {
    try {
      const o = JSON.parse(x.body) as Record<string, unknown>;
      return o && typeof o === "object" ? [{ body: JSON.stringify({ ...o, retry: 1 }), tries: x.tries }] : [];
    } catch { return []; }
  });
}

/** A stored queue (session storage text), or an empty one. */
export function parseQueue(text: string | null): Queued[] {
  try {
    const q = JSON.parse(text ?? "[]");
    return Array.isArray(q) ? q.filter((x): x is Queued => typeof x?.body === "string" && typeof x?.tries === "number").slice(-QUEUE_CAP) : [];
  } catch { return []; }
}
