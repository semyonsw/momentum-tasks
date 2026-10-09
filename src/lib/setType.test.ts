import { describe, expect, it } from 'vitest';

import {
  SET_KINDS,
  cleanSetType,
  endsAtLimit,
  isLadderRung,
  kindBadge,
  kindName,
  setKindOf,
  shorthandMark,
  withKind,
} from './setType';
import { atLimit } from './effort';
import { summarizeSessionSets } from './history';
import { sessionVolume, type DraftSession, type DraftSet } from './draft';
import { buildCompletedWorkout as buildRecord } from './completedWorkout';
import { clusterBalance } from './balance';
import { evaluateOverload } from './progressiveOverload';
import { exerciseBests, recordsBrokenIn } from './records';
import {
  ladderOutcomes,
  ladderTargets,
  performedLadderCounts,
  reshapeLadderSets,
} from './repLadder';
import { seedExercisesById } from '../data/seed';
import type { SetHistory } from '../types/models';

/**
 * T-12 · set types. The model is `isWarmup` (unchanged) plus an optional
 * `setType`, so most of what is tested here is that the three new kinds are
 * WORKING sets to every reader that already existed, and that the warm-up flag
 * can never be lost.
 */

function row(over: Partial<SetHistory> = {}, index = 0): SetHistory {
  return {
    id: `r${index}`,
    sessionId: 's1',
    exerciseId: 'ex_bench',
    performedAt: '2026-09-01T17:00:00.000Z',
    setIndex: index,
    weightKg: 80,
    count: 5,
    countUnit: 'reps',
    loadMode: 'external',
    isWarmup: false,
    isCompleted: true,
    ...over,
  };
}

describe('the model', () => {
  it('reads a kind from both fields', () => {
    expect(setKindOf({ isWarmup: false })).toBe('working');
    expect(setKindOf({ isWarmup: true })).toBe('warmup');
    expect(setKindOf({ isWarmup: false, setType: 'drop' })).toBe('drop');
    expect(setKindOf({ isWarmup: false, setType: 'failure' })).toBe('failure');
    expect(setKindOf({ isWarmup: false, setType: 'amrap' })).toBe('amrap');
  });

  it('a warm-up flag beats any type — the warm-up is the thing never lost', () => {
    expect(setKindOf({ isWarmup: true, setType: 'drop' })).toBe('warmup');
    expect(cleanSetType('drop', true)).toBeUndefined();
  });

  it('validates the stored type', () => {
    expect(cleanSetType('drop', false)).toBe('drop');
    expect(cleanSetType('failure', false)).toBe('failure');
    expect(cleanSetType('amrap', false)).toBe('amrap');
    expect(cleanSetType('warmup', false)).toBeUndefined();
    expect(cleanSetType('working', false)).toBeUndefined();
    expect(cleanSetType('superset', false)).toBeUndefined();
    expect(cleanSetType(3, false)).toBeUndefined();
    expect(cleanSetType(undefined, false)).toBeUndefined();
  });

  it('writes both fields together and round-trips every kind', () => {
    for (const kind of SET_KINDS) {
      const set = withKind({ id: 'x', isWarmup: false, count: 5 }, kind);
      expect(setKindOf(set)).toBe(kind);
      expect(set.count).toBe(5);
    }
    // Making a drop set a warm-up takes the type away; making a warm-up a working
    // set takes the flag away. No stale field is left behind.
    const warm = withKind({ isWarmup: false, setType: 'drop' as const }, 'warmup');
    expect(warm).toEqual({ isWarmup: true });
    expect(withKind({ isWarmup: true }, 'working')).toEqual({ isWarmup: false });
  });

  it('old warm-up data keeps meaning warm-up, untouched', () => {
    const old = row({ isWarmup: true });
    expect(setKindOf(old)).toBe('warmup');
    expect('setType' in old).toBe(false);
  });

  it('badges and names every kind, in both languages', () => {
    expect(SET_KINDS.map(kindBadge)).toEqual([null, 'W', 'D', 'F', 'A']);
    for (const kind of SET_KINDS) {
      expect(kindName(kind, 'en')).not.toBe('');
      expect(kindName(kind, 'ru')).not.toBe(kindName(kind, 'en'));
    }
    expect(kindName('amrap', 'en')).toBe('AMRAP');
    expect(kindName('drop', 'ru')).toBe('Дроп-сет');
  });
});

describe('the shorthand', () => {
  const bench = { countUnit: 'reps' as const, loadMode: 'external' as const };

  it('marks failure F, AMRAP +, drop D — and leaves a plain line alone', () => {
    const sets = [
      row({}, 0),
      row({ setType: 'failure' }, 1),
      row({ setType: 'amrap', count: 8 }, 2),
      row({ setType: 'drop', weightKg: 60, count: 10 }, 3),
      row({ setType: 'drop', weightKg: 60, count: 8 }, 4),
    ];
    const { lead, drops } = summarizeSessionSets(sets, bench);
    expect(lead).toBe('80 kg · 5 5F 8+');
    expect(drops).toBe(' · 60 kg · 10D 8D');
    expect(summarizeSessionSets([row({}, 0), row({}, 1)], bench).lead).toBe('80 kg · 5 5');
  });

  it('still drops warm-ups, typed or not', () => {
    const sets = [row({ isWarmup: true, weightKg: 40 }, 0), row({ setType: 'failure' }, 1)];
    expect(summarizeSessionSets(sets, bench).lead).toBe('80 kg · 5F');
  });

  it('puts no marks on time, distance or rounds', () => {
    const plank = { countUnit: 'seconds' as const, loadMode: 'none' as const };
    const sets = [row({ weightKg: null, count: 90, countUnit: 'seconds', setType: 'failure' })];
    expect(summarizeSessionSets(sets, plank).lead).not.toContain('F');
    expect(shorthandMark({ isWarmup: true })).toBe('');
  });
});

describe('volume and counting', () => {
  const benchEx = seedExercisesById.ex_bench_press ?? Object.values(seedExercisesById)[0];

  function session(kinds: DraftSet['setType'][], warmups = 1): DraftSession {
    const ex = { ...benchEx, countUnit: 'reps' as const, loadMode: 'external' as const };
    const sets: DraftSet[] = [
      ...Array.from({ length: warmups }, (_, i) => ({
        localId: `w${i}`,
        weightKg: 40,
        count: 5,
        isWarmup: true,
        isCompleted: true,
        completedAt: '2026-09-01T17:01:00.000Z',
        isPrefilled: false,
      })),
      ...kinds.map((setType, i) => ({
        localId: `s${i}`,
        weightKg: 80,
        count: 5,
        isWarmup: false,
        isCompleted: true,
        completedAt: '2026-09-01T17:05:00.000Z',
        isPrefilled: false,
        ...(setType ? { setType } : {}),
      })),
    ];
    return {
      localId: 'sess',
      title: 'Push',
      startedAt: '2026-09-01T17:00:00.000Z',
      entries: [
        {
          localId: 'e1',
          exercise: ex,
          targetSets: 3,
          restSeconds: 120,
          transitionRestSeconds: 150,
          sets,
          overload: evaluateOverload({ exercise: ex, history: [] }),
          overloadAccepted: false,
          lastSessionSummary: null,
        },
      ],
    } as DraftSession;
  }

  it('drop, failure and AMRAP are working volume; a warm-up is not', () => {
    const typed = sessionVolume(session([undefined, 'drop', 'failure', 'amrap']));
    const plain = sessionVolume(session([undefined, undefined, undefined, undefined]));
    expect(typed.kg).toBe(4 * 80 * 5);
    expect(typed.kg).toBe(plain.kg);
  });

  it('the stored workout counts them as sets, and leaves warm-ups out', () => {
    const record = buildRecord(session([undefined, 'drop', 'failure', 'amrap'], 2));
    expect(record?.setCount).toBe(4);
    expect(record?.exercises[0].setCount).toBe(4);
    expect(record?.sets.filter((r) => r.setType)).toHaveLength(3);
    expect(record?.sets.filter((r) => r.isWarmup)).toHaveLength(2);
  });

  it('sets per cluster include every working kind and no warm-up', () => {
    const record = buildRecord(session([undefined, 'drop', 'failure', 'amrap'], 2));
    if (!record) throw new Error('nothing built');
    const balance = clusterBalance({
      workouts: [record],
      exercisesById: { [benchEx.id]: benchEx },
      windowDays: null,
    });
    expect(balance.totalSets).toBe(4);
  });
});

describe('records', () => {
  it('a failure or AMRAP set can set a record; a warm-up never does', () => {
    const before = [row({ sessionId: 's0', weightKg: 80, count: 5 })];
    const today = [
      row({ sessionId: 's1', isWarmup: true, weightKg: 120, count: 1 }, 0),
      row({ sessionId: 's1', setType: 'amrap', weightKg: 80, count: 9 }, 1),
    ];
    const broken = recordsBrokenIn(today, [...before, ...today]);
    expect(broken).toHaveLength(1);
    expect(broken[0].count).toBe(9);
    const bests = exerciseBests([...before, ...today], {
      id: 'ex_bench',
      countUnit: 'reps',
      loadMode: 'external',
    });
    expect(bests.heaviest?.weightKg).toBe(80);
    expect(bests.mostCount?.count).toBe(9);
  });
});

describe('the ladder', () => {
  const ladder = { max: 16, earned: 0 };
  const done = (count: number, setType?: 'drop' | 'failure' | 'amrap', isWarmup = false) => ({
    count,
    isWarmup,
    isCompleted: true,
    isPrefilled: false,
    ...(setType ? { setType } : {}),
  });

  it('a drop set is not a rung; failure and AMRAP are', () => {
    expect(isLadderRung({ isWarmup: false, setType: 'drop' })).toBe(false);
    expect(isLadderRung({ isWarmup: true })).toBe(false);
    expect(isLadderRung({ isWarmup: false, setType: 'failure' })).toBe(true);
    expect(isLadderRung({ isWarmup: false, setType: 'amrap' })).toBe(true);
    expect(
      performedLadderCounts([done(16, 'failure'), done(10), done(30, 'drop'), done(8)]),
    ).toEqual([16, 10, 8]);
  });

  it('a burn-out drop set after a met ladder does not fail the session', () => {
    const targets = ladderTargets(ladder, 5);
    const sets = [
      ...targets.map((c, i) => done(c, i === 0 ? 'amrap' : undefined)),
      done(3, 'drop'),
    ];
    const outcomes = ladderOutcomes([
      { exercise: { id: 'ex_pullup', name: 'Pull-ups', countUnit: 'reps', ladder }, sets },
    ]);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].after.earned).toBe(1);
  });

  it('reshaping skips a drop set row, so the rungs below it keep their targets', () => {
    const targets = [16, 10, 8];
    const rows = [
      { ...done(16), isCompleted: true },
      {
        count: 5,
        isWarmup: false,
        isCompleted: false,
        isPrefilled: true,
        setType: 'drop' as const,
      },
      { count: 0, isWarmup: false, isCompleted: false, isPrefilled: true },
      { count: 0, isWarmup: false, isCompleted: false, isPrefilled: true },
    ];
    expect(reshapeLadderSets(rows, targets)).toEqual([null, null, 10, 8]);
  });
});

describe('the nudge', () => {
  const exercise = {
    id: 'ex_bench',
    requiresWeight: true,
    incrementKg: 2.5,
    countUnit: 'reps' as const,
  };
  const NOW = new Date('2026-08-13T12:00:00.000Z');
  const session = (id: string, date: string, sets: Partial<SetHistory>[]): SetHistory[] =>
    sets.map((over, i) =>
      row({ sessionId: id, performedAt: `${date}T18:00:00.000Z`, count: 10, ...over }, i),
    );
  const plateau = (latest: Partial<SetHistory>[]) => [
    ...session('a', '2026-07-21', [{}, {}, {}]),
    ...session('b', '2026-07-28', [{}, {}, {}]),
    ...session('c', '2026-08-04', [{}, {}, {}]),
    ...session('d', '2026-08-08', latest),
  ];

  it('failure and AMRAP sets count as at the limit unless graded otherwise', () => {
    expect(endsAtLimit({ setType: 'failure' })).toBe(true);
    expect(endsAtLimit({ setType: 'amrap' })).toBe(true);
    expect(endsAtLimit({ setType: 'drop' })).toBe(false);
    expect(atLimit({ setType: 'amrap' })).toBe(true);
    expect(atLimit({ setType: 'amrap', rir: 1 })).toBe(false);
    expect(atLimit({ setType: 'drop' })).toBe(false);
  });

  it('an AMRAP of 12 is not a reason to add weight on its own', () => {
    const verdict = evaluateOverload({
      exercise,
      history: plateau([{ count: 6 }, { count: 6 }, { setType: 'amrap', count: 12 }]),
      now: NOW,
    });
    expect(verdict.shouldNudge).toBe(false);
    expect(verdict.suggestedWeightKg).toBeNull();
  });

  it('nor is a set to failure', () => {
    const verdict = evaluateOverload({
      exercise,
      history: plateau([{ setType: 'failure' }, { setType: 'failure' }]),
      now: NOW,
    });
    expect(verdict.status).toBe('building');
  });

  it('an AMRAP graded RIR 1 counts like any set', () => {
    const verdict = evaluateOverload({
      exercise,
      history: plateau([{ setType: 'amrap', count: 12, rir: 1 }]),
      now: NOW,
    });
    expect(verdict.status).toBe('due_weight');
  });

  it('a lighter drop set does not become the top weight, and the plain sets still count', () => {
    const verdict = evaluateOverload({
      exercise,
      history: plateau([{}, {}, { setType: 'drop', weightKg: 60, count: 15 }]),
      now: NOW,
    });
    expect(verdict.currentWeightKg).toBe(80);
    expect(verdict.status).toBe('due_weight');
  });
});
