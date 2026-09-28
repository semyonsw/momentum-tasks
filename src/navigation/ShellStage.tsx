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
 * Two layers at most are mounted — the route and, during a transition, the one
 * it came from — so a section you are not looking at costs nothing.
 */

import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import type { TileRect } from '../screens/LandingScreen';
import { SECTIONS, type ShellRoute } from '../lib/sectionNav';
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
  render: (route: ShellRoute) => ReactNode;
}

export function ShellStage({
  route,
  transition,
  progress,
  drag,
  covered,
  render,
}: ShellStageProps) {
  const live = transition ? [transition.from, transition.to] : [route];
  return (
    <>
      {ORDER.filter((key) => live.includes(key)).map((key) => (
        <StageLayer
          key={key}
          layer={key}
          role={key === route ? 'current' : 'previous'}
          transition={transition}
          progress={progress}
          drag={drag}
          covered={covered}
        >
          {render(key)}
        </StageLayer>
      ))}
    </>
  );
}

function StageLayer({
  layer,
  role,
  transition,
  progress,
  drag,
  covered,
  children,
}: {
  layer: ShellRoute;
  role: 'current' | 'previous';
  transition: ShellTransition | null;
  progress: SharedValue<number>;
  drag: SharedValue<number>;
  covered: SharedValue<number>;
  children: ReactNode;
}) {
  const { width: W, height: H } = useWindowDimensions();
  const kind = transition?.kind ?? null;
  const rect = transition?.rect ?? {
    x: W * 0.25,
    y: H * 0.35,
    width: W * 0.5,
    height: H * 0.3,
  };
  const dir = transition?.dir ?? 1;
  const dragFrom = transition?.dragFrom ?? 0;
  /* The section being clipped: the incoming one on `open`, the outgoing one on `close`. */
  const clipped =
    (kind === 'open' && role === 'current') || (kind === 'close' && role === 'previous');

  const outer = useAnimatedStyle(() => {
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
  const zIndex = clipped ? 3 : kind !== null && role === 'current' ? 2 : 1;

  return (
    <Animated.View
      pointerEvents={role === 'current' ? 'auto' : 'none'}
      style={[styles.outer, { backgroundColor: palette.bg, zIndex }, outer]}
    >
      <Animated.View style={[{ position: 'absolute', width: W, height: H }, inner]}>
        <Animated.View style={[{ flex: 1 }, rise]}>{children}</Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: { position: 'absolute', overflow: 'hidden' },
});
