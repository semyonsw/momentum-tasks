import { describe, expect, it } from 'vitest';

import { useActiveWorkout } from './activeWorkoutStore';
import { focusPlan } from '../lib/focusPlan';
import { nudgeSet, nudgeSteps } from '../lib/setNudge';
import { formatCount, formatWeight, lbToKg } from '../lib/units';
import { upNextSet } from '../lib/upNext';
import { workLines } from '../components/FocusNumbers';
import { seedExercises, seedRoutines, seedUser } from '../data/seed';
import { fixtureHistoryByExerciseId } from '../../test/fixtures/history';
import type { DraftSet } from '../lib/draft';
import type { Exercise, ID, UnitSystem } from '../types/models';

/**
 * Focus mode and the board are two views of ONE set — on the real store.
 *
 * The reported bug ("go into focus mode, come back, the numbers read wrong until
 * + then −") had a drawing half and a data half to rule out. The drawing half is
 * `lib/inlineEditor.test.ts` and `lib/rollingDigits.test.ts`. This is the data
 * half: every edit made in focus mode is the edit the board reads, every edit
 * made on the board is what focus mode shows when it opens, both draw the number
 * with the same formatter, and a + then − is a no-op in both units — so nothing
 * in the store ever needs a "reset" to read right.
 */

const exercisesById = Object.fromEntries(seedExercises.map((e) => [e.id, e])) as Record<
  ID,
  Exercise
>;

function start(unitSystem: UnitSystem = 'metric', index = 0) {
  const store = useActiveWorkout.getState();
  store.discardSession();
  store.startSession({
    routine: seedRoutines[index],
    exercisesById,
    historyByExerciseId: fixtureHistoryByExerciseId,
    policy: seedUser.overloadPolicy,
    unitSystem,
    defaultRestSeconds: 120,
    defaultTransitionRestSeconds: 150,
  });
  const session = useActiveWorkout.getState().session;
  if (!session) throw new Error('fixture routine built no session');
  return session;
}

const session = () => {
  const s = useActiveWorkout.getState().session;
  if (!s) throw new Error('no session');
  return s;
};

/** What focus mode is pointed at, read fresh from the store. */
function focusCurrent() {
  const current = focusPlan(session()).current;
  if (!current) throw new Error('focus mode has nothing to show');
  return current;
}

/** The board's row for a set, read fresh from the store. */
function boardRow(entryId: ID, setId: ID): DraftSet {
  const entry = session().entries.find((e) => e.localId === entryId);
  const set = entry?.sets.find((s) => s.localId === setId);
  if (!set) throw new Error('row not on the board');
  return set;
}

/** Focus mode's ± circle: the same call `FocusMode.nudge` makes. */
function focusNudge(field: 'weight' | 'count', delta: number, unitSystem: UnitSystem = 'metric') {
  const { entryId, setId, set } = focusCurrent();
  useActiveWorkout.getState().patchSet(entryId, setId, nudgeSet(set, field, delta, unitSystem));
}

/** The board's QuickAdjust chip on a given row: the same call it makes. */
function boardChip(
  entryId: ID,
  setId: ID,
  field: 'weight' | 'count',
  delta: number,
  unitSystem: UnitSystem = 'metric',
) {
  const set = boardRow(entryId, setId);
  useActiveWorkout.getState().patchSet(entryId, setId, nudgeSet(set, field, delta, unitSystem));
}

function focusDone() {
  const { entryId, setId } = focusCurrent();
  useActiveWorkout.getState().completeSet(entryId, setId);
}

const weighted = () => {
  const s = start();
  const entry = s.entries.find((e) => e.exercise.requiresWeight);
  if (!entry) throw new Error('fixture routine has no weighted exercise');
  return entry;
};

describe('focus mode and the board point at the same set', () => {
  it('focus mode opens on the board’s up-next row', () => {
    start();
    const up = upNextSet(session());
    const { entryId, setId } = focusCurrent();
    expect({ entryId, setId }).toEqual(up);
  });

  it('after DONE in focus mode, both move to the same next row', () => {
    start();
    focusDone();
    const up = upNextSet(session());
    const { entryId, setId } = focusCurrent();
    expect({ entryId, setId }).toEqual(up);
  });
});

describe('an edit in focus mode is the edit the board reads', () => {
  it('weight +coarse in focus mode reads on the board row at once', () => {
    weighted();
    const before = focusCurrent();
    const kg = before.set.weightKg ?? 0;
    focusNudge('weight', 2);
    expect(boardRow(before.entryId, before.setId).weightKg).toBe(kg + 2);
  });

  it('count +1 in focus mode reads on the board row at once', () => {
    start();
    const before = focusCurrent();
    focusNudge('count', 1);
    expect(boardRow(before.entryId, before.setId).count).toBe(before.set.count + 1);
  });

  it('the edited row stops being a ghost on the board — it is a fact now', () => {
    start();
    const { entryId, setId } = focusCurrent();
    focusNudge('count', 1);
    expect(boardRow(entryId, setId).isPrefilled).toBe(false);
  });

  it('the logged row keeps the numbers focus mode logged it with', () => {
    weighted();
    const { entryId, setId, set } = focusCurrent();
    focusNudge('weight', 2);
    focusNudge('count', -1);
    focusDone();
    expect(boardRow(entryId, setId)).toMatchObject({
      isCompleted: true,
      weightKg: (set.weightKg ?? 0) + 2,
      count: Math.max(0, set.count - 1),
    });
  });

  it('no other row on the board moves', () => {
    start();
    const before = structuredClone(session());
    const { entryId, setId } = focusCurrent();
    focusNudge('count', 2);
    for (const entry of session().entries) {
      const old = before.entries.find((e) => e.localId === entry.localId)!;
      for (const row of entry.sets) {
        if (entry.localId === entryId && row.localId === setId) continue;
        const was = old.sets.find((s) => s.localId === row.localId)!;
        expect({ w: row.weightKg, c: row.count }).toEqual({ w: was.weightKg, c: was.count });
      }
    }
  });
});

describe('an edit on the board is what focus mode shows', () => {
  it('a board chip on the up-next row is what focus mode opens on', () => {
    start();
    const { entryId, setId, set } = focusCurrent();
    boardChip(entryId, setId, 'count', 2);
    expect(focusCurrent().set.count).toBe(set.count + 2);
  });

  it('a board edit on a LATER row shows in focus mode when that row comes up', () => {
    start();
    const { entryId } = focusCurrent();
    const entry = session().entries.find((e) => e.localId === entryId)!;
    if (entry.sets.length < 2) return;
    const second = entry.sets[1];
    boardChip(entryId, second.localId, 'count', 3);
    focusDone();
    const now = focusCurrent();
    expect(now.setId).toBe(second.localId);
    expect(now.set.count).toBe(second.count + 3);
  });
});

describe('+ then − is a no-op, so nothing ever needs resetting', () => {
  const metricSteps = nudgeSteps('weight', 'reps', 'metric');
  const imperialSteps = nudgeSteps('weight', 'reps', 'imperial');

  it('every metric weight 0–200 kg survives +fine −fine and +coarse −coarse', () => {
    for (let kg = 0; kg <= 200; kg += 0.5) {
      for (const step of [metricSteps.fine, metricSteps.coarse]) {
        const up = nudgeSet({ weightKg: kg, count: 5 }, 'weight', step, 'metric');
        const back = nudgeSet({ weightKg: up.weightKg!, count: 5 }, 'weight', -step, 'metric');
        expect(back.weightKg).toBe(kg);
      }
    }
  });

  it('every imperial weight 0–400 lb reads the same after + then −', () => {
    for (let lb = 0; lb <= 400; lb += 2.5) {
      const kg = lbToKg(lb);
      for (const step of [imperialSteps.fine, imperialSteps.coarse]) {
        const up = nudgeSet({ weightKg: kg, count: 5 }, 'weight', step, 'imperial');
        const back = nudgeSet({ weightKg: up.weightKg!, count: 5 }, 'weight', -step, 'imperial');
        expect(formatWeight(back.weightKg!, 'imperial')).toBe(formatWeight(kg, 'imperial'));
      }
    }
  });

  it('every count 0–100 survives + then −', () => {
    for (let n = 0; n <= 100; n++) {
      for (const step of [1, 2]) {
        const up = nudgeSet({ weightKg: 40, count: n }, 'count', step, 'metric');
        expect(nudgeSet({ weightKg: 40, count: up.count! }, 'count', -step, 'metric').count).toBe(
          n,
        );
      }
    }
  });

  it('a long mixed sequence in focus mode and on the board nets out on the store', () => {
    weighted();
    const { entryId, setId, set } = focusCurrent();
    const kg = set.weightKg ?? 0;
    const reps = set.count;
    const plan: ['focus' | 'board', 'weight' | 'count', number][] = [
      ['focus', 'weight', 2],
      ['board', 'weight', 0.5],
      ['focus', 'count', 1],
      ['board', 'count', 2],
      ['focus', 'weight', -0.5],
      ['board', 'weight', -2],
      ['focus', 'count', -2],
      ['board', 'count', -1],
    ];
    for (const [where, field, delta] of plan) {
      if (where === 'focus') focusNudge(field, delta);
      else boardChip(entryId, setId, field, delta);
    }
    expect(boardRow(entryId, setId)).toMatchObject({ weightKg: kg, count: reps });
    expect(focusCurrent().set).toMatchObject({ weightKg: kg, count: reps });
  });
});

describe('both views draw the number with the same formatter', () => {
  for (const unitSystem of ['metric', 'imperial'] as const) {
    it(`focus mode’s number is the board’s number (${unitSystem})`, () => {
      start(unitSystem);
      for (let i = 0; i < 6; i++) {
        const target = focusCurrent();
        const { exercise } = target.entry;
        const lines = workLines(target, unitSystem, 'en');
        const count = lines[lines.length - 1].value;
        if (exercise.requiresWeight) {
          expect(lines[0].value).toBe(
            formatWeight(target.set.weightKg, unitSystem, exercise.loadMode),
          );
        }
        if (count !== 'MAX') expect(count).toBe(formatCount(target.set.count, exercise.countUnit));
        focusNudge('weight', 2, unitSystem);
        focusNudge('count', 1, unitSystem);
        focusDone();
        if (!focusPlan(session()).current) break;
      }
    });
  }

  it('a nudge in focus mode never leaves float noise on the board', () => {
    weighted();
    for (let i = 0; i < 30; i++) focusNudge('weight', 0.5);
    for (let i = 0; i < 30; i++) focusNudge('weight', -0.5);
    const { set, entry } = focusCurrent();
    expect(formatWeight(set.weightKg, 'metric', entry.exercise.loadMode)).not.toMatch(/\d\.\d{2,}/);
  });
});

describe('the floor holds in both views', () => {
  it('focus mode cannot take a count below zero', () => {
    start();
    for (let i = 0; i < 50; i++) focusNudge('count', -2);
    expect(focusCurrent().set.count).toBe(0);
  });

  it('focus mode cannot take a weight below zero', () => {
    weighted();
    for (let i = 0; i < 200; i++) focusNudge('weight', -2);
    expect(focusCurrent().set.weightKg).toBe(0);
  });
});
