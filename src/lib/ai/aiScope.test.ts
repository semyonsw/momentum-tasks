import { describe, expect, it } from 'vitest';

import { APP_VARIANTS } from '../appVariant';
import { changeSection } from './aiChanges';
import { systemPrompt } from './aiPrompts';
import { translatedKeys } from '../i18n';
import {
  aiReadsNote,
  aiSection,
  aiSections,
  aiServes,
  briefedSections,
  sectionVariant,
} from './aiScope';
import { AI_SECTIONS } from './aiSchema';

/**
 * Since 3.0.0 each app's assistant is that app's log's assistant and nothing
 * else (`aiScope.ts`). Walked for all three apps by parameter, not by env var.
 */

describe('which section each app’s assistant serves', () => {
  it('is the app’s own section, and only that one', () => {
    expect(aiSections('workout')).toEqual(['Workout']);
    expect(aiSections('tasks')).toEqual(['Tasks']);
    expect(aiSections('expenses')).toEqual(['Expenses']);
  });

  it('serves exactly one section in every app', () => {
    for (const variant of APP_VARIANTS) {
      const served = AI_SECTIONS.filter((section) => aiServes(variant, section));
      expect(served).toEqual([aiSection(variant)]);
    }
  });

  it('maps each section back to the app it lives in', () => {
    for (const variant of APP_VARIANTS) expect(sectionVariant(aiSection(variant))).toBe(variant);
  });

  it('briefs no other section, even in the Workout app that still holds them', () => {
    for (const variant of APP_VARIANTS) {
      for (const section of AI_SECTIONS) expect(briefedSections(variant, section)).toEqual([]);
    }
  });
});

describe('what each app’s assistant may change', () => {
  const targets = [
    'exercise',
    'setting',
    'bodyweight',
    'workout_set',
    'task',
    'budget',
    'amount',
  ] as const;

  it('writes only into its own log', () => {
    const allowed = (variant: (typeof APP_VARIANTS)[number]) =>
      targets.filter((target) => aiServes(variant, changeSection(target)));
    expect(allowed('workout')).toEqual(['exercise', 'setting', 'bodyweight', 'workout_set']);
    expect(allowed('tasks')).toEqual(['task']);
    expect(allowed('expenses')).toEqual(['budget', 'amount']);
  });
});

describe('the system prompt, per app', () => {
  it('names the one log and drops the other-sections brief', () => {
    const tasks = systemPrompt('Tasks', 'en');
    expect(tasks).toContain("This app is ONE log: the user's daily tasks and habits.");
    expect(tasks).toContain('inside Tasks, a daily tasks and habits tracker');
    for (const section of AI_SECTIONS) {
      const prompt = systemPrompt(section, 'en');
      expect(prompt).not.toContain('otherSections');
      expect(prompt).not.toContain('{LOG}');
      expect(prompt).not.toContain('{APP}');
    }
  });
});

describe('what AI settings says it reads', () => {
  it('names this app’s log, in Russian too', () => {
    expect(aiReadsNote('workout')).toMatch(/^Only your training/);
    expect(aiReadsNote('tasks')).toMatch(/^Only your daily tasks/);
    expect(aiReadsNote('expenses')).toMatch(/^Only your amounts/);
    const keys = new Set(translatedKeys());
    for (const variant of APP_VARIANTS) expect(keys.has(aiReadsNote(variant))).toBe(true);
  });
});
