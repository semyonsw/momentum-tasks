/**
 * The clock block every clock-driven state of focus mode is made of.
 *
 *   resting          ╭──────────────────────────────────╮
 *                    │ BETWEEN SETS                     │
 *                    │ 2:30                             │  ← 120 dp of numeral
 *                    │▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░│
 *                    │  −15    +15     ⏸       Skip     │
 *                    ╰──────────────────────────────────╯
 *
 *   holding          1:14                                  ← the same clock, bare
 *                    PLANK
 *                    ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░
 *                    logs itself at the bell
 *
 * ── WHY ONE COMPONENT AND NOT TWO CLOCKS ────────────────────────────────────
 *
 * Rest and a held set are the same instrument in two states — the argument
 * `TimerPill` makes for the session screen, and it holds twice as hard here where
 * the clock IS the screen. So the geometry, the drain line, the inversion in the
 * final ten seconds and every colour come from one place, and each state supplies
 * only its own content. `tone` is the pill's own `pillTone()` object, unchanged:
 * focus mode does not get a second palette for the same countdown.
 *
 * The only difference between the two is a background. Rest is a CARD, because it
 * carries four controls and they need an edge to belong to. A held set is BARE —
 * the clock sits on the page with the exercise's name under it and its controls at
 * the bottom of the screen where a hand can reach them mid-hold. Bare also means
 * the inversion at ten seconds is a colour change and nothing else: the slab
 * appears behind numerals that do not move.
 *
 * ── THE COLOURS ARE INLINE STYLES, AND THAT IS DELIBERATE ───────────────────
 *
 * Same reason `TimerPill` gives, and the same stakes: the inverted state swaps
 * foreground and background in one paint, and if half of that swap fails to apply
 * in a release bundle the countdown is near-black on near-black for exactly the
 * ten seconds anybody is watching it. `className` does the layout; `tone` does the
 * colour, through `style`, which cannot be dropped.
 */

import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { focusGlow, palette, timerShadow } from '../theme/tokens';
import type { PillTone } from './TimerPill';

interface FocusClockBlockProps {
  /** Every colour in the block. `pillTone(inverted)` — see the file header. */
  tone: PillTone;
  /** The uppercase micro label: `BETWEEN SETS`, `PAUSED`, `PLANK`, `GET READY`. */
  label: string;
  /** Overrides the tone's label colour. State F's green `PAUSED` is the only user. */
  labelColor?: string;
  /** Above the numerals while resting, under them while holding. */
  labelPlacement?: 'above' | 'below';
  /** The numerals, already formatted. */
  value: string;
  /** `count` is the get-ready digit, one step larger again. */
  variant?: 'clock' | 'count';
  /** A halo behind the numerals. The get-ready count only. */
  glow?: boolean;
  /**
   * Fraction of the phase left to run, 0–1, or null for no line at all. Null is
   * an open-ended count-up, which has nothing to drain: a track with no fill would
   * read as a clock that has already finished. Same rule as `TimerPill`.
   */
  remainingFraction?: number | null;
  /** Overrides the drain's fill. State F freezes it to the track's own colour. */
  drainColor?: string;
  /** A hairline at the drain's head — the other half of "this bar is not live". */
  drainHead?: boolean;
  /** No card behind the clock: a held set, which sits on the page. */
  bare?: boolean;
  /**
   * Paint the tone's surface behind a BARE clock.
   *
   * One user: a prescribed hold in its final ten seconds, which inverts exactly as
   * rest does. The slab has to arrive without moving a numeral — a bare block that
   * grew a card's padding and corners would be a layout change wearing an alert's
   * clothes — so the background is switched on and nothing else about the block is.
   */
  filled?: boolean;
  /** The app's ONE shadow. The inverted rest slab, and nothing else. */
  shadow?: boolean;
  /** One line of `label`-size reference under everything. */
  note?: string;
  /**
   * What the numerals say, in words — "18 seconds of rest left".
   *
   * On the clock rather than on the block, and the same decision `PillClock`
   * makes: a screen reader should read the countdown once, as a sentence, not
   * announce a 120 dp glyph on every tick.
   */
  accessibilityLabel?: string;
  /** The controls row, inside the card under the drain. */
  children?: ReactNode;
}

export function FocusClockBlock({
  tone,
  label,
  labelColor,
  labelPlacement = 'above',
  value,
  variant = 'clock',
  glow = false,
  remainingFraction = null,
  drainColor,
  drainHead = false,
  bare = false,
  filled = false,
  shadow = false,
  note,
  accessibilityLabel,
  children,
}: FocusClockBlockProps) {
  const hasDrain = remainingFraction != null;
  // Clamped, so a `+15` that overshoots the original total cannot overflow.
  const left = hasDrain ? Math.min(100, Math.max(0, remainingFraction * 100)) : 0;

  const labelNode = (
    <Text
      numberOfLines={1}
      maxFontSizeMultiplier={1.3}
      style={{ color: labelColor ?? tone.label }}
      className={`text-micro font-semibold uppercase ${labelPlacement === 'above' ? 'mb-xs' : 'mt-xs'}`}
    >
      {label}
    </Text>
  );

  return (
    <View
      style={[
        shadow ? timerShadow : null,
        bare
          ? filled
            ? { backgroundColor: tone.surface }
            : null
          : { backgroundColor: tone.surface, borderWidth: 1, borderColor: tone.border },
      ]}
      className={['mx-lg overflow-hidden', bare ? '' : 'rounded-surface'].join(' ')}
    >
      <View className={bare ? 'py-xs' : 'px-lg pb-md pt-lg'}>
        {labelPlacement === 'above' ? labelNode : null}
        <Text
          accessibilityLabel={accessibilityLabel}
          /*
           * `allowFontScaling={false}`, exactly as `PillClock` does it: the clock
           * is already sized to fill the width it has, and letting the OS scale it
           * on top of that pushes a five-character countdown past the edge in the
           * one stretch anybody is watching.
           */
          allowFontScaling={false}
          numberOfLines={1}
          style={[
            { color: tone.clock, fontWeight: '600', fontVariant: ['tabular-nums'] },
            glow ? focusGlow : null,
          ]}
          className={variant === 'count' ? 'text-focus-count' : 'text-focus-clock'}
        >
          {value}
        </Text>
        {labelPlacement === 'below' ? labelNode : null}
      </View>

      {hasDrain ? (
        /* 4 dp on a green-dim track, always — the inverted slab keeps the same
           track so it still reads as the same instrument. */
        <View className="h-xs w-full" style={{ backgroundColor: palette.greenDim }}>
          <View
            className="h-full"
            style={{
              width: `${left}%`,
              backgroundColor: drainColor ?? tone.drain,
              // The head of a frozen bar. A paused countdown has to stop LOOKING
              // live, and a bar the colour of its own track needs an edge or it
              // disappears.
              borderRightWidth: drainHead ? 1 : 0,
              borderRightColor: palette.greenBright,
            }}
          />
        </View>
      ) : null}

      {note ? (
        <Text
          numberOfLines={1}
          className={`text-label tabular-nums text-ink-faint ${bare ? 'mt-md' : 'px-lg pt-sm'}`}
        >
          {note}
        </Text>
      ) : null}

      {children ? <View className="flex-row p-sm">{children}</View> : null}
    </View>
  );
}
