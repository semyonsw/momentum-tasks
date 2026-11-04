import { describe, expect, it } from 'vitest';

import { APP_VARIANTS } from './appVariant';
import { translatedKeys } from './i18n';
import {
  autoTickOffered,
  backupHoldsNote,
  csvExports,
  launchName,
  replaceNote,
  resetConfirmBody,
  resetNote,
  sectionRowCopy,
  settingsScopeKeys,
} from './settingsScope';

/**
 * Settings in each of the three apps (3.0.0): the app's own section, its own
 * spreadsheet, its own sentences — and nothing that speaks for "all three".
 */

describe('what each app’s Settings offers', () => {
  it('a spreadsheet only for its own log', () => {
    expect(csvExports('workout')).toEqual(['workouts']);
    expect(csvExports('tasks')).toEqual([]);
    expect(csvExports('expenses')).toEqual(['amounts']);
  });

  it('no automatic tick, since no app holds both tasks and what ticks them', () => {
    for (const variant of APP_VARIANTS) expect(autoTickOffered(variant)).toBe(false);
  });

  it('a section row named for its own section', () => {
    expect(sectionRowCopy('workout').kicker).toBe('Workout');
    expect(sectionRowCopy('tasks')).toEqual({
      kicker: 'Tasks',
      hint: 'Vacation pause, history range',
    });
    expect(sectionRowCopy('expenses').kicker).toBe('Finance');
  });

  it('the launch screen named as the launcher names it', () => {
    expect(APP_VARIANTS.map(launchName)).toEqual(['Workout', 'Tasks', 'Expenses']);
  });
});

describe('the sentences', () => {
  it('never speak for three sections', () => {
    for (const variant of APP_VARIANTS) {
      for (const text of [resetNote(variant), resetConfirmBody(variant), replaceNote(variant)])
        expect(text).not.toMatch(/three sections/);
    }
  });

  it('say the Workout backup still carries the old tasks and finance', () => {
    expect(backupHoldsNote('workout')).toMatch(/still carries the daily tasks and finance/);
    expect(backupHoldsNote('tasks')).not.toMatch(/training|finance/);
    expect(backupHoldsNote('expenses')).not.toMatch(/training|daily tasks/);
  });

  it('no longer promise the bodyweight is cleared — the store keeps it', () => {
    for (const variant of APP_VARIANTS)
      expect(resetConfirmBody(variant)).not.toMatch(/bodyweight is cleared/);
  });

  it('are every one of them in Russian', () => {
    const keys = new Set(translatedKeys());
    const missing = APP_VARIANTS.flatMap(settingsScopeKeys).filter((key) => !keys.has(key));
    expect([...new Set(missing)]).toEqual([]);
  });
});
