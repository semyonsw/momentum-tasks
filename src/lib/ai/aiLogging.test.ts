import { describe, expect, it } from 'vitest';

import {
  describeChanges,
  readDay,
  validateChanges,
  type AiChange,
  type ChangeContext,
  type CurrentValues,
} from './aiChanges';
import type { Exercise } from '../../types/models';

/**
 * The things the chat can now LOG rather than tune — an amount, a day's answer,
 * a weigh-in, a past set's kind. Same contract as every suggestion: the model's
 * items are untrusted, an id the context never named is dropped, nothing lands
 * in the future, and the card is drawn from what survived.
 */

const TODAY = '2026-10-29';

const BENCH = {
  id: 'ex_bench',
  name: 'Bench press',
  ownerId: 'u1',
  muscleGroups: ['chest'],
  requiresWeight: true,
  countUnit: 'reps',
  loadMode: 'external',
  isUnilateral: false,
  isArchived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
} as Exercise;

const WORKOUT = {
  id: 'w_mon',
  startedAt: '2026-10-27T17:00:00.000Z',
  sets: [
    { id: 's_w', exerciseId: 'ex_bench', setIndex: 0, isWarmup: true },
    { id: 's_1', exerciseId: 'ex_bench', setIndex: 1, isWarmup: false },
    { id: 's_2', exerciseId: 'ex_bench', setIndex: 2, isWarmup: false },
    { id: 's_r', exerciseId: 'ex_row', setIndex: 3, isWarmup: false },
  ],
};

function ctx(section: ChangeContext['section'], over: Partial<ChangeContext> = {}): ChangeContext {
  return {
    section,
    exercises: [BENCH],
    tasks: [
      { id: 't_read', name: 'Read', schedule: { kind: 'daily' }, archivedAt: null },
      {
        id: 't_water',
        name: 'Water',
        schedule: { kind: 'daily' },
        target: { count: 8, unit: 'glasses' },
        archivedAt: null,
      },
      { id: 't_old', name: 'Old', schedule: { kind: 'daily' }, archivedAt: '2026-01-01' },
    ],
    categories: [{ id: 'c_food', name: 'Food' }],
    today: TODAY,
    moneyCategories: [
      { id: 'c_food', name: 'Food', direction: 'expense' },
      { id: 'c_salary', name: 'Salary', direction: 'income' },
    ],
    accounts: [
      { id: 'a_cash', name: 'Cash' },
      { id: 'a_card', name: 'Card' },
    ],
    workouts: [WORKOUT],
    ...over,
  };
}

describe('readDay', () => {
  it('is today when the model named no day', () => {
    expect(readDay(undefined, TODAY)).toBe(TODAY);
    expect(readDay('', TODAY)).toBe(TODAY);
  });

  it('keeps a real past day, and the date part of a timestamp', () => {
    expect(readDay('2026-10-28', TODAY)).toBe('2026-10-28');
    expect(readDay('2026-10-28T09:00:00Z', TODAY)).toBe('2026-10-28');
  });

  it('refuses the future, impossible dates and non-dates', () => {
    expect(readDay('2026-10-30', TODAY)).toBeNull();
    expect(readDay('2026-02-30', TODAY)).toBeNull();
    expect(readDay('yesterday', TODAY)).toBeNull();
    expect(readDay(20261028, TODAY)).toBeNull();
  });
});

describe('logging an amount', () => {
  it('files an expense under its category, today, with the note', () => {
    const [change] = validateChanges(
      [{ target: 'amount', id: 'c_food', field: 'add', number: 1200, text: ' lunch  out ' }],
      ctx('Expenses'),
    );
    expect(change).toEqual({
      target: 'amount',
      field: 'add',
      id: 'c_food',
      direction: 'expense',
      value: 1200,
      day: TODAY,
      note: 'lunch out',
    });
  });

  it('takes its direction from the category: a salary is income', () => {
    const [change] = validateChanges(
      [{ target: 'income', id: 'c_salary', field: 'add', number: 200000 }],
      ctx('Expenses'),
    );
    expect(change).toMatchObject({ direction: 'income', value: 200000 });
  });

  it('keeps a named account only when the context had it', () => {
    const [named] = validateChanges(
      [{ target: 'amount', id: 'c_food', field: 'add', number: 5, account: 'a_card' }],
      ctx('Expenses'),
    );
    expect(named).toMatchObject({ accountId: 'a_card' });
    const [invented] = validateChanges(
      [{ target: 'amount', id: 'c_food', field: 'add', number: 5, account: 'a_bank' }],
      ctx('Expenses'),
    );
    expect(invented).not.toHaveProperty('accountId');
  });

  it('drops an unknown category, a zero or negative value, and a future day', () => {
    expect(
      validateChanges(
        [
          { target: 'amount', id: 'c_cars', field: 'add', number: 5 },
          { target: 'amount', id: 'c_food', field: 'add', number: 0 },
          { target: 'amount', id: 'c_food', field: 'add', number: -3 },
          { target: 'amount', id: 'c_food', field: 'add', number: 5, day: '2027-01-01' },
        ],
        ctx('Expenses'),
      ),
    ).toEqual([]);
  });

  it('keeps two lunches as two rows, even identical ones', () => {
    const lunch = { target: 'amount', id: 'c_food', field: 'add', number: 5, text: 'lunch' };
    const changes = validateChanges(
      [lunch, { ...lunch, number: 7, text: 'dinner' }, lunch],
      ctx('Expenses'),
    );
    expect(changes).toHaveLength(3);
  });

  it('is an Expenses change only', () => {
    expect(
      validateChanges(
        [{ target: 'amount', id: 'c_food', field: 'add', number: 5 }],
        ctx('Workout'),
      ),
    ).toEqual([]);
  });
});

describe("answering a task's day", () => {
  it('ticks a task done, today by default', () => {
    expect(
      validateChanges([{ target: 'task', id: 't_read', field: 'done' }], ctx('Tasks')),
    ).toEqual([{ target: 'task', id: 't_read', field: 'done', value: null, day: TODAY }]);
  });

  it('reads the words a model uses: tick, skip, untick', () => {
    const changes = validateChanges(
      [
        { target: 'task', id: 't_read', field: 'tick', day: '2026-10-27' },
        { target: 'task', id: 't_read', field: 'skip', day: '2026-10-28' },
        { target: 'task', id: 't_water', field: 'untick' },
      ],
      ctx('Tasks'),
    );
    expect(changes.map((c) => (c.target === 'task' ? [c.field, c.day] : null))).toEqual([
      ['done', '2026-10-27'],
      ['excused', '2026-10-28'],
      ['clear', TODAY],
    ]);
  });

  it('two days of one task are two changes; the same day twice is the later answer', () => {
    const changes = validateChanges(
      [
        { target: 'task', id: 't_read', field: 'done', day: '2026-10-27' },
        { target: 'task', id: 't_read', field: 'done', day: '2026-10-28' },
        { target: 'task', id: 't_read', field: 'excused', day: '2026-10-28' },
      ],
      ctx('Tasks'),
    );
    expect(changes).toHaveLength(2);
    expect(changes[1]).toMatchObject({ field: 'excused', day: '2026-10-28' });
  });

  it('drops an archived task and a future day', () => {
    expect(
      validateChanges(
        [
          { target: 'task', id: 't_old', field: 'done' },
          { target: 'task', id: 't_read', field: 'done', day: '2026-11-01' },
        ],
        ctx('Tasks'),
      ),
    ).toEqual([]);
  });

  it('needs a today to answer a day at all', () => {
    expect(
      validateChanges([{ target: 'task', id: 't_read', field: 'done' }], {
        ...ctx('Tasks'),
        today: undefined,
      }),
    ).toEqual([]);
  });
});

describe('logging bodyweight', () => {
  it('rounds to 0.1 kg and holds to sensible bounds', () => {
    expect(
      validateChanges([{ target: 'bodyweight', field: 'log', number: 81.26 }], ctx('Workout')),
    ).toEqual([{ target: 'bodyweight', field: 'log', value: 81.3 }]);
    expect(
      validateChanges([{ target: 'bodyweight', field: 'log', number: 4 }], ctx('Workout')),
    ).toEqual([]);
    expect(
      validateChanges([{ target: 'bodyweight', field: 'log', number: 81 }], ctx('Tasks')),
    ).toEqual([]);
  });
});

describe("correcting a saved set's kind", () => {
  it('finds set 1 by its place among the WORKING sets, skipping the warm-up', () => {
    const [change] = validateChanges(
      [
        {
          target: 'workout_set',
          id: 'w_mon',
          exerciseId: 'ex_bench',
          field: 'kind',
          number: 1,
          text: 'warm-up',
        },
      ],
      ctx('Workout'),
    );
    expect(change).toMatchObject({
      target: 'workout_set',
      setId: 's_1',
      value: 'warmup',
      day: '2026-10-27',
      position: 1,
    });
  });

  it('drops a set that is not there, an unknown workout, and an unknown kind', () => {
    const base = { target: 'workout_set', exerciseId: 'ex_bench', field: 'kind', text: 'warmup' };
    expect(
      validateChanges(
        [
          { ...base, id: 'w_mon', number: 3 },
          { ...base, id: 'w_mon', number: 0 },
          { ...base, id: 'w_tue', number: 1 },
          { ...base, id: 'w_mon', number: 1, text: 'superset' },
          { ...base, id: 'w_mon', exerciseId: 'ex_squat', number: 1 },
        ],
        ctx('Workout'),
      ),
    ).toEqual([]);
  });

  it('drops a change to the kind the set already is', () => {
    expect(
      validateChanges(
        [
          {
            target: 'workout_set',
            id: 'w_mon',
            exerciseId: 'ex_bench',
            field: 'kind',
            number: 2,
            text: 'working',
          },
        ],
        ctx('Workout'),
      ),
    ).toEqual([]);
  });
});

describe('the card rows for logged things', () => {
  const now: CurrentValues = {
    exercises: [BENCH],
    tasks: ctx('Tasks').tasks,
    categories: [{ id: 'c_food', name: 'Food' }],
    settings: { restSecondsBetweenSets: 90, restSecondsBetweenExercises: 120, autoStartRest: true },
    budgets: {},
    formatMoney: (v) => `${v / 100} USD`,
    moneyCategories: [
      { id: 'c_food', name: 'Food' },
      { id: 'c_salary', name: 'Salary' },
    ],
    bodyweightKg: 82,
    formatDay: (day) => (day === '2026-10-27' ? '27 Oct' : day),
  };

  it('says what will be written, in plain words', () => {
    const changes: AiChange[] = [
      {
        target: 'amount',
        field: 'add',
        id: 'c_food',
        direction: 'expense',
        value: 1250,
        day: '2026-10-27',
        note: 'lunch',
      },
      { target: 'bodyweight', field: 'log', value: 81.5 },
      { target: 'task', id: 't_read', field: 'done', value: null, day: '2026-10-27' },
      {
        target: 'workout_set',
        field: 'kind',
        id: 'w_mon',
        exerciseId: 'ex_bench',
        setId: 's_1',
        from: 'drop',
        value: 'warmup',
        day: '2026-10-27',
        position: 1,
      },
    ];
    expect(describeChanges(changes, now, 'en')).toEqual([
      { subject: 'Food · lunch', label: 'New expense · 27 Oct', from: '', to: '12.5 USD' },
      { subject: 'Body weight', label: 'Today', from: '82 kg', to: '81.5 kg' },
      { subject: 'Read', label: '27 Oct', from: '', to: 'Done' },
      { subject: 'Bench press · 27 Oct', label: 'Set 1', from: 'Drop set', to: 'Warm-up' },
    ]);
  });
});
