/**
 * WHERE "NEXT" LANDS WHEN A LOOP LOSES STEPS.
 *
 * A suggested loop names its steps and which of them is next, as an index. Steps
 * can be dropped between the suggestion and its use — the model named a routine
 * the phone does not have, or the user deleted one before pressing Apply — and
 * clamping the old index against the shorter list moved "next" onto a different
 * routine: `[A, B, C]` next B, A gone, and C came up next. The index has to be
 * re-counted in the list that remains, pointing at the same routine.
 *
 * When the step that was next is itself the one dropped, the step AFTER it in
 * the loop takes its place — the loop carries on from where it was.
 */
export function keepSteps(
  routineIds: readonly string[],
  next: number,
  keep: (id: string) => boolean,
): { routineIds: string[]; next: number } {
  const kept = routineIds.filter(keep);
  if (kept.length === 0) return { routineIds: [], next: 0 };
  const at = Number.isFinite(next)
    ? Math.max(0, Math.min(Math.trunc(next), routineIds.length - 1))
    : 0;
  // How many kept steps come before the one that was next: its new index.
  const before = routineIds.slice(0, at).filter(keep).length;
  return { routineIds: kept, next: before % kept.length };
}
