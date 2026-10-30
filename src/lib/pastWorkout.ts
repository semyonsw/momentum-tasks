/**
 * The decisions behind finding and moving a workout that already happened
 * (redesign #12 and #15).
 *
 * ── MOVING IS PICKING A DAY, NOT COUNTING TAPS ─────────────────────────────
 *
 * The date used to be a `−`/`+` stepper, one day a tap. Fine for "it ran past
 * midnight", and twenty taps for "I logged last week's session today". A day
 * picker answers both in one tap — but the store only knows how to MOVE a
 * workout (`shiftMinutes`, which drags every set's date with it, see
 * `lib/workoutEdit.ts`), so the picked day is turned into the shift that lands
 * the start on it at the same clock time. Rejected: a new `startedAt` patch from
 * the screen — it would have to rebuild the clock time itself, and the store's
 * existing shift is already the path every move has been tested through.
 *
 * ── THE FUTURE IS NOT A PLACE TO MOVE TO ───────────────────────────────────
 *
 * `shiftWorkout` clamps a start to now, so a day after today would silently
 * land on today. `Move here` refuses it instead (`canMoveToDay`) rather than
 * doing something other than what was asked.
 *
 * ── A CALENDAR SQUARE OPENS ITS WORKOUTS ───────────────────────────────────
 *
 * `workoutsOnDay` is what the training calendar's preview row lists: the
 * workouts whose START is on that local day, earliest first — the same day a
 * square is filled for (`lib/calendar.ts` keys by the start too).
 */

import type { CompletedWorkout } from './completedWorkout';
import { dayKey, MONTH_NAMES_RU_OF, parseDay, weekdayIndex, weekdayLabels } from './days';
import type { Language } from './i18n';

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/**
 * "Mon 27 Oct 2026" — the past workout's date well.
 *
 * The weekday is here, unlike the log's `27 Oct`, because this is the label of
 * the control that MOVES the session: "was it Monday or Tuesday" is exactly the
 * question somebody correcting a date is asking. Russian takes the genitive
 * month in full (`Пн 27 октября 2026`), as every Russian date in the app does.
 */
export function workoutDateLabel(iso: string, lang: Language = 'en'): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  const weekday = weekdayLabels(lang)[weekdayIndex(date)];
  const month = lang === 'ru' ? MONTH_NAMES_RU_OF[date.getMonth()] : MONTHS_SHORT[date.getMonth()];
  return `${weekday} ${date.getDate()} ${month} ${date.getFullYear()}`;
}

/**
 * The minutes to shift a workout by so it starts on `targetDay` at the same
 * clock time. Null for an unreadable start or day.
 *
 * Built by setting the date on a local `Date` rather than multiplying days by
 * 1440: across a daylight-saving change a day is 23 or 25 hours, and a 1440 ×
 * n shift would land the session an hour off the time it actually started.
 */
export function shiftToDay(startedAtIso: string, targetDay: string): number | null {
  const start = new Date(startedAtIso);
  const target = parseDay(targetDay);
  if (!Number.isFinite(start.getTime()) || !target) return null;
  const moved = new Date(start.getTime());
  moved.setFullYear(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((moved.getTime() - start.getTime()) / 60_000);
}

/** Whether `Move here` may act: a real, different day that is not in the future. */
export function canMoveToDay(startedAtIso: string, targetDay: string, today: string): boolean {
  if (!parseDay(targetDay)) return false;
  if (targetDay > today) return false;
  return dayKey(startedAtIso) !== targetDay;
}

/** The workouts that started on `day`, earliest first. */
export function workoutsOnDay(
  workouts: readonly CompletedWorkout[],
  day: string,
): CompletedWorkout[] {
  return workouts
    .filter((workout) => dayKey(workout.startedAt) === day)
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
}
