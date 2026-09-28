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
  top,
  renderBeneath,
  covered,
  onRootsVisible,
  onBack,
}: PushHostProps) {
  const { width: W } = useWindowDimensions();
  const pos = useSharedValue(0);
  const [phase, setPhase] = useState<Phase>('idle');
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
      exiting.current = null;
      pos.value = 0;
      setPhase('idle');
    }
    alreadyOut.current = false;
    setSeen({ depth, key: topKey });
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
  }, [phase, pos]);

  /* At rest the roots are covered exactly when something is pushed. */
  useEffect(() => {
    if (phase === 'idle') {
      covered.value = depth > 0 ? 1 : 0;
      onRootsVisible(depth === 0);
    } else {
      onRootsVisible(depth <= 1 || (phase === 'pop' && depth === 0));
    }
  }, [covered, depth, onRootsVisible, phase]);

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

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {phase === 'pop' ? (
        <>
          {depth >= 1 ? (
            <Layer key={topKey} role="under" pos={pos}>
              {top}
            </Layer>
          ) : null}
          {exiting.current ? (
            <Layer key={`out:${exiting.current.key}`} role="over" pos={pos}>
              <Quiet>{exiting.current.node}</Quiet>
            </Layer>
          ) : null}
        </>
      ) : (
        <>
          {showBeneath ? (
            <Layer key="beneath" role="under" pos={pos}>
              <Quiet>{renderBeneath()}</Quiet>
            </Layer>
          ) : null}
          <Layer key={topKey} role="over" pos={pos} panHandlers={responder.panHandlers}>
            {top}
            {/* The lit edge that says the screen can be dragged back. */}
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
          </Layer>
        </>
      )}
    </View>
  );
}

function Layer({
  role,
  pos,
  panHandlers,
  children,
}: {
  role: 'over' | 'under';
  pos: SharedValue<number>;
  panHandlers?: object;
  children: ReactNode;
}) {
  const { width: W } = useWindowDimensions();
  const style = useAnimatedStyle(() => {
    const v = pos.value;
    if (role === 'over') return { opacity: 1, transform: [{ translateX: v * W }, { scale: 1 }] };
    return {
      opacity: 0.35 + 0.65 * v,
      transform: [{ translateX: -0.26 * W * (1 - v) }, { scale: 0.94 + 0.06 * v }],
    };
  });
  return (
    <Animated.View
      pointerEvents={role === 'over' ? 'auto' : 'none'}
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
 */
class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
