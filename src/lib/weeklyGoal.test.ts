import { describe, expect, it } from 'vitest';

import type { CompletedWorkout } from './completedWorkout';
import {
  describeWeekGoal,
  isWeekExcused,
  setWeekExcused,
  stepWeeklyGoal,
  usableExcusedWeeks,
  usableWeeklyGoal,
  weekGoalStatus,
  weeklyGoalOf,
  workoutsInWeek,
} from './weeklyGoal';

/**
 * The weekly training goal (W8). What matters: the week is Monday to Sunday in
 * local days and survives New Year as one week; an excused week reads excused,
 * never as a miss; and the goal is 1–7 and three when unset.
 */

/** A local wall-clock time as ISO, so `dayKey` lands on the same day in every TZ. */
const at = (day: string, hour = 18) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, hour).toISOString();
};

let seq = 0;
function workout(day: string, hour = 18): CompletedWorkout {
  seq += 1;
  return {
    id: `w${seq}`,
    title: 'Push',
    startedAt: at(day, hour),
    endedAt: at(day, hour),
    durationMinutes: 60,
    setCount: 0,
    totalVolumeKg: 0,
    volumeIsPartial: false,
    exercises: [],
    sets: [],
  };
}

describe('ISO weeks, Monday to Sunday', () => {
  // Mon 5 Oct – Sun 11 Oct 2026.
  const log = [
    workout('2026-10-04'), // Sunday before — last week
    workout('2026-10-05', 7), // Monday morning
    workout('2026-10-08'),
    workout('2026-10-11', 23), // Sunday late — still this week
    workout('2026-10-12', 6), // next Monday
  ];

  it('counts Monday through Sunday, and Sunday belongs to the week that started Monday', () => {
    expect(workoutsInWeek(log, '2026-10-05')).toBe(3);
    expect(workoutsInWeek(log, '2026-10-11')).toBe(3);
    expect(workoutsInWeek(log, '2026-10-04')).toBe(1);
    expect(workoutsInWeek(log, '2026-10-12')).toBe(1);
  });

  it('counts workouts, not days — two on one day are two', () => {
    expect(
      workoutsInWeek([workout('2026-10-06', 7), workout('2026-10-06', 19)], '2026-10-06'),
    ).toBe(2);
  });

  it('keeps the week of 28 Dec 2026 – 3 Jan 2027 as one week across New Year', () => {
    const newYear = [
      workout('2026-12-27'), // Sunday before
      workout('2026-12-28'),
      workout('2026-12-31'),
      workout('2027-01-01'),
      workout('2027-01-03'),
      workout('2027-01-04'), // Monday after
    ];
    for (const day of ['2026-12-28', '2026-12-31', '2027-01-01', '2027-01-03']) {
      const status = weekGoalStatus({ workouts: newYear, day, goal: 3, excusedWeeks: undefined });
      expect(status.from).toBe('2026-12-28');
      expect(status.to).toBe('2027-01-03');
      expect(status.done).toBe(4);
    }
    expect(workoutsInWeek(newYear, '2027-01-04')).toBe(1);
  });
});

describe('the status of a week', () => {
  const log = [workout('2026-10-05'), workout('2026-10-07')];

  it('is a fraction of the goal, short of it without being a miss', () => {
    const status = weekGoalStatus({ workouts: log, day: '2026-10-09', goal: 3, excusedWeeks: [] });
    expect(status).toMatchObject({ done: 2, goal: 3, met: false, excused: false });
    expect(status.fraction).toBeCloseTo(2 / 3);
  });

  it('caps the ring at full when the goal is passed', () => {
    const status = weekGoalStatus({ workouts: log, day: '2026-10-09', goal: 1, excusedWeeks: [] });
    expect(status.fraction).toBe(1);
    expect(status.met).toBe(true);
  });

  it('reads three when no goal was ever set', () => {
    const status = weekGoalStatus({
      workouts: [],
      day: '2026-10-09',
      goal: undefined,
      excusedWeeks: undefined,
    });
    expect(status.goal).toBe(3);
    expect(status.fraction).toBe(0);
  });

  it('reads excused for an excused week, and still counts what was done in it', () => {
    const status = weekGoalStatus({
      workouts: log,
      day: '2026-10-09',
      goal: 3,
      excusedWeeks: ['2026-10-05'],
    });
    expect(status.excused).toBe(true);
    expect(status.done).toBe(2);
  });
});

describe('the sentence', () => {
  const base = {
    from: '2026-10-05',
    to: '2026-10-11',
    fraction: 2 / 3,
    met: false,
    excused: false,
  };

  it('says "2 of 3 workouts this week" in both languages', () => {
    const status = { ...base, done: 2, goal: 3 };
    expect(describeWeekGoal(status, 'en')).toBe('2 of 3 workouts this week');
    expect(describeWeekGoal(status, 'ru')).toBe('2 из 3 тренировок на этой неделе');
  });

  it('takes the goal’s plural', () => {
    const status = { ...base, done: 0, goal: 1, fraction: 0 };
    expect(describeWeekGoal(status, 'en')).toBe('0 of 1 workout this week');
    expect(describeWeekGoal(status, 'ru')).toBe('0 из 1 тренировки на этой неделе');
  });

  it('says excused for an excused week, never a miss', () => {
    const status = { ...base, done: 1, goal: 3, excused: true };
    expect(describeWeekGoal(status, 'en')).toBe('1 of 3 workouts this week · excused');
    expect(describeWeekGoal(status, 'ru')).toBe('1 из 3 тренировок на этой неделе · не в счёт');
  });
});

describe('the goal sanitizer', () => {
  it('keeps a whole number in 1–7', () => {
    expect(usableWeeklyGoal(4)).toBe(4);
    expect(usableWeeklyGoal(1)).toBe(1);
    expect(usableWeeklyGoal(7)).toBe(7);
  });

  it('clamps and rounds', () => {
    expect(usableWeeklyGoal(0)).toBe(1);
    expect(usableWeeklyGoal(-3)).toBe(1);
    expect(usableWeeklyGoal(12)).toBe(7);
    expect(usableWeeklyGoal(2.6)).toBe(3);
  });

  it('treats anything that is not a finite number as never set', () => {
    for (const junk of [undefined, null, NaN, Infinity, '3', {}, []]) {
      expect(usableWeeklyGoal(junk)).toBeUndefined();
    }
    expect(weeklyGoalOf(undefined)).toBe(3);
    expect(weeklyGoalOf(NaN)).toBe(3);
  });

  it('steps by one and stops at the ends', () => {
    expect(stepWeeklyGoal(undefined, 1)).toBe(4);
    expect(stepWeeklyGoal(undefined, -1)).toBe(2);
    expect(stepWeeklyGoal(7, 1)).toBe(7);
    expect(stepWeeklyGoal(1, -1)).toBe(1);
  });
});

describe('excusing a week', () => {
  const TODAY = '2026-10-08'; // Thursday, week of 5 Oct

  it('excuses the week a day falls in, by its Monday', () => {
    expect(setWeekExcused(undefined, TODAY, true, TODAY)).toEqual(['2026-10-05']);
    expect(setWeekExcused(undefined, '2026-10-04', true, TODAY)).toEqual(['2026-09-28']);
  });

  it('un-excuses, and an emptied list goes absent', () => {
    expect(setWeekExcused(['2026-10-05'], '2026-10-11', false, TODAY)).toBeUndefined();
    expect(setWeekExcused(['2026-09-28', '2026-10-05'], TODAY, false, TODAY)).toEqual([
      '2026-09-28',
    ]);
  });

  it('does not excuse a week that has not started', () => {
    expect(setWeekExcused(['2026-09-28'], '2026-10-12', true, TODAY)).toEqual(['2026-09-28']);
  });

  it('excusing twice keeps one entry', () => {
    const once = setWeekExcused(undefined, TODAY, true, TODAY);
    expect(setWeekExcused(once, '2026-10-06', true, TODAY)).toEqual(['2026-10-05']);
  });

  it('knows an excused week from any of its days', () => {
    expect(isWeekExcused(['2026-12-28'], '2027-01-03')).toBe(true);
    expect(isWeekExcused(['2026-12-28'], '2027-01-04')).toBe(false);
    expect(isWeekExcused(undefined, TODAY)).toBe(false);
  });

  it('sanitizes the list: real Mondays, once each, sorted; absent when empty', () => {
    expect(
      usableExcusedWeeks(['2026-10-05', '2026-09-28', '2026-10-05', '2026-10-06', 'x', 5]),
    ).toEqual(['2026-09-28', '2026-10-05']);
    expect(usableExcusedWeeks([])).toBeUndefined();
    expect(usableExcusedWeeks('2026-10-05')).toBeUndefined();
    expect(usableExcusedWeeks(undefined)).toBeUndefined();
  });
});
