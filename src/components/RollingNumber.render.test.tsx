import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Animated } from 'react-native';
import { act, render } from '@testing-library/react-native';

import { RollingNumber } from './RollingNumber';

/**
 * The focus-mode report: tap + fast through 9 → 10 and a digit stops halfway,
 * half of one numeral over half of another.
 *
 * Asserted on the thing the eye sees — every column's offset, after the rolls
 * settle, must be a whole cell (`−digit × lineHeight`) of the CURRENT size.
 */

/** Each column's settled translateY, left to right. */
function offsets(view: ReturnType<typeof render>): number[] {
  return view.UNSAFE_queryAllByType(Animated.View).map((node) => {
    const style = Array.isArray(node.props.style)
      ? Object.assign({}, ...node.props.style)
      : node.props.style;
    const y = style.transform[0].translateY;
    // `__getValue` is Animated's own read of a value, untyped but public to tests.
    return typeof y === 'number' ? y : (y as unknown as { __getValue(): number }).__getValue();
  });
}

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

it('9 → 10 → 11 at a new size, faster than a roll, ends on whole cells', () => {
  const view = render(<RollingNumber value="8" lineHeight={92} duration={450} />);
  // Taps 50 ms apart — each one interrupts the roll before it.
  view.rerender(<RollingNumber value="9" lineHeight={92} duration={450} />);
  act(() => jest.advanceTimersByTime(50));
  view.rerender(<RollingNumber value="10" lineHeight={81} duration={450} />);
  act(() => jest.advanceTimersByTime(50));
  view.rerender(<RollingNumber value="11" lineHeight={81} duration={450} />);
  act(() => jest.advanceTimersByTime(2000));

  expect(offsets(view)).toEqual([-1 * 81, -1 * 81]);
});

it('a burst of same-size taps lands on the last digit, not an earlier one', () => {
  const view = render(<RollingNumber value="1" lineHeight={60} duration={450} />);
  for (const v of ['2', '3', '4', '5', '6']) {
    view.rerender(<RollingNumber value={v} lineHeight={60} duration={450} />);
    act(() => jest.advanceTimersByTime(30));
  }
  act(() => jest.advanceTimersByTime(2000));
  expect(offsets(view)).toEqual([-6 * 60]);
});

it('10 → 9 drops the tens column and keeps the ones on its cell', () => {
  const view = render(<RollingNumber value="10" lineHeight={81} duration={450} />);
  view.rerender(<RollingNumber value="9" lineHeight={92} duration={450} />);
  act(() => jest.advanceTimersByTime(2000));
  expect(offsets(view)).toEqual([-9 * 92]);
});

/**
 * THE NATIVE DRIVER'S LATE CALLBACK — the race itself.
 *
 * Under jest, Animated runs on the JS driver and a stopped roll reports
 * `finished: false` synchronously, so the cases above pass even on the old code.
 * On the phone the native driver reports a roll that DID finish a few
 * milliseconds later, across the bridge — and a tap that lands inside that gap
 * re-sizes the column before the stale "finished" arrives. This timing is that
 * driver: the value lands at `duration`, and `finished: true` follows 5 ms late.
 */
describe('a finished callback that arrives after the next tap', () => {
  let spy: ReturnType<typeof jest.spyOn>;
  beforeEach(() => {
    spy = jest.spyOn(Animated, 'timing').mockImplementation((value, config) => {
      let landed: ReturnType<typeof setTimeout> | null = null;
      return {
        start: (callback?: Animated.EndCallback) => {
          landed = setTimeout(() => {
            (value as Animated.Value).setValue(config.toValue as number);
            setTimeout(() => callback?.({ finished: true }), 5);
          }, config.duration ?? 0);
        },
        stop: () => {
          if (landed) clearTimeout(landed);
        },
        reset: () => undefined,
      } as Animated.CompositeAnimation;
    });
  });
  afterEach(() => spy.mockRestore());

  it('9 → 10 inside the gap ends on a whole cell of the new size', () => {
    const view = render(<RollingNumber value="8" lineHeight={92} duration={450} />);
    view.rerender(<RollingNumber value="9" lineHeight={92} duration={450} />);
    act(() => jest.advanceTimersByTime(450)); // landed on 9; "finished" in flight
    view.rerender(<RollingNumber value="10" lineHeight={81} duration={450} />);
    act(() => jest.advanceTimersByTime(2000));
    // The old column pinned −9 × 92 = −828: the 0 of ten drawn as half a digit.
    expect(offsets(view)).toEqual([-1 * 81, 0]);
  });

  it('a same-size tap inside the gap is not undone by the roll before it', () => {
    const view = render(<RollingNumber value="3" lineHeight={60} duration={450} />);
    view.rerender(<RollingNumber value="4" lineHeight={60} duration={450} />);
    act(() => jest.advanceTimersByTime(450));
    view.rerender(<RollingNumber value="5" lineHeight={60} duration={450} />);
    act(() => jest.advanceTimersByTime(2000));
    expect(offsets(view)).toEqual([-5 * 60]);
  });
});
