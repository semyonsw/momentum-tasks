/**
 * "Not yet" — one pushed screen's say over being left.
 *
 * A screen holding an unsaved draft (the routine editor, the exercise editor)
 * asks before its edits go. It can answer its own ‹ itself, but the other two
 * ways out never reach it: hardware back is the shell's (`AppShell`'s back
 * handler pops through `leaveTop`), and the edge swipe is `PushHost`'s, which
 * slides the screen off and THEN pops. So the screen registers a guard here, and
 * both of those ask it first; a guarded swipe springs back instead of leaving.
 *
 * ONE SLOT, NOT A STACK. Only the top screen of the stack can be left, and a
 * screen under another one is not rendered (`PushHost`) — so there is never more
 * than one screen with a say. The slot is cleared only by the guard that set it,
 * so a screen unmounting late cannot clear its successor's.
 */

import { useEffect, useRef } from 'react';

type Guard = () => void;

let current: Guard | null = null;

/**
 * May the top screen be left right now? False when a guard is up — and the
 * guard has been told, so it can ask its question.
 */
export function mayLeave(): boolean {
  if (!current) return true;
  current();
  return false;
}

/** While `active`, leaving by back or swipe calls `onBlocked` instead. */
export function useLeaveGuard(active: boolean, onBlocked: () => void): void {
  const blocked = useRef(onBlocked);
  blocked.current = onBlocked;
  useEffect(() => {
    if (!active) return undefined;
    const guard: Guard = () => blocked.current();
    current = guard;
    return () => {
      if (current === guard) current = null;
    };
  }, [active]);
}
