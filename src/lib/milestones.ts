/**
 * Milestone moments (E4, Wave 3, behind the one switch in `lib/engagement.ts`):
 * a quiet card on the Finish sheet of the 50th, 100th, 250th, 500th… workout.
 *
 *   ╭──────────────────────────────────────────╮
 *   │ (100)  MILESTONE                         │
 *   │        Workout 100                       │
 *   │        Since 14 February 2025. 2,014 sets.│
 *   ╰──────────────────────────────────────────╯
 *
 * Above the records block, one `SparkBurst`, one line — no sweep, no banner
 * (IMPLEMENTATION_DECISIONS row 7).
 *
 * ── WHICH NUMBERS ─────────────────────────────────────────────────────────
 *
 * 50, 100, 250, 500, then every 500. Round numbers people already mark for
 * themselves, spaced so a three-a-week lifter meets one every few months at
 * first and then about once every three years — rare enough to mean something.
 * The number is the sheet's own `Workout N` (the user's pinned count,
 * `workoutNumbers`), so the card and the title above it can never disagree.
 *
 * ── SHOWN EXACTLY ONCE: STORED, NOT DERIVED ───────────────────────────────
 *
 * "This is the 100th" can be derived from the log, but "this has been
 * celebrated" cannot: delete a session and the next one is the 100th again;
 * re-pin the count and it jumps. A derived card would celebrate the same
 * milestone twice. So the highest milestone celebrated is stored
 * (`settings.milestoneShown`) and a card only ever appears for a HIGHER one.
 *
 * It is stamped when the workout that showed the card is SAVED, not when the
 * sheet opens. `Finish` → `Keep going` is an everyday move (a set was still
 * unlogged), and a card consumed by a sheet that was then dismissed would be
 * lost for the workout that really does finish as the 100th. Until the save,
 * re-opening the sheet shows the same card: it is still that one finish.
 *
 * Switching the layer on at workout 340 does not celebrate 50, 100 and 250 in
 * one go: a milestone is a moment on a Finish sheet, and those finishes are
 * past. The next one is 500. A finish with the switch off stamps nothing.
 */

import { dayKey, formatLongDay } from './days';
import type { CompletedWorkout } from './completedWorkout';
import { t, type Language } from './i18n';
import { formatValue } from './money';

/** Whether workout `n` is a milestone: 50, 100, 250, 500, then every 500. */
export function isMilestone(n: number): boolean {
  if (!Number.isInteger(n) || n < 50) return false;
  return n === 50 || n === 100 || n === 250 || n % 500 === 0;
}

/** The persisted form: a positive whole milestone number, or absent. */
export function usableMilestone(value: unknown): number | undefined {
  return typeof value === 'number' && isMilestone(value) ? value : undefined;
}

export interface MilestoneInput {
  /** The Wave 3 switch. */
  on: boolean;
  /** This finish's `Workout N`, or null when the count is unknown. */
  workoutNumber: number | null;
  /** The highest milestone already celebrated (`settings.milestoneShown`). */
  shown: number | undefined;
}

/** The milestone this Finish sheet celebrates, or null. */
export function milestoneDue({ on, workoutNumber, shown }: MilestoneInput): number | null {
  if (!on || workoutNumber == null || !isMilestone(workoutNumber)) return null;
  if (shown != null && workoutNumber <= shown) return null;
  return workoutNumber;
}

/** What the stamp becomes after this finish is saved. Never goes down. */
export function milestoneAfterSave(
  due: number | null,
  shown: number | undefined,
): number | undefined {
  if (due == null) return shown;
  return shown != null && shown >= due ? shown : due;
}

export interface MilestoneCard {
  n: number;
  /** The first saved workout's day (or this one's, for a first workout). */
  since: string;
  /** Working sets across every saved workout plus this one. */
  sets: number;
}

/** The facts on the card. `workouts` are the SAVED ones; this session adds its sets. */
export function milestoneCard(
  n: number,
  workouts: readonly CompletedWorkout[],
  session: { startedAt: string | null; loggedSets: number },
): MilestoneCard {
  let since = session.startedAt ? dayKey(session.startedAt) : null;
  let sets = Math.max(0, session.loggedSets);
  for (const workout of workouts) {
    const day = dayKey(workout.startedAt);
    if (since === null || day < since) since = day;
    sets += Math.max(0, workout.setCount || 0);
  }
  return { n, since: since ?? dayKey(new Date()), sets };
}

/** The card's words: `Workout 100` and `Since 14 February 2025. 2,014 sets.` */
export function describeMilestone(
  card: MilestoneCard,
  lang: Language,
): { title: string; line: string } {
  return {
    title: t('Workout {number}', lang, { number: card.n }),
    line: t('Since {date}. {n} sets.', lang, {
      date: formatLongDay(card.since, lang),
      n: formatValue(card.sets),
    }),
  };
}
