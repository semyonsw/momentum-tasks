/**
 * THE LOGGING SCREEN IS ON THE STACK AT MOST ONCE AT THE TOP — and a second tap on
 * Start does not start a second session.
 *
 * Two paths push `session`: the Start handlers (when a session already exists)
 * and `AppShell`'s claim effect (for a session that was just started). A
 * double-tap on Start hits both — the first tap starts a session, the second
 * finds it and pushes, the claim effect pushes again — and the user had to back
 * out of the logging screen twice to leave it. `Start an empty workout` was worse:
 * its second tap built a whole new session over the first.
 *
 * Rejected: a "busy" flag on the buttons. Every entry point would need one, and
 * the claim effect is not a button. Making the push itself idempotent closes all
 * of them at once.
 */

/** The stack after pushing `route`: unchanged when the logging screen is already on top. */
export function pushRoute<R extends { name: string }>(stack: readonly R[], route: R): R[] {
  if (route.name === 'session' && stack[stack.length - 1]?.name === 'session') {
    return stack as R[];
  }
  return [...stack, route];
}

/**
 * Should opening `routineId` go back to the session that exists rather than build
 * a new one? Yes when that session is STARTED (rebuilding would discard what is
 * logged) or is already this routine (rebuilding would be the double-tap). The
 * empty workout's routine id is `''` (`lib/workoutHome.emptyWorkoutRoutine`), so
 * it answers through the same rule.
 */
export function reusesSession(
  session: { startedAt?: unknown; routineId?: string | null } | null | undefined,
  routineId: string,
): boolean {
  return session != null && (session.startedAt != null || session.routineId === routineId);
}
