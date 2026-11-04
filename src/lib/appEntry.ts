/**
 * What each app runs in the background — the decision behind `App.tsx`'s mounts.
 *
 * The three apps share one entry (`lib/appVariant.ts`), and most of what it
 * starts belongs to one log:
 *
 *   sessionClock   the timer alerts, the boxing round chain and the set timer's
 *                  bell — all read a running workout, which only Workout has
 *   history        the training log's second read and the 0.10 migration — the
 *                  log is SQLite and only Workout ever opens it on purpose
 *   healthConnect  a finished workout written to Health Connect; the module and
 *                  its permission are not even in the other two APKs
 *                  (`app.config.js`), so this is the JS side of the same line
 *   budgetAlerts   the money's 80% warnings — Expenses only. The Workout app
 *                  still holds the old money on disk, and a warning about it
 *                  would be about an app the user is not in
 *   reminders      every app: the sync itself decides which reminders are this
 *                  app's (tasks' in Tasks, the training schedule in Workout), so
 *                  the mount stays unconditional and the rule lives with the rest
 *                  of the reminder logic in `hooks/useReminders.ts`
 *
 * Rejected: mounting everything everywhere and letting empty stores make it a
 * no-op. The Tasks and Expenses apps do start empty — but the Workout app does
 * not, and "empty" stops being true the day a combined backup is imported.
 */

import type { AppVariant } from './appVariant';

export interface AppMounts {
  sessionClock: boolean;
  history: boolean;
  healthConnect: boolean;
  budgetAlerts: boolean;
  reminders: boolean;
}

export function mountsFor(variant: AppVariant): AppMounts {
  const workout = variant === 'workout';
  return {
    sessionClock: workout,
    history: workout,
    healthConnect: workout,
    budgetAlerts: variant === 'expenses',
    reminders: true,
  };
}
