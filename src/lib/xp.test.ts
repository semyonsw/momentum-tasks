import { describe, expect, it } from 'vitest';

import { logFacts, type LogFacts, type LogsInput } from './achievements';
import type { CompletedWorkout } from './completedWorkout';
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
  xpWeightsFor,
} from './xp';

/**
 * XP (E2): deterministic, never negative, and a curve whose boundaries sit
 * exactly where `levelStart` says.
 */

const TODAY = '2026-10-09';
const EMPTY: LogsInput = { today: TODAY, workouts: [], tasks: [], log: {}, amounts: [] };

const workout = (day: string, setCount: number): CompletedWorkout => ({
  id: `w${day}`,
  title: 'Push',
  startedAt: `${day}T10:00:00.000Z`,
  endedAt: `${day}T11:00:00.000Z`,
  durationMinutes: 60,
  setCount,
  totalVolumeKg: 1000,
  volumeIsPartial: false,
  exercises: [],
  sets: [],
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

  it('a workout is its finish plus its working sets', () => {
    const xp = totalXp(logFacts({ ...EMPTY, workouts: [workout('2026-10-01', 20)] }));
    expect(xp).toBe(40 + 20 * 2);
  });

  it('adds every source by the table', () => {
    const one = [{ day: '2026-10-01', value: 1 }];
    const f = facts({
      sets: [{ day: '2026-10-01', value: 10 }],
      workouts: one,
      tasksDone: [...one, ...one],
      perfectDays: one,
      amounts: one,
      records: one,
    });
    expect(totalXp(f)).toBe(10 * 2 + 40 + 2 * 5 + 25 + 3 + 60);
    expect(xpBreakdown(f).map((line) => line.xp)).toEqual([20, 40, 10, 25, 3, 60]);
  });

  it('is deterministic: the same logs, the same XP, whatever the order', () => {
    const list = Array.from({ length: 30 }, (_, i) => workout(shiftDay('2026-09-01', i), 12 + i));
    const a = totalXp(logFacts({ ...EMPTY, workouts: list }));
    const b = totalXp(logFacts({ ...EMPTY, workouts: [...list].reverse() }));
    expect(a).toBe(b);
    expect(totalXp(logFacts({ ...EMPTY, workouts: list }))).toBe(a);
  });

  it('is never negative, even from junk', () => {
    const f = facts({
      sets: [
        { day: '2026-10-01', value: -50 },
        { day: '2026-10-02', value: NaN },
      ],
    });
    expect(totalXp(f)).toBe(0);
    const w = { ...workout('2026-10-01', -5), totalVolumeKg: -100 };
    expect(totalXp(logFacts({ ...EMPTY, workouts: [w] }))).toBe(40);
  });

  it('a day excused on purpose earns nothing', () => {
    const task = {
      id: 'r',
      name: 'r',
      schedule: { kind: 'daily' as const },
      auto: null,
      startedOn: '2026-10-01',
      reminder: null,
      archivedAt: null,
      order: 0,
    };
    const log = { r: { '2026-10-02': { mark: 'missed' as const, note: '' } } };
    expect(totalXp(logFacts({ ...EMPTY, tasks: [task], log }))).toBe(0);
  });

  it('does not go down with time: a later today changes nothing', () => {
    const input = { ...EMPTY, workouts: [workout('2026-10-01', 10)] };
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

describe('one log per app (3.0.0)', () => {
  const one = [{ day: '2026-10-01', value: 1 }];
  const all = () =>
    facts({
      sets: [{ day: '2026-10-01', value: 10 }],
      workouts: one,
      tasksDone: [...one, ...one],
      perfectDays: one,
      amounts: one,
      records: one,
    });

  it('each app levels on its own log, and lists only its own rows', () => {
    expect(xpBreakdown(all(), 'workout').map((line) => line.source)).toEqual([
      'sets',
      'workouts',
      'records',
    ]);
    expect(totalXp(all(), 'workout')).toBe(10 * 2 + 40 + 60);
    expect(xpBreakdown(all(), 'tasks').map((line) => line.source)).toEqual([
      'tasksDone',
      'perfectDays',
    ]);
    expect(totalXp(all(), 'tasks')).toBe(2 * 5 + 25);
    expect(xpBreakdown(all(), 'expenses').map((line) => line.source)).toEqual(['amounts']);
    expect(totalXp(all(), 'expenses')).toBe(3);
  });

  it('the three apps split the table between them, every row once', () => {
    const rows = (['workout', 'tasks', 'expenses'] as const).flatMap((v) =>
      xpWeightsFor(v).map((row) => row.source),
    );
    expect([...rows].sort()).toEqual(XP_WEIGHTS.map((row) => row.source).sort());
    expect(xpWeightsFor()).toBe(XP_WEIGHTS);
  });

  it('the Workout app holding 2.x tasks and money is not levelled by them', () => {
    const input: LogsInput = {
      ...EMPTY,
      workouts: [workout('2026-10-01', 20)],
      tasks: [
        {
          id: 't',
          name: 't',
          schedule: { kind: 'daily' },
          auto: null,
          startedOn: '2026-10-01',
          reminder: null,
          archivedAt: null,
          order: 0,
        },
      ],
      log: { t: { '2026-10-01': { mark: 'done', note: '' } } },
    };
    const scoped = logFacts({ ...input, variant: 'workout' });
    expect(scoped.tasksDone).toEqual([]);
    expect(totalXp(scoped, 'workout')).toBe(40 + 20 * 2);
  });
});
