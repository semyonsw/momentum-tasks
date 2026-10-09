import { describe, expect, it } from 'vitest';

import { type Task, type TaskLog, tasksMonth } from './tasks';
import {
  PIXEL_COLUMNS,
  describePixel,
  heatLevel,
  pixelAtPoint,
  pixelDate,
  pixelTaskChoices,
  pixelYears,
  yearPercent,
  yearPixels,
} from './yearPixels';

/**
 * Year in Pixels (T5). The layout is 12 month-rows of 31 day-columns (see the
 * file header), so "alignment" here is day-of-month placement and holes for
 * dates that do not exist; the rules for what a square says are pinned against
 * the month grid so the two zoom levels cannot disagree.
 */

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1',
    name: 'Read',
    schedule: { kind: 'daily' },
    auto: null,
    startedOn: '2024-01-01',
    reminder: null,
    archivedAt: null,
    order: 0,
    ...over,
  };
}

function marks(entries: Record<string, Record<string, 'done' | 'missed'>>): TaskLog {
  const log: TaskLog = {};
  for (const [taskId, days] of Object.entries(entries)) {
    log[taskId] = {};
    for (const [day, mark] of Object.entries(days)) log[taskId][day] = { mark, note: '' };
  }
  return log;
}

const cell = (year: ReturnType<typeof yearPixels>, month: number, day: number) =>
  year.months[month].cells[day - 1];

describe('the 12 × 31 layout', () => {
  it('always has twelve rows of thirty-one', () => {
    const year = yearPixels([task()], {}, 2026, '2026-12-31');
    expect(year.months).toHaveLength(12);
    for (const month of year.months) expect(month.cells).toHaveLength(PIXEL_COLUMNS);
  });

  it('puts each date in the column of its day of the month', () => {
    const year = yearPixels([task()], {}, 2026, '2026-12-31');
    year.months.forEach((month, m) =>
      month.cells.forEach((pixel, i) => {
        expect(pixel.day).toBe(i + 1);
        if (pixel.date) {
          expect(Number(pixel.date.slice(5, 7))).toBe(m + 1);
          expect(Number(pixel.date.slice(8, 10))).toBe(i + 1);
        }
      }),
    );
  });

  it('makes dates that do not exist holes, not days', () => {
    const year = yearPixels([task()], {}, 2026, '2026-12-31');
    expect(cell(year, 1, 29).kind).toBe('none'); // 29 February 2026
    expect(cell(year, 1, 30).kind).toBe('none');
    expect(cell(year, 3, 31).kind).toBe('none'); // 31 April
    expect(cell(year, 3, 31).date).toBeNull();
    expect(pixelDate(2026, 1, 30)).toBeNull();
    expect(pixelDate(2026, 0, 31)).toBe('2026-01-31');
  });

  it('counts 365 real cells in a common year and 366 in a leap year', () => {
    const real = (y: number) =>
      yearPixels([task()], {}, y, `${y}-12-31`)
        .months.flatMap((month) => month.cells)
        .filter((pixel) => pixel.kind !== 'none').length;
    expect(real(2026)).toBe(365);
    expect(real(2024)).toBe(366);
    expect(real(2000)).toBe(366);
    expect(real(2100)).toBe(365);
  });

  it('gives a leap year its 29 February, and scores it', () => {
    const log = marks({ t1: { '2024-02-29': 'done' } });
    const year = yearPixels([task()], log, 2024, '2024-12-31');
    const leap = cell(year, 1, 29);
    expect(leap.date).toBe('2024-02-29');
    expect(leap.kind).toBe('score');
    expect(leap.level).toBe(4);
    expect(cell(year, 1, 30).kind).toBe('none');
  });
});

describe('days before startedOn', () => {
  it('are blank, for one task and for all tasks', () => {
    const late = task({ startedOn: '2026-03-10' });
    const one = yearPixels([late], {}, 2026, '2026-06-30', 't1');
    const all = yearPixels([late], {}, 2026, '2026-06-30');
    for (const year of [one, all]) {
      expect(cell(year, 0, 15).kind).toBe('blank');
      expect(cell(year, 2, 9).kind).toBe('blank');
      expect(cell(year, 2, 10).kind).toBe('score');
    }
  });

  it('do not count towards the year', () => {
    const late = task({ startedOn: '2026-12-30' });
    const year = yearPixels([late], {}, 2026, '2026-12-31', 't1');
    expect(year.asked).toBe(2);
  });

  it('say so when tapped', () => {
    const late = task({ startedOn: '2026-03-10' });
    const year = yearPixels([late], {}, 2026, '2026-06-30', 't1');
    expect(describePixel(cell(year, 2, 1), late)).toBe('1 March · before this task started');
    expect(describePixel(cell(year, 2, 1), null)).toBe('1 March · nothing asked');
  });
});

describe('excused days', () => {
  it('are paused for one task, not a score and not empty', () => {
    const log = marks({ t1: { '2026-05-03': 'missed', '2026-05-04': 'done' } });
    const year = yearPixels([task()], log, 2026, '2026-05-10', 't1');
    expect(cell(year, 4, 3).kind).toBe('paused');
    expect(cell(year, 4, 4).kind).toBe('score');
    expect(cell(year, 4, 5)).toMatchObject({ kind: 'score', level: 0 });
    expect(year.paused).toBe(1);
    // Out of the count: 10 asked days in May minus the excused one, plus Jan–Apr.
    expect(year.asked).toBe(31 + 28 + 31 + 30 + 9);
  });

  it('hatch an all-tasks day only when every task that asked was excused', () => {
    const a = task({ id: 'a' });
    const b = task({ id: 'b' });
    const log = marks({
      a: { '2026-05-03': 'missed', '2026-05-04': 'missed' },
      b: { '2026-05-03': 'missed', '2026-05-04': 'done' },
    });
    const year = yearPixels([a, b], log, 2026, '2026-05-10');
    expect(cell(year, 4, 3).kind).toBe('paused');
    // Half excused: one task left, and it was done — a full day, not a pause.
    expect(cell(year, 4, 4)).toMatchObject({ kind: 'score', level: 4, done: 1, asked: 1 });
  });

  it('are shown ahead of today when a pause wrote them', () => {
    const log = marks({ t1: { '2026-08-20': 'missed' } });
    const year = yearPixels([task()], log, 2026, '2026-08-10', 't1');
    expect(cell(year, 7, 20).kind).toBe('paused');
    expect(cell(year, 7, 21).kind).toBe('future');
  });

  it('read as excused or paused under the grid', () => {
    const log = marks({ t1: { '2026-05-03': 'missed' } });
    const one = yearPixels([task()], log, 2026, '2026-05-10', 't1');
    const all = yearPixels([task()], log, 2026, '2026-05-10');
    expect(describePixel(cell(one, 4, 3), task())).toBe('3 May · excused · not counted');
    expect(describePixel(cell(all, 4, 3), null)).toBe('3 May · paused · not counted');
  });
});

describe('all tasks: the share done, bucketed', () => {
  it('cuts at the month grid’s own steps', () => {
    expect(heatLevel(0)).toBe(0);
    expect(heatLevel(0.1)).toBe(1);
    expect(heatLevel(0.49)).toBe(1);
    expect(heatLevel(0.5)).toBe(2);
    expect(heatLevel(0.75)).toBe(3);
    expect(heatLevel(0.99)).toBe(3);
    expect(heatLevel(1)).toBe(4);
    expect(heatLevel(Number.NaN)).toBe(0);
  });

  it('buckets each day by the share of its tasks done', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const tasks = ids.map((id, order) => task({ id, order }));
    const day = '2026-04-02';
    const doneBy = (n: number) =>
      Object.fromEntries(ids.slice(0, n).map((id) => [id, { [day]: 'done' as const }]));
    const levels = [0, 1, 2, 3, 4].map((n) => {
      const year = yearPixels(tasks, marks(doneBy(n)), 2026, '2026-04-30');
      return cell(year, 3, 2);
    });
    expect(levels.map((pixel) => pixel.level)).toEqual([0, 1, 2, 3, 4]);
    expect(levels[3]).toMatchObject({ done: 3, asked: 4 });
  });

  it('agrees with the month grid on every day', () => {
    const tasks = [
      task({ id: 'a' }),
      task({ id: 'b', schedule: { kind: 'weekdays', days: [0, 2, 4] } }),
      task({ id: 'c', startedOn: '2026-09-10' }),
    ];
    const log = marks({
      a: { '2026-09-01': 'done', '2026-09-02': 'done', '2026-09-14': 'missed' },
      b: { '2026-09-02': 'done', '2026-09-14': 'missed' },
      c: { '2026-09-14': 'missed', '2026-09-15': 'done' },
    });
    const today = '2026-09-20';
    const year = yearPixels(tasks, log, 2026, today);
    const month = tasksMonth(tasks, log, 2026, 8, today);
    for (const dayCell of month.weeks.flat()) {
      if (dayCell.day === null) continue;
      const pixel = cell(year, 8, dayCell.day);
      expect(pixel.kind === 'paused').toBe(dayCell.paused);
      if (pixel.kind === 'score') {
        expect(pixel.done).toBe(dayCell.done);
        expect(pixel.asked).toBe(dayCell.asked);
        expect(pixel.level).toBe(heatLevel(dayCell.fraction));
      }
    }
  });

  it('leaves days off a weekday task’s schedule blank for that task', () => {
    const weekly = task({ schedule: { kind: 'weekdays', days: [0] } }); // Mondays
    const year = yearPixels([weekly], {}, 2026, '2026-12-31', 't1');
    expect(cell(year, 8, 7).kind).toBe('score'); // Monday 7 September 2026
    expect(cell(year, 8, 8).kind).toBe('blank');
  });
});

describe('the edges', () => {
  it('draws days after today as future, and does not count them', () => {
    const year = yearPixels([task({ startedOn: '2026-12-01' })], {}, 2026, '2026-12-10', 't1');
    expect(cell(year, 11, 11).kind).toBe('future');
    expect(cell(year, 11, 10)).toMatchObject({ kind: 'score', isToday: true });
    expect(year.asked).toBe(10);
  });

  it('says "not answered yet" for an open today, and "not done" for a past day', () => {
    const t1 = task({ startedOn: '2026-12-01' });
    const year = yearPixels([t1], {}, 2026, '2026-12-10', 't1');
    expect(describePixel(cell(year, 11, 10), t1)).toBe('10 December · not answered yet');
    expect(describePixel(cell(year, 11, 9), t1)).toBe('9 December · not done');
  });

  it('draws an unknown task id as blank rather than the whole list', () => {
    const year = yearPixels(
      [task()],
      marks({ t1: { '2026-01-01': 'done' } }),
      2026,
      '2026-12-31',
      'gone',
    );
    expect(cell(year, 0, 1).kind).toBe('blank');
    expect(year.asked).toBe(0);
  });

  it('offers live repeating tasks in their order, never one-day or archived ones', () => {
    const tasks = [
      task({ id: 'b', order: 2 }),
      task({ id: 'once', order: 0, schedule: { kind: 'once', day: '2026-05-01' } }),
      task({ id: 'gone', order: 1, archivedAt: '2026-04-01T10:00:00Z' }),
      task({ id: 'a', order: 1 }),
    ];
    expect(pixelTaskChoices(tasks).map((choice) => choice.id)).toEqual(['a', 'b']);
  });

  it('pages from the first start to this year', () => {
    expect(pixelYears([task({ startedOn: '2024-06-01' })], '2026-10-08')).toEqual({
      first: 2024,
      last: 2026,
    });
    expect(pixelYears([], '2026-10-08')).toEqual({ first: 2026, last: 2026 });
  });

  it('lists the day as done of asked under the grid for all tasks', () => {
    const log = marks({ t1: { '2026-09-12': 'done' } });
    const year = yearPixels([task(), task({ id: 't2' })], log, 2026, '2026-09-30');
    expect(describePixel(cell(year, 8, 12), null)).toBe('12 September · 1 of 2 done');
    expect(describePixel(cell(year, 8, 12), null, 'ru')).toBe('12 сентября · 1 из 2 сделано');
  });
});

describe('a tap on the grid', () => {
  // 328 wide, a 18 dp label gutter: 310 / 31 = 10 dp a square.
  const W = 328;
  const L = 18;

  it('lands on the square under it', () => {
    expect(pixelAtPoint(L + 0.5, 0.5, W, L, 2026)).toEqual({
      month: 0,
      day: 1,
      date: '2026-01-01',
    });
    expect(pixelAtPoint(L + 10 * 9 + 5, 10 * 8 + 5, W, L, 2026)).toEqual({
      month: 8,
      day: 10,
      date: '2026-09-10',
    });
    expect(pixelAtPoint(W - 0.1, 10 * 11 + 1, W, L, 2026)?.date).toBe('2026-12-31');
  });

  it('lands on nothing in the gutter, below the grid, or on a hole', () => {
    expect(pixelAtPoint(L - 1, 5, W, L, 2026)).toBeNull();
    expect(pixelAtPoint(L + 5, 10 * 12 + 1, W, L, 2026)).toBeNull();
    expect(pixelAtPoint(L + 10 * 29 + 5, 10 * 1 + 5, W, L, 2026)).toBeNull(); // 30 Feb
    expect(pixelAtPoint(L + 10 * 28 + 5, 10 * 1 + 5, W, L, 2024)?.date).toBe('2024-02-29');
    expect(pixelAtPoint(10, 10, 0, L, 2026)).toBeNull();
  });

  it('steps rows by the square plus the gap between rows', () => {
    // 12 dp a row: y = 100 is row 8 (September), not row 10.
    expect(pixelAtPoint(L + 5, 100, W, L, 2026, 2)?.month).toBe(8);
    expect(pixelAtPoint(L + 5, 12 * 12 + 1, W, L, 2026, 2)).toBeNull();
  });
});

describe('the year’s percent', () => {
  it('is null with nothing asked, and only touches 0 and 100 when it means it', () => {
    expect(yearPercent({ done: 0, asked: 0 })).toBeNull();
    expect(yearPercent({ done: 0, asked: 40 })).toBe(0);
    expect(yearPercent({ done: 1, asked: 1000 })).toBe(1);
    expect(yearPercent({ done: 997, asked: 1000 })).toBe(99);
    expect(yearPercent({ done: 1000, asked: 1000 })).toBe(100);
    expect(yearPercent({ done: 43, asked: 50 })).toBe(86);
  });
});
