import { describe, expect, it } from 'vitest';

import {
  achievements,
  badgeDomain,
  BADGES,
  describeBadgeProgress,
  describeEarned,
  describeGallery,
  FULL_WEEK_DAYS,
  logFacts,
  type FactPoint,
  type LogFacts,
  type LogsInput,
} from './achievements';
import type { CompletedWorkout } from './completedWorkout';
import { shiftDay } from './days';
import { t, translatedKeys } from './i18n';
import type { Amount, MoneyAccount } from './money';
import type { Task, TaskLog } from './tasks';
import type { SetHistory } from '../types/models';

/**
 * Achievements (E1). Three things matter: every threshold sits exactly where it
 * says (99 is not 100), the same logs always give the same badges with the same
 * earned dates (they are the LOG's dates, never the clock's), and a day excused
 * on purpose earns nothing.
 */

const TODAY = '2026-10-09';

const at = (day: string, hour = 18) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, hour).toISOString();
};

let seq = 0;
function workout(day: string, over: Partial<CompletedWorkout> = {}): CompletedWorkout {
  seq += 1;
  return {
    id: `w${seq}`,
    title: 'Push',
    startedAt: at(day),
    endedAt: at(day, 19),
    durationMinutes: 60,
    setCount: 10,
    totalVolumeKg: 500,
    volumeIsPartial: false,
    exercises: [],
    sets: [],
    ...over,
  };
}

function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    name: id,
    schedule: { kind: 'daily' },
    auto: null,
    startedOn: '2026-01-01',
    reminder: null,
    archivedAt: null,
    order: 0,
    ...over,
  };
}

function amount(day: string, value = 1000, over: Partial<Amount> = {}): Amount {
  seq += 1;
  return {
    id: `a${seq}`,
    categoryId: 'food',
    accountId: 'cash',
    direction: 'expense',
    value,
    when: { kind: 'day', date: day },
    note: '',
    createdAt: `${day}T10:00:00.000Z`,
    ...over,
  };
}

const EMPTY: LogsInput = { today: TODAY, workouts: [], tasks: [], log: {}, amounts: [] };

/** `n` consecutive days ending on `last`, oldest first. */
function daysTo(last: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => shiftDay(last, i - n + 1));
}

function marks(
  days: readonly string[],
  mark: 'done' | 'missed',
): Record<string, { mark: 'done' | 'missed'; note: string }> {
  return Object.fromEntries(days.map((day) => [day, { mark, note: '' }]));
}

const badge = (input: LogsInput, id: string) => {
  const found = achievements(logFacts(input)).find((row) => row.id === id);
  if (!found) throw new Error(`no badge ${id}`);
  return found;
};

const emptyFacts = (): LogFacts => logFacts(EMPTY);

describe('the badge list', () => {
  it('has about thirty badges, with unique ids, across all three logs', () => {
    expect(BADGES.length).toBeGreaterThanOrEqual(28);
    expect(BADGES.length).toBeLessThanOrEqual(36);
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
    for (const domain of ['workout', 'tasks', 'money'] as const) {
      expect(BADGES.some((b) => b.domain === domain)).toBe(true);
    }
  });

  it('every title and description is in Russian too', () => {
    const keys = new Set(translatedKeys());
    for (const def of BADGES) {
      expect(keys.has(def.title), def.title).toBe(true);
      expect(keys.has(def.what), def.what).toBe(true);
    }
  });

  it('nothing is earned on an empty phone, and nothing reads below zero', () => {
    const badges = achievements(emptyFacts());
    expect(badges.every((b) => b.earnedOn === null && b.have === 0 && b.fraction === 0)).toBe(true);
    expect(describeGallery(badges, 'en')).toBe(`0 of ${BADGES.length} earned.`);
  });
});

describe('each badge sits exactly on its threshold', () => {
  /** A series that reaches `total` one step short of, or exactly on, the need. */
  function seriesTo(total: number, measure: 'sum' | 'max'): FactPoint[] {
    if (measure === 'max') return [{ day: '2026-03-01', value: total }];
    // Whole units summing to `total`, the last landing on 2026-03-02.
    const points: FactPoint[] = [];
    let left = total;
    const step = Math.max(1, Math.ceil(total / 50));
    while (left > 0) {
      const v = Math.min(step, left);
      left -= v;
      points.push({ day: left === 0 ? '2026-03-02' : '2026-03-01', value: v });
    }
    return points;
  }

  for (const def of BADGES) {
    it(`${def.id}: ${def.need - 1} is locked, ${def.need} is earned`, () => {
      const below = { ...emptyFacts(), [def.series]: seriesTo(def.need - 1, def.measure) };
      const on = { ...emptyFacts(), [def.series]: seriesTo(def.need, def.measure) };
      const locked = achievements(below).find((b) => b.id === def.id)!;
      const earned = achievements(on).find((b) => b.id === def.id)!;
      expect(locked.earnedOn).toBeNull();
      expect(locked.fraction).toBeLessThan(1);
      expect(earned.earnedOn).toBe(def.measure === 'max' ? '2026-03-01' : '2026-03-02');
      expect(earned.fraction).toBe(1);
      expect(earned.have).toBe(def.need);
    });
  }
});

describe('from the logs: workouts', () => {
  it('99 workouts is not "100 workouts"; the hundredth is, on its own day', () => {
    const days = daysTo('2026-10-01', 100);
    const ninetyNine = days.slice(0, 99).map((d) => workout(d));
    expect(badge({ ...EMPTY, workouts: ninetyNine }, 'workouts100').earnedOn).toBeNull();
    expect(
      describeBadgeProgress(badge({ ...EMPTY, workouts: ninetyNine }, 'workouts100'), 'en'),
    ).toBe('99 / 100 workouts');
    const hundred = days.map((d) => workout(d));
    expect(badge({ ...EMPTY, workouts: hundred }, 'workouts100').earnedOn).toBe('2026-10-01');
  });

  it('1 tonne in a session needs one session at 1,000 kg, not two of 500', () => {
    const two = [
      workout('2026-09-01', { totalVolumeKg: 999 }),
      workout('2026-09-02', { totalVolumeKg: 500 }),
    ];
    expect(badge({ ...EMPTY, workouts: two }, 'session1t').earnedOn).toBeNull();
    expect(describeBadgeProgress(badge({ ...EMPTY, workouts: two }, 'session1t'), 'en')).toBe(
      '0.9 / 1 t',
    );
    const one = [...two, workout('2026-09-03', { totalVolumeKg: 1000 })];
    expect(badge({ ...EMPTY, workouts: one }, 'session1t').earnedOn).toBe('2026-09-03');
  });

  it('tonnage adds up across sessions, earned the day it crossed', () => {
    const list = daysTo('2026-09-20', 20).map((d) => workout(d, { totalVolumeKg: 500 }));
    // 20 × 500 = 10 000 kg: the 20th session crosses 10 t.
    expect(badge({ ...EMPTY, workouts: list.slice(0, 19) }, 'tonnage10').earnedOn).toBeNull();
    expect(badge({ ...EMPTY, workouts: list }, 'tonnage10').earnedOn).toBe('2026-09-20');
  });

  it('1,000 working sets counts the stored working sets', () => {
    const list = daysTo('2026-09-30', 100).map((d) => workout(d, { setCount: 10 }));
    expect(badge({ ...EMPTY, workouts: list }, 'sets1000').earnedOn).toBe('2026-09-30');
    list[0] = { ...list[0], setCount: 9 };
    expect(badge({ ...EMPTY, workouts: list }, 'sets1000').earnedOn).toBeNull();
  });

  it('a workout dated after today counts for nothing yet', () => {
    expect(badge({ ...EMPTY, workouts: [workout('2026-10-10')] }, 'workouts1').earnedOn).toBeNull();
  });

  describe('records, by the Finish sheet’s rules', () => {
    const set = (sessionId: string, day: string, weightKg: number, count = 5): SetHistory => ({
      id: `${sessionId}-${weightKg}-${count}`,
      sessionId,
      exerciseId: 'bench',
      performedAt: at(day, 10),
      setIndex: 0,
      weightKg,
      count,
      countUnit: 'reps',
      loadMode: 'external',
      isWarmup: false,
      isCompleted: true,
    });
    const session = (id: string, day: string, rows: SetHistory[]) =>
      workout(day, { id, sets: rows });

    it('a first-ever session is not a record', () => {
      const first = session('s1', '2026-09-01', [set('s1', '2026-09-01', 80)]);
      expect(badge({ ...EMPTY, workouts: [first] }, 'records1').earnedOn).toBeNull();
    });

    it('beating the bar is; equalling it is not', () => {
      const first = session('s1', '2026-09-01', [set('s1', '2026-09-01', 80)]);
      const same = session('s2', '2026-09-03', [set('s2', '2026-09-03', 80)]);
      expect(badge({ ...EMPTY, workouts: [same, first] }, 'records1').earnedOn).toBeNull();
      const more = session('s3', '2026-09-05', [set('s3', '2026-09-05', 82.5)]);
      expect(badge({ ...EMPTY, workouts: [more, same, first] }, 'records1').earnedOn).toBe(
        '2026-09-05',
      );
    });
  });
});

describe('from the logs: tasks', () => {
  it('a 30-day streak needs 30 done days; an excused day is stepped over, not counted', () => {
    const done = daysTo('2026-09-30', 29);
    const reading = task('read');
    const log29: TaskLog = { read: marks(done, 'done') };
    expect(badge({ ...EMPTY, tasks: [reading], log: log29 }, 'run30').earnedOn).toBeNull();
    expect(
      describeBadgeProgress(badge({ ...EMPTY, tasks: [reading], log: log29 }, 'run30'), 'en'),
    ).toBe('29 / 30 days');

    // An excused day in the middle and one more done day after it: 30 done, run kept.
    const log: TaskLog = {
      read: {
        ...marks(daysTo('2026-09-30', 29), 'done'),
        ...marks(['2026-10-01'], 'missed'),
        ...marks(['2026-10-02'], 'done'),
      },
    };
    expect(badge({ ...EMPTY, tasks: [reading], log }, 'run30').earnedOn).toBe('2026-10-02');
  });

  it('an unanswered past day ends a run', () => {
    const reading = task('read');
    const log: TaskLog = {
      read: {
        ...marks(daysTo('2026-09-14', 15), 'done'),
        ...marks(daysTo('2026-09-30', 15), 'done'),
      },
    };
    // 15 + (gap on the 15th) + 15: never 30 in a row.
    expect(badge({ ...EMPTY, tasks: [reading], log }, 'run30').earnedOn).toBeNull();
    expect(badge({ ...EMPTY, tasks: [reading], log }, 'run7').earnedOn).toBe('2026-09-06');
  });

  it('no badge comes from excused days', () => {
    const reading = task('read', { startedOn: '2026-01-01' });
    const log: TaskLog = { read: marks(daysTo('2026-10-08', 200), 'missed') };
    const badges = achievements(logFacts({ ...EMPTY, tasks: [reading], log }));
    for (const b of badges.filter((row) => row.domain === 'tasks')) {
      expect(b.earnedOn, b.id).toBeNull();
      expect(b.have, b.id).toBe(0);
    }
  });

  it('100 tasks done counts done marks on asked days only, up to today', () => {
    const weekdays = task('gym', { schedule: { kind: 'weekdays', days: [0, 1, 2, 3, 4] } });
    // 140 calendar days of done marks, weekends included: only weekdays count.
    const log: TaskLog = { gym: marks(daysTo('2026-10-08', 140), 'done') };
    const facts = logFacts({ ...EMPTY, tasks: [weekdays], log });
    expect(facts.tasksDone.length).toBe(100);
    expect(badge({ ...EMPTY, tasks: [weekdays], log }, 'tasks100').earnedOn).toBe('2026-10-08');
    // A mark tomorrow is not counted.
    const ahead: TaskLog = { gym: { ...log.gym, ...marks(['2026-10-12'], 'done') } };
    expect(logFacts({ ...EMPTY, tasks: [weekdays], log: ahead }).tasksDone.length).toBe(100);
  });

  describe('a full week', () => {
    // Mon 28 Sep – Sun 4 Oct 2026.
    const week = daysTo('2026-10-04', 7);
    const a = task('a', { startedOn: '2026-09-28' });
    const b = task('b', { startedOn: '2026-09-28' });

    it('every task, every day of a finished week', () => {
      const log: TaskLog = { a: marks(week, 'done'), b: marks(week, 'done') };
      expect(badge({ ...EMPTY, tasks: [a, b], log }, 'fullWeek').earnedOn).toBe('2026-10-04');
    });

    it('one task short on one day is not a full week', () => {
      const log: TaskLog = { a: marks(week, 'done'), b: marks(week.slice(1), 'done') };
      expect(badge({ ...EMPTY, tasks: [a, b], log }, 'fullWeek').earnedOn).toBeNull();
    });

    it('a paused day does not count: a week with a fully excused day earns nothing', () => {
      const log: TaskLog = {
        a: { ...marks(week.slice(0, 6), 'done'), ...marks([week[6]], 'missed') },
        b: { ...marks(week.slice(0, 6), 'done'), ...marks([week[6]], 'missed') },
      };
      expect(badge({ ...EMPTY, tasks: [a, b], log }, 'fullWeek').earnedOn).toBeNull();
    });

    it(`a weekday list needs its ${FULL_WEEK_DAYS} days, and the weekend asks nothing`, () => {
      const weekdays = task('w', {
        startedOn: '2026-09-28',
        schedule: { kind: 'weekdays', days: [0, 1, 2, 3, 4] },
      });
      const log: TaskLog = { w: marks(week.slice(0, 5), 'done') };
      expect(badge({ ...EMPTY, tasks: [weekdays], log }, 'fullWeek').earnedOn).toBe('2026-10-04');
    });

    it('the week still running is not a full week yet', () => {
      // Mon 5 – Fri 9 Oct, today is Friday.
      const now = daysTo(TODAY, 5);
      const c = task('c', { startedOn: '2026-10-05' });
      const log: TaskLog = { c: marks(now, 'done') };
      expect(badge({ ...EMPTY, tasks: [c], log }, 'fullWeek').earnedOn).toBeNull();
    });
  });
});

describe('from the logs: money', () => {
  it('transfers are a move, not a record', () => {
    const halves = [
      amount('2026-09-01', 500, { categoryId: 'transfer_out', transferId: 't1' }),
      amount('2026-09-01', 500, {
        categoryId: 'transfer_in',
        direction: 'income',
        transferId: 't1',
      }),
    ];
    expect(badge({ ...EMPTY, amounts: halves }, 'amounts1').earnedOn).toBeNull();
    expect(badge({ ...EMPTY, amounts: halves }, 'logging30').have).toBe(0);
  });

  it('30 days of logging is 30 different days with spending, not 30 amounts', () => {
    const sameDay = Array.from({ length: 40 }, () => amount('2026-09-01'));
    expect(badge({ ...EMPTY, amounts: sameDay }, 'logging30').have).toBe(1);
    const thirty = daysTo('2026-09-30', 30).map((d) => amount(d));
    expect(badge({ ...EMPTY, amounts: thirty.slice(1) }, 'logging30').earnedOn).toBeNull();
    expect(badge({ ...EMPTY, amounts: thirty }, 'logging30').earnedOn).toBe('2026-09-30');
  });

  describe('budget kept', () => {
    const budgets = [{ categoryId: 'food', monthly: 10_000 }];

    it('a complete month inside the budget, on its last day', () => {
      const amounts = [amount('2026-08-10', 10_000)];
      expect(badge({ ...EMPTY, amounts, budgets }, 'budget1').earnedOn).toBe('2026-08-31');
    });

    it('one unit over is not kept', () => {
      const amounts = [amount('2026-08-10', 10_001)];
      expect(badge({ ...EMPTY, amounts, budgets }, 'budget1').earnedOn).toBeNull();
    });

    it('the month still running does not count, and a month with nothing spent proves nothing', () => {
      const amounts = [amount('2026-10-02', 100)];
      expect(badge({ ...EMPTY, amounts, budgets }, 'budget1').earnedOn).toBeNull();
      const gap = [amount('2026-06-02', 100), amount('2026-09-02', 100)];
      // June and September held; July and August had nothing in them.
      expect(logFacts({ ...EMPTY, amounts: gap, budgets }).budgetMonths.map((p) => p.day)).toEqual([
        '2026-06-30',
        '2026-09-30',
      ]);
    });

    it('no budgets, no badge', () => {
      expect(badge({ ...EMPTY, amounts: [amount('2026-08-10')] }, 'budget1').earnedOn).toBeNull();
    });
  });

  it('a savings goal is reached the day its subsection’s balance stood at the target', () => {
    const accounts: MoneyAccount[] = [
      { id: 'save', name: 'Savings', glyph: '🏦', order: 0, opening: 1000, archivedAt: null },
    ];
    const goals = [
      {
        id: 'g',
        name: 'Bike',
        glyph: '🚲',
        target: 5000,
        accountId: 'save',
        createdAt: at('2026-08-01'),
      },
    ];
    const deposit = (day: string, value: number) =>
      amount(day, value, { accountId: 'save', direction: 'income', categoryId: 'salary' });
    const amounts = [deposit('2026-08-10', 3000), deposit('2026-09-10', 999)];
    expect(badge({ ...EMPTY, amounts, goals, accounts }, 'goal1').earnedOn).toBeNull();
    const more = [...amounts, deposit('2026-09-20', 1)];
    expect(badge({ ...EMPTY, amounts: more, goals, accounts }, 'goal1').earnedOn).toBe(
      '2026-09-20',
    );
    // Already there on the day it was set: reached that day.
    const rich = [deposit('2026-07-01', 9000)];
    expect(badge({ ...EMPTY, amounts: rich, goals, accounts }, 'goal1').earnedOn).toBe(
      '2026-08-01',
    );
  });
});

describe('stable across recomputation', () => {
  const input: LogsInput = {
    ...EMPTY,
    workouts: daysTo('2026-09-30', 12).map((d) => workout(d, { totalVolumeKg: 1200 })),
    tasks: [task('read')],
    log: { read: marks(daysTo('2026-10-08', 40), 'done') },
    amounts: daysTo('2026-09-30', 31).map((d) => amount(d)),
  };

  it('the same logs give the same badges, field for field', () => {
    expect(achievements(logFacts(input))).toEqual(achievements(logFacts(input)));
  });

  it('earned dates are the log’s: a later "today" moves none of them', () => {
    const now = achievements(logFacts(input));
    const later = achievements(logFacts({ ...input, today: '2027-03-01' }));
    for (const b of now.filter((row) => row.earnedOn !== null)) {
      expect(later.find((row) => row.id === b.id)!.earnedOn, b.id).toBe(b.earnedOn);
    }
    expect(now.find((b) => b.id === 'workouts10')!.earnedOn).toBe('2026-09-28');
  });

  it('the order the store keeps workouts in does not matter', () => {
    const reversed = { ...input, workouts: [...input.workouts].reverse() };
    expect(achievements(logFacts(reversed))).toEqual(achievements(logFacts(input)));
  });
});

describe('words', () => {
  it('a locked one-step badge says "Not yet" rather than 0 / 1', () => {
    const b = badge(EMPTY, 'workouts1');
    expect(describeBadgeProgress(b, 'en')).toBe('Not yet');
    expect(describeEarned(b, 'en')).toBeNull();
  });

  it('progress agrees with the need in Russian', () => {
    const list = daysTo('2026-09-30', 73).map((d) => workout(d));
    expect(describeBadgeProgress(badge({ ...EMPTY, workouts: list }, 'workouts100'), 'ru')).toBe(
      '73 / 100 тренировок',
    );
    expect(
      describeBadgeProgress(badge({ ...EMPTY, workouts: list.slice(0, 3) }, 'workouts10'), 'ru'),
    ).toBe('3 / 10 тренировок');
  });

  it('an earned badge names its day', () => {
    const b = badge({ ...EMPTY, workouts: [workout('2026-09-14')] }, 'workouts1');
    expect(describeEarned(b, 'en')).toBe('Earned 14 September 2026');
    expect(describeEarned(b, 'ru')).toBe(t('Earned {date}', 'ru', { date: '14 сентября 2026' }));
  });
});

describe('one log per app (3.0.0)', () => {
  /*
   * The Workout app is the 2.x install and still stores tasks and money. It
   * must neither count them nor show their badges; the other two apps show
   * only their own ladder.
   */
  const everything = (): LogsInput => ({
    ...EMPTY,
    workouts: [workout('2026-10-01')],
    tasks: [task('read')],
    log: { read: marks(['2026-10-01'], 'done') },
    amounts: [amount('2026-10-01')],
  });

  it('each app shows its own ladder, and the three together are the whole table', () => {
    const facts = logFacts(everything());
    const ids = (['workout', 'tasks', 'expenses'] as const).map((v) =>
      achievements(facts, v).map((row) => row.domain),
    );
    expect(new Set(ids[0])).toEqual(new Set(['workout']));
    expect(new Set(ids[1])).toEqual(new Set(['tasks']));
    expect(new Set(ids[2])).toEqual(new Set(['money']));
    expect(ids.flat().length).toBe(BADGES.length);
    expect(achievements(facts).length).toBe(BADGES.length);
  });

  it('maps each app to its log', () => {
    expect(badgeDomain('workout')).toBe('workout');
    expect(badgeDomain('tasks')).toBe('tasks');
    expect(badgeDomain('expenses')).toBe('money');
  });

  it("counts only the app's own log, whatever the store still holds", () => {
    const workoutFacts = logFacts({ ...everything(), variant: 'workout' });
    expect(workoutFacts.workouts.length).toBe(1);
    expect(workoutFacts.tasksDone).toEqual([]);
    expect(workoutFacts.amounts).toEqual([]);

    const taskFacts = logFacts({ ...everything(), variant: 'tasks' });
    expect(taskFacts.workouts).toEqual([]);
    expect(taskFacts.tasksDone.length).toBe(1);
    expect(taskFacts.amounts).toEqual([]);

    const moneyFacts = logFacts({ ...everything(), variant: 'expenses' });
    expect(moneyFacts.workouts).toEqual([]);
    expect(moneyFacts.tasksDone).toEqual([]);
    expect(moneyFacts.amounts.length).toBe(1);
  });

  it("the gallery sentence counts the app's badges, not all thirty-three", () => {
    const badges = achievements(logFacts({ ...everything(), variant: 'tasks' }), 'tasks');
    expect(describeGallery(badges, 'en')).toBe(`1 of ${badges.length} earned.`);
  });
});
