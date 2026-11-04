/**
 * The insights (X2), read off the stores — one place for the screen and the
 * door at the foot of the history, so the count on the door is the number of
 * cards the screen then shows. The arithmetic is all `lib/insights.ts`, handed
 * `APP_VARIANT`: in three apps only the Expenses one has a comparison left
 * (`insightIdsFor`), and the others get an empty list.
 */

import { useMemo } from 'react';

import { APP_VARIANT } from '../lib/appVariant';
import { insights, type Insight } from '../lib/insights';
import { useMoney } from '../state/moneyStore';
import { useTasks } from '../state/tasksStore';
import { useWorkoutHistory } from '../state/workoutHistoryStore';
import { useToday } from './useToday';

export function useInsights(): Insight[] {
  const today = useToday();
  const workouts = useWorkoutHistory((s) => s.workouts);
  const tasks = useTasks((s) => s.tasks);
  const log = useTasks((s) => s.log);
  const amounts = useMoney((s) => s.amounts);
  return useMemo(
    () => insights({ today, workouts, tasks, log, amounts, variant: APP_VARIANT }),
    [amounts, log, tasks, today, workouts],
  );
}
