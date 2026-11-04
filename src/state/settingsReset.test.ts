import { afterEach, describe, expect, it } from 'vitest';

import { APP_VARIANTS } from '../lib/appVariant';
import {
  DEFAULT_SETTINGS,
  SECTION_SETTING_KEYS,
  sectionSettingsKept,
  useSettings,
} from './settingsStore';

/**
 * `Reset every setting` in a split app (3.0.0): that app's settings and the
 * shared ones go back; another section's — hidden in this app, still on disk,
 * still carried by its backup — stay exactly as they were.
 */

afterEach(() => {
  useSettings.getState().importSettings(DEFAULT_SETTINGS);
});

function customise() {
  const s = useSettings.getState();
  s.setCurrencyCode('EUR');
  s.setTasksTrendRange('year');
  s.setNumber('restSecondsBetweenSets', 60);
  s.setTheme('custom');
}

describe('which settings a reset keeps', () => {
  it('keeps every section the app does not show', () => {
    expect(sectionSettingsKept('workout')).toEqual([
      ...SECTION_SETTING_KEYS.Tasks,
      ...SECTION_SETTING_KEYS.Expenses,
    ]);
    expect(sectionSettingsKept('tasks')).toEqual([
      ...SECTION_SETTING_KEYS.Workout,
      ...SECTION_SETTING_KEYS.Expenses,
    ]);
    expect(sectionSettingsKept('expenses')).not.toContain('currencyCode');
  });

  it('lists only real settings, each under one section', () => {
    const all = Object.values(SECTION_SETTING_KEYS).flat();
    expect(new Set(all).size).toBe(all.length);
    for (const key of all) expect(Object.keys(DEFAULT_SETTINGS)).toContain(key);
  });

  it('never keeps a shared setting', () => {
    for (const variant of APP_VARIANTS) {
      expect(sectionSettingsKept(variant)).not.toContain('themeId');
      expect(sectionSettingsKept(variant)).not.toContain('autoBackupEnabled');
    }
  });
});

describe('the reset, pressed in each app', () => {
  it('in the Workout app, leaves the hidden currency and task range alone', () => {
    customise();
    useSettings.getState().resetToDefaults('workout');
    const s = useSettings.getState();
    expect(s.restSecondsBetweenSets).toBe(DEFAULT_SETTINGS.restSecondsBetweenSets);
    expect(s.currencyCode).toBe('EUR');
    expect(s.tasksTrendRange).toBe('year');
  });

  it('in the Expenses app, resets the currency and keeps the training', () => {
    customise();
    useSettings.getState().resetToDefaults('expenses');
    const s = useSettings.getState();
    expect(s.currencyCode).toBe(DEFAULT_SETTINGS.currencyCode);
    expect(s.restSecondsBetweenSets).toBe(60);
    expect(s.tasksTrendRange).toBe('year');
  });

  it('without a variant, is the whole clean slate the tests rely on', () => {
    customise();
    useSettings.getState().resetToDefaults();
    const s = useSettings.getState();
    expect(s.currencyCode).toBe(DEFAULT_SETTINGS.currencyCode);
    expect(s.restSecondsBetweenSets).toBe(DEFAULT_SETTINGS.restSecondsBetweenSets);
    expect(s.tasksTrendRange).toBe(DEFAULT_SETTINGS.tasksTrendRange);
  });
});
