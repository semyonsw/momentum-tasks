import { describe, expect, it } from 'vitest';

import {
  BACKED_UP_FIELDS,
  SETTINGS_NOT_BACKED_UP,
  pickFields,
  settingsSlice,
  sliceChanged,
  watchedStores,
} from './backupWatch';

/**
 * Which changes ask for a backup write. The stores themselves are exercised in
 * `state/backupWatch.test.ts`; this is the rule, on plain objects.
 */

describe('a change is a backed-up field that is a new reference', () => {
  const chats = { workout: [] };
  const archive = { workout: [] };
  const proposals = {};

  it('ignores fields the backup does not carry', () => {
    const before = pickFields({ chats, archive, proposals, pending: false }, BACKED_UP_FIELDS.ai);
    const after = pickFields({ chats, archive, proposals, pending: true }, BACKED_UP_FIELDS.ai);
    expect(sliceChanged(before, after)).toBe(false);
  });

  it('sees a replaced field', () => {
    const before = pickFields({ chats, archive, proposals }, BACKED_UP_FIELDS.ai);
    const after = pickFields({ chats: { workout: [1] }, archive, proposals }, BACKED_UP_FIELDS.ai);
    expect(sliceChanged(before, after)).toBe(true);
  });

  it('sees a field appear or vanish', () => {
    expect(sliceChanged({ a: 1 }, { a: 1, b: 2 })).toBe(true);
    expect(sliceChanged({ a: 1, b: 2 }, { a: 1 })).toBe(true);
    expect(sliceChanged({ a: 1, b: undefined }, { a: 1, c: undefined })).toBe(true);
  });

  it('does not see an equal-but-new object as unchanged — and does not need to', () => {
    // Stores replace what they edit, so a new reference is a change; a store that
    // rebuilt an equal value would cost one extra write, never a missed one.
    expect(sliceChanged({ a: { x: 1 } }, { a: { x: 1 } })).toBe(true);
  });
});

describe('the settings slice', () => {
  const base = {
    restSecondsBetweenSets: 90,
    gyms: [],
    autoBackupEnabled: true,
    autoBackupFolderUri: 'content://tree',
    autoBackupFile: { uri: 'content://f', day: '2026-10-15' },
    lastBackupAt: '2026-10-15T10:00:00.000Z',
    setNumber: () => undefined,
  };

  it('holds every setting and none of the backup’s own bookkeeping or actions', () => {
    expect(Object.keys(settingsSlice(base)).sort()).toEqual(['gyms', 'restSecondsBetweenSets']);
  });

  it('does not change when the backup records itself — the loop this exists to stop', () => {
    const after = {
      ...base,
      autoBackupFile: { uri: 'content://g', day: '2026-10-16' },
      lastBackupAt: '2026-10-16T10:00:00.000Z',
    };
    expect(sliceChanged(settingsSlice(base), settingsSlice(after))).toBe(false);
  });

  it('changes with a real setting', () => {
    const after = { ...base, restSecondsBetweenSets: 120 };
    expect(sliceChanged(settingsSlice(base), settingsSlice(after))).toBe(true);
  });

  it('ignores the retired interval an old blob may still carry', () => {
    expect(SETTINGS_NOT_BACKED_UP).toContain('autoBackupIntervalDays');
    const after = { ...base, autoBackupIntervalDays: 7 };
    expect(sliceChanged(settingsSlice(base), settingsSlice(after))).toBe(false);
  });
});

describe('which stores each app watches', () => {
  it('settings and the assistant everywhere, plus the app’s own log', () => {
    expect(watchedStores('tasks')).toEqual(['settings', 'tasks', 'ai']);
    expect(watchedStores('expenses')).toEqual(['settings', 'money', 'ai']);
  });

  it('Workout watches its legacy tasks and money too, since its file may carry them', () => {
    expect(watchedStores('workout')).toEqual([
      'settings',
      'library',
      'workoutHistory',
      'debriefs',
      'tasks',
      'money',
      'ai',
    ]);
  });
});
