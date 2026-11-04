import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The keystore is native, so it is replaced by a variable; `fetch` is replaced by
 * a queue of answers. Everything else — the stores, the validator, the changes
 * card — runs for real, which is the point: this is the whole path from a tap
 * to the chat, and the one place the pieces are tested together.
 */
let storedKey: string | null = null;
vi.mock('../lib/ai/secureKey', () => ({
  getKey: async () => storedKey,
  setKey: async (value: string) => {
    storedKey = value;
    return true;
  },
  clearKey: async () => {
    storedKey = null;
  },
}));

import { applyChanges, discardChanges, disconnect, sendMessage, testKey } from './aiActions';
import { sanitizeAi, useAi } from './aiStore';
import { useSettings } from './settingsStore';
import { useTasks } from './tasksStore';

const KEY = 'AIzaSyTESTKEY-1234567890abcdef';

type Answer = { status: number; body: unknown } | 'offline';
let answers: Answer[] = [];
const calls: { url: string; headers: Record<string, string>; body?: string }[] = [];

function gemini(blocks: unknown[]) {
  return {
    status: 200,
    body: { candidates: [{ content: { parts: [{ text: JSON.stringify({ blocks }) }] } }] },
  };
}

beforeEach(() => {
  storedKey = null;
  answers = [];
  calls.length = 0;
  useAi.setState({ ...sanitizeAi({}), pending: false, retrying: false });
  useTasks.setState({ tasks: [], log: {} });
  useSettings.getState().resetToDefaults();
  useSettings.getState().setLanguage('en');
  vi.stubGlobal(
    'fetch',
    async (url: string, init: { headers: Record<string, string>; body?: string }) => {
      calls.push({ url, headers: init.headers, body: init.body });
      const next = answers.shift();
      if (!next || next === 'offline') throw new TypeError('Network request failed');
      return { status: next.status, text: async () => JSON.stringify(next.body) };
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ------------------------------------------------------------------ */

describe('testing a key', () => {
  it('walks the three steps and stores the key only when all pass', async () => {
    answers = [{ status: 200, body: { models: [] } }, gemini([])];
    const steps: number[] = [];
    const result = await testKey(`  ${KEY} `, (n) => steps.push(n));
    expect(result.ok).toBe(true);
    expect(steps).toEqual([1, 2, 3]);
    expect(storedKey).toBe(KEY);
    expect(calls.every((call) => !call.url.includes(KEY))).toBe(true);
  });

  it('refuses a key of the wrong shape without calling anybody', async () => {
    const result = await testKey('sk-something', () => {});
    expect(result).toMatchObject({ ok: false });
    expect(calls).toHaveLength(0);
    expect(storedKey).toBeNull();
  });

  it('stops at the step that failed, with Google’s words', async () => {
    answers = [{ status: 400, body: { error: { message: 'API key not valid.' } } }];
    const steps: number[] = [];
    expect(await testKey(KEY, (n) => steps.push(n))).toEqual({
      ok: false,
      error: 'Google said: API key not valid.',
    });
    expect(steps).toEqual([1]);
    expect(storedKey).toBeNull();
  });

  it('names the model when the key cannot use it', async () => {
    answers = [
      { status: 200, body: {} },
      { status: 404, body: {} },
    ];
    expect(await testKey(KEY, () => {})).toEqual({
      ok: false,
      error: 'This key cannot use gemini-3.8-flash.',
    });
  });
});

/* ------------------------------------------------------------------ */

async function connect() {
  storedKey = KEY;
  useAi.getState().markReady(500);
}

describe('asking a question', () => {
  it('puts the answer in the chat', async () => {
    await connect();
    answers = [gemini([{ type: 'text', text: 'Nine of nine.' }])];
    await sendMessage('How did today go?');
    const chat = useAi.getState().chat;
    expect(chat.map((m) => m.role)).toEqual(['user', 'model']);
    expect(chat[1].role === 'model' && chat[1].blocks).toEqual([
      { type: 'text', text: 'Nine of nine.' },
    ]);
    expect(useAi.getState().pending).toBe(false);
    // The tasks chat reads the tasks, not the training log.
    expect(calls[0].body).toContain('excused');
    expect(calls[0].body).not.toContain('setsPerCluster4w');
  });

  it('turns a failure into a sentence with the question to retry', async () => {
    await connect();
    answers = [{ status: 429, body: {} }];
    await sendMessage('Where did August go?');
    const last = useAi.getState().chat.at(-1)!;
    expect(last).toMatchObject({
      role: 'error',
      text: 'The key works but is over its quota right now.',
      retry: 'Where did August go?',
    });

    // Try again: the error goes, the question is not asked twice.
    answers = [gemini([{ type: 'text', text: 'Rent, mostly.' }])];
    await sendMessage('Where did August go?', last.id);
    expect(useAi.getState().chat.map((m) => m.role)).toEqual(['user', 'model']);
  });

  /** Run a turn whose retries wait on timers, without waiting for real. */
  async function sendWithTimers(text: string) {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const turn = sendMessage(text);
      for (let i = 0; i < 10; i += 1) await vi.advanceTimersByTimeAsync(2000);
      await turn;
    } finally {
      vi.useRealTimers();
    }
  }

  it('asks again when Google has a bad moment, and shows only the answer', async () => {
    await connect();
    answers = [
      { status: 503, body: { error: { message: 'The model is overloaded.' } } },
      { status: 500, body: {} },
      gemini([{ type: 'text', text: 'Mon, Wed, Fri.' }]),
    ];
    await sendWithTimers('Suggest a better schedule');
    expect(calls).toHaveLength(3);
    expect(useAi.getState().chat.map((m) => m.role)).toEqual(['user', 'model']);
    expect(useAi.getState().retrying).toBe(false);
  });

  it('falls back to the current Flash model when the chosen one keeps failing', async () => {
    await connect();
    answers = [
      { status: 500, body: {} },
      { status: 500, body: {} },
      { status: 500, body: {} },
      gemini([{ type: 'text', text: 'Hello.' }]),
    ];
    await sendWithTimers('how are you');
    expect(calls).toHaveLength(4);
    expect(calls[3].url).toContain('gemini-flash-latest');
    expect(useAi.getState().chat.at(-1)?.role).toBe('model');
  });

  it('says overloaded only after every try failed', async () => {
    await connect();
    answers = [
      { status: 503, body: {} },
      { status: 503, body: {} },
      { status: 503, body: {} },
      { status: 503, body: {} },
    ];
    await sendWithTimers('how are you');
    expect(useAi.getState().chat.at(-1)).toMatchObject({
      role: 'error',
      text: 'The AI coach is overloaded right now. Try again in a minute.',
    });
  });

  it('does not retry what is the key’s fault', async () => {
    await connect();
    answers = [{ status: 429, body: {} }];
    await sendWithTimers('hello');
    expect(calls).toHaveLength(1);
  });

  it('asks once more with the format spelled out when a reply cannot be read', async () => {
    await connect();
    answers = [
      {
        status: 200,
        body: { candidates: [{ content: { parts: [{ text: '{"blocks":[{"type":"chart"}]}' }] } }] },
      },
      gemini([{ type: 'text', text: 'Read, then run, then read again.' }]),
    ];
    await sendMessage('do you see my tasks?');
    expect(calls).toHaveLength(2);
    expect(calls[1].body).toContain('could not be read');
    expect(useAi.getState().chat.at(-1)?.role).toBe('model');
  });

  it('says so when there is no signal', async () => {
    await connect();
    answers = ['offline'];
    await sendMessage('Summarize my last 4 weeks');
    expect(useAi.getState().chat.at(-1)).toMatchObject({
      role: 'error',
      text: 'Could not reach Google. Check your connection.',
    });
  });

  it('reads an answer it cannot use as one sentence, not a crash', async () => {
    await connect();
    answers = [gemini([{ type: 'chart', data: [1, 2, 3] }])];
    await sendMessage('Draw me a chart');
    expect(useAi.getState().chat.at(-1)).toMatchObject({
      role: 'error',
      text: 'The answer came back in a shape I could not read. Try asking again.',
    });
  });

  it('asks nothing while the key is not ready', async () => {
    storedKey = KEY;
    await sendMessage('Hello');
    expect(calls).toHaveLength(0);
    expect(useAi.getState().chat.at(-1)).toMatchObject({ role: 'error' });
  });
});

describe('disconnecting', () => {
  it('forgets the key and keeps the chats', async () => {
    await connect();
    answers = [gemini([{ type: 'text', text: 'Hi.' }])];
    await sendMessage('Hello');
    await disconnect();
    expect(storedKey).toBeNull();
    expect(useAi.getState().status).toBe('off');
    expect(useAi.getState().chat).toHaveLength(2);
  });
});

describe('a changes card', () => {
  const addStretch = gemini([
    { type: 'text', text: 'Add stretching.' },
    {
      type: 'changes_proposal',
      changes: { items: [{ target: 'task', field: 'add', text: 'Stretch' }], why: 'Asked.' },
    },
  ]);

  it('waits for a tap: nothing is written when it arrives', async () => {
    await connect();
    answers = [addStretch];
    await sendMessage('Add stretching');
    expect(useTasks.getState().tasks).toEqual([]);
    const card = useAi.getState().chat.at(-1)!;
    expect(card.role === 'model' && card.blocks.map((b) => b.type)).toEqual(['text', 'changes']);
  });

  it('is written on Apply, and undone by Undo', async () => {
    await connect();
    answers = [addStretch];
    await sendMessage('Add stretching');
    const card = useAi.getState().chat.at(-1)!;
    const applied = applyChanges(card.id);
    expect(applied?.message).toBe('1 changes applied');
    expect(useTasks.getState().tasks.map((t) => t.name)).toEqual(['Stretch']);
    applied!.undo();
    expect(useTasks.getState().tasks).toEqual([]);
  });

  it('can be discarded, after which it cannot be applied', async () => {
    await connect();
    answers = [addStretch];
    await sendMessage('Add stretching');
    const card = useAi.getState().chat.at(-1)!;
    discardChanges(card.id);
    expect(applyChanges(card.id)).toBeNull();
    expect(useTasks.getState().tasks).toEqual([]);
  });
});
