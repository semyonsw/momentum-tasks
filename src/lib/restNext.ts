/**
 * THE LINE ON THE REST CARD — `BETWEEN SETS · Next: set 4`.
 *
 * A countdown answers "how long", and the thing you do with those ninety seconds
 * is get ready for the next set — so the card says which one. It is the same set
 * the glow is on (`upNextSet`), not the first unlogged row of the card the cursor
 * points at: opening another exercise to read it must not change what the rest
 * says you are resting FOR.
 *
 * Three answers, and the difference between the first two is the one worth a
 * function:
 *
 *   • `set`       — the next set belongs to the exercise you just logged, so a
 *                   number is enough ("Next: set 4"). Working sets number around
 *                   warm-ups (`workingSetLabels`), so a warm-up reads as one.
 *   • `exercise`  — the next set is somewhere else. "Next: set 1" there is true
 *                   and useless; the name is what tells you to walk to the rack.
 *   • `done`      — nothing left. The rest still runs (the user may be about to
 *                   add a set) but there is no "next" to name.
 *
 * Pure and renderer-free, so the rest pill only prints what this decides.
 */

import type { DraftSession } from './draft';
import { workingSetLabels } from './draft';
import { lastLoggedSet, upNextSet } from './upNext';

export type RestNext =
  | { kind: 'set'; number: number }
  | { kind: 'warmup' }
  | { kind: 'exercise'; name: string }
  | { kind: 'done' };

export function restNext(session: DraftSession | null): RestNext | null {
  if (!session) return null;
  const next = upNextSet(session);
  if (!next) return { kind: 'done' };

  const entry = session.entries.find((e) => e.localId === next.entryId);
  if (!entry) return null;

  const last = lastLoggedSet(session);
  // Nothing logged yet counts as "same exercise": the first rest of a session
  // is only ever started by hand, from the card you are on.
  if (last && last.entryId !== next.entryId) {
    return { kind: 'exercise', name: entry.exercise.name };
  }

  const index = entry.sets.findIndex((s) => s.localId === next.setId);
  const number = workingSetLabels(entry.sets)[index] ?? null;
  return number == null ? { kind: 'warmup' } : { kind: 'set', number };
}
