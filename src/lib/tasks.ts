/**
 * The daily log — what you said you would do, and what you did.
 *
 *   Morning Bible/Narek reading     Every day · 12 in a row
 *   Gym / Boxing                    Mon · Wed · Fri · auto
 *   Book reading before sleep       Every day · missed on purpose · travelling
 *
 * ── A STREAK HERE, AND NOT IN THE TRAINING LOG ─────────────────────────────
 *
 * `lib/calendar.ts` refuses to count a streak, and the reason it gives is that a
 * training streak turns "I was ill for a week" into a number going to zero. That
 * argument is about TRAINING, where the body decides and the log's only job is to
 * be honest about what happened. A habit is the other thing: the whole reason to
 * write "read before sleep" on a list is that the list pushes back, and a habit
 * list with nothing at stake is a to-do list that resets every night. So the
 * streak stays — and the escape hatch that makes it honest comes with it.
 *
 * ── THREE ANSWERS, NOT TWO ────────────────────────────────────────────────
 *
 * A day is `done`, `missed` ON PURPOSE, or UNANSWERED, and the third is not a
 * synonym for the second. Unanswered is a day nobody has judged yet — today
 * before bedtime, or a Tuesday last week you never opened the app on. Missed is
 * a deliberate mark: *I chose not to, and I am saying so.*
 *
 * That deliberate mark is EXCUSED. It does not break the streak and it leaves
 * the denominator — nine rows on a day with one excused reads `5 of 8`, not
 * `5 of 9`. Otherwise the only way to keep a streak alive through a week of
 * travelling is to lie, and a log you have to lie to is a log you stop opening.
 * An UNANSWERED day in the past is the one that breaks a streak, because it is
 * the one where the day went by without you.
 *
 * ── AND `auto` ────────────────────────────────────────────────────────────
 *
 * Two tasks are ticked by the rest of the app rather than by a thumb: finishing a
 * workout ticks the training one, recording an amount ticks the money one. They
 * are still ordinary tasks — still tappable, still skippable — `auto` only says
 * that something else will get there first. See `lib/autoTick.ts`.
 *
 * ── A PAUSE IS THE SAME MARK, WRITTEN FOR A RUN OF DAYS ──────────────────
 *
 * Vacation mode (`excuseRange`) does not add a new kind of day. It writes the
 * existing `missed`-on-purpose mark on every day in the range that each chosen
 * task asks on — so the streak, the denominator, the month grid, the trend line,
 * the reminders and the backup already know what to do with it, and a backup
 * made before pauses existed is not a different shape from one made after.
 *
 * FUTURE DAYS ARE MARKED AHEAD OF TIME. A trip next week is the case the feature
 * is for, and a mark written now means that week's follow-up reminders stay
 * quiet (`lib/reminders.ts` skips an answered day) and the streak walks over it
 * when it arrives. Every pre-written day stays an ordinary mark: come home early
 * and tap the row, and it is `done`. Since the day screen never goes forward,
 * a `missed` mark AFTER TODAY can only have come from a pause, which is what lets
 * `pausedUntil` find one and `clearExcused` take it back without a second store.
 *
 * Rejected: a stored `pauses: [{from, to, taskIds}]` list that the streak, the
 * month and the denominator would each have to consult. It is a second source of
 * truth for one fact — and the first time it and the log disagreed (a pause over
 * a day already ticked, a task added mid-pause) every reader would need a rule
 * for which one wins. With marks there is one answer per day and nothing to merge.
 *
 * A range NEVER overwrites `done`, nor an existing excusal, nor a note; and it
 * marks only the days a task asks on, so a Mon/Wed/Fri row gets no stray marks
 * on its Tuesdays and a one-day task is excused only if its day is inside.
 *
 * Everything here is pure and local-time: a task belongs to the day you were
 * standing in, which is what `calendar.dayKey` computes.
 */

import {
  dayKey,
  daysBetween,
  formatClockTime,
  formatMonth,
  formatShortDay,
  parseDay,
  shiftDay,
  weekdayIndex,
  weekdayLabels,
} from './days';
import { t, type Language } from './i18n';
import { moveToIndex } from './reorder';
import { rangeLength, type TrendRange } from './trends';
import type { ID } from '../types/models';

/** Monday = 0 … Sunday = 6, matching the Monday-first grid the app draws. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * When a task asks.
 *
 * ── `once` IS A DIFFERENT KIND OF ROW, AND THAT IS THE POINT ───────────────
 *
 * The two repeating shapes answer "what am I trying to do with my life"; `once`
 * answers "wash the dishes tomorrow". Both belong on the same list — the list is
 * read top to bottom every evening and a second list for one-off jobs is a second
 * list to remember to open — but they are not the same fact, so they are not the
 * same shape. A one-day task asks on ITS day and on no other, before or after,
 * which means it cannot be missed retroactively and it cannot haunt next Tuesday.
 *
 * The day is on the schedule rather than being `startedOn` doing double duty:
 * `startedOn` means "not before this", which is a floor, and a one-day task needs
 * a ceiling as well. Carrying both in one field would make every reader of
 * `startedOn` have to know which kind of task it is looking at.
 */
export type TaskSchedule =
  | { kind: 'daily' }
  | { kind: 'weekdays'; days: readonly Weekday[] }
  | { kind: 'once'; day: string };

/** What the circle on the left of a row says. Absent = unanswered. */
export type TaskMark = 'done' | 'missed';

/** Which part of the app ticks this one without being asked. */
export type TaskAutoSource = 'workout' | 'money';

/**
 * When the phone should say something about this task, on the days it asks.
 *
 * A wall-clock time and nothing else. Not a date, not a lead time, not a repeat
 * rule: the task already carries the schedule, so a reminder that also carried
 * days would be a second schedule, free to disagree with the first — and a
 * Mon/Wed/Fri task that buzzes on Sunday is the app contradicting its own list.
 *
 * 24-hour, because that is what the wheel the user sets it on shows.
 */
export interface TaskReminder {
  /** 0–23. */
  hour: number;
  /** 0–59. */
  minute: number;
  /**
   * Minutes between the follow-ups, or absent for one alert and no more.
   *
   * ── WHY A FOLLOW-UP, AND WHY IT STOPS ─────────────────────────────────
   *
   * One buzz at 09:00 is easy to swipe away on the way into a meeting, and the
   * one-day task it was for then quietly does not happen. So a reminder can
   * ask AGAIN — every 15 minutes up to every 3 hours — and it stops the moment
   * the day is answered (ticked, or marked missed on purpose) or the day ends.
   * Never past either: a phone that keeps nagging about a job already done is
   * the fastest way to get the whole channel silenced. See `lib/reminders.ts`.
   *
   * Optional rather than `number | null` so every reminder written before this
   * existed reads as exactly what it was — one alert.
   */
  every?: number;
}

/**
 * The follow-up spacings the editor offers, in minutes.
 *
 * Nothing under 15: a reminder every five minutes is an alarm clock, and this
 * channel is deliberately not one (see `CHANNEL_REMINDER` in `lib/notify.ts`).
 */
export const REMIND_AGAIN_MINUTES = [15, 30, 60, 120, 180] as const;

/** "30 min" · "2 h" — a follow-up spacing, as the editor and the rows say it. */
export function formatInterval(minutes: number, lang: Language = 'en'): string {
  if (minutes < 60 || minutes % 60 !== 0) return t('{minutes} min', lang, { minutes });
  return t('{hours} h', lang, { hours: minutes / 60 });
}

export interface Task {
  id: ID;
  name: string;
  schedule: TaskSchedule;
  auto: TaskAutoSource | null;
  /** The first day it asked for anything, `YYYY-MM-DD`. Days before it are blank. */
  startedOn: string;
  /**
   * When to be reminded, or null for the silent default.
   *
   * NULL IS THE DEFAULT AND IT STAYS THE DEFAULT. A habit list that notifies by
   * default is a habit list that gets silenced at the OS level within a week, and
   * a silenced channel takes the reminders the user actually wanted with it. So
   * every reminder in this app is one the user asked for, one task at a time.
   */
  reminder: TaskReminder | null;
  /** Archived tasks keep their history and leave the day list. */
  archivedAt: string | null;
  order: number;
}

/** A day's answer. A note can exist with no mark — a day you wrote on but never judged. */
export interface TaskEntry {
  mark: TaskMark | null;
  note: string;
}

/** `taskId` → `YYYY-MM-DD` → entry. Sparse: most days have no row at all. */
export type TaskLog = Record<ID, Record<string, TaskEntry>>;

const EMPTY_ENTRY: TaskEntry = { mark: null, note: '' };

/** Monday-first weekday index of a `YYYY-MM-DD`. */
export function weekdayOf(key: string): Weekday | null {
  const date = parseDay(key);
  if (!date) return null;
  return weekdayIndex(date) as Weekday;
}

/**
 * Did this task ask for anything on this day? Before `startedOn`, nothing ever did
 * — and from the day it was ARCHIVED, nothing does.
 *
 * That second floor was missing, and `tasksOn` hid the row while `dayProgress`
 * still counted it: archive one task, tick the other eight, and the ring stopped
 * at 8/9 on a day that could now never close. The days before the archive keep
 * asking, which is what "archived tasks keep their history" means.
 */
export function asksOn(task: Task, day: string): boolean {
  if (task.archivedAt !== null) {
    const archived = new Date(task.archivedAt);
    if (!Number.isNaN(archived.getTime()) && day >= dayKey(archived)) return false;
  }
  // A one-day task is its own floor and its own ceiling, so it is answered
  // before `startedOn` is consulted — see the note on `TaskSchedule`.
  if (task.schedule.kind === 'once') return day === task.schedule.day;
  if (day < task.startedOn) return false;
  if (task.schedule.kind === 'daily') return true;
  const weekday = weekdayOf(day);
  return weekday !== null && task.schedule.days.includes(weekday);
}

/**
 * One-day tasks whose day has not arrived yet, soonest first.
 *
 * ── WHY THIS EXISTS: A TASK YOU CANNOT SEE IS A TASK YOU DID NOT WRITE DOWN ──
 *
 * The day screen walks BACKWARDS only, and that refusal is right — there is
 * nothing to tick in the future and a screen offering to let you tick it would
 * be offering to lie (`TasksScreen`). But the whole point of a one-day task is
 * that you write it down for TOMORROW, and with the pager refusing to go there,
 * saving one produced no visible change whatsoever: the sheet closed, today's
 * list was identical, and the only honest reading was that the app had lost it.
 *
 * So the future rows are LISTED, on today, under the day's list, as a statement
 * rather than as rows — no circles, nothing to answer. That is the difference
 * this keeps: you can see what is coming, and you still cannot tick it early.
 *
 * Capped, because "what is coming" stops being useful somewhere before it
 * becomes a second list of everything.
 */
export function upcomingOnce(tasks: readonly Task[], today: string, limit = 4): Task[] {
  return tasks
    .filter(
      (task) =>
        task.archivedAt === null && task.schedule.kind === 'once' && task.schedule.day > today,
    )
    .sort((a, b) => {
      const dayA = a.schedule.kind === 'once' ? a.schedule.day : '';
      const dayB = b.schedule.kind === 'once' ? b.schedule.day : '';
      // Soonest first; two on the same day keep their list order.
      return dayA === dayB ? a.order - b.order : dayA < dayB ? -1 : 1;
    })
    .slice(0, limit);
}

export function entryOf(log: TaskLog, taskId: ID, day: string): TaskEntry {
  return log[taskId]?.[day] ?? EMPTY_ENTRY;
}

/** "Every day" · "Mon · Wed · Fri" · "Once · 14 September" · "Never". */
export function describeSchedule(schedule: TaskSchedule, lang: Language = 'en'): string {
  if (schedule.kind === 'once') {
    return `${t('Once', lang)} · ${formatShortDay(schedule.day, lang)}`;
  }
  if (schedule.kind === 'daily') return t('Every day', lang);
  if (schedule.days.length === 0) return t('Never', lang);
  const labels = weekdayLabels(lang);
  const ordered = [...schedule.days].sort((a, b) => a - b);
  return ordered.map((day) => labels[day]).join(' · ');
}

/** "Reminds at 07:30" · "Reminds at 07:30, then every 30 min" · nothing when silent. */
export function describeReminder(task: Task, lang: Language = 'en'): string | null {
  if (!task.reminder) return null;
  const time = formatClockTime(task.reminder.hour, task.reminder.minute);
  if (task.reminder.every) {
    return t('Reminds at {time}, then every {interval}', lang, {
      time,
      interval: formatInterval(task.reminder.every, lang),
    });
  }
  return t('Reminds at {time}', lang, { time });
}

/**
 * The streak: scheduled days in a row ending at the last one that was answered.
 *
 * Walks BACKWARDS from today. Today is skipped whatever it says, because a day
 * still being lived is not yet evidence either way — an unanswered today would
 * otherwise zero a streak every morning. Excused days are stepped over without
 * counting; the first unanswered past day stops the walk.
 *
 * Bounded by `startedOn`, so a task created yesterday cannot walk 2015.
 */
export function streakOf(task: Task, log: TaskLog, today: string): number {
  let streak = 0;
  // A ticked today is already part of the run it belongs to.
  if (asksOn(task, today) && entryOf(log, task.id, today).mark === 'done') streak += 1;

  let day = shiftDay(today, -1);
  // The walk is bounded by `startedOn`, and again by the span in case it is junk.
  let guard = ageInDays(task.startedOn, today) + 1;
  while (day >= task.startedOn && guard > 0) {
    if (asksOn(task, day)) {
      const { mark } = entryOf(log, task.id, day);
      if (mark === 'done') streak += 1;
      else if (mark !== 'missed') break;
    }
    day = shiftDay(day, -1);
    guard -= 1;
  }
  return streak;
}

/** A run of done days inside a window: how long, and the first and last day of it. */
export interface TaskRun {
  days: number;
  from: string;
  to: string;
}

/**
 * The longest run of a task inside `[from, to]` — the streak a Wrapped card
 * names (X1), counted by the same rules as `streakOf`: asked days only, a day
 * excused on purpose stepped over without counting, the first unanswered day
 * ending the run, and `today` never ending one (it is still being lived).
 *
 * Only days INSIDE the window count, so a month's run is that month's, not the
 * tail of one that began in spring. Null when it was never done there.
 */
export function longestRunIn(
  task: Task,
  log: TaskLog,
  from: string,
  to: string,
  today: string,
): TaskRun | null {
  let best: TaskRun | null = null;
  let run = null as TaskRun | null;
  const last = to < today ? to : today;
  let guard = ageInDays(from, last) + 1;
  for (let day = from; day <= last && guard > 0; day = shiftDay(day, 1), guard -= 1) {
    if (!asksOn(task, day)) continue;
    const { mark } = entryOf(log, task.id, day);
    if (mark === 'done') {
      const next: TaskRun =
        run === null
          ? { days: 1, from: day, to: day }
          : { days: run.days + 1, from: run.from, to: day };
      run = next;
      if (best === null || next.days > best.days) best = next;
    } else if (mark === null && day !== today) {
      run = null;
    }
  }
  return best;
}

export interface DayProgress {
  done: number;
  /** Scheduled today, less the ones excused on purpose. */
  total: number;
  /** 0–1, and 1 on a day that asked for nothing so the bar reads full rather than empty. */
  fraction: number;
}

/** "6 of 8 done" and the width of the bar above it. */
export function dayProgress(tasks: readonly Task[], log: TaskLog, day: string): DayProgress {
  let done = 0;
  let total = 0;
  for (const task of tasks) {
    if (!asksOn(task, day)) continue;
    const { mark } = entryOf(log, task.id, day);
    if (mark === 'missed') continue;
    total += 1;
    if (mark === 'done') done += 1;
  }
  return { done, total, fraction: total === 0 ? 1 : done / total };
}

/**
 * The tasks that asked for something on a day, in their own order.
 *
 * Archived ones included, on the days before their archive — `asksOn` already
 * stops them there, and it is what `dayProgress` counts. Hiding them here too
 * made yesterday read "0 of 1" with no row to tick, a day that could never close.
 */
export function tasksOn(tasks: readonly Task[], day: string): Task[] {
  return tasks.filter((task) => asksOn(task, day)).sort((a, b) => a.order - b.order);
}

/**
 * The faint second line of a row: schedule, streak, `auto`, then the day's note.
 *
 * The note goes LAST and the row clips at one line, so a long note is trimmed
 * rather than pushing the facts off the end.
 */
export function describeTaskRow(
  task: Task,
  log: TaskLog,
  day: string,
  lang: Language = 'en',
  /**
   * Include the run of days in the line.
   *
   * Off for the day list, where the streak is a BADGE beside the row and saying
   * it twice in one 72 dp card is the kind of duplication that makes both copies
   * read as decoration. On everywhere else — the task's own screen and the
   * history grid have no badge, and the sentence is all there is.
   */
  withStreak = true,
): string {
  const entry = entryOf(log, task.id, day);
  const parts: string[] = [describeSchedule(task.schedule, lang)];
  // Behind the flag, not filtered after the fact: `streakOf` walks back a day at
  // a time to the start of the run, so on a task answered every day for a year
  // it is the most expensive thing this function could do — and the day list,
  // which draws it once per row, does not want the number at all.
  if (withStreak) {
    const streak = streakOf(task, log, day);
    if (streak >= 2) parts.push(`${streak} ${t('in a row', lang)}`);
  }
  const reminder = describeReminder(task, lang);
  if (reminder) parts.push(reminder);
  if (entry.mark === 'missed') parts.push(t('missed on purpose', lang));
  if (task.auto) parts.push(t('auto', lang));
  if (entry.note.trim() !== '') parts.push(entry.note.trim());
  return parts.join(' · ');
}

/** What a square in the month grid says. `blank` = the task never asked. */
export type TaskCellState = 'done' | 'missed' | 'unanswered' | 'blank';

export interface TaskCell {
  /** Day of the month, or null for the padding before the 1st. */
  day: number | null;
  date: string | null;
  state: TaskCellState;
  isToday: boolean;
}

export interface TaskMonth {
  year: number;
  /** 0-based, as `Date` uses it. */
  month: number;
  /** "September 2026". */
  label: string;
  /** Weeks of seven cells, Monday first, padded at the start only. */
  weeks: TaskCell[][];
  /** Days done this month. */
  done: number;
  /** Days it asked for, up to today, less the excused ones. */
  asked: number;
  /** Days excused on purpose this month, paused days ahead of today included. */
  excused: number;
}

/**
 * One month of one task, as a grid.
 *
 * Padded at the start only, like the training calendar: a trailing pad would
 * draw squares for days that have not happened, which reads as missed rather
 * than as future. FUTURE days inside this month are `blank` for the same
 * reason — a day that has not arrived has not been skipped. The one exception
 * is a future day already excused by a pause: that is a fact written down now,
 * so it is drawn as one (and still counted in neither `done` nor `asked`).
 */
export function taskMonth(
  task: Task,
  log: TaskLog,
  year: number,
  month: number,
  today: string,
  lang: Language = 'en',
): TaskMonth {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lead = weekdayIndex(new Date(year, month, 1));

  const cells: TaskCell[] = [];
  for (let i = 0; i < lead; i += 1) {
    cells.push({ day: null, date: null, state: 'blank', isToday: false });
  }

  let done = 0;
  let asked = 0;
  let excused = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = dayKey(new Date(year, month, day));
    const isToday = date === today;
    let state: TaskCellState = 'blank';

    if (asksOn(task, date)) {
      const { mark } = entryOf(log, task.id, date);
      if (mark === 'missed') {
        state = 'missed';
        excused += 1;
      } else if (date <= today) {
        state = mark === 'done' ? 'done' : 'unanswered';
        asked += 1;
        if (mark === 'done') done += 1;
      }
    }
    cells.push({ day, date, state, isToday });
  }

  const weeks: TaskCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return { year, month, label: formatMonth(year, month, lang), weeks, done, asked, excused };
}

/** How many days apart two days are, for "since 4 January 2026" style copy. */
export function ageInDays(from: string, to: string): number {
  return Math.max(0, daysBetween(from, to));
}

/* ------------------------------------------------------------------ */
/* Order                                                               */
/* ------------------------------------------------------------------ */

/**
 * Reorder the WHOLE list from a move made inside a VISIBLE SUBSET of it.
 *
 * The day screen only shows the tasks that asked for something today, so a
 * Mon/Wed/Fri row is simply not on screen on a Tuesday — and dragging the third
 * visible row to the top has to mean "third visible goes above first visible",
 * not "index 2 goes to index 0" in a list the user cannot see. Those two are the
 * same answer only on a day when everything is scheduled, which is exactly the
 * day the bug hides.
 *
 * So: the visible rows are permuted among THEIR OWN SLOTS, and every task that
 * was not on screen keeps the position it had. A task hidden between two visible
 * ones stays between them, which is the only behaviour that makes a Tuesday drag
 * and a Wednesday drag agree with each other.
 *
 * `toIndex` is a position in the visible list WITHOUT the moved row — what a drop
 * position on screen is — so dropping a row back where it came from is a no-op.
 * Shared with `moveToIndex` in `lib/reorder.ts`, which is the splice both
 * reorderable lists in the app already use.
 */
export function reorderWithinVisible(
  allIds: readonly ID[],
  visibleIds: readonly ID[],
  movedId: ID,
  toIndex: number,
): ID[] {
  if (!visibleIds.includes(movedId)) return [...allIds];

  const nextVisible = moveToIndex([...visibleIds], (id) => id === movedId, toIndex);
  const visible = new Set(visibleIds);

  let cursor = 0;
  return allIds.map((id) => (visible.has(id) ? nextVisible[cursor++] : id));
}

/* ------------------------------------------------------------------ */
/* Trend                                                               */
/* ------------------------------------------------------------------ */

/**
 * The first day a range covers, ending at `today`.
 *
 * `all` walks back to the EARLIEST `startedOn` in the list rather than to some
 * arbitrary floor: the chart's left edge is then the day the log began, which is
 * the only honest answer to "all time" and stops a fresh install drawing a year
 * of empty days.
 */
export function rangeStart(tasks: readonly Task[], range: TrendRange, today: string): string {
  const length = rangeLength(range);
  if (length != null) return shiftDay(today, -(length - 1));
  let earliest = today;
  for (const task of tasks) {
    if (task.startedOn !== '' && task.startedOn < earliest) earliest = task.startedOn;
  }
  return earliest;
}

/** One day of the habit chart: the share of that day's tasks that were done. */
export interface TaskTrendPoint {
  day: string;
  /** ISO instant at local noon, for `TrendChart`'s axis labels. */
  at: string;
  /** 0–100, rounded. */
  value: number;
  done: number;
  asked: number;
}

/**
 * Percent done, day by day, over a range.
 *
 * ── DAYS THAT ASKED FOR NOTHING ARE LEFT OUT, NOT PLOTTED AS ZERO ──────────
 *
 * The same rule `lib/trends.ts` applies to a swim day with no reps in it: a day
 * that asked for nothing is not a day you failed, and a zero in the middle of a
 * line reads as a collapse. A day where everything was excused on purpose has a
 * denominator of nothing (see `dayProgress`) and falls out the same way.
 *
 * TODAY IS INCLUDED, unlike in `streakOf`, and for the opposite reason: a streak
 * is a claim about a run that has to survive the evening, while the chart is a
 * picture of what is answered so far. The last point moving up as the day goes on
 * is the chart being live, not the chart being wrong.
 *
 * Percent rather than a count, because the denominator moves: a Monday asks for
 * nine things and a Sunday for six, and a line of raw counts would show a weekly
 * sawtooth that is about the schedule rather than about the person.
 */
export function taskTrendSeries(
  tasks: readonly Task[],
  log: TaskLog,
  range: TrendRange,
  today: string,
): TaskTrendPoint[] {
  const from = rangeStart(tasks, range, today);
  const points: TaskTrendPoint[] = [];

  for (let day = from; day <= today; day = shiftDay(day, 1)) {
    const { done, total } = dayProgress(tasks, log, day);
    if (total === 0) continue;
    const at = parseDay(day);
    if (!at) continue;
    at.setHours(12, 0, 0, 0);
    points.push({
      day,
      at: at.toISOString(),
      value: Math.round((done / total) * 100),
      done,
      asked: total,
    });
    // A malformed `today` would otherwise make this loop run forever.
    if (points.length > 3660) break;
  }

  return points;
}

/** What a range came to overall: the days, the ticks, and the share of them. */
export interface TaskTrendSummary {
  days: number;
  done: number;
  asked: number;
  /** 0–100, rounded, over the whole range rather than an average of averages. */
  percent: number;
  /** Days in the range with every scheduled task answered `done`. */
  perfectDays: number;
}

export function summarizeTaskTrend(points: readonly TaskTrendPoint[]): TaskTrendSummary {
  let done = 0;
  let asked = 0;
  let perfectDays = 0;
  for (const point of points) {
    done += point.done;
    asked += point.asked;
    if (point.done === point.asked) perfectDays += 1;
  }
  return {
    days: points.length,
    done,
    asked,
    percent: asked === 0 ? 0 : Math.round((done / asked) * 100),
    perfectDays,
  };
}

/* ------------------------------------------------------------------ */
/* The month, across every task                                        */
/* ------------------------------------------------------------------ */

/** One square of the whole-list calendar. */
export interface DayCell {
  day: number | null;
  date: string | null;
  /** How many of that day's tasks were done, and how many it asked for. */
  done: number;
  asked: number;
  /** 0–1. The square's fill is this, in five steps. */
  fraction: number;
  isToday: boolean;
  /** In the future, or before anything started — nothing to draw and nothing to say. */
  isBlank: boolean;
  /**
   * Every task that asked this day was excused on purpose — a paused day. Drawn
   * hatched, and out of the month's percentage like any excusal. Can be true on a
   * future day too: a pause is written ahead of time.
   */
  paused: boolean;
}

export interface DayMonth {
  year: number;
  month: number;
  label: string;
  weeks: DayCell[][];
  /** Days in the month that asked for anything, up to today. */
  days: number;
  done: number;
  asked: number;
  /** Days in the month (ahead of today included) on which everything was excused. */
  paused: number;
}

/**
 * A month of the WHOLE list, as a grid — one square per day, filled by how much
 * of that day got done.
 *
 * `taskMonth` above answers "how is this one habit going". This answers the other
 * question, the one the day screen cannot: WHICH DAY do I want to open. A month
 * of squares is a shape, and a shape is what tells you that the second week of
 * September went badly — which is the thing you then tap.
 *
 * Padded at the start only, like every other calendar in this app: a trailing pad
 * draws squares for days that have not happened, and an empty square reads as a
 * day you let go by.
 */
export function tasksMonth(
  tasks: readonly Task[],
  log: TaskLog,
  year: number,
  month: number,
  today: string,
  lang: Language = 'en',
): DayMonth {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lead = weekdayIndex(new Date(year, month, 1));

  const cells: DayCell[] = [];
  for (let i = 0; i < lead; i += 1) {
    cells.push({
      day: null,
      date: null,
      done: 0,
      asked: 0,
      fraction: 0,
      isToday: false,
      isBlank: true,
      paused: false,
    });
  }

  let days = 0;
  let done = 0;
  let asked = 0;
  let pausedDays = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = dayKey(new Date(year, month, day));
    const progress = dayProgress(tasks, log, date);
    // A future day has not been missed, and a day that asked for nothing is not
    // a day with a score — both are blank rather than empty.
    const isBlank = date > today || progress.total === 0;
    // Asked for something, and every one of those was excused: `total` is what is
    // left after excusals, so zero here with tasks asking means all of them.
    const paused = progress.total === 0 && tasks.some((task) => asksOn(task, date));
    if (paused) pausedDays += 1;
    if (!isBlank) {
      days += 1;
      done += progress.done;
      asked += progress.total;
    }
    cells.push({
      day,
      date,
      done: progress.done,
      asked: progress.total,
      fraction: isBlank ? 0 : progress.fraction,
      isToday: date === today,
      isBlank,
      paused,
    });
  }

  const weeks: DayCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return {
    year,
    month,
    label: formatMonth(year, month, lang),
    weeks,
    days,
    done,
    asked,
    paused: pausedDays,
  };
}

/* ------------------------------------------------------------------ */
/* Pause — a run of days excused in one action (T3)                    */
/* ------------------------------------------------------------------ */

/** One `(task, day)` square a pause wrote — what an Undo takes back. */
export interface ExcusedCell {
  taskId: ID;
  day: string;
}

/** The longest pause one action writes: a year. Past that it is an archive. */
export const PAUSE_MAX_DAYS = 366;

/** Calendar days from `from` to `to`, both counted, whichever order they come in. */
export function pauseLength(from: string, to: string): number {
  return Math.abs(daysBetween(from, to)) + 1;
}

/**
 * Excuse every day from `from` to `to` (inclusive, either order) for the tasks in
 * `taskIds`, in one action. Returns the new log and exactly which squares were
 * written, so an Undo can take back this pause and nothing else.
 *
 * Only on days a task asks on (`asksOn` — so not before it started, not after
 * its archive, not on a weekday task's off days, and a one-day task only on its
 * day). A `done` is never overwritten, an excusal already there is left as it
 * was (and not claimed by this pause's Undo), and a note survives untouched.
 * Archived tasks are skipped even if named. Future days are written too — see
 * the header.
 */
export function excuseRange(
  log: TaskLog,
  tasks: readonly Task[],
  taskIds: readonly ID[],
  from: string,
  to: string,
): { log: TaskLog; written: ExcusedCell[] } {
  const [first, last] = from <= to ? [from, to] : [to, from];
  if (!parseDay(first) || !parseDay(last)) return { log, written: [] };
  const chosen = new Set(taskIds);
  const written: ExcusedCell[] = [];
  let next = log;

  for (const task of tasks) {
    if (!chosen.has(task.id) || task.archivedAt !== null) continue;
    let days: Record<string, TaskEntry> | null = null;
    let day = first;
    for (let i = 0; i < PAUSE_MAX_DAYS && day <= last; i += 1, day = shiftDay(day, 1)) {
      if (!asksOn(task, day)) continue;
      const entry = entryOf(next, task.id, day);
      if (entry.mark !== null) continue;
      days ??= { ...(next[task.id] ?? {}) };
      days[day] = { mark: 'missed', note: entry.note };
      written.push({ taskId: task.id, day });
    }
    if (days) next = { ...next, [task.id]: days };
  }
  return { log: next, written };
}

/**
 * Excuse exactly these squares, where each is still unanswered — the inverse of
 * `clearExcused`, for the Undo of `Resume now`. A square answered in between is
 * left alone, by the same rule as the range.
 */
export function excuseCells(log: TaskLog, cells: readonly ExcusedCell[]): TaskLog {
  let next = log;
  for (const { taskId, day } of cells) {
    const entry = entryOf(next, taskId, day);
    if (entry.mark !== null) continue;
    next = {
      ...next,
      [taskId]: { ...(next[taskId] ?? {}), [day]: { mark: 'missed', note: entry.note } },
    };
  }
  return next;
}

/**
 * Take excusals back: each square that still says `missed` goes back to
 * unanswered, keeping its note. A square answered since (ticked on a day you came
 * home early) is left alone — the Undo is for the pause, not for what happened
 * after it.
 */
export function clearExcused(log: TaskLog, cells: readonly ExcusedCell[]): TaskLog {
  let next = log;
  for (const { taskId, day } of cells) {
    const entry = next[taskId]?.[day];
    if (!entry || entry.mark !== 'missed') continue;
    const days = { ...next[taskId] };
    if (entry.note === '') delete days[day];
    else days[day] = { mark: null, note: entry.note };
    next = { ...next };
    if (Object.keys(days).length === 0) delete next[taskId];
    else next[taskId] = days;
  }
  return next;
}

/**
 * The excusals AFTER today for one task — by construction a pause, since the day
 * screen never goes forward. What `Resume now` clears; today stays on the day
 * screen, where it can be answered like any other day.
 */
export function excusedAhead(task: Task, log: TaskLog, today: string): ExcusedCell[] {
  const days = log[task.id];
  if (!days) return [];
  return Object.keys(days)
    .filter((day) => day > today && days[day].mark === 'missed' && asksOn(task, day))
    .sort()
    .map((day) => ({ taskId: task.id, day }));
}

/**
 * The last day of a pause running now or starting tomorrow, or null.
 *
 * Walks forward from today (or tomorrow, when today is not excused) over the
 * days the task asks on while each is excused; the answer is the last one, if it
 * lies after today. A lone skip of today is not
 * a pause, and an excusal three weeks out with asked days in between is a pause
 * that has not started (`excusedAhead` still finds it for `Resume`).
 */
export function pausedUntil(task: Task, log: TaskLog, today: string): string | null {
  let last: string | null = null;
  let day = today;
  for (let i = 0; i < PAUSE_MAX_DAYS; i += 1, day = shiftDay(day, 1)) {
    if (!asksOn(task, day)) {
      // A one-day task past its day, or an archived one, asks on nothing more.
      if (task.schedule.kind === 'once' && day > task.schedule.day) break;
      continue;
    }
    if (entryOf(log, task.id, day).mark !== 'missed') {
      // Today may still be answered either way while a pause starts tomorrow.
      if (day === today) continue;
      break;
    }
    last = day;
  }
  return last !== null && last > today ? last : null;
}
