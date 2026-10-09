/**
 * Sparkline — a small line with a wash under it, the width of its parent, no
 * axes (T4's last-90-days strip under the habit-strength ring).
 *
 * Not `TrendChart`: that is a fixed 342 dp instrument with an axis, a scrubber
 * and labelled extremes, and a 0–100 score over ninety days needs none of them —
 * its job is the SHAPE (climbing, flat, a dip after the holiday), and the ring
 * above it already says the number. Measured with `onLayout` so it fills a card
 * at any width rather than assuming one.
 *
 * The scale is FIXED 0–100 rather than fitted to the data: a line fitted to
 * 88–94 turns a six-point wobble into a cliff, and this number's whole promise
 * is that one bad day is a small dip. Leading `null`s (days before the task
 * existed) are left out, so a young task draws a short line ending at the
 * right edge rather than a floor of zeros.
 *
 * `min` (W9) lifts the floor for a series that is never near zero — a waist in
 * centimetres on a 0–100 scale is a flat line at the top. The caller picks the
 * band (the measurement rows pad their own range by half a unit each side), so
 * the fixed-scale promise above still holds where it is asked for.
 */

import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { chartWash, palette, tint } from '../theme/tokens';

export function Sparkline({
  values,
  height = 52,
  min = 0,
  max = 100,
}: {
  values: readonly (number | null)[];
  height?: number;
  min?: number;
  max?: number;
}) {
  const [width, setWidth] = useState(0);
  const n = values.length;
  const stroke = 2;
  const top = stroke;
  const usable = height - top - stroke / 2;

  let line = '';
  let firstX: number | null = null;
  let lastX = 0;
  if (width > 0 && n > 1) {
    values.forEach((value, i) => {
      if (value === null) return;
      const x = (i / (n - 1)) * width;
      const span = max - min || 1;
      const y = top + usable * (1 - (Math.max(min, Math.min(max, value)) - min) / span);
      line += `${line === '' ? 'M' : ' L'}${x.toFixed(1)} ${y.toFixed(1)}`;
      if (firstX === null) firstX = x;
      lastX = x;
    });
  }
  const area =
    line !== '' && firstX !== null
      ? `${line} L${lastX.toFixed(1)} ${height} L${(firstX as number).toFixed(1)} ${height} Z`
      : '';

  return (
    <View
      style={{ height }}
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      accessible={false}
    >
      {width > 0 && line !== '' ? (
        <Svg width={width} height={height}>
          <Path d={area} fill={tint(chartWash.flat)} />
          <Path
            d={line}
            fill="none"
            stroke={palette.greenBright}
            strokeWidth={stroke}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </Svg>
      ) : null}
    </View>
  );
}
