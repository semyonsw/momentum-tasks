/**
 * Haptics, in one place.
 *
 * Every buzz in the app goes through here, because `expo-haptics` throws on
 * devices with no vibrator — which must never take a tap down with it — and
 * because a vocabulary this small is the only way the buzzes keep meaning
 * something. Each entry means one thing:
 *
 *   press      a control was pressed — fired by the control itself
 *   tap        a control acknowledged a press
 *   commit     a day was ticked, or a task saved
 *   undo       the same weight, downward
 *   success    good news landed
 *   celebrate  something reached 100% — every task of a day
 *
 * ── ONE BUZZ PER TOUCH ──────────────────────────────────────────────────────
 *
 * `press` fires from `BubblePressable`, which is every button in the app, and
 * most screens ALSO call `tap()` in the same button's `onPress` — they were
 * written before the control buzzed by itself. Two selection ticks in a row
 * read as a stutter, so `tap` stands down when a `press` has just said the
 * same thing. The heavier cues never stand down: a day being ticked is news
 * even if the finger that ticked it was felt landing.
 */

import * as Haptics from 'expo-haptics';

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
      buzz().catch(() => {});
    }, at),
  );
}

/** Any button, pressed. The lightest thing the phone can do. */
export function press(): void {
  lastPressAt = Date.now();
  Haptics.selectionAsync().catch(() => {});
}

/** Light. A chip, a chevron, a start button — "I heard you". */
export function tap(): void {
  const now = Date.now();
  if (now - lastPressAt < PRESS_COVERS_MS) return; // `press` already said it
  // A control that ticks for itself, inside a caller that also ticks: one tick.
  if (now - lastTapAt < 60) return;
  lastTapAt = now;
  Haptics.selectionAsync().catch(() => {});
}

/** Medium. A day ticked, a task saved — the weight of a decision. */
export function commit(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

/** Light impact. An undo, a cancel — the same weight as `commit`, downward. */
export function undo(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Good news: a backup landed, a key passed its test. Never an alarm. */
export function success(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/**
 * 100%. A rising three-step and the success pattern on top of it:
 *
 *   0 ms light · 90 ms medium · 190 ms heavy · 330 ms success
 *
 * A crescendo rather than one long buzz, because a single vibration of any
 * length reads as an alarm; three steps that climb read as something filling up,
 * which is what just happened. Reserved for completions — every task of a day —
 * so it keeps meaning something.
 */
export function celebrate(): void {
  play([
    [0, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)],
    [90, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)],
    [190, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)],
    [330, () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)],
  ]);
}
