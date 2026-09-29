/**
 * Log a countdown set at its bell, whichever screen is up.
 *
 * `useSetTimer` commits the set when its clock reaches zero — but it lives in the
 * set-timer pill and focus mode, inside the session screen, and the shell renders
 * only the top of its stack. So a plank started and then left for `Rest, targets
 * and cue` or `Add an exercise` rang its bell (`useTimerAlerts` is shell-level),
 * said "Set logged" in the notification, and logged nothing until the user came
 * back — the rest starting late from that moment, and a boxing chain
 * (`useAutoRounds`, also shell-level) stalled on a round that never closed.
 *
 * This is the same clock-and-look as `useAutoRounds`, mounted beside it. The
 * screen's own commit stays — it is the one in step with the numbers on screen —
 * and the two cannot double-log: `commitSetTimer` clears the timer, and a cleared
 * timer is nothing to commit. It ticks only while a COUNTDOWN is running; a
 * count-up has no bell and ends on the user's ✓.
 */

import { useEffect } from 'react';

import { readSetTimer } from '../lib/setTimer';
import { useActiveWorkout } from '../state/activeWorkoutStore';

const TICK_MS = 250;

export function useSetTimerCommit(): void {
  const countdown = useActiveWorkout((s) =>
    s.setTimer?.mode === 'countdown' ? s.setTimer.startedAt : null,
  );

  useEffect(() => {
    if (countdown == null) return undefined;
    const check = () => {
      const state = useActiveWorkout.getState();
      const timer = state.setTimer;
      if (timer?.mode !== 'countdown') return;
      if (readSetTimer(timer, Date.now()).phase === 'over') state.commitSetTimer();
    };
    check();
    const interval = setInterval(check, TICK_MS);
    return () => clearInterval(interval);
  }, [countdown]);
}
