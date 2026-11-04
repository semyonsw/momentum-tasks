/**
 * Keep Android's notification queue matching the tasks that asked to speak.
 *
 * Mounted once, at the top of the app, beside `useAutoBackup`: launch is the only
 * moment a sideloaded app can reliably run anything, so the work that has to
 * happen whether or not the user opens a particular screen happens here.
 *
 * ── WHAT IT WATCHES, AND WHY IT IS EVERY INPUT ───────────────────────────
 *
 * The plan is a function of the tasks, their log and the language
 * (`lib/reminders.ts`), so all three are subscribed — the log because
 * an answered day is what stops a task's follow-ups, and an excused day ahead
 * (a pause) is what turns its repeat into dated alerts that skip it. Renaming a task has to
 * rewrite the alert that carries its name; turning a reminder off has to cancel
 * it; switching to English has to change what the phone says tomorrow morning.
 * Any of those being missed leaves the user looking at a setting that says one
 * thing while the phone does another — which is the failure that makes people
 * turn notifications off at the OS level and never turn them back on.
 *
 * ── AND WHY IT ALSO WATCHES THE FOREGROUND ───────────────────────────────
 *
 * Two things only the clock can change. A one-day task for tomorrow has to
 * become an armed alert once it is close enough, and a habit that begins on the
 * 1st has to pick up its weekly alerts once the 1st arrives — `planReminders`
 * deliberately emits nothing for either until then. Coming back to the app is
 * when that gets noticed, and it costs a dozen scheduling calls on a queue that
 * is usually unchanged.
 *
 * ── IT IS DEBOUNCED, BECAUSE TYPING A NAME IS TWENTY RENDERS ─────────────
 *
 * The task editor commits on Save, but renaming from the detail screen and
 * every other write into the store lands one state change at a time. Syncing on
 * each of them would be twenty cancel-and-reschedule passes across the bridge
 * for one edit. Half a second of quiet is the signal that the edit is over.
 */

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { planKey, planReminders } from '../lib/reminders';
import { syncReminders } from '../lib/notify';
import { useSettings } from '../state/settingsStore';
import { useTasks } from '../state/tasksStore';

/** Long enough to swallow a burst of edits, short enough to feel immediate. */
const DEBOUNCE_MS = 500;

export function useReminders(): void {
  const tasks = useTasks((s) => s.tasks);
  /* The log too: ticking a task is what cancels the rest of its follow-ups. */
  const log = useTasks((s) => s.log);
  const language = useSettings((s) => s.language);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /*
   * What Android was last handed. The log changes on every tick and every note,
   * and almost none of those change the plan. Without this, each one would
   * cancel and re-arm the whole queue across the bridge while the tick is
   * still animating.
   */
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const plan = planReminders({ tasks, lang: language, now: new Date(), log });
      const key = `${language}|${planKey(plan)}`;
      if (key === lastKey.current) return;
      lastKey.current = key;
      void syncReminders(plan, language);
    }, DEBOUNCE_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [tasks, log, language]);

  /*
   * Read from the stores rather than from the closure above: this fires whenever
   * the app comes back, which can be days later, and the values captured when
   * the subscription was set up are not the ones that should be scheduled.
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      const { language: lang } = useSettings.getState();
      const plan = planReminders({
        tasks: useTasks.getState().tasks,
        log: useTasks.getState().log,
        lang,
        now: new Date(),
      });
      // Always synced, whatever the key says: this is the pass that catches
      // what only the clock changed, and the one that re-arms after a reboot
      // cleared the queue.
      lastKey.current = `${lang}|${planKey(plan)}`;
      void syncReminders(plan, lang);
    });
    return () => sub.remove();
  }, []);
}
