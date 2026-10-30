/**
 * Moving a set within an exercise — edit mode's ⋮⋮ (redesign #3).
 *
 *   W ✓   80 ✓   80 ·   80 ·   75 ·
 *   └─ history ─┘└── can be rearranged ──┘
 *
 * ── WHAT MAY MOVE ──────────────────────────────────────────────────────────
 *
 * Only UNLOGGED rows, and only among the unlogged rows BELOW the last logged
 * one. A logged set is history: the order it happened in is a fact, and the rest
 * timer, the ladder's top set and the warm-up offer all read that order. A plan
 * row can go anywhere in the part of the card that has not happened yet.
 *
 * REJECTED: a finger drag inside the card. The card already owns two gestures
 * (the header's hold lifts the whole card; the rows scroll the session), and a
 * third nested one under a sweaty thumb is the kind of control that fires by
 * accident. Tap ⋮⋮ to lift, tap ⋮⋮ where it goes: two deliberate taps.
 */

import { moveToIndex } from './reorder';
import type { ID } from '../types/models';

/** The `[from, to]` index range of rows that may move, or null when fewer than two can. */
export function movableRange(
  sets: readonly { isCompleted: boolean }[],
): readonly [number, number] | null {
  let lastLogged = -1;
  sets.forEach((s, i) => {
    if (s.isCompleted) lastLogged = i;
  });
  const from = lastLogged + 1;
  const to = sets.length - 1;
  return to - from >= 1 ? [from, to] : null;
}

/** True when this row can be lifted. */
export function canMoveSet(
  sets: readonly { localId: ID; isCompleted: boolean }[],
  setId: ID,
): boolean {
  const range = movableRange(sets);
  const at = sets.findIndex((s) => s.localId === setId);
  return range != null && at >= range[0] && at <= range[1];
}

/**
 * The rows with `setId` at `toIndex` — the SAME array when the move is not
 * allowed (a logged row, a target in history, an unknown id) or changes nothing.
 */
export function moveSetTo<T extends { localId: ID; isCompleted: boolean }>(
  sets: readonly T[],
  setId: ID,
  toIndex: number,
): readonly T[] {
  const range = movableRange(sets);
  const from = sets.findIndex((s) => s.localId === setId);
  if (!range || from < range[0] || from > range[1]) return sets;
  const target = Math.min(Math.max(Math.round(toIndex), range[0]), range[1]);
  if (target === from) return sets;
  return moveToIndex(sets, (s) => s.localId === setId, target);
}
