import { beforeEach, describe, expect, it } from 'vitest';

import { ARCHIVE_CAP, CHAT_CAP, sanitizeAi, useAi, type AiMessage } from './aiStore';

/**
 * The assistant's store. What matters is what survives: the cap, the past
 * chats, and a blob from disk that rehydrates to something the chat can render
 * whatever state it was left in — in the shape Momentum 3.0.0 filed it under
 * (`{ chats: { Tasks } }`), which is what is on the phone.
 */

const user = (id: string, text = id): AiMessage => ({ id, role: 'user', text, at: '2026-09-27' });

beforeEach(() => {
  useAi.setState(sanitizeAi({}));
});

describe('the chat', () => {
  it('is capped', () => {
    for (let i = 0; i < CHAT_CAP + 5; i += 1) useAi.getState().appendMessage(user(`m${i}`));
    const chat = useAi.getState().chat;
    expect(chat).toHaveLength(CHAT_CAP);
    expect(chat[0].id).toBe('m5');
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
        Tasks: [
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
      },
    });
    expect(clean.model).toBe('gemini-3.8-flash');
    expect(clean.chat.map((m) => m.id)).toEqual(['ok', 'ans']);
    const answer = clean.chat[1];
    expect(answer.role === 'model' && answer.blocks).toEqual([{ type: 'text', text: 'kept' }]);
    expect(sanitizeAi({ chats: { Tasks: 'not a list' } }).chat).toEqual([]);
  });

  it('reads only the Tasks chat out of a 3.0.0 blob that filed others beside it', () => {
    const clean = sanitizeAi({
      chats: { Workout: [user('w')], Tasks: [user('t')], Expenses: [user('e')] },
      archive: {
        Workout: [{ id: 'cw', title: 'W', messages: [user('w2')] }],
        Tasks: [{ id: 'ct', title: 'T', messages: [user('t2')] }],
      },
    });
    expect(clean.chat.map((m) => m.id)).toEqual(['t']);
    expect(clean.archive.map((c) => c.id)).toEqual(['ct']);
  });
});

describe('the history of past chats', () => {
  it('files the chat on New chat instead of deleting it', () => {
    useAi.getState().appendMessage(user('q1', 'Plan my week'));
    useAi.getState().clearChat();
    const { chat, archive } = useAi.getState();
    expect(chat).toEqual([]);
    expect(archive).toHaveLength(1);
    expect(archive[0].title).toBe('Plan my week');
  });

  it('files nothing for a chat nobody asked anything in', () => {
    useAi.getState().clearChat();
    expect(useAi.getState().archive).toEqual([]);
  });

  it('reopens a past chat, and files the open one in its place', () => {
    useAi.getState().appendMessage(user('old', 'Old question'));
    useAi.getState().clearChat();
    const oldId = useAi.getState().archive[0].id;
    useAi.getState().appendMessage(user('new', 'New question'));
    useAi.getState().openArchived(oldId);
    const { chat, archive } = useAi.getState();
    expect(chat.map((m) => m.id)).toEqual(['old']);
    expect(archive.map((c) => c.title)).toEqual(['New question']);
  });

  it('puts a deleted past chat back exactly on Undo — messages and order (U14)', () => {
    // Three past chats, newest first: C, B, A.
    for (const title of ['A', 'B', 'C']) {
      useAi.getState().appendMessage(user(`q${title}`, title));
      useAi.getState().clearChat();
    }
    useAi.getState().appendMessage(user('open', 'Still open'));
    const before = useAi.getState();
    const middle = before.archive[1];
    expect(middle.title).toBe('B');

    const deleted = useAi.getState().deleteArchived(middle.id);
    expect(deleted).not.toBeNull();
    expect(useAi.getState().archive.map((c) => c.title)).toEqual(['C', 'A']);

    useAi.getState().restoreArchived(deleted!);
    const after = useAi.getState();
    expect(after.archive).toEqual(before.archive);
    // Still a PAST chat: the open one is untouched.
    expect(after.chat).toEqual(before.chat);

    // A second Undo changes nothing.
    useAi.getState().restoreArchived(deleted!);
    expect(useAi.getState().archive).toEqual(before.archive);
  });

  it('returns null for a past chat that is not there', () => {
    expect(useAi.getState().deleteArchived('nope')).toBeNull();
  });

  it('survives a relaunch, and caps how many it keeps', () => {
    for (let i = 0; i < ARCHIVE_CAP + 3; i += 1) {
      useAi.getState().appendMessage(user(`q${i}`, `Q${i}`));
      useAi.getState().clearChat();
    }
    const { chats, archive } = useAi.persist.getOptions().partialize!(useAi.getState()) as {
      chats: unknown;
      archive: unknown;
    };
    const back = sanitizeAi(JSON.parse(JSON.stringify({ chats, archive })));
    expect(back.archive).toHaveLength(ARCHIVE_CAP);
    expect(back.archive[0].title).toBe(`Q${ARCHIVE_CAP + 2}`);
    expect(sanitizeAi({ archive: 'junk' }).archive).toEqual([]);
  });
});

describe('a tasks-changes card', () => {
  const changesBlock = {
    type: 'changes' as const,
    changes: [
      { target: 'task' as const, id: 't_read', field: 'name' as const, value: 'Read a book' },
      { target: 'task' as const, id: 't_run', field: 'archive' as const, value: true },
    ],
    rows: [
      { subject: 'Read', label: 'Name', from: 'Read', to: 'Read a book' },
      { subject: 'Run', label: 'Archive', from: '', to: 'Archived' },
    ],
    why: 'Tidier.',
    status: 'pending' as const,
  };
  const answer = (id: string, extra: object = {}): AiMessage => ({
    id,
    role: 'model',
    blocks: [
      { type: 'text', text: 'Here.' },
      { ...changesBlock, ...extra },
    ],
    raw: '{}',
    at: '2026-10-01',
  });
  const blockOf = (message: AiMessage | undefined) =>
    message?.role === 'model' ? message.blocks.find((b) => b.type === 'changes') : undefined;
  const roundTrip = () =>
    sanitizeAi(
      JSON.parse(JSON.stringify(useAi.persist.getOptions().partialize!(useAi.getState()))),
    );

  it('is marked accepted, discarded, and pending again — only on its own message', () => {
    useAi.getState().appendMessage(answer('a1'));
    useAi.getState().appendMessage(answer('a2'));
    useAi.getState().setChangesStatus('a1', 'accepted');
    const [a1, a2] = useAi.getState().chat;
    expect(blockOf(a1)).toMatchObject({ status: 'accepted' });
    expect(blockOf(a2)).toMatchObject({ status: 'pending' });
    // The text block beside it is untouched.
    expect(a1.role === 'model' && a1.blocks[0]).toEqual({ type: 'text', text: 'Here.' });
    useAi.getState().setChangesStatus('a1', 'pending');
    expect(blockOf(useAi.getState().chat[0])).toMatchObject({ status: 'pending' });
  });

  it('is marked in the archive too, after New chat', () => {
    useAi.getState().appendMessage(user('q', 'Rename?'));
    useAi.getState().appendMessage(answer('a1'));
    useAi.getState().setChangesStatus('a1', 'accepted');
    useAi.getState().clearChat();
    // The Undo, after the chat was filed away.
    useAi.getState().setChangesStatus('a1', 'pending');
    const filed = useAi.getState().archive[0].messages.find((m) => m.id === 'a1');
    expect(blockOf(filed)).toMatchObject({ status: 'pending' });
  });

  it('survives a relaunch exactly, status and all', () => {
    useAi.getState().appendMessage(answer('a1'));
    useAi.getState().setChangesStatus('a1', 'accepted');
    expect(blockOf(roundTrip().chat[0])).toEqual({ ...changesBlock, status: 'accepted' });
    useAi.getState().setChangesStatus('a1', 'discarded');
    expect(blockOf(roundTrip().chat[0])).toMatchObject({ status: 'discarded' });
  });

  it('rehydrates a damaged card to what Apply can read, or drops it', () => {
    const blob = (block: object) =>
      sanitizeAi({
        chats: {
          Tasks: [
            {
              id: 'a1',
              role: 'model',
              blocks: [{ type: 'text', text: 'Hi' }, block],
              raw: '',
              at: 'x',
            },
          ],
        },
      }).chat[0];
    // A junk change (a 3.0.0 Workout one among them) and a junk row are
    // dropped; a junk status is pending.
    const mixed = blockOf(
      blob({
        ...changesBlock,
        changes: [
          ...changesBlock.changes,
          { target: 'exercise', id: 'ex_bench', field: 'rest_seconds', value: 90 },
          { target: 'task' },
          'x',
        ],
        rows: [...changesBlock.rows, { label: 3, to: 'x' }, { label: 'L', to: 'T' }],
        why: 7,
        status: 'applied',
      }),
    );
    expect(mixed).toEqual({
      type: 'changes',
      changes: changesBlock.changes,
      rows: [...changesBlock.rows, { subject: '', label: 'L', from: '', to: 'T' }],
      why: '',
      status: 'pending',
    });
    // Nothing applicable, or nothing to show: the card goes, the message stays.
    for (const broken of [
      { ...changesBlock, changes: [] },
      { ...changesBlock, rows: 'x' },
    ]) {
      const message = blob(broken);
      expect(message.role === 'model' && message.blocks).toEqual([{ type: 'text', text: 'Hi' }]);
    }
  });
});
