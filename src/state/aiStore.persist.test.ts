import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it } from 'vitest';

import { sanitizeAi, useAi, type AiMessage } from './aiStore';
import type { ReviewProposal } from '../lib/ai/aiProposal';
import { DEFAULT_MODEL } from '../lib/ai/gemini';

/**
 * The assistant's store, through a relaunch — and the small writes around it.
 *
 * `aiStore.test.ts` covers the caps, the archive and the validator on a blob it
 * builds by hand. This file puts the store's OWN write down through the persist
 * middleware and reads it back, because the conversation history is the one thing
 * here a user would miss: the key lives in the keystore and can be pasted again,
 * a month of questions and the routines they produced cannot.
 */

const user = (id: string, text = id): AiMessage => ({ id, role: 'user', text, at: '2026-10-14' });

const model = (id: string, proposalId: string): AiMessage => ({
  id,
  role: 'model',
  blocks: [{ type: 'proposal', proposalId }],
  raw: '{}',
  at: '2026-10-14',
});

const proposal: ReviewProposal = {
  kind: 'new',
  name: 'Legs',
  why: 'Because.',
  rows: [
    {
      key: 'k1',
      exerciseId: 'ex_squat',
      name: 'Squat',
      sets: 4,
      reps: 6,
      weightKg: 80,
      was: null,
      removed: false,
      repsLocked: false,
      weightLocked: false,
      baseWeightKg: null,
    },
  ],
};

beforeEach(async () => {
  useAi.setState({
    ...sanitizeAi({}),
    pending: { Workout: false, Tasks: false, Expenses: false },
    retrying: { Workout: false, Tasks: false, Expenses: false },
  });
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
    useAi.getState().setPending('Workout', true);
    useAi.getState().setRetrying('Workout', true);
    useAi.getState().setPending('Workout', false);
    expect(useAi.getState().retrying.Workout).toBe(false);
  });

  it('starting one leaves another section alone', () => {
    useAi.getState().setPending('Tasks', true);
    expect(useAi.getState().pending).toEqual({ Workout: false, Tasks: true, Expenses: false });
  });

  it('is not written to disk — a killed app is not waiting for anything', async () => {
    useAi.getState().appendMessage('Workout', user('q'));
    useAi.getState().setPending('Workout', true);
    const blob = JSON.parse((await AsyncStorage.getItem('ai')) ?? '{}');
    expect(blob.state.pending).toBeUndefined();
    expect(blob.state.retrying).toBeUndefined();
  });

  it('blocks reopening a past chat, so the answer cannot land in the wrong one', () => {
    useAi.getState().appendMessage('Tasks', user('old', 'Old'));
    useAi.getState().clearChat('Tasks');
    const id = useAi.getState().archive.Tasks[0].id;
    useAi.getState().appendMessage('Tasks', user('now', 'Now'));
    useAi.getState().setPending('Tasks', true);
    useAi.getState().openArchived('Tasks', id);
    expect(useAi.getState().chats.Tasks.map((m) => m.id)).toEqual(['now']);
    expect(useAi.getState().archive.Tasks).toHaveLength(1);
  });
});

describe('messages and the suggestions they point at', () => {
  it('removing the message that carried a suggestion drops the suggestion', () => {
    useAi.getState().putProposal('p1', proposal);
    useAi.getState().appendMessage('Workout', model('a1', 'p1'));
    useAi.getState().removeMessage('Workout', 'a1');
    expect(useAi.getState().proposals.p1).toBeUndefined();
  });

  it('removing an unrelated message keeps it', () => {
    useAi.getState().appendMessage('Workout', user('q1'));
    useAi.getState().putProposal('p1', proposal);
    useAi.getState().appendMessage('Workout', model('a1', 'p1'));
    useAi.getState().removeMessage('Workout', 'q1');
    expect(useAi.getState().proposals.p1).toBeDefined();
  });

  it('a status for a suggestion that is not there writes nothing', () => {
    useAi.getState().setProposalStatus('nope', 'accepted');
    useAi.getState().updateProposal('nope', proposal);
    expect(useAi.getState().proposals).toEqual({});
  });
});

describe('the AI pill on a routine', () => {
  it('is added once and cleared on open', () => {
    useAi.getState().markRoutineAi('r1');
    useAi.getState().markRoutineAi('r1');
    useAi.getState().markRoutineAi('r2');
    expect(useAi.getState().unseenRoutineIds).toEqual(['r1', 'r2']);
    useAi.getState().markRoutineSeen('r1');
    expect(useAi.getState().unseenRoutineIds).toEqual(['r2']);
  });

  it('opening a routine already seen does not touch the store', () => {
    const before = useAi.getState().unseenRoutineIds;
    useAi.getState().markRoutineSeen('r9');
    expect(useAi.getState().unseenRoutineIds).toBe(before);
  });
});

describe('restoring from a backup', () => {
  it('replaces the chats and keeps the phone’s own model and connection', () => {
    useAi.getState().setModel('gemini-mine');
    useAi.getState().markReady(100);
    useAi.getState().appendMessage('Workout', user('here'));
    const count = useAi.getState().importChats({
      model: 'gemini-theirs',
      status: 'error',
      chats: { Tasks: [user('there')] },
      archive: { Expenses: [{ id: 'c1', messages: [user('past')] }] },
    });
    expect(count).toBe(2);
    const state = useAi.getState();
    expect(state.chats.Workout).toEqual([]);
    expect(state.chats.Tasks.map((m) => m.id)).toEqual(['there']);
    expect(state.archive.Expenses.map((c) => c.id)).toEqual(['c1']);
    expect(state).toMatchObject({ model: 'gemini-mine', status: 'ready' });
  });

  it('a backup with nothing readable in it empties the chats and says 0', () => {
    useAi.getState().appendMessage('Workout', user('here'));
    expect(useAi.getState().importChats('junk')).toBe(0);
    expect(useAi.getState().chats.Workout).toEqual([]);
  });
});

describe('the conversations survive a relaunch', () => {
  it('open chats, past chats, suggestions and their status come back exactly', async () => {
    useAi.getState().setModel('gemini-x');
    useAi.getState().markReady(321, new Date('2026-10-14T08:00:00Z'));
    useAi.getState().appendMessage('Workout', user('q1', 'Suggest legs'));
    useAi.getState().putProposal('p1', proposal);
    useAi.getState().setProposalStatus('p1', 'accepted');
    useAi.getState().appendMessage('Workout', model('a1', 'p1'));
    useAi.getState().clearChat('Workout');
    useAi.getState().appendMessage('Workout', user('q2', 'And arms?'));
    useAi.getState().putProposal('p2', proposal);
    useAi.getState().appendMessage('Workout', model('a2', 'p2'));
    useAi.getState().appendMessage('Expenses', user('q3', 'Where did it go?'));
    useAi.getState().markRoutineAi('r1');

    const before = sanitizeAi(useAi.getState());
    await relaunch();
    expect(sanitizeAi(useAi.getState())).toEqual(before);
    expect(useAi.getState().proposals.p1.status).toBe('accepted');
    expect(useAi.getState().proposals.p2.status).toBe('pending');
  });

  it('a first launch with nothing stored comes up empty and off', async () => {
    await useAi.persist.rehydrate();
    expect(useAi.getState()).toMatchObject({
      model: DEFAULT_MODEL,
      status: 'off',
      chats: { Workout: [], Tasks: [], Expenses: [] },
      proposals: {},
    });
  });
});
