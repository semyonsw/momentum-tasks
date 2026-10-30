/**
 * What can be found without being told (U11, U15, U23, U24).
 *
 * Four rules, and each one is a decision about where a control is SEEN, not
 * about what it does — every action here existed before this file did.
 *
 * ── A LONG PRESS ALWAYS HAS A MARK ────────────────────────────────────────
 *
 * Holding is the app's gesture for "the other thing about this" (a category's
 * own screen, renaming a subsection, moving a card, the die's options), and it
 * was invisible: nothing on a chip or a tile said a hold would do anything. So
 * every surface that answers a hold now carries a mark, and where the mark can
 * be a target it IS one, opening exactly what the hold opens:
 *
 *   • the SELECTED account chip shows `⋯`; tapping it opens what the hold
 *     opens — the account's own edit sheet, whose danger zone holds `Archive`
 *     (redesign §6: Archive lives on the item's own surface and nowhere else,
 *     so the menu that used to offer it beside `Edit` had one row left, and a
 *     one-row menu is a tap in the way);
 *   • every task row shows `⋯`; tapping it opens the row's menu, the sheet the
 *     hold opens (redesign #19);
 *   • a category tile shows `›`; tapping it opens the category, as the hold does,
 *     and the tile itself still records an amount — the common act keeps the
 *     big target;
 *   • the die shows a `⋮` beside it that opens the options sheet;
 *   • a reorderable exercise card shows a grip. That one is only a mark: a
 *     reorder is a drag, and a drag cannot be started by a tap.
 *
 * Only the SELECTED chip gets the `⋯`. On every chip it would be six identical
 * marks in a row of six names, and the one you are editing is nearly always the
 * one you are reading. The others still answer a hold.
 *
 * `holdActions` and `cueActions` are two functions on purpose, though for now
 * they agree everywhere: the screens open their menus through them, and the
 * test that asserts they agree is what stops a later row being added to one
 * gesture and not the other. Rejected: an "ⓘ hold for more" hint line under each
 * surface (a sentence nobody reads twice, on every screen) and moving the hold
 * actions to a settings screen (further from the thing they act on).
 *
 * ── DELETE IS A MODE IN THE PICKER, NOT A MARK ON EVERY ROW ───────────────
 *
 * The add-exercise picker drew a `−` on every row, and in a list you are PICKING
 * from, a minus reads as "deselect". Deleting an exercise is the rare act and
 * edits every routine holding it, so it moved behind an `Edit` in the header:
 * while editing, each row shows a bin and a tap on the row picks nothing; out of
 * it, rows only pick. The confirmation sheet is unchanged — it is the parent's,
 * and it already asks (an exercise delete is not undoable from a toast, because
 * it reaches into routines).
 *
 * ── ONE DOOR FOR ROUTINES AND EXERCISES ───────────────────────────────────
 *
 * The workout corner had ≡ and 📖, two unlabelled glyphs that look alike and
 * lead to two halves of one question — "what can I train". They are one
 * destination now, `Routines & exercises`, with a Routines | Exercises switch in
 * its header; the corner reads ✦, that door, then ⟲ last. Rejected: one long
 * screen with both lists (the library is a tree you open and would push the
 * routines a screen away from their own header), and keeping two glyphs with
 * captions (the corner is icons only, see `SectionTopBar`).
 *
 * ── A SECTION'S SETTINGS ARE AT THE FOOT OF ITS HISTORY ───────────────────
 *
 * The settings that shape a section (rest times, the trend range, the default
 * direction) were reachable only from Settings → a row. The history is where
 * you notice one of them is wrong, so its foot carries `Settings ›`.
 */

import type { AiSection } from './ai/aiSchema';

/** The three sections with a history and a settings screen of their own. */
type Section = AiSection;

/* ------------------------------------------------------------------ */
/* The add-exercise picker and the library (U15)                       */
/* ------------------------------------------------------------------ */

/** What one exercise row offers. */
export interface ExerciseRowControls {
  /** A tap on the row picks it (adds it, or opens it in the library). */
  pick: boolean;
  /** The bin at the row's end. */
  remove: boolean;
}

/**
 * Out of edit mode a row only picks; in it, a row only deletes. Never both: a
 * pick and a delete one mis-tap apart is the thing this replaces.
 */
export function exerciseRowControls(editing: boolean): ExerciseRowControls {
  return editing ? { pick: false, remove: true } : { pick: true, remove: false };
}

/* ------------------------------------------------------------------ */
/* Long-press surfaces and their visible marks (U11)                   */
/* ------------------------------------------------------------------ */

export type HoldSurface =
  'moneyAccount' | 'moneyCategory' | 'exerciseCard' | 'routineDie' | 'taskRow';

export const HOLD_SURFACES: readonly HoldSurface[] = [
  'moneyAccount',
  'moneyCategory',
  'exerciseCard',
  'routineDie',
  'taskRow',
];

export type HoldAction =
  /** The account's own sheet: its name, its glyph and its danger zone. */
  | 'editAccount'
  /** The category's own screen. */
  | 'openCategory'
  /** Lift the card and slide it. */
  | 'reorder'
  /** The die's "what goes in it" sheet. */
  | 'dieOptions'
  /** The task row's menu — its rows are `lib/taskTap.ts`'s. */
  | 'taskMenu';

/** What the surface needs to know to decide its rows. */
export interface HoldContext {
  /** Live accounts. No hold row depends on it now; see `canArchiveAccount`. */
  liveAccounts?: number;
}

/** What holding the surface offers, in menu order. */
// `context` is kept in the signature: the test that holds the mark and the
// hold to the same rows runs every surface through the same contexts.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function holdActions(surface: HoldSurface, context: HoldContext = {}): HoldAction[] {
  switch (surface) {
    case 'moneyAccount':
      return ['editAccount'];
    case 'moneyCategory':
      return ['openCategory'];
    case 'exerciseCard':
      return ['reorder'];
    case 'routineDie':
      return ['dieOptions'];
    case 'taskRow':
      return ['taskMenu'];
  }
}

/**
 * Whether an account's danger zone offers `Archive`. Only while ANOTHER live
 * account exists: every amount names an account, so the last live one has
 * nowhere to hand its money to (the store refuses it too). Delete is never
 * offered — the store has no delete, and an account's amounts are in every
 * total they ever reached.
 */
export function canArchiveAccount(liveAccounts: number): boolean {
  return liveAccounts > 1;
}

/** The glyph that says "this answers a hold". */
export type HoldCue = 'more' | 'chevron' | 'grip' | 'options';

export function holdCue(surface: HoldSurface): HoldCue {
  switch (surface) {
    case 'moneyAccount':
      return 'more';
    case 'moneyCategory':
      return 'chevron';
    case 'exerciseCard':
      return 'grip';
    case 'routineDie':
      return 'options';
    case 'taskRow':
      return 'more';
  }
}

/**
 * Whether the mark is a target. A grip is not: a reorder is a drag, and a tap
 * cannot start one.
 */
export function cueIsTappable(surface: HoldSurface): boolean {
  return holdCue(surface) !== 'grip';
}

/**
 * What tapping the mark offers — the hold's actions, every one of them, or
 * nothing for a mark that is not a target.
 */
export function cueActions(surface: HoldSurface, context: HoldContext = {}): HoldAction[] {
  return cueIsTappable(surface) ? holdActions(surface, context) : [];
}

/* ------------------------------------------------------------------ */
/* The workout corner and its merged destination (U23)                */
/* ------------------------------------------------------------------ */

/** The workout corner, left to right, before the ⟲ (which is always last). */
export const WORKOUT_CORNER = ['ai', 'library'] as const;

/** The two halves of `Routines & exercises`. */
export type LibraryTab = 'routines' | 'exercises';

export const LIBRARY_TABS: readonly LibraryTab[] = ['routines', 'exercises'];

/** The pushed route each half is. The switch replaces one with the other. */
export function libraryTabRoute(tab: LibraryTab): 'routines' | 'library' {
  return tab === 'routines' ? 'routines' : 'library';
}

/* ------------------------------------------------------------------ */
/* Settings at the foot of each history (U24)                          */
/* ------------------------------------------------------------------ */

export type SectionSettingsRoute = 'workoutSettings' | 'taskSettings' | 'moneySettings';

/** The settings screen a section's history leads to. */
export function sectionSettingsRoute(section: Section): SectionSettingsRoute {
  switch (section) {
    case 'Workout':
      return 'workoutSettings';
    case 'Tasks':
      return 'taskSettings';
    case 'Expenses':
      return 'moneySettings';
  }
}
