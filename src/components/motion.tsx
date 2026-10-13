/**
 * Motion — the app's shared entrance and press feedback, so five screens don't
 * each invent their own timing.
 *
 *   PanelEnter    a tab root arriving — fade + rise 10dp, 300ms. Keyed by the
 *                 caller (`AppShell` keys it on the active tab), so switching
 *                 tabs remounts it and the entrance replays.
 *   Reveal        a disclosure opening — fade + rise 6dp, 220ms. For content
 *                 that was not there a moment ago: an expanded library group, a
 *                 workout's detail, a set's history.
 *   pressedStyle  a `Pressable`'s `style` prop — dim plus a hair of scale on
 *                 contact, the same feedback `FocusRest`'s rest controls already
 *                 give, now everywhere a row or button in the app is tappable.
 *
 * The curve is `FocusMode.tsx`'s `EASING` — the app already shipped one bezier
 * for "something arriving", and a second one here would be a second thing to
 * keep in sync for no reason anybody could see on screen.
 *
 * Both entrances animate once, on mount, and never again: they read `Animated
 * .Value` off a ref rather than state, so a parent re-render (a set logged
 * elsewhere, a clock ticking) cannot replay them. An entrance that replays on
 * every unrelated render is a flicker, not an arrival.
 *
 * ── THE MOTION PASS ADDED SIX MORE, AND ONE RULE FOR ALL OF THEM ──────────
 *
 *   Pop           scale 0 → 1 on the overshoot curve: a ✓, the Done pill, an
 *                 edit-mode `−`. Something CAUGHT.
 *   Stagger       Reveal with a delay, for lists that arrive one after another.
 *   Flash         a logged set's green wash, 0.30 → 0.
 *   Ripple        focus mode's DONE ring leaving the button.
 *   SecondPulse   the final ten seconds, once per second.
 *   GrowIn        a row arriving by opening its own height, or leaving by
 *                 closing it — `Add set`, `Warm-up`, Undo, and the `−`.
 *   usePressScale the sink under a finger, released past full size and back.
 *   Sheen         a band of light sweeping across a pill or a button.
 *
 * Every duration comes from `motion` in `theme/tokens.ts` and is multiplied by
 * `useMotionScale()`, so with "Remove animations" on each of these renders its
 * END STATE on the first frame. None of them owns a fact: the store is written
 * first and the animation follows it, so a slow frame can never delay a commit.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';

import { useArrived } from '../hooks/useArrived';
import { growInDeadline } from '../lib/growIn';
import { useMotionScale } from '../hooks/useMotionScale';
import { curve, motion, palette, tint } from '../theme/tokens';

/** Matches `FocusMode.tsx`'s `EASING`. */
const EASING = curve(motion.ease);
const POP = curve(motion.pop);

function useEnter(duration: number, riseFrom: number, delay = 0) {
  const scale = useMotionScale();
  const arrived = useArrived();
  const enter = useRef(new Animated.Value(scale === 0 ? 1 : 0)).current;
  useEffect(() => {
    if (!arrived) return;
    Animated.timing(enter, {
      toValue: 1,
      duration: duration * scale,
      delay: delay * scale,
      easing: EASING,
      useNativeDriver: true,
    }).start();
    // Mount only — see the file header on why an entrance never replays — or,
    // in a section built ahead (`hooks/useArrived.ts`), arrival only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enter, arrived]);

  /* Memoized, like every interpolation below: a fresh `interpolate()` is a fresh
     native node, and the Animated props built on it detach and re-attach on every
     render of a host that re-renders four times a second while a rest runs. */
  return useMemo(
    () => ({
      opacity: enter,
      transform: [
        { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [riseFrom, 0] }) },
      ],
    }),
    [enter, riseFrom],
  );
}

export function Reveal({ children }: { children: ReactNode }) {
  const enterStyle = useEnter(220, -6);
  return <Animated.View style={enterStyle}>{children}</Animated.View>;
}

/**
 * Function form, not a plain object, because `Pressable` only exposes `pressed`
 * through its `style` callback.
 */
export function pressedStyle({ pressed }: { pressed: boolean }): ViewStyle | undefined {
  return pressed ? { opacity: 0.62, transform: [{ scale: 0.994 }] } : undefined;
}

/* ------------------------------------------------------------------ */
/* The motion pass                                                     */
/* ------------------------------------------------------------------ */

/**
 * Scale 0 → 1 on the overshoot curve, on mount. The overshoot is the point: at
 * `pop` a mark swells past its size by about a fifth and settles, which is what
 * reads as "caught" rather than "appeared".
 */
export function Pop({
  children,
  duration = 320,
  style,
}: {
  children: ReactNode;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const scale = useMotionScale();
  const v = useRef(new Animated.Value(scale === 0 ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: duration * scale,
      easing: POP,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  return <Animated.View style={[style, { transform: [{ scale: v }] }]}>{children}</Animated.View>;
}

/**
 * Fade and rise after a delay — `Reveal`, for a list. Routine rows stagger by 70,
 * category tiles by 40: the list arrives in reading order instead of as a slab.
 */
export function Stagger({
  children,
  delay = 0,
  rise = 10,
  duration = 380,
  style,
}: {
  children: ReactNode;
  delay?: number;
  rise?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const enterStyle = useEnter(duration, rise, delay);
  return <Animated.View style={[style, enterStyle]}>{children}</Animated.View>;
}

/**
 * A logged set's flash: a green wash over the row, 0.30 → 0 over `motion.flash`.
 * Mounted with a fresh key per ✓ so every log replays it. It takes no touches.
 */
export function Flash({ radius = 0 }: { radius?: number }) {
  const scale = useMotionScale();
  const v = useRef(new Animated.Value(scale === 0 ? 0 : 1)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 0,
      duration: motion.flash * scale,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: radius,
        backgroundColor: tint(0.3),
        opacity: v,
      }}
    />
  );
}

/**
 * Focus mode's DONE ripple: a 3 dp ring that grows 1 → 1.9 while it fades
 * 0.7 → 0. Mount it with a fresh key per press. Nothing at all with reduced
 * motion — a ring frozen at its end state is an invisible ring anyway.
 */
export function Ripple({ size }: { size: number }) {
  const scale = useMotionScale();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (scale === 0) return;
    Animated.timing(v, {
      toValue: 1,
      duration: motion.ripple * scale,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [scale, v]);
  const ring = useMemo(
    () => ({
      opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
      transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }],
    }),
    [v],
  );
  if (scale === 0) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 3,
          borderColor: palette.greenBright,
        },
        ring,
      ]}
    />
  );
}

/**
 * The final ten seconds: scale 1 → 1.03 → 1 once per second while `active`.
 *
 * Out to 1.03 in the first quarter of the beat and back over the rest, ease-out —
 * a tick, not a throb. It is the change you notice without reading anything,
 * which is the job the inversion already does in colour.
 */
export function SecondPulse({
  active,
  children,
  style,
}: {
  active: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const scale = useMotionScale();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active || scale === 0) {
      v.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, {
          toValue: 1,
          duration: motion.pulseMs * 0.25,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 0,
          duration: motion.pulseMs * 0.75,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, scale, v]);
  const pulse = useMemo(
    () => ({
      transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }) }],
    }),
    [v],
  );
  return <Animated.View style={[style, pulse]}>{children}</Animated.View>;
}

/**
 * A row that arrives by opening its own height, and leaves by closing it.
 *
 *   in    height 0 → natural, opacity 0 → 1, translateY −6 → 0      `motion.enter`
 *   out   height → 0,         opacity → 0,   translateX 0 → 28      280 ms
 *
 * ── WHY TWO NODES ─────────────────────────────────────────────────────────
 *
 * Height is layout, so it can only animate on the JS thread; opacity and the
 * slide can run natively. One `Animated.View` cannot mix the two drivers, so the
 * outer node owns the height and the clip and the inner one owns the rest.
 *
 * The natural height is read off the inner node's own layout — a child of a
 * clipped parent is still laid out at its content height, because nothing here
 * flexes — and once the entrance is over the outer height is released back to
 * `auto`, so a plate line appearing under a weight later does not get cut off by
 * a number measured before it existed.
 *
 * `leaving` is how a caller removes one: set it, and delete the row from the
 * store in `onLeft`. The row is gone from the screen before it is gone from the
 * data, which is the order the design asks for; with reduced motion `onLeft`
 * fires on the next frame.
 */
export function GrowIn({
  children,
  appear = true,
  leaving = false,
  onLeft,
  duration = motion.enter,
}: {
  children: ReactNode;
  /** False for a row that was already there — it renders at rest. */
  appear?: boolean;
  leaving?: boolean;
  onLeft?: () => void;
  duration?: number;
}) {
  const scale = useMotionScale();
  /* Latched at mount: a caller that stops calling a row "new" on its next render
     must not strand it half-open. */
  const animateIn = useRef(appear && scale > 0).current;
  const [natural, setNatural] = useState<number | null>(null);
  const [settled, setSettled] = useState(!animateIn);
  const height = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(animateIn ? 0 : 1)).current;
  const slide = useRef(new Animated.Value(0)).current;
  const onLeftRef = useRef(onLeft);
  onLeftRef.current = onLeft;
  const rise = useMemo(
    () => fade.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }),
    [fade],
  );
  const drift = useMemo(
    () => slide.interpolate({ inputRange: [0, 1], outputRange: [0, 28] }),
    [slide],
  );

  /* In: once the content has a height to open to. */
  useEffect(() => {
    if (!animateIn || natural == null || settled) return;
    height.setValue(0);
    Animated.parallel([
      Animated.timing(height, {
        toValue: natural,
        duration: duration * scale,
        easing: EASING,
        useNativeDriver: false,
      }),
    ]).start(({ finished }) => {
      if (finished) setSettled(true);
    });
    Animated.timing(fade, {
      toValue: 1,
      duration: duration * scale,
      easing: EASING,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [natural]);

  /*
   * The deadline (`lib/growIn.ts`): past it the row is open, whatever became of
   * the layout event or the animation. A row the store holds is never left
   * drawn at zero height.
   */
  const leavingRef = useRef(leaving);
  leavingRef.current = leaving;
  useEffect(() => {
    if (!animateIn) return undefined;
    const timer = setTimeout(
      () => {
        if (leavingRef.current) return;
        fade.stopAnimation();
        fade.setValue(1);
        setSettled(true);
      },
      growInDeadline(duration, scale),
    );
    return () => clearTimeout(timer);
    // Mount only: the deadline is counted from the row's arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Out: close from wherever it stands, then tell the caller. */
  useEffect(() => {
    if (!leaving) return;
    if (scale === 0) {
      const frame = requestAnimationFrame(() => onLeftRef.current?.());
      return () => cancelAnimationFrame(frame);
    }
    height.setValue(natural ?? 0);
    setSettled(false);
    const out = 280 * scale;
    Animated.timing(height, {
      toValue: 0,
      duration: out,
      easing: EASING,
      useNativeDriver: false,
    }).start();
    Animated.parallel([
      Animated.timing(fade, { toValue: 0, duration: out, easing: EASING, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 1, duration: out, easing: EASING, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) onLeftRef.current?.();
    });
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);

  const onLayout = useCallback(
    (e: { nativeEvent: { layout: { height: number } } }) => {
      const h = e.nativeEvent.layout.height;
      if (h > 0 && h !== natural) setNatural(h);
    },
    [natural],
  );

  return (
    <Animated.View
      style={settled && !leaving ? undefined : { height, overflow: 'hidden' }}
      pointerEvents={leaving ? 'none' : 'auto'}
    >
      <Animated.View
        style={{
          opacity: fade,
          transform: [{ translateY: leaving ? 0 : rise }, { translateX: drift }],
        }}
      >
        <View onLayout={onLayout}>{children}</View>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * The sink under a finger, and the release that overshoots.
 *
 * Returns the handlers to put on the `Pressable` and the style to put on an
 * `Animated.View` inside it. Down: to `to` in 130 ms on the base curve. Up: the
 * v3 spec's `.94 → 1.035 → 1` over 460 ms — PAST full size and back, the same
 * acknowledgement a ✓ gives.
 *
 * ── WHY TWO LEGS AND NOT ONE OVERSHOOTING CURVE ───────────────────────────
 *
 * `bezier(.34,1.56,.64,1)` over the 0.06 of travel a press has overshoots by a
 * few thousandths — a 1.004 nobody can see. The spec's 1.035 is more than half
 * the depth of the sink again, so the release is drawn as what it is: a rise to
 * the overshoot (45 %, ease-out) and a settle back (55 %, ease-in-out). The
 * overshoot scales with the depth, capped at the spec's 0.035, so a 0.85 sink
 * does not bounce to 1.09.
 *
 * `rotate` is the ✎'s own flourish: a −12° tilt with the sink, as if the pencil
 * were being picked up.
 */
const PRESS_IN_MS = 130;
const RELEASE_MS = 460;
const RELEASE_RISE = Easing.out(Easing.quad);
const RELEASE_SETTLE = Easing.inOut(Easing.quad);

export function usePressScale(to = 0.94, rotate = 0) {
  const scale = useMotionScale();
  /** 1 = sunk, 0 = rest, −1 = the overshoot past rest. */
  const v = useRef(new Animated.Value(0)).current;
  const onPressIn = useCallback(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: PRESS_IN_MS * scale,
      easing: EASING,
      useNativeDriver: true,
    }).start();
  }, [scale, v]);
  const onPressOut = useCallback(() => {
    Animated.sequence([
      Animated.timing(v, {
        toValue: -1,
        duration: RELEASE_MS * 0.45 * scale,
        easing: RELEASE_RISE,
        useNativeDriver: true,
      }),
      Animated.timing(v, {
        toValue: 0,
        duration: RELEASE_MS * 0.55 * scale,
        easing: RELEASE_SETTLE,
        useNativeDriver: true,
      }),
    ]).start();
  }, [scale, v]);
  const style = useMemo(() => {
    const over = Math.min(0.035, (1 - to) * 0.58);
    const sink = {
      scale: v.interpolate({ inputRange: [-1, 0, 1], outputRange: [1 + over, 1, to] }),
    };
    if (rotate === 0) return { transform: [sink] };
    const tilt = {
      rotate: v.interpolate({
        inputRange: [-1, 0, 1],
        outputRange: ['0deg', '0deg', `${rotate}deg`],
      }),
    };
    return { transform: [sink, tilt] };
  }, [rotate, to, v]);
  return { onPressIn, onPressOut, style };
}
