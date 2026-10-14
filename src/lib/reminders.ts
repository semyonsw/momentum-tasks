/**
 * What the phone should say, and when — computed, not scheduled.
 *
 *   Gym / Boxing        Mon · Wed · Fri   07:00   →  3 weekly alerts
 *   Read before sleep   Every day         22:30   →  1 daily alert
 *   Wash the dishes     Once · 14 Sep     09:00   →  1 dated alert
 *   the workout itself  Mon · Wed · Fri   18:00   →  3 weekly alerts
 *
 * ── WHY THE PLAN IS A PURE FUNCTION AND THE SCHEDULING IS NOT HERE ────────
 *
 * `lib/notify.ts` talks to Android. Everything it does can fail, none of it may
 * throw, and none of it can be tested without a phone — which is exactly the
 * wrong place for the decisions. WHICH tasks get an alert, on which days, at
 * what instant, in which language, and which ones are silently dropped because
 * their moment has passed: all of that is arithmetic over data the app already
 * has, and it is all here, where a test can read it.
 *
 * The result is a list of `PlannedReminder`s with stable ids. `syncReminders`
 * then does the dullest possible thing with it — cancel what this app scheduled,
 * schedule the plan — and because the plan is deterministic, two syncs in a row
 * with nothing changed produce the same alerts at the same instants.
 *
 * ── REPEATING WHERE IT CAN BE, DATED WHERE IT MUST BE ─────────────────────
 *
 * A daily or weekly trigger is handed to Android ONCE and then fires forever,
 * with the app closed, force-stopped, or never opened again. That is the only
 * behaviour a habit reminder can have: a scheme that re-arms the next fortnight
 * every time the app launches is a scheme that goes quiet exactly when somebody
 * has stopped opening the app, which is the week the reminder was for.
 *
 * A ONE-DAY task cannot be a repeat — it is one instant — so it gets a dated
 * alert, and one whose instant has already gone gets nothing rather than an
 * alert about a moment in the past.
 *
 * ── A TASK THAT HAS NOT STARTED YET GETS NOTHING, YET ─────────────────────
 *
 * Android's weekly trigger has no "not before" — it is a weekday and a time.
 * A habit set to begin on the 1st of next month would therefore start buzzing
 * this Monday, which is the app contradicting the date the user just typed.
 * So a task whose `startedOn` is still in the future contributes no alert, and
 * picks one up at the next sync after it begins. Sync runs on every launch and
 * every return to the foreground, so "the next sync" is the first time the user
 * so much as looks at the phone — and somebody who scheduled a habit to start
 * next month will open this app before next month.
 *
 * ── FOLLOW-UPS ARE DATED, AND AN ANSWERED DAY GETS NONE ───────────────────
 *
 * A reminder can ask again every N minutes (`TaskReminder.every`) until the day
 * is answered. Those follow-ups are DATED alerts, never repeats, even for a
 * daily task, because a repeat cannot be told that today is done: a daily
 * 09:30 follow-up would go on buzzing at a task ticked at 09:05. Dated, they
 * can be planned against the log, and ticking the task re-syncs the queue
 * (`useReminders` watches the log), which cancels the rest of the day's.
 *
 * The cost is that they only reach as far ahead as the last sync:
 * `FOLLOW_UP_DAYS` days, re-planned on every launch and every return to the
 * foreground. The first alert of a daily task stays a repeat and keeps firing
 * with the app untouched for a month. Only the "and again" stops, after a few
 * days of the app not being opened, which is the right half to lose.
 *
 * A one-day task is all dated, so for it the log decides everything: ticked
 * off before its time, it never buzzes at all.
 *
 * ── A PAUSE TURNS THE REPEAT INTO DATED ALERTS, FOR AS LONG AS IT MATTERS ──
 *
 * A pause (T-03) is the missed-on-purpose mark written on each day ahead, and
 * a repeat cannot read the log — so a daily 07:00 went on buzzing through the
 * holiday the user had just told the app about. While a task has an excused
 * day within `PAUSE_LOOKAHEAD_DAYS`, its own alert is therefore planned DAY BY
 * DAY instead (`plainAlarmDays`): every asking day from today to
 * `AFTER_PAUSE_DAYS` past the last excused one, skipping the excused days and
 * whatever the follow-up rule already treats as finished (an answered day, a
 * weekly task's met week). With nothing excused ahead, the repeat stays, and
 * with it everything the section above argues for.
 *
 * Rejected: dating EVERY task's alert for the next fortnight. It would make
 * the pause case uniform, and bring back the failure the repeat exists to
 * avoid, for every user, every fortnight they do not open the app. Rejected
 * too: cancelling the repeat for the pause and re-arming it after — Android's
 * repeat has no "not before", so the re-arm needs a sync on the right day,
 * which is the dated scheme with extra steps. What this costs instead: a pause
 * starting more than four weeks out keeps the repeat until a sync falls
 * inside those four weeks (any launch does), and somebody who opens the app
 * neither during the pause nor for two weeks after it gets silence after
 * that, not a buzz on a day they excused. Silence is the right half to lose.
 *
 * The budget: Android holds ~500 alarms per app, shared with the rest timer.
 * Dated plain alerts are capped at `MAX_PAUSED_ALERTS_PER_TASK` each and
 * `MAX_PAUSED_ALERTS` in all (soonest kept), follow-ups at `MAX_FOLLOW_UPS`,
 * and the repeats are one per task-weekday — so the queue stays well under it.
 * Excused days cost nothing, which is why a long pause is cheap.
 */

import { parseClockTime, parseDay, shiftDay } from './days';
import { t, type Language } from './i18n';
import {
  asksOn,
  describeSchedule,
  entryOf,
  PAUSE_MAX_DAYS,
  weekProgress,
  type Task,
  type TaskLog,
  type Weekday,
} from './tasks';

/** When an alert fires. Two repeat forever; the third is one instant. */
export type ReminderTrigger =
  | { kind: 'daily'; hour: number; minute: number }
  /** Monday = 0 … Sunday = 6, as the whole app counts. */
  | { kind: 'weekly'; weekday: Weekday; hour: number; minute: number }
  /** Epoch ms. For the one-day tasks, which are not a repeat. */
  | { kind: 'date'; at: number };

export interface PlannedReminder {
  /**
   * Stable across syncs for the same task and the same day of the week.
   *
   * It is the notification's identifier, which is what makes a re-sync a
   * REPLACEMENT rather than a duplicate: scheduling `task:t7:w2` again overwrites
   * the one already sitting in Android's queue instead of adding a second alert
   * for the same task at the same minute.
   */
  id: string;
  title: string;
  body: string;
  trigger: ReminderTrigger;
}

export interface ReminderInputs {
  tasks: readonly Task[];
  workout: {
    enabled: boolean;
    days: readonly Weekday[];
    /** `HH:MM`, 24-hour. */
    time: string;
  };
  lang: Language;
  /** Now, for deciding which dated alerts have already gone. */
  now: Date;
  /**
   * The answers so far. A day with a mark on it is finished, and gets no more
   * follow-ups (nor, for a one-day task, its first alert). Absent = nothing
   * answered yet.
   */
  log?: TaskLog;
}

/** Anything closer than this is not a cue, it is a notification about the past. */
const MIN_LEAD_MS = 30_000;

/** How many days ahead a follow-up is planned: today and the next two. */
const FOLLOW_UP_DAYS = 3;

/**
 * The most follow-ups one task gets in one day. Every 15 minutes, that is three
 * hours of asking, and every 3 hours it is the whole waking day. Past either,
 * the task is not forgotten. It is being declined.
 */
export const MAX_FOLLOW_UPS_PER_DAY = 12;

/**
 * The most follow-ups armed at once, across every task.
 *
 * Android holds about 500 alarms per app and then refuses the next one, and
 * the rest timer's alerts come from the same budget. A rest that ends in
 * silence because twenty tasks were nagging is the wrong trade, so the
 * soonest ones win and the far end of the window waits for a later sync.
 */
export const MAX_FOLLOW_UPS = 120;

/** An excused day closer than this switches a task's repeat to dated alerts. */
export const PAUSE_LOOKAHEAD_DAYS = 28;

/** How far past the last excused day the dated alerts reach. */
export const AFTER_PAUSE_DAYS = 14;

/** The most dated plain alerts one paused task holds at once. */
export const MAX_PAUSED_ALERTS_PER_TASK = PAUSE_LOOKAHEAD_DAYS + AFTER_PAUSE_DAYS;

/**
 * The most dated plain alerts across every paused task. With `MAX_FOLLOW_UPS`
 * and the repeats it leaves room under Android's ~500 for the timer's two.
 */
export const MAX_PAUSED_ALERTS = 200;

/** Far enough to find the end of the longest pause `excuseRange` writes. */
const PAUSE_SCAN_DAYS = PAUSE_LOOKAHEAD_DAYS + PAUSE_MAX_DAYS;

/**
 * Which days a task's own (first) alert must be dated on, or null when the
 * ordinary repeat is right — see "A PAUSE TURNS THE REPEAT…" in the header.
 *
 * Null unless an asking day within `PAUSE_LOOKAHEAD_DAYS` of today (today
 * included: a skip of today counts) carries the missed-on-purpose mark. Then:
 * every day from today to `AFTER_PAUSE_DAYS` past the last excused day ahead
 * that the task asks on, is not answered, and is not in a weekly task's met
 * week — the same rule follow-ups use — at most `MAX_PAUSED_ALERTS_PER_TASK`.
 * Not-begun and one-day tasks never reach here (`planReminders` handles them).
 */
export function plainAlarmDays(task: Task, log: TaskLog, today: string): string[] | null {
  const excused = (day: string) =>
    asksOn(task, day) && entryOf(log, task.id, day).mark === 'missed';
  let first: string | null = null;
  for (let i = 0; i < PAUSE_LOOKAHEAD_DAYS && first === null; i += 1) {
    const day = shiftDay(today, i);
    if (excused(day)) first = day;
  }
  if (first === null) return null;

  const horizon = shiftDay(today, PAUSE_SCAN_DAYS);
  let last = first;
  for (const day of Object.keys(log[task.id] ?? {})) {
    if (day > last && day <= horizon && excused(day)) last = day;
  }

  const end = shiftDay(last, AFTER_PAUSE_DAYS);
  const days: string[] = [];
  for (let day = today; day <= end; day = shiftDay(day, 1)) {
    if (!asksOn(task, day)) continue;
    if (entryOf(log, task.id, day).mark !== null) continue;
    if (weekProgress(task, log, day)?.met === true) continue;
    days.push(day);
    if (days.length >= MAX_PAUSED_ALERTS_PER_TASK) break;
  }
  return days;
}

/**
 * The whole plan: every alert this app wants Android to be holding.
 *
 * Deterministic and total — an unreadable time, an archived task, a one-day task
 * whose day was last week all fall out quietly rather than producing an alert
 * that cannot fire.
 */
export function planReminders(input: ReminderInputs): PlannedReminder[] {
  const plan: PlannedReminder[] = [];
  const followUps: (PlannedReminder & { at: number })[] = [];
  const pausedAlerts: (PlannedReminder & { at: number })[] = [];
  const todayKey = dayKeyOf(input.now);
  const log = input.log ?? {};
  const answered = (task: Task, day: string) => entryOf(log, task.id, day).mark !== null;
  // A weekly task (T2) whose week is already met has nothing left to ask that week.
  const weekMet = (task: Task, day: string) => weekProgress(task, log, day)?.met === true;

  for (const task of input.tasks) {
    if (task.archivedAt !== null) continue;
    const at = task.reminder;
    if (!at) continue;

    if (at.every) {
      for (let offset = 0; offset < FOLLOW_UP_DAYS; offset += 1) {
        const day = shiftDay(todayKey, offset);
        if (!asksOn(task, day) || answered(task, day) || weekMet(task, day)) continue;
        followUps.push(...followUpsOn(task, day, at.every, input));
      }
    }

    /*
     * The TASK'S OWN NAME is the headline, and the schedule is the second line.
     *
     * Not "Reminder: wash the dishes" — the notification shade is a list of
     * one-line headlines and the useful half has to be the half that is read.
     * The body says which commitment it is ("Every day", "Mon · Wed · Fri"), so
     * a buzz at 07:00 is legible without opening anything.
     */
    const title = task.name;
    const body = describeSchedule(task.schedule, input.lang);

    if (task.schedule.kind === 'once') {
      // Already done, so the alert would be about a job that no longer exists.
      if (answered(task, task.schedule.day)) continue;
      const fireAt = instantOn(task.schedule.day, at.hour, at.minute);
      // Already gone: a phone buzzing about yesterday's dishes is worse than
      // silence, and it is the only thing a past instant could produce.
      if (fireAt == null || fireAt - input.now.getTime() < MIN_LEAD_MS) continue;
      plan.push({
        id: `task:${task.id}:once`,
        title,
        body,
        trigger: { kind: 'date', at: fireAt },
      });
      continue;
    }

    // Not begun yet — see the file header on why this is nothing rather than a
    // weekly alert that would start early.
    if (task.startedOn > todayKey) continue;

    // A pause ahead: the repeat would ring through it, so the days are dated.
    const dated = plainAlarmDays(task, log, todayKey);
    if (dated) {
      for (const day of dated) {
        const fireAt = instantOn(day, at.hour, at.minute);
        if (fireAt == null || fireAt - input.now.getTime() < MIN_LEAD_MS) continue;
        pausedAlerts.push({
          id: `task:${task.id}:${day}`,
          title,
          body,
          trigger: { kind: 'date', at: fireAt },
          at: fireAt,
        });
      }
      continue;
    }

    // A weekly task is offered every day, so its alert is a daily one.
    if (task.schedule.kind === 'daily' || task.schedule.kind === 'weekly') {
      plan.push({
        id: `task:${task.id}:daily`,
        title,
        body,
        trigger: { kind: 'daily', hour: at.hour, minute: at.minute },
      });
      continue;
    }

    for (const weekday of [...task.schedule.days].sort((a, b) => a - b)) {
      plan.push({
        id: `task:${task.id}:w${weekday}`,
        title,
        body,
        trigger: { kind: 'weekly', weekday, hour: at.hour, minute: at.minute },
      });
    }
  }

  if (input.workout.enabled && input.workout.days.length > 0) {
    const at = parseClockTime(input.workout.time);
    if (at) {
      for (const weekday of [...input.workout.days].sort((a, b) => a - b)) {
        plan.push({
          id: `workout:w${weekday}`,
          title: t('Time to train', input.lang),
          body: t('Workout reminder', input.lang),
          trigger: { kind: 'weekly', weekday, hour: at.hour, minute: at.minute },
        });
      }
    }
  }

  pausedAlerts.sort((a, b) => a.at - b.at);
  for (const { id, title, body, trigger } of pausedAlerts.slice(0, MAX_PAUSED_ALERTS)) {
    plan.push({ id, title, body, trigger });
  }

  // Soonest first, so the cap drops the far end of the window, which a later
  // sync will plan again anyway, and never the one due in ten minutes.
  followUps.sort((a, b) => a.at - b.at);
  for (const { id, title, body, trigger } of followUps.slice(0, MAX_FOLLOW_UPS)) {
    plan.push({ id, title, body, trigger });
  }

  return plan;
}

/**
 * One day's "and again" alerts: `every` minutes after the first, then after
 * that, until the cap or midnight, and none that has already gone.
 */
function followUpsOn(
  task: Task,
  day: string,
  every: number,
  input: ReminderInputs,
): (PlannedReminder & { at: number })[] {
  const first = task.reminder && instantOn(day, task.reminder.hour, task.reminder.minute);
  if (first == null) return [];
  const midnight = instantOn(shiftDay(day, 1), 0, 0);
  const out: (PlannedReminder & { at: number })[] = [];
  const body = `${t('Still not done', input.lang)} · ${describeSchedule(task.schedule, input.lang)}`;
  for (let n = 1; n <= MAX_FOLLOW_UPS_PER_DAY; n += 1) {
    const at = first + n * every * 60_000;
    if (midnight != null && at >= midnight) break;
    if (at - input.now.getTime() < MIN_LEAD_MS) continue;
    out.push({
      id: `task:${task.id}:${day}:again${n}`,
      title: task.name,
      body,
      trigger: { kind: 'date', at },
      at,
    });
  }
  return out;
}

/**
 * One string that changes exactly when the plan does — what `useReminders`
 * compares to skip a sync that would re-arm the same queue.
 */
export function planKey(plan: readonly PlannedReminder[]): string {
  return JSON.stringify(plan.map((r) => [r.id, r.title, r.body, r.trigger]));
}

/* ------------------------------------------------------------------ */

/** Local midnight-based `YYYY-MM-DD`, without importing the day module's Date path. */
function dayKeyOf(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `2026-09-14` + 09:00 → epoch ms in LOCAL time, or null for a junk day. */
export function instantOn(day: string, hour: number, minute: number): number | null {
  const date = parseDay(day);
  if (!date) return null;
  date.setHours(hour, minute, 0, 0);
  const at = date.getTime();
  return Number.isFinite(at) ? at : null;
}
