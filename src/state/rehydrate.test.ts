import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it } from 'vitest';

import { seedCategories, useMoney } from './moneyStore';
import { seedTasks, useTasks } from './tasksStore';

/**
 * REHYDRATION, run for real against the storage stub — the two ways a launch
 * could come up with less than it should have.
 *
 * Both were comments that said the right thing about a library that does not
 * behave that way. zustand's `persist` calls `merge` on a FIRST launch too, with
 * `undefined`, so "nothing stored, the seeds stand" was false and a fresh
 * install opened on no categories and no tasks. And a version bump without a
 * `migrate` does not reach `merge` with the old blob at all: the money log a
 * v1 phone had on disk was replaced by an empty one on the next write.
 */

beforeEach(async () => {
  useMoney.setState({ categories: seedCategories.map((c) => ({ ...c })), amounts: [] });
  useTasks.setState({ tasks: seedTasks('2026-01-01'), log: {} });
  // AFTER the resets: a `setState` on a persisted store writes it straight back
  // to storage, and "nothing stored" is the case under test.
  await AsyncStorage.clear();
});

describe('a first launch', () => {
  it('keeps the seed categories when nothing is stored', async () => {
    await useMoney.persist.rehydrate();
    expect(useMoney.getState().categories).toHaveLength(seedCategories.length);
  });

  it('keeps the seed tasks when nothing is stored', async () => {
    await useTasks.persist.rehydrate();
    expect(useTasks.getState().tasks.length).toBeGreaterThan(0);
  });
});

describe('a money log written by version 1', () => {
  it('survives the bump to subsections', async () => {
    const category = seedCategories[0];
    await AsyncStorage.setItem(
      'money',
      JSON.stringify({
        version: 1,
        state: {
          categories: [category],
          amounts: [
            {
              id: 'a1',
              categoryId: category.id,
              direction: 'expense',
              value: 2600,
              when: { kind: 'day', date: '2026-09-01' },
              note: '',
              createdAt: '2026-09-01T10:00:00.000Z',
            },
          ],
        },
      }),
    );

    await useMoney.persist.rehydrate();

    const { amounts, accounts } = useMoney.getState();
    expect(amounts.map((amount) => amount.value)).toEqual([2600]);
    // Filed under the first subsection, which is what `sanitizeMoney` promises.
    expect(amounts[0].accountId).toBe(accounts[0].id);
  });
});

describe('a money log written by 2.2.0, before cents (U25)', () => {
  it('cold-starts with every amount as it was and no scale pinned', async () => {
    const category = seedCategories[0];
    await AsyncStorage.setItem(
      'money',
      JSON.stringify({
        version: 3,
        state: {
          accounts: [{ id: 'cash', name: 'Cash', glyph: '💵', order: 0, opening: 40000 }],
          categories: [category],
          amounts: [
            {
              id: 'a1',
              categoryId: category.id,
              accountId: 'cash',
              direction: 'expense',
              value: 12500,
              when: { kind: 'day', date: '2026-09-01' },
              note: '',
              createdAt: '2026-09-01T10:00:00.000Z',
            },
          ],
        },
      }),
    );

    await useMoney.persist.rehydrate();

    const { amounts, accounts, scale } = useMoney.getState();
    expect(amounts.map((amount) => amount.value)).toEqual([12500]);
    expect(accounts[0].opening).toBe(40000);
    expect(scale).toBeUndefined();
  });

  it('reads a pinned scale back after a restart', async () => {
    await AsyncStorage.setItem(
      'money',
      JSON.stringify({ version: 3, state: { categories: seedCategories, amounts: [], scale: 2 } }),
    );
    await useMoney.persist.rehydrate();
    expect(useMoney.getState().scale).toBe(2);
  });
});

describe('settings written by 2.2.0', () => {
  it('cold-start with every assistant card showing, and nothing else lost', async () => {
    const { useSettings, DEFAULT_SETTINGS } = await import('./settingsStore');
    useSettings.getState().importSettings(DEFAULT_SETTINGS);
    await AsyncStorage.setItem(
      'settings',
      JSON.stringify({ version: 1, state: { restSecondsBetweenSets: 95, language: 'en' } }),
    );

    await useSettings.persist.rehydrate();

    expect(useSettings.getState().restSecondsBetweenSets).toBe(95);
    expect(useSettings.getState().language).toBe('en');
    expect(useSettings.getState().aiCardsDismissed).toBeUndefined();
  });

  it('read a closed card back after a restart', async () => {
    const { useSettings, DEFAULT_SETTINGS } = await import('./settingsStore');
    useSettings.getState().importSettings(DEFAULT_SETTINGS);
    await AsyncStorage.setItem(
      'settings',
      JSON.stringify({ version: 1, state: { aiCardsDismissed: ['Workout'] } }),
    );

    await useSettings.persist.rehydrate();

    expect(useSettings.getState().aiCardsDismissed).toEqual(['Workout']);
  });
});

describe('a task log with missed-on-purpose days, from before the tap toggled', () => {
  it('cold-starts with every mark where it was', async () => {
    const log = {
      t1: {
        '2026-09-10': { mark: 'missed', note: '' },
        '2026-09-11': { mark: 'done', note: '' },
      },
    };
    await AsyncStorage.setItem(
      'tasks',
      JSON.stringify({
        version: 2,
        state: { tasks: [{ id: 't1', name: 'Read', startedOn: '2026-09-01' }], log },
      }),
    );

    await useTasks.persist.rehydrate();

    expect(useTasks.getState().log).toEqual(log);
  });
});
