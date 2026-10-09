/**
 * The insights (X2), read off the three stores — one place for the screen and
 * the door at the foot of each history, so the count on the door is the number
 * of cards the screen then shows. The arithmetic is all `lib/insights.ts`.
 */

import { useMemo } from 'react';

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
    () => insights({ today, workouts, tasks, log, amounts }),
    [amounts, log, tasks, today, workouts],
  );
}
