import { beforeEach, describe, expect, it } from 'vitest';

import { CHAT_CAP, sanitizeAi, useAi, type AiMessage } from './aiStore';
import type { ReviewProposal } from '../lib/ai/aiProposal';

/**
 * The assistant's store. What matters is what survives: the cap, a proposal
 * living exactly as long as a message points at it, and a blob from disk that
 * rehydrates to something the chat can render whatever state it was left in.
 */

const user = (id: string, text = id): AiMessage => ({ id, role: 'user', text, at: '2026-09-27' });

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

beforeEach(() => {
  useAi.setState(sanitizeAi({}));
});

describe('the chats', () => {
  it('are one per section and capped', () => {
    for (let i = 0; i < CHAT_CAP + 5; i += 1)
      useAi.getState().appendMessage('Tasks', user(`m${i}`));
    const chat = useAi.getState().chats.Tasks;
    expect(chat).toHaveLength(CHAT_CAP);
    expect(chat[0].id).toBe('m5');
    expect(useAi.getState().chats.Workout).toEqual([]);
  });

  it('drop a proposal once no message points at it', () => {
    useAi.getState().putProposal('p1', proposal);
    useAi.getState().appendMessage('Workout', {
      id: 'a1',
      role: 'model',
      blocks: [{ type: 'proposal', proposalId: 'p1' }],
      raw: '{}',
      at: '2026-09-27',
    });
    expect(useAi.getState().proposals.p1).toBeDefined();
    useAi.getState().clearChat('Workout');
    expect(useAi.getState().proposals.p1).toBeUndefined();
  });
});

describe('proposals', () => {
  it('are editable while pending and frozen once decided', () => {
    useAi.getState().putProposal('p1', proposal);
    useAi.getState().updateProposal('p1', { ...proposal, name: 'Legs + Core' });
    expect(useAi.getState().proposals.p1.proposal.name).toBe('Legs + Core');
    useAi.getState().setProposalStatus('p1', 'accepted');
    useAi.getState().updateProposal('p1', { ...proposal, name: 'Changed later' });
    expect(useAi.getState().proposals.p1.proposal.name).toBe('Legs + Core');
  });
});

describe('the status', () => {
  it('records the test and clears it on disconnect', () => {
    useAi.getState().markReady(812.4, new Date('2026-09-27T18:44:00Z'));
    expect(useAi.getState()).toMatchObject({
      status: 'ready',
      latencyMs: 812,
      lastTestedAt: '2026-09-27T18:44:00.000Z',
    });
    useAi.getState().markOff();
    expect(useAi.getState()).toMatchObject({ status: 'off', latencyMs: null });
  });
});

describe('rehydration', () => {
  it('turns an interrupted test into off rather than a phantom ready', () => {
    expect(sanitizeAi({ status: 'testing' }).status).toBe('off');
    expect(sanitizeAi({ status: 'ready' }).status).toBe('ready');
    expect(sanitizeAi({ status: 'party' }).status).toBe('off');
  });

  it('survives garbage without losing what was good', () => {
    const clean = sanitizeAi({
      model: '  ',
      chats: {
        Workout: [
          user('ok'),
          { id: 'bad' },
          { role: 'user', text: 'no id' },
          {
            id: 'ans',
            role: 'model',
            raw: '{}',
            blocks: [
              { type: 'text', text: 'kept' },
              { type: 'proposal', proposalId: 'missing' },
              { type: 'image' },
            ],
          },
        ],
        Tasks: 'not a list',
      },
      proposals: { junk: { proposal: { kind: 'new', rows: [] } } },
      unseenRoutineIds: ['r1', 7],
    });
    expect(clean.model).toBe('gemini-3.8-flash');
    expect(clean.chats.Workout.map((m) => m.id)).toEqual(['ok', 'ans']);
    const answer = clean.chats.Workout[1];
    expect(answer.role === 'model' && answer.blocks).toEqual([{ type: 'text', text: 'kept' }]);
    expect(clean.chats.Tasks).toEqual([]);
    expect(clean.proposals).toEqual({});
    expect(clean.unseenRoutineIds).toEqual(['r1']);
  });
});
