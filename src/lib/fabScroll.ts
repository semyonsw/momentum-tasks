/**
 * THE FLOATING ACTION STEPS ASIDE while you read down a list (U27).
 *
 * The section's 64 dp circle sits over the right-hand column of the rows — the
 * Money tile's figure, a task's check — and mid-scroll it covers exactly the
 * thing you are scrolling to look at. So a scroll DOWN of more than 6 dp, once
 * the list is 40 dp past its top, slides it away, and a scroll UP of more than
 * 6 dp brings it back. Down is reading; up is looking for something, and the
 * one action the section exists for is a thing you might be looking for.
 *
 * Why an ANCHOR rather than the last event's y (the prototype's `d = y - lastY`):
 * at `scrollEventThrottle={16}` a slow drag moves 2–3 dp an event, so a delta
 * per event never passes 6 and a slow scroll up would never bring the button
 * back. The anchor is the turning point — the deepest y while the button is
 * hidden, the shallowest while it is shown — and the 6 dp is measured from
 * there, so a drag counts however slowly it is made.
 *
 * Why the 40 dp floor: at the top of the list nothing is covered yet, and the
 * overscroll bounce on a short list would otherwise flick the button away.
 *
 * Rejected: hiding on ANY downward movement (a thumb resting on the glass
 * jitters by a pixel and the button would twitch), and a timer that brings it
 * back after the scroll stops (the button reappearing over a row you are
 * reading is the thing being fixed).
 *
 * Pure, so the hook can feed it every scroll event and set state only when
 * `hidden` actually flips.
 */

/** How far a drag must go, from its turning point, to count. */
export const FAB_SCROLL_SLOP = 6;
/** Above this offset the button always stays. */
export const FAB_SCROLL_FLOOR = 40;
/** The slide, in ms, before the motion scale. */
export const FAB_HIDE_MS = 320;
/** How far it slides: past the slot and the nav pill, off the screen's edge. */
export const FAB_HIDE_DISTANCE = 180;

export interface FabScrollState {
  hidden: boolean;
  /** The turning point the next drag is measured from. */
  anchor: number;
}

export const FAB_SCROLL_START: FabScrollState = { hidden: false, anchor: 0 };

export function nextFabScroll(state: FabScrollState, y: number): FabScrollState {
  if (!Number.isFinite(y)) return state;
  if (state.hidden) {
    if (y < state.anchor - FAB_SCROLL_SLOP) return { hidden: false, anchor: y };
    return y > state.anchor ? { hidden: true, anchor: y } : state;
  }
  if (y > FAB_SCROLL_FLOOR && y > state.anchor + FAB_SCROLL_SLOP) {
    return { hidden: true, anchor: y };
  }
  return y < state.anchor ? { hidden: false, anchor: y } : state;
}
