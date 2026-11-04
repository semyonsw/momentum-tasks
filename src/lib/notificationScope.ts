/**
 * What each app may put on the phone's notification shade, and the channels it
 * creates for it.
 *
 *              task reminders  workout reminders  budget alerts  timer channels
 *   Workout          –                ●                 –               ●
 *   Tasks            ●                –                 –               –
 *   Expenses         –                –                 ●               –
 *
 * ── WHY THE WORKOUT APP STOPS ARMING THE TASKS ────────────────────────────
 *
 * The Workout app is the 2.x install, so its store still holds every task and
 * every budget the combined app had (`lib/appVariant.ts`). Planning from that
 * store unfiltered would keep buzzing "Read before sleep" from an app with no
 * way to tick it off — and, once the Tasks app is installed and imported, twice
 * a night, once from each. So each app arms only what belongs to the log it
 * shows. The first sync after the update cancels the task alerts 2.x had left
 * in the Workout app's queue (they carry the `reminder` marker), and the Tasks
 * app arms them again from its import.
 *
 * ── WHY "CANCEL EVERY REMINDER" IS STILL SAFE IN THREE APPS ───────────────
 *
 * `syncReminders` cancels everything in the queue marked as a reminder and
 * schedules the plan. With three apps on one phone that would be a bug if the
 * queue were shared — but it is not: on Android, scheduled notifications are
 * held per application (expo-notifications keeps them in the app's own private
 * storage and arms them through the app's own `AlarmManager` uid), and
 * `getAllScheduledNotificationsAsync` returns only the calling app's. The Tasks
 * app cannot see, let alone cancel, a workout reminder the Workout app armed.
 * The marker still matters INSIDE an app: it is what keeps a reminder sync from
 * cancelling the running rest timer's alert in the Workout app.
 *
 * ── WHY THE CHANNELS ARE PER APP ──────────────────────────────────────────
 *
 * A channel is what the phone's notification settings list under the app, and
 * a "Timer finished" channel in an app with no timer is a setting that does
 * nothing — exactly the kind of row that makes people distrust the rest. So
 * the timer's two channels exist only in the Workout app, and every app gets
 * the one `reminders` channel (the budget alert is presented on it too), with
 * a description that says what THIS app sends on it.
 */

import type { AppVariant } from './appVariant';

export interface NotificationScope {
  /** A task's own reminder and its follow-ups (`planReminders`). */
  taskReminders: boolean;
  /** The workout schedule's weekly alerts (`planReminders`). */
  workoutReminders: boolean;
  /** A budget crossing 80% / 100% (`useBudgetAlerts`). */
  budgetAlerts: boolean;
  /** The rest / set timer's `go` and `getset` channels. */
  timerChannels: boolean;
}

export function notificationScope(variant: AppVariant): NotificationScope {
  return {
    taskReminders: variant === 'tasks',
    workoutReminders: variant === 'workout',
    budgetAlerts: variant === 'expenses',
    timerChannels: variant === 'workout',
  };
}

/** The Android channels an app creates, by role. `reminder` is in all three. */
export type ChannelRole = 'go' | 'getset' | 'reminder';

export function channelsFor(variant: AppVariant): ChannelRole[] {
  return notificationScope(variant).timerChannels ? ['go', 'getset', 'reminder'] : ['reminder'];
}

/**
 * The reminder channel's description in the phone's settings — English, and
 * translated through the catalogue by the caller.
 */
export function reminderChannelDescription(variant: AppVariant): string {
  if (variant === 'tasks') return 'A task, at the time you asked to be reminded.';
  if (variant === 'expenses') return 'A budget nearing or passing its limit.';
  return 'A workout, at the time you asked to be reminded.';
}
