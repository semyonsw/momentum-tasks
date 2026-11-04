import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * A TASKS CARD, END TO END — from a scripted Gemini reply to the tasks store
 * and back again on Undo.
 *
 * `fetch` is a queue of scripted replies; everything else is the real path:
 * `sendMessage` validating the block and checking each change against the
 * tasks, the card's `from → to` read at that moment, `applyChanges` writing
 * through the store's own actions, and the one Undo that has to put the list
 * back EXACTLY — including the tasks that did not exist before.
 */
let storedKey: string | null = null;
vi.mock('../lib/ai/secureKey', () => ({
  getKey: async () => storedKey,
  setKey: async () => true,
  clearKey: async () => {
    storedKey = null;
  },
}));

import { applyChanges, discardChanges, sendMessage } from './aiActions';
import { sanitizeAi, useAi, type ChangesChatBlock } from './aiStore';
import { useSettings } from './settingsStore';
import { useTasks } from './tasksStore';
import type { Task } from '../lib/tasks';

/* ------------------------------------------------------------------ */
/* The user's things                                                   */
/* ------------------------------------------------------------------ */

const task = (id: string, name: string, order: number, over: Partial<Task> = {}): Task => ({
  id,
  name,
  schedule: { kind: 'daily' },
  auto: null,
  startedOn: '2026-09-01',
  reminder: null,
  archivedAt: null,
  order,
  ...over,
});
const TASKS: Task[] = [
  task('t_read', 'Read', 0, { target: { count: 20, unit: 'pages' } }),
  task('t_run', 'Run', 1, { schedule: { kind: 'weekdays', days: [0, 2] } }),
];

/* ------------------------------------------------------------------ */
/* Scripted Gemini                                                     */
/* ------------------------------------------------------------------ */

type Answer = { status: number; body: unknown };
let answers: Answer[] = [];
const sent: string[] = [];

function reply(items: unknown[], why = 'Here is what I would change.'): Answer {
  const blocks = [
    { type: 'text', text: 'Sure.' },
    { type: 'changes_proposal', changes: { items, why } },
  ];
  return {
    status: 200,
    body: { candidates: [{ content: { parts: [{ text: JSON.stringify({ blocks }) }] } }] },
  };
}

/** Ask, with this reply scripted; the model message's id and its card. */
async function ask(answer: Answer): Promise<{ id: string; card: ChangesChatBlock | undefined }> {
  answers.push(answer);
  await sendMessage('change some tasks');
  const last = useAi.getState().chat.at(-1)!;
  if (last.role !== 'model') throw new Error(`no answer: ${JSON.stringify(last)}`);
  const card = last.blocks.find((b): b is ChangesChatBlock => b.type === 'changes');
  return { id: last.id, card };
}

const cardOf = (id: string) => {
  const message = useAi.getState().chat.find((m) => m.id === id);
  return message?.role === 'model'
    ? message.blocks.find((b): b is ChangesChatBlock => b.type === 'changes')
    : undefined;
};

/** Everything a card can touch, as plain data. */
function snapshot() {
  return JSON.parse(JSON.stringify({ tasks: useTasks.getState().tasks }));
}

const named = (id: string) => useTasks.getState().tasks.find((x) => x.id === id)!.name;

beforeEach(() => {
  storedKey = 'AIzaSyTESTKEY-1234567890abcdef';
  answers = [];
  sent.length = 0;
  useAi.setState({ ...sanitizeAi({}), pending: false, retrying: false });
  useAi.getState().markReady(500);
  useSettings.getState().resetToDefaults();
  useSettings.getState().setLanguage('en');
  useTasks.setState({ tasks: TASKS, log: {} });
  vi.stubGlobal('fetch', async (_url: string, init: { body?: string }) => {
    sent.push(init.body ?? '');
    const next = answers.shift();
    if (!next) throw new TypeError('Network request failed');
    return { status: next.status, text: async () => JSON.stringify(next.body) };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ------------------------------------------------------------------ */
/* The card                                                            */
/* ------------------------------------------------------------------ */

describe('a Tasks card', () => {
  const ITEMS = [
    { target: 'task', field: 'add', text: 'Stretch', days: [0, 2, 4] },
    { target: 'task', field: 'add', text: 'Floss', number: 7 },
    { target: 'task', field: 'add', text: 'read' },
    { target: 'task', id: 't_read', field: 'rename', text: 'Read a book' },
    { target: 'task', id: 't_read', field: 'target', number: 30 },
    { target: 'task', id: 't_run', field: 'schedule', number: 3 },
    { target: 'task', id: 't_run', field: 'archive' },
    // A 3.0.0 Workout setting is not something this chat can change.
    { target: 'setting', field: 'auto_rest', on: false },
  ];

  it('files the task changes only, and draws them', async () => {
    const { card } = await ask(reply(ITEMS));
    expect(
      card?.rows.map(({ subject, label, from, to }) => `${subject} | ${label} | ${from} → ${to}`),
    ).toEqual([
      'Stretch | New task |  → Mon Wed Fri',
      'Floss | New task |  → Every day',
      'Read | Name | Read → Read a book',
      'Read | Daily target | 20 pages → 30 pages',
      'Run | Schedule | Mon Wed → 3× a week',
      'Run | Stop this task |  → Archived',
    ]);
  });

  it('Apply adds, renames, retargets, reschedules and archives; Undo restores the list exactly', async () => {
    const before = snapshot();
    const { id } = await ask(reply(ITEMS));
    const applied = applyChanges(id);
    expect(applied?.message).toBe('6 changes applied');

    const list = useTasks.getState().tasks;
    const byName = (name: string) => list.find((x) => x.name === name);
    expect(byName('Stretch')?.schedule).toEqual({ kind: 'weekdays', days: [0, 2, 4] });
    expect(byName('Floss')?.schedule).toEqual({ kind: 'daily' });
    expect(byName('Read a book')?.target).toEqual({ count: 30, unit: 'pages' });
    const run = list.find((x) => x.id === 't_run')!;
    expect(run.schedule).toEqual({ kind: 'weekly', times: 3 });
    expect(run.archivedAt).not.toBeNull();
    // Two new tasks, two ids: one card adds them in the same millisecond.
    expect(new Set(list.map((x) => x.id)).size).toBe(list.length);

    applied!.undo();
    expect(snapshot()).toEqual(before);
    expect(cardOf(id)?.status).toBe('pending');
  });

  it('a task archived since the answer is skipped', async () => {
    const { id } = await ask(
      reply([{ target: 'task', id: 't_run', field: 'rename', text: 'Jog' }]),
    );
    useTasks.getState().archiveTask('t_run');
    expect(applyChanges(id)).toBeNull();
  });
});

describe('deciding a card', () => {
  it('is applied once: a second Apply, or one after Discard, is refused', async () => {
    const { id } = await ask(
      reply([{ target: 'task', id: 't_run', field: 'rename', text: 'Jog' }]),
    );
    expect(applyChanges(id)).not.toBeNull();
    const after = snapshot();
    expect(applyChanges(id)).toBeNull();
    expect(snapshot()).toEqual(after);

    const second = await ask(
      reply([{ target: 'task', id: 't_run', field: 'rename', text: 'Sprint' }]),
    );
    discardChanges(second.id);
    expect(cardOf(second.id)?.status).toBe('discarded');
    expect(applyChanges(second.id)).toBeNull();
    expect(named('t_run')).toBe('Jog');
  });

  it('can be applied again after its Undo', async () => {
    const { id } = await ask(
      reply([{ target: 'task', id: 't_run', field: 'rename', text: 'Jog' }]),
    );
    applyChanges(id)!.undo();
    expect(named('t_run')).toBe('Run');
    expect(cardOf(id)?.status).toBe('pending');
    expect(applyChanges(id)).not.toBeNull();
    expect(named('t_run')).toBe('Jog');
  });

  it('refuses a message that is not there, or has no card', async () => {
    expect(applyChanges('nope')).toBeNull();
    const { id } = await ask(reply([{ target: 'task', id: 't_nope', field: 'archive' }]));
    expect(cardOf(id)).toBeUndefined();
    expect(applyChanges(id)).toBeNull();
  });

  it('skips a task archived since the answer; with nothing left, nothing is applied', async () => {
    const { id } = await ask(
      reply([
        { target: 'task', id: 't_run', field: 'rename', text: 'Jog' },
        { target: 'task', id: 't_read', field: 'rename', text: 'Read a book' },
      ]),
    );
    useTasks.getState().archiveTask('t_run');
    const applied = applyChanges(id);
    expect(applied?.message).toBe('1 changes applied');
    expect(named('t_read')).toBe('Read a book');

    const lone = await ask(reply([{ target: 'task', id: 't_read', field: 'rename', text: 'X' }]));
    useTasks.getState().archiveTask('t_read');
    expect(applyChanges(lone.id)).toBeNull();
    expect(cardOf(lone.id)?.status).toBe('pending');
  });

  it('a card with nothing applicable is said as its reason', async () => {
    const { card } = await ask(
      reply([{ target: 'task', id: 't_run', field: 'rename', text: 'Run' }], 'It is already Run.'),
    );
    expect(card).toBeUndefined();
    const last = useAi.getState().chat.at(-1)!;
    expect(last.role === 'model' && last.blocks).toEqual([
      { type: 'text', text: 'Sure.' },
      { type: 'text', text: 'It is already Run.' },
    ]);
  });

  it('its status survives a relaunch, and the next question tells the model what became of it', async () => {
    const { id } = await ask(
      reply([{ target: 'task', id: 't_run', field: 'rename', text: 'Jog' }]),
    );
    applyChanges(id);
    const blob = JSON.parse(
      JSON.stringify(useAi.persist.getOptions().partialize!(useAi.getState())),
    );
    const message = sanitizeAi(blob).chat.find((m) => m.id === id);
    const block =
      message?.role === 'model' ? message.blocks.find((b) => b.type === 'changes') : undefined;
    expect(block).toMatchObject({ type: 'changes', status: 'accepted' });

    answers.push(reply([{ target: 'task', id: 't_run', field: 'rename', text: 'Sprint' }]));
    await sendMessage('and now?');
    const body = JSON.parse(sent.at(-1)!);
    const turn = body.contents.at(-1).parts[0].text as string;
    expect(turn).toContain('task changes: APPLIED');
  });

  it('an Undo after New chat marks the filed card pending again', async () => {
    const { id } = await ask(
      reply([{ target: 'task', id: 't_run', field: 'rename', text: 'Jog' }]),
    );
    const applied = applyChanges(id)!;
    useAi.getState().clearChat();
    applied.undo();
    expect(named('t_run')).toBe('Run');
    const filed = useAi.getState().archive[0].messages.find((m) => m.id === id);
    const block =
      filed?.role === 'model' ? filed.blocks.find((b) => b.type === 'changes') : undefined;
    expect(block).toMatchObject({ status: 'pending' });
  });
});
