/**
 * ShellStage — the roots (the tasks and Settings), and how one becomes the
 * other.
 *
 *   slide   section ↔ section the incoming one arrives from ±55% at .94, the
 *                            outgoing one leaves toward ∓32% at .9 and fades
 *
 * Every switch is a nav-bar tap, or back from Settings. There used to be a swipe
 * as well, with the current screen following the finger, and it is gone: the
 * finger's offset came in over the JS thread, one responder event at a time, so
 * the screen trembled whenever a render was running — which, at the start of a
 * switch, it always was.
 *
 * Blur is left out: an animated `filter: blur` repaints the whole screen per
 * frame on Android, and the scale-and-fade reads the same at 640 ms.
 *
 * ── NOTHING THAT MOVES HOLDS A BLUR ───────────────────────────────────────
 *
 * The glass blurs (`components/glass.tsx`) are the most expensive thing on the
 * screen once anything moves: each one re-draws the whole window into its own
 * bitmap every frame. At rest that is the two or three a section shows. In a
 * slide it was both sections' — and the arriving section turned its on in the
 * very first frame, native views created as the slide began. So a layer blurs
 * only when it is the route and the stage is still (`LayerGate`): for 640 ms
 * the panes are their tint, border and edge, which is what they are made of
 * anyway, and the blur settles in when the section does. The nav pill keeps
 * its own; it is one, and it never moves.
 *
 * ── THE NEXT SECTION IS ALREADY BUILT ─────────────────────────────────────
 *
 * It used to be that two layers at most were mounted — the route and, during a
 * transition, the one it came from — so a section you were not looking at cost
 * nothing. It cost the switch instead: every swipe and every tab tap built the
 * incoming section from nothing, a whole screen's render and native commit, and
 * the slide sat still until that was done. That pause was the hitch.
 *
 * So the other root is built AHEAD, hidden, one at a time while the stage
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
 *
 * And the section a slide leaves is not torn down when the slide ends: it
 * stays, hidden and frozen, until the same idle moment that builds spares
 * (`lib/stageBuilds.dropGone`), so the last frames of a switch do no
 * unmounting.
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
import Animated, { Easing, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { BlurGate } from '../components/glass';
import { Arrived } from '../hooks/useArrived';
import { SECTIONS, type SectionTab, type ShellRoute } from '../lib/sectionNav';
import {
  addSpare,
  dropGone,
  initialBuilds,
  nextSpare,
  reconcileBuilds,
  type StageBuilds,
} from '../lib/stageBuilds';
import { palette } from '../theme/tokens';

export interface ShellTransition {
  kind: 'slide';
  from: ShellRoute;
  to: ShellRoute;
  /** +1 when the incoming section is to the right of the outgoing one. */
  dir: 1 | -1;
}

/** The order layers are drawn in — stable, so a layer never remounts mid-trip. */
const ORDER: readonly ShellRoute[] = SECTIONS;

export const TRANSITION_MS = 640;

/**
 * When the next piece of idle work — dropping a left section, then building
 * the next spare — happens: the stage at rest for `SPARE_DELAY_MS`, and no
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

interface ShellStageProps {
  route: ShellRoute;
  transition: ShellTransition | null;
  /** 0 → 1 over a transition, linear; each layer applies its own curve. */
  progress: SharedValue<number>;
  /** 0 → 1 as a pushed screen covers the roots: the parallax behind it. */
  covered: SharedValue<number>;
  render: (route: ShellRoute) => ReactElement;
}

export function ShellStage({
  route,
  transition,
  progress,
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

  const work = useCallback(
    (task: IdleTask) =>
      startTransition(() => setStored((s) => (task === 'drop' ? dropGone(s) : addSpare(s, task)))),
    [],
  );
  const idle: IdleTask | null =
    transition != null ? null : stage.gone.length > 0 ? 'drop' : nextSpare(stage, route);
  return (
    <>
      <SpareTimer next={idle} touch={touch} work={work} />
      {layers(stage).map(({ route: key, id, gone }) => (
        <StageLayer
          key={`${key}:${id}`}
          role={
            gone ? 'gone' : key === route ? 'current' : live.includes(key) ? 'previous' : 'spare'
          }
          transition={transition}
          progress={progress}
          covered={covered}
          touchHandlers={touchHandlers}
        >
          {render(key)}
        </StageLayer>
      ))}
    </>
  );
}

/** Drop the sections that were left, or build this one. */
type IdleTask = 'drop' | SectionTab;

/**
 * Every mounted build, in a stable order — by root, then by age — so a layer
 * that is left keeps its place among its siblings rather than being moved.
 */
function layers(stage: StageBuilds): { route: ShellRoute; id: number; gone: boolean }[] {
  const all = [
    ...stage.gone.map((build) => ({ ...build, gone: true })),
    ...ORDER.flatMap((route) => {
      const build = stage.builds[route];
      return build ? [{ route, id: build.id, gone: false }] : [];
    }),
  ];
  return all.sort((a, b) => ORDER.indexOf(a.route) - ORDER.indexOf(b.route) || a.id - b.id);
}

/**
 * Does the next idle task once the stage has been quiet long enough. A
 * component of its own so that it alone reads the roots' gate — false while a
 * pushed screen covers them, when nothing is done, since that moment is
 * somebody's workout — and a covering screen settling does not re-render the
 * stage.
 */
function SpareTimer({
  next,
  touch,
  work,
}: {
  next: IdleTask | null;
  touch: RefObject<{ down: boolean; downAt: number; liftedAt: number }>;
  work: (task: IdleTask) => void;
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
      work(spare);
    };
    timer = setTimeout(attempt, SPARE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [work, spare, touch]);
  return null;
}

/** Blurs only in the route's layer at rest, and only while the roots are on show. */
function LayerGate({ still, children }: { still: boolean; children: ReactNode }) {
  return <BlurGate.Provider value={useContext(BlurGate) && still}>{children}</BlurGate.Provider>;
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
 * the latest ones before anything can. A gone screen never re-renders at all:
 * it is waiting to be unmounted, and nobody will see it again.
 */
const Spare = memo(
  function Spare({ children }: { role: LayerRole; children: ReactElement }) {
    return children;
  },
  (previous, next) =>
    next.role === 'gone' ||
    (next.role === 'spare' &&
      sameData(
        previous.children.props as Record<string, unknown>,
        next.children.props as Record<string, unknown>,
      )),
);

type LayerRole = 'current' | 'previous' | 'spare' | 'gone';

function StageLayer({
  role,
  transition,
  progress,
  covered,
  touchHandlers,
  children,
}: {
  role: LayerRole;
  transition: ShellTransition | null;
  progress: SharedValue<number>;
  covered: SharedValue<number>;
  touchHandlers: Pick<ViewProps, 'onTouchStart' | 'onTouchEnd' | 'onTouchCancel'>;
  children: ReactNode;
}) {
  const waiting = role === 'spare';
  const hidden = waiting || role === 'gone';
  const { width: W, height: H } = useWindowDimensions();
  const kind = transition?.kind ?? null;
  const dir = transition?.dir ?? 1;

  const outer = useAnimatedStyle(() => {
    /* Laid out, so it arrives measured, but not drawn. */
    if (hidden) {
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
    /* At rest, the current screen steps back behind a pushed screen. */
    if (kind === null) {
      const c = covered.value;
      return {
        left: 0,
        top: 0,
        width: W,
        height: H,
        borderRadius: 0,
        opacity: 1 - 0.65 * c,
        transform: [{ translateX: -0.26 * W * c }, { scale: 1 - 0.06 * c }],
      };
    }
    const full = { left: 0, top: 0, width: W, height: H, borderRadius: 0 };
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
      transform: [{ translateX: -dir * 0.32 * W * e }, { scale: 1 - 0.1 * e }],
    };
  });

  /* An arriving section's content rises 34 dp over D+180, 90 ms late. */
  const rise = useAnimatedStyle(() => {
    const arriving = kind !== null && role === 'current';
    if (!arriving) return { transform: [{ translateY: 0 }] };
    const total = TRANSITION_MS + 180 + 90;
    const local = Math.min(1, Math.max(0, (progress.value * total - 90) / (TRANSITION_MS + 180)));
    return { transform: [{ translateY: 34 * (1 - EASE(local)) }] };
  });

  /* Static rather than animated: the order only changes between transitions. */
  const zIndex = hidden ? 0 : kind !== null && role === 'current' ? 2 : 1;

  return (
    <Animated.View
      pointerEvents={role === 'current' ? 'auto' : 'none'}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      accessibilityElementsHidden={hidden}
      {...touchHandlers}
      style={[styles.outer, { backgroundColor: palette.bg, zIndex }, outer]}
    >
      <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: W, height: H }}>
        <Animated.View style={[{ flex: 1 }, rise]}>
          <Arrived.Provider value={!waiting}>
            <LayerGate still={role === 'current' && kind === null}>
              <Spare role={role}>{children as ReactElement}</Spare>
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
