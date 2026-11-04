/**
 * What the assistant is allowed to know — built on the phone, from the tasks
 * store, and small.
 *
 *   buildTasksContext   the tasks, and per task: asked, done, excused, missed,
 *                       streaks, weekday rates; plus the daily completion line
 *                       and every note the user wrote on a day
 *
 * ── NEVER THE WHOLE LOG AS IT IS STORED ────────────────────────────────────
 *
 * A model given every raw entry does worse arithmetic than a model given the
 * summary the app would have drawn anyway. So the builder hands over what a
 * screen of this app already shows — the streak, the weekday rates, the daily
 * line the trend chart draws — and stays under `CONTEXT_CAP` characters by
 * shedding the OLDEST detail first.
 *
 * ── THE SAME RULES AS EVERY OTHER SCREEN ───────────────────────────────────
 *
 * A task marked missed on purpose is `excused`, not a miss. A weekly task owes
 * no single day. A counted task is done only when its count reached the target.
 *
 * It returns the JSON string plus how much was read (for "Reading 41 days…").
 */

import { dayKey, parseDay, shiftDay, weekStart, weekdayIndex, weekdayLabels } from '../days';
import {
  asksOn,
  dayProgress,
  entryOf,
  isCounted,
  isWeekly,
  streakOf,
  weekProgress,
  type Task,
  type WeekProgress,
  type TaskLog,
} from '../tasks';
import type { Language } from '../i18n';
import type { ID } from '../../types/models';

const DAY_MS = 86_400_000;

/**
 * The size every context is held under, in characters of JSON.
 *
 * 400,000 — about 100,000 tokens, a tenth of the model's window. At 24,000 the
 * shedding loops were the normal path rather than the safety net: the chat saw
 * 90 days, and "what did I do in March?" had no answer because March had been
 * thrown away before the question was asked. Years of answered days and notes
 * fit well under this, so it sends ALL of it for any realistic log and still
 * sheds oldest-first past that.
 */
export const CONTEXT_CAP = 400_000;

export const LANGUAGE_NAME: Record<Language, string> = { ru: 'Russian', en: 'English' };

/* ------------------------------------------------------------------ */
/* Tasks                                                               */
/* ------------------------------------------------------------------ */

export interface TasksContextInput {
  tasks: readonly Task[];
  log: TaskLog;
  /** `YYYY-MM-DD`. */
  today: string;
  lang: Language;
  /** Defaults to the whole history: back to the first task or first mark, at least 90 days. */
  days?: number;
  /** Overrides `CONTEXT_CAP` — for tests that exercise the shedding. */
  cap?: number;
}

/** Ten years of days — a bound on a window read off user data, not a limit anyone reaches. */
const MAX_TASK_DAYS = 3650;

/** Days from the first thing the log knows about to `today`, inclusive — at least 90. */
function taskHistoryDays(tasks: readonly Task[], log: TaskLog, today: string): number {
  let earliest = today;
  const consider = (day: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && day < earliest) earliest = day;
  };
  for (const task of tasks) consider(task.startedOn);
  for (const days of Object.values(log)) for (const day of Object.keys(days)) consider(day);
  const from = parseDay(earliest);
  const to = parseDay(today);
  if (!from || !to) return 90;
  const span = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
  return Math.min(MAX_TASK_DAYS, Math.max(90, span));
}

export interface TasksContext {
  json: string;
  /** Days in the window that asked for anything — "Reading 90 days of tasks…". */
  dayCount: number;
}

function scheduleLabel(task: Task): string {
  const schedule = task.schedule;
  if (schedule.kind === 'daily') return 'every day';
  if (schedule.kind === 'once') return `once on ${schedule.day}`;
  if (schedule.kind === 'weekly') return `${schedule.times}x a week, any days`;
  const labels = weekdayLabels('en');
  return schedule.days.length === 0 ? 'never' : schedule.days.map((d) => labels[d]).join(' ');
}

export function buildTasksContext(input: TasksContextInput): TasksContext {
  const { tasks, log, today, lang } = input;
  const cap = input.cap ?? CONTEXT_CAP;
  /* The whole history by default: "how was my reading in spring?" is about a
     spring the old 90-day window had already dropped. */
  const days = input.days ?? taskHistoryDays(tasks, log, today);
  const first = shiftDay(today, -(days - 1));
  const window: string[] = [];
  for (let day = first; day <= today; day = shiftDay(day, 1)) window.push(day);
  const labels = weekdayLabels('en');

  /* Archived tasks too: their past days are still the user's past, and the
     trend screen counts them (`asksOn` stops one on the day it was archived).
     Leaving them out made the model's daily numbers disagree with the chart. */
  const perTask = tasks.map((task) => {
    const doneDays: string[] = [];
    const excusedDays: string[] = [];
    /** A counted task's days short of the target, `day:count` (T1). */
    const partialDays: string[] = [];
    let asked = 0;
    let done = 0;
    let excused = 0;
    let missed = 0;
    let run = 0;
    let best = 0;
    const byWeekday = labels.map(() => ({ counted: 0, done: 0 }));
    for (const day of window) {
      // Every window day comes off `shiftDay`, so it always parses; the guard is
      // the type's, not a case that happens.
      const date = parseDay(day);
      if (!date || !asksOn(task, day)) continue;
      asked += 1;
      const { mark } = entryOf(log, task.id, day);
      const weekday = weekdayIndex(date);
      if (mark === 'missed') {
        // Excused ON PURPOSE: out of the denominator, and the run steps over it.
        excused += 1;
        excusedDays.push(day);
        continue;
      }
      if (mark === 'done') {
        done += 1;
        doneDays.push(day);
        run += 1;
        best = Math.max(best, run);
        byWeekday[weekday].counted += 1;
        byWeekday[weekday].done += 1;
      } else if (isWeekly(task)) {
        // Offered, not owed (T2): an unanswered day is not a miss; the week is judged.
      } else if (day < today) {
        missed += 1;
        run = 0;
        byWeekday[weekday].counted += 1;
      }
      const count = entryOf(log, task.id, day).count;
      if (mark !== 'done' && isCounted(task) && count) partialDays.push(`${day}:${count}`);
    }
    const rates = Object.fromEntries(
      byWeekday
        .map((w, i) => [labels[i], w.counted > 0 ? Math.round((w.done / w.counted) * 100) : null])
        .filter(([, rate]) => rate != null),
    );
    const row: Record<string, unknown> = {
      id: task.id,
      name: task.name,
      schedule: scheduleLabel(task),
      since: task.startedOn,
    };
    if (task.reminder) {
      row.remind = `${String(task.reminder.hour).padStart(2, '0')}:${String(task.reminder.minute).padStart(2, '0')}`;
      if (task.reminder.every) row.remindAgainEveryMin = task.reminder.every;
    }
    // A habit to avoid (T7): its done days are days the user held off.
    if (task.avoid) row.avoid = true;
    if (isWeekly(task)) {
      // Judged by the week (T2): weeks met and short in the window, and the
      // streak and best run in weeks rather than days.
      let met = 0;
      let short = 0;
      let weeks = 0;
      let bestWeeks = 0;
      for (let monday = weekStart(first); monday <= today; monday = shiftDay(monday, 7)) {
        const week = weekProgress(task, log, monday) as WeekProgress;
        if (week.met) {
          met += 1;
          weeks += 1;
          bestWeeks = Math.max(bestWeeks, weeks);
        } else if (week.needed > 0 && week.to < today) {
          short += 1;
          weeks = 0;
        }
      }
      Object.assign(row, { weeksMet: met, weeksShort: short, bestWeekStreak: bestWeeks });
      const current = weekProgress(task, log, today) as WeekProgress;
      row.thisWeek = `${current.done}/${current.needed}`;
    }
    if (task.target) {
      row.target = `${task.target.count} ${task.target.unit.trim() || 'times'} a day`;
    }
    if (task.archivedAt) row.archivedOn = dayKey(task.archivedAt);
    Object.assign(row, {
      asked,
      done,
      excused,
      missed,
      streak: streakOf(task, log, today),
      ...(isWeekly(task) ? { streakUnit: 'weeks' } : { bestStreak: best }),
      donePctByWeekday: rates,
      // The days themselves, so "what did I do on the 12th?" has an answer.
      doneOn: doneDays,
      ...(excusedDays.length ? { excusedOn: excusedDays } : {}),
      ...(partialDays.length ? { partialOn: partialDays } : {}),
    });
    return row;
  });

  const daily: string[] = [];
  for (const day of window) {
    const progress = dayProgress(tasks, log, day);
    // A day that asked for nothing is left out, as the trend screen leaves it out.
    if (progress.total === 0) continue;
    // The full date: a window that crosses New Year has two `01-02`s otherwise.
    daily.push(`${day}:${Math.round(progress.fraction * 100)}`);
  }

  /*
   * THE NOTES written on answered days — "only 10 pages, tired", "did it at the
   * gym instead" — newest first. The ticks say THAT a habit slipped; the notes
   * are the only place that says why.
   */
  const names: Record<ID, string> = Object.fromEntries(tasks.map((task) => [task.id, task.name]));
  const noted: string[] = [];
  for (const [taskId, days] of Object.entries(log)) {
    if (!names[taskId]) continue;
    for (const [day, entry] of Object.entries(days)) {
      if (day < first || day > today) continue;
      const note = entry.note.trim().replace(/\s+/g, ' ');
      if (note === '') continue;
      const mark = entry.mark === 'done' ? 'done' : entry.mark === 'missed' ? 'excused' : 'open';
      noted.push(`${day} ${names[taskId]} (${mark}): ${note}`);
    }
  }
  noted.sort((a, b) => b.localeCompare(a));
  let noteLimit = noted.length;

  const base = {
    today,
    language: LANGUAGE_NAME[lang],
    window: `${first}..${today}`,
    note: 'excused = the user chose not to on purpose, never a miss; missed = asked and left unanswered; notes are what the user wrote on a day, newest first',
    ...(tasks.some((task) => task.avoid)
      ? {
          avoidNote:
            'a task with avoid: true is a habit to NOT do (e.g. no sugar): done means the user avoided it that day; an unanswered day is unknown, not a lapse and not a success',
        }
      : {}),
    ...(tasks.some(isWeekly)
      ? {
          weeklyNote:
            'a task asked N times a week owes no single day: an unanswered day is not a miss; a week (Mon-Sun) is met when done days reach N, and its streak is in weeks',
        }
      : {}),
    ...(tasks.some(isCounted)
      ? {
          targetNote:
            'a task with a target is done on a day only when the count reached it; partialOn lists days short of it as day:count, and those count as missed',
        }
      : {}),
    tasks: perTask,
  };
  let dailyRows = daily;
  const render = () =>
    JSON.stringify({
      ...base,
      dailyDonePct: dailyRows,
      ...(noteLimit > 0 ? { notes: noted.slice(0, noteLimit) } : {}),
    });
  let json = render();
  while (json.length > cap && noteLimit > 20) {
    noteLimit = Math.max(20, Math.floor(noteLimit * 0.8));
    json = render();
  }
  while (json.length > cap && dailyRows.length > 14) {
    dailyRows = dailyRows.slice(Math.ceil(dailyRows.length / 4));
    json = render();
  }
  while (json.length > cap && noteLimit > 0) {
    noteLimit -= 1;
    json = render();
  }
  return { json, dayCount: daily.length };
}
