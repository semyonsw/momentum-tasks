import { describe, expect, it } from 'vitest';

import { finishOpensSheet, planOffer } from './finishSheet';
import type { PlannedSetChange } from './routinePlan';
import { milestoneDue } from './milestones';

const quiet = { unlogged: 0, ladderMoved: false, records: 0, milestone: null };

describe('finishOpensSheet', () => {
  it('saves in one tap when there is nothing to say', () => {
    expect(finishOpensSheet(quiet)).toBe(false);
  });

  it('opens for unlogged sets, a moved ladder or a record', () => {
    expect(finishOpensSheet({ ...quiet, unlogged: 1 })).toBe(true);
    expect(finishOpensSheet({ ...quiet, ladderMoved: true })).toBe(true);
    expect(finishOpensSheet({ ...quiet, records: 2 })).toBe(true);
  });

  it('opens for a due milestone even with every set logged and no record', () => {
    const milestone = milestoneDue({ on: true, workoutNumber: 100, shown: 50 });
    expect(milestone).toBe(100);
    expect(finishOpensSheet({ ...quiet, milestone })).toBe(true);
  });

  it('stays one tap with the switch off, even at workout 100', () => {
    const milestone = milestoneDue({ on: false, workoutNumber: 100, shown: undefined });
    expect(finishOpensSheet({ ...quiet, milestone })).toBe(false);
  });
});

describe('finishOpensSheet and the plan (redesign #6)', () => {
  it('opens when the session strayed from its plan, even with every set logged', () => {
    expect(finishOpensSheet({ ...quiet, planChanged: true })).toBe(true);
    expect(finishOpensSheet({ ...quiet, planChanged: false })).toBe(false);
  });
});

describe('planOffer', () => {
  const bench: PlannedSetChange = {
    itemId: 'ri1',
    exerciseId: 'ex_bench',
    name: 'Bench press',
    plannedSets: 3,
    completedSets: 4,
    weightKg: 80,
  };
  const dips: PlannedSetChange = {
    itemId: 'ri2',
    exerciseId: 'ex_dips',
    name: 'Dips',
    plannedSets: 4,
    completedSets: 5,
  };

  it('offers nothing when the session matched the plan', () => {
    expect(planOffer([], 'Push', 'metric')).toBeNull();
  });

  it('names the one exercise, and promises the next session in the caption', () => {
    const offer = planOffer([bench], 'Push', 'metric');
    expect(offer?.title).toBe('Save and make 4 sets the plan for Bench press');
    expect(offer?.caption).toBe(
      'Next Push starts with 4 × 80 kg. Other exercises stay as planned.',
    );
    expect(offer?.rows).toEqual([{ key: 'ri1', name: 'Bench press', change: '3 sets → 4 sets' }]);
  });

  it('says sets, not a missing weight, for unweighted work', () => {
    expect(planOffer([dips], 'Push', 'metric')?.caption).toBe(
      'Next Push starts with 5 sets. Other exercises stay as planned.',
    );
  });

  it('counts two or more, and the caption lists them', () => {
    const offer = planOffer([bench, dips], 'Push', 'metric');
    expect(offer?.title).toBe('Save and update 2 exercises in the plan');
    expect(offer?.caption).toBe(
      'Bench press 4 sets, Dips 5 sets. Other exercises stay as planned.',
    );
    expect(offer?.rows).toHaveLength(2);
  });

  it('reads in Russian with the plural the number needs', () => {
    const offer = planOffer([bench], 'Жим', 'metric', 'ru');
    expect(offer?.title).toContain('4 подхода');
    expect(offer?.title).not.toContain('Save');
  });
});
