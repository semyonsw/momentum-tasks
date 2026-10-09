/**
 * ProgressRing — a fraction as an arc, with whatever it is about inside it.
 *
 *          ╭──────╮
 *        ╱    14    ╲        the day's number, the month under it,
 *       │  SEP 2026  │       and the ring saying how much of it is done
 *        ╲          ╱
 *          ╰──────╯
 *
 * ── WHY A RING AND NOT THE BAR IT REPLACED ────────────────────────────────
 *
 * The tasks screen used to carry a 6px track under the date and a sentence under
 * that. Three separate things — the day, how far through it you are, the count —
 * stacked in reading order, none of them the thing you opened the app for.
 *
 * A ring closes them into one object: the date is INSIDE the fraction rather
 * than above it, so a glance answers "what day, and how did it go" in one
 * fixation instead of three. It is also the only shape that reads as a fraction
 * without a number — you can see a quarter left from across a room, which is
 * what the bar was for and never achieved at 6px.
 *
 * The same ring at 56 is what a category tile spends on its share of the window,
 * which is why `size` and `stroke` are props and everything else is not.
 *
 * ── A DAY THAT ASKED FOR NOTHING READS FULL ───────────────────────────────
 *
 * It is a RATIO, not a target. The caller decides — `dayProgress` returns 1 for
 * an empty day — and this draws what it is given. A ring that showed empty for a
 * rest day would be the same lie the bar told.
 */

import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  ReduceMotion,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { useMotionScale } from '../hooks/useMotionScale';
import { motion, palette } from '../theme/tokens';

/*
 * `ReduceMotion.Never` on every timing here: Reanimated follows Android's
 * "Remove animations" by default and would jump each one to its end, where the
 * RN Animated these replaced always ran them. `useMotionScale` is the app's own
 * switch for that, and it is applied to the durations exactly as before.
 */
const EASE = Easing.bezier(...motion.ease);

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ProgressRingProps {
  /** 0–1. Clamped here, because a total of zero is a real input. */
  fraction: number;
  /** Outer box, square. 150 on the day dial, 56 on a category tile. */
  size: number;
  /** Track and arc width. 9 at 150, 3 at 56 — thin enough to stay a ring. */
  stroke: number;
  /** The date, the glyph — whatever the ring is about. Centred over it. */
  children?: ReactNode;
  /**
   * The arc's colour. The accent unless said otherwise — the one other value in
   * use is `danger`, on a budget arc past 100% (M1), and nowhere else.
   */
  color?: string;
  /** The track under it. `greenDim` unless said otherwise. */
  trackColor?: string;
}

/**
 * THE ARC TRAVELS to a new share over `motion.ring` (700 ms) — stepping a month,
 * switching direction, saving an amount — rather than redrawing. Six tiles whose
 * rings all move at once is how a new month reads as a new month. On Reanimated,
 * because `strokeDashoffset` is an SVG prop and not a transform: the classic
 * native driver cannot run it, and six rings on the JS driver were six props
 * pushed from JS and six canvases redrawn on every frame of the step.
 */
export function ProgressRing({
  fraction,
  size,
  stroke,
  children,
  color,
  trackColor,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(1, fraction));
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  const scale = useMotionScale();
  const v = useSharedValue(clamped);
  useEffect(() => {
    v.value = withTiming(clamped, {
      duration: motion.ring * scale,
      easing: EASE,
      reduceMotion: ReduceMotion.Never,
    });
  }, [clamped, scale, v]);
  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: length * (1 - v.value),
    // An empty share draws no cap: a round cap on a zero-length arc is a dot.
    strokeOpacity: interpolate(v.value, [0, 0.001, 1], [0, 1, 1]),
  }));

  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <Svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        // Twelve o'clock, so a ring that is a third full is a third of the way
        // round from the top and not from three o'clock.
        style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor ?? palette.greenDim}
          strokeWidth={stroke}
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color ?? palette.greenBright}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={length}
          animatedProps={arcProps}
        />
      </Svg>
      {children}
    </View>
  );
}
