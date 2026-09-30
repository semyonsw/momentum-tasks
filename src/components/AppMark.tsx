/**
 * AppMark — the Momentum icon, drawn live in the current theme.
 *
 * Three arcs of one ring, one per sphere — training, daily tasks, money — with
 * the three glyphs inside it. The launcher icon is a PNG exported in Fintech
 * Lime (`assets/icon.png`); this is the same drawing on the design's own 180
 * grid, scaled to whatever size it is asked for, so the mark in the corner of
 * Home wears the theme the rest of the app is wearing.
 */

import { View } from 'react-native';
import Svg, { Circle, Defs, G, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { SYMBOL_PATHS } from './symbolPaths';
import { mixSrgb } from '../lib/theme';
import { palette } from '../theme/tokens';

/** A filled symbol placed on the 180 grid: `x`/`y` its top-left, `size` its box. */
function Glyph({
  d,
  x,
  y,
  size,
  color,
}: {
  d: string;
  x: number;
  y: number;
  size: number;
  color: string;
}) {
  const k = size / 960;
  return (
    <G transform={`translate(${x} ${y + size}) scale(${k})`}>
      <Path d={d} fill={color} />
    </G>
  );
}

export function AppMark({ size }: { size: number }) {
  const radius = (44 / 180) * size;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
      }}
    >
      <Svg width={size} height={size} viewBox="0 0 180 180">
        <Defs>
          <RadialGradient id="markBg" cx="30%" cy="20%" r="67%">
            <Stop offset="0%" stopColor={mixSrgb(palette.c1, '#0C1410', 0.28)} />
            <Stop offset="100%" stopColor={palette.bg} />
          </RadialGradient>
        </Defs>
        <Rect
          x={0.75}
          y={0.75}
          width={178.5}
          height={178.5}
          rx={44}
          fill="url(#markBg)"
          stroke="rgba(236,241,238,0.12)"
          strokeWidth={1.5}
        />
        <G rotation={-80} origin="90, 90">
          {[palette.c1, palette.c2, palette.c3].map((color, i) => (
            <Circle
              key={i}
              cx={90}
              cy={90}
              r={62}
              fill="none"
              stroke={color}
              strokeWidth={13}
              strokeLinecap="round"
              strokeDasharray="110 280"
              strokeDashoffset={-130 * i}
            />
          ))}
        </G>
        <Glyph d={SYMBOL_PATHS.fitness_center.fill} x={70} y={44} size={40} color={palette.c1} />
        <Glyph
          d={SYMBOL_PATHS.account_balance_wallet.fill}
          x={45}
          y={93}
          size={38}
          color={palette.c3}
        />
        <Glyph d={SYMBOL_PATHS.task_alt.fill} x={97} y={93} size={38} color={palette.c2} />
      </Svg>
    </View>
  );
}
