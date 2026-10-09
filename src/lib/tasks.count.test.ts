import { describe, expect, it } from 'vitest';

import { habitStrength } from './habitStrength';
import { nextUnansweredTask } from './landing';
import {
  clearExcused,
  dayProgress,
  describeProgress,
  describeTarget,
  describeTaskRow,
  excuseRange,
  progressOf,
  stepTarget,
  streakOf,
  tappedCount,
  withCount,
  type Task,
  type TaskEntry,
  type TaskLog,
} from './tasks';
import { weeklyReview } from './weeklyReview';
import { yearPixels } from './yearPixels';

/**
 * Counted tasks (T1): "8 glasses", filled a part at a time.
 *
 * The idea these pin is that a counted day still answers with the ordinary
 * MARK — `done` exactly when the count reaches the target, unanswered below it —
 * so the streak, the denominator, habit strength, the year and the weekly review
 * all agree about it without a line of their own. A partial day is not a kept
 * day: in the past it breaks the streak like any unanswered day.
 */

function task(over: Partial<Task> = {}): Task {
  return {
    id: 'water',
    name: 'Water',
    schedule: { kind: 'daily' },
    auto: null,
    startedOn: '2026-09-01',
    reminder: null,
    archivedAt: null,
    order: 0,
    target: { count: 8, unit: 'glasses' },
    ...over,
  };
}

const counted = task() as Task & { target: { count: number; unit: string } };
const EMPTY: TaskEntry = { mark: null, note: '' };

/** Days → counts, each judged against `target` the way the store writes them. */
function counts(byDay: Record<string, number>, target = 8, id = 'water'): TaskLog {
  const days: Record<string, TaskEntry> = {};
  for (const [day, n] of Object.entries(byDay)) days[day] = withCount(EMPTY, n, target);
  return { [id]: days };
}

describe('progress math', () => {
  it('fills a part per tap and is done at the target', () => {
    let entry = EMPTY;
    for (let i = 1; i <= 8; i += 1) {
      entry = withCount(entry, tappedCount(counted, entry), 8);
      expect(progressOf(counted, entry)).toBe(i);
      expect(entry.mark).toBe(i === 8 ? 'done' : null);
    }
  });

  it('goes back to zero from a finished day, the only way a tap takes one back', () => {
    const full = withCount(EMPTY, 8, 8);
    expect(tappedCount(counted, full)).toBe(0);
    expect(withCount(full, 0, 8)).toEqual(EMPTY);
  });

  it('a number past the target is kept, and done', () => {
    const over = withCount(EMPTY, 11, 8);
    expect(over).toEqual({ mark: 'done', note: '', count: 11 });
    expect(describeProgress(counted, over)).toBe('11 / 8 glasses');
  });

  it('keeps the note, and never stores a negative or fractional count', () => {
    expect(withCount({ mark: null, note: 'tea counts' }, 3, 8)).toEqual({
      mark: null,
      note: 'tea counts',
      count: 3,
    });
    expect(withCount(EMPTY, -4, 8)).toEqual(EMPTY);
    expect(withCount(EMPTY, 2.6, 8).count).toBe(3);
    expect(withCount(EMPTY, Number.NaN, 8)).toEqual(EMPTY);
  });

  it('a part done takes a skip back; zero leaves the skip standing', () => {
    const skipped: TaskEntry = { mark: 'missed', note: '' };
    expect(withCount(skipped, 1, 8).mark).toBeNull();
    expect(withCount(skipped, 0, 8).mark).toBe('missed');
  });

  it('a day ticked with no count reads as the whole target, never 0 / 8', () => {
    expect(progressOf(counted, { mark: 'done', note: '' })).toBe(8);
    expect(progressOf(counted, { mark: 'done', note: '', count: 3 })).toBe(8);
    expect(progressOf(task({ target: undefined }), { mark: 'done', note: '' })).toBeNull();
  });

  it('says the unit, and "times" when there is none', () => {
    expect(describeProgress(counted, withCount(EMPTY, 3, 8))).toBe('3 / 8 glasses');
    const bare = task({ target: { count: 20, unit: '' } });
    expect(describeProgress(bare, EMPTY)).toBe('0 / 20 times');
    expect(describeProgress(bare, EMPTY, 'ru')).toBe('0 / 20 раз');
    expect(describeTarget(counted)).toBe('8 glasses a day');
    expect(describeTarget(task({ target: undefined }))).toBeNull();
  });

  it('the row line leads with the progress', () => {
    const log = counts({ '2026-09-10': 3 });
    expect(describeTaskRow(counted, log, '2026-09-10', 'en', false)).toBe(
      '3 / 8 glasses · Every day',
    );
  });
});

describe('the editor’s ± on a target', () => {
  it('steps by 1 to 20, by 5 to 100, by 10 past it, and back down on the same grid', () => {
    const up: number[] = [];
    for (let n = 1; up.length < 40;) up.push((n = stepTarget(n, 1)));
    expect(up.slice(0, 19)).toEqual(Array.from({ length: 19 }, (_, i) => i + 2));
    expect(up.slice(19, 25)).toEqual([25, 30, 35, 40, 45, 50]);
    expect(stepTarget(95, 1)).toBe(100);
    expect(stepTarget(100, 1)).toBe(110);
    expect(stepTarget(110, -1)).toBe(100);
    expect(stepTarget(100, -1)).toBe(95);
    expect(stepTarget(20, -1)).toBe(19);
    expect(stepTarget(25, -1)).toBe(20);
  });

  it('snaps an odd value onto the grid, and stays inside 1…999', () => {
    expect(stepTarget(23, 1)).toBe(25);
    expect(stepTarget(23, -1)).toBe(20);
    expect(stepTarget(1, -1)).toBe(1);
    expect(stepTarget(999, 1)).toBe(999);
    expect(stepTarget(990, 1)).toBe(999);
  });
});

describe('the streak at a partial day', () => {
  it('a past partial day breaks the streak like an unanswered one', () => {
    const log = counts({ '2026-09-07': 8, '2026-09-08': 5, '2026-09-09': 8, '2026-09-10': 8 });
    expect(streakOf(counted, log, '2026-09-11')).toBe(2);
  });

  it('a partial TODAY neither counts nor breaks', () => {
    const log = counts({ '2026-09-09': 8, '2026-09-10': 8, '2026-09-11': 3 });
    expect(streakOf(counted, log, '2026-09-11')).toBe(2);
    const done = counts({ '2026-09-09': 8, '2026-09-10': 8, '2026-09-11': 8 });
    expect(streakOf(counted, done, '2026-09-11')).toBe(3);
  });

  it('a day judged done stays done when the target is raised later', () => {
    const log = counts({ '2026-09-09': 8, '2026-09-10': 8 });
    const raised = task({ target: { count: 10, unit: 'glasses' } });
    expect(streakOf(raised, log, '2026-09-11')).toBe(2);
  });
});

describe('every reader treats a counted day as done iff the target was reached', () => {
  const log = counts({ '2026-09-28': 8, '2026-09-29': 3, '2026-09-30': 8, '2026-10-01': 0 });

  it('the day ring', () => {
    expect(dayProgress([counted], log, '2026-09-28')).toEqual({ done: 1, total: 1, fraction: 1 });
    expect(dayProgress([counted], log, '2026-09-29')).toEqual({ done: 0, total: 1, fraction: 0 });
  });

  it('habit strength scores a partial day as a miss', () => {
    const full = counts({ '2026-09-28': 8, '2026-09-29': 8, '2026-09-30': 8 });
    const partial = counts({ '2026-09-28': 8, '2026-09-29': 7, '2026-09-30': 8 });
    const today = '2026-10-01';
    expect(habitStrength(counted, partial, today)!).toBeLessThan(
      habitStrength(counted, full, today)!,
    );
    // A partial day scores exactly what an unanswered day scores.
    expect(habitStrength(counted, partial, today)).toBeCloseTo(
      habitStrength(counted, { water: { ...partial.water, '2026-09-29': EMPTY } }, today)!,
    );
  });

  it('the year in pixels', () => {
    const year = yearPixels([counted], log, 2026, '2026-10-02', 'water');
    expect(year.months[8].cells[27].done).toBe(1);
    expect(year.months[8].cells[28].done).toBe(0);
    expect(year.months[8].cells[28].kind).toBe('score');
  });

  it('the weekly review counts it done only at the target', () => {
    const review = weeklyReview({
      today: '2026-10-08',
      workouts: [],
      tasks: [counted],
      log,
      amounts: [],
      categories: [],
    });
    // 28 Sep–4 Oct: done on the 28th and 30th, of seven asked.
    expect(review?.tasks?.percent).toBe(Math.round((2 / 7) * 100));
  });
});

describe('a pause over a counted day', () => {
  it('excuses it and keeps the parts, and its Undo gives them back', () => {
    const log = counts({ '2026-09-10': 3 });
    const { log: paused, written } = excuseRange(
      log,
      [counted],
      ['water'],
      '2026-09-10',
      '2026-09-11',
    );
    expect(paused.water['2026-09-10']).toEqual({ mark: 'missed', note: '', count: 3 });
    expect(clearExcused(paused, written)).toEqual(log);
  });
});

describe('the landing chip', () => {
  it('skips a counted row: one tap there is a part, not the task', () => {
    const plain = task({ id: 'read', name: 'Read', target: undefined, order: 1 });
    expect(nextUnansweredTask([counted, plain], {}, '2026-09-10', { autoTick: true })?.id).toBe(
      'read',
    );
  });
});
