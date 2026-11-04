/**
 * The four sections, and how an app built from this tree moves between the ones
 * it has.
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
 *
 * Since 3.0.0 no APK shows all four: each app is ONE content section plus
 * Settings (`lib/appVariant.ts`), and every decision below takes that pair as a
 * parameter rather than reading the build's variant, so the tests can walk all
 * three apps without an env var. `SECTIONS` stays the full list because it is
 * the vocabulary — the order a subset is drawn in — not what any one bar shows.
 */

import { variantSection, type AppVariant } from './appVariant';

export const SECTIONS = ['Workout', 'Tasks', 'Expenses', 'Settings'] as const;

export type SectionTab = (typeof SECTIONS)[number];

/* ══════════════════════════════════════════════════════════════════════════
   ONE SECTION AND SETTINGS — and the gestures between them.

     Section ◀──tap nav / back──▶ Settings
        │  ▲
        push  back / edge
        ▼  │
     Inner screen

   There used to be a landing above the four (2.0–2.10): three tiles and a
   raised Home button in the middle of the bar, which only made sense while one
   app held three logs. With one log per app the section IS the landing — the
   thing you open the app to see — so it is the root, Back on it arms the exit,
   and a route is exactly a section.
   ══════════════════════════════════════════════════════════════════════════ */

export type ShellRoute = SectionTab;

/** Where an app opens, and where Back from anywhere else in it lands. */
export function shellRoot(variant: AppVariant): SectionTab {
  return variantSection(variant);
}

/**
 * The nav bar's slot centres for the sections it shows, as fractions of the
 * bar's width: evenly spaced, each in the middle of its own share.
 *
 * Two slots land at 1/4 and 3/4 — the halves of the bar, each glyph centred in
 * the half it owns. The old layout drew four at 44 · 110 | 258 · 324 of 368 dp
 * around the raised Home button; reusing two of those positions would leave a
 * hole in the middle where a button used to be, which reads as something
 * missing rather than as a two-item bar. Fractions, so a 340 dp bar keeps its
 * proportions.
 */
export function navSlots(sections: readonly SectionTab[]): Partial<Record<SectionTab, number>> {
  const slots: Partial<Record<SectionTab, number>> = {};
  sections.forEach((section, i) => {
    slots[section] = (i + 0.5) / sections.length;
  });
  return slots;
}

/**
 * Which way a switch slides: +1 when `to` is to the RIGHT of `from` on the bar
 * the app actually draws, so the screen goes the way the blob does.
 */
export function slideDir(
  sections: readonly SectionTab[],
  from: SectionTab,
  to: SectionTab,
): 1 | -1 {
  return sections.indexOf(to) < sections.indexOf(from) ? -1 : 1;
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
 * screen pops, then Settings goes back to the app's own section (`root`), and
 * on that section the first press arms an exit (a toast says so) and a second
 * within two seconds leaves.
 *
 * `root` is `shellRoot(variant)`, passed in rather than read here so a test can
 * stand in any of the three apps. `exitArmedAt` is when the last press armed
 * it, or null.
 */
export function backAction(state: {
  sheetOpen: boolean;
  stackDepth: number;
  route: ShellRoute;
  root: ShellRoute;
  exitArmedAt: number | null;
  now: number;
}): BackAction {
  if (state.sheetOpen) return 'closeSheet';
  if (state.stackDepth > 0) return 'pop';
  if (state.route !== state.root) return 'root';
  if (state.exitArmedAt != null && state.now - state.exitArmedAt <= EXIT_WINDOW_MS) return 'exit';
  return 'armExit';
}
