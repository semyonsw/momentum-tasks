import { describe, expect, it } from 'vitest';

import { FAB_SCROLL_START, nextFabScroll, type FabScrollState } from './fabScroll';

/** Feed a whole scroll through, the way the hook does, one event at a time. */
function run(ys: number[], from: FabScrollState = FAB_SCROLL_START): FabScrollState {
  return ys.reduce(nextFabScroll, from);
}

describe('scrolling down', () => {
  it('hides once the list is past 40 and the drag passes 6', () => {
    expect(run([10, 30, 47]).hidden).toBe(true);
  });

  it('stays while the list is within 40 of the top, however far the drag', () => {
    expect(run([10, 20, 30, 40]).hidden).toBe(false);
  });

  it('ignores a drag of 6 or less past the floor', () => {
    const state = run([], { hidden: false, anchor: 100 });
    expect(nextFabScroll(state, 106).hidden).toBe(false);
    expect(nextFabScroll(state, 107).hidden).toBe(true);
  });

  it('counts a slow drag, 2 dp an event, from where it turned', () => {
    const shown: FabScrollState = { hidden: false, anchor: 200 };
    expect(run([202, 204, 206], shown).hidden).toBe(false);
    expect(run([202, 204, 206, 208], shown).hidden).toBe(true);
  });
});

describe('scrolling up', () => {
  it('returns once the drag up passes 6', () => {
    const hidden = run([50, 300]);
    expect(hidden.hidden).toBe(true);
    expect(nextFabScroll(hidden, 294).hidden).toBe(true);
    expect(nextFabScroll(hidden, 293).hidden).toBe(false);
  });

  it('measures from the deepest point, not from where it hid', () => {
    // hid at 50, kept reading down to 900, then turned
    const state = run([50, 400, 900]);
    expect(nextFabScroll(state, 880).hidden).toBe(false);
    expect(run([50, 400, 900, 897]).hidden).toBe(true);
  });

  it('counts a slow drag up, 2 dp an event', () => {
    const state = run([50, 500]);
    expect(run([498, 496, 494], state).hidden).toBe(true);
    expect(run([498, 496, 494, 492], state).hidden).toBe(false);
  });

  it('comes back when the list jumps to the top (a tap on the bubble)', () => {
    expect(run([50, 600, 0]).hidden).toBe(false);
  });
});

describe('back and forth', () => {
  it('hides again after coming back, from the new turning point', () => {
    const back = run([50, 600, 550]);
    expect(back.hidden).toBe(false);
    expect(nextFabScroll(back, 556).hidden).toBe(false);
    expect(nextFabScroll(back, 557).hidden).toBe(true);
  });

  it('does not twitch for a thumb resting on the glass', () => {
    const state = run([50, 300, 301, 299, 300, 302, 298]);
    expect(state.hidden).toBe(true);
  });

  it('keeps its answer for a scroll offset that is not a number', () => {
    const hidden = run([50, 300]);
    expect(nextFabScroll(hidden, Number.NaN)).toBe(hidden);
  });

  it('returns the same object when nothing changes, so the hook can skip a render', () => {
    const state: FabScrollState = { hidden: false, anchor: 10 };
    expect(nextFabScroll(state, 12)).toBe(state);
  });
});
