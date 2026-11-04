import { describe, expect, it } from 'vitest';

import { logFacts, type LogFacts, type LogsInput } from './achievements';
import { shiftDay } from './days';
import { translatedKeys } from './i18n';
import {
  describeNextLevel,
  levelOf,
  levelProgress,
  levelStart,
  totalXp,
  xpBreakdown,
  XP_WEIGHTS,
} from './xp';

/**
 * XP (E2): deterministic, never negative, and a curve whose boundaries sit
 * exactly where `levelStart` says.
 */

const TODAY = '2026-10-09';
const EMPTY: LogsInput = { today: TODAY, tasks: [], log: {} };

const reading = {
  id: 'r',
  name: 'r',
  schedule: { kind: 'daily' as const },
  auto: null,
  startedOn: '2026-09-01',
  reminder: null,
  archivedAt: null,
  order: 0,
};
const doneOn = (days: readonly string[]) => ({
  r: Object.fromEntries(days.map((day) => [day, { mark: 'done' as const, note: '' }])),
});

const facts = (over: Partial<LogFacts>): LogFacts => ({ ...logFacts(EMPTY), ...over });

describe('the weights table', () => {
  it('is all positive, and every label is in Russian too', () => {
    const keys = new Set(translatedKeys());
    for (const w of XP_WEIGHTS) {
      expect(w.xp).toBeGreaterThan(0);
      expect(keys.has(w.label), w.label).toBe(true);
    }
  });
});

describe('XP from the logs', () => {
  it('is 0 on an empty phone', () => {
    expect(totalXp(logFacts(EMPTY))).toBe(0);
  });

  it('adds every source by the table', () => {
    const one = [{ day: '2026-10-01', value: 1 }];
    const f = facts({ tasksDone: [...one, ...one], perfectDays: one });
    expect(totalXp(f)).toBe(2 * 5 + 25);
    expect(xpBreakdown(f).map((line) => line.xp)).toEqual([10, 25]);
  });

  it('is deterministic: the same logs, the same XP, whatever the order', () => {
    const days = Array.from({ length: 30 }, (_, i) => shiftDay('2026-09-01', i));
    const a = totalXp(logFacts({ ...EMPTY, tasks: [reading], log: doneOn(days) }));
    const b = totalXp(logFacts({ ...EMPTY, tasks: [reading], log: doneOn([...days].reverse()) }));
    expect(a).toBe(b);
    expect(a).toBe(30 * 5 + 30 * 25);
  });

  it('a day excused on purpose earns nothing', () => {
    const log = { r: { '2026-10-02': { mark: 'missed' as const, note: '' } } };
    expect(totalXp(logFacts({ ...EMPTY, tasks: [reading], log }))).toBe(0);
  });

  it('does not go down with time: a later today changes nothing', () => {
    const input = { ...EMPTY, tasks: [reading], log: doneOn(['2026-10-01']) };
    expect(totalXp(logFacts({ ...input, today: '2027-06-01' }))).toBe(totalXp(logFacts(input)));
  });
});

describe('the level curve', () => {
  it('starts every level at 50·L·(L−1)', () => {
    expect([1, 2, 3, 4, 5, 8].map(levelStart)).toEqual([0, 100, 300, 600, 1000, 2800]);
  });

  it('boundaries: one XP short is the level below, exactly on it is the level', () => {
    expect(levelOf(0)).toBe(1);
    expect(levelOf(99)).toBe(1);
    expect(levelOf(100)).toBe(2);
    expect(levelOf(299)).toBe(2);
    expect(levelOf(300)).toBe(3);
    for (let level = 2; level <= 200; level += 1) {
      expect(levelOf(levelStart(level) - 1)).toBe(level - 1);
      expect(levelOf(levelStart(level))).toBe(level);
    }
  });

  it('never goes below level 1, whatever it is handed', () => {
    expect(levelOf(-500)).toBe(1);
    expect(levelOf(NaN)).toBe(1);
  });

  it('progress: a full bar is the next level, never this one', () => {
    const p = levelProgress(1920);
    expect(p).toMatchObject({ level: 6, from: 1500, to: 2100 });
    expect(p.fraction).toBeCloseTo(0.7);
    expect(levelProgress(2100)).toMatchObject({ level: 7, fraction: 0 });
    expect(levelProgress(2099).fraction).toBeLessThan(1);
  });

  it('says what it is counting toward', () => {
    expect(describeNextLevel(levelProgress(1920), 'en')).toBe('of 2,100 XP to level 7');
    expect(describeNextLevel(levelProgress(1920), 'ru')).toContain('7');
  });
});
