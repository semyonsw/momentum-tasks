/**
 * The two roots, and how the app moves between them.
 *
 *   Tasks · Settings
 *
 * ── WHY THE ORDER IS A CONSTANT AND NOT A TAB BAR DETAIL ───────────────────
 *
 * The order is more than layout: a slide between the two goes the way the
 * bar's blob does (`navigation/ShellStage.tsx`), and the spare is built from it
 * (`lib/stageBuilds.ts`). Two places deciding what comes after `Tasks` is two
 * places for them to disagree, so the order lives here and all of them read it.
 */

export const SECTIONS = ['Tasks', 'Settings'] as const;

export type SectionTab = (typeof SECTIONS)[number];

/* ══════════════════════════════════════════════════════════════════════════
   THE TASKS AND SETTINGS — and the gestures between them.

       Tasks ◀──tap nav / back──▶ Settings
        │  ▲
        push  back / edge
        ▼  │
     Inner screen

   The tasks ARE the landing — the thing you open the app to see — so they are
   the root, Back on them arms the exit, and a route is exactly a section.
   ══════════════════════════════════════════════════════════════════════════ */

export type ShellRoute = SectionTab;

/** Where the app opens, and where Back from Settings lands. */
export const ROOT: SectionTab = 'Tasks';

/**
 * The nav bar's slot centres, as fractions of the bar's width: evenly spaced,
 * each in the middle of its own share — the halves of the bar, each glyph
 * centred in the half it owns. Fractions, so a 340 dp bar keeps its proportions.
 */
export const NAV_SLOTS: Record<SectionTab, number> = Object.fromEntries(
  SECTIONS.map((section, i) => [section, (i + 0.5) / SECTIONS.length]),
) as Record<SectionTab, number>;

/**
 * Which way a switch slides: +1 when `to` is to the RIGHT of `from` on the bar,
 * so the screen goes the way the blob does.
 */
export function slideDir(from: SectionTab, to: SectionTab): 1 | -1 {
  return SECTIONS.indexOf(to) < SECTIONS.indexOf(from) ? -1 : 1;
}

/** Half the lit blob's width at rest, in dp. */
export const BLOB_HALF = 30;

/** The edge that starts a back-swipe on a pushed screen. */
export const EDGE_BACK_PX = 44;

/** Released edge-swipe: pop past 120 dp or a flick faster than 0.6 px/ms. */
export function edgeBackCommits(dx: number, vx: number): boolean {
  return dx > 120 || vx > 0.6;
}

/** How long a first back press on the root keeps the second one armed. */
export const EXIT_WINDOW_MS = 2000;

export type BackAction = 'closeSheet' | 'pop' | 'root' | 'armExit' | 'exit';

/**
 * Android back, in the design's order: a sheet closes first, then a pushed
 * screen pops, then Settings goes back to the tasks (`root`), and on the tasks
 * the first press arms an exit (a toast says so) and a second within two
 * seconds leaves. `exitArmedAt` is when the last press armed it, or null.
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
  if (state.route !== ROOT) return 'root';
  if (state.exitArmedAt != null && state.now - state.exitArmedAt <= EXIT_WINDOW_MS) return 'exit';
  return 'armExit';
}
