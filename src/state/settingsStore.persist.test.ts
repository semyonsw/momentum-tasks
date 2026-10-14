import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_GYM_ID } from '../lib/gyms';
import {
  DEFAULT_SETTINGS,
  onSettingsHydrationFailed,
  sanitizeSettings,
  settingsHydrationFailed,
  useSettings,
} from './settingsStore';

/**
 * The settings through a relaunch, run for real against the storage stub.
 *
 * `settingsStore.test.ts` pins `sanitizeSettings` key by key, and `rehydrate.test.ts`
 * reads back the 2.2.0 additions one at a time. What neither does is put a
 * whole changed configuration down and pick it up again, or hand `rehydrate` the
 * blobs a real phone can have on it: one from 1.0.x with a single plate list, one
 * that was cut off half-way through a write, one that is not JSON at all. Each of
 * those is a launch, and a launch that comes up on the wrong rest length — or on
 * a blank screen — is the bug this store's rule 2 exists to prevent.
 *
 * One test below makes the read fail on purpose, and the flag that records it is
 * module state with no reset. It is the LAST test in the file for that reason;
 * vitest gives every file its own module graph, so nothing else ever sees it.
 */

afterEach(async () => {
  vi.restoreAllMocks();
  useSettings.getState().importSettings(DEFAULT_SETTINGS);
  await AsyncStorage.removeItem('settings');
});

async function relaunch() {
  const blob = await AsyncStorage.getItem('settings');
  if (!blob) throw new Error('nothing was written');
  useSettings.getState().importSettings(DEFAULT_SETTINGS);
  await AsyncStorage.setItem('settings', blob);
  await useSettings.persist.rehydrate();
}

const stored = (state: unknown) =>
  AsyncStorage.setItem('settings', JSON.stringify({ version: 1, state }));

describe('a configured phone, relaunched', () => {
  it('reads back every setting it wrote', async () => {
    const s = useSettings.getState();
    s.setNumber('restSecondsBetweenSets', 95);
    s.bumpNumber('prepareSeconds', 3);
    s.setFlag('soundEnabled', false);
    s.setFlag('autoTickTasks', false);
    s.setUnitSystem('imperial');
    s.setLanguage('en');
    s.setTheme('custom');
    s.setWorkoutReminderEnabled(true);
    s.toggleWorkoutReminderDay(6);
    s.setWorkoutReminderTime(7, 5);
    s.setBodyweightKg(81.4);
    s.addGym('Hotel');
    s.setWeeklyTarget('push', 14);
    s.setCurrencyCode('usd');
    s.setMoneyDefaultInterval('month');
    s.setMoneyDefaultDirection('income');
    s.setShareToHealthConnect(true);
    s.recordMeasurement('waist', '2026-10-01', 82);

    const before = sanitizeSettings(useSettings.getState());
    await relaunch();
    expect(sanitizeSettings(useSettings.getState())).toEqual(before);
    // A few spelled out, so a failure says which one went missing.
    expect(useSettings.getState()).toMatchObject({
      restSecondsBetweenSets: 95,
      prepareSeconds: 8,
      soundEnabled: false,
      autoTickTasks: false,
      unitSystem: 'imperial',
      language: 'en',
      languageChosen: true,
      workoutReminderEnabled: true,
      workoutReminderDays: [0, 2, 4, 6],
      workoutReminderTime: '07:05',
      bodyweightKg: 81.4,
      currencyCode: 'USD',
      shareToHealthConnect: true,
      weeklySetTargets: { push: 14 },
    });
    expect(useSettings.getState().gyms).toHaveLength(2);
  });

  it('keeps the actions working after a relaunch — they are never read from disk', async () => {
    useSettings.getState().setNumber('beepSeconds', 3);
    await relaunch();
    useSettings.getState().bumpNumber('beepSeconds', 1);
    expect(useSettings.getState().beepSeconds).toBe(4);
  });

  it('an unset bodyweight comes back unset, not as zero', async () => {
    useSettings.getState().setBodyweightKg(80);
    useSettings.getState().setBodyweightKg(undefined);
    await relaunch();
    expect(useSettings.getState().bodyweightKg).toBeUndefined();
    // …and the weigh-in it had is still in the log.
    expect(useSettings.getState().bodyweightLog.map((entry) => entry.kg)).toEqual([80]);
  });
});

describe('older and damaged blobs', () => {
  it('a 1.0.x blob with one plate list becomes one gym, and nothing else is lost', async () => {
    await stored({ restSecondsBetweenSets: 60, availablePlatesKg: [20, 10, 5, 5, 'x', -1] });
    await useSettings.persist.rehydrate();
    const { gyms, activeGymId, restSecondsBetweenSets } = useSettings.getState();
    expect(restSecondsBetweenSets).toBe(60);
    expect(gyms).toHaveLength(1);
    expect(gyms[0].platesKg).toEqual([20, 10, 5]);
    expect(activeGymId).toBe(DEFAULT_GYM_ID);
  });

  it('a blob from before the bodyweight log seeds the log from the scalar', async () => {
    await stored({ bodyweightKg: 77 });
    await useSettings.persist.rehydrate();
    expect(useSettings.getState().bodyweightKg).toBe(77);
    expect(useSettings.getState().bodyweightLog.map((entry) => entry.kg)).toEqual([77]);
  });

  it('a half-written blob fills every missing key from the defaults', async () => {
    await stored({ soundEnabled: false });
    await useSettings.persist.rehydrate();
    const state = sanitizeSettings(useSettings.getState());
    expect(state).toEqual({ ...sanitizeSettings(DEFAULT_SETTINGS), soundEnabled: false });
  });

  it('junk in every numeric key comes up on the defaults, never NaN', async () => {
    await stored({
      restSecondsBetweenSets: 'abc',
      restSecondsBetweenExercises: null,
      prepareSeconds: {},
      beepSeconds: [],
      adjustStepSeconds: true,
    });
    await useSettings.persist.rehydrate();
    const s = useSettings.getState();
    expect([
      s.restSecondsBetweenSets,
      s.restSecondsBetweenExercises,
      s.prepareSeconds,
      s.beepSeconds,
      s.adjustStepSeconds,
    ]).toEqual([
      DEFAULT_SETTINGS.restSecondsBetweenSets,
      DEFAULT_SETTINGS.restSecondsBetweenExercises,
      DEFAULT_SETTINGS.prepareSeconds,
      DEFAULT_SETTINGS.beepSeconds,
      DEFAULT_SETTINGS.adjustStepSeconds,
    ]);
  });

  it('an active gym that points at nothing resolves to one that exists', async () => {
    await stored({
      gyms: [{ id: 'g1', name: 'Home', platesKg: [10] }],
      activeGymId: 'deleted',
    });
    await useSettings.persist.rehydrate();
    expect(useSettings.getState().activeGymId).toBe('g1');
  });

  it('a state that is not an object comes up on the defaults', async () => {
    await stored('nonsense');
    await useSettings.persist.rehydrate();
    expect(sanitizeSettings(useSettings.getState())).toEqual(sanitizeSettings(DEFAULT_SETTINGS));
  });
});

describe('the reminder cannot be left armed with no days', () => {
  it('taking the last day away switches it off, and switching it on again brings days back', () => {
    const s = useSettings.getState();
    s.setWorkoutReminderEnabled(true);
    for (const day of [0, 2, 4] as const) s.toggleWorkoutReminderDay(day);
    expect(useSettings.getState()).toMatchObject({
      workoutReminderEnabled: false,
      workoutReminderDays: [],
    });
    s.setWorkoutReminderEnabled(true);
    expect(useSettings.getState().workoutReminderDays).toEqual(
      DEFAULT_SETTINGS.workoutReminderDays,
    );
  });
});

describe('a read that fails', () => {
  it('is reported, the defaults stand, and the listener hears it once', async () => {
    const heard = vi.fn();
    const off = onSettingsHydrationFailed(heard);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    useSettings.getState().importSettings(DEFAULT_SETTINGS);
    expect(settingsHydrationFailed()).toBe(false);

    await AsyncStorage.setItem('settings', '{"version":1,"state":{"restSec');
    await useSettings.persist.rehydrate();

    expect(settingsHydrationFailed()).toBe(true);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(useSettings.getState().restSecondsBetweenSets).toBe(
      DEFAULT_SETTINGS.restSecondsBetweenSets,
    );
    off();
  });
});
