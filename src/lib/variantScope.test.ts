import { describe, expect, it } from 'vitest';

import { maybeScope, scopeLogs, variantLog } from './variantScope';

/**
 * The one filter every cross-log feature goes through. What it must do: keep
 * the app's own log exactly, empty the others, and touch nothing else.
 */

const input = () => ({
  today: '2026-10-09',
  workouts: [{ id: 'w' }],
  numbers: { w: 1 },
  tasks: [{ id: 't' }],
  log: { t: { '2026-10-01': { mark: 'done' } } },
  amounts: [{ id: 'a' }],
  categories: [{ id: 'food' }],
  budgets: [{ id: 'b' }],
  goals: [{ id: 'g' }],
  accounts: [{ id: 'cash' }],
});

describe('scopeLogs', () => {
  it('Workout keeps the training log and empties the rest', () => {
    const out = scopeLogs('workout', input());
    expect(out.workouts).toEqual([{ id: 'w' }]);
    expect(out.numbers).toEqual({ w: 1 });
    expect(out.tasks).toEqual([]);
    expect(out.log).toEqual({});
    expect(out.amounts).toEqual([]);
    expect(out.categories).toEqual([]);
    expect(out.budgets).toEqual([]);
    expect(out.goals).toEqual([]);
    expect(out.accounts).toEqual([]);
    expect(out.today).toBe('2026-10-09');
  });

  it('Tasks keeps the tasks and their log', () => {
    const out = scopeLogs('tasks', input());
    expect(out.tasks).toEqual([{ id: 't' }]);
    expect(out.log).toEqual(input().log);
    expect(out.workouts).toEqual([]);
    expect(out.numbers).toEqual({});
    expect(out.amounts).toEqual([]);
  });

  it('Expenses keeps every money series', () => {
    const out = scopeLogs('expenses', input());
    expect(out.amounts).toEqual([{ id: 'a' }]);
    expect(out.categories).toEqual([{ id: 'food' }]);
    expect(out.budgets).toEqual([{ id: 'b' }]);
    expect(out.goals).toEqual([{ id: 'g' }]);
    expect(out.accounts).toEqual([{ id: 'cash' }]);
    expect(out.workouts).toEqual([]);
    expect(out.tasks).toEqual([]);
  });

  it('adds no key the input did not have, and never mutates it', () => {
    const small = { today: 'x', workouts: [1], amounts: [2] };
    const out = scopeLogs('workout', small);
    expect(Object.keys(out).sort()).toEqual(['amounts', 'today', 'workouts']);
    expect(small.amounts).toEqual([2]);
  });

  it('maybeScope without a variant is the input itself (the 2.x reading)', () => {
    const raw = input();
    expect(maybeScope(undefined, raw)).toBe(raw);
  });

  it("names each app's log", () => {
    expect(variantLog('workout')).toBe('workout');
    expect(variantLog('tasks')).toBe('tasks');
    expect(variantLog('expenses')).toBe('money');
  });
});
