/**
 * SwipePager — a horizontal flick moves one section along.
 *
 *   Workout  ‹———›  Tasks  ‹———›  Expenses  ‹———›  Settings
 *
 * The tab bar is still there and still the fastest way to reach a section three
 * along. This is for the other case: the thumb is already on the screen, and the
 * next section is one flick away rather than a reach to the bottom edge.
 *
 * ── IT HAS TO LOSE EVERY ARGUMENT EXCEPT ITS OWN ───────────────────────────
 *
 * Three gestures live under this component and all three are older than it: a
 * `ScrollView` scrolling down, a long-press-then-slide reordering a list, and every
 * row's own tap. So the pager claims a touch only when the finger has said
 * something no other gesture in the app says — travelled `THRESHOLD` sideways, and
 * further sideways than down by a factor of `DOMINANCE`. A diagonal is a scroll; a
 * short sideways twitch is a tap that wobbled.
 *
 * It claims on CAPTURE, which is the only way to take a gesture off a
 * `ScrollView` — the scroll view is native and does not lose a bubble-phase
 * argument. That is also why the ratio test is strict rather than generous: a
 * capture that fires too easily makes the whole app feel like it is fighting the
 * thumb, and the failure is invisible in a simulator where drags are straight.
 *
 * ── IT FOLLOWS THE FINGER NOW ─────────────────────────────────────────────
 *
 * It used to change section on release and let the arrival animation do the
 * rest, because tracking the finger meant a second section mounted. Momentum's
 * stage (`navigation/ShellStage.tsx`) moves the CURRENT screen with the finger
 * instead — 0.55 of the drag, rubber-banding at 0.22 past either end — and the
 * nav blob stretches toward the neighbour's slot, so the gesture shows where it
 * is going before it gets there without anything else being mounted. A
 * committed release hands its offset to the slide, which starts from there.
 *
 * The lock is looser than it was (10 dp, 1.3× — `lib/sectionNav.ts`) because
 * the screen now visibly answers the finger: a capture that fires is no longer
 * an invisible decision the user has to guess at.
 */

import { useMemo, useRef, type ReactNode } from 'react';
import { PanResponder, View } from 'react-native';

import { isReordering } from '../hooks/useDragReorder';
import { isHorizontalSwipe } from '../lib/sectionNav';
import { isOverlayOpen } from './overlay';

interface SwipePagerProps {
  /** Off on Home, under a pushed screen, and mid-transition. */
  enabled: boolean;
  /** Raw finger travel while the swipe owns the finger. */
  onDrag: (dx: number) => void;
  /** The finger let go: travel and velocity (px/ms). */
  onRelease: (dx: number, vx: number) => void;
  children: ReactNode;
}

export function SwipePager({ enabled, onDrag, onRelease, children }: SwipePagerProps) {
  /*
   * `PanResponder.create` runs once and its handlers close over what was in scope
   * then, so the callbacks are read out of refs — the same reason `useDragReorder`
   * keeps its lift in one.
   */
  const handlers = useRef({ enabled, onDrag, onRelease });
  handlers.current = { enabled, onDrag, onRelease };

  const responder = useMemo(
    () =>
      PanResponder.create({
        // A press is never a swipe. Taps reach the rows untouched.
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponderCapture: (_event, gesture) =>
          handlers.current.enabled &&
          // A row in the air owns the finger, whichever way it is moving.
          !isReordering() &&
          // Nor while a sheet is up: sheets live inside the section, and a
          // sideways drag across one would change section under a half-typed task.
          !isOverlayOpen() &&
          isHorizontalSwipe(gesture.dx, gesture.dy),
        onPanResponderMove: (_event, gesture) => handlers.current.onDrag(gesture.dx),
        onPanResponderRelease: (_event, gesture) =>
          handlers.current.onRelease(gesture.dx, gesture.vx),
        onPanResponderTerminate: () => handlers.current.onRelease(0, 0),
        onPanResponderTerminationRequest: () => false,
      }),
    [],
  );

  return (
    <View className="flex-1" {...responder.panHandlers}>
      {children}
    </View>
  );
}
