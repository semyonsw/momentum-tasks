/**
 * The engagement layer (Wave 3), read off the stores — the switch, and the
 * facts the badges are worked out from.
 *
 * ONE place that gathers the three logs, so the gallery, the count on the
 * Settings row and anything later built on the same facts cannot disagree.
 * With the switch off it computes nothing: the walk over every log is paid
 * only by somebody who asked for what it feeds.
 */

import { useMemo } from 'react';

import { achievements, logFacts, type Badge, type LogFacts } from '../lib/achievements';
import { bodyweightAt } from '../lib/bodyweightLog';
import { engagementOn, engagementView, type EngagementView } from '../lib/engagement';
import { useMoney } from '../state/moneyStore';
import { useSettings } from '../state/settingsStore';
import { useTasks } from '../state/tasksStore';
import { useWorkoutHistory } from '../state/workoutHistoryStore';
import { useToday } from './useToday';

/** Which Wave 3 pieces may appear, from the one switch. */
export function useEngagementView(): EngagementView {
  const on = useSettings((s) => engagementOn(s));
  return useMemo(() => engagementView(on), [on]);
}

/** Every series the badges read, or null while the switch is off. */
export function useLogFacts(): LogFacts | null {
  const on = useSettings((s) => engagementOn(s));
  const today = useToday();
  const workouts = useWorkoutHistory((s) => s.workouts);
  const tasks = useTasks((s) => s.tasks);
  const log = useTasks((s) => s.log);
  const amounts = useMoney((s) => s.amounts);
  const budgets = useMoney((s) => s.budgets);
  const goals = useMoney((s) => s.goals);
  const accounts = useMoney((s) => s.accounts);
  const bodyweightLog = useSettings((s) => s.bodyweightLog);
  return useMemo(
    () =>
      on
        ? logFacts({
            today,
            workouts,
            tasks,
            log,
            amounts,
            budgets,
            goals,
            accounts,
            bodyweightAtDate: (at) => bodyweightAt(bodyweightLog, at),
          })
        : null,
    [on, today, workouts, tasks, log, amounts, budgets, goals, accounts, bodyweightLog],
  );
}

/** The badges, or an empty list while the switch is off. */
export function useBadges(): Badge[] {
  const facts = useLogFacts();
  return useMemo(() => (facts ? achievements(facts) : []), [facts]);
}
