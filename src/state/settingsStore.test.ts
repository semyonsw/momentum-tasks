import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_SETTINGS,
  aiCardDismissed,
  currentSettings,
  sanitizeSettings,
  useSettings,
  type Settings,
} from './settingsStore';

afterEach(() => {
  /*
   * `importSettings`, not `resetToDefaults`. The reset button deliberately KEEPS
   * the language, the look and the granted backup folder, so it is the wrong tool
   * for isolating tests from each other. This replaces every key.
   */
  useSettings.getState().importSettings(DEFAULT_SETTINGS);
});

describe('sanitizeSettings', () => {
  it('returns a complete object from nothing at all', () => {
    expect(sanitizeSettings(undefined)).toEqual(sanitizeSettings(DEFAULT_SETTINGS));
    expect(sanitizeSettings(null)).toEqual(sanitizeSettings({}));
  });

  it('repairs a corrupt blob rather than passing it through', () => {
    const clean = sanitizeSettings({
      tasksTrendRange: 'decade',
      autoBackupEnabled: 'yes',
      lastBackupAt: 'not a date',
      autoBackupFolderUri: '   ',
      autoBackupFile: { uri: 3 },
    } as unknown as Partial<Settings>);
    expect(clean.tasksTrendRange).toBe('month');
    // Only an explicit false is off.
    expect(clean.autoBackupEnabled).toBe(true);
    expect(clean.lastBackupAt).toBeUndefined();
    expect(clean.autoBackupFolderUri).toBeUndefined();
    expect(clean.autoBackupFile).toBeUndefined();
    expect(sanitizeSettings({ autoBackupEnabled: false }).autoBackupEnabled).toBe(false);
  });

  it('keeps a range this build knows', () => {
    expect(sanitizeSettings({ tasksTrendRange: 'year' }).tasksTrendRange).toBe('year');
  });
});

/*
 * MOMENTUM'S BLOB. The `settings` key on a phone that ran Momentum 3.0.0's Tasks
 * app — and the settings in any Momentum backup — carry the training's and the
 * money's settings beside these. They are read past and dropped; what this app
 * keeps comes through unchanged.
 */
describe('a settings blob written by Momentum', () => {
  const momentum = {
    ...DEFAULT_SETTINGS,
    language: 'en',
    languageChosen: true,
    themeId: 'custom',
    tasksTrendRange: 'quarter',
    aiCardsDismissed: ['Workout', 'Tasks'],
    engagement: true,
    autoBackupFolderUri: 'content://tree/primary%3ADownload',
    restSecondsBetweenSets: 90,
    gyms: [{ id: 'g', name: 'Gym', platesKg: [20] }],
    currencyCode: 'USD',
    shareToHealthConnect: true,
    autoTickTasks: false,
    autoBackupIntervalDays: 7,
  } as unknown as Partial<Settings>;

  it('keeps every field this app has, under the same name', () => {
    const clean = sanitizeSettings(momentum);
    expect(clean).toMatchObject({
      language: 'en',
      languageChosen: true,
      themeId: 'custom',
      tasksTrendRange: 'quarter',
      aiCardsDismissed: ['Tasks'],
      engagement: true,
      autoBackupFolderUri: 'content://tree/primary%3ADownload',
    });
  });

  it('drops the other apps’ settings and the retired ones', () => {
    const clean = sanitizeSettings(momentum) as unknown as Record<string, unknown>;
    for (const key of [
      'restSecondsBetweenSets',
      'gyms',
      'currencyCode',
      'shareToHealthConnect',
      'autoTickTasks',
      'autoBackupIntervalDays',
    ]) {
      expect(clean, key).not.toHaveProperty(key);
    }
  });

  it('hydrates from it on disk, under the key Momentum used', async () => {
    await AsyncStorage.setItem('settings', JSON.stringify({ state: momentum, version: 1 }));
    await useSettings.persist.rehydrate();
    const state = useSettings.getState() as unknown as Record<string, unknown>;
    expect(state.tasksTrendRange).toBe('quarter');
    expect(state.restSecondsBetweenSets).toBeUndefined();
    expect(useSettings.persist.hasHydrated()).toBe(true);
  });

  it('imports through importSettings without a throw', () => {
    useSettings.getState().importSettings(momentum);
    expect(useSettings.getState().language).toBe('en');
  });
});

describe('the backup stamp', () => {
  const file = { uri: 'content://f/momentum-tasks-backup-2026-09-02.json', day: '2026-09-02' };

  it('records when a backup landed and which file it is in', () => {
    useSettings.getState().recordBackup('2026-09-02T10:00:00.000Z', file);
    expect(useSettings.getState().lastBackupAt).toBe('2026-09-02T10:00:00.000Z');
    expect(useSettings.getState().autoBackupFile).toEqual(file);
  });

  it('keeps the file when a stamp comes without one', () => {
    useSettings.getState().recordBackup('2026-09-02T10:00:00.000Z', file);
    useSettings.getState().recordBackup('2026-09-03T10:00:00.000Z');
    expect(useSettings.getState().autoBackupFile).toEqual(file);
  });

  it('forgets the file when the folder changes, and keeps it when the same one is re-granted', () => {
    useSettings.getState().setAutoBackupFolder('content://tree/here');
    useSettings.getState().recordBackup('2026-09-02T10:00:00.000Z', file);
    // Access was lost and the user picked the same folder: overwrite, not a twin.
    useSettings.getState().setAutoBackupFolder('content://tree/here');
    expect(useSettings.getState().autoBackupFile).toEqual(file);
    // A different folder: that URI is a file somewhere else now.
    useSettings.getState().setAutoBackupFolder('content://tree/elsewhere');
    expect(useSettings.getState().autoBackupFile).toBeUndefined();
  });

  it('refuses an unparseable stamp rather than storing NaN', () => {
    useSettings.getState().recordBackup('not a date');
    expect(Number.isFinite(Date.parse(useSettings.getState().lastBackupAt ?? ''))).toBe(true);
  });

  it('survives Reset, like the folder', () => {
    useSettings.getState().setAutoBackupFolder('content://tree/here');
    useSettings.getState().recordBackup('2026-09-02T10:00:00.000Z', file);
    useSettings.getState().resetToDefaults();
    expect(useSettings.getState().autoBackupFolderUri).toBe('content://tree/here');
    expect(useSettings.getState().autoBackupFile).toEqual(file);
  });
});

describe('the reset', () => {
  it('puts the switches and defaults back', () => {
    useSettings.getState().setTasksTrendRange('year');
    useSettings.getState().setAutoBackupEnabled(false);
    useSettings.getState().resetToDefaults();
    expect(useSettings.getState().tasksTrendRange).toBe('month');
    expect(useSettings.getState().autoBackupEnabled).toBe(true);
  });

  it('keeps the look — appearance is not what "every switch and default" means', () => {
    useSettings.getState().setCustomColor(0, '#FF0000');
    useSettings.getState().resetToDefaults();
    expect(useSettings.getState().themeId).toBe('custom');
  });
});

describe('the language', () => {
  it('ships in Russian and falls back to it for anything unreadable', () => {
    expect(DEFAULT_SETTINGS.language).toBe('ru');
    expect(sanitizeSettings({ language: 'en' }).language).toBe('en');
    expect(sanitizeSettings({ language: 'fr' } as unknown as Partial<Settings>).language).toBe(
      'ru',
    );
    expect(sanitizeSettings({}).language).toBe('ru');
  });

  /*
   * `languageChosen` is what stops the first-launch picker asking twice, and it
   * has to be false for somebody upgrading from a build that never asked — they
   * were not asked either, so the question is still open for them.
   */
  it('treats an unanswered language as unanswered, however it arrives', () => {
    expect(DEFAULT_SETTINGS.languageChosen).toBe(false);
    expect(sanitizeSettings({}).languageChosen).toBe(false);
    expect(sanitizeSettings({ language: 'ru' }).languageChosen).toBe(false);
    expect(sanitizeSettings({ languageChosen: true }).languageChosen).toBe(true);
  });

  it('counts any write of the language as the answer, the default included', () => {
    useSettings.setState({ language: 'ru', languageChosen: false });
    useSettings.getState().setLanguage('ru');
    expect(useSettings.getState().languageChosen).toBe(true);
    useSettings.getState().setLanguage('en');
    expect(useSettings.getState()).toMatchObject({ language: 'en', languageChosen: true });
  });

  /*
   * A reset that defaulted these would flip the app to Russian under somebody
   * who pressed an English button, and then drop them onto the first-launch
   * picker mid-session.
   */
  it('keeps the language, and the answer, across a reset to defaults', () => {
    useSettings.setState({ language: 'en', languageChosen: true, tasksTrendRange: 'week' });
    useSettings.getState().resetToDefaults();
    expect(useSettings.getState()).toMatchObject({ language: 'en', languageChosen: true });
    expect(useSettings.getState().tasksTrendRange).toBe('month');
  });
});

describe('the assistant card that was closed (U2)', () => {
  it('is absent by default and on a blob that never closed it', () => {
    expect(DEFAULT_SETTINGS.aiCardsDismissed).toBeUndefined();
    expect(sanitizeSettings({}).aiCardsDismissed).toBeUndefined();
    expect(
      sanitizeSettings({ aiCardsDismissed: ['Workout'] } as unknown as Partial<Settings>)
        .aiCardsDismissed,
    ).toBeUndefined();
    expect(aiCardDismissed(sanitizeSettings({}))).toBe(false);
  });

  it('is written the way Momentum wrote it, and a second ✕ changes nothing', () => {
    useSettings.getState().dismissAiCard();
    useSettings.getState().dismissAiCard();
    expect(currentSettings().aiCardsDismissed).toEqual(['Tasks']);
    expect(aiCardDismissed(currentSettings())).toBe(true);
  });

  it('survives Reset settings to defaults — a closed card is not a switch', () => {
    useSettings.getState().dismissAiCard();
    useSettings.getState().resetToDefaults();
    expect(aiCardDismissed(currentSettings())).toBe(true);
  });
});

describe('the engagement switch', () => {
  it('is off by default and on a blob with no such key', () => {
    expect(DEFAULT_SETTINGS.engagement).toBeUndefined();
    expect(sanitizeSettings({}).engagement).toBeUndefined();
    expect(sanitizeSettings(undefined).engagement).toBeUndefined();
  });

  it('only a literal true is on; junk and a stored false read as off', () => {
    expect(sanitizeSettings({ engagement: true }).engagement).toBe(true);
    for (const junk of [false, 'true', 1, null, {}]) {
      expect(
        sanitizeSettings({ engagement: junk } as unknown as Partial<Settings>).engagement,
      ).toBeUndefined();
    }
  });

  it('switching it off writes no key at all', () => {
    useSettings.getState().setEngagement(true);
    expect(currentSettings().engagement).toBe(true);
    useSettings.getState().setEngagement(false);
    expect(currentSettings().engagement).toBeUndefined();
    expect('engagement' in JSON.parse(JSON.stringify(currentSettings()))).toBe(false);
  });

  it('Reset every setting turns it off — it is a switch, and nothing it shows is stored', () => {
    useSettings.getState().setEngagement(true);
    useSettings.getState().resetToDefaults();
    expect(currentSettings().engagement).toBeUndefined();
  });
});
