/**
 * "Was that a warm-up?" — the question asked after the ✓, when the answer is
 * probably yes.
 *
 *   plan      60 · 80 · 80 · 80        ← first row is the warm-up, but not MARKED one
 *   you do    60 ✓                     ← the carry runs: 60 · 60 · 60 · 60
 *   offer     [ Warm-up? Keep 80 kg ]  ← one tap: W 60 ✓ · 80 · 80 · 80
 *
 * ── WHY THE CARRY STAYS AND THIS UNDOES IT, RATHER THAN THE REVERSE ────────
 *
 * `lib/weightCarry.ts` is right far more often than it is wrong: a lighter set
 * mid-exercise means today is a lighter day. What it cannot know is whether the
 * row was a warm-up that nobody marked — a 60 kg first set under three planned
 * 80s looks exactly like "today is a 60 kg day". So the carry still runs, and the
 * app asks once, in the one shape where the warm-up reading is likely, with the
 * undo already in hand. A user who meant "lighter today" ignores a chip; a user
 * who meant "warm-up" was rewriting three rows by hand before this.
 *
 * REJECTED: suppressing the carry whenever the set is lighter than the plan. That
 * is the bad-day case — the one the carry was built for — turned off silently.
 *
 * ── WHEN IT ASKS ───────────────────────────────────────────────────────────
 *
 *  • Only for the FIRST working set logged on the exercise. Warm-ups happen
 *    before work; a light set after one has already counted is a drop or a bad
 *    day, never a warm-up.
 *  • Only a plain working set: a drop, failure or AMRAP was typed on purpose.
 *  • Only when it is at least `WARMUP_GAP` lighter than the heaviest unlogged
 *    working row below it. 60 under 65 is a lighter day; 60 under 80 is a ramp.
 *
 * It returns the rows' weights BEFORE the carry, so the undo puts back the plan
 * rather than guessing it.
 */

import type { DraftSet } from './draft';
import type { ID } from '../types/models';
import { withKind } from './setType';

/** How much lighter than the plan a first set has to be to read as a ramp. */
export const WARMUP_GAP = 0.9;

export interface WarmupRestore {
  setId: ID;
  weightKg: number | null;
  isPrefilled: boolean;
}

export interface WarmupOffer {
  entryId: ID;
  setId: ID;
  /** The weight the ✓ carried down — rows still at it get their plan back. */
  carriedKg: number;
  /** The heaviest planned weight below, for the chip: `Keep 80 kg`. */
  keepKg: number;
  restore: readonly WarmupRestore[];
}

/**
 * The offer for `setId` given the rows as they were BEFORE the carry ran, or null.
 *
 * `sets` must already show `setId` as completed — the caller's `logged` array —
 * so "the first working set logged" is a question about everything else.
 */
export function warmupOfferFor(
  sets: readonly DraftSet[],
  entryId: ID,
  setId: ID,
): WarmupOffer | null {
  const index = sets.findIndex((s) => s.localId === setId);
  if (index === -1) return null;
  const set = sets[index];
  if (set.isWarmup || set.setType != null) return null;
  const weight = set.weightKg;
  if (weight == null || !Number.isFinite(weight) || weight <= 0) return null;

  const otherWorkingLogged = sets.some(
    (s, i) => i !== index && s.isCompleted && !s.isWarmup && s.setType !== 'drop',
  );
  if (otherWorkingLogged) return null;

  const below = sets.filter(
    (s, i) => i > index && !s.isCompleted && !s.isWarmup && s.setType !== 'drop',
  );
  const planned = below
    .map((s) => s.weightKg)
    .filter((w): w is number => w != null && Number.isFinite(w));
  if (planned.length === 0) return null;
  const keepKg = Math.max(...planned);
  if (weight > keepKg * WARMUP_GAP) return null;

  return {
    entryId,
    setId,
    carriedKg: weight,
    keepKg,
    restore: below.map((s) => ({
      setId: s.localId,
      weightKg: s.weightKg,
      isPrefilled: s.isPrefilled,
    })),
  };
}

/**
 * The rows with the offer taken: the set becomes a warm-up and every row the
 * carry rewrote gets its planned weight back.
 *
 * A row that has since been logged, or edited to anything other than the carried
 * weight, is the user's newer word and is left alone.
 */
export function acceptWarmupOffer(sets: readonly DraftSet[], offer: WarmupOffer): DraftSet[] {
  return undoWarmupCarry(sets, offer).map((s) =>
    s.localId === offer.setId ? withKind(s, 'warmup') : s,
  );
}

/**
 * Just the weights back, the set's kind untouched — for a ✓ that was un-ticked:
 * the carry was that ✓'s doing, so it goes with it.
 */
export function undoWarmupCarry(sets: readonly DraftSet[], offer: WarmupOffer): DraftSet[] {
  const restoreById = new Map(offer.restore.map((r) => [r.setId, r]));
  return sets.map((s) => {
    const r = restoreById.get(s.localId);
    if (!r || s.isCompleted || s.weightKg !== offer.carriedKg) return s;
    return { ...s, weightKg: r.weightKg, isPrefilled: r.isPrefilled };
  });
}

/**
 * Which rows show the `W` checkbox — the way to say "warm-up" BEFORE the ✓.
 *
 * It used to be reachable only through the set's number, a tap target nobody
 * guesses is one. The checkbox is on the rows where the answer can still be yes:
 * not logged, not typed as a drop / failure / AMRAP, and with no working set
 * logged above — warm-ups come before work, so once work has begun the
 * question is closed and the column goes back to being numbers.
 */
export function warmupToggleRows(
  sets: readonly Pick<DraftSet, 'isWarmup' | 'isCompleted' | 'setType'>[],
): boolean[] {
  let workBegun = false;
  return sets.map((s) => {
    const eligible = !workBegun && !s.isCompleted && s.setType == null;
    if (s.isCompleted && !s.isWarmup) workBegun = true;
    return eligible;
  });
}
