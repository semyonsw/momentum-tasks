import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The keystore is native, so it is a variable; `fetch` is a queue of answers
 * that also records every call — the property under test is mostly that there
 * WAS no call.
 */
let storedKey: string | null = null;
vi.mock('../lib/ai/secureKey', () => ({
  getKey: async () => storedKey,
  setKey: async () => true,
  clearKey: async () => {
    storedKey = null;
  },
}));

import type { WeeklyReview } from '../lib/weeklyReview';
import { sanitizeAi, useAi } from './aiStore';
import { useSettings } from './settingsStore';
import { askWeeklySummary } from './weeklySummary';

const KEY = 'AIzaSyTESTKEY-1234567890abcdef';
const review: WeeklyReview = {
  week: { from: '2026-09-28', to: '2026-10-04' },
  workouts: { count: 3, previous: 2 },
  tasks: { percent: 84, previous: 88, slipped: null },
  spent: { total: 52300, top: { name: 'Food', share: 0.48 } },
};
const money = { currency: 'AMD', scale: 0 };

let answers: ({ status: number; body: unknown } | 'offline')[] = [];
const calls: { url: string; body?: string }[] = [];

const reply = (text: string) => ({
  status: 200,
  body: {
    candidates: [
      { content: { parts: [{ text: JSON.stringify({ blocks: [{ type: 'text', text }] }) }] } },
    ],
  },
});

beforeEach(() => {
  storedKey = KEY;
  answers = [];
  calls.length = 0;
  useAi.setState({ ...sanitizeAi({}), status: 'ready' });
  useSettings.getState().resetToDefaults();
  useSettings.getState().setLanguage('en');
  vi.stubGlobal('fetch', async (url: string, init: { body?: string }) => {
    calls.push({ url, body: init.body });
    const next = answers.shift();
    if (!next || next === 'offline') throw new TypeError('Network request failed');
    return { status: next.status, text: async () => JSON.stringify(next.body) };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('asking for the weekly summary', () => {
  it('sends the week and returns the paragraph that comes back', async () => {
    answers = [reply('Three sessions, one more than the week before.')];
    const result = await askWeeklySummary({ review, money, engagement: true });
    expect(result).toEqual({
      kind: 'answer',
      text: 'Three sessions, one more than the week before.',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toContain('52,300');
    expect(calls[0].body).toContain('Food');
    expect(calls[0].body).not.toContain(KEY);
    expect(calls[0].url).not.toContain(KEY);
  });

  it('makes no call with the engagement switch off', async () => {
    answers = [reply('x')];
    expect(await askWeeklySummary({ review, money, engagement: false })).toEqual({
      kind: 'refused',
    });
    expect(calls).toHaveLength(0);
  });

  it('makes no call without a tested key', async () => {
    for (const status of ['off', 'testing', 'error'] as const) {
      useAi.setState({ status });
      expect(await askWeeklySummary({ review, money, engagement: true })).toEqual({
        kind: 'refused',
      });
    }
    expect(calls).toHaveLength(0);
  });

  it('makes no call when the keystore has no key, and says why', async () => {
    storedKey = null;
    const result = await askWeeklySummary({ review, money, engagement: true });
    expect(result).toEqual({ kind: 'error', text: 'Connect a Google AI key in Settings first.' });
    expect(calls).toHaveLength(0);
  });

  it('asks in the app’s language', async () => {
    useSettings.getState().setLanguage('ru');
    answers = [reply('Три тренировки.')];
    await askWeeklySummary({ review, money, engagement: true });
    expect(calls[0].body).toContain('Write every string in Russian.');
  });

  it('turns a failure into a sentence, never a throw', async () => {
    answers = ['offline'];
    const result = await askWeeklySummary({ review, money, engagement: true });
    expect(result).toEqual({
      kind: 'error',
      text: 'Could not reach Google. Check your connection.',
    });
  });

  it('retries Google’s bad moment once', async () => {
    answers = [{ status: 503, body: {} }, reply('Held steady.')];
    const result = await askWeeklySummary({ review, money, engagement: true });
    expect(result).toEqual({ kind: 'answer', text: 'Held steady.' });
    expect(calls).toHaveLength(2);
  });

  it('writes nothing to the chats', async () => {
    answers = [reply('Held steady.')];
    await askWeeklySummary({ review, money, engagement: true });
    const { chats } = useAi.getState();
    expect(chats.Workout.length + chats.Tasks.length + chats.Expenses.length).toBe(0);
  });
});
