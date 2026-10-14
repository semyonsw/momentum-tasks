/**
 * FloatingBubble — a section's hero, carried along at the top once it has
 * scrolled away.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ EXPENSES                                  ⟲  │  ← the bar
 *   │        ╭──────────────────────────────╮      │
 *   │        │ (💵 CASH 9,020)(💳 ONLINE …) │      │  ← the bubble, top + 70
 *   │        ╰──────────────────────────────╯      │
 *   │  ░░ category tiles scrolling under ░░        │
 *   └──────────────────────────────────────────────┘
 *
 * ── WHY IT EXISTS ─────────────────────────────────────────────────────────
 *
 * Each section is ABOUT one thing — the workout you are going to do, how the day
 * is going, what you have — and that thing is the hero at the top. Scrolling the
 * list under it used to take it away entirely: a category grid read with no
 * balance on screen, a task list with no idea how much of the day was done. The
 * bubble is the hero at a tenth of the size, and it is the SAME object in all
 * three sections — one shell, one trigger, one animation; only the contents
 * differ. That sameness is what lets it be learned once.
 *
 * ── THE MOTION ────────────────────────────────────────────────────────────
 *
 *   in    translateY −28 → 0 and scale 0.82 → 1 over 560 ms on
 *         `bezier(.34,1.5,.64,1)` — it drops in and overshoots — with the
 *         opacity over the first 260 ms, and then its children follow one after
 *         another, 120/190/260 ms late.
 *   out   320 ms on `bezier(.4,0,.6,1)`, opacity 220 ms, no stagger. Something
 *         leaving should not ask to be watched.
 *
 * The design's blur-in (6 → 0) has no cheap React Native equivalent and is left
 * out; the rest is exactly the v3 spec's.
 *
 * ── THE GLASS ─────────────────────────────────────────────────────────────
 *
 * Its own recipe rather than a `glassTier`, because it is the one pane in the app
 * that floats over MOVING content with nothing but the page behind it: a tint of
 * `rgba(23,28,26,.72)` over a dark `Pane`, a border of ink at 10 %, and a 1 px
 * specular line inset 18 from each end. The blur under it, its theme glow, its
 * drop shadow and its 4.5 s sheen were all cut in 2.1.0 (`halo` in
 * `theme/tokens.ts` says why): it floats over a list that is moving, which is
 * exactly when each of them cost the most.
 *
 * ── ITS WIDTH ─────────────────────────────────────────────────────────────
 *
 * Each section passes the design's width (Workout 338, Tasks 300, Finance 326),
 * capped at the screen minus 16 each side. A fixed width rather than hugging the
 * contents, because a pill whose edge moves every time a name changes length is
 * a pill that twitches; a running name inside it gives way instead.
 *
 * `pointerEvents` is off while hidden, so an invisible bubble never eats a tap
 * meant for the row under it.
 */

import { Children, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMotionScale } from '../hooks/useMotionScale';
import { curve, motion, radius } from '../theme/tokens';
import { Pane } from './glass';

const EASE = curve(motion.ease);
const DROP = Easing.bezier(0.34, 1.5, 0.64, 1);
const FOLLOW = Easing.bezier(0.34, 1.4, 0.64, 1);
const LIFT = Easing.bezier(0.4, 0, 0.6, 1);
const EASE_IN = Easing.in(Easing.quad);

/**
 * Two below the top bar's bottom edge. The prototype says `top: 104` in a frame
 * whose bar is `34 + 60 + 8` = 102 tall — its 34 is the status bar, which here
 * is `insets.top` — so the same 2 dp of air is `insets.top + 70`.
 */
const BUBBLE_TOP = 70;

export function FloatingBubble({
  visible,
  children,
  delays = [120, 190, 260],
  contentStyle,
  accessibilityLabel,
  underlay,
  onItemLayout,
  width,
}: {
  visible: boolean;
  /** Each child gets its own staggered entrance, in order. */
  children: ReactNode;
  /** When each child follows the capsule in, ms. */
  delays?: readonly number[];
  /** Padding and gap inside the capsule — each bubble's own. */
  contentStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  /** Drawn inside the capsule, under the children — the balance bubble's thumb. */
  underlay?: ReactNode;
  /** Where each child landed inside the capsule, for an underlay that follows one. */
  onItemLayout?: (index: number, layout: { x: number; width: number }) => void;
  /** The capsule's width, capped at the screen minus 32. Absent = hug the contents. */
  width?: number;
}) {
  const insets = useSafeAreaInsets();
  const screen = useWindowDimensions();
  const capsuleWidth = width != null ? Math.min(width, screen.width - 32) : undefined;
  const scale = useMotionScale();
  const items = Children.toArray(children);

  const fade = useRef(new Animated.Value(0)).current;
  const move = useRef(new Animated.Value(0)).current;
  const itemValues = useRef<Animated.Value[]>([]);
  /* Each item's rise, built beside its value and kept: a fresh interpolation node
     per render makes the Animated.View detach and re-attach its native graph. */
  const itemRises = useRef<Animated.AnimatedInterpolation<number>[]>([]);
  while (itemValues.current.length < items.length) {
    const value = new Animated.Value(0);
    itemValues.current.push(value);
    itemRises.current.push(value.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }));
  }

  /** The blur stays mounted through the exit, and goes once it has finished. */
  const [blurred, setBlurred] = useState(visible);

  useEffect(() => {
    if (visible) setBlurred(true);
    const values = itemValues.current;
    const animation = visible
      ? Animated.parallel([
          Animated.timing(fade, {
            toValue: 1,
            duration: 260 * scale,
            easing: EASE,
            useNativeDriver: true,
          }),
          Animated.timing(move, {
            toValue: 1,
            duration: 560 * scale,
            easing: DROP,
            useNativeDriver: true,
          }),
          ...values.map((value, index) =>
            Animated.timing(value, {
              toValue: 1,
              duration: 520 * scale,
              delay: (delays[index] ?? delays[delays.length - 1] ?? 0) * scale,
              easing: FOLLOW,
              useNativeDriver: true,
            }),
          ),
        ])
      : Animated.parallel([
          Animated.timing(fade, {
            toValue: 0,
            duration: 220 * scale,
            easing: EASE_IN,
            useNativeDriver: true,
          }),
          Animated.timing(move, {
            toValue: 0,
            duration: 320 * scale,
            easing: LIFT,
            useNativeDriver: true,
          }),
          ...values.map((value) =>
            Animated.timing(value, {
              toValue: 0,
              duration: 220 * scale,
              easing: EASE_IN,
              useNativeDriver: true,
            }),
          ),
        ]);
    animation.start(({ finished }) => {
      if (finished && !visible) setBlurred(false);
    });
    return () => animation.stop();
    // `delays` is a literal at every call site; the animation keys on `visible`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, scale, fade, move]);

  const nodes = useMemo(
    () => ({
      dropY: move.interpolate({ inputRange: [0, 1], outputRange: [-28, 0] }),
      dropScale: move.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }),
    }),
    [move],
  );

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: insets.top + BUBBLE_TOP,
        left: 0,
        right: 0,
        alignItems: 'center',
        // Over the scroll, under the top bar (`SectionTopBar` is 10): the drop
        // starts 28 dp up, and it should come out from under the glass.
        zIndex: 9,
      }}
    >
      <Animated.View
        pointerEvents={visible ? 'box-none' : 'none'}
        accessibilityElementsHidden={!visible}
        importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
        accessibilityLabel={accessibilityLabel}
        style={{
          opacity: fade,
          transformOrigin: 'top',
          transform: [{ translateY: nodes.dropY }, { scale: nodes.dropScale }],
        }}
      >
        <View style={{ borderRadius: radius.pill }}>
          <View
            style={[
              {
                borderRadius: radius.pill,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: 'rgba(236,241,238,0.10)',
                flexDirection: 'row',
                alignItems: 'center',
                padding: 6,
                paddingRight: 8,
                width: capsuleWidth,
              },
              contentStyle,
            ]}
          >
            {blurred ? <Pane intensity={30} /> : null}
            <View pointerEvents="none" style={[FILL, { backgroundColor: 'rgba(23,28,26,0.72)' }]} />
            {/* The 1 px specular: a line, not an edge, fading out 18 dp short
                of each end where the pill curves away from the light. */}
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(236,241,238,0)', 'rgba(236,241,238,0.35)', 'rgba(236,241,238,0)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{ position: 'absolute', top: 0, left: 18, right: 18, height: 1 }}
            />
            {underlay}
            {items.map((child, index) => {
              const value = itemValues.current[index];
              return (
                <Animated.View
                  key={index}
                  onLayout={
                    onItemLayout
                      ? (e) =>
                          onItemLayout(index, {
                            x: e.nativeEvent.layout.x,
                            width: e.nativeEvent.layout.width,
                          })
                      : undefined
                  }
                  style={{
                    opacity: value,
                    transform: [{ translateY: itemRises.current[index] }],
                  }}
                >
                  {child}
                </Animated.View>
              );
            })}
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

/**
 * The hero, stepping back while its bubble is up: scale 1 → 0.95 and opacity
 * 1 → 0.45 from its top edge, both over 420 ms. It is already under the bar by
 * then; this only stops it competing with the bubble through the glass. The
 * design also blurs it by 2 — a live blur over a whole hero every scroll is not
 * worth a frame budget for a 2 px softening, so that part is left out. Put the
 * style on an `Animated.View` around the hero.
 */
export function useHeroRecede(receded: boolean) {
  const scale = useMotionScale();
  const v = useRef(new Animated.Value(receded ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: receded ? 1 : 0,
      duration: 420 * scale,
      easing: EASE,
      useNativeDriver: true,
    }).start();
  }, [receded, scale, v]);
  return useMemo(
    () => ({
      opacity: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] }),
      transformOrigin: 'top' as const,
      transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.95] }) }],
    }),
    [v],
  );
}
