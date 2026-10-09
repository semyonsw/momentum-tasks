import { describe, expect, it } from 'vitest';

import { buildTasksContext } from './ai/aiContext';
import { habitStrength } from './habitStrength';
import { nextUnansweredTask } from './landing';
import { planReminders } from './reminders';
import {
  allExcusedOn,
  dayProgress,
  describeSchedule,
  describeTaskRow,
  longestRunIn,
  streakOf,
  taskMonth,
  tasksMonth,
  weekProgress,
  type Task,
  type TaskLog,
  type TaskMark,
} from './tasks';
import { weeklyReview } from './weeklyReview';
import { yearPixels } from './yearPixels';

/**
 * N times a week (T2): "stretch, three times a week, any days".
 *
 * The task is offered every day and owes nothing to any one of them, so an
 * unanswered day is never a miss. The WEEK is judged — Monday to Sunday — and
 * the streak counts weeks. These pin the week's edges, what doing it a fourth
 * time means (nothing more), excused days shrinking what a week can ask, and
 * that every reader of the log agrees an unanswered day is not a 0.
 */

function task(over: Partial<Task> = {}): Task {
  return {
    id: 'stretch',
    name: 'Stretch',
    schedule: { kind: 'weekly', times: 3 },
    auto: null,
    startedOn: '2026-08-31', // a Monday
    reminder: null,
    archivedAt: null,
    order: 0,
    ...over,
  };
}

function marks(byDay: Record<string, TaskMark>, id = 'stretch'): TaskLog {
  return {
    [id]: Object.fromEntries(Object.entries(byDay).map(([day, mark]) => [day, { mark, note: '' }])),
  };
}

const weekly = task();

describe('the week boundary (Monday-first, ISO)', () => {
  it('runs Monday to Sunday, and a Sunday belongs to the week before it', () => {
    expect(weekProgress(weekly, {}, '2026-09-13')).toMatchObject({
      from: '2026-09-07',
      to: '2026-09-13',
    });
    expect(weekProgress(weekly, {}, '2026-09-14')?.from).toBe('2026-09-14');
  });

  it('counts the days done inside the week only', () => {
    const log = marks({ '2026-09-06': 'done', '2026-09-07': 'done', '2026-09-13': 'done' });
    expect(weekProgress(weekly, log, '2026-09-10')?.done).toBe(2);
  });

  it('crosses the new year in one week', () => {
    const late = task({ startedOn: '2026-12-01' });
    const log = marks({ '2026-12-29': 'done', '2026-12-31': 'done', '2027-01-02': 'done' });
    expect(weekProgress(late, log, '2027-01-03')).toMatchObject({
      from: '2026-12-28',
      to: '2027-01-03',
      done: 3,
      met: true,
    });
  });

  it('is null for every other kind of task', () => {
    expect(weekProgress(task({ schedule: { kind: 'daily' } }), {}, '2026-09-10')).toBeNull();
  });
});

describe('over-completion', () => {
  it('a fourth and fifth time is still one week met, and the count says the truth', () => {
    const log = marks({
      '2026-09-07': 'done',
      '2026-09-08': 'done',
      '2026-09-09': 'done',
      '2026-09-10': 'done',
      '2026-09-11': 'done',
    });
    expect(weekProgress(weekly, log, '2026-09-11')).toMatchObject({
      done: 5,
      needed: 3,
      met: true,
    });
    expect(streakOf(weekly, log, '2026-09-11')).toBe(1);
    expect(describeTaskRow(weekly, log, '2026-09-11', 'en', false)).toBe(
      '5 / 3 this week · 3 × a week',
    );
  });
});

describe('the streak, counted in weeks', () => {
  // Three weeks met: 31 Aug, 7 Sep, 14 Sep.
  const three = marks({
    '2026-08-31': 'done',
    '2026-09-02': 'done',
    '2026-09-04': 'done',
    '2026-09-08': 'done',
    '2026-09-09': 'done',
    '2026-09-13': 'done',
    '2026-09-14': 'done',
    '2026-09-15': 'done',
    '2026-09-20': 'done',
  });

  it('counts each week met, and the current one only once met', () => {
    // Wednesday 23 Sep, nothing yet this week: 3, not broken.
    expect(streakOf(weekly, three, '2026-09-23')).toBe(3);
    const met = {
      stretch: {
        ...three.stretch,
        '2026-09-21': { mark: 'done' as const, note: '' },
        '2026-09-22': { mark: 'done' as const, note: '' },
        '2026-09-23': { mark: 'done' as const, note: '' },
      },
    };
    expect(streakOf(weekly, met, '2026-09-23')).toBe(4);
  });

  it('a past week short of N ends the run — the unanswered days inside a met week never do', () => {
    // The week of 21 Sep is over with nothing in it.
    expect(streakOf(weekly, three, '2026-09-28')).toBe(0);
    const short = { stretch: { ...three.stretch } };
    delete short.stretch['2026-09-04'];
    expect(streakOf(weekly, short, '2026-09-23')).toBe(2);
  });

  it('says weeks on the row', () => {
    expect(describeTaskRow(weekly, three, '2026-09-23')).toBe(
      '0 / 3 this week · 3 × a week · 3 weeks in a row',
    );
    expect(describeTaskRow(weekly, three, '2026-09-23', 'ru')).toBe(
      '0 / 3 на этой неделе · 3 × в неделю · 3 недели подряд',
    );
  });

  it('has no run of days for Wrapped to name', () => {
    expect(longestRunIn(weekly, three, '2026-09-01', '2026-09-30', '2026-10-09')).toBeNull();
  });
});

describe('mixed with excused days', () => {
  it('excused days shrink what the week can ask, never below the days left', () => {
    // Five of seven excused: two days left, so two done meets the week.
    const log = marks({
      '2026-09-07': 'missed',
      '2026-09-08': 'missed',
      '2026-09-09': 'missed',
      '2026-09-10': 'missed',
      '2026-09-11': 'missed',
      '2026-09-12': 'done',
      '2026-09-13': 'done',
    });
    expect(weekProgress(weekly, log, '2026-09-13')).toMatchObject({ needed: 2, met: true });
  });

  it('one excused day leaves N as it was', () => {
    const log = marks({ '2026-09-07': 'missed', '2026-09-08': 'done', '2026-09-09': 'done' });
    expect(weekProgress(weekly, log, '2026-09-13')).toMatchObject({ needed: 3, met: false });
  });

  it('a fully paused week is stepped over, neither counted nor breaking', () => {
    const paused: Record<string, TaskMark> = {};
    for (let d = 7; d <= 13; d += 1) paused[`2026-09-${String(d).padStart(2, '0')}`] = 'missed';
    const log = marks({
      '2026-08-31': 'done',
      '2026-09-01': 'done',
      '2026-09-02': 'done',
      ...paused,
      '2026-09-14': 'done',
      '2026-09-15': 'done',
      '2026-09-16': 'done',
    });
    expect(weekProgress(weekly, log, '2026-09-10')).toMatchObject({ needed: 0, met: false });
    expect(streakOf(weekly, log, '2026-09-17')).toBe(2);
    expect(allExcusedOn([weekly], log, '2026-09-10')).toBe(true);
  });

  it('the first week asks only what the days left in it can give', () => {
    const late = task({ startedOn: '2026-09-12' }); // a Saturday
    const log = marks({ '2026-09-12': 'done', '2026-09-13': 'done' });
    expect(weekProgress(late, log, '2026-09-13')).toMatchObject({ needed: 2, met: true });
    expect(streakOf(late, log, '2026-09-14')).toBe(1);
  });
});

describe('the day, the month and the year never count an unanswered day against it', () => {
  const plain = task({ id: 'read', name: 'Read', schedule: { kind: 'daily' }, order: 1 });
  const log: TaskLog = {
    ...marks({ '2026-09-08': 'done' }),
    ...marks({ '2026-09-08': 'done', '2026-09-09': 'done' }, 'read'),
  };

  it('the day ring counts it only once done', () => {
    expect(dayProgress([weekly, plain], log, '2026-09-09')).toEqual({
      done: 1,
      total: 1,
      fraction: 1,
    });
    expect(dayProgress([weekly, plain], log, '2026-09-08')).toEqual({
      done: 2,
      total: 2,
      fraction: 1,
    });
  });

  it('a day with only a weekly task unanswered is blank, not paused', () => {
    expect(allExcusedOn([weekly], {}, '2026-09-09')).toBe(false);
    const month = tasksMonth([weekly], {}, 2026, 8, '2026-09-30');
    expect(month.paused).toBe(0);
    const cell = month.weeks.flat().find((c) => c.date === '2026-09-09');
    expect(cell).toMatchObject({ isBlank: true, paused: false });
  });

  it('the task’s month draws unanswered days blank and tallies weeks', () => {
    const month = taskMonth(weekly, marks({ '2026-09-08': 'done' }), 2026, 8, '2026-09-10');
    const states = Object.fromEntries(
      month.weeks
        .flat()
        .filter((c) => c.date)
        .map((c) => [c.date, c.state]),
    );
    expect(states['2026-09-07']).toBe('blank');
    expect(states['2026-09-08']).toBe('done');
    expect(month.done).toBe(1);
    expect(month.asked).toBe(1);
    // Weeks whose Thursday is in September and are judged: 31 Aug (Thu 3 Sep) is
    // over and short; the current week is still being lived.
    expect(month.weekTally).toEqual({ met: 0, of: 1 });
  });

  it('the year draws an unanswered day blank, for the task and for the whole list', () => {
    const year = yearPixels([weekly], marks({ '2026-09-08': 'done' }), 2026, '2026-09-30');
    expect(year.months[8].cells[7].kind).toBe('score');
    expect(year.months[8].cells[8].kind).toBe('blank');
    const one = yearPixels([weekly], {}, 2026, '2026-09-30', 'stretch');
    expect(one.months[8].cells[8].kind).toBe('blank');
  });

  it('the weekly review never names it as the task that slipped', () => {
    const review = weeklyReview({
      today: '2026-09-17',
      workouts: [],
      tasks: [weekly, plain],
      log: marks({ '2026-09-08': 'done' }, 'read'),
      amounts: [],
      categories: [],
    });
    // Stretch is first in the list and was left seven days; Read six. Read slipped.
    expect(review?.tasks?.slipped?.name).toBe('Read');
  });
});

describe('habit strength, stepped by the week', () => {
  const today = '2026-10-26'; // a Monday
  function weeksOf(daysDone: number[][]): TaskLog {
    // daysDone[w] = weekday offsets done in week w from 31 Aug.
    const byDay: Record<string, TaskMark> = {};
    daysDone.forEach((offsets, w) =>
      offsets.forEach((o) => {
        const d = new Date(2026, 7, 31 + w * 7 + o);
        byDay[
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        ] = 'done';
      }),
    );
    return marks(byDay);
  }

  it('rises with weeks met, and does not decay on the days in between', () => {
    const met = weeksOf([
      [0, 2, 4],
      [0, 2, 4],
      [0, 2, 4],
      [0, 2, 4],
      [0, 2, 4],
      [0, 2, 4],
      [0, 2, 4],
      [0, 2, 4],
    ]);
    const s = habitStrength(weekly, met, today)!;
    expect(s).toBeGreaterThan(70);
    // The Tuesday after: nothing done yet this week, nothing lost.
    expect(habitStrength(weekly, met, '2026-10-27')).toBeCloseTo(s);
  });

  it('a week of 2 of 3 is partial credit, between a met week and an empty one', () => {
    const base = [
      [0, 2, 4],
      [0, 2, 4],
      [0, 2, 4],
      [0, 2, 4],
      [0, 2, 4],
      [0, 2, 4],
      [0, 2, 4],
    ];
    const full = habitStrength(weekly, weeksOf([...base, [0, 2, 4]]), today)!;
    const two = habitStrength(weekly, weeksOf([...base, [0, 2]]), today)!;
    const none = habitStrength(weekly, weeksOf([...base, []]), today)!;
    expect(two).toBeLessThan(full);
    expect(two).toBeGreaterThan(none);
  });

  it('a paused week is neutral', () => {
    const base = [
      [0, 2, 4],
      [0, 2, 4],
      [0, 2, 4],
      [0, 2, 4],
      [0, 2, 4],
      [0, 2, 4],
      [0, 2, 4],
    ];
    const log = weeksOf(base);
    const before = habitStrength(weekly, log, '2026-10-19')!;
    const paused: TaskLog = { stretch: { ...log.stretch } };
    for (let d = 19; d <= 25; d += 1) paused.stretch[`2026-10-${d}`] = { mark: 'missed', note: '' };
    expect(habitStrength(weekly, paused, today)).toBeCloseTo(before);
  });

  it('keeps the calendar half-life of three times a week (about 20 days)', () => {
    const met = weeksOf(Array.from({ length: 8 }, () => [0, 2, 4]));
    const high = habitStrength(weekly, met, today)!;
    // Three empty weeks later (21 days): roughly half.
    const later = habitStrength(weekly, met, '2026-11-16')!;
    expect(later / high).toBeGreaterThan(0.4);
    expect(later / high).toBeLessThan(0.6);
  });
});

describe('the rest of the app', () => {
  it('describes the schedule', () => {
    expect(describeSchedule({ kind: 'weekly', times: 3 })).toBe('3 × a week');
    expect(describeSchedule({ kind: 'weekly', times: 3 }, 'ru')).toBe('3 × в неделю');
  });

  it('the landing chip skips it once the week is met', () => {
    const log = marks({ '2026-09-07': 'done', '2026-09-08': 'done', '2026-09-09': 'done' });
    expect(nextUnansweredTask([weekly], log, '2026-09-10', { autoTick: true })).toBeNull();
    expect(nextUnansweredTask([weekly], {}, '2026-09-10', { autoTick: true })?.id).toBe('stretch');
  });

  it('reminds daily, and the follow-ups stop once the week is met', () => {
    const reminded = task({ reminder: { hour: 20, minute: 0, every: 60 } });
    const now = new Date(2026, 8, 10, 8, 0);
    const open = planReminders({
      tasks: [reminded],
      workout: { enabled: false, days: [], time: '18:00' },
      lang: 'en',
      now,
    });
    expect(open.find((r) => r.id === 'task:stretch:daily')?.trigger).toEqual({
      kind: 'daily',
      hour: 20,
      minute: 0,
    });
    expect(open.some((r) => r.id.startsWith('task:stretch:2026-09-10:again'))).toBe(true);
    const met = planReminders({
      tasks: [reminded],
      workout: { enabled: false, days: [], time: '18:00' },
      lang: 'en',
      now,
      log: marks({ '2026-09-07': 'done', '2026-09-08': 'done', '2026-09-09': 'done' }),
    });
    expect(met.some((r) => r.id.includes(':again'))).toBe(false);
  });

  it('tells the assistant it is judged by the week', () => {
    const json = JSON.parse(
      buildTasksContext({
        tasks: [weekly],
        log: marks({
          '2026-08-31': 'done',
          '2026-09-01': 'done',
          '2026-09-02': 'done',
          '2026-09-08': 'done',
        }),
        today: '2026-09-17',
        lang: 'en',
      }).json,
    );
    expect(json.weeklyNote).toContain('week');
    expect(json.tasks[0]).toMatchObject({
      schedule: '3x a week, any days',
      missed: 0,
      weeksMet: 1,
      weeksShort: 1,
      streakUnit: 'weeks',
      thisWeek: '0/3',
    });
  });
});
