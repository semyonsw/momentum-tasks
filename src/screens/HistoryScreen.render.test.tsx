import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { cleanup, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { HistoryScreen } from './HistoryScreen';
import { useSettings } from '../state/settingsStore';
import { workoutNumbers, type CompletedWorkout } from '../lib/completedWorkout';

/**
 * SMOKE: the year's count beside the lifetime number, on the real History rows.
 *
 * `yearNumbers` is proven pure in `completedWorkout.test.ts`; this proves the
 * screen asks for it — that the first workout of 2027 reads `'27 #1` under its
 * lifetime number, and that a session kept out of the count shows no number and
 * offers no way to give it one.
 */

const METRICS = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function workout(id: string, title: string, local: Date, unnumbered = false): CompletedWorkout {
  const iso = local.toISOString();
  return {
    id,
    title,
    startedAt: iso,
    endedAt: iso,
    durationMinutes: 60,
    setCount: 0,
    totalVolumeKg: 0,
    volumeIsPartial: false,
    ...(unnumbered ? { unnumbered: true } : {}),
    exercises: [],
    sets: [],
  };
}

/* Fake clocks, as the other render suites: the title marquee and the row
   animations schedule timers that would otherwise keep jest alive at the end. */
beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
});

const workouts = [
  workout('jan', 'New year pull', new Date(2027, 0, 2, 18)),
  workout('dec', 'Last push', new Date(2026, 11, 30, 18)),
  workout('old', 'Pull notebook', new Date(2024, 8, 3, 6), true),
];

function renderHistory() {
  // The suite's default language is Russian; the assertions below read English.
  useSettings.setState({ language: 'en' });
  const numbers = workoutNumbers(workouts, { workoutId: 'dec', number: 160 });
  const noop = jest.fn();
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <HistoryScreen
        workouts={workouts}
        numbers={numbers}
        exercisesById={{}}
        unitSystem="metric"
        onDelete={noop}
        onEditSet={noop}
        onDeleteSet={() => true}
        onEditWorkout={noop}
        onAddSet={noop}
        onRemoveExercise={() => true}
        onSetNumber={noop}
      />
    </SafeAreaProvider>,
  );
}

it('prints the year count under the lifetime number, restarting in January', () => {
  const screen = renderHistory();
  expect(screen.getByText('#161')).toBeTruthy();
  expect(screen.getByText("'27 #1")).toBeTruthy();
  expect(screen.getByText('#160')).toBeTruthy();
  expect(screen.getByText("'26 #160")).toBeTruthy();
});

it('gives a workout kept out of the count no number and no renumber row', () => {
  const screen = renderHistory();
  expect(screen.queryByText(/'24/)).toBeNull();
  fireEvent.press(screen.getAllByLabelText(/Pull notebook/)[0]);
  // Opened — its delete action is showing — and still no number row.
  expect(screen.getByLabelText('Delete the Pull notebook workout')).toBeTruthy();
  expect(screen.queryByLabelText('Set this workout’s number')).toBeNull();
  expect(screen.queryByText('Set the workout number')).toBeNull();
  // ...while a counted workout, opened, still has its number row.
  fireEvent.press(screen.getAllByLabelText(/New year pull/)[0]);
  expect(screen.getByText('Workout number: 161 · 1 in 2027')).toBeTruthy();
});
