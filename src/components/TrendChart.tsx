/**
 * TrendChart — one line, three gridlines, no axes box. The app's only chart.
 *
 *   80 ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄●━━●
 *                        ╱
 *   70 ┄┄┄┄┄┄┄┄┄┄┄┄┄┄●╱
 *                 ╱
 *   60 ┄┄┄┄┄┄┄●╱
 *      ────────────────────────────
 *      11 JUN        9 JUL    8 AUG
 *
 * ONE POINT PER SESSION, whatever the series is — top working weight, reps in a
 * session, kilograms moved in a workout. Never per set: a real session ramps and
 * drops inside one exercise ("80 kg × 7, then 75 kg × 7 7 6"), so charting sets
 * draws a sawtooth and invents a plateau out of a warm-up. `lib/trends.ts` owns
 * every series this renders, which is why they all fit one component.
 *
 * The value axis is not forced to zero. This chart is read for DIRECTION — "is it
 * going up" — and a 75-to-80 kg climb against a zero baseline is a flat line. The
 * gridlines carry the actual numbers, so the scale is never a mystery.
 *
 * No axes box, no second series. A WASH under the line — green fading to nothing
 * by the baseline — and that is the only decoration: it gives the line a side, so
 * "above" and "below" read at a glance on a near-black page. It carries no number
 * the line is not already carrying. The gridlines are `green-dim` because they are
 * part of the same instrument as the line; the baseline is `hairline` because it
 * is structure, not data.
 */

import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Polyline,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { useLanguage } from '../hooks/useT';
import { formatChartDate } from '../lib/units';
import type { TrendPoint } from '../lib/trends';
import { palette } from '../theme/tokens';

const AnimatedPolyline = Animated.createAnimatedComponent(Polyline);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Matches `FocusMode.tsx`'s `EASING`. */
const EASING = Easing.bezier(0.2, 0.8, 0.2, 1);
/**
 * The dash a `strokeDashoffset` animation reveals the polyline through — the
 * same technique the design's `drawLine` keyframe uses. Not the line's actual
 * length: it only has to be longer than any path this fixed 342×160 box can
 * draw, so the offset can run the whole thing to 0 without a real measurement.
 */
const DRAW_LENGTH = 1000;

/** Rounded integers: right for reps, kilograms and plain counts. */
function defaultFormat(value: number): string {
  return String(Math.round(value));
}

/* Geometry from the design: a 342 × 160 box, plot area y 8–104, 34 wide gutter. */
const WIDTH = 342;
const HEIGHT = 160;
const GUTTER = 34;
const PLOT_TOP = 8;
const PLOT_BOTTOM = 104;
const BASELINE_Y = 128;
const LABEL_Y = 150;

interface TrendChartProps {
  /** Oldest first, one point per session. Under two points nothing is drawn. */
  points: readonly TrendPoint[];
  /**
   * How a gridline's number reads — "80", "2:00", "4 720". Defaults to a rounded
   * integer, which is right for reps, kilograms and counts.
   */
  formatValue?: (value: number) => string;
}

export function TrendChart({ points, formatValue = defaultFormat }: TrendChartProps) {
  const lang = useLanguage();
  /*
   * Hooks run before the `points.length < 2` bail-out below, so a chart that
   * gains its second point mid-session still gets an entrance the first time it
   * actually draws.
   */
  const draw = useSharedValue(0);
  /*
   * Which series this is, counted. Part of each dot's key, so a new series mounts
   * fresh dots that are hidden on the very frame it lands — as the fresh
   * `Animated.Value(0)`s built in render used to be — instead of showing the old
   * dots for a frame until an effect resets them.
   */
  const series = useRef({ points, run: 0 });
  if (series.current.points !== points) series.current = { points, run: series.current.run + 1 };
  const run = series.current.run;

  /*
   * ON THE UI THREAD. `strokeDashoffset` and an SVG `opacity` are not properties
   * the classic native driver can patch, so this entrance used to run on the JS
   * driver: a timer per point — a hundred workouts is a hundred timers, staggered
   * over ten seconds — each pushing a prop and redrawing the whole canvas every
   * frame, three charts at once on the graphs page, exactly while it is being
   * scrolled. Reanimated runs the same curves, same delays, off the JS thread.
   *
   * Replays whenever `points` is a new series, as it always has; the dots do the
   * same by remounting under the new `run`.
   */
  useEffect(() => {
    if (points.length < 2) return;
    draw.value = 0;
    draw.value = withTiming(1, {
      duration: 900,
      easing: EASING,
      // Reanimated would skip it under Android's "Remove animations"; the RN
      // Animated this replaced never did.
      reduceMotion: ReduceMotion.Never,
    });
  }, [draw, points]);
  const lineProps = useAnimatedProps(() => ({
    strokeDashoffset: DRAW_LENGTH * (1 - draw.value),
  }));

  if (points.length < 2) return null;

  const values = points.map((p) => p.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  /*
   * A flat run (every session the same number — exactly the case the nudge fires
   * on) would divide by zero and collapse the line onto one gridline. Give it a
   * nominal span so it draws as a level line mid-plot instead.
   */
  const span = max === min ? Math.max(max * 0.1, 1) : max - min;
  const floor = max === min ? min - span / 2 : min;

  const x = (index: number) =>
    GUTTER + 18 + (index * (WIDTH - GUTTER - 40)) / Math.max(1, points.length - 1);
  const y = (value: number) => PLOT_BOTTOM - ((value - floor) / span) * (PLOT_BOTTOM - PLOT_TOP);

  /* Three gridlines: the highest value, the lowest, and the midpoint. */
  const gridlines = [max, floor + span / 2, floor];

  const polyline = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  const lastIndex = points.length - 1;
  /*
   * The same polyline closed down to the baseline, for the wash under it. It is
   * not a second series and it carries no number the line does not already
   * carry — it is there so the line has a side, which is what makes "above" and
   * "below" readable at a glance on a near-black page.
   */
  const area = `${x(0)},${PLOT_BOTTOM} ${polyline} ${x(lastIndex)},${PLOT_BOTTOM}`;

  // First, middle and last dates only — a label under every point would be a
  // wall of text, and the shape is what's being read, not the dates.
  const labelled = [0, Math.floor(lastIndex / 2), lastIndex].filter(
    (value, index, all) => all.indexOf(value) === index,
  );

  return (
    <View>
      <Svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        <Defs>
          <LinearGradient id="trendWash" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={palette.greenBright} stopOpacity={0.3} />
            <Stop offset="100%" stopColor={palette.greenBright} stopOpacity={0} />
          </LinearGradient>
        </Defs>

        {gridlines.map((value) => (
          <Line
            key={`grid-${value}`}
            x1={GUTTER}
            y1={y(value)}
            x2={WIDTH}
            y2={y(value)}
            stroke={palette.greenDim}
            strokeWidth={1}
          />
        ))}

        <Line
          x1={GUTTER}
          y1={BASELINE_Y}
          x2={WIDTH}
          y2={BASELINE_Y}
          stroke={palette.hairline}
          strokeWidth={1}
        />

        {gridlines.map((value) => (
          <SvgText
            key={`axis-${value}`}
            x={0}
            y={y(value) + 4}
            fill={palette.inkFaint}
            fontSize={11}
            fontWeight="600"
            letterSpacing={1.1}
          >
            {formatValue(value)}
          </SvgText>
        ))}

        <Polyline points={area} fill="url(#trendWash)" stroke="none" />

        <AnimatedPolyline
          points={polyline}
          fill="none"
          stroke={palette.greenBright}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={DRAW_LENGTH}
          animatedProps={lineProps}
        />

        {/* Hollow dots for history, one solid dot for the latest session — the
            only point that is still a live fact rather than a record. Each pops
            in after the line reaches it, left to right. */}
        {points.map((point, index) => (
          <TrendDot
            key={`${run}-${point.at}-${index}`}
            index={index}
            cx={x(index)}
            cy={y(point.value)}
            latest={index === lastIndex}
          />
        ))}

        {labelled.map((index) => (
          <SvgText
            key={`label-${index}`}
            x={x(index)}
            y={LABEL_Y}
            textAnchor={index === 0 ? 'start' : index === lastIndex ? 'end' : 'middle'}
            fill={palette.inkFaint}
            fontSize={11}
            fontWeight="600"
            letterSpacing={1.1}
          >
            {formatChartDate(points[index].at, lang)}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

/**
 * One dot, popping in after the line reaches it: 260 ms from `500 + 90·index`.
 * Hollow for history, solid for the latest session.
 */
function TrendDot({
  index,
  cx,
  cy,
  latest,
}: {
  index: number;
  cx: number;
  cy: number;
  latest: boolean;
}) {
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.value = withDelay(
      500 + index * 90,
      withTiming(1, { duration: 260, easing: EASING, reduceMotion: ReduceMotion.Never }),
      ReduceMotion.Never,
    );
  }, [index, shown]);
  const dotProps = useAnimatedProps(() => ({ opacity: shown.value }));
  return latest ? (
    <AnimatedCircle cx={cx} cy={cy} r={4} fill={palette.greenBright} animatedProps={dotProps} />
  ) : (
    <AnimatedCircle
      cx={cx}
      cy={cy}
      r={3}
      fill={palette.bg}
      stroke={palette.greenBright}
      strokeWidth={2}
      animatedProps={dotProps}
    />
  );
}
