/**
 * AiOrb — the assistant's mark, and the one thing in the app that never wears
 * the theme.
 *
 *        ✦                    a 2 dp conic ring, violet → pink → amber → cyan;
 *     ╭─────╮                 an inner radial from #34245A to #130E22; the
 *     │  ✧  │                 sparkle; and, on the top-bar button, two stars.
 *     ╰─────╯
 *   ✦
 *
 * ── WHY IT IS NOT THEMED ──────────────────────────────────────────────────
 *
 * Everything else lit in the app is c1/c2/c3, so any accent colour would be lost
 * among eight themes' worth of buttons. Fixed colours (`ai` in `theme/tokens.ts`)
 * that no preset uses are what make the door to the assistant findable on every
 * theme — the Settings footnote says so to the user in as many words.
 *
 * ── HOW THE CONIC RING IS DRAWN ───────────────────────────────────────────
 *
 * React Native has no conic gradient and `react-native-svg` has none either. So
 * the ring is a pie of 48 thin wedges, each one solid colour sampled along the
 * five stops, with the inner disc painted over the middle: at 46 dp a wedge is a
 * fraction of a pixel wide at the rim and the steps cannot be seen. The prototype
 * animates the gradient's START ANGLE; rotating the whole pie is the same picture,
 * and a rotation runs on the native driver where an SVG attribute cannot. The pie
 * is built once at module load — the colours are fixed, so there is nothing a
 * theme change could make stale.
 *
 * ── IT IS STILL ────────────────────────────────────────────────────────────
 *
 * It used to spin, breathe, glow, sweep a sheen and twinkle — five loops that
 * never stopped, on a mark that sits in EVERY section's top bar, so the app was
 * never at rest. 2.1.0 stopped all five: the colours are what make the orb
 * findable, and they do that just as well standing still.
 */

import { memo } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';

import { ai, radius } from '../theme/tokens';
import { Icon } from './Icon';

const RING = 2;

/* ── The pie ──────────────────────────────────────────────────────────── */

const WEDGES = 48;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The ring's colour at `t` ∈ [0, 1] around the circle, from the top, clockwise. */
function ringColor(t: number): string {
  const stops = ai.ring;
  const span = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(span));
  const f = span - i;
  const a = hexToRgb(stops[i]);
  const b = hexToRgb(stops[i + 1]);
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** 48 wedges on a 100 × 100 box, each overlapping the next by a hair so no seam shows. */
const PIE = Array.from({ length: WEDGES }, (_, i) => {
  const a0 = (i / WEDGES) * Math.PI * 2;
  const a1 = ((i + 1.15) / WEDGES) * Math.PI * 2;
  const x0 = 50 + 50 * Math.sin(a0);
  const y0 = 50 - 50 * Math.cos(a0);
  const x1 = 50 + 50 * Math.sin(a1);
  const y1 = 50 - 50 * Math.cos(a1);
  return {
    d: `M50 50L${x0.toFixed(3)} ${y0.toFixed(3)}A50 50 0 0 1 ${x1.toFixed(3)} ${y1.toFixed(3)}Z`,
    color: ringColor((i + 0.5) / WEDGES),
  };
});

/* Memoised: every prop is a primitive, and it sits in top bars and cards whose
   hosts re-render far more often than the orb changes. */
export const AiOrb = memo(function AiOrb({
  size = 46,
  glyph = Math.round(size * 0.48),
  stars = false,
}: {
  size?: number;
  /** The sparkle's size: 22 on the top-bar button, 20 on the card's 44. */
  glyph?: number;
  /** The two ✦ at its corners — the top-bar button's. */
  stars?: boolean;
}) {
  const inner = size - RING * 2;

  return (
    <View style={{ width: size, height: size }}>
      <View pointerEvents="none" style={ROUND}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          {PIE.map((wedge) => (
            <Path key={wedge.d} d={wedge.d} fill={wedge.color} />
          ))}
        </Svg>
      </View>

      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: RING,
          left: RING,
          width: inner,
          height: inner,
          borderRadius: radius.pill,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Svg width={inner} height={inner} style={{ position: 'absolute' }}>
          <Defs>
            {/* `radial-gradient(circle at 30% 25%, #34245a, #130e22 72%)`: the
                farthest corner from (.3,.25) is 1.03 of the side away. */}
            <RadialGradient id="aiOrbInner" cx="30%" cy="25%" r="103%" fx="30%" fy="25%">
              <Stop offset="0" stopColor={ai.innerFrom} />
              <Stop offset="0.72" stopColor={ai.innerTo} />
            </RadialGradient>
          </Defs>
          <Circle cx={inner / 2} cy={inner / 2} r={inner / 2} fill="url(#aiOrbInner)" />
        </Svg>
        <Icon name="sparkle" size={glyph} color={ai.glyph} />
      </View>

      {stars ? (
        <>
          <Star glyphSize={11} color="#FDE68A" position={{ top: -3, right: -2 }} />
          <Star glyphSize={8} color="#A5F3FC" position={{ bottom: -2, left: -3 }} />
        </>
      ) : null}
    </View>
  );
});

function Star({
  glyphSize,
  color,
  position,
}: {
  glyphSize: number;
  color: string;
  position: { top?: number; right?: number; bottom?: number; left?: number };
}) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', ...position }}>
      <Text
        allowFontScaling={false}
        style={{
          fontSize: glyphSize,
          lineHeight: glyphSize + 2,
          color,
          includeFontPadding: false,
        }}
      >
        ✦
      </Text>
    </View>
  );
}

const ROUND = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  borderRadius: radius.pill,
} as const;
