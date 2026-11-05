import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render as baseRender } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { TaskMenu } from './TasksScreen';
import type { Task } from '../lib/tasks';
import { useSettings } from '../state/settingsStore';

/**
 * The row's menu had a bare `TextButton` for Cancel, wired straight to the
 * parent's unmount: tapping it cut the sheet off mid-air while the scrim, Back
 * and every other sheet's Cancel slid it away first. Asserted on the order of
 * events — `onDismiss` waits for the exit, and arrives exactly once.
 */

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const render = (ui: ReactElement) =>
  baseRender(<SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>);

const task: Task = {
  id: 't1',
  name: 'Read twenty pages',
  schedule: { kind: 'daily' },
  auto: null,
  startedOn: '2026-01-01',
  reminder: null,
  archivedAt: null,
} as Task;

beforeEach(() => {
  // The app speaks Russian by default; the assertions read the English copy.
  useSettings.setState({ language: 'en' });
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

it('Cancel runs the animated exit before dismissing, once', () => {
  const onDismiss = jest.fn();
  const onAction = jest.fn();
  const view = render(
    <TaskMenu
      task={task}
      day="2026-11-05"
      isToday
      actions={['skip', 'pause', 'open']}
      onAction={onAction}
      onDismiss={onDismiss}
    />,
  );

  fireEvent.press(view.getByText('Cancel'));
  // A second tap while the sheet is leaving is swallowed by the same exit.
  fireEvent.press(view.getByText('Cancel'));
  expect(onDismiss).not.toHaveBeenCalled();

  act(() => jest.advanceTimersByTime(1000));
  expect(onDismiss).toHaveBeenCalledTimes(1);
  expect(onAction).not.toHaveBeenCalled();
});

it('each action row reports its own action', () => {
  const onAction = jest.fn();
  const view = render(
    <TaskMenu
      task={task}
      day="2026-11-04"
      isToday={false}
      actions={['skip', 'move', 'open']}
      onAction={onAction}
      onDismiss={() => {}}
    />,
  );
  // On a past day the skip names that day, not today.
  fireEvent.press(view.getByText('Skip this day, on purpose'));
  fireEvent.press(view.getByText('Move'));
  expect(onAction.mock.calls.map((call) => call[0])).toEqual(['skip', 'move']);
});
