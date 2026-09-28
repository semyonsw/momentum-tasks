/**
 * The four sections, and what a swipe does to them.
 *
 *   ‹ Workout · Tasks · Expenses · Settings ›
 *
 * ── WHY THE ORDER IS A CONSTANT AND NOT A TAB BAR DETAIL ───────────────────
 *
 * A horizontal swipe moves one section left or right, which means the bar's
 * left-to-right order is now a GESTURE, not a layout. Two places deciding what
 * comes after `Tasks` — the bar's array and the pager's — is two places for them
 * to disagree, and a swipe that lands somewhere the bar does not highlight is the
 * kind of bug nobody can describe. So the order lives here, both read it, and the
 * step is a pure function over it.
 *
 * ── IT CLAMPS, IT DOES NOT WRAP ────────────────────────────────────────────
 *
 * Swiping left on the first section stays on the first section. Wrapping would
 * make the ends of the app adjacent, so a flick past `Workout` would land on
 * `Settings` — the two screens with the least to do with each other — and the
 * gesture would stop meaning "the next one along".
 */

export const SECTIONS = ['Workout', 'Tasks', 'Expenses', 'Settings'] as const;

export type SectionTab = (typeof SECTIONS)[number];

/**
 * One section along, or the same one at the end of the row.
 *
 * `delta` is +1 for a swipe that pulls the content leftwards (the NEXT section,
 * the way a page turns) and −1 for the other direction. An unknown current tab
 * answers with the first section rather than throwing: a persisted tab name from
 * an older build is a thing that happens, and landing on `Workout` is right.
 */
export function stepSection(current: SectionTab, delta: 1 | -1): SectionTab {
  const at = SECTIONS.indexOf(current);
  if (at === -1) return SECTIONS[0];
  const next = Math.min(Math.max(at + delta, 0), SECTIONS.length - 1);
  return SECTIONS[next];
}

/* ══════════════════════════════════════════════════════════════════════════
   MOMENTUM — a landing above the four, and the gestures between them.

     Home ──tap tile──▶ Section ──push──▶ Inner screen
       ▲                  │  ▲                │
       └──Home btn / back─┘  └──back / edge───┘
     Section ◀─swipe / tap nav─▶ Section

   Home is not a fifth section: it is not on the swipe row and not a nav slot
   (the raised button in the middle of the bar is how you get back to it). That
   is why it is a separate member of `ShellRoute` rather than an entry in
   `SECTIONS` — a swipe from Workout must not land on the landing.
   ══════════════════════════════════════════════════════════════════════════ */

export type ShellRoute = 'Home' | SectionTab;

/** A route this build knows, or Home — the default landing. */
export function usableRoute(value: unknown): ShellRoute {
  return value === 'Home' || SECTIONS.includes(value as SectionTab)
    ? (value as ShellRoute)
    : 'Home';
}

/**
 * The nav bar's four slot centres, as fractions of the bar's width.
 *
 * The design draws them at 44 · 110 | 258 · 324 in a 368 dp bar: two slots
 * either side of the raised Home button, and the gap in the middle is the
 * button's. Fractions, so a 340 dp bar on a small phone keeps the button's gap
 * rather than the slots drifting under it.
 */
export const NAV_SLOTS: Record<SectionTab, number> = {
  Workout: 44 / 368,
  Tasks: 110 / 368,
  Expenses: 258 / 368,
  Settings: 324 / 368,
};

/** Half the lit blob's width at rest, in dp. */
export const BLOB_HALF = 30;
/** How far the blob stretches mid-way between two slots. */
export const BLOB_STRETCH = 16;

/**
 * The blob mid-swipe: where its two edges are when the finger is `progress` of
 * the way (0–1) from one slot to the next. It STRETCHES — half-width
 * `30 + 16·sin(πp)` — so the pane reads as liquid being pulled rather than a
 * rectangle being slid, and lands at its resting width on either end.
 */
export function blobEdges(
  fromCentre: number,
  toCentre: number,
  progress: number,
): { left: number; right: number } {
  const p = Math.min(Math.max(progress, 0), 1);
  const centre = fromCentre + (toCentre - fromCentre) * p;
  const half = BLOB_HALF + BLOB_STRETCH * Math.sin(Math.PI * p);
  return { left: centre - half, right: centre + half };
}

/** |dx| past this, and past 1.3× |dy|, and the swipe owns the finger. */
export const SWIPE_LOCK_PX = 10;
export const SWIPE_DOMINANCE = 1.3;

export function isHorizontalSwipe(dx: number, dy: number): boolean {
  return Math.abs(dx) > SWIPE_LOCK_PX && Math.abs(dx) > SWIPE_DOMINANCE * Math.abs(dy);
}

/**
 * How far the screen follows the finger: 0.55 of the drag, and 0.22 of it
 * where there is nothing further along to go — a rubber band that says "this
 * is the end" instead of a screen that ignores the finger.
 */
export function swipeFollow(dx: number, current: SectionTab): number {
  const at = SECTIONS.indexOf(current);
  const pastEnd = (dx > 0 && at <= 0) || (dx < 0 && at >= SECTIONS.length - 1);
  return dx * (pastEnd ? 0.22 : 0.55);
}

/**
 * What a released section swipe does: −1 / +1 to step, or 0 to spring back.
 * A drag past 90 dp commits, and so does a flick faster than 0.5 px/ms that is
 * short — a quick flick is as clear an answer as a long drag.
 *
 * `dx` < 0 is the content pulled left, which is the NEXT section.
 */
export function swipeDecision(dx: number, vx: number, current: SectionTab): -1 | 0 | 1 {
  const committed = Math.abs(dx) > 90 || Math.abs(vx) > 0.5;
  if (!committed || dx === 0) return 0;
  const delta: 1 | -1 = dx < 0 ? 1 : -1;
  return stepSection(current, delta) === current ? 0 : delta;
}

/** The edge that starts a back-swipe on a pushed screen. */
export const EDGE_BACK_PX = 44;

/** Released edge-swipe: pop past 120 dp or a flick faster than 0.6 px/ms. */
export function edgeBackCommits(dx: number, vx: number): boolean {
  return dx > 120 || vx > 0.6;
}

/** How long a first back press on Home keeps the second one armed. */
export const EXIT_WINDOW_MS = 2000;

export type BackAction = 'closeSheet' | 'pop' | 'home' | 'armExit' | 'exit';

/**
 * Android back, in the order the design gives it: a sheet closes first, then a
 * pushed screen pops, then a section goes Home, and on Home the first press
 * arms an exit (a toast says so) and a second within two seconds leaves.
 *
 * `exitArmedAt` is when the last press armed it, or null.
 */
export function backAction(state: {
  sheetOpen: boolean;
  stackDepth: number;
  route: ShellRoute;
  exitArmedAt: number | null;
  now: number;
}): BackAction {
  if (state.sheetOpen) return 'closeSheet';
  if (state.stackDepth > 0) return 'pop';
  if (state.route !== 'Home') return 'home';
  if (state.exitArmedAt != null && state.now - state.exitArmedAt <= EXIT_WINDOW_MS) return 'exit';
  return 'armExit';
}
