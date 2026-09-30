/**
 * The four sections, in the nav bar's order.
 *
 *   Workout · Tasks · Expenses · Settings
 *
 * ── WHY THE ORDER IS A CONSTANT AND NOT A TAB BAR DETAIL ───────────────────
 *
 * The order is more than layout: a slide between two sections goes the way the
 * bar's blob does (`navigation/ShellStage.tsx`), and the spares are built
 * nearest-first along it (`lib/stageBuilds.ts`). Two places deciding what comes
 * after `Tasks` is two places for them to disagree, so the order lives here and
 * all of them read it.
 */

export const SECTIONS = ['Workout', 'Tasks', 'Expenses', 'Settings'] as const;

export type SectionTab = (typeof SECTIONS)[number];

/* ══════════════════════════════════════════════════════════════════════════
   MOMENTUM — a landing above the four, and the gestures between them.

     Home ──tap tile──▶ Section ──push──▶ Inner screen
       ▲                  │  ▲                │
       └──Home btn / back─┘  └──back / edge───┘
     Section ◀──tap nav──▶ Section

   Home is not a fifth section: it is not a nav slot (the raised button in the
   middle of the bar is how you get back to it). That is why it is a separate
   member of `ShellRoute` rather than an entry in `SECTIONS`.
   ══════════════════════════════════════════════════════════════════════════ */

export type ShellRoute = 'Home' | SectionTab;

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
