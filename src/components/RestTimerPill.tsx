/**
 * RestTimerPill — the rest countdown, at the top of the session.
 *
 *   running   ╭──────────────────────────────────────────╮
 *             │ BETWEEN SETS                Next: set 4  │  ← which rest, and what for
 *             │ 1:28                                     │
 *             │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░ │
 *             │ ( −15 s )( +15 s )( ⏸ )( Skip )          │  ← full width, the thumb
 *             ╰──────────────────────────────────────────╯
 *
 *   paused    │ BETWEEN SETS · PAUSED        Next: set 4 │  ← ⏸ becomes ▶
 *
 * MOMENTUM v3 put the controls in one full-width row of 44 dp glass chips under
 * the drain bar. The design shows three — `+15 s`, pause, `Skip` — and this card
 * keeps the FOURTH, `−15 s`, for the reason below: dropping it would take away the
 * only way to shorten a rest from the gym floor. With the ± pair sharing the row
 * equally, all four still fit a 360 dp phone at 15 dp type.
 *
 * `Next: set 4` is `lib/restNext.ts`: the set the glow is on, named by its number
 * while it is on the exercise just logged and by the exercise's NAME once it is
 * somewhere else, because "set 1" is useless when the next thing is a walk to
 * another rack.
 *
 * The pill's geometry, elevation, inversion, drain line and every colour in it
 * belong to `TimerPill`, which the set timer shares — see that file for those
 * decisions. What is specific to REST is only this:
 *
 *   • FOUR CONTROLS, ALL ON THE PILL, all one tap. `−15` and `+15` change the
 *     rest, `⏸` stops the clock without losing it, `Skip` ends rest now. Nothing
 *     is behind a tap-to-expand, because every one of them is something people do
 *     mid-rest with one hand while holding a water bottle in the other.
 *   • THEY ARE WHERE THE THUMB IS: one full-width row at the bottom of the card,
 *     44 dp tall, the pause a fixed 52 dp glyph between the ± pair and `Skip`.
 *   • `−15` IS NOT DECORATION, AND IT IS NOT THE OPPOSITE OF `+15` EITHER. Both
 *     of them set the rest for every set that follows (see `useRestTimer`), and
 *     the minus is the one that was missing: the pill could only ever make a rest
 *     longer, so "I'm warm, 1:30 is enough now" meant leaving the gym floor for
 *     Settings, or waiting out a countdown you had already decided was wrong.
 *     The label is a real `−`, not a hyphen, so it pairs with the `+` above it.
 *   • STOP AND SKIP ARE DIFFERENT, AND THE PILL SAYS SO. Pausing keeps the pill and
 *     freezes the number; skipping dismisses it. The paused state relabels itself
 *     `BETWEEN SETS · PAUSED` and swaps ⏸ for ▶, so a frozen 1:28 can never be
 *     mistaken for a timer that has stalled — and still says which rest it is.
 *   • IT SAYS WHICH REST THIS IS. `BETWEEN SETS` and `NEXT EXERCISE` are two
 *     different lengths the user sets separately, and a countdown that doesn't say
 *     which one it is running is a setting you cannot check. This label is how you
 *     can see, mid-workout, that the two numbers in Settings are doing what they
 *     say.
 *   • THE ± STEP IS THE USER'S. Read from Settings rather than hard-coded at 15,
 *     so the chip's label and what it does can never drift apart.
 *   • THE LABEL SITS ABOVE THE CLOCK, as the card's kicker, with what the rest
 *     is FOR on its right. Nothing shares the clock's own row any more.
 *   • It renders only while resting and unmounts cleanly. No permanent chrome.
 */

import { useMemo } from 'react';

import { formatCountdown } from '../lib/units';
import { restNext, type RestNext } from '../lib/restNext';
import { useRestTimer } from '../hooks/useRestTimer';
import { useActiveWorkout, type RestSource } from '../state/activeWorkoutStore';
import {
  cardTone,
  FINAL_SECONDS,
  PillClock,
  PillControl,
  PillKicker,
  TimerPill,
} from './TimerPill';
import { MaterialSymbol } from './MaterialSymbol';
import { useT, type Translate } from '../hooks/useT';

/**
 * What kind of rest is running, in the fewest words that distinguish them.
 *
 * Exported for focus mode, which shows the same countdown at four times the size
 * and must not word it differently: `BETWEEN SETS` and `NEXT EXERCISE` are the two
 * lengths the user sets separately, and this label is how you check, mid-workout,
 * that the two numbers in Settings are doing what they say.
 */
export function restLabel(source: RestSource | null, isPaused: boolean, t: Translate): string {
  const which =
    source === 'transition' ? t('next exercise') : source === 'set' ? t('between sets') : t('rest');
  return isPaused ? `${which} · ${t('paused')}` : which;
}

/** The right half of the kicker row, in words. */
function nextLine(next: RestNext | null, t: Translate): string | null {
  if (!next) return null;
  switch (next.kind) {
    case 'set':
      return t('Next: set {number}', { number: next.number });
    case 'warmup':
      return t('Next: warm-up');
    case 'exercise':
      return t('Next: {name}', { name: next.name });
    case 'done':
      return t('All sets logged');
  }
}

export function RestTimerPill() {
  const t = useT();
  const {
    remaining,
    isActive,
    isPaused,
    isRunning,
    source,
    totalSeconds,
    stepSeconds,
    endsAt,
    add,
    pause,
    resume,
    skip,
  } = useRestTimer();
  /* The session's identity changes on every ✓ — exactly when the answer can —
     and not on the rest ticks this component re-renders for. */
  const session = useActiveWorkout((s) => s.session);
  const next = useMemo(() => restNext(session), [session]);

  if (!isActive) return null;

  // A paused card never inverts: the slab means "act now", and the whole point of
  // a pause is that nothing is being demanded of the user yet.
  const underTen = remaining <= FINAL_SECONDS;
  const finalTen = !isPaused && underTen;
  const tone = cardTone(finalTen);
  const secondsLeft = Math.ceil(remaining);
  const what = restLabel(source, false, t);

  return (
    <TimerPill
      inverted={finalTen}
      remainingFraction={totalSeconds > 0 ? remaining / totalSeconds : 0}
      /* Continuous while it runs, frozen while paused; re-anchored on every new
         deadline — see `TimerPill`. */
      drainMs={isRunning ? remaining * 1000 : null}
      drainKey={isPaused ? 'paused' : endsAt}
      controls={
        <>
          {/* Minus first, plus second: the order they sit in on every other ±
              control in the app. A real `−`, so it pairs with the `+`. */}
          <PillControl
            flex
            tone={tone}
            onPress={() => add(-stepSeconds)}
            accessibilityLabel={t('Rest {what} {size} seconds shorter', {
              what,
              size: stepSeconds,
            })}
          >
            {`−${t('{seconds} s', { seconds: stepSeconds })}`}
          </PillControl>
          <PillControl
            flex
            tone={tone}
            onPress={() => add(stepSeconds)}
            accessibilityLabel={t('Rest {what} {size} seconds longer', {
              what,
              size: stepSeconds,
            })}
          >
            {`+${t('{seconds} s', { seconds: stepSeconds })}`}
          </PillControl>
          {/* Glyph, not a word: `Pause` and `Skip` side by side are two similar
              words in the same weight, and the wrong one costs you a rest. */}
          <PillControl
            width={52}
            tone={tone}
            onPress={isPaused ? resume : pause}
            accessibilityLabel={isPaused ? t('Resume rest') : t('Pause rest')}
          >
            <MaterialSymbol
              name={isPaused ? 'play_arrow' : 'pause'}
              size={24}
              color={tone.primary}
              filled
            />
          </PillControl>
          <PillControl flex tone={tone} onPress={skip} accessibilityLabel={t('Skip rest')}>
            {t('Skip')}
          </PillControl>
        </>
      }
    >
      <PillKicker label={restLabel(source, isPaused, t)} aside={nextLine(next, t)} tone={tone} />
      <PillClock
        value={formatCountdown(remaining)}
        tone={tone}
        breathe={finalTen && isRunning}
        accessibilityLabel={
          isPaused
            ? t('Rest paused with {seconds} seconds left', { seconds: secondsLeft })
            : t('{seconds} seconds of rest left', { seconds: secondsLeft })
        }
      />
    </TimerPill>
  );
}
