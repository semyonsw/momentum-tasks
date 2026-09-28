import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The keystore is native, so it is replaced by a variable; `fetch` is replaced by
 * a queue of answers. Everything else — the stores, the validator, the proposal
 * code — runs for real, which is the point: this is the whole path from a tap
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

import { applyProposal, discardProposal, disconnect, sendMessage, testKey } from './aiActions';
import { sanitizeAi, useAi } from './aiStore';
import { useLibrary } from './libraryStore';
import { useSettings } from './settingsStore';

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
  useAi.setState({
    ...sanitizeAi({}),
    pending: { Workout: false, Tasks: false, Expenses: false },
    retrying: { Workout: false, Tasks: false, Expenses: false },
  });
  useLibrary.getState().restoreSeedLibrary();
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
  it('puts the answer in that section’s chat and nowhere else', async () => {
    await connect();
    answers = [gemini([{ type: 'text', text: 'Nine of nine.' }])];
    await sendMessage('Tasks', 'How did today go?');
    const chat = useAi.getState().chats.Tasks;
    expect(chat.map((m) => m.role)).toEqual(['user', 'model']);
    expect(chat[1].role === 'model' && chat[1].blocks).toEqual([
      { type: 'text', text: 'Nine of nine.' },
    ]);
    expect(useAi.getState().chats.Workout).toEqual([]);
    expect(useAi.getState().pending.Tasks).toBe(false);
    // The tasks chat reads the tasks, not the training log.
    expect(calls[0].body).toContain('excused');
    expect(calls[0].body).not.toContain('setsPerCluster4w');
  });

  it('turns a failure into a sentence with the question to retry', async () => {
    await connect();
    answers = [{ status: 429, body: {} }];
    await sendMessage('Expenses', 'Where did August go?');
    const last = useAi.getState().chats.Expenses.at(-1)!;
    expect(last).toMatchObject({
      role: 'error',
      text: 'The key works but is over its quota right now.',
      retry: 'Where did August go?',
    });

    // Try again: the error goes, the question is not asked twice.
    answers = [gemini([{ type: 'text', text: 'Rent, mostly.' }])];
    await sendMessage('Expenses', 'Where did August go?', last.id);
    expect(useAi.getState().chats.Expenses.map((m) => m.role)).toEqual(['user', 'model']);
  });

  /** Run a turn whose retries wait on timers, without waiting for real. */
  async function sendWithTimers(section: 'Workout' | 'Tasks', text: string) {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const turn = sendMessage(section, text);
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
    await sendWithTimers('Tasks', 'Suggest a better schedule');
    expect(calls).toHaveLength(3);
    expect(useAi.getState().chats.Tasks.map((m) => m.role)).toEqual(['user', 'model']);
    expect(useAi.getState().retrying.Tasks).toBe(false);
  });

  it('falls back to the current Flash model when the chosen one keeps failing', async () => {
    await connect();
    answers = [
      { status: 500, body: {} },
      { status: 500, body: {} },
      { status: 500, body: {} },
      gemini([{ type: 'text', text: 'Hello.' }]),
    ];
    await sendWithTimers('Tasks', 'how are you');
    expect(calls).toHaveLength(4);
    expect(calls[3].url).toContain('gemini-flash-latest');
    expect(useAi.getState().chats.Tasks.at(-1)?.role).toBe('model');
  });

  it('says overloaded only after every try failed', async () => {
    await connect();
    answers = [
      { status: 503, body: {} },
      { status: 503, body: {} },
      { status: 503, body: {} },
      { status: 503, body: {} },
    ];
    await sendWithTimers('Tasks', 'how are you');
    expect(useAi.getState().chats.Tasks.at(-1)).toMatchObject({
      role: 'error',
      text: 'Gemini is overloaded right now. Try again in a minute.',
    });
  });

  it('does not retry what is the key’s fault', async () => {
    await connect();
    answers = [{ status: 429, body: {} }];
    await sendWithTimers('Tasks', 'hello');
    expect(calls).toHaveLength(1);
  });

  it('asks once more with the format spelled out when a reply cannot be read', async () => {
    await connect();
    answers = [
      {
        status: 200,
        body: { candidates: [{ content: { parts: [{ text: '{"blocks":[{"type":"chart"}]}' }] } }] },
      },
      gemini([{ type: 'text', text: 'Push, Pull, Legs, then again.' }]),
    ];
    await sendMessage('Workout', 'do you see my workout routines loop?');
    expect(calls).toHaveLength(2);
    expect(calls[1].body).toContain('could not be read');
    expect(useAi.getState().chats.Workout.at(-1)?.role).toBe('model');
  });

  it('says so when there is no signal', async () => {
    await connect();
    answers = ['offline'];
    await sendMessage('Workout', 'Summarize my last 4 weeks');
    expect(useAi.getState().chats.Workout.at(-1)).toMatchObject({
      role: 'error',
      text: 'Could not reach Google. Check your connection.',
    });
  });

  it('reads an answer it cannot use as one sentence, not a crash', async () => {
    await connect();
    answers = [gemini([{ type: 'chart', data: [1, 2, 3] }])];
    await sendMessage('Workout', 'Draw me a chart');
    expect(useAi.getState().chats.Workout.at(-1)).toMatchObject({
      role: 'error',
      text: 'The answer came back in a shape I could not read. Try asking again.',
    });
  });

  it('asks nothing while the key is not ready', async () => {
    storedKey = KEY;
    await sendMessage('Workout', 'Hello');
    expect(calls).toHaveLength(0);
    expect(useAi.getState().chats.Workout.at(-1)).toMatchObject({ role: 'error' });
  });
});

/* ------------------------------------------------------------------ */

const legsDay = {
  type: 'routine_proposal',
  proposal: {
    kind: 'new',
    name: 'Legs + Core',
    why: 'Legs had 8 sets in four weeks.',
    exercises: [
      { name: 'Back squat', sets: 4, reps: 6, weightKg: 80 },
      { name: 'Hip thrust', sets: 3, reps: 10, weightKg: 60, muscle: 'glutes' },
    ],
  },
};

describe('a routine proposal', () => {
  async function propose(): Promise<string> {
    await connect();
    answers = [gemini([{ type: 'text', text: 'Here is a lower-body day.' }, legsDay])];
    await sendMessage('Workout', 'Suggest a new routine');
    const answer = useAi.getState().chats.Workout.at(-1)!;
    if (answer.role !== 'model') throw new Error('expected an answer');
    const block = answer.blocks.find((b) => b.type === 'proposal');
    if (!block || block.type !== 'proposal') throw new Error('expected a proposal');
    return block.proposalId;
  }

  it('waits for a tap: nothing is written when it arrives', async () => {
    const before = useLibrary.getState().routines.length;
    const id = await propose();
    expect(useAi.getState().proposals[id].status).toBe('pending');
    expect(useLibrary.getState().routines).toHaveLength(before);
  });

  it('is written on Add, marked as the AI’s, and undone by Undo', async () => {
    const before = useLibrary.getState();
    const id = await propose();
    const applied = applyProposal(id)!;
    expect(applied.message).toBe('Added Legs + Core to routines');

    const library = useLibrary.getState();
    const routine = library.routines.find((r) => r.name === 'Legs + Core')!;
    expect(routine.items).toHaveLength(2);
    expect(library.exercises.some((e) => e.name === 'Hip thrust')).toBe(true);
    expect(useAi.getState().unseenRoutineIds).toContain(routine.id);
    expect(useAi.getState().proposals[id].status).toBe('accepted');
    // Applying twice does nothing.
    expect(applyProposal(id)).toBeNull();

    applied.undo();
    expect(useLibrary.getState().routines).toEqual(before.routines);
    expect(useLibrary.getState().exercises).toEqual(before.exercises);
    expect(useAi.getState().proposals[id].status).toBe('pending');
    expect(useAi.getState().unseenRoutineIds).not.toContain(routine.id);
  });

  it('can be discarded, after which it cannot be applied', async () => {
    const id = await propose();
    discardProposal(id);
    expect(useAi.getState().proposals[id].status).toBe('discarded');
    expect(applyProposal(id)).toBeNull();
  });

  it('never arrives in another section', async () => {
    await connect();
    answers = [gemini([legsDay])];
    await sendMessage('Tasks', 'Suggest a new routine');
    // Its reason may be said, as text; the proposal itself is never stored.
    const last = useAi.getState().chats.Tasks.at(-1)!;
    expect(last.role === 'model' && last.blocks.every((b) => b.type === 'text')).toBe(true);
    expect(Object.keys(useAi.getState().proposals)).toEqual([]);
  });
});

describe('disconnecting', () => {
  it('forgets the key and keeps the chats', async () => {
    await connect();
    answers = [gemini([{ type: 'text', text: 'Hi.' }])];
    await sendMessage('Tasks', 'Hello');
    await disconnect();
    expect(storedKey).toBeNull();
    expect(useAi.getState().status).toBe('off');
    expect(useAi.getState().chats.Tasks).toHaveLength(2);
  });
});
