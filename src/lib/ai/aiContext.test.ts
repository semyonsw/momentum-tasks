import { describe, expect, it } from 'vitest';

import { CONTEXT_CAP, buildTasksContext } from './aiContext';
import type { Task, TaskLog } from '../tasks';

/**
 * The context builder. It is held to four promises: it stays under the cap, it
 * reads the log the way every other screen reads it (an excused day is not a
 * miss, today is not missed while it is being lived), it says how much it read,
 * and it never ships the whole database.
 */

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  name: id,
  schedule: { kind: 'daily' },
  auto: null,
  startedOn: '2026-09-01',
  reminder: null,
  archivedAt: null,
  order: 0,
  ...over,
});

const twoWeeksMet: TaskLog = {
  gym: Object.fromEntries(
    ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-21', '2026-09-22', '2026-09-23'].map(
      (day) => [day, { mark: 'done' as const, note: '' }],
    ),
  ),
};

describe('the tasks context', () => {
  const log: TaskLog = {
    read: {
      '2026-09-24': { mark: 'done', note: '' },
      '2026-09-25': { mark: 'missed', note: '' },
      '2026-09-26': { mark: 'done', note: '' },
    },
  };
  const built = buildTasksContext({
    tasks: [task('read', { startedOn: '2026-09-24' })],
    log,
    today: '2026-09-27',
    lang: 'en',
  });
  const json = JSON.parse(built.json);

  it('carries the notes written on days, newest first, with the mark', () => {
    const noted = JSON.parse(
      buildTasksContext({
        tasks: [task('read', { startedOn: '2026-09-24' })],
        log: {
          read: {
            '2026-09-24': { mark: 'done', note: 'chapter 3' },
            '2026-09-25': { mark: 'missed', note: '  sick   today ' },
            '2026-01-01': { mark: 'done', note: 'from winter' },
          },
        },
        today: '2026-09-27',
        lang: 'en',
      }).json,
    );
    // The whole history by default — the January note is not "too old" any more.
    expect(noted.notes).toEqual([
      '2026-09-25 read (excused): sick today',
      '2026-09-24 read (done): chapter 3',
      '2026-01-01 read (done): from winter',
    ]);
  });

  it('counts an excused day as excused, never as a miss', () => {
    expect(json.tasks[0]).toMatchObject({ asked: 4, done: 2, excused: 1, missed: 0 });
  });

  it('does not count today as missed while it is still being lived', () => {
    expect(json.tasks[0].missed).toBe(0);
  });

  it('keeps the streak across the excused day', () => {
    expect(json.tasks[0].streak).toBe(2);
    expect(json.tasks[0].bestStreak).toBe(2);
  });

  it('leaves days that asked for nothing out of the daily line', () => {
    // Four days asked; the 25th was excused out of its denominator.
    expect(json.dailyDonePct).toEqual(['2026-09-24:100', '2026-09-26:100', '2026-09-27:0']);
    expect(built.dayCount).toBe(3);
  });

  it('names the days themselves, so a date can be answered', () => {
    expect(json.tasks[0].doneOn).toEqual(['2026-09-24', '2026-09-26']);
    expect(json.tasks[0].excusedOn).toEqual(['2026-09-25']);
  });

  it('keeps an archived task’s past, marked as archived', () => {
    const archived = JSON.parse(
      buildTasksContext({
        tasks: [task('read', { startedOn: '2026-09-24', archivedAt: '2026-09-27T12:00:00.000Z' })],
        log,
        today: '2026-09-27',
        lang: 'en',
      }).json,
    );
    expect(archived.tasks[0]).toMatchObject({ id: 'read', done: 2, archivedOn: '2026-09-27' });
  });

  it('counts an unanswered past day as missed', () => {
    const missed = buildTasksContext({
      tasks: [task('read', { startedOn: '2026-09-20' })],
      log,
      today: '2026-09-27',
      lang: 'en',
    });
    expect(JSON.parse(missed.json).tasks[0].missed).toBe(4);
  });

  it('carries a target, and the days short of it, with a note only when one exists (T1)', () => {
    const counted = JSON.parse(
      buildTasksContext({
        tasks: [task('water', { startedOn: '2026-09-25', target: { count: 8, unit: 'glasses' } })],
        log: {
          water: {
            '2026-09-25': { mark: 'done', note: '', count: 8 },
            '2026-09-26': { mark: null, note: '', count: 3 },
          },
        },
        today: '2026-09-27',
        lang: 'en',
      }).json,
    );
    expect(counted.tasks[0]).toMatchObject({
      target: '8 glasses a day',
      done: 1,
      missed: 1,
      partialOn: ['2026-09-26:3'],
    });
    expect(counted.targetNote).toContain('partialOn');
    expect(json.targetNote).toBeUndefined();
    expect(json.tasks[0].target).toBeUndefined();
  });

  it('says a weekly task’s streak is in weeks; a daily task’s row is unchanged', () => {
    const tasks = [
      task('gym', { startedOn: '2026-09-14', schedule: { kind: 'weekly', times: 3 } }),
      task('read', { startedOn: '2026-09-24' }),
    ];
    const both = JSON.parse(
      buildTasksContext({ tasks, log: { ...log, ...twoWeeksMet }, today: '2026-09-27', lang: 'en' })
        .json,
    );
    expect(both.tasks[0]).toMatchObject({ id: 'gym', streak: 2, streakUnit: 'weeks' });
    // The daily row says what it always said: a streak in days, and its best run.
    expect(both.tasks[1]).toEqual(json.tasks[0]);
    expect(both.tasks[1].streakUnit).toBeUndefined();
  });

  it('stays under the cap with a year of daily tasks', () => {
    const tasks = Array.from({ length: 12 }, (_, i) =>
      task(`t${i}`, { name: `A task with a long name number ${i}`, startedOn: '2025-01-01' }),
    );
    expect(
      buildTasksContext({ tasks, log: {}, today: '2026-09-27', lang: 'en', days: 365 }).json.length,
    ).toBeLessThanOrEqual(CONTEXT_CAP);
  });
});

