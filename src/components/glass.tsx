/**
 * The glass vocabulary — five components, and every pane in the app is one of
 * them.
 *
 *   Lamps          layer 1: the radial greens the glass is lit BY
 *   SpecularEdge   the 1px lit line along a pane's top edge
 *   GlassSurface   layer 2: a blurred, tinted pane with a border and a shadow
 *   GlassBar       layer 4: the top bar and the nav pill, content scrolling under
 *   FloatingAction layer 3: the one commit action, right:16 bottom:92
 *   Toast          what a commit says on its way out — and, for a removal, the
 *                  one tap that takes it back
 *
 * ── WHY THE LIGHT HAS TO BE UNDER THE GLASS ───────────────────────────────
 *
 * The app already had glass tokens and section glows and still read flat, and
 * the reason was an ordering mistake rather than a value: the glow sat BEHIND a
 * surface with nothing to transmit. `SectionGlow` painted a radial, and then an
 * opaque-enough card was drawn over it, so the light had nowhere to go. Here the
 * lamps are the first child of the screen and every pane over them is
 * translucent enough to carry them through. That is the entire difference
 * between "tinted rectangle" and "pane".
 *
 * ── THE ANDROID RULES THIS FILE EXISTS TO HOLD ────────────────────────────
 *
 *  • A `BlurView` CLIPS ITS CHILDREN UNRELIABLY. So `GlassSurface` is a plain
 *    `View` with the radius and `overflow: hidden`, and the blur is a child of
 *    it filling the box. Never the other way round.
 *  • `elevation` CANNOT DO A COLOURED SHADOW. Every glow here is `boxShadow`,
 *    which React Native 0.76+ supports directly on the new architecture, and
 *    the whole app is already on it (`theme/tokens.ts` made the same call for
 *    the repeating glow). `elevation` is never used.
 *  • THERE IS NO INSET SHADOW. The specular edge is a real 1px `View` pinned to
 *    the top of the pane with the top two corners matching. Cheap, and it reads
 *    correctly at 1px on a 3× screen.
 *  • THERE IS NO BLUR, AND NO GLOW. Since 2.1.0 a "blurred" pane is a darker
 *    fill (see `Pane`) and every `boxShadow` is gone (see `halo` in
 *    `theme/tokens.ts`). Both were most of the frames the app dropped.
 */

import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BubblePressable } from './bubbles';
import { Icon, type IconName } from './Icon';
import { MaterialSymbol, type SymbolName } from './MaterialSymbol';
import { usePressScale } from './motion';
import { FAB_HIDE_DISTANCE, FAB_HIDE_MS } from '../lib/fabScroll';
import { FADE_ON, RunningText } from './RunningText';
import { useArrived } from '../hooks/useArrived';
import { useMotionScale } from '../hooks/useMotionScale';
import {
  barInset,
  curve,
  elevation,
  floatingSlot,
  glassTier,
  gradientFill,
  halo,
  LAMPS,
  motion,
  palette,
  radius as RADIUS,
  specularHeavy,
  tint,
  type GlassTier,
  type LampSpec,
} from '../theme/tokens';

/**
 * The backdrop half of a pane — which used to be a `BlurView`, and is now a
 * plain fill. 2.1.0 took every blur out of the app.
 *
 * ── WHY THE BLUR WENT ────────────────────────────────────────────────────
 *
 * The Dimezis view Android needs hooks the window's pre-draw and re-renders the
 * whole app into its bitmap on every frame anything moves. The rationing below
 * (three per screen, `BlurGate` unmounting the hidden ones) made that bearable,
 * never free: a list scrolling under the top bar paid a full-window redraw per
 * blur per frame, and those were the microfreezes. What sat behind the glass was
 * the lamps — radials that are already soft — and rows moving under a bar that
 * is 58 % opaque, so what the blur bought was close to nothing on a phone.
 *
 * ── WHY THE FILL SCALES WITH `intensity` ─────────────────────────────────
 *
 * A heavier blur was always the surface more content moves under — bars and
 * sheets at 30+, card panes at ~20 — so the old intensity is kept as the dial
 * for how much the fill hides: a bar stops rows reading through it, a hero still
 * lets its lamp in. Callers did not have to change.
 */
/** The ghost round action's glyph: softer than ink, so it reads as maintenance. */
const INK_SOFT = '#AEB9B3';

/**
 * Whether a `Pane` under this point may mount its blur. True everywhere by
 * default; false only where the shell KNOWS the glass cannot be seen — the roots
 * while a pushed screen covers them, the nav pill once it has dropped away.
 *
 * It was needed when a `Pane` was a blur, because a hidden blur was not an idle
 * one. A fill costs almost nothing, but one that cannot be seen costs less, so
 * the shell's gating stays.
 */
export const BlurGate = createContext(true);

export function Pane({ intensity }: { intensity: number }) {
  const live = useContext(BlurGate);
  if (!live) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: `rgba(8,11,10,${paneAlpha(intensity)})`,
      }}
    />
  );
}

/** The old blur intensity, as the backdrop's alpha: 10 → 0.25, 20 → 0.5, 34 → 0.85. */
function paneAlpha(intensity: number): number {
  return Math.min(0.88, intensity / 40);
}

/* ------------------------------------------------------------------ */
/* Layer 1 — the lamps                                                 */
/* ------------------------------------------------------------------ */

/**
 * The two or three radial greens a section is lit by. Absolutely positioned,
 * `pointerEvents="none"`, and the first child of every section root.
 *
 * STILL. They used to breathe (opacity 0.72 ↔ 1 over 7 s), and a full-window
 * layer whose opacity never stops changing is a full-window composite on every
 * frame of the app's life — for a change nobody could see happen.
 *
 * ONE `Svg` HOLDING ALL OF THEM rather than one per lamp: three overlapping
 * full-screen native views is three compositing layers for a decoration, and the
 * gradients are defined once in a shared `<Defs>` either way.
 *
 * `expo-linear-gradient` cannot do a radial, which is why this is SVG and not
 * the dependency the rest of the file's gradients come from. It also stays
 * tunable — the alternative the design offers is a pre-exported PNG at 2×/3×,
 * and a lamp you cannot move is a lamp that will be wrong on the next screen.
 *
 * The drawing is memoised on what it is drawn from — the window, the section's
 * lamps and the theme's three stops — because it sits under every section root,
 * and those re-render far more often than the lamps change. On the colours and
 * not on the props alone: the launch screen is outside the tree that remounts on
 * a new theme, and the theme arriving under the launch mark has to relight it.
 */
export function Lamps({ section }: { section: keyof typeof LAMPS | string }) {
  const specs = LAMPS[section] ?? LAMPS.Workout;
  const { width, height } = useWindowDimensions();
  const { c1, c2, c3 } = palette;
  const art = useMemo(
    () => (
      <Svg width={width} height={height}>
        <Defs>
          {/* One gradient per theme stop: the lamps are the three colours of
              the theme, not one green at two strengths. */}
          <RadialGradient id="lampBright" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={c2} stopOpacity={1} />
            <Stop offset="70%" stopColor={c2} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="lampDim" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={c1} stopOpacity={1} />
            <Stop offset="70%" stopColor={c1} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="lampThird" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={c3} stopOpacity={1} />
            <Stop offset="70%" stopColor={c3} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {specs.map((lamp: LampSpec, index: number) => (
          <Circle
            key={index}
            cx={lamp.x * width}
            cy={lamp.y}
            r={lamp.r}
            // The alpha rides on the CIRCLE and not on the gradient stops, so
            // one pair of gradients serves every lamp in the app.
            opacity={lamp.a}
            fill={
              lamp.hue === 'dim'
                ? 'url(#lampDim)'
                : lamp.hue === 'third'
                  ? 'url(#lampThird)'
                  : 'url(#lampBright)'
            }
          />
        ))}
      </Svg>
    ),
    [c1, c2, c3, height, specs, width],
  );

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
      }}
    >
      {art}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The specular edge                                                   */
/* ------------------------------------------------------------------ */

/**
 * The 1px lit line along a pane's top edge — React Native's stand-in for
 * `inset 0 1px 0 rgba(236,241,238,.1)`, which it has no way to draw.
 *
 * It is what makes a pane look like GLASS rather than like a tinted rectangle:
 * a real pane catches the light along the edge nearest it, and one flat tint
 * with a uniform border does not. Pinned inside the container, so the container
 * must be the thing carrying `overflow: hidden`.
 */
export function SpecularEdge({
  color,
  radius = RADIUS.card,
  height = 1,
}: {
  color: string;
  /** The container's own corner, so the line stops where the corner starts. */
  radius?: number;
  /** 2 for the floating action, which is the one heavier edge in the app. */
  height?: number;
}) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height,
        backgroundColor: color,
        borderTopLeftRadius: radius,
        borderTopRightRadius: radius,
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Layer 2 — content glass                                             */
/* ------------------------------------------------------------------ */

export type GlassTierName = 'well' | 'card' | 'lit' | 'bar';

export interface GlassSurfaceProps {
  tier?: GlassTierName;
  /** The pane's corner. Pass a number from `radius` in `theme/tokens.ts`. */
  radius?: number;
  /** `e1` cards and rows, `e2` heroes and floating things, `e3` the rest clock. */
  shadow?: 'none' | 'e1' | 'e2' | 'e3';
  /** A halo step, or a custom `boxShadow` array. `hero` is the soft card bloom. */
  glow?: 'none' | 'repeating' | 'single' | 'floating' | 'hero';
  /**
   * Draw the tint and the border WITHOUT the blur behind them.
   *
   * The blur budget is three per screen — the two bars and the one hero — and
   * the tasks list alone can ask for ten. A flat pane at the same tint is a far
   * smaller difference than a list that drops frames, and the light a blur would
   * carry is not doing any work behind a surface that is already 94% opaque.
   */
  flat?: boolean;
  /** A dashed edge — an empty slot, or a destructive action out of reach. */
  dashed?: boolean;
  /** Overrides the tier's tint. For the three states a task card has. */
  tint?: string;
  /** Overrides the tier's border. */
  borderColor?: string;
  style?: StyleProp<ViewStyle>;
  className?: string;
  children?: ReactNode;
}

/**
 * One pane of glass: blur, tint, border, specular edge, shadow.
 *
 * The nesting is not decorative. `overflow: hidden` on a `BlurView` clips its
 * children unreliably on Android, so the OUTER view owns the radius and the
 * clipping and the blur is a child filling it — the order the design's
 * translation table calls for, and the one that leaves no unblurred hairline
 * along the corner.
 *
 * The shadow cannot be on that clipping view either, because a shadow is drawn
 * outside the box and `overflow: hidden` would cut it off. So it is on a
 * WRAPPER, and the wrapper is the node a caller's margin lands on.
 */
export function GlassSurface({
  tier = 'card',
  radius = RADIUS.card,
  shadow = 'none',
  glow = 'none',
  flat = false,
  dashed = false,
  tint,
  borderColor,
  style,
  className,
  children,
}: GlassSurfaceProps) {
  const spec: GlassTier = glassTier[tier];
  const boxShadow = [
    ...(glow === 'none' ? [] : halo[glow]),
    ...(shadow === 'none' ? [] : elevation[shadow]),
  ];

  return (
    <View
      // The radius is on the WRAPPER as well, and it is not redundant: a
      // `boxShadow` is cast from the view's own border box, so a square wrapper
      // around a rounded pane throws a square shadow with four visible corners.
      style={[boxShadow.length > 0 ? { boxShadow, borderRadius: radius } : null, style]}
      className={className}
    >
      <View
        style={{
          borderRadius: radius,
          overflow: 'hidden',
          borderWidth: 1,
          borderStyle: dashed ? 'dashed' : 'solid',
          borderColor: borderColor ?? spec.border,
          // Only a FLAT pane paints its tint here. A blurred one paints it over
          // the `BlurView` instead — `BlurView` composites what is behind the
          // whole node, so a tint underneath it would be blurred into the glass
          // and then painted again, darkening the pane by twice what it asked
          // for.
          backgroundColor: flat ? (tint ?? spec.tint) : undefined,
        }}
      >
        {flat ? null : <Pane intensity={spec.blur} />}
        {/* The tint again, ON TOP of the blur. `BlurView` composites the page
            beneath it and would otherwise wash the tint out entirely — the
            background colour above is what a `flat` pane uses, this is what a
            blurred one does. */}
        {flat ? null : (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: tint ?? spec.tint,
            }}
          />
        )}
        {spec.specular && !dashed ? <SpecularEdge color={spec.specular} radius={radius} /> : null}
        {children}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Layer 4 — the bars                                                  */
/* ------------------------------------------------------------------ */

/**
 * A bar: the same pane as `GlassSurface` at the `bar` tier, positioned over the
 * content rather than in the flow with it.
 *
 * THE POINT OF IT IS WHAT YOU CAN SEE THROUGH IT. A docked bar and a floating
 * one look identical in a screenshot of a screen at rest; the difference only
 * appears in the half-second a list is moving, when rows pass under the glass
 * and the bar stops being a strip of chrome and becomes a layer. That is why
 * every section's scroll pays `barInset` in padding instead of the bars
 * claiming the space.
 */
export function GlassBar({
  radius = 0,
  style,
  children,
}: {
  radius?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const spec = glassTier.bar;
  return (
    <View
      style={[
        {
          borderRadius: radius,
          overflow: 'hidden',
          backgroundColor: spec.tint,
          // A detached pill is bordered all round; a full-width bar has only
          // one edge that separates it from anything, so it draws only that one.
          borderWidth: radius > 0 ? 1 : 0,
          borderColor: spec.border,
          borderBottomWidth: 1,
          borderBottomColor: spec.border,
        },
        style,
      ]}
    >
      <Pane intensity={spec.blur} />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: spec.tint,
        }}
      />
      {spec.specular ? <SpecularEdge color={spec.specular} radius={radius} /> : null}
      {children}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Layer 3 — the floating action                                       */
/* ------------------------------------------------------------------ */

/**
 * THE ONE COMMIT ACTION PER SECTION, in the same place in all four.
 *
 * `right: 16, bottom: 92`, 60 tall, radius 9999 — and the coordinates are the
 * substance, not the styling. Every Save, Finish, Add and Open in this app used
 * to live in the top-right corner of a header, which on an 800 dp phone is
 * about 620 dp of diagonal travel from a right thumb. The corner holds
 * DESTINATIONS now (history, routines, the library, the language switch) and
 * nothing that writes anything down.
 *
 * `ghost` is the one non-filled instance — Settings' `Back up now`. A section
 * whose action is a maintenance task should not shout in the same voice as one
 * whose action is the thing you opened the app to do.
 *
 * `asleep` is the keypad's Save before a digit exists: present, in position, at
 * 55%, so the button does not APPEAR when the first digit lands — it wakes. A
 * control that materialises under a thumb already on its way is a control that
 * gets pressed by accident.
 *
 * `round` is the Momentum section action: a 64 dp circle with the glyph and no
 * words, filled with the theme's gradient. The four section roots each have ONE
 * obvious thing to do — ▶ in Workout, + in Tasks and Finance — and in the same
 * place in all four it is learned by position after a day; the label stays as
 * the accessibility label. Pushed screens keep the worded pill, because `Save`
 * and `Test & connect` are not things a glyph says unambiguously.
 *
 * `hidden` slides it 180 dp down, off the screen's edge, over 320 ms (U27): a
 * section passes its scroll's `fabHidden` (`hooks/useBubbleOnScroll`,
 * `lib/fabScroll`) so the circle stops covering the right-hand column of the
 * rows being read. Slid, not faded or unmounted: it leaves the way it would be
 * pushed, comes back from the same place, and the arrival motion is not re-run.
 * At reduced motion it simply goes and comes back.
 */
export function FloatingAction({
  label,
  icon,
  variant = 'filled',
  asleep = false,
  bottom = floatingSlot.bottom,
  round = false,
  symbol,
  onPress,
  accessibilityHint,
  hidden = false,
}: {
  label: string;
  icon?: IconName;
  variant?: 'filled' | 'ghost';
  asleep?: boolean;
  /** Icon-only 64 dp circle. See the header. */
  round?: boolean;
  /** A Material Symbol in place of `icon`, for the round ghost action. */
  symbol?: SymbolName;
  /** Raised off the slot for a screen with no nav pill under it. */
  bottom?: number;
  onPress: () => void;
  accessibilityHint?: string;
  /** Stepped aside for a scroll down. See the header. */
  hidden?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const filled = variant === 'filled' && !asleep;
  const motionScale = useMotionScale();
  const arrived = useArrived();
  /*
   * THE MOTION PASS, three parts and none of them in the way:
   *   • it ARRIVES — fade and a 10 dp rise, 200 ms after its section, so the
   *     section is on screen before the thing you press in it;
   *   • it SINKS to 0.94 under the thumb and settles back on the overshoot curve;
   *   • `asleep` → awake is a 300 ms fade to full, not a switch, so the keypad's
   *     Save wakes on the first digit rather than appearing.
   */
  const arrive = useRef(new Animated.Value(motionScale === 0 ? 1 : 0)).current;
  const wake = useRef(new Animated.Value(asleep ? 0.55 : 1)).current;
  const press = usePressScale(0.94);
  useEffect(() => {
    if (!arrived) return;
    Animated.timing(arrive, {
      toValue: 1,
      duration: (round ? 560 : 420) * motionScale,
      delay: (round ? 280 : 200) * motionScale,
      easing: curve(round ? motion.pop : motion.ease),
      useNativeDriver: true,
    }).start();
    // Arrival only: the section's, not the label's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrive, arrived]);
  useEffect(() => {
    Animated.timing(wake, {
      toValue: asleep ? 0.55 : 1,
      duration: 300 * motionScale,
      easing: curve(motion.ease),
      useNativeDriver: true,
    }).start();
  }, [asleep, motionScale, wake]);
  const aside = useRef(new Animated.Value(hidden ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(aside, {
      toValue: hidden ? 1 : 0,
      duration: FAB_HIDE_MS * motionScale,
      easing: curve(motion.ease),
      useNativeDriver: true,
    }).start();
  }, [aside, hidden, motionScale]);
  const asideY = useMemo(
    () => aside.interpolate({ inputRange: [0, 1], outputRange: [0, FAB_HIDE_DISTANCE] }),
    [aside],
  );
  const opacity = useMemo(() => Animated.multiply(arrive, wake), [arrive, wake]);
  const translateY = useMemo(
    () => arrive.interpolate({ inputRange: [0, 1], outputRange: [round ? 18 : 10, 0] }),
    [arrive, round],
  );
  const popScale = useMemo(
    () => arrive.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }),
    [arrive],
  );

  return (
    <Animated.View
      // Off the screen is out of reach for a finger; make it so for a screen
      // reader too, rather than leaving it announcing a button nobody can see.
      pointerEvents={hidden ? 'none' : 'auto'}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      accessibilityElementsHidden={hidden}
      style={{
        position: 'absolute',
        right: floatingSlot.right,
        // The slot's 92 is measured from whatever the system leaves free, not
        // from the bottom edge of the glass: on a phone with a gesture strip the
        // pill would otherwise land on the nav pill it is supposed to clear.
        bottom: bottom + insets.bottom,
        borderRadius: RADIUS.pill,
        // A routine called `Pull (Tension on Back)` is 21 characters, and
        // `Open Pull (Tension on Back)` at 16/600 is wider than a 360 dp phone.
        // The pill floats OVER the list, so it must not be allowed to span it:
        // past three quarters of the width it stops reading as a layer and
        // starts reading as a bar that has come loose. The label RUNS inside
        // that cap instead of being cut — see `RunningText`.
        maxWidth: '76%',
        opacity,
        transform: [
          { translateY },
          { translateY: asideY },
          ...(round ? [{ scale: popScale }] : []),
          ...press.style.transform,
        ],
      }}
    >
      <BubblePressable
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        radius="pill"
        // A green ring on a green fill is invisible; ink is the only colour that
        // can be seen leaving this surface.
        bubbleColor={filled ? palette.ink : palette.greenBright}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        style={{
          height: floatingSlot.height,
          ...(round ? { width: floatingSlot.height, justifyContent: 'center' } : {}),
          borderRadius: RADIUS.pill,
          overflow: 'hidden',
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: round ? 0 : floatingSlot.paddingH,
        }}
      >
        {filled ? (
          <LinearGradient
            {...gradientFill()}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
        ) : (
          <>
            <Pane intensity={26} />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(236,241,238,0.07)',
                borderRadius: RADIUS.pill,
                borderWidth: 1,
                borderColor: 'rgba(236,241,238,0.10)',
              }}
            />
          </>
        )}
        {/* The one heavier specular in the app. At 2px it reads as a bevel
            rather than as an edge, which is what separates the thing you press
            from the panes it sits over. */}
        <SpecularEdge
          color={filled ? specularHeavy : 'rgba(236,241,238,0.14)'}
          radius={RADIUS.pill}
          height={filled ? 2 : 1}
        />
        {round ? (
          symbol ? (
            <MaterialSymbol
              name={symbol}
              size={28}
              color={filled ? palette.onAcc : INK_SOFT}
              filled={filled}
            />
          ) : icon === 'play' ? (
            /* The repo's ▶, filled and nudged 3 dp right so it sits on the
               circle's optical centre rather than its geometric one. */
            <View style={{ marginLeft: 3 }}>
              <Svg width={26} height={26} viewBox="0 0 24 24">
                <Path
                  d="M8 5.5l11 6.5-11 6.5z"
                  fill={filled ? palette.onAcc : INK_SOFT}
                  stroke={filled ? palette.onAcc : INK_SOFT}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                />
              </Svg>
            </View>
          ) : icon ? (
            <Icon name={icon} size={28} color={filled ? palette.onAcc : INK_SOFT} />
          ) : null
        ) : (
          <>
            {icon ? (
              <View style={{ marginRight: 9 }}>
                <Icon name={icon} size={17} color={filled ? palette.onAcc : palette.inkMuted} />
              </View>
            ) : null}
            <RunningText
              text={label}
              maxFontSizeMultiplier={1.3}
              style={{ color: filled ? palette.onAcc : palette.inkMuted }}
              className="text-body font-semibold"
              // The fill's END colour: the fade has to match what is behind the
              // label's right edge, and that is the bottom of the gradient's run.
              fadeColor={filled ? FADE_ON.gradient : '#161817'}
            />
          </>
        )}
      </BubblePressable>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* The toast                                                           */
/* ------------------------------------------------------------------ */

/**
 * What a commit says on its way out: a ✓, four words, and gone.
 *
 * It sits just above the floating slot's band rather than at the top of the
 * screen, because that is where the thumb that just committed something is
 * already looking — and ABOVE the slot rather than over it, since a toast can
 * now carry a control and must not sit on top of another one.
 *
 * ── THE ACTION ────────────────────────────────────────────────────────────
 *
 * `Removed Barbell row · Undo`. A removal that asks first is ceremony charged to
 * every removal; one that can be taken back for four and a half seconds costs
 * nothing when it was meant and one tap when it was not. So a toast can carry ONE
 * action, after a hairline, in green-bright — and while it has one, the toast
 * takes touches for that action only. Without one it is `pointerEvents="none"`
 * throughout, as it always was: pressing the button underneath it twice in a row
 * still works.
 *
 * The caller owns the timeout — 4.5 s with an action, the usual couple of seconds
 * without. A toast that dismissed itself would need to own state that outlives
 * the screen that raised it, and every caller here already has a `useEffect`
 * clearing the message it set. The label RUNS rather than wrapping, so a long
 * exercise name cannot turn the pill into a paragraph.
 */
export interface ToastAction {
  label: string;
  onPress: () => void;
}

/**
 * Where a toast sits over a section: the v3 spec's bottom 190 — the floating
 * slot's top (102 + 64) and 24 of air, so it clears the round action and its
 * glow. The session screen, whose pair sits at 28, passes its own.
 */
const TOAST_BOTTOM = floatingSlot.bottom + floatingSlot.height + 24;

export function Toast({
  label,
  action,
  bottom = TOAST_BOTTOM,
}: {
  label: string;
  action?: ToastAction;
  bottom?: number;
}) {
  const insets = useSafeAreaInsets();
  const motionScale = useMotionScale();
  const enter = useRef(new Animated.Value(motionScale === 0 ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 240 * motionScale,
      easing: curve(motion.ease),
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enter]);
  const translateY = useMemo(
    () => enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }),
    [enter],
  );

  return (
    <Animated.View
      pointerEvents={action ? 'box-none' : 'none'}
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: bottom + insets.bottom,
        alignItems: 'center',
        opacity: enter,
        transform: [{ translateY }],
      }}
    >
      <View
        pointerEvents={action ? 'box-none' : 'none'}
        style={{
          // v3: a 46 tall glass pill, bordered and lit at c2 30 %.
          height: 46,
          maxWidth: '100%',
          borderRadius: RADIUS.pill,
          overflow: 'hidden',
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 18,
          backgroundColor: 'rgba(14,18,17,0.9)',
          borderWidth: 1,
          borderColor: tint(0.3),
        }}
      >
        <Pane intensity={26} />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(14,18,17,0.9)',
          }}
        />
        <SpecularEdge color="rgba(236,241,238,0.12)" radius={RADIUS.pill} />
        <Icon name="check" size={16} color={palette.acc} />
        <RunningText
          text={label}
          fadeColor={FADE_ON.bar}
          containerStyle={{ marginLeft: 8 }}
          className="text-label font-medium text-ink"
        />
        {action ? (
          <Pressable
            onPress={action.onPress}
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            style={{
              marginLeft: 6,
              paddingLeft: 12,
              height: 46,
              justifyContent: 'center',
              borderLeftWidth: 1,
              borderLeftColor: palette.hairline,
            }}
          >
            <Text className="text-label font-semibold text-acc">{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

/**
 * A filled ✓ mark — the gradient, the edge and the specular, at whatever size.
 *
 * Three places draw one and they must be the same object: a done task's mark, a
 * logged set's check, and focus mode's DONE. It was three hand-rolled circles
 * with three slightly different greens before this.
 */
export function CommitMark({
  size,
  glyph,
  children,
  icon = 'check',
}: {
  size: number;
  /** The ✓'s own size. Roughly half the circle. */
  glyph: number;
  /** A label under the ✓, for the 176 dp one. */
  children?: ReactNode;
  /** The mark's glyph: the ✓, or ⊘ for a habit to avoid (T7). */
  icon?: 'check' | 'ban';
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: RADIUS.pill,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: tint(0.5),
      }}
    >
      <LinearGradient
        {...gradientFill()}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <SpecularEdge color={specularHeavy} radius={RADIUS.pill} height={size > 60 ? 2 : 1} />
      <Icon name={icon} size={glyph} color={palette.onAcc} />
      {children}
    </View>
  );
}

/* ------------------------------------------------------------------ */

/**
 * What a section root's scroll has to pay so the two translucent bars never
 * cover a row.
 *
 * `barInset` in `theme/tokens.ts` is the bars' OWN heights — 64 for the top bar
 * without its status-bar padding, 178 for the nav pill plus the floating slot's
 * clearance. Neither of those knows about the phone, and the status bar is 24 on
 * one device and 48 on another with a cutout. So the tokens stay device-free and
 * this is the one place the two are added together.
 *
 * Every section root uses it. A screen that hard-codes `paddingTop: 64` is a
 * screen whose first row is under the glass on half the phones in the world.
 */
export function useBarInsets(): { top: number; bottom: number } {
  const insets = useSafeAreaInsets();
  return { top: insets.top + barInset.top, bottom: insets.bottom + barInset.bottom };
}
