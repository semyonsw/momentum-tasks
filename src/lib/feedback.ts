/**
 * Haptics and beeps behind the user's two switches.
 *
 * Every buzz and every tone in the app goes through here, for two reasons:
 * `Sound` and `Vibration` in Settings have to mean it everywhere (a switch that
 * silences four of five call sites is a bug report), and `expo-haptics` throws on
 * devices with no vibrator — which must never take a set down with it.
 *
 * The vocabulary is deliberately tiny, and each entry means one thing:
 *
 *   press      a control was pressed — fired by the control itself
 *   tap        a control acknowledged a press
 *   commit     a set was logged, or a clock started work
 *   success    a countdown reached zero — rest is over, or the bell rang
 *   countTick  one second of a get-ready count
 *   celebrate  something reached 100% — every set of a session, every task
 *              of a day, a finished debrief, a backup that landed
 *   sparkle    the light ticks that ride an animation as it plays
 *
 * ── ONE BUZZ PER TOUCH ──────────────────────────────────────────────────────
 *
 * `press` fires from `BubblePressable`, which is every button in the app, and
 * most screens ALSO call `tap()` in the same button's `onPress` — they were
 * written before the control buzzed by itself. Two selection ticks in a row
 * read as a stutter, so `tap` stands down when a `press` has just said the
 * same thing. The heavier cues never stand down: a
 * set being logged is news even if the finger that logged it was felt landing.
 *
 * ── ONE CUE PER EVENT, WHEREVER THE APP IS ─────────────────────────────────
 *
 * A countdown has two ways to be heard, and exactly one of them should fire:
 * the in-app tone while the app is on screen, and a scheduled notification when it
 * isn't (see `lib/notify.ts`). `cueAudible()` below is the switch between them, and
 * the reason it exists is that Android happily runs the JS timer for a while after
 * the app leaves the screen — long enough to play our tone a beat before the
 * notification plays the same tone, which is heard as the countdown beeping twice.
 *
 * If timer alerts are switched OFF, the in-app tone is all there is, so it plays
 * regardless — a muted background countdown would be worse than a doubled one.
 */

import { AppState } from 'react-native';
import * as Haptics from 'expo-haptics';

import { playBeep } from './beeper';
import { useSettings } from '../state/settingsStore';

function hapticsOn(): boolean {
  return useSettings.getState().hapticsEnabled;
}

/** When the last `press` fired, for `tap` to stand down behind. */
let lastPressAt = 0;
let lastTapAt = 0;
/** Covers the caller's own `tap()` in the same handler, and a quick double press. */
const PRESS_COVERS_MS = 350;

/** Timers of a pattern still playing, so a new one replaces rather than stacks. */
let pattern: ReturnType<typeof setTimeout>[] = [];

function play(steps: readonly [number, () => Promise<void>][]): void {
  for (const timer of pattern) clearTimeout(timer);
  pattern = steps.map(([at, buzz]) =>
    setTimeout(() => {
      if (hapticsOn()) buzz().catch(() => {});
    }, at),
  );
}

function soundOn(): boolean {
  return useSettings.getState().soundEnabled;
}

/** Should a countdown cue be played BY THE APP right now? */
function cueAudible(): boolean {
  if (!soundOn()) return false;
  if (AppState.currentState === 'active') return true;
  return !useSettings.getState().notifyOnTimerEnd;
}

/** Any button, pressed. The lightest thing the phone can do. */
export function press(): void {
  if (!hapticsOn()) return;
  lastPressAt = Date.now();
  Haptics.selectionAsync().catch(() => {});
}

/** Light. A chip, a chevron, a start button — "I heard you". */
export function tap(): void {
  if (!hapticsOn()) return;
  const now = Date.now();
  if (now - lastPressAt < PRESS_COVERS_MS) return; // `press` already said it
  // A control that ticks for itself, inside a caller that also ticks: one tick.
  if (now - lastTapAt < 60) return;
  lastTapAt = now;
  Haptics.selectionAsync().catch(() => {});
}

/** Medium. A set logged, a clock going to work — the weight of a decision. */
export function commit(): void {
  if (!hapticsOn()) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

/** Light impact. An undo, a cancel — the same weight as `commit`, downward. */
export function undo(): void {
  if (!hapticsOn()) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/**
 * A countdown hit zero. Success rather than warning: rest ending and a plank
 * finishing are both good news, and the app never buzzes at anyone in alarm.
 */
export function success(): void {
  if (!hapticsOn()) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** One second of a count-in: a tick you can hear, and one you can feel. */
export function countTick(): void {
  if (cueAudible()) playBeep('tick');
  if (hapticsOn()) Haptics.selectionAsync().catch(() => {});
}

/** Zero. The long tone plus the success pattern — "go", or "rest is over". */
export function countFinal(): void {
  if (cueAudible()) playBeep('final');
  success();
}

/**
 * 100%. A rising three-step and the success pattern on top of it:
 *
 *   0 ms light · 90 ms medium · 190 ms heavy · 330 ms success
 *
 * A crescendo rather than one long buzz, because a single vibration of any
 * length reads as an alarm; three steps that climb read as something filling up,
 * which is what just happened. Reserved for completions — a day, a session, a
 * debrief — so it keeps meaning something.
 */
export function celebrate(): void {
  if (!hapticsOn()) return;
  play([
    [0, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)],
    [90, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)],
    [190, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)],
    [330, () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)],
  ]);
}

/**
 * Ticks that ride an animation: `count` soft taps, `every` ms apart, starting
 * after `delay`. The spark burst uses it so the dots leaving the dial are felt
 * leaving; a progress bar filling uses it for its segments.
 */
export function sparkle(count = 4, every = 70, delay = 0): void {
  if (!hapticsOn()) return;
  const steps: [number, () => Promise<void>][] = [];
  for (let i = 0; i < count; i += 1) {
    steps.push([delay + i * every, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)]);
  }
  play(steps);
}
