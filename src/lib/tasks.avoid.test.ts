import { describe, expect, it } from 'vitest';

import { buildTasksContext } from './ai/aiContext';
import { habitStrength } from './habitStrength';
import { t } from './i18n';
import {
  answerWord,
  dayProgress,
  describeTaskRow,
  doneWord,
  streakOf,
  taskMonth,
  type Task,
  type TaskLog,
  type TaskMark,
} from './tasks';

/**
 * Habits to avoid (T7): "No sugar" is done on a day it was AVOIDED.
 *
 * Two things are pinned. The words: every place that says "Done" about the task
 * says "Avoided" instead, in both languages. And the arithmetic, which is a
 * normal task's exactly — an avoided day is a done day for the streak, the
 * denominator and the score, and an unanswered past day is NOT assumed to be a
 * day held off: it breaks the streak like any other unanswered day.
 */

function task(over: Partial<Task> = {}): Task {
  return {
    id: 'sugar',
    name: 'No sugar',
    schedule: { kind: 'daily' },
    auto: null,
    startedOn: '2026-09-01',
    reminder: null,
    archivedAt: null,
    order: 0,
    avoid: true,
    ...over,
  };
}

function marks(byDay: Record<string, TaskMark>, id = 'sugar'): TaskLog {
  return {
    [id]: Object.fromEntries(Object.entries(byDay).map(([day, mark]) => [day, { mark, note: '' }])),
  };
}

const avoid = task();
const plain = task({ id: 'plain', avoid: undefined });

describe('labelling', () => {
  it('says Avoided where an ordinary task says Done, in English and Russian', () => {
    expect(doneWord(avoid)).toBe('Avoided');
    expect(doneWord(plain)).toBe('Done');
    expect(t(answerWord(avoid, 'done'), 'en')).toBe('Avoided');
    expect(t(answerWord(avoid, 'done'), 'ru')).toBe('Удалось избежать');
    expect(t(answerWord(plain, 'done'), 'ru')).toBe('Сделано');
  });

  it('keeps the other answers as they are', () => {
    expect(answerWord(avoid, 'missed')).toBe('Missed on purpose');
    expect(answerWord(avoid, null)).toBe('Not answered');
  });

  it('the row says which way round it is, and "avoided" once held off', () => {
    const log = marks({ '2026-09-10': 'done' });
    expect(describeTaskRow(avoid, log, '2026-09-10', 'en', false)).toBe('Every day · avoided');
    expect(describeTaskRow(avoid, {}, '2026-09-10', 'en', false)).toBe('Every day · avoid this');
    expect(describeTaskRow(avoid, log, '2026-09-10', 'ru', false)).toBe(
      'Каждый день · удалось избежать',
    );
    expect(describeTaskRow(plain, {}, '2026-09-10', 'en', false)).toBe('Every day');
  });
});

describe('streak semantics: an avoided day is a done day', () => {
  it('counts avoided days in a row, and steps over an excused one', () => {
    const log = marks({
      '2026-09-07': 'done',
      '2026-09-08': 'missed',
      '2026-09-09': 'done',
      '2026-09-10': 'done',
    });
    expect(streakOf(avoid, log, '2026-09-11')).toBe(3);
    expect(streakOf(avoid, log, '2026-09-11')).toBe(
      streakOf(plain, { plain: log.sugar }, '2026-09-11'),
    );
  });

  it('does not assume an unanswered past day was held off: it breaks the streak', () => {
    const log = marks({ '2026-09-07': 'done', '2026-09-09': 'done', '2026-09-10': 'done' });
    expect(streakOf(avoid, log, '2026-09-11')).toBe(2);
  });

  it('counts in the day, the month and the score exactly as a normal task', () => {
    const log = marks({ '2026-09-09': 'done', '2026-09-10': 'done' });
    const same = { plain: log.sugar };
    expect(dayProgress([avoid], log, '2026-09-10')).toEqual(
      dayProgress([plain], same, '2026-09-10'),
    );
    const month = taskMonth(avoid, log, 2026, 8, '2026-09-11');
    expect(month).toMatchObject({ done: 2, asked: 11 });
    expect(habitStrength(avoid, log, '2026-09-11')).toBeCloseTo(
      habitStrength(plain, same, '2026-09-11') as number,
    );
  });
});

describe('the assistant', () => {
  it('is told the task is one to avoid, and what done means there', () => {
    const json = JSON.parse(
      buildTasksContext({
        tasks: [avoid],
        log: marks({ '2026-09-09': 'done' }),
        today: '2026-09-11',
        lang: 'en',
      }).json,
    );
    expect(json.tasks[0].avoid).toBe(true);
    expect(json.avoidNote).toContain('avoided');
    const none = JSON.parse(
      buildTasksContext({ tasks: [plain], log: {}, today: '2026-09-11', lang: 'en' }).json,
    );
    expect(none.avoidNote).toBeUndefined();
  });
});
