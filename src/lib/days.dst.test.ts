import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { daysBetween, parseDay, shiftDay, weekEnd, weekStart } from './days';
import { frozenStreak } from './streakFreeze';
import { habitStrength } from './habitStrength';
import { streakOf, taskMonth, type Task, type TaskLog } from './tasks';
import { yearPixels } from './yearPixels';

/**
 * The hardest zone for local-midnight arithmetic: one where daylight saving
 * starts AT midnight, so the day it starts has no 00:00 at all. Santiago skips
 * 2026-09-06 00:00 → 01:00 and repeats 23:00 on 2026-04-04. `days.arithmetic`
 * covers New York, whose jumps happen at 02:00 and never touch a day's start;
 * here `new Date(y, m, d)` lands on 01:00, and any arithmetic that assumed it
 * gets midnight back is one day off.
 */
let savedTz: string | undefined;
beforeAll(() => {
  savedTz = process.env.TZ;
  process.env.TZ = 'America/Santiago';
});
afterAll(() => {
  if (savedTz === undefined) delete process.env.TZ;
  else process.env.TZ = savedTz;
});

const SPRING = '2026-09-06';
const FALL = '2026-04-05';

describe('a day with no midnight', () => {
  it('parses, and names itself', () => {
    expect(parseDay(SPRING)).not.toBeNull();
    expect(shiftDay(SPRING, 0)).toBe(SPRING);
  });

  it('is stepped onto and off from either side', () => {
    expect(shiftDay('2026-09-05', 1)).toBe(SPRING);
    expect(shiftDay(SPRING, 1)).toBe('2026-09-07');
    expect(shiftDay(SPRING, -1)).toBe('2026-09-05');
    expect(shiftDay('2026-09-07', -2)).toBe('2026-09-05');
    expect(shiftDay(FALL, -1)).toBe('2026-04-04');
    expect(shiftDay('2026-04-04', 1)).toBe(FALL);
  });

  it('a walk of a year by single days visits every date once', () => {
    const seen = new Set<string>();
    let day = '2026-01-01';
    for (let i = 0; i < 365; i += 1) {
      seen.add(day);
      day = shiftDay(day, 1);
    }
    expect(seen.size).toBe(365);
    expect(day).toBe('2027-01-01');
  });

  it('counts whole days across both jumps', () => {
    expect(daysBetween('2026-09-05', '2026-09-07')).toBe(2);
    expect(daysBetween('2026-04-04', '2026-04-06')).toBe(2);
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365);
  });

  it('keeps its week', () => {
    // 2026-09-06 is a Sunday.
    expect(weekStart(SPRING)).toBe('2026-08-31');
    expect(weekEnd(SPRING)).toBe(SPRING);
    expect(weekStart('2026-09-07')).toBe('2026-09-07');
  });
});

const daily = (startedOn: string): Task => ({
  id: 'a',
  name: 'A',
  schedule: { kind: 'daily' },
  auto: null,
  startedOn,
  reminder: null,
  archivedAt: null,
  order: 0,
});

function doneFrom(from: string, days: number): TaskLog {
  const marks: TaskLog['x'] = {};
  for (let i = 0; i < days; i += 1) marks[shiftDay(from, i)] = { mark: 'done', note: '' };
  return { a: marks };
}

describe('a streak through the jump', () => {
  it('is not broken by the missing midnight', () => {
    const log = doneFrom('2026-09-01', 10);
    expect(streakOf(daily('2026-09-01'), log, '2026-09-10')).toBe(10);
    expect(frozenStreak(daily('2026-09-01'), log, '2026-09-10').streak).toBe(10);
    expect(streakOf(daily('2026-04-01'), doneFrom('2026-04-01', 10), '2026-04-10')).toBe(10);
  });

  it('a month grid has every day of September exactly once', () => {
    const month = taskMonth(daily('2026-09-01'), doneFrom('2026-09-01', 30), 2026, 8, '2026-09-30');
    const dates = month.weeks.flat().flatMap((cell) => (cell.date ? [cell.date] : []));
    expect(dates).toHaveLength(30);
    expect(new Set(dates).size).toBe(30);
    expect(month.done).toBe(30);
  });

  it('the year in pixels scores every day of the year once', () => {
    const year = yearPixels([daily('2026-01-01')], doneFrom('2026-01-01', 365), 2026, '2026-12-31');
    expect(year.done).toBe(365);
    expect(year.asked).toBe(365);
  });

  it('habit strength climbs the same through the jump as in any other week', () => {
    const before = habitStrength(daily('2026-08-01'), doneFrom('2026-08-01', 31), '2026-08-31');
    const across = habitStrength(daily('2026-08-27'), doneFrom('2026-08-27', 31), '2026-09-26');
    expect(across).toBeCloseTo(before as number, 6);
  });
});
