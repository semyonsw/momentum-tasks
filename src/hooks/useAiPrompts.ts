/**
 * `useAiPrompts('Workout')` — the suggested questions for one section, named
 * from the user's own log and in the language in force.
 *
 * A hook because two places draw the same list — the card under each section's
 * hero and the chat itself — and a chip that said "Improve Push" on one screen
 * and "Improve Pull" on the next would be two answers to one question. The
 * decision is `lib/ai/aiPrompts.ts`; this is the subscription.
 *
 * Only the workout prompts read a store, and only the three slices they need —
 * the finished workouts, the exercises and the routines — so a tick in the tasks
 * list does not rebuild the training card's chips.
 */

import { useMemo } from 'react';

import { workoutFacts } from '../lib/ai/aiContext';
import { parseDay } from '../lib/days';
import { suggestedPrompts, type SuggestedPrompt } from '../lib/ai/aiPrompts';
import type { AiSection } from '../lib/ai/aiSchema';
import { useLibrary } from '../state/libraryStore';
import { useWorkoutHistory } from '../state/workoutHistoryStore';
import { useLanguage } from './useT';
import { useToday } from './useToday';

export function useAiPrompts(section: AiSection): SuggestedPrompt[] {
  const lang = useLanguage();
  // The month names in the tasks and expenses prompts move at midnight on the 1st.
  const today = useToday();
  const exercises = useLibrary((s) => s.exercises);
  const routines = useLibrary((s) => s.routines);
  const workouts = useWorkoutHistory((s) => s.workouts);

  const facts = useMemo(() => {
    if (section !== 'Workout') return {};
    const found = workoutFacts({ exercises, routines, workouts });
    return { topLift: found.topLift, lastRoutine: found.lastRoutine?.name ?? null };
  }, [exercises, routines, section, workouts]);

  return useMemo(
    () => suggestedPrompts(section, facts, lang, parseDay(today) ?? new Date()),
    [facts, lang, section, today],
  );
}
