/**
 * ShellStage — the roots (Home and the four sections), and how one becomes
 * another.
 *
 *   open    Home → section   the section GROWS out of the tapped tile: its clip
 *                            rect expands from the tile (radius 28) to the whole
 *                            screen (radius 48) while Home shrinks to .88 and fades
 *   close   section → Home   the reverse — the section shrinks back INTO its tile
 *                            and fades, and Home comes forward from 1.07
 *   slide   section ↔ section the incoming one arrives from ±55% at .94, the
 *                            outgoing one leaves toward ∓32% at .9 and fades
 *
 * A drag between sections (`drag`, in dp of finger travel already damped by
 * `lib/sectionNav.swipeFollow`) moves the current screen directly — it follows
 * the finger and shrinks by |d|/2800 — and a committed swipe hands its offset to
 * the slide, so the screen carries on from where the finger let go rather than
 * jumping back to centre first.
 *
 * ── A CLIP WITHOUT A MASK ─────────────────────────────────────────────────
 *
 * The design animates a CSS `clip-path`. React Native has none, and
 * `MaskedView` would be a new native dependency for one transition. The same
 * picture comes from two views: an outer one whose rect and radius animate,
 * with `overflow: hidden`, and inside it the full-screen section offset by the
 * outer's own position, so the content stays still on screen while the window
 * onto it grows. Both on the UI thread, so the section's first render cannot
 * stall its own entrance.
 *
 * Blur is left out: an animated `filter: blur` repaints the whole screen per
 * frame on Android, and the scale-and-fade reads the same at 640 ms.
 *
 * ── THE NEXT SECTION IS ALREADY BUILT ─────────────────────────────────────
 *
 * It used to be that two layers at most were mounted — the route and, during a
 * transition, the one it came from — so a section you were not looking at cost
 * nothing. It cost the switch instead: every swipe and every tab tap built the
 * incoming section from nothing, a whole screen's render and native commit, and
 * the slide sat still until that was done. That pause was the hitch.
 *
 * So the other sections are built AHEAD, hidden, one at a time while the stage
 * is at rest (`lib/stageBuilds.ts` keeps the books), and a switch only moves
 * screens that already exist. What keeps that invisible:
 *
 *   - a spare is FRESH — a section you leave is thrown away, and its spare is a
 *     new build — so its scroll, its closed panels and its state are what a
 *     mount at arrival gave;
 *   - it waits for its ENTRANCE (`hooks/useArrived.ts`): everything that used to
 *     play on mount plays when it arrives;
 *   - it is drawn at opacity 0, takes no touches, is hidden from TalkBack, and
 *     holds no blur (`BlurGate`), since a hidden blur still redraws every frame;
 *   - it re-renders only when what it SHOWS changes, never for a new callback,
 *     so it is current when it arrives and the arrival has nothing to animate.
 */

import {
  memo,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  StyleSheet,
  useWindowDimensions,
  type GestureResponderEvent,
  type ViewProps,
} from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { BlurGate } from '../components/glass';
import type { TileRect } from '../screens/LandingScreen';
import { Arrived } from '../hooks/useArrived';
import { SECTIONS, type SectionTab, type ShellRoute } from '../lib/sectionNav';
import { addSpare, initialBuilds, nextSpare, reconcileBuilds } from '../lib/stageBuilds';
import { palette } from '../theme/tokens';

export interface ShellTransition {
  kind: 'open' | 'close' | 'slide';
  from: ShellRoute;
  to: ShellRoute;
  /** +1 when the incoming section is to the right of the outgoing one. */
  dir: 1 | -1;
  /** The tile the section grows out of or shrinks into. */
  rect: TileRect | null;
  /** Where a released swipe left the outgoing screen, in dp. */
  dragFrom: number;
}

/** The order layers are drawn in — stable, so a layer never remounts mid-trip. */
const ORDER: readonly ShellRoute[] = ['Home', ...SECTIONS];

export const TRANSITION_MS = 640;

/**
 * When the next spare is built: the stage at rest for `SPARE_DELAY_MS`, and no
 * finger on the screen for `SPARE_QUIET_MS`. The render is a transition, so a
 * touch that lands mid-build still goes first — but the native half of a mount,
 * a few hundred views made on the UI thread, is not interruptible, and in the
 * middle of a scroll it would be a dropped frame of its own. A second of quiet
 * after the last lift covers most flings.
 */
const SPARE_DELAY_MS = 500;
const SPARE_QUIET_MS = 1000;
const SPARE_STUCK_MS = 10_000;

const EASE = Easing.bezierFn(0.22, 1, 0.36, 1);
const CLIP = Easing.bezierFn(0.3, 1.08, 0.35, 1);

interface ShellStageProps {
  route: ShellRoute;
  transition: ShellTransition | null;
  /** 0 → 1 over a transition, linear; each layer applies its own curve. */
  progress: SharedValue<number>;
  /** Finger offset while a section swipe is live, 0 otherwise. */
  drag: SharedValue<number>;
  /** 0 → 1 as a pushed screen covers the roots: the parallax behind it. */
  covered: SharedValue<number>;
  render: (route: ShellRoute) => ReactElement;
}

export function ShellStage({
  route,
  transition,
  progress,
  drag,
  covered,
  render,
}: ShellStageProps) {
  const live: ShellRoute[] = transition ? [transition.from, transition.to] : [route];
  const [stored, setStored] = useState(() => initialBuilds(route));
  /* Derived during render, so a spare goes live in the same commit as the
     switch that asked for it — an effect would show one frame without it. */
  const stage = reconcileBuilds(stored, live);
  if (stage !== stored) setStored(stage);

  const touch = useRef({ down: false, downAt: 0, liftedAt: 0 });
  const touchHandlers = useMemo(
    () => ({
      onTouchStart: () => {
        touch.current.down = true;
        touch.current.downAt = Date.now();
      },
      onTouchEnd: (event: GestureResponderEvent) => {
        touch.current.down = event.nativeEvent.touches.length > 0;
        touch.current.liftedAt = Date.now();
      },
      onTouchCancel: (event: GestureResponderEvent) => {
        touch.current.down = event.nativeEvent.touches.length > 0;
        touch.current.liftedAt = Date.now();
      },
    }),
    [],
  );

  const build = useCallback(
    (section: SectionTab) => startTransition(() => setStored((s) => addSpare(s, section))),
    [],
  );
  return (
    <>
      <SpareTimer
        next={transition == null ? nextSpare(stage, route) : null}
        touch={touch}
        build={build}
      />
      {ORDER.filter((key) => stage.builds[key]).map((key) => (
        <StageLayer
          key={`${key}:${stage.builds[key]?.id}`}
          layer={key}
          role={key === route ? 'current' : live.includes(key) ? 'previous' : 'spare'}
          transition={transition}
          progress={progress}
          drag={drag}
          covered={covered}
          touchHandlers={touchHandlers}
        >
          {render(key)}
        </StageLayer>
      ))}
    </>
  );
}

/**
 * Builds the next spare once the stage has been quiet long enough. A component
 * of its own so that it alone reads the roots' gate — false while a pushed
 * screen covers them, when nothing is built, since that moment is somebody's
 * workout — and a covering screen settling does not re-render the stage.
 */
function SpareTimer({
  next,
  touch,
  build,
}: {
  next: SectionTab | null;
  touch: RefObject<{ down: boolean; downAt: number; liftedAt: number }>;
  build: (section: SectionTab) => void;
}) {
  const spare = useContext(BlurGate) ? next : null;
  useEffect(() => {
    if (spare == null) return undefined;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => {
      const now = Date.now();
      const { down, downAt, liftedAt } = touch.current;
      /* A finger whose lift was never seen (its layer unmounted under it)
         stops counting after a while rather than holding every build off. */
      const held = down && now - downAt < SPARE_STUCK_MS;
      const wait = held ? SPARE_QUIET_MS : SPARE_QUIET_MS - (now - liftedAt);
      if (wait > 0) {
        timer = setTimeout(attempt, wait);
        return;
      }
      build(spare);
    };
    timer = setTimeout(attempt, SPARE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [build, spare, touch]);
  return null;
}

/** Blurs only in a layer that is on show, and only while the roots are. */
function LayerGate({ waiting, children }: { waiting: boolean; children: ReactNode }) {
  return <BlurGate.Provider value={useContext(BlurGate) && !waiting}>{children}</BlurGate.Provider>;
}

/** Same keys, and every value that is not a function the same reference. */
function sameData(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every(
    (key) => typeof a[key] === 'function' || (key in b && Object.is(a[key], b[key])),
  );
}

/**
 * A spare's screen, re-rendered only when a prop that is not a callback changes.
 * The callbacks it holds go stale, and nothing calls them: a spare takes no
 * touches and its mount-time effects wait for arrival — which renders it with
 * the latest ones before anything can.
 */
const Spare = memo(
  function Spare({ children }: { waiting: boolean; children: ReactElement }) {
    return children;
  },
  (previous, next) =>
    next.waiting &&
    sameData(
      previous.children.props as Record<string, unknown>,
      next.children.props as Record<string, unknown>,
    ),
);

function StageLayer({
  layer,
  role,
  transition,
  progress,
  drag,
  covered,
  touchHandlers,
  children,
}: {
  layer: ShellRoute;
  role: 'current' | 'previous' | 'spare';
  transition: ShellTransition | null;
  progress: SharedValue<number>;
  drag: SharedValue<number>;
  covered: SharedValue<number>;
  touchHandlers: Pick<ViewProps, 'onTouchStart' | 'onTouchEnd' | 'onTouchCancel'>;
  children: ReactNode;
}) {
  const waiting = role === 'spare';
  const { width: W, height: H } = useWindowDimensions();
  const kind = transition?.kind ?? null;
  /* Memoized: both worklets below capture it, and Reanimated treats a captured
     object that is new on every render as a new worklet — its mapper stopped and
     restarted on the UI thread on every render of the shell. */
  const fallbackRect = useMemo(
    () => ({ x: W * 0.25, y: H * 0.35, width: W * 0.5, height: H * 0.3 }),
    [H, W],
  );
  const rect = transition?.rect ?? fallbackRect;
  const dir = transition?.dir ?? 1;
  const dragFrom = transition?.dragFrom ?? 0;
  /* The section being clipped: the incoming one on `open`, the outgoing one on `close`. */
  const clipped =
    (kind === 'open' && role === 'current') || (kind === 'close' && role === 'previous');

  const outer = useAnimatedStyle(() => {
    /* Laid out, so it arrives measured, but not drawn. */
    if (waiting) {
      return {
        left: 0,
        top: 0,
        width: W,
        height: H,
        borderRadius: 0,
        opacity: 0,
        transform: [{ translateX: 0 }, { scale: 1 }],
      };
    }
    const t = progress.value;
    const e = EASE(t);
    /* At rest, the current screen follows a live swipe and steps back behind
       a pushed screen. */
    if (kind === null) {
      const d = drag.value;
      const c = covered.value;
      return {
        left: 0,
        top: 0,
        width: W,
        height: H,
        borderRadius: 0,
        opacity: 1 - 0.65 * c,
        transform: [
          { translateX: d - 0.26 * W * c },
          { scale: (1 - Math.abs(d) / 2800) * (1 - 0.06 * c) },
        ],
      };
    }
    if (clipped) {
      /* open: 0 → 1 grows the window; close: 0 → 1 shrinks it. */
      const k = CLIP(kind === 'open' ? t : 1 - t);
      return {
        left: interpolate(k, [0, 1], [rect.x, 0]),
        top: interpolate(k, [0, 1], [rect.y, 0]),
        width: interpolate(k, [0, 1], [rect.width, W]),
        height: interpolate(k, [0, 1], [rect.height, H]),
        borderRadius: interpolate(k, [0, 1], [28, 48]),
        opacity:
          kind === 'open'
            ? interpolate(Math.min(1, t / 0.75), [0, 1], [0.5, 1])
            : interpolate(Math.min(1, t / 0.75), [0, 1], [1, 0]),
        transform: [{ translateX: 0 }, { scale: 1 }],
      };
    }
    const full = { left: 0, top: 0, width: W, height: H, borderRadius: 0 };
    if (kind === 'open') {
      /* Home, behind the growing section. */
      return {
        ...full,
        opacity: 1 - e,
        transform: [{ translateX: 0 }, { scale: 1 - 0.12 * e }],
      };
    }
    if (kind === 'close') {
      /* Home, coming forward from 1.07 under the shrinking section. */
      return {
        ...full,
        opacity: e,
        transform: [{ translateX: 0 }, { scale: 1.07 - 0.07 * e }],
      };
    }
    if (role === 'current') {
      return {
        ...full,
        opacity: Math.min(1, e * 1.25),
        transform: [{ translateX: dir * 0.55 * W * (1 - e) }, { scale: 0.94 + 0.06 * e }],
      };
    }
    return {
      ...full,
      opacity: 1 - e,
      transform: [
        { translateX: dragFrom + (-dir * 0.32 * W - dragFrom) * e },
        { scale: 1 - 0.1 * e },
      ],
    };
  });

  /* The content inside a clip stays still on screen while the window moves. */
  const inner = useAnimatedStyle(() => {
    if (!clipped) return { left: 0, top: 0 };
    const k = CLIP(kind === 'open' ? progress.value : 1 - progress.value);
    return {
      left: -interpolate(k, [0, 1], [rect.x, 0]),
      top: -interpolate(k, [0, 1], [rect.y, 0]),
    };
  });

  /* An arriving section's content rises 34 dp over D+180, 90 ms late. */
  const rise = useAnimatedStyle(() => {
    const arriving = kind !== null && role === 'current' && layer !== 'Home';
    if (!arriving) return { transform: [{ translateY: 0 }] };
    const total = TRANSITION_MS + 180 + 90;
    const local = Math.min(1, Math.max(0, (progress.value * total - 90) / (TRANSITION_MS + 180)));
    return { transform: [{ translateY: 34 * (1 - EASE(local)) }] };
  });

  /* Static rather than animated: the order only changes between transitions. */
  const zIndex = waiting ? 0 : clipped ? 3 : kind !== null && role === 'current' ? 2 : 1;

  return (
    <Animated.View
      pointerEvents={role === 'current' ? 'auto' : 'none'}
      importantForAccessibility={waiting ? 'no-hide-descendants' : 'auto'}
      accessibilityElementsHidden={waiting}
      {...touchHandlers}
      style={[styles.outer, { backgroundColor: palette.bg, zIndex }, outer]}
    >
      <Animated.View style={[{ position: 'absolute', width: W, height: H }, inner]}>
        <Animated.View style={[{ flex: 1 }, rise]}>
          <Arrived.Provider value={!waiting}>
            <LayerGate waiting={waiting}>
              <Spare waiting={waiting}>{children as ReactElement}</Spare>
            </LayerGate>
          </Arrived.Provider>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: { position: 'absolute', overflow: 'hidden' },
});
