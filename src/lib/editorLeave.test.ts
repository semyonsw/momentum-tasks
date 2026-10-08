import { describe, expect, it } from 'vitest';

import { editorBack, editorCommitSlot, editorGuardsBack } from './editorLeave';
import { emptyExerciseDraft, exerciseDraftChanged, bumpDraftRest } from './exerciseDraft';
import { bumpTargetSets, routineDraftChanged } from './routinePlan';
import type { RoutineItem } from '../types/models';

/**
 * The leave guard of the two editors whose Save moved from the header into the
 * floating slot (T-U3, U5). The last two blocks run each editor's own dirty
 * check through the rules, the way the screens do.
 */

const calm = { dirty: false, leaving: false, busy: false };

describe('the screen’s own ‹', () => {
  it('leaves an untouched draft on one press', () => {
    expect(editorBack(false)).toBe('leave');
  });

  it('asks before an edited draft goes', () => {
    expect(editorBack(true)).toBe('ask');
  });
});

describe('hardware back and the edge swipe', () => {
  it('pass straight through when nothing would be lost', () => {
    expect(editorGuardsBack(calm)).toBe(false);
  });

  it('ask when the draft is dirty', () => {
    expect(editorGuardsBack({ ...calm, dirty: true })).toBe(true);
  });

  it('stand down while a sheet or a lifted row owns back', () => {
    expect(editorGuardsBack({ dirty: true, leaving: false, busy: true })).toBe(false);
  });

  it('stand down once the screen is leaving, so the exit slide is not asked about', () => {
    expect(editorGuardsBack({ dirty: true, leaving: true, busy: false })).toBe(false);
  });
});

describe('the floating commit', () => {
  it('is awake when the draft can be committed', () => {
    expect(editorCommitSlot({ busy: false, canCommit: true })).toBe('awake');
  });

  it('is asleep, not gone, while it cannot be (an exercise with no name)', () => {
    expect(editorCommitSlot({ busy: false, canCommit: false })).toBe('asleep');
  });

  it('is gone while a row is in the air or a sheet is up', () => {
    expect(editorCommitSlot({ busy: true, canCommit: true })).toBe('hidden');
    expect(editorCommitSlot({ busy: true, canCommit: false })).toBe('hidden');
  });

  it('does not depend on whether the draft is dirty: Save on an untouched draft is fine', () => {
    // The header Save was always pressable; moving it must not change that.
    expect(editorCommitSlot({ busy: false, canCommit: true })).toBe('awake');
  });
});

describe('the routine editor', () => {
  const item = (overrides: Partial<RoutineItem>): RoutineItem => ({
    id: 'ri1',
    exerciseId: 'ex_dips',
    order: 0,
    targetSets: 4,
    targetRepsMax: 8,
    ...overrides,
  });
  const saved = { name: 'Pull', items: [item({ id: 'a' }), item({ id: 'b', order: 1 })] };

  it('lets an untouched routine go by back and by swipe', () => {
    const dirty = routineDraftChanged(saved, { name: 'Pull', items: [...saved.items] });
    expect(editorBack(dirty)).toBe('leave');
    expect(editorGuardsBack({ ...calm, dirty })).toBe(false);
  });

  it('asks about a nudged set count, by every way out', () => {
    const [a, b] = saved.items;
    const dirty = routineDraftChanged(saved, { name: 'Pull', items: [bumpTargetSets(a, 1), b] });
    expect(editorBack(dirty)).toBe('ask');
    expect(editorGuardsBack({ ...calm, dirty })).toBe(true);
  });
});

describe('the exercise editor', () => {
  const initial = emptyExerciseDraft('Dips');

  it('lets an untouched exercise go', () => {
    const dirty = exerciseDraftChanged(initial, { ...initial });
    expect(editorGuardsBack({ ...calm, dirty })).toBe(false);
  });

  it('asks about a nudged rest', () => {
    const dirty = exerciseDraftChanged(initial, bumpDraftRest(initial, 15));
    expect(editorBack(dirty)).toBe('ask');
    expect(editorGuardsBack({ ...calm, dirty })).toBe(true);
  });

  it('keeps Create asleep until there is a name', () => {
    const blank = emptyExerciseDraft('');
    expect(editorCommitSlot({ busy: false, canCommit: blank.name.trim() !== '' })).toBe('asleep');
    expect(editorCommitSlot({ busy: false, canCommit: 'Dips'.trim() !== '' })).toBe('awake');
  });
});
