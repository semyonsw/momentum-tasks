import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it } from 'vitest';

import { seedTasks, useTasks } from './tasksStore';

/**
 * REHYDRATION, run for real against the storage stub — the ways a launch could
 * come up with less than it should have.
 *
 * zustand's `persist` calls `merge` on a FIRST launch too, with `undefined`, so
 * "nothing stored, the seeds stand" has to be made true rather than assumed —
 * a fresh install once opened on no tasks. And the blobs Momentum left under
 * these keys have to come back whole.
 */

beforeEach(async () => {
  useTasks.setState({ tasks: seedTasks('2026-01-01'), log: {} });
  // AFTER the reset: a `setState` on a persisted store writes it straight back
  // to storage, and "nothing stored" is the case under test.
  await AsyncStorage.clear();
});

describe('a first launch', () => {
  it('keeps the seed tasks when nothing is stored', async () => {
    await useTasks.persist.rehydrate();
    expect(useTasks.getState().tasks.length).toBeGreaterThan(0);
  });
});

describe('settings written by Momentum', () => {
  it('cold-start with the assistant card showing, and the language kept', async () => {
    const { useSettings, DEFAULT_SETTINGS } = await import('./settingsStore');
    useSettings.getState().importSettings(DEFAULT_SETTINGS);
    await AsyncStorage.setItem(
      'settings',
      JSON.stringify({ version: 1, state: { restSecondsBetweenSets: 95, language: 'en' } }),
    );

    await useSettings.persist.rehydrate();

    expect(useSettings.getState().language).toBe('en');
    expect(useSettings.getState().aiCardsDismissed).toBeUndefined();
  });

  it('read a closed card back after a restart', async () => {
    const { useSettings, DEFAULT_SETTINGS } = await import('./settingsStore');
    useSettings.getState().importSettings(DEFAULT_SETTINGS);
    await AsyncStorage.setItem(
      'settings',
      JSON.stringify({ version: 1, state: { aiCardsDismissed: ['Workout', 'Tasks'] } }),
    );

    await useSettings.persist.rehydrate();

    expect(useSettings.getState().aiCardsDismissed).toEqual(['Tasks']);
  });
});

describe('the engagement switch on a cold start', () => {
  it('a blob without it comes up off; a stored true comes up on', async () => {
    const { useSettings, DEFAULT_SETTINGS } = await import('./settingsStore');
    useSettings.getState().importSettings(DEFAULT_SETTINGS);
    await AsyncStorage.setItem(
      'settings',
      JSON.stringify({ version: 1, state: { language: 'en' } }),
    );
    await useSettings.persist.rehydrate();
    expect(useSettings.getState().engagement).toBeUndefined();

    await AsyncStorage.setItem(
      'settings',
      JSON.stringify({ version: 1, state: { engagement: true } }),
    );
    await useSettings.persist.rehydrate();
    expect(useSettings.getState().engagement).toBe(true);
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
