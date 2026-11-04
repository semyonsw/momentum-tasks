import { describe, expect, it } from 'vitest';

import {
  achievements,
  BADGES,
  describeBadgeProgress,
  describeEarned,
  describeGallery,
  FULL_WEEK_DAYS,
  logFacts,
  type FactPoint,
  type LogFacts,
  type LogsInput,
} from './achievements';
import { shiftDay } from './days';
import { t, translatedKeys } from './i18n';
import type { Task, TaskLog } from './tasks';

/**
 * Achievements (E1). Three things matter: every threshold sits exactly where it
 * says (99 is not 100), the same log always gives the same badges with the same
 * earned dates (they are the LOG's dates, never the clock's), and a day excused
 * on purpose earns nothing.
 */

const TODAY = '2026-10-09';

function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    name: id,
    schedule: { kind: 'daily' },
    auto: null,
    startedOn: '2026-01-01',
    reminder: null,
    archivedAt: null,
    order: 0,
    ...over,
  };
}

const EMPTY: LogsInput = { today: TODAY, tasks: [], log: {} };

/** `n` consecutive days ending on `last`, oldest first. */
function daysTo(last: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => shiftDay(last, i - n + 1));
}

function marks(
  days: readonly string[],
  mark: 'done' | 'missed',
): Record<string, { mark: 'done' | 'missed'; note: string }> {
  return Object.fromEntries(days.map((day) => [day, { mark, note: '' }]));
}

const badge = (input: LogsInput, id: string) => {
  const found = achievements(logFacts(input)).find((row) => row.id === id);
  if (!found) throw new Error(`no badge ${id}`);
  return found;
};

const emptyFacts = (): LogFacts => logFacts(EMPTY);

describe('the badge list', () => {
  it('has the eight task badges, with Momentum’s ids', () => {
    expect(BADGES.map((b) => b.id)).toEqual([
      'tasks1',
      'tasks100',
      'tasks1000',
      'run7',
      'run30',
      'run100',
      'fullWeek',
      'perfect30',
    ]);
  });

  it('every title and description is in Russian too', () => {
    const keys = new Set(translatedKeys());
    for (const def of BADGES) {
      expect(keys.has(def.title), def.title).toBe(true);
      expect(keys.has(def.what), def.what).toBe(true);
    }
  });

  it('nothing is earned on an empty phone, and nothing reads below zero', () => {
    const badges = achievements(emptyFacts());
    expect(badges.every((b) => b.earnedOn === null && b.have === 0 && b.fraction === 0)).toBe(true);
    expect(describeGallery(badges, 'en')).toBe(`0 of ${BADGES.length} earned.`);
  });
});

describe('each badge sits exactly on its threshold', () => {
  /** A series that reaches `total` one step short of, or exactly on, the need. */
  function seriesTo(total: number, measure: 'sum' | 'max'): FactPoint[] {
    if (measure === 'max') return [{ day: '2026-03-01', value: total }];
    // Whole units summing to `total`, the last landing on 2026-03-02.
    const points: FactPoint[] = [];
    let left = total;
    const step = Math.max(1, Math.ceil(total / 50));
    while (left > 0) {
      const v = Math.min(step, left);
      left -= v;
      points.push({ day: left === 0 ? '2026-03-02' : '2026-03-01', value: v });
    }
    return points;
  }

  for (const def of BADGES) {
    it(`${def.id}: ${def.need - 1} is locked, ${def.need} is earned`, () => {
      const below = { ...emptyFacts(), [def.series]: seriesTo(def.need - 1, def.measure) };
      const on = { ...emptyFacts(), [def.series]: seriesTo(def.need, def.measure) };
      const locked = achievements(below).find((b) => b.id === def.id)!;
      const earned = achievements(on).find((b) => b.id === def.id)!;
      expect(locked.earnedOn).toBeNull();
      expect(locked.fraction).toBeLessThan(1);
      expect(earned.earnedOn).toBe(def.measure === 'max' ? '2026-03-01' : '2026-03-02');
      expect(earned.fraction).toBe(1);
      expect(earned.have).toBe(def.need);
    });
  }
});

describe('from the logs: tasks', () => {
  it('a 30-day streak needs 30 done days; an excused day is stepped over, not counted', () => {
    const done = daysTo('2026-09-30', 29);
    const reading = task('read');
    const log29: TaskLog = { read: marks(done, 'done') };
    expect(badge({ ...EMPTY, tasks: [reading], log: log29 }, 'run30').earnedOn).toBeNull();
    expect(
      describeBadgeProgress(badge({ ...EMPTY, tasks: [reading], log: log29 }, 'run30'), 'en'),
    ).toBe('29 / 30 days');

    // An excused day in the middle and one more done day after it: 30 done, run kept.
    const log: TaskLog = {
      read: {
        ...marks(daysTo('2026-09-30', 29), 'done'),
        ...marks(['2026-10-01'], 'missed'),
        ...marks(['2026-10-02'], 'done'),
      },
    };
    expect(badge({ ...EMPTY, tasks: [reading], log }, 'run30').earnedOn).toBe('2026-10-02');
  });

  it('an unanswered past day ends a run', () => {
    const reading = task('read');
    const log: TaskLog = {
      read: {
        ...marks(daysTo('2026-09-14', 15), 'done'),
        ...marks(daysTo('2026-09-30', 15), 'done'),
      },
    };
    // 15 + (gap on the 15th) + 15: never 30 in a row.
    expect(badge({ ...EMPTY, tasks: [reading], log }, 'run30').earnedOn).toBeNull();
    expect(badge({ ...EMPTY, tasks: [reading], log }, 'run7').earnedOn).toBe('2026-09-06');
  });

  it('no badge comes from excused days', () => {
    const reading = task('read', { startedOn: '2026-01-01' });
    const log: TaskLog = { read: marks(daysTo('2026-10-08', 200), 'missed') };
    const badges = achievements(logFacts({ ...EMPTY, tasks: [reading], log }));
    for (const b of badges) {
      expect(b.earnedOn, b.id).toBeNull();
      expect(b.have, b.id).toBe(0);
    }
  });

  it('100 tasks done counts done marks on asked days only, up to today', () => {
    const weekdays = task('gym', { schedule: { kind: 'weekdays', days: [0, 1, 2, 3, 4] } });
    // 140 calendar days of done marks, weekends included: only weekdays count.
    const log: TaskLog = { gym: marks(daysTo('2026-10-08', 140), 'done') };
    const facts = logFacts({ ...EMPTY, tasks: [weekdays], log });
    expect(facts.tasksDone.length).toBe(100);
    expect(badge({ ...EMPTY, tasks: [weekdays], log }, 'tasks100').earnedOn).toBe('2026-10-08');
    // A mark tomorrow is not counted.
    const ahead: TaskLog = { gym: { ...log.gym, ...marks(['2026-10-12'], 'done') } };
    expect(logFacts({ ...EMPTY, tasks: [weekdays], log: ahead }).tasksDone.length).toBe(100);
  });

  describe('a full week', () => {
    // Mon 28 Sep – Sun 4 Oct 2026.
    const week = daysTo('2026-10-04', 7);
    const a = task('a', { startedOn: '2026-09-28' });
    const b = task('b', { startedOn: '2026-09-28' });

    it('every task, every day of a finished week', () => {
      const log: TaskLog = { a: marks(week, 'done'), b: marks(week, 'done') };
      expect(badge({ ...EMPTY, tasks: [a, b], log }, 'fullWeek').earnedOn).toBe('2026-10-04');
    });

    it('one task short on one day is not a full week', () => {
      const log: TaskLog = { a: marks(week, 'done'), b: marks(week.slice(1), 'done') };
      expect(badge({ ...EMPTY, tasks: [a, b], log }, 'fullWeek').earnedOn).toBeNull();
    });

    it('a paused day does not count: a week with a fully excused day earns nothing', () => {
      const log: TaskLog = {
        a: { ...marks(week.slice(0, 6), 'done'), ...marks([week[6]], 'missed') },
        b: { ...marks(week.slice(0, 6), 'done'), ...marks([week[6]], 'missed') },
      };
      expect(badge({ ...EMPTY, tasks: [a, b], log }, 'fullWeek').earnedOn).toBeNull();
    });

    it(`a weekday list needs its ${FULL_WEEK_DAYS} days, and the weekend asks nothing`, () => {
      const weekdays = task('w', {
        startedOn: '2026-09-28',
        schedule: { kind: 'weekdays', days: [0, 1, 2, 3, 4] },
      });
      const log: TaskLog = { w: marks(week.slice(0, 5), 'done') };
      expect(badge({ ...EMPTY, tasks: [weekdays], log }, 'fullWeek').earnedOn).toBe('2026-10-04');
    });

    it('the week still running is not a full week yet', () => {
      // Mon 5 – Fri 9 Oct, today is Friday.
      const now = daysTo(TODAY, 5);
      const c = task('c', { startedOn: '2026-10-05' });
      const log: TaskLog = { c: marks(now, 'done') };
      expect(badge({ ...EMPTY, tasks: [c], log }, 'fullWeek').earnedOn).toBeNull();
    });
  });
});

describe('stable across recomputation', () => {
  const input: LogsInput = {
    ...EMPTY,
    tasks: [task('read')],
    log: { read: marks(daysTo('2026-10-08', 40), 'done') },
  };

  it('the same logs give the same badges, field for field', () => {
    expect(achievements(logFacts(input))).toEqual(achievements(logFacts(input)));
  });

  it('earned dates are the log’s: a later "today" moves none of them', () => {
    const now = achievements(logFacts(input));
    const later = achievements(logFacts({ ...input, today: '2027-03-01' }));
    for (const b of now.filter((row) => row.earnedOn !== null)) {
      expect(later.find((row) => row.id === b.id)!.earnedOn, b.id).toBe(b.earnedOn);
    }
    // 40 days ending 8 Oct start on 30 Aug; the seventh is 5 Sep.
    expect(now.find((b) => b.id === 'run7')!.earnedOn).toBe('2026-09-05');
  });
});

describe('words', () => {
  it('a locked one-step badge says "Not yet" rather than 0 / 1', () => {
    const b = badge(EMPTY, 'tasks1');
    expect(describeBadgeProgress(b, 'en')).toBe('Not yet');
    expect(describeEarned(b, 'en')).toBeNull();
  });

  it('progress agrees with the need in Russian', () => {
    const done = (n: number): LogsInput => ({
      ...EMPTY,
      tasks: [task('read')],
      log: { read: marks(daysTo('2026-09-30', n), 'done') },
    });
    expect(describeBadgeProgress(badge(done(73), 'tasks100'), 'ru')).toBe('73 / 100 задач');
    expect(describeBadgeProgress(badge(done(3), 'run7'), 'ru')).toBe('3 / 7 дней');
  });

  it('an earned badge names its day', () => {
    const b = badge(
      { ...EMPTY, tasks: [task('read')], log: { read: marks(['2026-09-14'], 'done') } },
      'tasks1',
    );
    expect(describeEarned(b, 'en')).toBe('Earned 14 September 2026');
    expect(describeEarned(b, 'ru')).toBe(t('Earned {date}', 'ru', { date: '14 сентября 2026' }));
  });
});
