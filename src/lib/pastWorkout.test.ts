import { describe, expect, it } from 'vitest';

import { canMoveToDay, shiftToDay, workoutDateLabel, workoutsOnDay } from './pastWorkout';
import { dayKey } from './days';
import type { CompletedWorkout } from './completedWorkout';

/**
 * Finding and moving a past workout (redesign #12, #15). The day picker hands
 * over a day and the store only knows a shift, so the shift has to land the
 * start on that day at the same clock time — across months and across a
 * daylight-saving change — and never into the future.
 */

function workout(id: string, start: Date): CompletedWorkout {
  const startedAt = start.toISOString();
  return {
    id,
    title: 'Pull',
    startedAt,
    endedAt: startedAt,
    durationMinutes: 60,
    setCount: 1,
    totalVolumeKg: 0,
    volumeIsPartial: false,
    exercises: [],
    sets: [],
  };
}

describe('the date well label', () => {
  it('reads weekday, day, short month and year', () => {
    expect(workoutDateLabel(new Date(2026, 9, 27, 18, 5).toISOString())).toBe('Tue 27 Oct 2026');
    expect(workoutDateLabel(new Date(2026, 9, 26, 9).toISOString())).toBe('Mon 26 Oct 2026');
  });

  it('declines the month in Russian', () => {
    expect(workoutDateLabel(new Date(2026, 9, 26, 9).toISOString(), 'ru')).toBe(
      'Пн 26 октября 2026',
    );
  });

  it('is empty for an unreadable instant rather than "Invalid Date"', () => {
    expect(workoutDateLabel('nope')).toBe('');
  });
});

describe('moving to a picked day', () => {
  it('lands on that day at the same clock time', () => {
    const start = new Date(2026, 9, 27, 18, 5);
    const minutes = shiftToDay(start.toISOString(), '2026-10-20');
    expect(minutes).not.toBeNull();
    const moved = new Date(start.getTime() + (minutes ?? 0) * 60_000);
    expect(dayKey(moved)).toBe('2026-10-20');
    expect(moved.getHours()).toBe(18);
    expect(moved.getMinutes()).toBe(5);
  });

  it('crosses a month and a year', () => {
    const start = new Date(2026, 0, 2, 7, 30);
    const minutes = shiftToDay(start.toISOString(), '2025-12-30') ?? 0;
    const moved = new Date(start.getTime() + minutes * 60_000);
    expect(dayKey(moved)).toBe('2025-12-30');
    expect(moved.getHours()).toBe(7);
  });

  it('is zero for the day it is already on', () => {
    const start = new Date(2026, 9, 27, 18, 5);
    expect(shiftToDay(start.toISOString(), '2026-10-27')).toBe(0);
  });

  it('refuses garbage', () => {
    expect(shiftToDay('nope', '2026-10-20')).toBeNull();
    expect(shiftToDay(new Date().toISOString(), '2026-02-31')).toBeNull();
  });
});

describe('Move here', () => {
  const start = new Date(2026, 9, 27, 18, 5).toISOString();

  it('acts on an earlier day', () => {
    expect(canMoveToDay(start, '2026-10-20', '2026-10-30')).toBe(true);
  });

  it('does nothing for the same day', () => {
    expect(canMoveToDay(start, '2026-10-27', '2026-10-30')).toBe(false);
  });

  it('refuses the future, which the store would clamp to now', () => {
    expect(canMoveToDay(start, '2026-10-31', '2026-10-30')).toBe(false);
    expect(canMoveToDay(start, '2026-10-30', '2026-10-30')).toBe(true);
  });
});

describe('a calendar day opens its workouts', () => {
  it('lists the workouts that started that day, earliest first', () => {
    const late = workout('late', new Date(2026, 9, 27, 19));
    const early = workout('early', new Date(2026, 9, 27, 7));
    const other = workout('other', new Date(2026, 9, 26, 7));
    expect(workoutsOnDay([late, other, early], '2026-10-27').map((w) => w.id)).toEqual([
      'early',
      'late',
    ]);
    expect(workoutsOnDay([late, other, early], '2026-10-25')).toEqual([]);
  });
});
