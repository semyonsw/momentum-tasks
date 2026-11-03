/**
 * A number typed into the inline editor (`QuickAdjust`), and the moment it lands.
 *
 * THE BUG THIS FILE EXISTS FOR. The typed number lived only in `QuickAdjust`'s
 * own state, and its two commits were the field's blur and the editor's own
 * buttons. But the set list keeps the keyboard up across taps
 * (`keyboardShouldPersistTaps="handled"`), so typing 85 and then tapping the
 * ROW's ✓ never blurred anything: the card closed the editor and logged the set,
 * the editor unmounted with 85 still in its box, and the set was logged at the
 * old 80 — and `completeSet` carried that 80 down to every set after it. The
 * same happened tapping another well, or the row's timer.
 *
 * Committing on unmount was considered and rejected: unmount happens AFTER the
 * card's handler has already logged the set, so it would write 85 onto a set the
 * store had logged (and carried forward) as 80. The card has to ask the editor
 * to commit FIRST — `flushThen` — and only then close it or act.
 */

import type { CountUnit, UnitSystem } from '../types/models';
import type { DraftSet } from './draft';
import type { NudgeField } from './setNudge';
import { lbToKg, parseCountInput } from './units';

/**
 * The patch a typed buffer makes, or null when it makes none (nothing typed, or
 * not a number — the old value stays rather than a zero nobody typed).
 * A weight is typed in the user's own units and stored in kg.
 */
export function typedPatch(
  field: NudgeField | null,
  buffer: string,
  unitSystem: UnitSystem,
  countUnit: CountUnit,
): Partial<DraftSet> | null {
  if (field === 'weight') {
    const parsed = Number(buffer.replace(',', '.'));
    if (Number.isNaN(parsed) || buffer.trim() === '') return null;
    return { weightKg: unitSystem === 'imperial' ? lbToKg(parsed) : parsed };
  }
  if (field === 'count') {
    // In the unit the field shows — minutes on a timed one. See `parseCountInput`.
    const count = parseCountInput(buffer, countUnit);
    return count == null ? null : { count };
  }
  return null;
}

/**
 * Commit whatever the open editor holds, THEN close it or act on the row. The
 * order is the whole fix: `act` (logging the set) reads the store, so the typed
 * number has to be in the store before it runs.
 */
export function flushThen(flush: (() => void) | null | undefined, act: () => void): void {
  flush?.();
  act();
}
