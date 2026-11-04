import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
 * `settingsStore.test.ts` pins `sanitizeSettings` key by key. What it does not
 * do is put a whole changed configuration down and pick it up again, or hand
 * `rehydrate` the blobs a real phone can have on it: one that was cut off
 * half-way through a write, one that is not JSON at all. Each of those is a
 * launch, and a launch that comes up on a blank screen is the bug this store's
 * rule 2 exists to prevent.
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
    s.setLanguage('en');
    s.setTheme('custom');
    s.setTasksTrendRange('year');
    s.setAutoBackupEnabled(false);
    s.setAutoBackupFolder('content://tree/here');
    s.dismissAiCard();
    s.setEngagement(true);

    const before = sanitizeSettings(useSettings.getState());
    await relaunch();
    expect(sanitizeSettings(useSettings.getState())).toEqual(before);
    // Spelled out, so a failure says which one went missing.
    expect(useSettings.getState()).toMatchObject({
      language: 'en',
      languageChosen: true,
      themeId: 'custom',
      tasksTrendRange: 'year',
      autoBackupEnabled: false,
      autoBackupFolderUri: 'content://tree/here',
      aiCardsDismissed: ['Tasks'],
      engagement: true,
    });
  });

  it('keeps the actions working after a relaunch — they are never read from disk', async () => {
    useSettings.getState().setTasksTrendRange('week');
    await relaunch();
    useSettings.getState().setTasksTrendRange('all');
    expect(useSettings.getState().tasksTrendRange).toBe('all');
  });
});

describe('older and damaged blobs', () => {
  it('a half-written blob fills every missing key from the defaults', async () => {
    await stored({ tasksTrendRange: 'week' });
    await useSettings.persist.rehydrate();
    const state = sanitizeSettings(useSettings.getState());
    expect(state).toEqual({ ...sanitizeSettings(DEFAULT_SETTINGS), tasksTrendRange: 'week' });
  });

  it('a state that is not an object comes up on the defaults', async () => {
    await stored('nonsense');
    await useSettings.persist.rehydrate();
    expect(sanitizeSettings(useSettings.getState())).toEqual(sanitizeSettings(DEFAULT_SETTINGS));
  });
});

describe('a read that fails', () => {
  it('is reported, the defaults stand, and the listener hears it once', async () => {
    const heard = vi.fn();
    const off = onSettingsHydrationFailed(heard);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    useSettings.getState().importSettings(DEFAULT_SETTINGS);
    expect(settingsHydrationFailed()).toBe(false);

    await AsyncStorage.setItem('settings', '{"version":1,"state":{"tasksTr');
    await useSettings.persist.rehydrate();

    expect(settingsHydrationFailed()).toBe(true);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(useSettings.getState().tasksTrendRange).toBe(DEFAULT_SETTINGS.tasksTrendRange);
    off();
  });
});
