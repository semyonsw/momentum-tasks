/**
 * AiOrb — the assistant's mark, and the one thing in the app that never wears
 * the theme.
 *
 *        ✦                    a 2 dp conic ring, violet → pink → amber → cyan,
 *     ╭─────╮                 turning once every 4 s; an inner radial from
 *     │  ✧  │ ← sheen         #34245A to #130E22; the sparkle breathing
 *     ╰─────╯                 (scale 1.14, 12°, 2.6 s) under a glow that pulses
 *   ✦                         pink/violet on the same beat; and, on the top-bar
 *                             button, a light sheen and two twinkling stars.
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
 * ── THE COST ──────────────────────────────────────────────────────────────
 *
 * Four native-driven loops per orb (spin, breath+glow, sheen, twinkle), all
 * transform/opacity, none re-rendering React. The glow is two fixed `boxShadow`
 * layers cross-faded, because a shadow cannot be animated and an opacity can.
 */

import { memo, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';

import { useMotionScale } from '../hooks/useMotionScale';
import { ai, radius } from '../theme/tokens';
import { Icon } from './Icon';
import { Sheen } from './motion';

/** CSS `ease-in-out`, which every one of the prototype's AI keyframes uses. */
const EASE_IN_OUT = Easing.bezier(0.42, 0, 0.58, 1);

const SPIN_MS = 4000;
const BREATH_MS = 2600;
const TWINKLE_MS = 2200;
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

/* ── The glow ─────────────────────────────────────────────────────────── */

/** `aiGlow` 0 % / 100 %. */
const GLOW_LOW = [{ offsetX: 0, offsetY: 0, blurRadius: 10, color: 'rgba(236,72,153,0.35)' }];
/** `aiGlow` 50 %. */
const GLOW_HIGH = [
  { offsetX: 0, offsetY: 0, blurRadius: 18, color: 'rgba(236,72,153,0.55)' },
  { offsetX: 0, offsetY: 0, blurRadius: 30, color: 'rgba(139,92,246,0.55)' },
];

/** `twinkle`: opacity / scale / rotation at 0, 45, 70 and 100 %. */
const TWINKLE_IN = [0, 0.45, 0.7, 1];

/** A loop on the native driver, stopped on unmount. Zero-motion renders the rest state. */
function useLoop(make: (value: Animated.Value) => Animated.CompositeAnimation, delayMs = 0) {
  const scale = useMotionScale();
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (scale === 0) return undefined;
    const loop = Animated.loop(make(value));
    const start = setTimeout(() => loop.start(), delayMs);
    return () => {
      clearTimeout(start);
      loop.stop();
    };
    // `make` is a literal at each call site; the loop keys on the value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, value, delayMs]);
  return value;
}

/* Memoised: every prop is a primitive, and it sits in top bars and cards whose
   hosts re-render far more often than the orb changes. */
export const AiOrb = memo(function AiOrb({
  size = 46,
  glyph = Math.round(size * 0.48),
  glow = true,
  sheen = false,
  stars = false,
}: {
  size?: number;
  /** The sparkle's size: 22 on the top-bar button, 20 on the card's 44. */
  glyph?: number;
  /** The pulsing pink/violet glow. Off in a list of them. */
  glow?: boolean;
  /** The 3.2 s light sweep — the top-bar button's. */
  sheen?: boolean;
  /** The two ✦ that twinkle at its corners — the top-bar button's. */
  stars?: boolean;
}) {
  const spin = useLoop((v) =>
    Animated.timing(v, {
      toValue: 1,
      duration: SPIN_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    }),
  );
  const breath = useLoop((v) =>
    Animated.sequence([
      Animated.timing(v, {
        toValue: 1,
        duration: BREATH_MS / 2,
        easing: EASE_IN_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(v, {
        toValue: 0,
        duration: BREATH_MS / 2,
        easing: EASE_IN_OUT,
        useNativeDriver: true,
      }),
    ]),
  );
  const inner = size - RING * 2;
  // Built once: a fresh interpolation node per render makes each Animated.View
  // detach and re-attach its native animation graph.
  const nodes = useMemo(
    () => ({
      spin: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }),
      breathScale: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] }),
      breathRotate: breath.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '12deg'] }),
    }),
    [breath, spin],
  );

  return (
    <View style={{ width: size, height: size }}>
      {glow ? (
        <>
          <View pointerEvents="none" style={[ROUND, { boxShadow: GLOW_LOW }]} />
          <Animated.View
            pointerEvents="none"
            style={[ROUND, { opacity: breath, boxShadow: GLOW_HIGH }]}
          />
        </>
      ) : null}

      <Animated.View
        pointerEvents="none"
        style={[
          ROUND,
          {
            transform: [{ rotate: nodes.spin }],
          },
        ]}
      >
        <Svg width={size} height={size} viewBox="0 0 100 100">
          {PIE.map((wedge) => (
            <Path key={wedge.d} d={wedge.d} fill={wedge.color} />
          ))}
        </Svg>
      </Animated.View>

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
        <Animated.View
          style={{
            transform: [{ scale: nodes.breathScale }, { rotate: nodes.breathRotate }],
          }}
        >
          <Icon name="sparkle" size={glyph} color={ai.glyph} />
        </Animated.View>
        {sheen ? <Sheen band={0.4} alpha={0.28} periodMs={3200} /> : null}
      </View>

      {stars ? (
        <>
          <Twinkle glyphSize={11} color="#FDE68A" position={{ top: -3, right: -2 }} delayMs={0} />
          <Twinkle
            glyphSize={8}
            color="#A5F3FC"
            position={{ bottom: -2, left: -3 }}
            delayMs={TWINKLE_MS / 2}
          />
        </>
      ) : null}
    </View>
  );
});

function Twinkle({
  glyphSize,
  color,
  position,
  delayMs,
}: {
  glyphSize: number;
  color: string;
  position: { top?: number; right?: number; bottom?: number; left?: number };
  delayMs: number;
}) {
  const v = useLoop(
    (value) =>
      Animated.timing(value, {
        toValue: 1,
        duration: TWINKLE_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    delayMs,
  );
  const nodes = useMemo(
    () => ({
      opacity: v.interpolate({ inputRange: TWINKLE_IN, outputRange: [0, 1, 0, 0] }),
      scale: v.interpolate({ inputRange: TWINKLE_IN, outputRange: [0.3, 1, 0.4, 0.3] }),
      rotate: v.interpolate({
        inputRange: TWINKLE_IN,
        outputRange: ['0deg', '90deg', '160deg', '0deg'],
      }),
    }),
    [v],
  );
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        ...position,
        opacity: nodes.opacity,
        transform: [{ scale: nodes.scale }, { rotate: nodes.rotate }],
      }}
    >
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
    </Animated.View>
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
