import { describe, expect, it } from 'vitest';

import type { Task, TaskLog } from './tasks';
import {
  lastMonth,
  periodRange,
  previousPeriod,
  wrappedCards,
  wrappedEntry,
  wrappedStats,
  wrappedSummary,
  yearlyWrappedOffer,
  type WrappedInput,
} from './wrapped';

/**
 * Wrapped (X1). What matters: every figure is a fact on a fixture you can count
 * by hand; a period with nothing in it has NO Wrapped; both languages have every
 * word; and the year is offered exactly in its window.
 */

const SEPT = { kind: 'month', year: 2026, month: 8 } as const;
const TODAY = '2026-10-05';

function task(id: string, name: string, order: number, over: Partial<Task> = {}): Task {
  return {
    id,
    name,
    schedule: { kind: 'daily' },
    auto: null,
    startedOn: '2026-08-01',
    reminder: null,
    archivedAt: null,
    order,
    ...over,
  };
}

const mark = (log: TaskLog, taskId: string, days: string[], value: 'done' | 'missed' = 'done') => {
  log[taskId] = { ...(log[taskId] ?? {}) };
  for (const day of days) log[taskId][day] = { mark: value, note: '' };
};

const septDays = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `2026-09-${String(from + i).padStart(2, '0')}`);

/** The fixture: two daily tasks across September, one with an excused day. */
function fixture(): WrappedInput {
  const tasks = [task('read', 'Reading', 0), task('walk', 'Walk', 1)];
  const log: TaskLog = {};
  mark(log, 'read', septDays(1, 12)); // 12 in a row
  mark(log, 'read', ['2026-09-13'], 'missed'); // excused: steps over
  mark(log, 'read', septDays(14, 20)); // …19 in a row through the 20th
  mark(log, 'walk', septDays(1, 25));
  return { period: SEPT, today: TODAY, tasks, log };
}

describe('periods and offers', () => {
  it('spans the whole month, leap Februaries included, and the whole year', () => {
    expect(periodRange(SEPT)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(periodRange({ kind: 'month', year: 2028, month: 1 }).to).toBe('2028-02-29');
    expect(periodRange({ kind: 'year', year: 2026 })).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
    });
  });

  it('steps back across the year seam', () => {
    expect(previousPeriod({ kind: 'month', year: 2027, month: 0 })).toEqual({
      kind: 'month',
      year: 2026,
      month: 11,
    });
    expect(lastMonth('2027-01-20')).toEqual({ kind: 'month', year: 2026, month: 11 });
  });

  it('offers the year from 1 December to 31 January', () => {
    expect(yearlyWrappedOffer('2026-11-30')).toBeNull();
    expect(yearlyWrappedOffer('2026-12-01')).toEqual({ kind: 'year', year: 2026 });
    expect(yearlyWrappedOffer('2026-12-31')).toEqual({ kind: 'year', year: 2026 });
    expect(yearlyWrappedOffer('2027-01-01')).toEqual({ kind: 'year', year: 2026 });
    expect(yearlyWrappedOffer('2027-01-31')).toEqual({ kind: 'year', year: 2026 });
    expect(yearlyWrappedOffer('2027-02-01')).toBeNull();
  });
});

describe('wrappedStats on the fixture', () => {
  const stats = wrappedStats(fixture())!;

  it('takes the longest run of any task, excused days stepped over', () => {
    expect(stats.streak).toMatchObject({
      taskName: 'Walk',
      days: 25,
      from: '2026-09-01',
      to: '2026-09-25',
    });
    const input = fixture();
    mark(input.log, 'read', septDays(21, 30));
    // Reading: 1–12, (13 excused), 14–30 = 29 days, now the longer one.
    expect(wrappedStats(input)!.streak).toMatchObject({ taskName: 'Reading', days: 29 });
  });

  it('shares tasks done over asked, excused days out of both', () => {
    // Asked: 30 + 30 − 1 excused = 59. Done: 19 + 25 = 44.
    expect(stats.tasks).toEqual({ done: 44, asked: 59, percent: 75 });
  });

  it('reads the busiest weekday off the done share', () => {
    const input = fixture();
    const log: TaskLog = {};
    // Every Tuesday done, everything else half done.
    for (const day of septDays(1, 30)) {
      const tuesday = new Date(`${day}T12:00:00`).getDay() === 2;
      log.read = { ...(log.read ?? {}), [day]: { mark: 'done', note: '' } };
      if (tuesday) log.walk = { ...(log.walk ?? {}), [day]: { mark: 'done', note: '' } };
    }
    input.log = log;
    const weekday = wrappedStats(input)!.weekday!;
    expect(weekday.weekday).toBe(1);
    expect(weekday.tasksPercent).toBe(100);
    expect(weekday.quietest?.percent).toBe(50);
  });

  it('covers a year as one period', () => {
    const year = wrappedStats({ ...fixture(), period: { kind: 'year', year: 2026 } })!;
    // August asked too, and nothing was done in it.
    expect(year.tasks?.done).toBe(44);
    expect(year.tasks!.asked).toBeGreaterThan(59);
  });
});

describe('an empty period', () => {
  it('is null when nothing was asked in it', () => {
    expect(wrappedStats({ ...fixture(), tasks: [], log: {} })).toBeNull();
  });

  it('drops a streak of a single day', () => {
    const input = fixture();
    input.log = {};
    mark(input.log, 'read', ['2026-09-03']);
    expect(wrappedStats(input)!.streak).toBeNull();
  });
});

describe('the words', () => {
  const stats = wrappedStats(fixture())!;

  it('writes the cards, title first and summary last', () => {
    const cards = wrappedCards(stats, 'en');
    expect(cards.map((c) => c.key)).toEqual(['title', 'streak', 'weekday', 'summary']);
    expect(cards[0]).toMatchObject({ kicker: 'September 2026', big: 'Your month' });
    expect(cards[0].line).toBe('44 tasks done.');
    expect(cards[1]).toMatchObject({ kicker: 'Longest streak', big: '25', unit: 'days' });
  });

  it('lays out the summary', () => {
    expect(wrappedSummary(stats, 'en').cells).toEqual([
      { key: 'tasks', label: 'Tasks done', value: '75%' },
      { key: 'streak', label: 'Longest streak', value: '25 d' },
    ]);
  });

  it('labels the entry with the card count, in both languages', () => {
    expect(wrappedEntry(SEPT, 4, 'en')).toEqual({
      title: 'September, wrapped',
      detail: '4 cards · your month in numbers',
    });
    expect(wrappedEntry(SEPT, 4, 'ru').title).toBe('Сентябрь в итогах');
    expect(wrappedEntry({ kind: 'year', year: 2026 }, 3, 'ru').detail).toBe(
      '3 карточки · ваш год в цифрах',
    );
  });

  it('has every word of every card in Russian', () => {
    // The user's own task names stay as written.
    const own = ['Reading', 'Walk'];
    const latin = (text: string) => own.reduce((rest, word) => rest.split(word).join(''), text);
    const ru = wrappedCards(stats, 'ru');
    for (const card of ru) {
      for (const field of [card.kicker, card.big, card.unit, card.line, card.sub]) {
        expect(latin(field), `${card.key}: ${field}`).not.toMatch(/[A-Za-z]/);
      }
    }
    const summary = wrappedSummary(stats, 'ru');
    for (const text of [
      summary.kicker,
      summary.title,
      ...summary.cells.flatMap((c) => [c.label, c.value]),
    ]) {
      expect(latin(text), text).not.toMatch(/[A-Za-z]/);
    }
  });

  it('speaks Russian plurals', () => {
    const cards = Object.fromEntries(wrappedCards(stats, 'ru').map((c) => [c.key, c]));
    expect(cards.title.line).toBe('44 выполненные задачи.');
    expect(cards.streak.unit).toBe('дней');
  });
});
