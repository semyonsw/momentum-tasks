import { describe, expect, it } from 'vitest';

import type { CompletedWorkout } from './completedWorkout';
import type { Amount, MoneyCategory } from './money';
import type { Task, TaskLog } from './tasks';
import {
  describeWeeklyReview,
  reviewKicker,
  reviewedWeek,
  weeklyReview,
  weeklyReviewShown,
  type WeeklyReviewInput,
} from './weeklyReview';

/**
 * The weekly review (X3). What matters: the week is Monday to Sunday in local
 * days, every clause is a fact or it is gone, and a log with nothing to say has
 * no column at all.
 */

/** Thursday 8 Oct 2026 — the review is about Mon 28 Sep – Sun 4 Oct. */
const TODAY = '2026-10-08';

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

function task(id: string, name: string, over: Partial<Task> = {}): Task {
  return {
    id,
    name,
    schedule: { kind: 'daily' },
    auto: null,
    startedOn: '2026-01-01',
    reminder: null,
    archivedAt: null,
    order: 0,
    ...over,
  };
}

/** Marks on consecutive days from `from`: d = done, m = excused, . = unanswered. */
function marks(
  from: string,
  pattern: string,
): Record<string, { mark: 'done' | 'missed' | null; note: string }> {
  const out: Record<string, { mark: 'done' | 'missed' | null; note: string }> = {};
  const start = new Date(`${from}T12:00:00`);
  [...pattern].forEach((c, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (c === 'd') out[key] = { mark: 'done', note: '' };
    if (c === 'm') out[key] = { mark: 'missed', note: '' };
  });
  return out;
}

const categories: MoneyCategory[] = [
  { id: 'food', name: 'Food', glyph: '🍜', direction: 'expense', order: 0, archivedAt: null },
  { id: 'taxi', name: 'Такси', glyph: '🚕', direction: 'expense', order: 1, archivedAt: null },
  {
    id: 'transfer_out',
    name: 'Transfer',
    glyph: '🔁',
    direction: 'expense',
    order: 2,
    archivedAt: null,
  },
];

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

const input = (over: Partial<WeeklyReviewInput> = {}): WeeklyReviewInput => ({
  today: TODAY,
  workouts: [],
  tasks: [],
  log: {},
  amounts: [],
  categories,
  ...over,
});

/* ------------------------------------------------------------------ */

describe('week boundaries', () => {
  it('reviews last Monday–Sunday from any day of this week', () => {
    for (const day of ['2026-10-05', '2026-10-08', '2026-10-11']) {
      expect(reviewedWeek(day)).toEqual({ from: '2026-09-28', to: '2026-10-04' });
    }
  });

  it('crosses a year boundary', () => {
    // Mon 4 Jan 2027 → Mon 28 Dec 2026 – Sun 3 Jan 2027.
    expect(reviewedWeek('2027-01-04')).toEqual({ from: '2026-12-28', to: '2027-01-03' });
    expect(reviewedWeek('2027-01-10')).toEqual({ from: '2026-12-28', to: '2027-01-03' });
  });

  it('counts a workout at Monday 00:00 and at Sunday 23:59, not one a minute outside', () => {
    const inside = [workout('2026-09-28', 0), workout('2026-10-04', 23)];
    const outside = [workout('2026-10-05', 0), workout('2026-09-27', 23)];
    const review = weeklyReview(input({ workouts: [...inside, ...outside] }));
    expect(review?.workouts?.count).toBe(2);
  });

  it('a daylight-saving week is still seven days (days are local keys)', () => {
    // Europe's autumn change falls on Sun 25 Oct 2026.
    expect(reviewedWeek('2026-10-26')).toEqual({ from: '2026-10-19', to: '2026-10-25' });
  });
});

describe('workouts', () => {
  it('compares with the week before when the log existed then', () => {
    const review = weeklyReview(
      input({
        workouts: [
          workout('2026-09-29'),
          workout('2026-10-01'),
          workout('2026-10-03'),
          workout('2026-09-22'),
          workout('2026-09-24'),
        ],
      }),
    );
    expect(review?.workouts).toEqual({ count: 3, previous: 2 });
  });

  it('drops the comparison in the first week of a log rather than comparing with zero', () => {
    const review = weeklyReview(input({ workouts: [workout('2026-09-29')] }));
    expect(review?.workouts).toEqual({ count: 1, previous: null });
    const [column] = describeWeeklyReview(review!, { currency: 'AMD', scale: 0 }, 'en');
    expect(column.line).toBe('');
  });

  it('a rest week after a training week still says so', () => {
    const review = weeklyReview(
      input({ workouts: [workout('2026-09-22'), workout('2026-09-23')] }),
    );
    expect(review?.workouts).toEqual({ count: 0, previous: 2 });
  });

  it('no column when neither week has a workout', () => {
    const review = weeklyReview(
      input({ workouts: [workout('2026-08-01')], amounts: [spend('2026-09-30', 100)] }),
    );
    expect(review?.workouts).toBeNull();
  });
});

describe('tasks', () => {
  it('percent over the week, excused days out of the denominator', () => {
    const steps = task('t1', 'Steps');
    const log: TaskLog = { t1: marks('2026-09-28', 'dddddmm') };
    const review = weeklyReview(input({ tasks: [steps], log }));
    // 5 done of 5 asked; the two excused days ask for nothing.
    expect(review?.tasks?.percent).toBe(100);
  });

  it('compares with the week before and names the task that slipped', () => {
    const steps = task('t1', 'Steps', { order: 0 });
    const read = task('t2', 'Read', { order: 1 });
    const log: TaskLog = {
      // week before: 14 of 14
      t1: { ...marks('2026-09-21', 'ddddddd'), ...marks('2026-09-28', 'd.d.ddd') },
      t2: { ...marks('2026-09-21', 'ddddddd'), ...marks('2026-09-28', 'ddddddd') },
    };
    const review = weeklyReview(input({ tasks: [steps, read], log }));
    expect(review?.tasks).toEqual({
      percent: 86, // 12 of 14
      previous: 100,
      slipped: { name: 'Steps', count: 2 },
    });
    const [column] = describeWeeklyReview(review!, { currency: 'AMD', scale: 0 }, 'en');
    expect(column.line).toBe('Down 14 points. Steps slipped twice.');
  });

  it('one unanswered day is not a slip; an excused one never is', () => {
    const steps = task('t1', 'Steps');
    const log: TaskLog = { t1: marks('2026-09-28', 'ddd.mmm') };
    const review = weeklyReview(input({ tasks: [steps], log }));
    expect(review?.tasks?.slipped).toBeNull();
  });

  it('no column when nothing was asked last week', () => {
    const later = task('t1', 'Steps', { startedOn: '2026-10-05' });
    expect(weeklyReview(input({ tasks: [later] }))).toBeNull();
  });
});

describe('spent', () => {
  it('expenses only, on days of the week; transfers, incomes and month amounts out', () => {
    const review = weeklyReview(
      input({
        amounts: [
          spend('2026-09-28', 600),
          spend('2026-10-04', 400, { categoryId: 'taxi' }),
          spend('2026-10-01', 9999, { direction: 'income' }),
          spend('2026-10-01', 5000, { categoryId: 'transfer_out', transferId: 'x' }),
          spend('2026-01-01', 7000, { when: { kind: 'month', year: 2026, month: 8 } }),
          spend('2026-10-05', 300),
        ],
      }),
    );
    expect(review?.spent).toEqual({ total: 1000, top: { name: 'Food', share: 0.6 } });
  });

  it('formats in the money scale (USD cents) with the label in the sentence', () => {
    const review = weeklyReview(input({ amounts: [spend('2026-09-30', 123456)] }));
    const [column] = describeWeeklyReview(review!, { currency: 'USD', scale: 2 }, 'en');
    expect(column).toEqual({
      key: 'spent',
      label: 'Spent',
      figure: '1,234.56',
      line: 'USD. All of it on Food.',
    });
  });

  it('drops the category clause when the category is gone', () => {
    const review = weeklyReview(
      input({ amounts: [spend('2026-09-30', 100, { categoryId: 'lost' })] }),
    );
    const [column] = describeWeeklyReview(review!, { currency: 'AMD', scale: 0 }, 'en');
    expect(column.line).toBe('AMD.');
  });
});

describe('the card as a whole', () => {
  it('no card when all three logs are empty', () => {
    expect(weeklyReview(input())).toBeNull();
  });

  it('only the columns with data, in log order', () => {
    const review = weeklyReview(
      input({ amounts: [spend('2026-09-30', 100)], workouts: [workout('2026-09-30')] }),
    );
    expect(
      describeWeeklyReview(review!, { currency: 'AMD', scale: 0 }, 'en').map((c) => c.key),
    ).toEqual(['workouts', 'spent']);
  });

  it('reads in English and Russian', () => {
    const steps = task('t1', 'Шаги');
    const log: TaskLog = {
      t1: { ...marks('2026-09-21', 'ddddddd'), ...marks('2026-09-28', 'd...ddd') },
    };
    const review = weeklyReview(
      input({
        tasks: [steps],
        log,
        workouts: [workout('2026-09-29'), workout('2026-10-02'), workout('2026-09-23')],
        amounts: [spend('2026-09-30', 52300), spend('2026-10-01', 47700, { categoryId: 'taxi' })],
      }),
    )!;
    const money = { currency: 'AMD', scale: 0 };

    expect(
      describeWeeklyReview(review, money, 'en').map((c) => [c.label, c.figure, c.line]),
    ).toEqual([
      ['Workouts', '2', 'One more than the week before.'],
      ['Tasks', '57%', 'Down 43 points. Шаги slipped 3 times.'],
      ['Spent', '100,000', 'AMD. Food was 52% of it.'],
    ]);
    expect(describeWeeklyReview(review, money, 'ru').map((c) => [c.label, c.line])).toEqual([
      ['Тренировки', 'На одну больше, чем неделей раньше.'],
      ['Задачи', 'Минус 43 пункта. Шаги: пропущено 3 раза.'],
      ['Потрачено', 'AMD. Food — 52%.'],
    ]);
    expect(reviewKicker(review, 'en')).toBe('Last week · 28 September – 04 October');
    expect(reviewKicker(review, 'ru')).toMatch(/^Прошлая неделя · 28 /);
  });

  it('every comparison sentence, both ways', () => {
    const line = (count: number, previous: number, lang: 'en' | 'ru' = 'en') =>
      describeWeeklyReview(
        { week: reviewedWeek(TODAY), workouts: { count, previous }, tasks: null, spent: null },
        { currency: 'AMD', scale: 0 },
        lang,
      )[0].line;
    expect(line(3, 3)).toBe('Same as the week before.');
    expect(line(2, 3)).toBe('One fewer than the week before.');
    expect(line(5, 2)).toBe('3 more than the week before.');
    expect(line(0, 4)).toBe('4 fewer than the week before.');
    expect(line(5, 2, 'ru')).toBe('На 3 больше, чем неделей раньше.');

    const tasksLine = (percent: number, previous: number, lang: 'en' | 'ru' = 'en') =>
      describeWeeklyReview(
        {
          week: reviewedWeek(TODAY),
          workouts: null,
          tasks: { percent, previous, slipped: null },
          spent: null,
        },
        { currency: 'AMD', scale: 0 },
        lang,
      )[0].line;
    expect(tasksLine(80, 80)).toBe('Level with the week before.');
    expect(tasksLine(81, 80)).toBe('Up 1 point.');
    expect(tasksLine(81, 80, 'ru')).toBe('Плюс 1 пункт.');
    expect(tasksLine(85, 80, 'ru')).toBe('Плюс 5 пунктов.');
  });
});

describe('when the card is shown', () => {
  it('from Monday all week, until dismissed this week', () => {
    expect(weeklyReviewShown('2026-10-05', undefined)).toBe(true);
    expect(weeklyReviewShown('2026-10-11', undefined)).toBe(true);
    expect(weeklyReviewShown('2026-10-05', '2026-10-05')).toBe(false);
    expect(weeklyReviewShown('2026-10-11', '2026-10-05')).toBe(false);
  });

  it("last week's dismissal does not hide this week's card", () => {
    expect(weeklyReviewShown('2026-10-12', '2026-10-05')).toBe(true);
    expect(weeklyReviewShown('2027-01-04', '2026-12-28')).toBe(true);
  });
});

describe('one log per app (3.0.0)', () => {
  const everything = () =>
    input({
      workouts: [workout('2026-09-29'), workout('2026-10-01')],
      tasks: [task('read', 'Reading')],
      log: { read: marks('2026-09-28', 'ddddddd') },
      amounts: [spend('2026-09-30', 5000)],
    });

  it('each app reviews its own log, whatever the store still holds', () => {
    const columns = (variant?: 'workout' | 'tasks' | 'expenses') => {
      const review = weeklyReview({ ...everything(), variant });
      return review
        ? describeWeeklyReview(review, { currency: 'AMD', scale: 0 }, 'en').map((c) => c.key)
        : [];
    };
    expect(columns()).toEqual(['workouts', 'tasks', 'spent']);
    expect(columns('workout')).toEqual(['workouts']);
    expect(columns('tasks')).toEqual(['tasks']);
    expect(columns('expenses')).toEqual(['spent']);
  });

  it('no card in an app whose own log said nothing last week', () => {
    expect(weeklyReview({ ...everything(), amounts: [], variant: 'expenses' })).toBeNull();
  });
});
