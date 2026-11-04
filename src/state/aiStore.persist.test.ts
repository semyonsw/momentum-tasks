import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it } from 'vitest';

import { sanitizeAi, useAi, type AiMessage } from './aiStore';
import { DEFAULT_MODEL } from '../lib/ai/gemini';

/**
 * The assistant's store, through a relaunch — and the small writes around it.
 *
 * `aiStore.test.ts` covers the caps, the archive and the validator on a blob it
 * builds by hand. This file puts the store's OWN write down through the persist
 * middleware and reads it back, because the conversation history is the one thing
 * here a user would miss: the key lives in the keystore and can be pasted again,
 * a month of questions and the changes they produced cannot.
 */

const user = (id: string, text = id): AiMessage => ({ id, role: 'user', text, at: '2026-10-14' });

const model = (id: string, status: 'pending' | 'accepted' = 'pending'): AiMessage => ({
  id,
  role: 'model',
  blocks: [
    {
      type: 'changes',
      changes: [{ target: 'task', field: 'add', value: 'Stretch', schedule: { kind: 'daily' } }],
      rows: [{ subject: 'Stretch', label: 'New task', from: '', to: 'Every day' }],
      why: 'Because.',
      status,
    },
  ],
  raw: '{}',
  at: '2026-10-14',
});

/** What a relaunch must bring back: everything but the question in flight. */
const kept = () => {
  const { pending: _p, retrying: _r, ...rest } = useAi.getState();
  return JSON.parse(JSON.stringify(rest));
};

beforeEach(async () => {
  useAi.setState({ ...sanitizeAi({}), pending: false, retrying: false });
  await AsyncStorage.removeItem('ai');
});

async function relaunch() {
  const blob = await AsyncStorage.getItem('ai');
  if (!blob) throw new Error('nothing was written');
  useAi.setState(sanitizeAi({}));
  await AsyncStorage.setItem('ai', blob);
  await useAi.persist.rehydrate();
}

describe('the model name', () => {
  it('takes the bare name from a pasted `models/…` path, and ignores a blank one', () => {
    useAi.getState().setModel('  models/gemini-x-pro ');
    expect(useAi.getState().model).toBe('gemini-x-pro');
    useAi.getState().setModel('   ');
    useAi.getState().setModel('models/');
    expect(useAi.getState().model).toBe('gemini-x-pro');
  });
});

describe('the connection state', () => {
  it('a new test clears the last error', () => {
    useAi.getState().markError('403');
    expect(useAi.getState()).toMatchObject({ status: 'error', lastError: '403' });
    useAi.getState().markTesting();
    expect(useAi.getState()).toMatchObject({ status: 'testing', lastError: null });
  });

  it('a negative latency reads as zero', () => {
    useAi.getState().markReady(-5);
    expect(useAi.getState().latencyMs).toBe(0);
  });

  it('an error survives a relaunch with its message; a test in flight does not', async () => {
    useAi.getState().markError('quota');
    await relaunch();
    expect(useAi.getState()).toMatchObject({ status: 'error', lastError: 'quota' });

    useAi.getState().markTesting();
    await relaunch();
    expect(useAi.getState()).toMatchObject({ status: 'off', lastError: null });
  });
});

describe('a question in flight', () => {
  it('ending it ends the retry caption with it', () => {
    useAi.getState().setPending(true);
    useAi.getState().setRetrying(true);
    useAi.getState().setPending(false);
    expect(useAi.getState().retrying).toBe(false);
  });

  it('is not written to disk — a killed app is not waiting for anything', async () => {
    useAi.getState().appendMessage(user('q'));
    useAi.getState().setPending(true);
    const blob = JSON.parse((await AsyncStorage.getItem('ai')) ?? '{}');
    expect(blob.state.pending).toBeUndefined();
    expect(blob.state.retrying).toBeUndefined();
  });

  it('blocks reopening a past chat, so the answer cannot land in the wrong one', () => {
    useAi.getState().appendMessage(user('old', 'Old'));
    useAi.getState().clearChat();
    const id = useAi.getState().archive[0].id;
    useAi.getState().appendMessage(user('now', 'Now'));
    useAi.getState().setPending(true);
    useAi.getState().openArchived(id);
    expect(useAi.getState().chat.map((m) => m.id)).toEqual(['now']);
    expect(useAi.getState().archive).toHaveLength(1);
  });
});

describe('removing a message', () => {
  it('takes out that one and leaves the rest', () => {
    useAi.getState().appendMessage(user('q1'));
    useAi.getState().appendMessage(model('a1'));
    useAi.getState().removeMessage('q1');
    expect(useAi.getState().chat.map((m) => m.id)).toEqual(['a1']);
  });

  it('a status for a message that is not there writes nothing', () => {
    useAi.getState().appendMessage(model('a1'));
    const before = useAi.getState().chat;
    useAi.getState().setChangesStatus('nope', 'accepted');
    expect(useAi.getState().chat).toEqual(before);
  });
});

describe('restoring from a backup', () => {
  it('replaces the chat and keeps the phone’s own model and connection', () => {
    useAi.getState().setModel('gemini-mine');
    useAi.getState().markReady(100);
    useAi.getState().appendMessage(user('here'));
    const count = useAi.getState().importChats({
      model: 'gemini-theirs',
      status: 'error',
      chats: { Tasks: [user('there')], Workout: [user('not ours')] },
      archive: {
        Tasks: [{ id: 'c1', messages: [user('past')] }],
        Expenses: [{ id: 'c2', messages: [user('not ours either')] }],
      },
    });
    expect(count).toBe(2);
    const state = useAi.getState();
    expect(state.chat.map((m) => m.id)).toEqual(['there']);
    expect(state.archive.map((c) => c.id)).toEqual(['c1']);
    expect(state).toMatchObject({ model: 'gemini-mine', status: 'ready' });
  });

  it('a backup with nothing readable in it empties the chat and says 0', () => {
    useAi.getState().appendMessage(user('here'));
    expect(useAi.getState().importChats('junk')).toBe(0);
    expect(useAi.getState().chat).toEqual([]);
  });
});

describe('the conversations survive a relaunch', () => {
  it('the open chat, past chats and their cards’ status come back exactly', async () => {
    useAi.getState().setModel('gemini-x');
    useAi.getState().markReady(321, new Date('2026-10-14T08:00:00Z'));
    useAi.getState().appendMessage(user('q1', 'Add stretching'));
    useAi.getState().appendMessage(model('a1', 'accepted'));
    useAi.getState().clearChat();
    useAi.getState().appendMessage(user('q2', 'And reading?'));
    useAi.getState().appendMessage(model('a2'));

    const before = kept();
    await relaunch();
    expect(kept()).toEqual(before);
  });

  it('is written in the shape 3.0.0 filed it under, so either build reads the other', async () => {
    useAi.getState().appendMessage(user('q1'));
    const blob = JSON.parse((await AsyncStorage.getItem('ai')) ?? '{}');
    expect(blob.version).toBe(1);
    expect(blob.state.chats.Tasks.map((m: AiMessage) => m.id)).toEqual(['q1']);
    expect(blob.state.archive).toEqual({ Tasks: [] });
    expect(blob.state.chat).toBeUndefined();
  });

  it('a first launch with nothing stored comes up empty and off', async () => {
    await useAi.persist.rehydrate();
    expect(useAi.getState()).toMatchObject({
      model: DEFAULT_MODEL,
      status: 'off',
      chat: [],
      archive: [],
    });
  });
});
