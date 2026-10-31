// Pass #74: offer_view counts offers actually seen. The browser logs offer_render when it builds an offer box (what
// offer_view meant before 27 October 2026), and offer_view once that box has been at least half on screen for one
// continuous second. Pure logic, so it can be tested without a browser; src/client/app.ts feeds it an
// IntersectionObserver.

/** The day offer_view started meaning "seen" (ET); before it, offer_view was logged when the box was built. */
export const OFFER_SEEN_SINCE = "2026-10-27";
/** The pass #74 deploy (version 19864d2f, 2026-10-27T17:43:42.537Z): offer_view rows before it were logged when the box was built. */
export const OFFER_SEEN_TS = 1793123022537;
/** How much of the box has to be on screen, and for how long without a break. */
export const SEEN_RATIO = 0.5;
export const SEEN_MS = 1000;
/** IntersectionObserver thresholds: every 5%, so a tall box's share of the screen is followed closely enough. */
export const SEEN_THRESHOLDS = Array.from({ length: 21 }, (_, i) => i / 20);

/** The parts of an IntersectionObserverEntry this needs (no DOM types on the Worker side). */
export interface SeenEntry {
  isIntersecting: boolean;
  intersectionRatio: number;
  intersectionRect: { height: number };
  rootBounds: { height: number } | null;
}

/**
 * Half or more of the box is on screen. A box taller than twice the screen can never be half on screen, so it
 * counts once it fills half the screen's height.
 */
export function halfOnScreen(e: SeenEntry): boolean {
  if (!e.isIntersecting) return false;
  if (e.intersectionRatio >= SEEN_RATIO) return true;
  return !!e.rootBounds && e.rootBounds.height > 0 && e.intersectionRect.height >= e.rootBounds.height * SEEN_RATIO;
}

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(id: unknown): void;
}
const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>) };

export interface SeenTimer {
  /** On screen (true) or not (false) right now; repeats of the same value change nothing. */
  update(onScreen: boolean): void;
  /** Stops for good without firing (the box was removed). */
  stop(): void;
  readonly done: boolean;
}

/** Calls onSeen once, when update(true) has held for `ms` with no update(false) in between. */
export function seenTimer(onSeen: () => void, timers: Timers = realTimers, ms = SEEN_MS): SeenTimer {
  let id: unknown = null;
  let done = false;
  const cancel = () => { if (id !== null) timers.clear(id); id = null; };
  return {
    update(onScreen) {
      if (done) return;
      if (!onScreen) return cancel();
      if (id !== null) return;
      id = timers.set(() => { id = null; done = true; onSeen(); }, ms);
    },
    stop() { cancel(); done = true; },
    get done() { return done; },
  };
}
