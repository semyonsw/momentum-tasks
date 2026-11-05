/**
 * PushHost — the stack's screens, sliding over whatever they were pushed from.
 *
 *   push   the new screen arrives from the right edge over 560 ms, and the one
 *          behind steps back: −26% sideways, .94, 35% — so you can see you are
 *          one level deeper rather than somewhere else
 *   pop    the reverse, 320 ms on an ease-in, and the one behind steps forward
 *   edge   a finger that starts within 44 dp of the left edge and moves right
 *          drags the screen with it, the one behind un-parallaxing in step;
 *          past 120 dp or on a flick it pops, otherwise it springs back
 *
 * The shell used to REPLACE the section with the pushed screen, which is why
 * nothing could slide over anything: there was never a second screen on stage.
 * Now the roots stay mounted under the stack (hidden with `display: none` while
 * a pushed screen fully covers them, so a covered section costs no draw), and
 * this host keeps the screen that is leaving alive — as the element it was last
 * rendered as — for as long as its exit takes.
 *
 * `pos` is the whole state of the motion, 0 = the top screen fully in, 1 =
 * fully out to the right. The screen behind reads the same value, which is what
 * keeps the parallax locked to the finger during an edge drag.
 */

import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PanResponder, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { EDGE_BACK_PX, edgeBackCommits } from '../lib/sectionNav';
import { palette } from '../theme/tokens';

const PUSH = Easing.bezier(0.22, 1, 0.36, 1);
const POP = Easing.bezier(0.4, 0, 0.6, 1);
const SPRING_BACK = Easing.bezier(0.34, 1.3, 0.64, 1);

type Phase = 'idle' | 'push' | 'pop' | 'drag';

interface PushHostProps {
  depth: number;
  /** Identity of the top route — a change at the same depth is a replace. */
  topKey: string;
  /** The key the screen under the top one has (or will have) as the top. */
  beneathKey: string;
  top: ReactNode;
  /** The screen under the top one, for depth ≥ 2 — rendered only while it shows. */
  renderBeneath: () => ReactNode;
  /** How covered the ROOTS are, 0–1, for their own parallax. */
  covered: SharedValue<number>;
  /** Whether the roots must be drawn — false while a pushed screen covers them. */
  onRootsVisible: (visible: boolean) => void;
  /** Leave the top screen, by the same path as `‹` and hardware back. */
  onBack: () => void;
}

export function PushHost({
  depth,
  topKey,
  beneathKey,
  top,
  renderBeneath,
  covered,
  onRootsVisible,
  onBack,
}: PushHostProps) {
  const { width: W } = useWindowDimensions();
  const pos = useSharedValue(0);
  const [phase, setPhase] = useState<Phase>('idle');
  /* Bumped on every change of top. A second push or pop landing while the
     first still animates writes `pos` (cancelling that animation, whose
     callback then never reaches `done`) and asks for the phase it already
     has — so without this the effect never re-ran and the stack sat frozen
     half-way, a stale screen over the app taking every touch. */
  const [generation, setGeneration] = useState(0);
  const [seen, setSeen] = useState({ depth, key: topKey });
  const lastTop = useRef<ReactNode>(top);
  const exiting = useRef<{ key: string; node: ReactNode } | null>(null);
  /* An edge drag that committed has already animated the screen out. */
  const alreadyOut = useRef(false);
  const rootsUnder = useSharedValue(depth <= 1 ? 1 : 0);

  /* A change of top, detected during render so the very first frame of the
     new layering is already right — an effect would show the new screen fully
     in for one frame before sliding it. */
  if (seen.depth !== depth || seen.key !== topKey) {
    if (depth > seen.depth) {
      pos.value = 1;
      rootsUnder.value = depth === 1 ? 1 : 0;
      exiting.current = null;
      setPhase('push');
    } else if (depth < seen.depth && !alreadyOut.current) {
      exiting.current = { key: seen.key, node: lastTop.current };
      pos.value = 0;
      rootsUnder.value = depth === 0 ? 1 : 0;
      setPhase('pop');
    } else {
      /* A replace, or the pop an edge drag already animated. Resetting `pos`
         to 0 must not reach the roots: with `rootsUnder` still 1 from the
         drag, the reaction below would turn it into covered = 1 AFTER the idle
         effect wrote 0 — the reaction runs on the UI thread, a frame later —
         and every root would stay parked at −26%, .94, 35% with nothing on
         top of it. So detach the roots first and set their state outright. */
      exiting.current = null;
      rootsUnder.value = 0;
      covered.value = depth > 0 ? 1 : 0;
      pos.value = 0;
      setPhase('idle');
    }
    alreadyOut.current = false;
    setSeen({ depth, key: topKey });
    setGeneration((g) => g + 1);
  }
  lastTop.current = top;

  useAnimatedReaction(
    () => pos.value,
    (v) => {
      if (rootsUnder.value === 1) covered.value = 1 - v;
    },
  );

  useEffect(() => {
    const done = () => {
      exiting.current = null;
      setPhase('idle');
    };
    if (phase === 'push') {
      pos.value = withTiming(0, { duration: 560, easing: PUSH }, (finished) => {
        if (finished) runOnJS(done)();
      });
    } else if (phase === 'pop') {
      pos.value = withTiming(1, { duration: 320, easing: POP }, (finished) => {
        if (finished) runOnJS(done)();
      });
    }
  }, [phase, generation, pos]);

  /* At rest the roots are covered exactly when something is pushed. */
  useEffect(() => {
    if (phase === 'idle') {
      /* At rest nothing is moving, so nothing may drive the roots either. */
      rootsUnder.value = 0;
      /* ...and the top screen is fully in. A pop ENDS at pos = 1 — that is
         the leaving screen gone off to the right — and the screen it uncovered
         becomes the top layer reading that same 1 as "all the way out". */
      pos.value = 0;
      covered.value = depth > 0 ? 1 : 0;
      onRootsVisible(depth === 0);
    } else {
      onRootsVisible(depth <= 1 || (phase === 'pop' && depth === 0));
    }
  }, [covered, depth, onRootsVisible, phase, pos, rootsUnder]);

  /* The edge drag. Captured only for a clearly rightward move that STARTED at
     the edge, so every tap — the 46 dp back circle included — is untouched. */
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const depthRef = useRef(depth);
  depthRef.current = depth;
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponderCapture: (_e, g) =>
          depthRef.current > 0 &&
          phaseRef.current === 'idle' &&
          g.x0 < EDGE_BACK_PX &&
          g.dx > 10 &&
          g.dx > 1.3 * Math.abs(g.dy),
        onPanResponderGrant: () => {
          rootsUnder.value = depthRef.current === 1 ? 1 : 0;
          setPhase('drag');
        },
        onPanResponderMove: (_e, g) => {
          pos.value = Math.min(1, Math.max(0, g.dx / W));
        },
        onPanResponderRelease: (_e, g) => {
          // A screen holding unsaved edits springs back and asks instead.
          if (edgeBackCommits(g.dx, g.vx)) {
            const out = () => {
              alreadyOut.current = true;
              onBackRef.current();
              setPhase('idle');
            };
            pos.value = withTiming(1, { duration: 240, easing: POP }, (finished) => {
              if (finished) runOnJS(out)();
            });
          } else {
            pos.value = withTiming(0, { duration: 440, easing: SPRING_BACK }, (finished) => {
              if (finished) runOnJS(setPhase)('idle');
            });
          }
        },
        onPanResponderTerminate: () => {
          pos.value = withTiming(0, { duration: 440, easing: SPRING_BACK });
          setPhase('idle');
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [W, pos, rootsUnder],
  );

  if (depth === 0 && phase !== 'pop') return null;

  const showBeneath = phase !== 'idle' && (phase === 'pop' ? depth >= 1 : depth >= 2);

  /*
   * KEYS ARE THE ROUTE'S OWN, in every role. The screen leaving keeps the key it
   * had as the top, and the one beneath carries the key it has (or is about to
   * have) as the top — so React keeps ONE instance through push, pop and drag
   * instead of mounting a copy for the animation. Copies re-ran mount effects
   * and entrances: the session's fade-in blanked the workout on every trip
   * through it, and History's copy consumed the focus it was meant to reopen.
   * The `Guard` wrapper is in every role for the same reason: a changed parent
   * type would remount the screen anyway.
   */
  const lit = (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 3,
        backgroundColor: 'rgba(236,241,238,0.06)',
      }}
    />
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {phase === 'pop' ? (
        <>
          {depth >= 1 ? (
            <Layer key={topKey} role="under" pos={pos} resting={false}>
              <Guard quiet={false}>{top}</Guard>
              {null}
            </Layer>
          ) : null}
          {exiting.current ? (
            /* Inert: its captured ‹ would otherwise pop the screen under it too. */
            <Layer key={exiting.current.key} role="over" pos={pos} resting={false} inert>
              <Guard quiet>{exiting.current.node}</Guard>
              {null}
            </Layer>
          ) : null}
        </>
      ) : (
        <>
          {showBeneath ? (
            <Layer key={beneathKey} role="under" pos={pos} resting={false}>
              <Guard quiet>{renderBeneath()}</Guard>
              {null}
            </Layer>
          ) : null}
          <Layer
            key={topKey}
            role="over"
            pos={pos}
            resting={phase === 'idle'}
            panHandlers={responder.panHandlers}
          >
            <Guard quiet={false}>{top}</Guard>
            {/* The lit edge that says the screen can be dragged back. */}
            {lit}
          </Layer>
        </>
      )}
    </View>
  );
}

/**
 * One screen of the stack. `resting` pins an `over` layer fully in: this was a
 * BLACK SCREEN after every pop to a screen that was itself pushed — `Apply
 * changes` on an AI suggestion, or plain back from it to the chat. The pop's
 * animation ends at pos = 1, the screen it uncovered turns from `under` into
 * `over` on the same key, and `over` at 1 is translated one screen-width off to
 * the right, with the roots under it hidden because something is pushed. The
 * idle effect resets `pos` too, but a JS write lands a frame later; this makes
 * the first idle frame right on its own.
 */
function Layer({
  role,
  pos,
  resting,
  inert = false,
  panHandlers,
  children,
}: {
  role: 'over' | 'under';
  pos: SharedValue<number>;
  resting: boolean;
  /** Takes no touches — the screen on its way out. */
  inert?: boolean;
  panHandlers?: object;
  children: ReactNode;
}) {
  const { width: W } = useWindowDimensions();
  const style = useAnimatedStyle(() => {
    const v = resting ? 0 : pos.value;
    if (role === 'over') return { opacity: 1, transform: [{ translateX: v * W }, { scale: 1 }] };
    return {
      opacity: 0.35 + 0.65 * v,
      transform: [{ translateX: -0.26 * W * (1 - v) }, { scale: 0.94 + 0.06 * v }],
    };
  });
  return (
    <Animated.View
      pointerEvents={role === 'over' && !inert ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, { backgroundColor: palette.bg }, style]}
      {...panHandlers}
    >
      {children}
    </Animated.View>
  );
}

/**
 * A screen rendered as a SNAPSHOT — the one leaving, or the one peeking out
 * from behind — may be about a subject that has just stopped existing (the
 * exercise deleted on the way out). It is on screen for a third of a second;
 * if it cannot render, it renders nothing rather than taking the app down.
 *
 * The TOP screen goes through the same wrapper (`quiet={false}`) so its
 * instance survives becoming a snapshot, and its errors are passed on to the
 * app's `ErrorBoundary` exactly as before: a crash where the user is looking
 * must still say what broke.
 */
class Guard extends Component<
  { quiet: boolean; children: ReactNode },
  { error: unknown; failed: boolean }
> {
  state = { error: null as unknown, failed: false };
  static getDerivedStateFromError(error: unknown) {
    return { error, failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.quiet) return null;
    throw this.state.error;
  }
}
