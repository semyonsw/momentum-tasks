import { describe, expect, it } from 'vitest';

import { shiftDay } from './days';
import {
  describeCovered,
  describeFreezeRule,
  describeFreezes,
  displayedStreak,
  FREEZE_EVERY,
  FREEZE_MAX,
  frozenStreak,
} from './streakFreeze';
import { streakOf, type Task, type TaskLog } from './tasks';

/**
 * Streak freezes (E3): earned one per 7 done days in a row, two at most, spent
 * on an unanswered past day only — never on a day excused on purpose — and an
 * overlay on the number only: the log is never written, and with the switch
 * off the streak is `streakOf`, exactly.
 */

const START = '2026-09-01';
const task = (over: Partial<Task> = {}): Task => ({
  id: 'read',
  name: 'Reading',
  schedule: { kind: 'daily' },
  auto: null,
  startedOn: START,
  reminder: null,
  archivedAt: null,
  order: 0,
  ...over,
});

/** A log from a string, one char per day from START: d done, m missed (excused), . unanswered. */
function logOf(pattern: string, id = 'read'): TaskLog {
  const days: Record<string, { mark: 'done' | 'missed'; note: string }> = {};
  [...pattern].forEach((c, i) => {
    if (c === 'd') days[shiftDay(START, i)] = { mark: 'done', note: '' };
    if (c === 'm') days[shiftDay(START, i)] = { mark: 'missed', note: '' };
  });
  return { [id]: days };
}
/** The day of the last char of `pattern` — "today" as the screen would pass it. */
const dayOf = (pattern: string) => shiftDay(START, pattern.length - 1);

const at = (pattern: string) => frozenStreak(task(), logOf(pattern), dayOf(pattern));

describe('earning', () => {
  it(`one freeze for every ${FREEZE_EVERY} done days in a row`, () => {
    expect(at('dddddd').held).toBe(0);
    expect(at('ddddddd').held).toBe(1);
    expect(at('dddddddddddddd').held).toBe(2);
  });

  it(`never more than ${FREEZE_MAX} held`, () => {
    expect(at('d'.repeat(60)).held).toBe(FREEZE_MAX);
  });

  it('an excused day neither earns nor breaks the count toward one', () => {
    expect(at('dddmddd').held).toBe(0);
    expect(at('dddmdddd').held).toBe(1);
  });
});

describe('spending', () => {
  it('an unanswered past day spends one and the run carries on over it', () => {
    const r = at('ddddddd.dd');
    expect(r.streak).toBe(9);
    expect(r.held).toBe(0);
    expect(r.covered).toEqual([shiftDay(START, 7)]);
    // Without the freeze, the plain streak is the two after the gap.
    expect(streakOf(task(), logOf('ddddddd.dd'), dayOf('ddddddd.dd'))).toBe(2);
  });

  it('with none held, the gap ends the run as it always did', () => {
    const r = at('dddddd.dd');
    expect(r.streak).toBe(2);
    expect(r.covered).toEqual([]);
  });

  it('two held bridge two days; the third ends the run', () => {
    expect(at(`${'d'.repeat(14)}..d`).streak).toBe(15);
    expect(at(`${'d'.repeat(14)}...d`).streak).toBe(1);
  });

  it('a gap with none held restarts the count toward the next freeze', () => {
    // 6 done, gap (none held), 6 done: still none earned.
    expect(at('dddddd.dddddd').held).toBe(0);
    expect(at('dddddd.ddddddd').held).toBe(1);
  });

  it('today is never spent on: a day still being lived is not a gap', () => {
    const r = at('ddddddd.');
    expect(r).toEqual({ streak: 7, held: 1, covered: [] });
  });
});

describe('excused days (T-03 pause, skip on purpose)', () => {
  it('never spend a freeze — they do not break the streak to begin with', () => {
    const r = at('dddddddmmmmmdd');
    expect(r.held).toBe(1);
    expect(r.covered).toEqual([]);
    expect(r.streak).toBe(9);
  });
});

describe('weekly tasks (T-14)', () => {
  it('use no freezes: their streak is the plain week streak', () => {
    const weekly = task({ schedule: { kind: 'weekly', times: 3 } });
    const log = logOf('d.d.d..d.d.d..'.repeat(3));
    const day = shiftDay(START, 41);
    expect(frozenStreak(weekly, log, day)).toEqual({
      streak: streakOf(weekly, log, day),
      held: 0,
      covered: [],
    });
  });
});

describe('the switch', () => {
  /** Deterministic pseudo-random patterns, so the comparison covers many shapes. */
  function patterns(n: number): string[] {
    let seed = 7;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    return Array.from({ length: n }, () =>
      Array.from({ length: 10 + Math.floor(next() * 60) }, () => {
        const r = next();
        return r < 0.7 ? 'd' : r < 0.82 ? 'm' : '.';
      }).join(''),
    );
  }

  it('off → exactly streakOf and no freezes, for every shape of log', () => {
    for (const p of patterns(200)) {
      const log = logOf(p);
      for (const day of [dayOf(p), shiftDay(dayOf(p), -3)]) {
        expect(displayedStreak(task(), log, day, false)).toEqual({
          streak: streakOf(task(), log, day),
          held: 0,
          covered: [],
        });
      }
    }
  });

  it('on, with nothing covered, it is streakOf too; covering only ever adds', () => {
    for (const p of patterns(200)) {
      const log = logOf(p);
      const plain = streakOf(task(), log, dayOf(p));
      const frozen = displayedStreak(task(), log, dayOf(p), true);
      if (frozen.covered.length === 0) expect(frozen.streak).toBe(plain);
      else expect(frozen.streak).toBeGreaterThanOrEqual(plain);
    }
  });

  it('the log is never written', () => {
    const log = logOf('ddddddd.dd');
    const before = JSON.stringify(log);
    displayedStreak(task(), log, dayOf('ddddddd.dd'), true);
    frozenStreak(task(), log, dayOf('ddddddd.dd'));
    expect(JSON.stringify(log)).toBe(before);
  });
});

describe('words', () => {
  it('count the freezes in both languages', () => {
    expect(describeFreezes(1, 'en')).toBe('1 streak freeze');
    expect(describeFreezes(2, 'en')).toBe('2 streak freezes');
    expect(describeFreezes(1, 'ru')).toBe('1 заморозка серии');
    expect(describeFreezes(2, 'ru')).toBe('2 заморозки серии');
  });

  it('state the rule from the constants, and the covered days', () => {
    expect(describeFreezeRule('en')).toContain(`every ${FREEZE_EVERY} days`);
    expect(describeFreezeRule('en')).toContain(`up to ${FREEZE_MAX}`);
    expect(describeCovered([], 'en')).toBeNull();
    expect(describeCovered(['2026-09-19'], 'en')).toBe('Used on 19 September.');
  });
});
