/**
 * The floating bubble's trigger: a section's scroll, read through hysteresis.
 *
 * `onScroll` goes on the section's `ScrollView` with `scrollEventThrottle={16}`,
 * and it sets state ONLY when the answer flips — `lib/bubbleThreshold.ts` decides
 * that, and says why there are two lines rather than one. A scroll handler that
 * set state on every frame would re-render the whole section sixty times a second
 * for a boolean that changes twice per trip down the list.
 *
 * `scrollToTop` is the bubble's own tap: the hero it stands in for is at the top,
 * so tapping the stand-in goes back to the original — which scrolls under 150 and
 * lifts the bubble away on the way.
 *
 * State lives in the section, so leaving the section and coming back starts it
 * hidden: a remount is a scroll reset, and the bubble follows the scroll.
 *
 * `fabHidden` rides the same handler (U27, `lib/fabScroll.ts`): the section's
 * floating action steps aside on a scroll down and returns on a scroll up. Here
 * rather than in a second hook because a `ScrollView` has one `onScroll`, and
 * the three sections with a bubble are exactly the three with a round action
 * over a list. Same rule as the bubble: state only when the answer flips.
 */

import { useCallback, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView } from 'react-native';

import { BUBBLE_HIDE_Y, BUBBLE_SHOW_Y, nextBubbleVisible } from '../lib/bubbleThreshold';
import { FAB_SCROLL_START, nextFabScroll } from '../lib/fabScroll';

export function useBubbleOnScroll(show: number = BUBBLE_SHOW_Y, hide: number = BUBBLE_HIDE_Y) {
  const [visible, setVisible] = useState(false);
  const current = useRef(false);
  const [fabHidden, setFabHidden] = useState(false);
  const fab = useRef(FAB_SCROLL_START);
  const scrollRef = useRef<ScrollView>(null);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y;
      const fabNext = nextFabScroll(fab.current, y);
      if (fabNext.hidden !== fab.current.hidden) setFabHidden(fabNext.hidden);
      fab.current = fabNext;

      const next = nextBubbleVisible(current.current, y, show, hide);
      if (next === current.current) return;
      current.current = next;
      setVisible(next);
    },
    [hide, show],
  );

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  return { visible, fabHidden, onScroll, scrollRef, scrollToTop };
}
