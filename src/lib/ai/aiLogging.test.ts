import { describe, expect, it } from 'vitest';

import {
  describeChanges,
  readDay,
  validateChanges,
  type AiChange,
  type ChangeContext,
  type CurrentValues,
} from './aiChanges';

/**
 * The day's answers the chat can LOG rather than tune. Same contract as every
 * suggestion: the model's items are untrusted, an id the context never named is
 * dropped, nothing lands in the future, and the card is drawn from what survived.
 */

const TODAY = '2026-10-29';

function ctx(over: Partial<ChangeContext> = {}): ChangeContext {
  return {
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
    today: TODAY,
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

describe("answering a task's day", () => {
  it('ticks a task done, today by default', () => {
    expect(
      validateChanges([{ target: 'task', id: 't_read', field: 'done' }], ctx()),
    ).toEqual([{ target: 'task', id: 't_read', field: 'done', value: null, day: TODAY }]);
  });

  it('reads the words a model uses: tick, skip, untick', () => {
    const changes = validateChanges(
      [
        { target: 'task', id: 't_read', field: 'tick', day: '2026-10-27' },
        { target: 'task', id: 't_read', field: 'skip', day: '2026-10-28' },
        { target: 'task', id: 't_water', field: 'untick' },
      ],
      ctx(),
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
      ctx(),
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
        ctx(),
      ),
    ).toEqual([]);
  });

  it('needs a today to answer a day at all', () => {
    expect(
      validateChanges([{ target: 'task', id: 't_read', field: 'done' }], {
        ...ctx(),
        today: undefined,
      }),
    ).toEqual([]);
  });
});

describe('the card rows for logged things', () => {
  const now: CurrentValues = {
    tasks: ctx().tasks,
    formatDay: (day) => (day === '2026-10-27' ? '27 Oct' : day),
  };

  it('says what will be written, in plain words', () => {
    const changes: AiChange[] = [
      { target: 'task', id: 't_read', field: 'done', value: null, day: '2026-10-27' },
    ];
    expect(describeChanges(changes, now, 'en')).toEqual([
      { subject: 'Read', label: '27 Oct', from: '', to: 'Done' },
    ]);
  });
});
