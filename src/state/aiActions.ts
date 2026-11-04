/**
 * The assistant's side effects: testing a key, asking a question, applying a
 * suggestion — the only place the AI reads other stores and the network.
 *
 *   testKey        shape check → GET /models → POST hello → key into the keystore
 *   sendMessage    context from the tasks → Gemini → validated blocks → the chat
 *   applyChanges   a changes card, written through the tasks store's own
 *                  actions, with one Undo
 *
 * It lives in `state/` for the reason `dataTransfer.ts` does: it touches several
 * stores and runs outside React, on a button. Every decision it makes is a call
 * into `lib/ai/` — which request, what the answer means, what a change is —
 * and this file is the plumbing between those and the stores.
 *
 * NOTHING HERE THROWS. Every path ends in a store write the chat can draw: an
 * answer, or a sentence with a "Try again" under it. A promise that rejected out
 * of here would reject into a button handler, and the button would do nothing.
 *
 * NOTHING IS WRITTEN WITHOUT A TAP. A suggestion arrives in the chat as a card
 * and sits there; `applyChanges` is reached only from `Apply changes`.
 */

import { buildTasksContext } from '../lib/ai/aiContext';
import {
  describeChanges,
  validateChanges,
  type AiChange,
  type ChangeContext,
  type CurrentValues,
} from '../lib/ai/aiChanges';
import { suggestionNote, systemPrompt, type SuggestionFate } from '../lib/ai/aiPrompts';
import { validateBlocks } from '../lib/ai/aiSchema';
import {
  CHAT_TIMEOUT_MS,
  FALLBACK_MODEL,
  RETRY_DELAYS_MS,
  TEST_TIMEOUT_MS,
  buildChatRequest,
  buildHelloRequest,
  buildListRequest,
  checkKeyShape,
  isRetryable,
  mapError,
  mapParseFailure,
  mapTransportFailure,
  parseChatResponse,
  parseModelList,
  wantsFallback,
  type HistoryTurn,
} from '../lib/ai/gemini';
import { clearKey, getKey, setKey } from '../lib/ai/secureKey';
import { send } from '../lib/ai/transport';
import { dayKey, monthNames } from '../lib/days';
import type { TaskEntry } from '../lib/tasks';
import type { ID } from '../types/models';
import { t } from '../lib/i18n';
import { useAi, type AiMessage, type ChatBlock } from './aiStore';
import { useSettings } from './settingsStore';
import { useTasks } from './tasksStore';

const lang = () => useSettings.getState().language;

/** Appended to the question on the one re-ask after an unreadable reply. */
const REPAIR_NOTE =
  '(Your previous reply could not be read. Answer the question above again, replying ONLY with JSON of the form {"blocks":[{"type":"text","text":"..."}]} using the block types from your instructions. No prose outside the JSON.)';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let idSeed = 0;
function nextId(prefix: string): string {
  idSeed += 1;
  return `${prefix}_${Date.now().toString(36)}_${idSeed}`;
}

/* ------------------------------------------------------------------ */
/* The key test                                                        */
/* ------------------------------------------------------------------ */

/**
 * `transient` marks a failure that says nothing about the KEY — offline, a
 * timeout. The settings screen reads it to leave a working connection working.
 */
export type TestResult =
  { ok: true; latencyMs: number } | { ok: false; error: string; transient?: boolean };

/**
 * Test a key the user typed, step by step, and store it only if it passed.
 *
 * `onStep(n)` fires as each of the three visible steps completes, so the overlay
 * ticks them off as they happen rather than on a timer. The minimum time the
 * overlay stays up is the SCREEN's business, not this function's: a test that
 * padded itself would report a latency it did not have.
 */
export async function testKey(key: string, onStep: (done: 1 | 2 | 3) => void): Promise<TestResult> {
  const language = lang();
  const shape = checkKeyShape(key, language);
  if (shape) return { ok: false, error: shape };
  const model = useAi.getState().model;
  const trimmed = key.trim();
  const started = Date.now();

  const listed = await send(buildListRequest(trimmed), TEST_TIMEOUT_MS);
  if (listed.kind !== 'response') {
    return { ok: false, error: mapTransportFailure(listed.kind, language), transient: true };
  }
  onStep(1);
  if (listed.status !== 200) {
    return { ok: false, error: mapError(listed.status, listed.body, model, language) };
  }
  onStep(2);

  const hello = await send(buildHelloRequest(trimmed, model), TEST_TIMEOUT_MS);
  if (hello.kind !== 'response') {
    return { ok: false, error: mapTransportFailure(hello.kind, language), transient: true };
  }
  if (hello.status !== 200) {
    return { ok: false, error: mapError(hello.status, hello.body, model, language) };
  }
  onStep(3);

  const latencyMs = Date.now() - started;
  if (!(await setKey(trimmed))) {
    return { ok: false, error: t('The key works, but this phone could not store it.', language) };
  }
  return { ok: true, latencyMs };
}

/** The models this key can chat with, for the picker. Empty on any failure. */
export async function listModels(): Promise<string[]> {
  const key = await getKey();
  if (!key) return [];
  const result = await send(buildListRequest(key, 100), TEST_TIMEOUT_MS);
  if (result.kind !== 'response' || result.status !== 200) return [];
  return parseModelList(result.body);
}

/** `Disconnect`: the key leaves the keystore and the status goes off. Chats stay. */
export async function disconnect(): Promise<void> {
  await clearKey();
  useAi.getState().markOff();
}

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

/**
 * What the chat reads, and how much of it — for "Reading 41 days…".
 */
export function chatContext(): { json: string; count: number } {
  const { tasks, log } = useTasks.getState();
  const built = buildTasksContext({ tasks, log, today: dayKey(new Date()), lang: lang() });
  return { json: built.json, count: built.dayCount };
}

/* ------------------------------------------------------------------ */
/* A chat turn                                                         */
/* ------------------------------------------------------------------ */

/** Each suggestion the chat made, oldest first, and whether it was applied. */
function fatesOf(messages: readonly AiMessage[]): SuggestionFate[] {
  const fates: SuggestionFate[] = [];
  for (const message of messages) {
    if (message.role !== 'model') continue;
    for (const block of message.blocks) {
      if (block.type === 'changes') fates.push({ status: block.status });
    }
  }
  return fates;
}

/** The chat so far, as Gemini wants it: user text, and the model's own JSON back. */
function historyOf(messages: readonly AiMessage[]): HistoryTurn[] {
  const turns: HistoryTurn[] = [];
  for (const message of messages) {
    if (message.role === 'user') turns.push({ role: 'user', text: message.text });
    else if (message.role === 'model' && message.raw)
      turns.push({ role: 'model', text: message.raw });
  }
  return turns;
}

function fail(text: string, retry: string, asked = () => true): void {
  if (!asked()) return;
  useAi.getState().appendMessage({
    id: nextId('err'),
    role: 'error',
    text,
    retry,
    at: new Date().toISOString(),
  });
}

/**
 * Ask one question in the chat.
 *
 * `retryOf` is the id of an error message being retried: it is removed, and the
 * user's question — already in the chat above it — is not appended a second time.
 */
export async function sendMessage(text: string, retryOf?: string): Promise<void> {
  const question = text.trim();
  const store = useAi.getState();
  if (question === '' || store.pending) return;
  const language = lang();

  if (retryOf) store.removeMessage(retryOf);
  // Everything before THIS question is the history it travels with.
  const earlier = useAi.getState().chat;
  const history = historyOf(
    retryOf && earlier[earlier.length - 1]?.role === 'user' ? earlier.slice(0, -1) : earlier,
  );
  /** The question this answer belongs under — gone means the chat was cleared. */
  let anchorId: string | undefined;
  if (!retryOf) {
    anchorId = nextId('msg');
    store.appendMessage({
      id: anchorId,
      role: 'user',
      text: question,
      at: new Date().toISOString(),
    });
  } else {
    const before = useAi.getState().chat;
    const last = before[before.length - 1];
    if (last?.role === 'user') anchorId = last.id;
  }
  const stillAsked = () =>
    anchorId === undefined || useAi.getState().chat.some((m) => m.id === anchorId);

  store.setPending(true);
  try {
    const key = await getKey();
    if (!key || useAi.getState().status !== 'ready') {
      fail(t('Connect a Google AI key in Settings first.', language), question, stillAsked);
      return;
    }

    const context = chatContext();
    const chosen = useAi.getState().model;
    // Read now, not when the question was typed: Apply may have been pressed since.
    const note = suggestionNote(fatesOf(earlier));
    const asked = note ? `${note}\n\n${question}` : question;
    const request = (model: string, userText = asked) =>
      buildChatRequest({
        key,
        model,
        systemPrompt: systemPrompt(language),
        context: context.json,
        history,
        userText,
      });

    /*
     * Google's bad moments are retried before anything is said — see
     * `RETRY_DELAYS_MS`. The chosen model twice more with a growing pause, then
     * once on the fallback model; the answer that comes back is shown exactly as
     * if the first try had worked.
     */
    let model = chosen;
    let result = await send(request(model), CHAT_TIMEOUT_MS);
    for (const [attempt, delay] of RETRY_DELAYS_MS.entries()) {
      if (!isRetryable(result) || !stillAsked()) break;
      // A timeout is retried once: two more 30-second waits is a minute of
      // "typing" for an answer that is probably not coming.
      if (result.kind === 'timeout' && attempt > 0) break;
      useAi.getState().setRetrying(true);
      await wait(delay);
      result = await send(request(model), CHAT_TIMEOUT_MS);
    }
    if (wantsFallback(result, model) && stillAsked()) {
      model = FALLBACK_MODEL;
      const second = await send(request(model), CHAT_TIMEOUT_MS);
      // A fallback that does not exist for this key is not news: the user is
      // told about THEIR model's failure, not about one they never picked.
      if (second.kind === 'response' && second.status === 200) result = second;
      else model = chosen;
    }
    if (result.kind !== 'response') {
      fail(mapTransportFailure(result.kind, language), question, stillAsked);
      return;
    }
    if (result.status !== 200) {
      fail(mapError(result.status, result.body, model, language), question, stillAsked);
      return;
    }

    /*
     * Read it — and if nothing in it can be drawn, ask ONCE more with the
     * format spelled out. The validator already reads every near-miss it can
     * (`validateBlocks`), so what reaches this second ask is a reply that was
     * genuinely off the schema, and a model told exactly what went wrong almost
     * always gets it right the second time. Only then does the chat say it
     * could not read the answer.
     */
    const read = (body: unknown) => {
      const parsed = parseChatResponse(body);
      const blocks = parsed.ok ? validateBlocks(parsed.json) : [];
      return { parsed, blocks };
    };
    let { parsed, blocks } = read(result.body);
    const unreadable =
      (!parsed.ok && parsed.reason === 'shape') || (parsed.ok && blocks.length === 0);
    if (unreadable && stillAsked()) {
      const again = await send(request(model, `${asked}\n\n${REPAIR_NOTE}`), CHAT_TIMEOUT_MS);
      if (again.kind === 'response' && again.status === 200) {
        const second = read(again.body);
        if (second.parsed.ok && second.blocks.length > 0) ({ parsed, blocks } = second);
      }
    }
    if (!parsed.ok) {
      fail(mapParseFailure(parsed.reason, language), question, stillAsked);
      return;
    }

    const chatBlocks: ChatBlock[] = [];
    for (const block of blocks) {
      if (block.type !== 'changes_proposal') {
        chatBlocks.push(block);
        continue;
      }
      // Checked against the tasks NOW, and the card's `from` read now too.
      const changes = validateChanges(block.changes.items, changeContext());
      const rows = describeChanges(changes, currentValues(), language);
      if (rows.length > 0) {
        chatBlocks.push({
          type: 'changes',
          changes,
          rows,
          why: block.changes.why,
          status: 'pending',
        });
      } else if (block.changes.why) {
        // Nothing it named could be applied; its reason is still the answer.
        chatBlocks.push({ type: 'text', text: block.changes.why });
      }
    }
    if (chatBlocks.length === 0) {
      fail(mapParseFailure('shape', language), question, stillAsked);
      return;
    }
    if (!stillAsked()) return;
    useAi.getState().appendMessage({
      id: nextId('ans'),
      role: 'model',
      blocks: chatBlocks,
      raw: parsed.raw,
      at: new Date().toISOString(),
    });
  } catch {
    // Belt and braces: every call above resolves, but a chat that stays
    // "typing" forever is the one failure this file exists to rule out.
    fail(mapTransportFailure('network', language), question, stillAsked);
  } finally {
    useAi.getState().setPending(false);
  }
}

/* ------------------------------------------------------------------ */
/* Deciding a changes card                                             */
/* ------------------------------------------------------------------ */

export interface Applied {
  /** `3 changes applied`. */
  message: string;
  undo: () => void;
}

/** What `validateChanges` checks ids against. */
function changeContext(): ChangeContext {
  return { tasks: useTasks.getState().tasks, today: dayKey(new Date()) };
}

/** `2026-10-27` → `27 Oct`, the card's date. */
function formatDay(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  const month = monthNames(lang())[m - 1] ?? '';
  return `${d} ${month.slice(0, 3)}`;
}

/** The values in force, for the card's `from`. */
function currentValues(): CurrentValues {
  return { tasks: useTasks.getState().tasks, formatDay };
}

/**
 * `Apply changes` on a card: every change, through the tasks store's own
 * actions, and ONE Undo that puts the task list and every answered day back as
 * they were.
 *
 * Null when there is nothing to apply — the card is gone, already decided, or
 * everything it named has been deleted since. Each change is re-checked against
 * the store as it is NOW: a task deleted between the answer and the tap is
 * skipped rather than resurrected.
 */
export function applyChanges(messageId: string): Applied | null {
  const message = useAi.getState().chat.find((m) => m.id === messageId);
  const block =
    message?.role === 'model' ? message.blocks.find((b) => b.type === 'changes') : undefined;
  if (!block || block.type !== 'changes' || block.status !== 'pending') return null;

  const before = useTasks.getState().tasks;
  /* The days the card answered, filled in as they apply, so the Undo puts back
     exactly those days. */
  const written: Written = { taskDays: [] };
  let applied = 0;
  for (const change of block.changes) {
    if (applyOne(change, written)) applied += 1;
  }
  if (applied === 0) return null;
  useAi.getState().setChangesStatus(messageId, 'accepted');

  return {
    message: t('{n} changes applied', lang(), { n: applied }),
    undo: () => {
      useTasks.getState().restoreTaskList(before);
      // Newest first, so a day written twice ends on what it said before either.
      for (const { id, day, before: entry } of [...written.taskDays].reverse()) {
        useTasks.getState().restoreEntry(id, day, entry ?? { mark: null, note: '' });
      }
      useAi.getState().setChangesStatus(messageId, 'pending');
    },
  };
}

/** What the day answers wrote, for the Undo. */
interface Written {
  taskDays: { id: ID; day: string; before: TaskEntry | undefined }[];
}

/** One change, through the tasks store. False when its task is gone. */
function applyOne(change: AiChange, written: Written): boolean {
  const tasks = useTasks.getState();
  if (change.day) {
    const task = tasks.tasks.find((x) => x.id === change.id && x.archivedAt === null);
    if (!task) return false;
    written.taskDays.push({
      id: task.id,
      day: change.day,
      before: tasks.log[task.id]?.[change.day],
    });
    if (change.field === 'excused') tasks.setMark(task.id, change.day, 'missed');
    else if (change.field === 'clear') {
      if (task.target) tasks.setCount(task.id, change.day, 0);
      tasks.setMark(task.id, change.day, null);
    }
    // A counted task is done when its count reaches the target — as its row does it.
    else if (task.target) tasks.setCount(task.id, change.day, task.target.count);
    else tasks.setMark(task.id, change.day, 'done');
    return true;
  }
  if (change.field === 'add') {
    return (
      tasks.addTask({
        name: String(change.value),
        schedule: change.schedule ?? { kind: 'daily' },
      }) != null
    );
  }
  const task = tasks.tasks.find((x) => x.id === change.id && x.archivedAt === null);
  if (!task) return false;
  if (change.field === 'name') tasks.updateTask(task.id, { name: String(change.value) });
  else if (change.field === 'schedule' && change.schedule) {
    tasks.updateTask(task.id, { schedule: change.schedule });
  } else if (change.field === 'target') {
    tasks.updateTask(task.id, {
      target:
        change.value == null ? null : { count: Number(change.value), unit: change.unit ?? '' },
    });
  } else if (change.field === 'archive') tasks.archiveTask(task.id);
  else return false;
  return true;
}

export function discardChanges(messageId: string): void {
  useAi.getState().setChangesStatus(messageId, 'discarded');
}
