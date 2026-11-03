import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FocusMode } from './FocusMode';
import { useActiveWorkout } from '../state/activeWorkoutStore';
import { useLibrary } from '../state/libraryStore';
import { useSettings } from '../state/settingsStore';
import { focusPlan } from '../lib/focusPlan';
import { seedRoutines, seedUser } from '../data/seed';
import type { Exercise, ID } from '../types/models';

/**
 * SMOKE: focus mode on a real session in the real store, driven by taps.
 *
 * The pure suites prove each decision; this proves they are wired — that a
 * burst of ± on the screen reaches the store tap for tap through 9 → 10, and
 * that DONE logs exactly one set however fast it is hit.
 */

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
  deactivateKeepAwake: jest.fn(() => Promise.resolve()),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function openFirstRoutine() {
  useActiveWorkout.getState().startSession({
    routine: seedRoutines[0],
    exercisesById: Object.fromEntries(
      useLibrary.getState().exercises.map((e) => [e.id, e]),
    ) as Record<ID, Exercise>,
    historyByExerciseId: {},
    policy: seedUser.overloadPolicy,
    unitSystem: 'metric',
    defaultRestSeconds: 120,
    defaultTransitionRestSeconds: 150,
  });
  useActiveWorkout.getState().startWorkout();
}

const current = () => focusPlan(useActiveWorkout.getState().session).current!;
const loggedCount = () =>
  useActiveWorkout
    .getState()
    .session!.entries.flatMap((e) => e.sets)
    .filter((s) => s.isCompleted).length;

function renderFocus() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <FocusMode unitSystem="metric" elapsedMinutes={0} onClose={jest.fn()} onFinish={jest.fn()} />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  useActiveWorkout.getState().discardSession();
  useLibrary.getState().restoreSeedLibrary();
  useSettings.getState().resetToDefaults();
  useSettings.setState({ language: 'en' });
  openFirstRoutine();
});
afterEach(() => {
  act(() => jest.runOnlyPendingTimers());
  jest.useRealTimers();
});

it('five fast + taps on the count go 8 → 13 in the store, through 9 → 10', () => {
  const target = current();
  expect(target.entry.exercise.countUnit).toBe('reps');
  useActiveWorkout.getState().patchSet(target.entryId, target.setId, { count: 8 });

  const view = renderFocus();
  const plus = view.getByLabelText('+1 reps');
  for (let i = 0; i < 5; i++) fireEvent.press(plus);

  expect(current().set.count).toBe(13);
  // and the rolling numeral on screen says so
  expect(view.getAllByLabelText('13').length).toBeGreaterThan(0);
});

it('fast weight taps all land, both directions', () => {
  const target = current();
  if (!target.entry.exercise.requiresWeight) return;
  useActiveWorkout.getState().patchSet(target.entryId, target.setId, { weightKg: 40 });

  const view = renderFocus();
  const plus = view.getAllByLabelText(/^\+\d+(\.\d+)? kg$/)[0];
  const minus = view.getAllByLabelText(/^−\d+(\.\d+)? kg$|^-\d+(\.\d+)? kg$/)[0];
  for (let i = 0; i < 3; i++) fireEvent.press(plus);
  fireEvent.press(minus);
  const step = Number(plus.props.accessibilityLabel.replace(/[^\d.]/g, ''));
  expect(current().set.weightKg).toBe(40 + 2 * step);
});

it('a double-tap on DONE logs one set', () => {
  const view = renderFocus();
  const done = view.getByLabelText('done');
  fireEvent.press(done);
  fireEvent.press(done);
  act(() => jest.advanceTimersByTime(1000));
  expect(loggedCount()).toBe(1);
});
