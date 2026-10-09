import { describe, expect, it } from 'vitest';

import { editorBack } from './editorLeave';
import { taskDraftChanged, type TaskDraftShape } from './sheetDirty';

/**
 * U7: the task editor asks "Discard changes?" before a scrim tap, a handle drag,
 * back or Cancel throws a draft away — and only when saving would write
 * something different from what was opened.
 */

const fresh: TaskDraftShape = {
  name: '',
  schedule: { kind: 'daily' },
  startedOn: '2026-10-08',
  reminder: null,
};

const existing: TaskDraftShape = {
  name: 'Stretch',
  schedule: { kind: 'weekdays', days: [0, 2, 4] },
  startedOn: '2026-09-01',
  reminder: { hour: 7, minute: 0, every: 30 },
};

describe('a new task', () => {
  it('is clean when nothing was touched', () => {
    expect(taskDraftChanged(fresh, { ...fresh })).toBe(false);
    expect(editorBack(taskDraftChanged(fresh, fresh))).toBe('leave');
  });

  it('is dirty once a name is typed', () => {
    expect(taskDraftChanged(fresh, { ...fresh, name: 'Wash the dishes' })).toBe(true);
    expect(editorBack(taskDraftChanged(fresh, { ...fresh, name: 'W' }))).toBe('ask');
  });

  it('ignores whitespace-only typing, which save would trim away', () => {
    expect(taskDraftChanged(fresh, { ...fresh, name: '   ' })).toBe(false);
  });

  it('is dirty with no name but a reminder switched on', () => {
    expect(taskDraftChanged(fresh, { ...fresh, reminder: { hour: 7, minute: 0 } })).toBe(true);
  });

  it('is dirty when the schedule changed', () => {
    expect(
      taskDraftChanged(fresh, { ...fresh, schedule: { kind: 'once', day: '2026-10-09' } }),
    ).toBe(true);
    expect(
      taskDraftChanged(fresh, { ...fresh, schedule: { kind: 'weekdays', days: [0, 1, 2, 3, 4] } }),
    ).toBe(true);
  });

  it('is dirty when the start date moved', () => {
    expect(taskDraftChanged(fresh, { ...fresh, startedOn: '2026-10-01' })).toBe(true);
  });
});

describe('an existing task', () => {
  it('is clean when reopened as saved', () => {
    expect(taskDraftChanged(existing, { ...existing })).toBe(false);
  });

  it('is clean when the same days come back in another order', () => {
    expect(
      taskDraftChanged(existing, { ...existing, schedule: { kind: 'weekdays', days: [4, 0, 2] } }),
    ).toBe(false);
  });

  it('is clean when the name only gained surrounding spaces', () => {
    expect(taskDraftChanged(existing, { ...existing, name: ' Stretch ' })).toBe(false);
  });

  it('is dirty on a rename', () => {
    expect(taskDraftChanged(existing, { ...existing, name: 'Stretch well' })).toBe(true);
  });

  it('is dirty when a day is added or removed', () => {
    expect(
      taskDraftChanged(existing, { ...existing, schedule: { kind: 'weekdays', days: [0, 2] } }),
    ).toBe(true);
  });

  it('is dirty when the reminder time, spacing or switch changed', () => {
    expect(
      taskDraftChanged(existing, { ...existing, reminder: { hour: 7, minute: 5, every: 30 } }),
    ).toBe(true);
    expect(taskDraftChanged(existing, { ...existing, reminder: { hour: 7, minute: 0 } })).toBe(
      true,
    );
    expect(taskDraftChanged(existing, { ...existing, reminder: null })).toBe(true);
  });

  it('is dirty when a target is switched on, changed or taken off (T1)', () => {
    const counted = { ...existing, target: { count: 8, unit: 'glasses' } };
    expect(taskDraftChanged(existing, counted)).toBe(true);
    expect(taskDraftChanged(counted, { ...counted, target: { count: 9, unit: 'glasses' } })).toBe(
      true,
    );
    expect(taskDraftChanged(counted, { ...counted, target: { count: 8, unit: 'pages' } })).toBe(
      true,
    );
    expect(taskDraftChanged(counted, { ...counted, target: null })).toBe(true);
  });

  it('is dirty when switched to N times a week, or N changes (T2)', () => {
    const weekly = { ...existing, schedule: { kind: 'weekly' as const, times: 3 } };
    expect(taskDraftChanged(existing, weekly)).toBe(true);
    expect(taskDraftChanged(weekly, { ...weekly, schedule: { kind: 'weekly', times: 4 } })).toBe(
      true,
    );
    expect(taskDraftChanged(weekly, { ...weekly })).toBe(false);
  });

  it('treats an absent target and a null one as the same ordinary task', () => {
    expect(taskDraftChanged(existing, { ...existing, target: null })).toBe(false);
    const counted = { ...existing, target: { count: 8, unit: 'glasses' } };
    expect(taskDraftChanged(counted, { ...counted, target: { count: 8, unit: ' glasses ' } })).toBe(
      false,
    );
  });

  it('treats a missing `every` and an undefined one as the same single alert', () => {
    const single = { ...existing, reminder: { hour: 7, minute: 0 } };
    expect(
      taskDraftChanged(single, { ...existing, reminder: { hour: 7, minute: 0, every: undefined } }),
    ).toBe(false);
  });
});

describe('a one-day task', () => {
  const once: TaskDraftShape = {
    name: 'Call the bank',
    schedule: { kind: 'once', day: '2026-10-09' },
    startedOn: '2026-10-09',
    reminder: null,
  };

  it('reads its start from its day, so a stale start date is not a change', () => {
    expect(taskDraftChanged(once, { ...once, startedOn: '2026-10-08' })).toBe(false);
  });

  it('is dirty when its day moves', () => {
    expect(
      taskDraftChanged(once, {
        ...once,
        schedule: { kind: 'once', day: '2026-10-10' },
        startedOn: '2026-10-10',
      }),
    ).toBe(true);
  });
});
