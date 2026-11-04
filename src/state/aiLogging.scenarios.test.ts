import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * THE LOGGING CARD, END TO END — "mark reading done for yesterday".
 *
 * The same harness as `aiChangesScenarios.test.ts`: `fetch` is a queue of
 * scripted Gemini replies and everything else is the real path — `sendMessage`
 * validating the block against the tasks, `applyChanges` writing through the
 * store's own actions, and the one Undo. What is different about a day answer
 * is that it ADDS a log entry rather than tune a value, so the Undo cannot be
 * "write the old value back": it has to restore exactly the day entry it
 * overwrote (a note included), and leave no empty entry where there was none.
 */
let storedKey: string | null = null;
vi.mock('../lib/ai/secureKey', () => ({
  getKey: async () => storedKey,
  setKey: async () => true,
  clearKey: async () => {
    storedKey = null;
  },
}));

import { applyChanges, sendMessage } from './aiActions';
import { sanitizeAi, useAi, type ChangesChatBlock } from './aiStore';
import { useSettings } from './settingsStore';
import { useTasks } from './tasksStore';
import { dayKey } from '../lib/days';
import type { Task } from '../lib/tasks';

/* ------------------------------------------------------------------ */
/* The user's things                                                   */
/* ------------------------------------------------------------------ */

const TODAY = dayKey(new Date());
const YESTERDAY = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dayKey(d);
})();
const TOMORROW = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return dayKey(d);
})();

const task = (id: string, name: string, order: number, over: Partial<Task> = {}): Task => ({
  id,
  name,
  schedule: { kind: 'daily' },
  auto: null,
  startedOn: '2026-01-01',
  reminder: null,
  archivedAt: null,
  order,
  ...over,
});
const TASKS: Task[] = [
  task('t_read', 'Read', 0, { target: { count: 20, unit: 'pages' } }),
  task('t_stretch', 'Stretch', 1),
  task('t_floss', 'Floss', 2),
];

/* ------------------------------------------------------------------ */
/* Scripted Gemini                                                     */
/* ------------------------------------------------------------------ */

type Answer = { status: number; body: unknown };
let answers: Answer[] = [];

function reply(items: unknown[], why = 'Logged.'): Answer {
  const blocks = [
    { type: 'text', text: 'Sure.' },
    { type: 'changes_proposal', changes: { items, why } },
  ];
  return {
    status: 200,
    body: { candidates: [{ content: { parts: [{ text: JSON.stringify({ blocks }) }] } }] },
  };
}

async function ask(answer: Answer): Promise<{ id: string; card: ChangesChatBlock | undefined }> {
  answers.push(answer);
  await sendMessage('log this');
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

/** Everything a logging card can touch, as plain data. */
function snapshot() {
  return JSON.parse(
    JSON.stringify({ tasks: useTasks.getState().tasks, log: useTasks.getState().log }),
  );
}

beforeEach(() => {
  storedKey = 'AIzaSyTESTKEY-1234567890abcdef';
  answers = [];
  useAi.setState({ ...sanitizeAi({}), pending: false, retrying: false });
  useAi.getState().markReady(500);
  useSettings.getState().resetToDefaults();
  useSettings.getState().setLanguage('en');
  useTasks.setState({ tasks: TASKS, log: {} });
  vi.stubGlobal('fetch', async () => {
    const next = answers.shift();
    if (!next) throw new TypeError('Network request failed');
    return { status: next.status, text: async () => JSON.stringify(next.body) };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ------------------------------------------------------------------ */
/* Days — the tasks log                                                */
/* ------------------------------------------------------------------ */

describe('a day answered on a Tasks card', () => {
  it('draws each day as its own row, and refuses a day not yet asked', async () => {
    const { card } = await ask(
      reply([
        { target: 'task', id: 't_stretch', field: 'tick', day: YESTERDAY },
        { target: 'task', id: 't_stretch', field: 'done' },
        { target: 'task', id: 't_floss', field: 'skip', day: TODAY },
        { target: 'task', id: 't_floss', field: 'done', day: TOMORROW },
        { target: 'task', id: 't_gone', field: 'done' },
      ]),
    );
    expect(card?.changes).toEqual([
      { target: 'task', id: 't_stretch', field: 'done', value: null, day: YESTERDAY },
      { target: 'task', id: 't_stretch', field: 'done', value: null, day: TODAY },
      { target: 'task', id: 't_floss', field: 'excused', value: null, day: TODAY },
    ]);
    expect(card?.rows.map((r) => [r.subject, r.to])).toEqual([
      ['Stretch', 'Done'],
      ['Stretch', 'Done'],
      ['Floss', 'Excused'],
    ]);
  });

  it('done, excused and clear write the day; a counted task is filled to its target; Undo restores every entry exactly, notes included', async () => {
    const tasks = useTasks.getState();
    tasks.setNote('t_stretch', YESTERDAY, 'sore back');
    tasks.setCount('t_read', TODAY, 5);
    tasks.setNote('t_read', TODAY, 'chapter 3');
    tasks.setMark('t_floss', TODAY, 'done');
    tasks.setNote('t_floss', TODAY, 'mint');
    const before = snapshot();

    const { id } = await ask(
      reply([
        { target: 'task', id: 't_stretch', field: 'done', day: YESTERDAY },
        { target: 'task', id: 't_read', field: 'done' },
        { target: 'task', id: 't_floss', field: 'clear' },
        { target: 'task', id: 't_floss', field: 'excused', day: YESTERDAY },
      ]),
    );
    const applied = applyChanges(id)!;
    expect(applied.message).toBe('4 changes applied');

    const log = useTasks.getState().log;
    expect(log.t_stretch[YESTERDAY]).toEqual({ mark: 'done', note: 'sore back' });
    expect(log.t_read[TODAY]).toEqual({ mark: 'done', note: 'chapter 3', count: 20 });
    // Cleared — but the note is the user's, not the answer, so it stays.
    expect(log.t_floss[TODAY]).toEqual({ mark: null, note: 'mint' });
    expect(log.t_floss[YESTERDAY]).toEqual({ mark: 'missed', note: '' });

    applied.undo();
    expect(snapshot()).toEqual(before);
    expect(cardOf(id)?.status).toBe('pending');
  });

  it('a counted day cleared drops its parts; Undo gives them back', async () => {
    useTasks.getState().setCount('t_read', YESTERDAY, 12);
    const before = snapshot();
    const { id } = await ask(
      reply([{ target: 'task', id: 't_read', field: 'untick', day: YESTERDAY }]),
    );
    const applied = applyChanges(id)!;
    expect(useTasks.getState().log.t_read?.[YESTERDAY]).toBeUndefined();
    applied.undo();
    expect(snapshot()).toEqual(before);
    expect(useTasks.getState().log.t_read[YESTERDAY]).toEqual({ mark: null, note: '', count: 12 });
  });

  it('a day that had no entry leaves no empty entry behind after Undo', async () => {
    const { id } = await ask(
      reply([{ target: 'task', id: 't_stretch', field: 'done', day: YESTERDAY }]),
    );
    const applied = applyChanges(id)!;
    applied.undo();
    expect(useTasks.getState().log).toEqual({});
  });

  it('a task archived since the answer is skipped; with nothing left, nothing is applied', async () => {
    const { id } = await ask(
      reply([
        { target: 'task', id: 't_stretch', field: 'done' },
        { target: 'task', id: 't_floss', field: 'done' },
      ]),
    );
    useTasks.getState().archiveTask('t_floss');
    const applied = applyChanges(id)!;
    expect(applied.message).toBe('1 changes applied');
    expect(useTasks.getState().log.t_floss).toBeUndefined();

    const lone = await ask(reply([{ target: 'task', id: 't_read', field: 'done' }]));
    useTasks.getState().archiveTask('t_read');
    const log = useTasks.getState().log;
    expect(applyChanges(lone.id)).toBeNull();
    expect(useTasks.getState().log).toEqual(log);
    expect(cardOf(lone.id)?.status).toBe('pending');
  });

  it('mixed with a rename and a new task: one Undo restores the list and the log', async () => {
    useTasks.getState().setMark('t_floss', YESTERDAY, 'done');
    const before = snapshot();
    const { id } = await ask(
      reply([
        { target: 'task', id: 't_stretch', field: 'rename', text: 'Stretch 10 min' },
        { target: 'task', id: 't_stretch', field: 'done' },
        { target: 'task', field: 'add', text: 'Meditate' },
        { target: 'task', id: 't_floss', field: 'clear', day: YESTERDAY },
        // A 3.0.0 Workout weigh-in is not something this chat can log.
        { target: 'bodyweight', field: 'log', number: 81 },
      ]),
    );
    const applied = applyChanges(id)!;
    expect(applied.message).toBe('4 changes applied');
    const state = useTasks.getState();
    expect(state.tasks.find((x) => x.id === 't_stretch')?.name).toBe('Stretch 10 min');
    expect(state.tasks.some((x) => x.name === 'Meditate')).toBe(true);
    expect(state.log.t_stretch?.[TODAY]?.mark).toBe('done');
    expect(state.log.t_floss).toBeUndefined();

    applied.undo();
    expect(snapshot()).toEqual(before);
  });
});
