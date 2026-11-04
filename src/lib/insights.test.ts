import { describe, expect, it } from 'vitest';

import type { CompletedWorkout } from './completedWorkout';
import { parseDay, shiftDay, weekdayIndex } from './days';
import {
  describeInsight,
  insightIdsFor,
  insights,
  insightsOffered,
  MIN_DAYS_PER_GROUP,
  MIN_POINTS,
  MIN_RELATIVE,
  MIN_WEEKS_PER_GROUP,
  type InsightsInput,
} from './insights';
import type { Amount } from './money';
import type { Task, TaskLog } from './tasks';

/**
 * Insights (X2). What matters is what is NOT said: nothing below the sample
 * size or the effect size, no card built on a zero, and a day excused on
 * purpose never in a denominator. Then that the words point the right way.
 */

/** Friday 9 Oct 2026: the window is 10 Apr – 8 Oct. */
const TODAY = '2026-10-09';
const YESTERDAY = shiftDay(TODAY, -1);

const at = (day: string, hour = 18) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, hour).toISOString();
};

let seq = 0;
function workout(day: string): CompletedWorkout {
  seq += 1;
  return {
    id: `w${seq}`,
    title: 'Push',
    startedAt: at(day),
    endedAt: at(day, 19),
    durationMinutes: 60,
    setCount: 0,
    totalVolumeKg: 0,
    volumeIsPartial: false,
    exercises: [],
    sets: [],
  };
}

function task(id: string): Task {
  return {
    id,
    name: id,
    schedule: { kind: 'daily' },
    auto: null,
    startedOn: '2026-01-01',
    reminder: null,
    archivedAt: null,
    order: 0,
  };
}

function spend(day: string, value: number, over: Partial<Amount> = {}): Amount {
  seq += 1;
  return {
    id: `a${seq}`,
    categoryId: 'food',
    accountId: 'cash',
    direction: 'expense',
    value,
    when: { kind: 'day', date: day },
    note: '',
    createdAt: '2026-10-01T00:00:00.000Z',
    ...over,
  };
}

/** Every day from `from` to `to`, inclusive. */
function daysFrom(from: string, to: string = YESTERDAY): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = shiftDay(d, 1)) out.push(d);
  return out;
}

const isMWF = (day: string) => [0, 2, 4].includes(weekdayIndex(parseDay(day) as Date));
const isWeekend = (day: string) => weekdayIndex(parseDay(day) as Date) >= 5;

function mark(log: TaskLog, taskId: string, day: string, value: 'done' | 'missed') {
  log[taskId] = { ...(log[taskId] ?? {}), [day]: { mark: value, note: '' } };
}

const base = (over: Partial<InsightsInput> = {}): InsightsInput => ({
  today: TODAY,
  workouts: [],
  tasks: [],
  log: {},
  amounts: [],
  ...over,
});

/**
 * Ten weeks of Mon/Wed/Fri training; tasks: `onTraining(day)` / `onRest(day)` decide
 * how many of the four daily tasks are done (or 'excused' for all four).
 */
function trainingScenario(opts: {
  from?: string;
  onTraining: (day: string) => number | 'excused';
  onRest: (day: string) => number | 'excused';
}): InputWithMeta {
  const from = opts.from ?? '2026-07-27'; // a Monday, ten weeks back
  const days = daysFrom(from);
  const tasks = ['t1', 't2', 't3', 't4'].map(task);
  const log: TaskLog = {};
  const workouts: CompletedWorkout[] = [];
  for (const day of days) {
    const training = isMWF(day);
    if (training) workouts.push(workout(day));
    const done = training ? opts.onTraining(day) : opts.onRest(day);
    tasks.forEach((t, i) => {
      if (done === 'excused') mark(log, t.id, day, 'missed');
      else if (i < done) mark(log, t.id, day, 'done');
    });
  }
  return {
    input: base({ workouts, tasks, log }),
    training: days.filter(isMWF).length,
    rest: days.filter((d) => !isMWF(d)).length,
  };
}
interface InputWithMeta {
  input: InsightsInput;
  training: number;
  rest: number;
}

describe('the thresholds', () => {
  it('are the documented ones', () => {
    expect(MIN_DAYS_PER_GROUP).toBe(14);
    expect(MIN_WEEKS_PER_GROUP).toBe(4);
    expect(MIN_POINTS).toBe(10);
    expect(MIN_RELATIVE).toBe(0.2);
  });

  it('nothing at all for empty logs', () => {
    expect(insights(base())).toEqual([]);
  });
});

describe('tasks on training days vs rest days', () => {
  it('shows a big gap with enough days in each group, pointing the right way', () => {
    const { input, training, rest } = trainingScenario({ onTraining: () => 4, onRest: () => 2 });
    const found = insights(input).find((i) => i.id === 'tasksOnTrainingDays');
    expect(found).toMatchObject({
      kind: 'tasks',
      a: { value: 100, n: training },
      b: { value: 50, n: rest },
      direction: 'more',
      effect: 50,
    });
  });

  it('says "fewer" when training days are the worse ones', () => {
    const { input } = trainingScenario({ onTraining: () => 1, onRest: () => 4 });
    const found = insights(input).find((i) => i.id === 'tasksOnTrainingDays');
    expect(found?.direction).toBe('less');
    expect(describeInsight(found as never, { currency: 'AMD', scale: 0 }, 'en').title).toBe(
      'On training days you finish fewer of your tasks: 25% vs 100% on rest days.',
    );
  });

  it('shows nothing below the effect threshold (a 9-point gap)', () => {
    // Training 100%; rest: 4 done on most days, 3 done on every third day → ~92%.
    let i = 0;
    const { input } = trainingScenario({
      onTraining: () => 4,
      onRest: () => (i++ % 3 === 0 ? 3 : 4),
    });
    const found = insights(input).find((x) => x.id === 'tasksOnTrainingDays');
    expect(found).toBeUndefined();
  });

  it('shows nothing below the sample threshold (13 training days)', () => {
    // Training only started on Wed 9 Sep: 13 MWF days to yesterday.
    const { input, training } = trainingScenario({
      from: '2026-09-09',
      onTraining: () => 4,
      onRest: () => 0,
    });
    expect(training).toBe(MIN_DAYS_PER_GROUP - 1);
    expect(insights(input).find((x) => x.id === 'tasksOnTrainingDays')).toBeUndefined();
  });

  it('counts no day before the first workout as a rest day', () => {
    const { input, rest } = trainingScenario({ onTraining: () => 4, onRest: () => 2 });
    // Add task marks long before training began: they must not join the rest group.
    for (const day of daysFrom('2026-05-01', '2026-07-26')) mark(input.log, 't1', day, 'done');
    const found = insights(input).find((x) => x.id === 'tasksOnTrainingDays');
    expect(found?.b.n).toBe(rest);
  });

  it('keeps excused days out of the denominators', () => {
    // Rest days: every other one fully excused, the rest fully done.
    let i = 0;
    const { input, rest } = trainingScenario({
      onTraining: () => 2,
      onRest: () => (i++ % 2 === 0 ? 'excused' : 4),
    });
    const found = insights(input).find((x) => x.id === 'tasksOnTrainingDays');
    expect(found?.b.value).toBe(100);
    expect(found?.b.n).toBe(Math.floor(rest / 2));
    expect(found?.a.value).toBe(50);
    expect(found?.direction).toBe('less');
  });

  it('a group whose every day was excused is no group at all — no card, no NaN', () => {
    const { input } = trainingScenario({ onTraining: () => 4, onRest: () => 'excused' });
    const all = insights(input);
    expect(all.find((x) => x.id === 'tasksOnTrainingDays')).toBeUndefined();
    for (const insight of all) {
      expect(Number.isFinite(insight.a.value)).toBe(true);
      expect(Number.isFinite(insight.b.value)).toBe(true);
    }
  });
});

describe('tasks in weeks with 3+ workouts vs fewer', () => {
  /** Eight whole weeks from 10 Aug: busy weeks train MWF, quiet ones once. */
  function weeks(busyWeeks: number, quietWeeks: number) {
    const tasks = [task('t1'), task('t2')];
    const log: TaskLog = {};
    const workouts: CompletedWorkout[] = [];
    let monday = '2026-08-10';
    const total = busyWeeks + quietWeeks;
    for (let w = 0; w < total; w += 1) {
      const busy = w < busyWeeks;
      for (let i = 0; i < 7; i += 1) {
        const day = shiftDay(monday, i);
        if (busy ? [0, 2, 4].includes(i) : i === 0) workouts.push(workout(day));
        mark(log, 't1', day, 'done');
        if (busy) mark(log, 't2', day, 'done');
      }
      monday = shiftDay(monday, 7);
    }
    // Nothing logged after the last whole week, so later weeks ask but are not marked:
    // keep the comparison to the scripted weeks by archiving the tasks there.
    const end = shiftDay(monday, -1);
    return base({
      workouts,
      tasks: tasks.map((t) => ({ ...t, archivedAt: at(shiftDay(end, 1), 0) })),
      log,
    });
  }

  it('compares whole weeks once each group has four', () => {
    const found = insights(weeks(4, 4)).find((x) => x.id === 'tasksInBusyWeeks');
    expect(found).toMatchObject({
      a: { value: 100, n: 4 },
      b: { value: 50, n: 4 },
      direction: 'more',
    });
    expect(describeInsight(found as never, { currency: 'AMD', scale: 0 }, 'en').sample).toBe(
      'based on 4 weeks with 3+ workouts and 4 weeks with fewer',
    );
  });

  it('shows nothing with three busy weeks', () => {
    expect(insights(weeks(3, 5)).find((x) => x.id === 'tasksInBusyWeeks')).toBeUndefined();
  });
});

describe('spending on weekends vs weekdays', () => {
  const sixtyDays = daysFrom(shiftDay(YESTERDAY, -59));

  it('compares average spend a day and says by how much, relative to weekdays', () => {
    const amounts = sixtyDays.map((day) => spend(day, isWeekend(day) ? 2000 : 1000));
    const found = insights(base({ amounts })).find((x) => x.id === 'spendOnWeekends');
    expect(found).toMatchObject({
      kind: 'money',
      a: { value: 2000 },
      b: { value: 1000 },
      direction: 'more',
      effect: 100,
    });
    const card = describeInsight(found as never, { currency: 'AMD', scale: 0 }, 'en');
    expect(card.title).toBe('You spend 100% more a day on weekends than on weekdays.');
    expect(card.aText).toBe('2,000 AMD a day');
    expect(card.aBar).toBe(1);
    expect(card.bBar).toBe(0.5);
    expect(card.sample).toMatch(/^based on \d+ weekend days and \d+ weekdays$/);
  });

  it('says "less" the other way round', () => {
    const amounts = sixtyDays.map((day) => spend(day, isWeekend(day) ? 500 : 1000));
    const found = insights(base({ amounts })).find((x) => x.id === 'spendOnWeekends');
    expect(found?.direction).toBe('less');
    expect(found?.effect).toBe(50);
  });

  it('shows nothing for a 10% gap', () => {
    const amounts = sixtyDays.map((day) => spend(day, isWeekend(day) ? 1100 : 1000));
    expect(insights(base({ amounts })).find((x) => x.id === 'spendOnWeekends')).toBeUndefined();
  });

  it('never divides by a weekday group that spent nothing', () => {
    const amounts = sixtyDays.filter(isWeekend).map((day) => spend(day, 1000));
    expect(insights(base({ amounts }))).toEqual([]);
  });

  it('zero spend everywhere is no card', () => {
    // An income starts the money log, and nothing is ever spent.
    const amounts = [spend(sixtyDays[0], 5000, { direction: 'income', categoryId: 'salary' })];
    expect(insights(base({ amounts }))).toEqual([]);
  });

  it('leaves transfers, incomes and whole-month amounts out of the spending', () => {
    const amounts = [
      ...sixtyDays.map((day) => spend(day, 1000)),
      ...sixtyDays
        .filter(isWeekend)
        .flatMap((day) => [
          spend(day, 9000, { categoryId: 'transfer_out', transferId: `t${day}` }),
          spend(day, 9000, { direction: 'income', categoryId: 'salary' }),
        ]),
      spend(sixtyDays[0], 90000, {
        when: { kind: 'month', month: sixtyDays[0].slice(0, 7) } as never,
      }),
    ];
    expect(insights(base({ amounts })).find((x) => x.id === 'spendOnWeekends')).toBeUndefined();
  });

  it('needs 14 days in each group: five weeks of money is not enough weekends', () => {
    const recent = daysFrom(shiftDay(YESTERDAY, -34));
    const amounts = recent.map((day) => spend(day, isWeekend(day) ? 3000 : 1000));
    expect(insights(base({ amounts })).find((x) => x.id === 'spendOnWeekends')).toBeUndefined();
  });
});

describe('spending on training days vs rest days', () => {
  it('starts at the later of the two logs, and compares per day', () => {
    const { input, training, rest } = trainingScenario({ onTraining: () => 0, onRest: () => 0 });
    // Money began long before training: those days must not count.
    const amounts = daysFrom('2026-05-01').map((day) => spend(day, isMWF(day) ? 3000 : 1000));
    const found = insights({ ...input, amounts }).find((x) => x.id === 'spendOnTrainingDays');
    expect(found).toMatchObject({
      a: { value: 3000, n: training },
      b: { value: 1000, n: rest },
      direction: 'more',
      effect: 200,
    });
    expect(describeInsight(found as never, { currency: 'USD', scale: 2 }, 'ru').title).toBe(
      'В дни тренировок вы тратите в день на 200% больше, чем в дни отдыха.',
    );
  });

  it('no card when rest days spent nothing (no division by zero)', () => {
    const { input } = trainingScenario({ onTraining: () => 0, onRest: () => 0 });
    const amounts = daysFrom('2026-07-27')
      .filter(isMWF)
      .map((day) => spend(day, 3000));
    expect(
      insights({ ...input, amounts }).find((x) => x.id === 'spendOnTrainingDays'),
    ).toBeUndefined();
  });
});

describe('the words', () => {
  it('names the sample in both languages, with plurals', () => {
    const { input } = trainingScenario({ onTraining: () => 4, onRest: () => 2 });
    const found = insights(input).find((i) => i.id === 'tasksOnTrainingDays');
    const en = describeInsight(found as never, { currency: 'AMD', scale: 0 }, 'en');
    expect(en.title).toBe(
      'On training days you finish more of your tasks: 100% vs 50% on rest days.',
    );
    expect(en.sample).toBe('based on 32 training days and 42 rest days');
    expect(en.aBar).toBe(1);
    expect(en.bBar).toBe(0.5);
    const ru = describeInsight(found as never, { currency: 'AMD', scale: 0 }, 'ru');
    expect(ru.title).toBe(
      'В дни тренировок вы выполняете больше задач: 100% против 50% в дни отдыха.',
    );
    expect(ru.sample).toBe('выборка: 32 тренировочных дня и 42 дня отдыха');
  });
});

describe('one log per app (3.0.0)', () => {
  /*
   * Every comparison but one needs two logs, and no app has two any more. The
   * Workout app still STORES the 2.x tasks and money — handed the lot, it must
   * still say nothing, because it has no screen on which to check the claim.
   */
  function everything(): InsightsInput {
    const { input } = trainingScenario({ onTraining: () => 4, onRest: () => 1 });
    const amounts = daysFrom('2026-05-01').map((day) =>
      spend(day, isMWF(day) ? 3000 : isWeekend(day) ? 4000 : 500),
    );
    return { ...input, amounts };
  }

  it('the combined reading finds cross-log cards in it (the fixture is worth checking)', () => {
    // Every week is a 3-workout week, so the busy-weeks comparison has no quiet group.
    expect(insights(everything()).map((x) => x.id)).toEqual([
      'tasksOnTrainingDays',
      'spendOnTrainingDays',
      'spendOnWeekends',
    ]);
  });

  it('Workout and Tasks find nothing, even holding every log', () => {
    expect(insights({ ...everything(), variant: 'workout' })).toEqual([]);
    expect(insights({ ...everything(), variant: 'tasks' })).toEqual([]);
  });

  it('Expenses keeps the one comparison inside its own log', () => {
    expect(insights({ ...everything(), variant: 'expenses' }).map((x) => x.id)).toEqual([
      'spendOnWeekends',
    ]);
  });

  it('only Expenses has a door to them', () => {
    expect(insightIdsFor('expenses')).toEqual(['spendOnWeekends']);
    expect(insightsOffered('workout')).toBe(false);
    expect(insightsOffered('tasks')).toBe(false);
    expect(insightsOffered('expenses')).toBe(true);
  });
});
