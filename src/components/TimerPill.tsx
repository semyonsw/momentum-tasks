/**
 * TimerPill — the one instrument the whole gym-facing app is built around.
 *
 *   ╭───────────────────────────────────────╮
 *   │                                       │
 *   │   1:28                          ⏸     │  ← the clock owns the top
 *   │   BETWEEN SETS                        │
 *   │                    −15   +15    Skip  │  ← controls, underneath
 *   │ ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░ │  ← drain line
 *   ╰───────────────────────────────────────╯
 *
 * Two timers live in this slot — rest between sets, and the clock on a plank —
 * and they must read as ONE instrument in two states, not as two components that
 * happen to look similar. So the geometry, the elevation, the inversion in the
 * final ten seconds and the drain line are declared once, here, and each timer
 * supplies only its own content.
 *
 * The shared decisions:
 *   • IT SITS AT THE TOP OF THE SESSION, directly under the header, and it is the
 *     biggest thing on the screen. A rest countdown is read from three or four feet
 *     away — phone on a bench, you standing over it — and the top of the screen is
 *     where the eye lands and where nothing else competes. It used to float at the
 *     bottom over the thumb, which is the right place for a button and the wrong
 *     place for a display.
 *   • THE CONTENT IS A COLUMN, and that is what let the clock get big. It was one
 *     row — clock on the left, every control on the right — which capped the
 *     numerals at whatever was left after four thumb targets: about 114 dp on a
 *     360 dp phone, or 52 pt of type. Stacking the controls under the clock hands
 *     the numerals the full width, which is the only way to read a countdown from
 *     across a gym floor rather than from arm's length. The pill got taller in
 *     exchange, and the pill is the one thing on the screen that has earned it.
 *   • IT TAKES ITS OWN SPACE rather than floating over the rows: at this size an
 *     overlay would cover the set it belongs to. It still carries the app's single
 *     real shadow, so it reads as the layer above the list.
 *   • Under ten seconds it INVERTS to a solid `green-bright` slab, readable across
 *     a room without reading the numerals. Any alert is haptic and audible as well
 *     — never visual-only, because the phone is face-up on a bench.
 *   • The drain line shows time REMAINING, not elapsed: the bar empties as the
 *     phase does — CONTINUOUSLY. It used to step once a tick, which on a 90 s rest
 *     is a bar that visibly jumps; it is a linear animation now, from where it
 *     stands to empty over exactly the time that is left, restarted whenever
 *     that time changes (±15, pause, resume). Native-driven, as a `scaleX`.
 *   • THE DIGITS ROLL (`RollingNumber`, 320 ms), so a `+15` is seen to add fifteen
 *     seconds rather than the clock redrawing.
 *   • IN THE FINAL TEN SECONDS IT ALSO PULSES — scale 1 → 1.03 → 1 each second
 *     (`SecondPulse`) — the change you notice without reading anything, on top of
 *     the inversion that says it in colour.
 *   • Only one pill exists at a time. You cannot be resting and holding.
 *
 * ── WHY THE COLOURS ARE INLINE STYLES AND NOT `className` ──────────────────
 *
 * The inverted state is the one place in the app where the FOREGROUND and the
 * BACKGROUND swap in the same paint: near-black numerals arrive on a green slab.
 * If either half of that swap fails to apply — a class that didn't make it into
 * the compiled stylesheet, a variable that didn't resolve in a release bundle —
 * the result is not a wrong colour, it is near-black on near-black: the countdown
 * VANISHES for exactly the last ten seconds, which is the only stretch anyone is
 * actually watching it.
 *
 * That is not a risk worth carrying for a styling convenience, so the pill's
 * surface and every colour inside it come from `palette` through `style`, which
 * cannot be dropped. `className` still does all the layout. `pillTone()` below is
 * the single source for those colours, so a timer cannot invert its background
 * without inverting its ink.
 *
 * ── AND WHY THE CLOCK SIZES ITSELF IN `style` ──────────────────────────────
 *
 * Same reason, plus one more: `allowFontScaling={false}`. The clock is already by
 * some distance the biggest text in the app and it is sized to fill the width it
 * has; letting the OS scale it on top of that pushes a five-character clock past
 * the pill's edge on a narrow phone, which is the one stretch of the countdown
 * anybody is actually watching.
 *
 * ── MOMENTUM v3: THE PILL IS A LIT CARD ─────────────────────────────────────
 *
 *   ╭──────────────────────────────────────────────╮
 *   │ BETWEEN SETS                    Next: set 4  │  ← kicker in acc, and what it is FOR
 *   │ 1:28                                         │  ← 68 / 70, ink, a c2 bloom behind
 *   │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  ← 6 dp gradient bar, drains linearly
 *   │ ( −15 s )( +15 s )( ⏸ )( Skip )              │  ← 44 dp glass chips
 *   ╰──────────────────────────────────────────────╯
 *
 * The redesign moved the pill from a `surface-alt` capsule onto the `lit` glass
 * tier — c2 @ 13 % fill, c2 @ 30 % edge, the hero bloom, a c3 lamp in the corner
 * — and put the drain INSIDE the card, between the clock and the controls, as a
 * 6 dp gradient bar rather than a 3 dp line along the bottom edge. So the card
 * owns three slots now — content, drain, `controls` — rather than one column.
 *
 * The 84 dp numerals came down to the design's 68: the kicker moved above them
 * and the controls went full-width below, so nothing shares the clock's row any
 * more, and 68 is still the largest type in the session by a distance.
 *
 * The card's colours are `cardTone()`, NOT `pillTone()`. Focus mode (`FocusClock`,
 * `FocusHold`) paints its own blocks with `pillTone()`, and moving that onto the
 * lit tier would restyle a screen this pass does not own. Both tones share the
 * FINAL slab, so the inversion still reads as one alarm everywhere it appears.
 *
 * THE CLOCK HAS NO GLOW. It had an SVG bloom behind the numerals that grew over
 * the last ten seconds; 2.1.0 removed it with every other glow in the app.
 *
 * THE INVERSION STAYS. The last ten seconds are read from across a room, and a
 * slab does that where a glow never did: the running final ten is the slab,
 * pulsing. Near-black on `acc` holds contrast in every preset
 * because `acc` is c2 lifted toward white.
 */

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { useMotionScale } from '../hooks/useMotionScale';
import { gradientBar, palette, tint } from '../theme/tokens';
import { SpecularEdge } from './glass';
import { SecondPulse, usePressScale } from './motion';
import { RollingNumber } from './RollingNumber';

/** Below this a countdown inverts. Ten seconds is one deep breath and a re-grip. */
export const FINAL_SECONDS = 10;

/** Every colour inside a pill, for one of its two states. */
export interface PillTone {
  /** The pill's own fill. */
  surface: string;
  /** A hairline, or nothing at all on the inverted slab. */
  border: string;
  /** The numerals. */
  clock: string;
  /** The micro label beside them ("PLANK", "PAUSED", "BETWEEN SETS"). */
  label: string;
  /** A secondary action: `+15`, `Start now`. */
  secondary: string;
  /** The action you are most likely to want, and its glyphs: `Skip`, `Stop`. */
  primary: string;
  /** The drain line's fill. */
  drain: string;
  /** The outline of the round controls — a hairline, or a darker green on the slab. */
  chipBorder: string;
  /** The fill of a control chip on the lit card. Absent = no fill. */
  chipFill?: string;
}

const RESTING: PillTone = {
  surface: palette.surfaceAlt,
  border: palette.hairline,
  get clock(): string {
    return palette.greenBright;
  },
  label: palette.inkFaint,
  secondary: palette.inkMuted,
  primary: palette.ink,
  get drain(): string {
    return palette.greenBright;
  },
  chipBorder: palette.hairline,
};

const FINAL: PillTone = {
  get surface(): string {
    return palette.greenBright;
  },
  border: 'transparent',
  // Near-black on `acc`: `acc` is c2 lifted toward white in every preset, so
  // this is the pairing that holds contrast on the slab whatever the theme.
  clock: palette.bg,
  get label(): string {
    return palette.greenWash;
  },
  get secondary(): string {
    return palette.greenWash;
  },
  primary: palette.bg,
  drain: palette.bg,
  chipBorder: 'rgba(6,8,7,0.28)',
  chipFill: 'rgba(6,8,7,0.08)',
};

/** The colours for focus mode's blocks, in their normal or final state. */
export function pillTone(inverted: boolean): PillTone {
  return inverted ? FINAL : RESTING;
}

/** The lit rest card's own tone — see the file header on why it is separate. */
const CARD: PillTone = {
  get surface(): string {
    return tint(0.13);
  },
  get border(): string {
    return tint(0.3);
  },
  clock: palette.ink,
  get label(): string {
    return palette.acc;
  },
  secondary: '#AEB9B3',
  primary: palette.ink,
  get drain(): string {
    return palette.acc;
  },
  chipBorder: 'rgba(236,241,238,0.09)',
  chipFill: 'rgba(236,241,238,0.07)',
};

/** The colours for the session's timer card, normal or final-ten-seconds. */
export function cardTone(inverted: boolean): PillTone {
  return inverted ? FINAL : CARD;
}

/** The card's corner — the design's 26, between `hero` and `navPill`. */
const CARD_RADIUS = 26;

interface TimerPillProps {
  /** Solid `acc` slab instead of the lit card. */
  inverted?: boolean;
  /**
   * Fraction of the phase left to run, 0–1. `null` draws no bar at all — an
   * open-ended count-up has nothing to drain, and a track with no fill on it
   * would read as a timer that is already finished.
   */
  remainingFraction?: number | null;
  /**
   * Milliseconds until the bar reaches empty at the current rate — pass it while
   * the clock is running and the bar drains continuously over exactly that long.
   * Null (paused, or a count that is not a countdown) holds it where it stands.
   */
  drainMs?: number | null;
  /**
   * Changes whenever the time left changes by anything other than time passing —
   * a new deadline from `±15`, a pause, a resume. The drain restarts from where it
   * is on each change. Usually the deadline itself.
   */
  drainKey?: string | number | null;
  /** The row of chips under the bar. */
  controls?: ReactNode;
  /** The kicker row and the clock. */
  children: ReactNode;
}

export function TimerPill({
  inverted = false,
  remainingFraction,
  drainMs = null,
  drainKey = null,
  controls,
  children,
}: TimerPillProps) {
  const tone = cardTone(inverted);
  const hasDrain = remainingFraction != null;

  return (
    // Under the header, inset by the page gutter, with air above and below it.
    <View
      className="mx-lg mb-sm mt-md"
      style={{
        borderRadius: CARD_RADIUS,
        // The slab glows harder: it is the one moment the card is an alarm.
      }}
    >
      <View
        style={{
          borderRadius: CARD_RADIUS,
          overflow: 'hidden',
          backgroundColor: tone.surface,
          borderWidth: 1,
          borderColor: tone.border,
          paddingTop: 18,
          paddingHorizontal: 18,
          paddingBottom: 16,
        }}
      >
        {inverted ? null : <CornerLamp />}
        <SpecularEdge color="rgba(236,241,238,0.14)" radius={CARD_RADIUS} />

        {children}

        {hasDrain ? (
          <DrainLine
            fraction={remainingFraction}
            drainMs={drainMs}
            drainKey={drainKey}
            inverted={inverted}
          />
        ) : null}

        {controls ? (
          <View className="mt-[14px] flex-row items-center" style={{ gap: 8 }}>
            {controls}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** The c3 lamp in the card's top-right corner: 240 dp, 26 %, off the edge. */
function CornerLamp() {
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: -80, right: -60, width: 240, height: 240 }}
    >
      <Svg width={240} height={240}>
        <Defs>
          <RadialGradient id="restLamp" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={palette.c3} stopOpacity={0.26} />
            <Stop offset="65%" stopColor={palette.c3} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={120} cy={120} rx={120} ry={120} fill="url(#restLamp)" />
      </Svg>
    </View>
  );
}

/**
 * The kicker row over the clock: what this countdown is, in `acc`, and — on the
 * right — what it is for ("Next: set 4"). Both run to one line.
 */
export function PillKicker({
  label,
  aside,
  tone,
}: {
  label: string;
  aside?: string | null;
  tone: PillTone;
}) {
  return (
    <View className="flex-row items-center" style={{ gap: 8 }}>
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
        style={{ color: tone.label }}
        className="flex-1 text-micro font-semibold uppercase"
      >
        {label}
      </Text>
      {aside ? (
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          style={{ color: tone.secondary, fontSize: 13.5, lineHeight: 18, maxWidth: '60%' }}
        >
          {aside}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The numerals. The biggest text in the app, and the only text sized in a style
 * rather than a class — see the file header.
 *
 * `count` is the get-ready number: a bare 5 · 4 · 3 · 2 · 1 you should be able to
 * read from the floor while you get into position, so it is bigger still.
 *
 * `breathe` is the 1 s pulse of the final ten.
 */
export function PillClock({
  value,
  tone,
  variant = 'clock',
  breathe = false,
  accessibilityLabel,
}: {
  value: string | number;
  tone: PillTone;
  variant?: 'clock' | 'count';
  breathe?: boolean;
  accessibilityLabel: string;
}) {
  const fontSize = variant === 'count' ? 104 : 68;
  const lineHeight = variant === 'count' ? 108 : 70;
  /* Memoized: the pill re-renders every second, and `RollingNumber` is memoized
     on its props — an inline style re-rendered all forty of its digit `Text`s. */
  const clockStyle = useMemo(
    () => ({ fontSize, letterSpacing: -2.5, fontWeight: '600' as const, color: tone.clock }),
    [fontSize, tone.clock],
  );
  return (
    <View style={{ marginTop: 6, marginBottom: 12, alignSelf: 'flex-start' }}>
      <SecondPulse active={breathe}>
        {/* The clock ROLLS, 320 ms a column: fast enough to finish inside the
            second it is showing, slow enough that `+15` reads as fifteen seconds
            arriving. The get-ready count stays a plain numeral — one digit,
            replaced, is the count. */}
        {variant === 'clock' ? (
          <RollingNumber
            value={String(value)}
            lineHeight={lineHeight}
            duration={320}
            accessibilityLabel={accessibilityLabel}
            style={clockStyle}
          />
        ) : (
          <Text
            accessibilityLabel={accessibilityLabel}
            allowFontScaling={false}
            numberOfLines={1}
            style={{
              fontSize,
              lineHeight,
              letterSpacing: -2.5,
              fontWeight: '600',
              fontVariant: ['tabular-nums'],
              color: tone.clock,
            }}
          >
            {value}
          </Text>
        )}
      </SecondPulse>
    </View>
  );
}

/**
 * One control chip on the card: 44 tall, a glass pill, 15 / 600 text. `flex`
 * shares the row (`+15 s`, `Skip`); `width` fixes it (the 52 dp pause). Sinks to
 * 0.9 under the finger — the card is read from across a gym, and the press has
 * to be visible from there too.
 */
export function PillControl({
  onPress,
  tone,
  accessibilityLabel,
  flex = false,
  width,
  children,
}: {
  onPress: () => void;
  tone: PillTone;
  accessibilityLabel: string;
  flex?: boolean;
  width?: number;
  children: ReactNode;
}) {
  const press = usePressScale(0.9);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={flex ? { flex: 1 } : undefined}
    >
      <Animated.View
        style={{
          height: 44,
          width,
          paddingHorizontal: width ? 0 : 14,
          borderRadius: 9999,
          overflow: 'hidden',
          backgroundColor: tone.chipFill,
          borderWidth: 1,
          borderColor: tone.chipBorder,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          transform: press.style.transform,
        }}
      >
        {tone.chipFill && tone !== FINAL ? (
          <SpecularEdge color="rgba(236,241,238,0.12)" radius={9999} />
        ) : null}
        {typeof children === 'string' ? (
          <Text
            maxFontSizeMultiplier={1.3}
            numberOfLines={1}
            style={{ color: tone.primary, fontSize: 15, fontWeight: '600' }}
            className="tabular-nums"
          >
            {children}
          </Text>
        ) : (
          children
        )}
      </Animated.View>
    </Pressable>
  );
}

/**
 * The drain: a 6 dp bar, a native-driven `scaleX` from the left edge.
 *
 * On every `drainKey` it jumps to where the clock actually is and, while a
 * `drainMs` is given, runs linearly to empty over exactly that long — so it moves
 * every frame without the JS thread doing anything, and a `+15` or a pause
 * re-anchors it instead of letting it drift. Clamped, because a `+15` that
 * overshoots the original total cannot draw past the end of the bar.
 *
 * The fill is the theme's 90° gradient on the lit card and the slab's near-black
 * on the inverted one — a gradient on `acc` would be colour on colour.
 */
function DrainLine({
  fraction,
  drainMs,
  drainKey,
  inverted,
}: {
  fraction: number;
  drainMs: number | null;
  drainKey: string | number | null;
  inverted: boolean;
}) {
  const motionScale = useMotionScale();
  const clamped = Math.min(1, Math.max(0, fraction));
  const v = useRef(new Animated.Value(clamped)).current;
  const latest = useRef(clamped);
  latest.current = clamped;

  useEffect(() => {
    if (motionScale === 0 || drainMs == null) {
      v.setValue(latest.current);
      return undefined;
    }
    v.setValue(latest.current);
    const run = Animated.timing(v, {
      toValue: 0,
      duration: Math.max(0, drainMs),
      easing: Easing.linear,
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
    // Keyed on the deadline, not on the fraction: see the note above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drainKey, drainMs == null, motionScale]);

  /* Without a running drain, the bar is simply where the clock is. */
  useEffect(() => {
    if (motionScale === 0 || drainMs == null) v.setValue(clamped);
  }, [clamped, drainMs, motionScale, v]);

  return (
    <View
      style={{
        height: 6,
        borderRadius: 9999,
        overflow: 'hidden',
        backgroundColor: inverted ? 'rgba(6,8,7,0.18)' : 'rgba(236,241,238,0.07)',
      }}
    >
      <Animated.View
        style={{
          height: 6,
          width: '100%',
          borderRadius: 9999,
          overflow: 'hidden',
          backgroundColor: inverted ? palette.bg : undefined,
          transformOrigin: 'left',
          transform: [{ scaleX: v }],
        }}
      >
        {inverted ? null : (
          <LinearGradient
            {...gradientBar()}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
        )}
      </Animated.View>
    </View>
  );
}
