/**
 * Sheet — the floating glass pane everything that is not a whole screen arrives on.
 *
 *   ╭────────────────────────────────────────────╮
 *   │                  ▁▁▁▁                      │  ← the grab handle: drag it down
 *   │ Time interval                              │
 *   │ …                                          │
 *   ╰────────────────────────────────────────────╯   8 dp off every edge
 *
 * `ConfirmSheet` and `NumberSheet` are the same pane with a fixed body; they are
 * built on `SheetFrame` below so the chrome, the curves and the three ways out
 * are one implementation rather than three copies that drift. `Sheet` is the
 * frame plus a title and a capped scroll, for a list or a small form.
 *
 * ── THE PANE FLOATS, IT DOES NOT DOCK ─────────────────────────────────────
 *
 * v3 lifts the sheet 8 dp off the left, right and bottom edges with a 34 corner
 * all round. A docked sheet reads as the bottom of the screen growing; a floating
 * one reads as an object that arrived and can leave — which is exactly what the
 * handle then lets you do to it.
 *
 * ── EVERY WAY OUT ANIMATES, THEN ANSWERS ──────────────────────────────────
 *
 * Scrim tap, hardware back, the handle dragged past 110 dp, and a child's own
 * `Cancel` (through `useSheetDismiss`) all run the same 340 ms fall before the
 * caller's `onDismiss`. The caller unmounts on `onDismiss`, so calling it first
 * would cut the exit off at frame one. A SAVE is deliberately not routed through
 * this: the write happens on the press, and the caller closes the sheet itself.
 *
 * TAPPING THE SCRIM DISMISSES, and the caller's `onDismiss` is always the
 * NON-committal answer — nothing here is destructive, so the cheap gesture can
 * safely be the one that closes it.
 *
 * ── UNLESS THE SHEET HOLDS A DRAFT ───────────────────────────────────────
 *
 * The one exception is a sheet that is a form someone has typed into (the task
 * editor): there the non-committal answer LOSES the draft, and a stray tap on
 * the dimmed edge is the cheapest gesture there is. So a sheet may pass
 * `guard`, asked before every one of the four ways out. It answers `true` to let
 * the exit run, or `false` to hold the sheet where it is — a dragged handle
 * springs back — and raise its own question; the `proceed` it was handed runs
 * the exit anyway once that question is answered "Discard". A guard rather than
 * a `dirty` flag, so the frame knows nothing about what the question is.
 * Without one, every other sheet closes exactly as it always did.
 *
 * Two `BlurView`s while up (the scrim's 10 and the pane's 34). The nav pill hides
 * under an overlay, so a screen with a sheet still stays inside the budget of 3.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Pane } from './glass';
import { PrimaryButton, TextButton } from './primitives';
import { useIsOverlay } from './overlay';
import { useT } from '../hooks/useT';
import { curve } from '../theme/tokens';

/** The design's curves, spelled once. */
const IN = { duration: 600, bezier: [0.32, 1.28, 0.5, 1] as const };
const OUT = { duration: 340, bezier: [0.4, 0, 0.8, 0.4] as const };
const SPRING_BACK = { duration: 460, bezier: [0.34, 1.3, 0.64, 1] as const };
const SCRIM_IN_MS = 360;
/** Past this, a released drag is a dismissal rather than a nudge. */
const DISMISS_DRAG = 110;

const SCRIM = 'rgba(6,8,7,0.55)';
const PANE = 'rgba(20,26,24,0.86)';
const EDGE = 'rgba(236,241,238,0.09)';
const SPECULAR = 'rgba(236,241,238,0.16)';
const HANDLE = 'rgba(236,241,238,0.22)';
export const SHEET_RADIUS = 34;

/**
 * Asked before a sheet closes: `true` lets it go now; `false` holds it, and
 * `proceed` closes it (animated, unasked) once the sheet's own question is
 * answered.
 */
export type SheetGuard = (proceed: () => void) => boolean;

/**
 * The animated way out, for a control INSIDE a sheet — its `Cancel`. Outside a
 * sheet it is null, so a caller can fall back to its own prop.
 */
const DismissContext = createContext<(() => void) | null>(null);
export function useSheetDismiss(): (() => void) | null {
  return useContext(DismissContext);
}

/**
 * The chrome alone: scrim, pane, handle, the entrance and every exit. No title,
 * no scroll — the body is the caller's.
 */
export function SheetFrame({
  onDismiss,
  dismissLabel,
  guard,
  children,
}: {
  onDismiss: () => void;
  /** The scrim's accessibility label — the non-committal answer's own name. */
  dismissLabel?: string;
  /** See the header: `false` holds the sheet; `proceed` closes it later. */
  guard?: SheetGuard;
  children: ReactNode;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  /** 0 = off-screen below, 1 = resting. */
  const enter = useRef(new Animated.Value(0)).current;
  const scrim = useRef(new Animated.Value(0)).current;
  /** The finger's contribution, added on top of `enter`. */
  const drag = useRef(new Animated.Value(0)).current;
  /** The pane's own height, for the design's `translateY(110%)`. */
  const [height, setHeight] = useState(0);
  const started = useRef(false);
  const closing = useRef(false);

  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const guardRef = useRef(guard);
  guardRef.current = guard;

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    const easing = curve(OUT.bezier);
    Animated.parallel([
      Animated.timing(enter, {
        toValue: 0,
        duration: OUT.duration,
        easing,
        useNativeDriver: true,
      }),
      Animated.timing(scrim, {
        toValue: 0,
        duration: OUT.duration,
        easing,
        useNativeDriver: true,
      }),
    ]).start(() => dismissRef.current());
  }, [enter, scrim]);

  /** Every way out comes through here; true when the exit is running. */
  const requestClose = useCallback((): boolean => {
    if (closing.current) return true;
    const ask = guardRef.current;
    if (ask && !ask(close)) return false;
    close();
    return true;
  }, [close]);

  // The nav pill is a sibling of the whole section and would paint over this.
  // See `components/overlay.ts`. Back dismisses, like the scrim — animated.
  useIsOverlay(requestClose);

  // The entrance waits for the first measurement, so 110% is of the real pane.
  useEffect(() => {
    if (height <= 0 || started.current) return;
    started.current = true;
    Animated.timing(scrim, {
      toValue: 1,
      duration: SCRIM_IN_MS,
      useNativeDriver: true,
    }).start();
    Animated.timing(enter, {
      toValue: 1,
      duration: IN.duration,
      easing: curve(IN.bezier),
      useNativeDriver: true,
    }).start();
  }, [enter, height, scrim]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => {
        if (!closing.current) drag.setValue(Math.max(0, g.dy));
      },
      onPanResponderRelease: (_, g) => {
        if (closing.current) return;
        // A held close (a guarded sheet asking first) springs back like a nudge.
        if (g.dy > DISMISS_DRAG && closeRef.current()) return;
        Animated.timing(drag, {
          toValue: 0,
          duration: SPRING_BACK.duration,
          easing: curve(SPRING_BACK.bezier),
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;
  const closeRef = useRef(requestClose);
  closeRef.current = requestClose;

  // A child's `Cancel` is a way out like the others, so it is guarded too.
  const dismissForChild = useCallback(() => {
    requestClose();
  }, [requestClose]);

  // Before it is measured the pane waits a whole window below, out of sight.
  const offscreen = (height > 0 ? height : windowHeight) * 1.1 + insets.bottom + 8;
  // Memoised on what the range reads: a fresh node per render (every keystroke
  // in a sheet's field) makes the pane detach and re-attach its native graph.
  const translateY = useMemo(
    () =>
      Animated.add(enter.interpolate({ inputRange: [0, 1], outputRange: [offscreen, 0] }), drag),
    [drag, enter, offscreen],
  );

  return (
    <DismissContext.Provider value={dismissForChild}>
      <View className="absolute inset-0" accessibilityViewIsModal>
        {/* `style`, not `className`: NativeWind's classes don't reach a node
            wrapped by `Animated.createAnimatedComponent`. */}
        <Animated.View
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: scrim }}
        >
          <Pane intensity={10} />
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: SCRIM,
            }}
          />
        </Animated.View>
        <Pressable
          onPress={dismissForChild}
          accessibilityRole="button"
          accessibilityLabel={dismissLabel ?? t('Close')}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />

        <Animated.View
          onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
          style={{
            position: 'absolute',
            left: 8,
            right: 8,
            bottom: 8 + insets.bottom,
            borderRadius: SHEET_RADIUS,
            // The drop under the pane and the theme's glow round it. Outset
            // shadows are drawn outside the box, so the clipping child below
            // does not cut them.
            transform: [{ translateY }],
          }}
        >
          <View
            style={{
              borderRadius: SHEET_RADIUS,
              borderWidth: 1,
              borderColor: EDGE,
              overflow: 'hidden',
              paddingHorizontal: 18,
              paddingTop: 6,
              paddingBottom: 22,
            }}
          >
            <Pane intensity={34} />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: PANE,
              }}
            />
            {/* The 1 px specular along the top edge. */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 1,
                backgroundColor: SPECULAR,
              }}
            />

            {/* 28 tall so the thumb has something to hold; the bar is 44 × 5. */}
            <View
              {...pan.panHandlers}
              style={{ height: 28, alignItems: 'center', justifyContent: 'center' }}
            >
              <View style={{ width: 44, height: 5, borderRadius: 9999, backgroundColor: HANDLE }} />
            </View>

            {children}
          </View>
        </Animated.View>
      </View>
    </DismissContext.Provider>
  );
}

/**
 * A sheet's `Cancel`, running the frame's animated exit before `onDismiss`.
 * It has to be a component rendered INSIDE the frame to reach it — the sheet
 * component that renders the frame sits above the provider, not under it.
 * `text` is the quiet row under a form's primary; `ghost` is the pill beside
 * or under a confirm.
 */
export function SheetCancel({
  label,
  onDismiss,
  variant = 'text',
}: {
  label: string;
  onDismiss: () => void;
  variant?: 'text' | 'ghost';
}) {
  const dismiss = useSheetDismiss() ?? onDismiss;
  return variant === 'ghost' ? (
    <PrimaryButton label={label} variant="ghost" onPress={dismiss} />
  ) : (
    <TextButton label={label} onPress={dismiss} />
  );
}

/** The design's sheet title: 23 / 28, 600, ink. */
export function SheetTitle({ children }: { children: ReactNode }) {
  return (
    <Text
      className="text-ink"
      style={{ fontSize: 23, lineHeight: 28, fontWeight: '600', letterSpacing: -0.3 }}
    >
      {children}
    </Text>
  );
}

interface SheetProps {
  title: string;
  onDismiss: () => void;
  /** Passed to the frame — a sheet holding a draft asks before it goes. */
  guard?: SheetGuard;
  children: ReactNode;
}

export function Sheet({ title, onDismiss, guard, children }: SheetProps) {
  return (
    <SheetFrame onDismiss={onDismiss} guard={guard}>
      <View className="mb-lg">
        <SheetTitle>{title}</SheetTitle>
      </View>
      {/* Capped, so a long list scrolls rather than growing past the screen. */}
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>
        {children}
      </ScrollView>
    </SheetFrame>
  );
}
