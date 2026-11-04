/**
 * THE LAUNCH SCREEN'S CLOCK — what it shows as loaded, and when it may leave.
 *
 * The animated splash is not decoration over a wait: its chips are the stores
 * the app reads on a cold start, and each one ticks when THAT STORE has actually
 * finished. Since 3.0.0 each app has ONE log (`lib/appVariant.ts`) — the workout
 * log, the tasks or the money — so each app waits on its own store and shows its
 * own chip. The Workout app still carries the old tasks and money on disk, and
 * still hydrates them, but nothing on its screens reads them, so a launch that
 * waited for them would be waiting for nobody. Two things have to be decided,
 * and both are decided here where they can be tested:
 *
 *  1. WHEN A CHIP TICKS. A store that finishes in 4 ms would tick before its chip
 *     has even faded in, and stores that finish together would tick as one. So
 *     the k-th store to finish ticks at the later of its own finish and the k-th
 *     SLOT (700, 1150, 1600 ms — the design's pacing). The ORDER is the stores'
 *     real order; only the earliest moment each may be shown is paced.
 *
 *  2. WHEN THE SPLASH LEAVES. Every store this app waits on ticked and at least
 *     2.3 s gone — the floor the choreography needs to read as one thing — or
 *     6 s gone whatever the stores say. The ceiling matters more than the floor:
 *     a store that never reports ready must not be a launch that never ends, and
 *     every screen behind this one already has its own state for data that could
 *     not be read.
 */

import type { AppVariant } from './appVariant';

export type LaunchStore = 'history' | 'tasks' | 'money';

/** Every store, in chip order — the order ties are broken in. */
const LAUNCH_STORES: readonly LaunchStore[] = ['history', 'tasks', 'money'];

/** The store each app's screens are built on, and so the one its launch waits for. */
export function launchStores(variant: AppVariant): readonly LaunchStore[] {
  return variant === 'tasks' ? ['tasks'] : variant === 'expenses' ? ['money'] : ['history'];
}

/** The earliest moment the first, second and third store may be shown ticked. */
const LAUNCH_TICK_SLOTS_MS = [700, 1150, 1600] as const;

/** Below this the splash never leaves. */
export const LAUNCH_FLOOR_MS = 2300;

/** Past this the splash always leaves. */
export const LAUNCH_CEILING_MS = 6000;

export interface LaunchInput {
  /** The stores this app waits on (`launchStores`). */
  stores: readonly LaunchStore[];
  /** Which of them are ready (ticked). A store not listed in `stores` is ignored. */
  ready: Partial<Record<LaunchStore, boolean>>;
  elapsedMs: number;
}

export interface LaunchState {
  /** How many of `stores` are ready. */
  stage: number;
  /** The ring around the mark: `stage` over the number of stores, 0–1. */
  fraction: number;
  /** Start the exit now. */
  exit: boolean;
}

export function launchReady({ stores, ready, elapsedMs }: LaunchInput): LaunchState {
  const stage = stores.filter((store) => ready[store]).length;
  const total = stores.length;
  const fraction = total === 0 ? 1 : stage / total;
  const exit = (stage === total && elapsedMs >= LAUNCH_FLOOR_MS) || elapsedMs >= LAUNCH_CEILING_MS;
  return { stage, fraction, exit };
}

/**
 * Which chips show as ticked at `elapsedMs`, given when each store became ready
 * (ms since launch, or null while it has not). Only `stores` take slots; the
 * rest stay unticked.
 *
 * Ties are broken by the chips' own left-to-right order, so two stores that
 * finish in the same millisecond still tick one slot apart and in reading order.
 */
export function launchTicks(
  readyAtMs: Record<LaunchStore, number | null>,
  elapsedMs: number,
  stores: readonly LaunchStore[] = LAUNCH_STORES,
): Record<LaunchStore, boolean> {
  const finished = LAUNCH_STORES.filter(
    (store) => stores.includes(store) && readyAtMs[store] != null,
  ).sort(
    (a, b) =>
      (readyAtMs[a] as number) - (readyAtMs[b] as number) ||
      LAUNCH_STORES.indexOf(a) - LAUNCH_STORES.indexOf(b),
  );
  const ticked: Record<LaunchStore, boolean> = { history: false, tasks: false, money: false };
  finished.forEach((store, order) => {
    const at = Math.max(readyAtMs[store] as number, LAUNCH_TICK_SLOTS_MS[order]);
    ticked[store] = elapsedMs >= at;
  });
  return ticked;
}

/**
 * What the launch mark says: the app's name, the one glyph its mark holds, and
 * the line under the name (an English key, translated where it is drawn).
 *
 * The name is the launcher label (`app.config.js`), untranslated for the same
 * reason `Momentum` was: it is a name, not a sentence, and the icon the user
 * just tapped says it in English. The mark used to morph through all three
 * logs' glyphs — that was "Momentum is the three logs" in one beat; one app is
 * one log, and a mark that changes its mind about which app it is would be
 * saying the wrong thing.
 */
export function launchBrand(variant: AppVariant): {
  wordmark: string;
  glyph: 'fitness_center' | 'task_alt' | 'payments';
  tagline: string;
} {
  if (variant === 'tasks') {
    return { wordmark: 'Tasks', glyph: 'task_alt', tagline: 'Plan · tick · repeat' };
  }
  if (variant === 'expenses') {
    return { wordmark: 'Expenses', glyph: 'payments', tagline: 'Spend · save · count' };
  }
  return { wordmark: 'Workout', glyph: 'fitness_center', tagline: 'Train · log · progress' };
}
