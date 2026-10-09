/**
 * Streak freezes (E3, Wave 3, behind the one switch in `lib/engagement.ts`).
 *
 *   Reading    🜂 34 ❄ 1
 *
 * A freeze covers ONE past day the user did not answer, so the run carries on
 * over it. They are earned by the run itself — one for every 7 done days in a
 * row — and at most 2 are held. One is used for you, the morning after the gap:
 * nothing to press, nothing to remember.
 *
 * ── AN OVERLAY ON THE STREAK, NEVER A WRITE TO THE LOG ─────────────────────
 *
 * The log is not touched: a covered day stays unanswered in the month, the
 * Year in Pixels and the habit-strength ring, because it WAS unanswered and
 * those screens are the record. What a freeze changes is one number — the
 * streak on the flame and on the task's own screen — and only while the
 * switch is on. With it off, `displayedStreak` IS `streakOf`, value for value.
 * Rejected: writing a `frozen` mark into the log (a second kind of answer the
 * backup, the CSV and every reader of the log would have to learn, and one
 * that would outlive the switch being turned off).
 *
 * ── THE RULES, WALKED FORWARD FROM THE TASK'S FIRST DAY ────────────────────
 *
 *  • A done day adds one to the run; every 7th done day in a row earns a
 *    freeze, up to `FREEZE_MAX` held.
 *  • A day EXCUSED on purpose is stepped over — as `streakOf` does — and spends
 *    nothing. Skipping on purpose never needs a freeze.
 *  • An unanswered PAST day spends a held freeze and the run carries on (the
 *    covered day itself adds nothing), or, with none held, ends the run — and
 *    the count toward the next freeze starts again.
 *  • Today never spends one: a day still being lived is not yet a gap.
 *
 * Earning restarts with the run, so a freeze cannot be banked by one long run
 * and spent across a month of silence: at most two days are ever bridged in a
 * row.
 *
 * ── WEEKLY TASKS (T-14) DO NOT USE THEM ────────────────────────────────────
 *
 * A "3 times a week" task's run is counted in WEEKS, and a week already has
 * slack built in — any three days of seven. A freeze earned per 7 days and
 * spent per day has no meaning on that scale, and one that covered a whole
 * missed week would be worth seven times a daily one. So a weekly task shows
 * its plain week streak and no snowflake.
 */

import { ageInDays, asksOn, entryOf, isWeekly, streakOf, type Task, type TaskLog } from './tasks';
import { formatShortDay, shiftDay } from './days';
import { plural, t, type Language } from './i18n';

/** Done days in a row that earn one freeze. */
export const FREEZE_EVERY = 7;
/** Freezes held at most. */
export const FREEZE_MAX = 2;

export interface FrozenStreak {
  /** The run as of `day`, with the covered days bridged (not counted). */
  streak: number;
  /** Freezes held at the end of `day`, 0–`FREEZE_MAX`. */
  held: number;
  /** Past days a freeze covered, oldest first, in the run still going. */
  covered: string[];
}

/**
 * The streak with freezes applied, as of `day`. Pure: the log is read, never
 * written. Weekly tasks get their plain week streak and no freezes.
 */
export function frozenStreak(task: Task, log: TaskLog, day: string): FrozenStreak {
  if (isWeekly(task)) return { streak: streakOf(task, log, day), held: 0, covered: [] };
  let run = 0;
  let toward = 0;
  let held = 0;
  let covered: string[] = [];
  let guard = ageInDays(task.startedOn, day) + 1;
  for (let d = task.startedOn; d <= day && guard > 0; d = shiftDay(d, 1), guard -= 1) {
    if (!asksOn(task, d)) continue;
    const { mark } = entryOf(log, task.id, d);
    if (mark === 'done') {
      run += 1;
      toward += 1;
      if (toward === FREEZE_EVERY) {
        held = Math.min(FREEZE_MAX, held + 1);
        toward = 0;
      }
    } else if (mark === null && d !== day) {
      if (held > 0) {
        held -= 1;
        covered.push(d);
      } else {
        run = 0;
        toward = 0;
        covered = [];
      }
    }
    // 'missed' — excused on purpose: stepped over, nothing spent.
  }
  return { streak: run, held, covered };
}

/**
 * What the flame shows. With the switch OFF this is `streakOf` exactly and no
 * freezes — the one place the overlay is switched, so "off is as before" is a
 * single test.
 */
export function displayedStreak(task: Task, log: TaskLog, day: string, on: boolean): FrozenStreak {
  if (!on) return { streak: streakOf(task, log, day), held: 0, covered: [] };
  return frozenStreak(task, log, day);
}

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

/** `1 streak freeze`, `2 streak freezes` — the sheet's title. */
export function describeFreezes(held: number, lang: Language): string {
  return plural(held, lang, {
    one: t('{n} streak freeze', lang, { n: held }),
    few: `${held} заморозки серии`,
    many: t('{n} streak freezes', lang, { n: held }),
  });
}

/** The rule, with its numbers from the constants. */
export function describeFreezeRule(lang: Language): string {
  return t(
    'Earn one for every {n} days in a row. Hold up to {max}. Skipping on purpose never needs one.',
    lang,
    {
      n: FREEZE_EVERY,
      max: FREEZE_MAX,
    },
  );
}

/** `Used on 19 Sep.` for the days a freeze bridged in this run, or null. */
export function describeCovered(covered: readonly string[], lang: Language): string | null {
  if (covered.length === 0) return null;
  return t('Used on {days}.', lang, {
    days: covered.map((day) => formatShortDay(day, lang)).join(', '),
  });
}
