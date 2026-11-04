/**
 * Which LOG an app counts — the seam for everything that reads more than one.
 *
 * Badges, XP, Wrapped, insights and the weekly review were written for one app
 * holding three logs, and each of them gathers all three. Since 3.0.0 each APK
 * is one log (`lib/appVariant.ts`), and the Workout app is ALSO still holding
 * the tasks and the money a 2.x install wrote — kept on purpose, never shown.
 * If any of these read straight off the stores, the Workout app's Wrapped would
 * have a "Top category" card about money it no longer shows, and its level
 * would be worth five XP a ticked task.
 *
 * So the filtering is ONE function, applied to the inputs rather than threaded
 * through each calculation: `scopeLogs` hands back the same input with every
 * other section's series emptied. Each calculation already draws nothing for
 * an empty log — that was the house rule when somebody used only one of the
 * three — so a scoped input needs no second code path, and "the Workout app
 * says nothing about money" is the same guarantee, already tested, as "a user
 * with no amounts sees no money card".
 *
 * Rejected: deleting the other logs from the Workout app's store (the legacy
 * data must survive until it has been imported elsewhere), and a per-feature
 * `if (variant === …)` in each lib (five places to forget one series, where
 * this is one).
 *
 * Pure and parameterised by the variant: the hooks pass `APP_VARIANT`, the
 * tests pass all three.
 */

import type { AppVariant } from './appVariant';

/** A log, as the badges name them: `BadgeDomain` is this type. */
export type LogSection = 'workout' | 'tasks' | 'money';

/** The one log each app keeps. */
export function variantLog(variant: AppVariant): LogSection {
  return variant === 'tasks' ? 'tasks' : variant === 'expenses' ? 'money' : 'workout';
}

/**
 * The series the cross-log features read, by the names their inputs already use.
 * Every key optional, so each feature's own input type fits.
 */
export interface SectionLogs {
  workouts?: readonly unknown[];
  numbers?: Readonly<Record<string, number>>;
  tasks?: readonly unknown[];
  log?: Readonly<Record<string, unknown>>;
  amounts?: readonly unknown[];
  categories?: readonly unknown[];
  budgets?: readonly unknown[];
  goals?: readonly unknown[];
  accounts?: readonly unknown[];
}

const WORKOUT_KEYS = ['workouts', 'numbers'] as const;
const TASK_KEYS = ['tasks', 'log'] as const;
const MONEY_KEYS = ['amounts', 'categories', 'budgets', 'goals', 'accounts'] as const;
const RECORD_KEYS: ReadonlySet<string> = new Set(['numbers', 'log']);

/**
 * The same input, with every log but `variant`'s emptied. Keys the input does
 * not have stay absent; everything that is not a log (`today`, `period`, a
 * bodyweight lookup) is passed through untouched.
 */
export function scopeLogs<T extends SectionLogs>(variant: AppVariant, input: T): T {
  const keep = variantLog(variant);
  const out = { ...input } as Record<string, unknown>;
  const empty = (keys: readonly string[]) => {
    for (const key of keys) {
      if (key in out) out[key] = RECORD_KEYS.has(key) ? {} : [];
    }
  };
  if (keep !== 'workout') empty(WORKOUT_KEYS);
  if (keep !== 'tasks') empty(TASK_KEYS);
  if (keep !== 'money') empty(MONEY_KEYS);
  return out as T;
}

/** `scopeLogs` when a variant was given; the input as it is when not (the 2.x reading). */
export function maybeScope<T extends SectionLogs>(variant: AppVariant | undefined, input: T): T {
  return variant === undefined ? input : scopeLogs(variant, input);
}
