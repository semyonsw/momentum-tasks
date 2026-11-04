import { describe, expect, it } from 'vitest';

import {
  describeChanges,
  validateChanges,
  type AiChange,
  type ChangeContext,
  type CurrentValues,
} from './aiChanges';
import type { Task } from '../tasks';

/**
 * The changes card, from what the model wrote to what Apply writes. The model's
 * items are untrusted, so every test here is a shape it could send — and the
 * rule is the one every suggestion keeps: an id the context never named, or a
 * field the task cannot take, is dropped, never forced; a number is held to its
 * own editor's range.
 */

type TaskRow = Pick<Task, 'id' | 'name' | 'schedule' | 'target' | 'archivedAt'>;
const TASKS: TaskRow[] = [
  {
    id: 't_read',
    name: 'Read',
    schedule: { kind: 'daily' },
    target: { count: 20, unit: 'pages' },
    archivedAt: null,
  },
  { id: 't_run', name: 'Run', schedule: { kind: 'weekdays', days: [0, 2] }, archivedAt: null },
  { id: 't_gone', name: 'Gone', schedule: { kind: 'daily' }, archivedAt: '2026-09-01T00:00:00Z' },
];
const CTX: ChangeContext = { tasks: TASKS };
const tasks = (items: unknown[]) => validateChanges(items, CTX);

describe('the same thing twice in one card', () => {
  it('one new task of a name, whatever its case', () => {
    const out = tasks([
      { target: 'task', field: 'add', text: 'Stretch' },
      { target: 'task', field: 'add', text: 'stretch', number: 3 },
    ]);
    expect(out).toEqual([
      { target: 'task', field: 'add', value: 'stretch', schedule: { kind: 'weekly', times: 3 } },
    ]);
  });
});

describe('tasks', () => {
  const task = (item: Record<string, unknown>) =>
    tasks([{ target: 'task', ...item }])[0] as Extract<AiChange, { target: 'task' }> | undefined;

  it('add: a name, daily when nothing says otherwise', () => {
    expect(task({ field: 'add', text: '  Drink  water ' })).toEqual({
      target: 'task',
      field: 'add',
      value: 'Drink water',
      schedule: { kind: 'daily' },
    });
    expect(task({ field: 'create', text: 'Meditate' })?.field).toBe('add');
    expect(task({ field: 'new', text: '' })).toBeUndefined();
    expect(task({ field: 'add' })).toBeUndefined();
  });

  it('add: days make weekdays, all seven make daily, a number makes N a week', () => {
    expect(task({ field: 'add', text: 'Gym', days: [4, 0, 2, 2] })?.schedule).toEqual({
      kind: 'weekdays',
      days: [0, 2, 4],
    });
    expect(task({ field: 'add', text: 'Gym', days: [0, 1, 2, 3, 4, 5, 6] })?.schedule).toEqual({
      kind: 'daily',
    });
    expect(task({ field: 'add', text: 'Gym', number: 3 })?.schedule).toEqual({
      kind: 'weekly',
      times: 3,
    });
    expect(task({ field: 'add', text: 'Gym', number: 7 })?.schedule).toEqual({ kind: 'daily' });
    expect(task({ field: 'add', text: 'Gym', number: 12 })?.schedule).toEqual({ kind: 'daily' });
    // Days that are not days are dropped; a number-ish string is read.
    expect(task({ field: 'add', text: 'Gym', days: [7, -1, 1.5, '2', 'x'] })?.schedule).toEqual({
      kind: 'weekdays',
      days: [2],
    });
    // Nothing usable in days: falls back to daily.
    expect(task({ field: 'add', text: 'Gym', days: [9] })?.schedule).toEqual({ kind: 'daily' });
  });

  it('add: refused when a live task already has the name; an archived one does not count', () => {
    expect(task({ field: 'add', text: 'read' })).toBeUndefined();
    expect(task({ field: 'add', text: ' READ ' })).toBeUndefined();
    expect(task({ field: 'add', text: 'Gone' })?.value).toBe('Gone');
  });

  it('name: a new name only, on a live task the context named', () => {
    expect(task({ id: 't_read', field: 'rename', text: 'Read a book' })).toEqual({
      target: 'task',
      id: 't_read',
      field: 'name',
      value: 'Read a book',
    });
    expect(task({ id: 't_read', field: 'name', text: 'Read' })).toBeUndefined();
    expect(task({ id: 't_nope', field: 'name', text: 'X' })).toBeUndefined();
    expect(task({ id: 't_gone', field: 'name', text: 'Back' })).toBeUndefined();
    expect(task({ field: 'name', text: 'No id' })).toBeUndefined();
  });

  it('schedule: days, a number, or the word daily — nothing is no change', () => {
    expect(task({ id: 't_read', field: 'schedule', days: [1, 3] })?.schedule).toEqual({
      kind: 'weekdays',
      days: [1, 3],
    });
    expect(task({ id: 't_run', field: 'schedule', text: 'daily' })?.schedule).toEqual({
      kind: 'daily',
    });
    expect(task({ id: 't_run', field: 'schedule', text: 'every day' })?.schedule).toEqual({
      kind: 'daily',
    });
    expect(task({ id: 't_run', field: 'schedule', number: 2 })?.schedule).toEqual({
      kind: 'weekly',
      times: 2,
    });
    expect(task({ id: 't_run', field: 'schedule', days: [0, 1, 2, 3, 4, 5, 6] })?.schedule).toEqual(
      { kind: 'daily' },
    );
    expect(task({ id: 't_run', field: 'schedule' })).toBeUndefined();
    expect(task({ id: 't_run', field: 'schedule', number: 0 })).toBeUndefined();
  });

  it('target: a count with its unit; zero removes one that is there', () => {
    expect(task({ id: 't_run', field: 'target', number: 8, text: 'glasses' })).toEqual({
      target: 'task',
      id: 't_run',
      field: 'target',
      value: 8,
      unit: 'glasses',
    });
    // No unit said: the one it has.
    expect(task({ id: 't_read', field: 'target', number: 30 })?.unit).toBe('pages');
    expect(task({ id: 't_run', field: 'target', number: 5 })?.unit).toBe('');
    expect(task({ id: 't_read', field: 'target', number: 5000 })?.value).toBe(999);
    expect(task({ id: 't_read', field: 'target', number: 0 })?.value).toBeNull();
    // Nothing to remove.
    expect(task({ id: 't_run', field: 'target', number: 0 })).toBeUndefined();
    expect(task({ id: 't_run', field: 'target' })).toBeUndefined();
  });

  it('archive: on a live task', () => {
    expect(task({ id: 't_run', field: 'stop' })).toEqual({
      target: 'task',
      id: 't_run',
      field: 'archive',
      value: true,
    });
    expect(task({ id: 't_gone', field: 'archive' })).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */

const NOW: CurrentValues = { tasks: TASKS };
const rows = (changes: AiChange[]) => describeChanges(changes, NOW, 'en');

describe('what the card says', () => {
  it('tasks: add, rename, schedule, target, archive', () => {
    const out = rows([
      { target: 'task', field: 'add', value: 'Stretch', schedule: { kind: 'weekly', times: 3 } },
      { target: 'task', field: 'add', value: 'Floss' },
      { target: 'task', id: 't_read', field: 'name', value: 'Read a book' },
      {
        target: 'task',
        id: 't_run',
        field: 'schedule',
        value: null,
        schedule: { kind: 'daily' },
      },
      {
        target: 'task',
        id: 't_read',
        field: 'schedule',
        value: null,
        schedule: { kind: 'weekdays', days: [0, 4] },
      },
      { target: 'task', id: 't_read', field: 'target', value: 30, unit: 'pages' },
      { target: 'task', id: 't_read', field: 'target', value: null },
      { target: 'task', id: 't_run', field: 'target', value: 5, unit: '' },
      { target: 'task', id: 't_run', field: 'archive', value: true },
    ]);
    expect(out.map(({ subject, label, from, to }) => [subject, label, from, to])).toEqual([
      ['Stretch', 'New task', '', '3× a week'],
      ['Floss', 'New task', '', 'Every day'],
      ['Read', 'Name', 'Read', 'Read a book'],
      ['Run', 'Schedule', 'Mon Wed', 'Every day'],
      ['Read', 'Schedule', 'Every day', 'Mon Fri'],
      ['Read', 'Daily target', '20 pages', '30 pages'],
      ['Read', 'Daily target', '20 pages', 'None'],
      ['Run', 'Daily target', 'None', '5'],
      ['Run', 'Stop this task', '', 'Archived'],
    ]);
  });

  it('draws no row for something that is not there', () => {
    expect(rows([{ target: 'task', id: 't_nope', field: 'archive', value: true }])).toEqual([]);
  });

  it('is translated', () => {
    const [row] = describeChanges(
      [{ target: 'task', id: 't_read', field: 'name', value: 'Read a book' }],
      NOW,
      'ru',
    );
    expect(row.label).not.toBe('Name');
    expect(row.subject).toBe('Read');
  });
});
