/**
 * Does Finish open the sheet, or save in one tap?
 *
 * The Finish sheet is not a confirmation step: with nothing to say, Finish saves
 * in one tap, as it always has. It opens only when the moment has something in
 * it the user would otherwise never see — unlogged sets (an intention, not
 * history), a ladder that moved, a record that fell (W6), or a milestone that is
 * due (E4). The milestone joined the list after a review found the one-tap path
 * skipped it: the card is stamped when the save lands, so a finish that never
 * opened the sheet neither showed nor stamped it, and the next workout is not a
 * milestone — the celebration was lost for good.
 *
 * A plan that moved joined it in the 2.9 redesign (#6): the sheet's primary
 * button is now the offer to make the session the plan, and a finish that saved
 * in one tap because every set was logged — the commonest way to end up with an
 * extra set — never showed the offer at all.
 *
 * A pure function so that rule has a test; ActiveWorkoutScreen only asks it.
 */

import { plural, t, type Language } from './i18n';
import type { PlannedSetChange } from './routinePlan';
import { formatWeight, unitLabel } from './units';
import type { UnitSystem } from '../types/models';

export interface FinishMoment {
  /** Sets planned but not logged. */
  unlogged: number;
  /** A rep ladder moved this session. */
  ladderMoved: boolean;
  /** Records broken this session (`recordsBrokenIn`). */
  records: number;
  /** `milestoneDue(...)` — null when none is due or the switch is off. */
  milestone: number | null;
  /** The session's set counts differ from its routine's (`plannedSetDiff`). */
  planChanged?: boolean;
}

export function finishOpensSheet(m: FinishMoment): boolean {
  return (
    m.unlogged > 0 ||
    m.ladderMoved ||
    m.records > 0 ||
    m.milestone != null ||
    m.planChanged === true
  );
}

/* ------------------------------------------------------------------ */
/* The plan offer (redesign #6)                                        */
/* ------------------------------------------------------------------ */

/**
 * What the Finish sheet says about a session that strayed from its plan: the
 * `Changed from the plan` rows, and the two lines of the primary button.
 *
 * The button used to read `Finish and update the plan` under a sentence that
 * said what changed, and the two had to be read together to know what the tap
 * would do. Now the button IS the sentence — `Save and make 4 sets the plan for
 * Bench press` — and its caption says what that means next time, plus the one
 * reassurance the old copy left out: nothing else in the routine moves.
 *
 * Generated here, not in the sheet, because which exercise gets named, how many
 * are listed and what the weight reads are decisions with a test.
 */
export interface PlanOffer {
  /** One row per change: `Bench press` · `3 sets → 4 sets`. */
  rows: { key: string; name: string; change: string }[];
  /** The button's first line. */
  title: string;
  /** The button's 12.5 px second line. */
  caption: string;
}

function setsWord(n: number, lang: Language): string {
  return `${n} ${plural(n, lang, { one: t('set', lang), few: 'подхода', many: t('sets', lang) })}`;
}

/**
 * Null when there is nothing to offer — no routine, or a session that matched
 * it — and the sheet then shows neither the card nor the button.
 */
export function planOffer(
  changes: readonly PlannedSetChange[],
  routineName: string,
  unitSystem: UnitSystem,
  lang: Language = 'en',
): PlanOffer | null {
  if (changes.length === 0) return null;
  const rows = changes.map((c) => ({
    key: c.itemId,
    name: c.name,
    change: `${setsWord(c.plannedSets, lang)} → ${setsWord(c.completedSets, lang)}`,
  }));
  const stay = t('Other exercises stay as planned.', lang);

  if (changes.length === 1) {
    const [only] = changes;
    const title = t('Save and make {sets} the plan for {exercise}', lang, {
      sets: setsWord(only.completedSets, lang),
      exercise: only.name,
    });
    // `4 × 80 kg` where there is a weight to promise; `4 sets` where there is not
    // (a plank, a pull-up) — a `× —` would be the caption reading out a gap.
    const shape =
      only.weightKg != null
        ? `${only.completedSets} × ${formatWeight(only.weightKg, unitSystem)} ${unitLabel(unitSystem, lang)}`
        : setsWord(only.completedSets, lang);
    const next = t('Next {routine} starts with {shape}.', lang, { routine: routineName, shape });
    return { rows, title, caption: `${next} ${stay}` };
  }

  const title = t('Save and update {count} exercises in the plan', lang, {
    count: changes.length,
  });
  // The caption LISTS them: a button that rewrites three exercises must say
  // which three, or it is a button nobody can press with confidence.
  const list = changes.map((c) => `${c.name} ${setsWord(c.completedSets, lang)}`).join(', ');
  return { rows, title, caption: `${list}. ${stay}` };
}
