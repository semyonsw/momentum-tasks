import { describe, expect, it } from 'vitest';

import { showTasksHint, taskRowActions, tasksEmptyState, toggledMark } from './taskTap';

/**
 * The tap, the hold and the empty day. The first is the one that matters: a tap
 * must never be able to excuse a day, however many times it lands.
 */

describe('the tap', () => {
  it('toggles done and unanswered', () => {
    expect(toggledMark(null)).toBe('done');
    expect(toggledMark('done')).toBeNull();
  });

  it('never writes missed on purpose, whatever it starts from', () => {
    let mark = toggledMark(null);
    for (let i = 0; i < 9; i += 1) {
      expect(mark).not.toBe('missed');
      mark = toggledMark(mark);
    }
  });

  it('a double tap is back where it started', () => {
    expect(toggledMark(toggledMark(null))).toBeNull();
    expect(toggledMark(toggledMark('done'))).toBe('done');
  });

  it('turns an excused day into a done one — a tap means "I did it"', () => {
    expect(toggledMark('missed')).toBe('done');
  });
});

describe('the hold menu', () => {
  it('offers the skip, the move and the month', () => {
    expect(taskRowActions(null, 5)).toEqual(['skip', 'pause', 'move', 'open']);
    expect(taskRowActions('done', 5)).toEqual(['skip', 'pause', 'move', 'open']);
  });

  it('offers to take a skip back on a row that is already excused', () => {
    expect(taskRowActions('missed', 5)).toEqual(['unskip', 'pause', 'move', 'open']);
  });

  it('offers a pause on every row, right under the one-day skip (T3)', () => {
    for (const mark of [null, 'done', 'missed'] as const) {
      const actions = taskRowActions(mark, 3);
      expect(actions.indexOf('pause')).toBe(1);
    }
  });

  it('keeps Move out when there is nothing to move past', () => {
    expect(taskRowActions(null, 1)).toEqual(['skip', 'pause', 'open']);
  });
});

describe('the empty day', () => {
  it('asks for a first task when there is no task at all', () => {
    expect(tasksEmptyState(0, 0)).toBe('first');
  });

  it('says one quiet line when tasks exist but none asks today', () => {
    expect(tasksEmptyState(3, 0)).toBe('quiet');
  });

  it('says nothing when there are rows', () => {
    expect(tasksEmptyState(3, 2)).toBeNull();
  });
});

describe('the hint', () => {
  it('shows only with two rows or more', () => {
    expect(showTasksHint(0)).toBe(false);
    expect(showTasksHint(1)).toBe(false);
    expect(showTasksHint(2)).toBe(true);
    expect(showTasksHint(12)).toBe(true);
  });
});
