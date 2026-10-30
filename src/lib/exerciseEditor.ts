/**
 * What the exercise editor shows, and where (redesign #17) — the layout's
 * decisions, kept out of the screen so they can be asked questions.
 *
 * ── WEIGHT, IN PLAIN WORDS ────────────────────────────────────────────────
 *
 * `Load mode: External / Added / Assisted` was the data model's vocabulary on
 * the screen: three words that each needed the other two to explain them. The
 * list is now titled `Weight` and every choice carries an exercise you already
 * know, because "e.g. pull-up with a belt" answers in one glance what
 * `added_bodyweight` never did. A radio list rather than a segmented control so
 * the examples have somewhere to go.
 *
 * ── ADVANCED ──────────────────────────────────────────────────────────────
 *
 * Name, rest and cue are what nearly everybody edits; the rep ladder, `Reps to
 * MAX`, the increment and the overload rows are what a few people set once. They
 * sit under one collapsed `Advanced` row whose sub-line NAMES them, so a setting
 * folded away is still a setting you can see exists. Which rows are in it follows
 * the exercise's shape — the same conditions the screen always rendered them
 * under — so the summary never lists a row that will not be there when it opens.
 */

import { supportsLadder } from './repLadder';
import type { ExerciseDraft } from './exerciseDraft';
import type { LoadMode } from '../types/models';

/** One `Weight` choice. `label` and `example` are catalogue keys. */
export interface WeightChoice {
  value: LoadMode;
  label: string;
  example: string;
}

/** The three loads a weighted exercise can have, in the order they are offered. */
export const WEIGHT_CHOICES: readonly WeightChoice[] = [
  {
    value: 'external',
    label: 'Plates or machine',
    example: 'e.g. barbell squat, leg press, cable row',
  },
  {
    value: 'added_bodyweight',
    label: 'Bodyweight + extra',
    example: 'e.g. pull-up with a belt, weighted dip',
  },
  {
    value: 'assisted',
    label: 'Assisted',
    example: 'e.g. band or machine pull-up — less is harder',
  },
];

export type AdvancedRow = 'ladder' | 'max' | 'increment' | 'overload';

/**
 * The rows under `Advanced`, in the order they render.
 *
 *  • `ladder` and `max` — rep-counted work only (`supportsLadder`).
 *  • `increment` — only with a weight to add to.
 *  • `overload` — the stated-not-hidden `Overload nudges: off` row, which exists
 *    when there is no nudge to give: a ladder owns the reps, or there is no load.
 *    A weighted exercise without a ladder has nudges ON and no row to show it.
 */
export function advancedRows(draft: ExerciseDraft): AdvancedRow[] {
  const rows: AdvancedRow[] = [];
  if (supportsLadder(draft.countUnit)) rows.push('ladder', 'max');
  if (draft.requiresWeight) rows.push('increment');
  if (draft.ladderOn || !draft.requiresWeight) rows.push('overload');
  return rows;
}

const ROW_LABEL: Record<AdvancedRow, string> = {
  ladder: 'Rep ladder',
  max: 'Reps to MAX',
  increment: 'Increment',
  overload: 'Overload nudges',
};

/** The catalogue key naming each row, for the `Advanced` sub-line. */
export function advancedLabels(draft: ExerciseDraft): string[] {
  return advancedRows(draft).map((row) => ROW_LABEL[row]);
}
