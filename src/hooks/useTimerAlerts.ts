/**
 * The two timers' cues for a phone in a pocket — mounted ONCE, in the shell.
 *
 * ── WHY THEY LEFT THE PILLS ───────────────────────────────────────────────
 *
 * These effects used to live inside `useRestTimer` and `useSetTimer`, which run
 * in the rest and set-timer pills on the session screen (and in focus mode). The
 * shell renders only the top of the navigation stack, so the moment anything was
 * pushed over the session — `Add an exercise`, an exercise's own editor — or the
 * user backed out to the home screen with a workout running, the pill unmounted
 * and its cleanup CANCELLED the scheduled alarms. Rest, tap `Add an exercise`,
 * pocket the phone: no "Rest over", ever. That is exactly the case the alarms
 * exist for.
 *
 * Everything they need is already outside any component — the deadline is in the
 * store, the switch and the language are settings — so they belong where the
 * session's other always-on pieces are: one instance, alive whenever the app is,
 * which also removes the "two live instances would double the alarms" hand-off the
 * pills and focus mode had to coordinate for this part.
 *
 * What stays in the pills is what is only meaningful ON SCREEN: the ticking
 * number, the in-app count-in and the keep-awake lock.
 */

import { useEffect, useRef } from 'react';

import { cancelTimerAlerts, scheduleTimerAlertPair, timerSlotIds } from '../lib/notify';
import { workEndsAt } from '../lib/setTimer';
import { useActiveWorkout } from '../state/activeWorkoutStore';
import { useSettings } from '../state/settingsStore';
import { useLanguage, useT } from './useT';

/**
 * Run alarm work for one clock strictly in order. Its ids are fixed now
 * (`timerSlotIds`), so an effect's cleanup cancelling `timer-rest-go` and the
 * next effect scheduling `timer-rest-go` are the same id — without a queue the
 * old cancel could land after the new schedule and silence it.
 */
function useSerial() {
  const tail = useRef<Promise<void>>(Promise.resolve());
  return useRef((job: () => Promise<void>) => {
    tail.current = tail.current.then(job, job);
  }).current;
}

export function useTimerAlerts(): void {
  const restEndsAt = useActiveWorkout((s) => s.rest.endsAt);
  const timer = useActiveWorkout((s) => s.setTimer);
  const notifyOnTimerEnd = useSettings((s) => s.notifyOnTimerEnd);
  const t = useT();
  const lang = useLanguage();
  const restQueue = useSerial();
  const setQueue = useSerial();

  /*
   * REST. Two alerts, not one: a tick five seconds out and the tone at zero. This
   * is the ONLY cue that reaches the user when the app is not on screen — a JS
   * interval playing a WAV does not survive Doze, a restricted battery setting or
   * a swipe-away, while a scheduled alarm does. See `lib/notify.ts`.
   *
   * Any change of deadline — including a pause or a skip, which clear it —
   * invalidates the pending pair. Cancelling by the slot's fixed ids also clears
   * a pair a previous run of the app scheduled and never got to cancel.
   */
  useEffect(() => {
    restQueue(async () => {
      await cancelTimerAlerts(timerSlotIds('rest'));
      if (!restEndsAt || !notifyOnTimerEnd) return;
      await scheduleTimerAlertPair({
        at: restEndsAt,
        getSetTitle: t('Get set'),
        getSetBody: t('Rest ends in 5 seconds.'),
        goTitle: t('Rest over'),
        goBody: t('Next set.'),
        lang,
        slot: 'rest',
      });
    });
    return () => restQueue(() => cancelTimerAlerts(timerSlotIds('rest')));
  }, [lang, notifyOnTimerEnd, restEndsAt, restQueue, t]);

  /*
   * THE SET TIMER'S BELL. A plank is the case that needs this most: the phone is
   * on the floor under you, the screen is off, and the interval that plays the
   * in-app count-in may not be running at all.
   *
   * `workSeconds` is in the dependency list via `timer` identity: every ±
   * replaces the object, which reschedules the bell.
   */
  useEffect(() => {
    setQueue(async () => {
      await cancelTimerAlerts(timerSlotIds('set'));
      if (!timer || !notifyOnTimerEnd) return;
      const endsAt = workEndsAt(timer);
      if (endsAt == null) return; // an open hold has no bell to ring
      await scheduleTimerAlertPair({
        at: endsAt,
        getSetTitle: t('Almost'),
        getSetBody: t('5 seconds left.'),
        goTitle: t('Time'),
        goBody: t('Set logged — rest.'),
        lang,
        slot: 'set',
      });
    });
    return () => setQueue(() => cancelTimerAlerts(timerSlotIds('set')));
  }, [lang, notifyOnTimerEnd, setQueue, t, timer]);
}
