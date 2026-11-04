/**
 * Which section a pushed screen belongs to — and so which apps may open it.
 *
 * The shell's stack is one `Route[]` for every screen the tree has, because the
 * three apps are built from one tree (`lib/appVariant.ts`). Hiding the other
 * sections' roots is not enough on its own: a pushed screen can be reached
 * sideways — the AI settings' `Open the chat` defaulting to Workout, a session
 * rehydrated from the Workout app's store on a Tasks install restored from the
 * same backup, the Settings list offering a row per section. So every push goes
 * through `routeAllowed`, and a route that belongs to another app is refused at
 * the one door rather than guarded at each caller.
 *
 * Shared screens (`null` here) are the ones that read every log or none:
 * Wrapped and Insights look across whatever data the app holds, the badges are
 * the app's own, and the AI settings and review screens are about the assistant
 * rather than about a section. The chat carries its section in the route, so it
 * is decided by that.
 *
 * Unknown names map to `null` (allowed), on purpose: a new screen added to the
 * shell and forgotten here should show up in every app, where somebody will see
 * it, rather than silently refuse to open.
 */

import { hasSection, type AppVariant } from './appVariant';
import type { SectionTab } from './sectionNav';

const OWNER: Record<string, Exclude<SectionTab, 'Settings'>> = {
  session: 'Workout',
  routineEditor: 'Workout',
  addExercise: 'Workout',
  createExercise: 'Workout',
  editExercise: 'Workout',
  exerciseHistory: 'Workout',
  sequence: 'Workout',
  routines: 'Workout',
  library: 'Workout',
  workoutHistory: 'Workout',
  workoutSettings: 'Workout',
  body: 'Workout',
  muscles: 'Workout',
  tasksHistory: 'Tasks',
  taskSettings: 'Tasks',
  taskDetail: 'Tasks',
  moneyHistory: 'Expenses',
  moneySettings: 'Expenses',
  budgets: 'Expenses',
  recurring: 'Expenses',
  goals: 'Expenses',
  moneyCategory: 'Expenses',
  moneyAmount: 'Expenses',
};

/** The section a route belongs to, or null for a screen every app shares. */
export function routeSection(route: { name: string; section?: string }): SectionTab | null {
  if (route.name === 'aiChat') {
    const section = route.section;
    return section === 'Workout' || section === 'Tasks' || section === 'Expenses' ? section : null;
  }
  return OWNER[route.name] ?? null;
}

/** May this app push `route`? Its own section's screens and the shared ones. */
export function routeAllowed(
  variant: AppVariant,
  route: { name: string; section?: string },
): boolean {
  const section = routeSection(route);
  return section == null || hasSection(variant, section);
}

/** The stack with every route this app may not show removed — the same array when none was. */
export function allowedStack<R extends { name: string; section?: string }>(
  variant: AppVariant,
  stack: readonly R[],
): R[] {
  const kept = stack.filter((route) => routeAllowed(variant, route));
  return kept.length === stack.length ? (stack as R[]) : kept;
}
