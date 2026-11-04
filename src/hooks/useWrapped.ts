/**
 * A Wrapped period, read off the stores — the one place the screen and the
 * history row get their numbers from, so the "4 cards" on an entry is the
 * number of cards the screen then shows.
 *
 * `null` in, `null` out, so a caller with no period to offer can still call it
 * unconditionally. The arithmetic is all `lib/wrapped.ts`.
 */

import { useMemo } from 'react';

import {
  wrappedCards,
  wrappedStats,
  wrappedSummary,
  type WrappedCard,
  type WrappedPeriod,
  type WrappedSummary,
} from '../lib/wrapped';
import { useTasks } from '../state/tasksStore';
import { useToday } from './useToday';
import { useLanguage } from './useT';

export interface WrappedView {
  cards: WrappedCard[];
  summary: WrappedSummary;
}

export function useWrapped(period: WrappedPeriod | null): WrappedView | null {
  const today = useToday();
  const lang = useLanguage();
  const tasks = useTasks((s) => s.tasks);
  const log = useTasks((s) => s.log);

  // Keyed on the period's parts, so a fresh `{…}` literal each render is not a change.
  const kind = period?.kind ?? null;
  const year = period?.year ?? 0;
  const month = period?.kind === 'month' ? period.month : 0;

  const stats = useMemo(() => {
    if (kind === null) return null;
    const p: WrappedPeriod = kind === 'year' ? { kind, year } : { kind, year, month };
    return wrappedStats({ period: p, today, tasks, log });
  }, [kind, log, month, tasks, today, year]);

  return useMemo(() => {
    if (!stats) return null;
    return { cards: wrappedCards(stats, lang), summary: wrappedSummary(stats, lang) };
  }, [lang, stats]);
}
