import { describe, expect, it } from 'vitest';

import { suggestedPrompts, suggestionNote, systemPrompt } from './aiPrompts';

/**
 * What the assistant is told and what the user is offered. The system prompt's
 * one moving part is the language, and the suggestions' is that they are named
 * from the user's own log — never a lift they do not train.
 */

describe('the system prompt', () => {
  it('asks for the app’s own language', () => {
    expect(systemPrompt('Tasks', 'ru')).toContain('Write every string in Russian.');
    expect(systemPrompt('Tasks', 'en')).toContain('Write every string in English.');
  });

  it('adds each section’s own rules, and only proposals in Workout', () => {
    expect(systemPrompt('Workout', 'en')).toContain('routine_proposal');
    expect(systemPrompt('Tasks', 'en')).not.toContain('routine_proposal');
    expect(systemPrompt('Tasks', 'en')).toContain('"excused"');
    expect(systemPrompt('Expenses', 'en')).toContain('Whole-month amounts');
  });
});

describe('the suggested prompts', () => {
  const september = new Date(2026, 8, 27);

  it('name the user’s own lift and routine', () => {
    const labels = suggestedPrompts(
      'Workout',
      { topLift: 'Bench press', lastRoutine: 'Push' },
      'en',
      september,
    ).map((p) => p.label);
    expect(labels).toEqual([
      'Summarize my last 4 weeks',
      'How is my Bench press going?',
      'Suggest a new routine',
      'Improve my Push routine',
    ]);
  });

  it('leave out a question about a lift nobody trains', () => {
    const keys = suggestedPrompts('Workout', {}, 'en', september).map((p) => p.key);
    expect(keys).toEqual(['w-sum', 'w-new']);
  });

  it('name the months, in the sentence’s own case', () => {
    expect(suggestedPrompts('Tasks', {}, 'en', september)[0].label).toBe('How did September go?');
    expect(suggestedPrompts('Expenses', {}, 'en', september)[1].label).toBe('Where did August go?');
    expect(suggestedPrompts('Expenses', {}, 'ru', september)[1].label).toContain('август');
    // January's "last month" is December.
    expect(suggestedPrompts('Expenses', {}, 'en', new Date(2026, 0, 5))[1].label).toBe(
      'Where did December go?',
    );
  });
});

describe('the note on earlier suggestions', () => {
  it('is empty when the chat made none', () => {
    expect(suggestionNote([])).toBe('');
  });

  it('says which were applied, oldest first', () => {
    const note = suggestionNote([
      { what: 'routine', name: 'Push', status: 'pending' },
      { what: 'routine', name: 'Push', status: 'accepted' },
      { what: 'loop', name: '', status: 'discarded' },
    ]);
    expect(note).toContain('1. routine "Push": NOT applied');
    expect(note).toContain('2. routine "Push": APPLIED');
    expect(note).toContain('3. loop: DISCARDED');
    expect(note.startsWith('[App note')).toBe(true);
  });
});

describe('the workout prompt', () => {
  it('asks for removals to be listed, and for edits to carry what is not saved yet', () => {
    const prompt = systemPrompt('Workout', 'en');
    expect(prompt).toContain('change = "removed". Never just leave it out');
    expect(prompt).toContain('EDITS ARE CUMULATIVE');
    expect(prompt).toContain('CHECK THE PROPOSAL');
  });
});
