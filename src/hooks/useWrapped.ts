/**
 * A Wrapped period, read off the stores — the one place the screen and the
 * history rows get their numbers from, so the "8 cards" on an entry is the
 * number of cards the screen then shows. Handed `APP_VARIANT`, so it is this
 * app's log only (`lib/wrapped.ts`, "ONE LOG PER APP").
 *
 * `null` in, `null` out, so a caller with no period to offer can still call it
 * unconditionally. The arithmetic is all `lib/wrapped.ts`.
 */

import { useMemo } from 'react';

import { APP_VARIANT } from '../lib/appVariant';
import { bodyweightAt } from '../lib/bodyweightLog';
import { workoutNumbers } from '../lib/completedWorkout';
import {
  wrappedCards,
  wrappedStats,
  wrappedSummary,
  type WrappedCard,
  type WrappedPeriod,
  type WrappedSummary,
} from '../lib/wrapped';
import { useMoney } from '../state/moneyStore';
import { useSettings } from '../state/settingsStore';
import { useTasks } from '../state/tasksStore';
import { useWorkoutHistory } from '../state/workoutHistoryStore';
import { useMoneyScale } from './useMoneyScale';
import { useToday } from './useToday';
import { useLanguage } from './useT';

export interface WrappedView {
  cards: WrappedCard[];
  summary: WrappedSummary;
}

export function useWrapped(period: WrappedPeriod | null): WrappedView | null {
  const today = useToday();
  const lang = useLanguage();
  const workouts = useWorkoutHistory((s) => s.workouts);
  const numbering = useWorkoutHistory((s) => s.numbering);
  const tasks = useTasks((s) => s.tasks);
  const log = useTasks((s) => s.log);
  const amounts = useMoney((s) => s.amounts);
  const categories = useMoney((s) => s.categories);
  const bodyweightLog = useSettings((s) => s.bodyweightLog);
  const unitSystem = useSettings((s) => s.unitSystem);
  const currency = useSettings((s) => s.currencyCode);
  const scale = useMoneyScale();

  // Keyed on the period's parts, so a fresh `{…}` literal each render is not a change.
  const kind = period?.kind ?? null;
  const year = period?.year ?? 0;
  const month = period?.kind === 'month' ? period.month : 0;

  const stats = useMemo(() => {
    if (kind === null) return null;
    const p: WrappedPeriod = kind === 'year' ? { kind, year } : { kind, year, month };
    return wrappedStats({
      period: p,
      today,
      workouts,
      numbers: workoutNumbers(workouts, numbering),
      tasks,
      log,
      amounts,
      categories,
      bodyweightAtDate: (at) => bodyweightAt(bodyweightLog, at),
      variant: APP_VARIANT,
    });
  }, [
    amounts,
    bodyweightLog,
    categories,
    kind,
    log,
    month,
    numbering,
    tasks,
    today,
    workouts,
    year,
  ]);

  return useMemo(() => {
    if (!stats) return null;
    const words = { unitSystem, currency, scale, lang };
    return { cards: wrappedCards(stats, words), summary: wrappedSummary(stats, words) };
  }, [currency, lang, scale, stats, unitSystem]);
}
