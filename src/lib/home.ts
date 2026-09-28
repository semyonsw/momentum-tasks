/**
 * The landing's words — the greeting, the date kicker, and the one line under
 * them that says where the day stands.
 *
 * Home exists to answer "what now" before a section is chosen, so its subline
 * is COMPUTED from the three logs rather than being a welcome: how many of
 * today's tasks are done, and which workout is up. Each clause is dropped when
 * it has nothing to say — a phone with no tasks does not read "0 of 0".
 *
 * Returned as translation keys with their values rather than as finished text,
 * so this stays pure and the screen's `t()` does the language.
 */

export type Greeting = 'Good morning' | 'Good afternoon' | 'Good evening' | 'Good night';

/** By the clock: 5–12 morning, 12–17 afternoon, 17–22 evening, otherwise night. */
export function greetingFor(hour: number): Greeting {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 22) return 'Good evening';
  return 'Good night';
}

export interface Phrase {
  key: string;
  vars?: Record<string, string | number>;
}

/** "6 of 8 tasks done · Pull is up next", as its clauses. */
export function homeSubline(input: {
  tasksDone: number;
  tasksTotal: number;
  /** The routine whose turn it is, or the workout in progress. */
  nextWorkout: string | null;
  workoutInProgress: boolean;
}): Phrase[] {
  const parts: Phrase[] = [];
  if (input.tasksTotal > 0) {
    parts.push(
      input.tasksDone >= input.tasksTotal
        ? { key: 'Every task done' }
        : {
            key: '{done} of {total} tasks done',
            vars: { done: input.tasksDone, total: input.tasksTotal },
          },
    );
  }
  if (input.nextWorkout) {
    parts.push(
      input.workoutInProgress
        ? { key: '{name} is in progress', vars: { name: input.nextWorkout } }
        : { key: '{name} is up next', vars: { name: input.nextWorkout } },
    );
  }
  if (parts.length === 0) parts.push({ key: 'Train · tick · count' });
  return parts;
}

/**
 * The first word of a routine's focus line — "Pull · back, biceps" is `Pull` —
 * for the Workout tile's kicker, which has room for one word after `Today`.
 */
export function focusFamily(focus: string | null): string | null {
  if (!focus) return null;
  const first = focus.split('·')[0]?.trim();
  return first ? first : null;
}
