/**
 * The training sequence's step rows, as decisions rather than JSX (redesign #18).
 *
 * Two of them, both small, both the kind that is wrong by one and looks fine:
 *
 *  • A DRAG IS A RUN OF SWAPS. The store moves a step one place at a time
 *    (`moveSequenceStep`), and that is the only reorder it knows — the one that
 *    keeps the cursor on the step it was on. A drag from 1 to 4 is therefore three
 *    swaps, in order, each from where the previous one left the step. Writing a
 *    second, whole-list reorder into the store would be a second piece of cursor
 *    arithmetic to keep in agreement with the first.
 *  • THE ROW'S ID IS ITS POSITION. Steps repeat (`push → pull → push`), so a
 *    routine id cannot name a row; `useDragReorder` needs one string per row, and
 *    the position is the only thing that is unique.
 */

/** The drag-reorder id of the step at `index`. */
export function stepKey(index: number): string {
  return `step-${index}`;
}

/** The position a `stepKey` names, or -1 for anything else. */
export function stepIndexOf(key: string): number {
  const match = /^step-(\d+)$/.exec(key);
  return match ? Number(match[1]) : -1;
}

/**
 * The adjacent swaps that carry the step at `from` to `to`.
 *
 * `to` is an index into the list WITHOUT the moved step — what `useDragReorder`
 * reports — which for a single moved item is the same as its final position.
 * Each swap names the step's position at the moment it runs.
 */
export function swapsToMove(
  from: number,
  to: number,
  length: number,
): { index: number; direction: -1 | 1 }[] {
  if (from < 0 || from >= length) return [];
  const target = Math.max(0, Math.min(length - 1, to));
  const swaps: { index: number; direction: -1 | 1 }[] = [];
  for (let at = from; at < target; at++) swaps.push({ index: at, direction: 1 });
  for (let at = from; at > target; at--) swaps.push({ index: at, direction: -1 });
  return swaps;
}
