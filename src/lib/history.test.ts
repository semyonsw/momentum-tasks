import { describe, expect, it } from 'vitest';

import { describeHistory, sessionRows, summarizeSessionSets, topWeightSeries } from './history';
import { seedExercisesById } from '../data/seed';
import type { SetHistory } from '../types/models';

/**
 * The history list's edges. `shorthand.test.ts` pins the design's literal strings
 * for the common sessions; this covers what it does not — set-type marks, the
 * meters unit, the one-line description under the exercise name, and the
 * grouping/ordering rules that decide which number the chart plots.
 */

const deadlift = seedExercisesById.ex_deadlift; // reps, external
const pullup = seedExercisesById.ex_pullup_90; // reps, added_bodyweight
const plank = seedExercisesById.ex_plank; // seconds

let nextId = 0;
function row(
  sessionId: string,
  performedAt: string,
  setIndex: number,
  weightKg: number | null,
  count: number,
  extra: Partial<SetHistory> = {},
): SetHistory {
  nextId += 1;
  return {
    id: `h${nextId}`,
    sessionId,
    exerciseId: deadlift.id,
    performedAt,
    setIndex,
    weightKg,
    count,
    countUnit: 'reps',
    loadMode: 'external',
    isWarmup: false,
    isCompleted: true,
    ...extra,
  };
}

const MON = '2026-09-14T18:00:00.000Z';
const WED = '2026-09-16T18:00:00.000Z';
const FRI = '2026-09-18T18:00:00.000Z';

describe('summarizeSessionSets', () => {
  it('is empty for no sets', () => {
    expect(summarizeSessionSets([], deadlift)).toEqual({
      lead: '',
      drops: null,
      topWeightKg: null,
    });
  });

  it('marks set types: F to failure, + AMRAP, D drop', () => {
    const sets = [
      row('s', MON, 0, 100, 5),
      row('s', MON, 1, 100, 5, { setType: 'failure' }),
      row('s', MON, 2, 100, 8, { setType: 'amrap' }),
      row('s', MON, 3, 60, 10, { setType: 'drop' }),
    ];
    expect(summarizeSessionSets(sets, deadlift)).toEqual({
      lead: '100 kg · 5 5F 8+',
      drops: ' · 60 kg · 10D',
      topWeightKg: 100,
    });
  });

  it('starts a new group when the weight returns after a change', () => {
    const sets = [row('s', MON, 0, 100, 5), row('s', MON, 1, 90, 5), row('s', MON, 2, 100, 3)];
    const result = summarizeSessionSets(sets, deadlift);
    // The FIRST group at the top weight leads; the later return is a separate group.
    expect(result.lead).toBe('100 kg · 5');
    expect(result.drops).toBe(' · 90 kg · 5 · 100 kg · 3');
  });

  it('prefixes added-bodyweight loads with +', () => {
    const sets = [row('s', MON, 0, 20, 6, { exerciseId: pullup.id, loadMode: 'added_bodyweight' })];
    expect(summarizeSessionSets(sets, pullup).lead).toBe('+20 kg · 6');
  });

  it('renders mixed weighted and unweighted sets without inventing a weight', () => {
    const sets = [row('s', MON, 0, null, 10), row('s', MON, 1, 20, 8)];
    const result = summarizeSessionSets(sets, deadlift);
    expect(result.topWeightKg).toBe(20);
    expect(result.lead).toBe('20 kg · 8');
    expect(result.drops).toBe(' · 10');
  });

  it('sums meters into one distance', () => {
    const sets = [row('s', MON, 0, null, 400), row('s', MON, 1, null, 600)];
    expect(summarizeSessionSets(sets, { countUnit: 'meters', loadMode: 'none' }).lead).toBe(
      '1000 m',
    );
  });

  it('lists each time-based set as its own duration, with no marks', () => {
    const sets = [
      row('s', MON, 0, null, 60, { countUnit: 'seconds', setType: 'failure' }),
      row('s', MON, 1, null, 90, { countUnit: 'seconds' }),
    ];
    const lead = summarizeSessionSets(sets, plank).lead;
    expect(lead).toContain(' · ');
    expect(lead).not.toContain('F');
  });

  it('speaks Russian units when asked', () => {
    const sets = [row('s', MON, 0, 100, 5)];
    expect(summarizeSessionSets(sets, deadlift, 'ru').lead).not.toContain('kg');
  });
});

describe('sessionRows', () => {
  it('groups by session, orders sets by index, and lists newest first', () => {
    const history = [
      row('a', MON, 1, 100, 4),
      row('b', FRI, 0, 110, 3),
      row('a', MON, 0, 100, 5),
      row('c', WED, 0, 105, 5),
    ];
    const rows = sessionRows(history, deadlift);
    expect(rows.map((r) => r.sessionId)).toEqual(['b', 'c', 'a']);
    expect(rows[2].lead).toBe('100 kg · 5 4');
    expect(rows[2].performedAt).toBe(MON);
  });

  it('ignores other exercises, warm-ups, incomplete and zero-count sets', () => {
    const history = [
      row('a', MON, 0, 60, 5, { isWarmup: true }),
      row('a', MON, 1, 100, 5),
      row('a', MON, 2, 100, 0),
      row('a', MON, 3, 100, 3, { isCompleted: false }),
      row('a', MON, 4, 200, 9, { exerciseId: 'ex_other' }),
    ];
    const rows = sessionRows(history, deadlift);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ lead: '100 kg · 5', drops: null, topWeightKg: 100 });
  });

  it('omits a session that had only warm-ups', () => {
    expect(sessionRows([row('a', MON, 0, 60, 5, { isWarmup: true })], deadlift)).toEqual([]);
  });

  it('is empty for no history', () => {
    expect(sessionRows([], deadlift)).toEqual([]);
  });
});

describe('topWeightSeries', () => {
  it('plots oldest first and skips unweighted sessions', () => {
    const rows = sessionRows(
      [row('a', MON, 0, 100, 5), row('b', WED, 0, null, 10), row('c', FRI, 0, 110, 3)],
      deadlift,
    );
    expect(topWeightSeries(rows)).toEqual([
      { at: MON, value: 100 },
      { at: FRI, value: 110 },
    ]);
  });

  it('plots the top weight, not the drop', () => {
    const rows = sessionRows([row('a', MON, 0, 100, 5), row('a', MON, 1, 60, 10)], deadlift);
    expect(topWeightSeries(rows)).toEqual([{ at: MON, value: 100 }]);
  });
});

describe('describeHistory', () => {
  const rows = sessionRows(
    [row('a', MON, 0, 100, 5), row('b', WED, 0, 115, 3), row('c', FRI, 0, 110, 3)],
    deadlift,
  );

  it('counts sessions and states the all-time top', () => {
    expect(describeHistory(rows, null)).toBe('3 sessions · top 115 kg');
  });

  it('uses the singular for one session', () => {
    expect(describeHistory(rows.slice(0, 1), null)).toBe('1 session · top 110 kg');
  });

  it('adds the plateau clause only for a positive plateau', () => {
    expect(describeHistory(rows, 16)).toBe('3 sessions · top 115 kg · same weight for 16 days');
    expect(describeHistory(rows, 0)).toBe('3 sessions · top 115 kg');
  });

  it('carries the load prefix onto the top weight', () => {
    expect(describeHistory(rows, null, '+')).toBe('3 sessions · top +115 kg');
  });

  it('says only the count for unweighted work', () => {
    const plain = sessionRows([row('a', MON, 0, null, 12)], deadlift);
    expect(describeHistory(plain, null)).toBe('1 session');
  });

  it('describes an empty history without a stray separator', () => {
    expect(describeHistory([], null)).toBe('0 sessions');
  });

  it('declines the Russian noun by count', () => {
    const ru = (n: number) =>
      describeHistory(rows.slice(0, 0).concat(Array(n).fill(rows[0])), null, '', 'ru');
    expect(ru(1)).toContain('тренировка');
    expect(ru(3)).toContain('тренировки');
    expect(ru(5)).not.toContain('тренировки');
    expect(ru(3)).not.toContain('kg');
  });
});
