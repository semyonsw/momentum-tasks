/**
 * NavBar — two icons, a raised Home button, two icons, on one pane of glass.
 *
 *            ╭──────╮
 *   ╭────────│  ⌂   │────────╮
 *   │  🏋   ✓ ╰──────╯  ▣   ⚙ │
 *   │  ▬                      │
 *   ╰─────────────────────────╯
 *
 * It replaces `TabBar`'s four words. Momentum put a landing above the four
 * sections, and the way back to it has to be one tap from anywhere and
 * findable without reading — so it is the one raised, gradient-filled thing on
 * the bar, and the four sections became glyphs either side of it. The glyphs
 * are the same four as the Home tiles, which is what makes them learnable: you
 * have already tapped the big version of each one.
 *
 * ── THE BLOB IS LIQUID, AND THE SWIPE PULLS IT ────────────────────────────
 *
 * The lit pane under the active icon does not slide as a rectangle. Its LEADING
 * edge moves in 360 ms and its trailing edge follows in 560 ms, 60 ms late, both
 * on an overshooting curve — so for a moment it is wider than itself and then it
 * lands. While a finger drags between sections, `drag` (−1 … 1 of the way to the
 * neighbour) moves it directly and it stretches by `16·sin(πp)` each side: the
 * same shape `lib/sectionNav.blobEdges` computes, inlined below because a
 * worklet cannot call a plain function.
 *
 * Hidden on Home and on every pushed screen: it drops away in 380 ms, and comes
 * back up on an overshoot 160 ms after a section arrives, so the section is on
 * screen before the chrome is.
 *
 * All of it is Reanimated, on the UI thread — the blob moves under a finger, and
 * a JS-thread animation there is a nav bar that stutters whenever a list renders.
 */

import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { BubblePressable } from './bubbles';
import { GlassBar } from './glass';
import { MaterialSymbol, type SymbolName } from './MaterialSymbol';
import { useT } from '../hooks/useT';
import { BLOB_HALF, BLOB_STRETCH, NAV_SLOTS, SECTIONS, type SectionTab } from '../lib/sectionNav';
import { gradientFill, palette, tint } from '../theme/tokens';

const GLYPH: Record<SectionTab, SymbolName> = {
  Workout: 'fitness_center',
  Tasks: 'task_alt',
  Expenses: 'account_balance_wallet',
  Settings: 'settings',
};

/** What a screen reader says — the section's own name, Expenses as Finance. */
const LABEL: Record<SectionTab, string> = {
  Workout: 'Workout',
  Tasks: 'Tasks',
  Expenses: 'Finance',
  Settings: 'Settings',
};

const LIQUID = Easing.bezier(0.34, 1.3, 0.64, 1);
const RISE = Easing.bezier(0.34, 1.45, 0.64, 1);
const DROP = Easing.bezier(0.5, 0, 0.75, 0);

export const NAV_HEIGHT = 70;
export const NAV_BOTTOM = 14;

interface NavBarProps {
  active: SectionTab;
  /** False on Home and under a pushed screen. */
  visible: boolean;
  onSelect: (tab: SectionTab) => void;
  onHome: () => void;
  /** −1 … 1: how far a finger has dragged toward the previous / next section. */
  drag: SharedValue<number>;
}

export function NavBar({ active, visible, onSelect, onHome, drag }: NavBarProps) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const [width, setWidth] = useState(0);

  const shown = useSharedValue(visible ? 1 : 0);
  useEffect(() => {
    shown.value = visible
      ? withDelay(160, withTiming(1, { duration: 620, easing: RISE }))
      : withTiming(0, { duration: 380, easing: DROP });
  }, [shown, visible]);

  /* The blob's two edges, each on its own clock. See the file header. */
  const centre = NAV_SLOTS[active] * width;
  const left = useSharedValue(centre - BLOB_HALF);
  const right = useSharedValue(centre + BLOB_HALF);
  const activeIndex = SECTIONS.indexOf(active);
  const previous = useSharedValue(activeIndex);
  const placed = useRef(false);
  useEffect(() => {
    if (width === 0) return;
    /* The first measurement places the blob; only later changes travel. */
    if (!placed.current) {
      placed.current = true;
      left.value = centre - BLOB_HALF;
      right.value = centre + BLOB_HALF;
      previous.value = activeIndex;
      return;
    }
    const movingRight = activeIndex > previous.value;
    const lead = { duration: 360, easing: LIQUID };
    const trail = { duration: 560, easing: LIQUID };
    left.value = movingRight
      ? withDelay(60, withTiming(centre - BLOB_HALF, trail))
      : withTiming(centre - BLOB_HALF, lead);
    right.value = movingRight
      ? withTiming(centre + BLOB_HALF, lead)
      : withDelay(60, withTiming(centre + BLOB_HALF, trail));
    previous.value = activeIndex;
  }, [activeIndex, centre, left, previous, right, width]);

  const centres = SECTIONS.map((s) => NAV_SLOTS[s] * width);

  const barStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, shown.value * 1.4),
    transform: [{ translateY: (1 - shown.value) * 130 }, { scale: 0.92 + 0.08 * shown.value }],
  }));

  const blobStyle = useAnimatedStyle(() => {
    const d = drag.value;
    if (d === 0 || width === 0) return { left: left.value, width: right.value - left.value };
    const target = Math.min(Math.max(activeIndex + (d > 0 ? 1 : -1), 0), centres.length - 1);
    const p = Math.min(Math.abs(d), 1);
    const from = centres[activeIndex];
    const c = from + (centres[target] - from) * p;
    const half = BLOB_HALF + BLOB_STRETCH * Math.sin(Math.PI * p);
    return { left: c - half, width: half * 2 };
  });

  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      style={[
        {
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: NAV_BOTTOM + insets.bottom,
          height: NAV_HEIGHT,
        },
        barStyle,
      ]}
    >
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: 30,
          boxShadow: [{ offsetX: 0, offsetY: -2, blurRadius: 30, color: 'rgba(0,0,0,0.6)' }],
        }}
      >
        <GlassBar radius={30} style={{ flex: 1 }}>
          <View style={{ flex: 1 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
            {width > 0 ? (
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    top: 9,
                    bottom: 9,
                    borderRadius: 22,
                    borderWidth: 1,
                    borderColor: tint(0.3),
                    backgroundColor: tint(0.18),
                    boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 18, color: tint(0.26) }],
                  },
                  blobStyle,
                ]}
              />
            ) : null}
          </View>
        </GlassBar>
      </View>

      {width > 0
        ? SECTIONS.map((section, i) => (
            <NavItem
              key={section}
              glyph={GLYPH[section]}
              label={t(LABEL[section])}
              active={section === active}
              centre={centres[i]}
              onPress={() => onSelect(section)}
            />
          ))
        : null}

      <HomeButton label={t('Home')} onPress={onHome} running={visible} />
    </Animated.View>
  );
}

function NavItem({
  glyph,
  label,
  active,
  centre,
  onPress,
}: {
  glyph: SymbolName;
  label: string;
  active: boolean;
  centre: number;
  onPress: () => void;
}) {
  const on = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    on.value = withTiming(active ? 1 : 0, {
      duration: 420,
      easing: Easing.bezier(0.34, 1.56, 0.64, 1),
    });
  }, [active, on]);
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -on.value }, { scale: 1 + 0.1 * on.value }],
  }));
  const dotStyle = useAnimatedStyle(() => ({ width: 4 + 14 * Math.min(1, Math.max(0, on.value)) }));

  return (
    <BubblePressable
      onPress={onPress}
      radius={22}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={{
        position: 'absolute',
        top: 0,
        left: centre - 32,
        width: 64,
        height: NAV_HEIGHT,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Animated.View style={iconStyle}>
        <MaterialSymbol
          name={glyph}
          size={27}
          color={active ? palette.acc : palette.inkMuted}
          filled={active}
        />
      </Animated.View>
      <Animated.View
        style={[
          {
            marginTop: 5,
            height: 4,
            borderRadius: 999,
            backgroundColor: active ? palette.acc : palette.hairline,
            ...(active
              ? { boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 8, color: palette.acc }] }
              : {}),
          },
          dotStyle,
        ]}
      />
    </BubblePressable>
  );
}

/**
 * The raised 66 dp gradient circle. A 6 dp ring of the bar's own near-black
 * separates it from the glass it rises out of, and a soft highlight drifts
 * inside it on a six-second loop — the one element of the chrome that is never
 * quite still, because it is the one that is always the way out.
 */
function HomeButton({
  label,
  onPress,
  running,
}: {
  label: string;
  onPress: () => void;
  /** The drift runs only while the bar is on screen. */
  running: boolean;
}) {
  const drift = useSharedValue(0);
  useEffect(() => {
    /* The bar is always mounted — it fades out on Home, under every pushed
       screen and for the whole of a workout — and a repeat that never stops
       kept the UI thread animating an invisible circle at 60 fps all that time. */
    if (!running) {
      cancelAnimation(drift);
      return;
    }
    drift.value = withRepeat(
      withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(drift);
  }, [drift, running]);
  const highlightStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -4 + 8 * drift.value },
      { translateY: 3 - 6 * drift.value },
      { scale: 0.92 + 0.14 * drift.value },
      { rotate: `${-12 + 24 * drift.value}deg` },
    ],
  }));

  return (
    <View
      style={{
        position: 'absolute',
        top: -24,
        left: '50%',
        marginLeft: -33,
        width: 66,
        height: 66,
        borderRadius: 9999,
        boxShadow: [
          { offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 6, color: '#0B0F0E' },
          { offsetX: 0, offsetY: 0, blurRadius: 34, color: tint(0.55) },
          { offsetX: 0, offsetY: 12, blurRadius: 28, color: 'rgba(0,0,0,0.55)' },
        ],
      }}
    >
      <BubblePressable
        onPress={onPress}
        radius="pill"
        bubbleColor={palette.ink}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{
          width: 66,
          height: 66,
          borderRadius: 9999,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.22)',
        }}
      >
        <LinearGradient
          {...gradientFill()}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', top: 6, left: 6, right: 6, bottom: 6 }, highlightStyle]}
        >
          <Svg width="100%" height="100%" viewBox="0 0 54 54">
            <Defs>
              <RadialGradient id="homeBlob" cx="35%" cy="25%" r="60%">
                <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.35} />
                <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x={0} y={0} width={54} height={54} rx={27} fill="url(#homeBlob)" />
          </Svg>
        </Animated.View>
        <MaterialSymbol name="home" size={32} color={palette.onAcc} filled />
      </BubblePressable>
    </View>
  );
}
