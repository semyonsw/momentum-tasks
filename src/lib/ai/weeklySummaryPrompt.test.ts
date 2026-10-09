import { describe, expect, it } from 'vitest';

import type { WeeklyReview } from '../weeklyReview';
import { summaryText, weeklySummaryOffered, weeklySummaryPrompt } from './weeklySummaryPrompt';

/**
 * The coach's weekly summary reads the card it sits in: every figure X3 shows
 * must reach the model, a log the card leaves out must not, and the language
 * and tone travel in the instructions.
 */

const full: WeeklyReview = {
  week: { from: '2026-09-28', to: '2026-10-04' },
  workouts: { count: 3, previous: 2 },
  tasks: { percent: 84, previous: 88, slipped: { name: 'Steps', count: 2 } },
  spent: { total: 52300, top: { name: 'Food', share: 0.48 } },
};
const money = { currency: 'AMD', scale: 0 };

describe('the prompt', () => {
  it('carries every X3 figure: counts, percentages, spent and the category', () => {
    const { context } = weeklySummaryPrompt(full, money, 'en');
    const data = JSON.parse(context);
    expect(data.week).toMatchObject({ from: '2026-09-28', to: '2026-10-04' });
    expect(data.workouts).toMatchObject({ count: 3, weekBefore: 2 });
    expect(data.tasks).toMatchObject({
      percentDone: 84,
      weekBeforePercent: 88,
      mostOftenUnanswered: { task: 'Steps', days: 2 },
    });
    expect(data.spent).toMatchObject({
      total: '52,300',
      currency: 'AMD',
      topCategory: { name: 'Food', percentOfTotal: 48 },
    });
  });

  it('carries the sentences the card prints under each figure', () => {
    const data = JSON.parse(weeklySummaryPrompt(full, money, 'en').context);
    expect(data.workouts.shown).toBe('One more than the week before.');
    expect(data.tasks.shown).toBe('Down 4 points. Steps slipped twice.');
    expect(data.spent.shown).toBe('AMD. Food was 48% of it.');
  });

  it('formats money in the log’s own scale', () => {
    const data = JSON.parse(
      weeklySummaryPrompt(
        { ...full, spent: { total: 12345, top: null } },
        { currency: 'USD', scale: 2 },
        'en',
      ).context,
    );
    expect(data.spent.total).toBe('123.45');
    expect(data.spent.topCategory).toBeNull();
  });

  it('leaves out a log the card has no column for', () => {
    const data = JSON.parse(
      weeklySummaryPrompt({ ...full, workouts: null, spent: null }, money, 'en').context,
    );
    expect(data).not.toHaveProperty('workouts');
    expect(data).not.toHaveProperty('spent');
    expect(data.tasks.percentDone).toBe(84);
  });

  it('keeps null for a week before that did not exist, rather than a zero', () => {
    const data = JSON.parse(
      weeklySummaryPrompt({ ...full, workouts: { count: 2, previous: null } }, money, 'en').context,
    );
    expect(data.workouts.weekBefore).toBeNull();
  });

  it('asks for an honest tone with no guilt and no exclamation marks', () => {
    const { systemPrompt } = weeklySummaryPrompt(full, money, 'en');
    expect(systemPrompt).toContain('No guilt');
    expect(systemPrompt).toContain('no exclamation marks');
    expect(systemPrompt).toContain('Never invent numbers');
  });

  it('follows the app language', () => {
    const ru = weeklySummaryPrompt(full, money, 'ru');
    const en = weeklySummaryPrompt(full, money, 'en');
    expect(ru.systemPrompt).toContain('Write every string in Russian.');
    expect(en.systemPrompt).toContain('Write every string in English.');
    expect(ru.question).not.toBe(en.question);
    // The card's sentences travel in the language the card shows them in.
    expect(JSON.parse(ru.context).workouts.shown).not.toBe(JSON.parse(en.context).workouts.shown);
  });
});

describe('when the button is offered', () => {
  it('needs the engagement switch AND a tested key', () => {
    expect(weeklySummaryOffered({ engagement: true, aiStatus: 'ready' })).toBe(true);
    expect(weeklySummaryOffered({ engagement: false, aiStatus: 'ready' })).toBe(false);
    for (const aiStatus of ['off', 'testing', 'error'] as const) {
      expect(weeklySummaryOffered({ engagement: true, aiStatus })).toBe(false);
    }
  });
});

describe('the reply', () => {
  it('joins the text blocks', () => {
    expect(
      summaryText([
        { type: 'text', text: ' Three sessions. ' },
        { type: 'text', text: 'Tasks held.' },
      ]),
    ).toBe('Three sessions. Tasks held.');
  });

  it('reads a summary block’s notes rather than calling it unreadable', () => {
    expect(summaryText([{ type: 'summary', title: 'Week', notes: ['Food led.'] }])).toBe(
      'Food led.',
    );
  });

  it('is empty when nothing in it is text', () => {
    expect(
      summaryText([{ type: 'summary', title: 'Week', stats: [{ label: 'a', value: '1' }] }]),
    ).toBe('');
  });
});
