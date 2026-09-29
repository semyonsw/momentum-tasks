/**
 * FocusNumbers — what to load and how many, as the lines focus mode draws.
 *
 *   32 KG        ← the load (absent for a bodyweight exercise)
 *   5 REPS       ← the count, or MAX while an as-many-as-you-can set is unstarted
 *
 * Two lines rather than `+32 KG × 5 REPS` on one, so each number gets the whole
 * width and `lib/focusType.ts` can size it to the biggest that fits — on an
 * ordinary set around the countdown's own 120 dp. This file owns only WHAT the
 * lines say; `FocusMode` draws them.
 */

import type { WorkLine } from '../lib/focusType';
import { maxLabel, showsMaxLabel } from '../lib/maxReps';
import { countUnitLabel, formatCount, formatWeight, unitLabel } from '../lib/units';
import type { Language } from '../lib/i18n';
import type { FocusTarget } from '../lib/focusPlan';
import type { UnitSystem } from '../types/models';

/**
 * The lines one set is drawn as: the load, then the count. A bodyweight exercise
 * has no weight line at all — the same absence `SetRow` and `FocusNudge` give it,
 * rather than a dash standing in for a number nobody entered.
 */
export function workLines(target: FocusTarget, unitSystem: UnitSystem, lang: Language): WorkLine[] {
  const { exercise } = target.entry;
  const lines: WorkLine[] = [];
  if (exercise.requiresWeight) {
    lines.push({
      value: formatWeight(target.set.weightKg, unitSystem, exercise.loadMode),
      unit: unitLabel(unitSystem, lang).toUpperCase(),
    });
  }
  /*
   * `MAX` IS A LINE OF ITS OWN WORD, not a number with a unit after it. The set
   * has no rep target and the counter has not started, so the biggest thing on
   * the screen says the only thing that is true about it. The moment a rep is
   * counted it becomes the count, like any other set. See `lib/maxReps.ts`.
   */
  if (showsMaxLabel(exercise, target.set)) {
    lines.push({ value: maxLabel(lang).toUpperCase(), unit: '' });
    return lines;
  }

  lines.push({
    value: formatCount(target.set.count, exercise.countUnit),
    unit: countUnitLabel(exercise.countUnit, lang).toUpperCase(),
  });
  return lines;
}
