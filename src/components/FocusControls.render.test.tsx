import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';

import { FocusBottom, FocusDone } from './FocusControls';

/**
 * DONE and the undo chip above it, under a hand that is not aiming. Each case is
 * a press that used to log the wrong thing — see `lib/focusPress.ts`.
 */

/** The chip above DONE — the first button in the block, whatever the language. */
const undoChip = (view: ReturnType<typeof render>) => view.getAllByRole('button')[0];

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

function screen(delayMs: number) {
  const onDone = jest.fn();
  const onUndo = jest.fn();
  const view = render(
    <FocusBottom onUndo={onUndo}>
      <FocusDone onPress={onDone} label="done" delayMs={delayMs} />
    </FocusBottom>,
  );
  return { view, onDone, onUndo };
}

it('a double-tap on DONE logs one set, with or without the ripple wait', () => {
  for (const delay of [0, 180]) {
    const { view, onDone } = screen(delay);
    fireEvent.press(view.getByLabelText('done'));
    act(() => jest.advanceTimersByTime(250));
    fireEvent.press(view.getByLabelText('done'));
    act(() => jest.advanceTimersByTime(1000));
    expect(onDone).toHaveBeenCalledTimes(1);
    view.unmount();
  }
});

it('a second DONE after the cooldown is a real second set', () => {
  const { view, onDone } = screen(0);
  fireEvent.press(view.getByLabelText('done'));
  act(() => jest.advanceTimersByTime(1000));
  fireEvent.press(view.getByLabelText('done'));
  expect(onDone).toHaveBeenCalledTimes(2);
});

it('undo inside the ripple wait cancels that DONE and un-logs nothing', () => {
  const { view, onDone, onUndo } = screen(180);
  fireEvent.press(view.getByLabelText('done'));
  fireEvent.press(undoChip(view));
  act(() => jest.advanceTimersByTime(1000));
  expect(onDone).not.toHaveBeenCalled();
  expect(onUndo).not.toHaveBeenCalled();
});

it('undo with no DONE pending takes back the last set, as before', () => {
  const { view, onUndo } = screen(180);
  fireEvent.press(undoChip(view));
  expect(onUndo).toHaveBeenCalledTimes(1);
});
