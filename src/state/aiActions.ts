/**
 * The assistant's side effects: testing a key, asking a question, applying a
 * suggestion — the only place the AI reads other stores and the network.
 *
 *   testKey        shape check → GET /models → POST hello → key into the keystore
 *   sendMessage    context from the stores → Gemini → validated blocks → the chat
 *   applyProposal  the next library, written through `libraryStore`, with an Undo
 *
 * It lives in `state/` for the reason `dataTransfer.ts` does: it touches several
 * stores and runs outside React, on a button. Every decision it makes is a call
 * into `lib/ai/` — which request, what the answer means, what the library
 * becomes — and this file is the plumbing between those and the stores.
 *
 * NOTHING HERE THROWS. Every path ends in a store write the chat can draw: an
 * answer, or a sentence with a "Try again" under it. A promise that rejected out
 * of here would reject into a button handler, and the button would do nothing.
 *
 * NOTHING IS WRITTEN WITHOUT A TAP. A proposal arrives in the chat as a card and
 * sits there; `applyProposal` is reached only from `Add to routines` or `Apply
 * changes`, on the card or on the review screen.
 */

import {
  buildExpensesContext,
  buildTasksContext,
  buildWorkoutContext,
  lastTopWeights,
} from '../lib/ai/aiContext';
import { systemPrompt } from '../lib/ai/aiPrompts';
import { normalizeProposal, planApply, type Library } from '../lib/ai/aiProposal';
import { validateBlocks, type AiSection } from '../lib/ai/aiSchema';
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
import { workoutNumbers } from '../lib/completedWorkout';
import { dayKey } from '../lib/days';
import { t } from '../lib/i18n';
import { seedUser } from '../data/seed';
import { useAi, type AiMessage, type ChatBlock } from './aiStore';
import { useDebriefs } from './debriefStore';
import { useLibrary } from './libraryStore';
import { useMoney } from './moneyStore';
import { useSettings } from './settingsStore';
import { useTasks } from './tasksStore';
import { useWorkoutHistory } from './workoutHistoryStore';

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

/** What one section's chat reads, and how much of it — for "Reading 91 workouts…". */
export function sectionContext(section: AiSection): {
  json: string;
  count: number;
  routineIds: Set<string>;
} {
  const language = lang();
  const today = dayKey(new Date());
  if (section === 'Workout') {
    const library = useLibrary.getState();
    const history = useWorkoutHistory.getState();
    const settings = useSettings.getState();
    const built = buildWorkoutContext({
      debriefs: useDebriefs.getState().debriefs,
      sequence: library.sequence,
      exercises: library.exercises,
      routines: library.routines,
      workouts: history.workouts,
      numbers: workoutNumbers(history.workouts, history.numbering),
      bodyweightKg: settings.bodyweightKg,
      unitSystem: settings.unitSystem,
      lang: language,
    });
    return {
      json: built.json,
      count: built.workoutCount,
      routineIds: new Set(library.routines.map((r) => r.id)),
    };
  }
  if (section === 'Tasks') {
    const { tasks, log } = useTasks.getState();
    const built = buildTasksContext({ tasks, log, today, lang: language });
    return { json: built.json, count: built.dayCount, routineIds: new Set() };
  }
  const money = useMoney.getState();
  const built = buildExpensesContext({
    amounts: money.amounts,
    categories: money.categories,
    accounts: money.accounts,
    currency: useSettings.getState().currencyCode,
    today,
    lang: language,
  });
  return { json: built.json, count: built.monthCount, routineIds: new Set() };
}

/* ------------------------------------------------------------------ */
/* A chat turn                                                         */
/* ------------------------------------------------------------------ */

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

function fail(section: AiSection, text: string, retry: string, asked = () => true): void {
  if (!asked()) return;
  useAi.getState().appendMessage(section, {
    id: nextId('err'),
    role: 'error',
    text,
    retry,
    at: new Date().toISOString(),
  });
}

/**
 * Ask one question in one section's chat.
 *
 * `retryOf` is the id of an error message being retried: it is removed, and the
 * user's question — already in the chat above it — is not appended a second time.
 */
export async function sendMessage(
  section: AiSection,
  text: string,
  retryOf?: string,
): Promise<void> {
  const question = text.trim();
  const store = useAi.getState();
  if (question === '' || store.pending[section]) return;
  const language = lang();

  if (retryOf) store.removeMessage(section, retryOf);
  // Everything before THIS question is the history it travels with.
  const earlier = useAi.getState().chats[section];
  const history = historyOf(
    retryOf && earlier[earlier.length - 1]?.role === 'user' ? earlier.slice(0, -1) : earlier,
  );
  /** The question this answer belongs under — gone means the chat was cleared. */
  let anchorId: string | undefined;
  if (!retryOf) {
    anchorId = nextId('msg');
    store.appendMessage(section, {
      id: anchorId,
      role: 'user',
      text: question,
      at: new Date().toISOString(),
    });
  } else {
    const before = useAi.getState().chats[section];
    const last = before[before.length - 1];
    if (last?.role === 'user') anchorId = last.id;
  }
  const stillAsked = () =>
    anchorId === undefined || useAi.getState().chats[section].some((m) => m.id === anchorId);

  store.setPending(section, true);
  try {
    const key = await getKey();
    if (!key || useAi.getState().status !== 'ready') {
      fail(
        section,
        t('Connect a Google AI key in Settings first.', language),
        question,
        stillAsked,
      );
      return;
    }

    const context = sectionContext(section);
    const chosen = useAi.getState().model;
    const request = (model: string, userText = question) =>
      buildChatRequest({
        key,
        model,
        systemPrompt: systemPrompt(section, language),
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
      useAi.getState().setRetrying(section, true);
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
      fail(section, mapTransportFailure(result.kind, language), question, stillAsked);
      return;
    }
    if (result.status !== 200) {
      fail(section, mapError(result.status, result.body, model, language), question, stillAsked);
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
      const blocks = parsed.ok
        ? validateBlocks(parsed.json, { section, routineIds: context.routineIds })
        : [];
      return { parsed, blocks };
    };
    let { parsed, blocks } = read(result.body);
    const unreadable =
      (!parsed.ok && parsed.reason === 'shape') || (parsed.ok && blocks.length === 0);
    if (unreadable && stillAsked()) {
      const again = await send(request(model, `${question}\n\n${REPAIR_NOTE}`), CHAT_TIMEOUT_MS);
      if (again.kind === 'response' && again.status === 200) {
        const second = read(again.body);
        if (second.parsed.ok && second.blocks.length > 0) ({ parsed, blocks } = second);
      }
    }
    if (!parsed.ok) {
      fail(section, mapParseFailure(parsed.reason, language), question, stillAsked);
      return;
    }

    /* A proposal becomes a stored, editable record, and the chat keeps its id. */
    const library = useLibrary.getState();
    const chatBlocks: ChatBlock[] = [];
    for (const block of blocks) {
      if (block.type !== 'routine_proposal') {
        chatBlocks.push(block);
        continue;
      }
      const review = normalizeProposal(block.proposal, {
        exercises: library.exercises,
        routines: library.routines,
        lastWeights: lastTopWeights(useWorkoutHistory.getState().workouts),
      });
      if (!review) {
        // Nothing left to apply once matched against the library — its reason
        // is still worth saying.
        chatBlocks.push({ type: 'text', text: block.proposal.why });
        continue;
      }
      const proposalId = nextId('prop');
      useAi.getState().putProposal(proposalId, review);
      chatBlocks.push({ type: 'proposal', proposalId });
    }
    if (chatBlocks.length === 0) {
      fail(section, mapParseFailure('shape', language), question, stillAsked);
      return;
    }
    if (!stillAsked()) return;
    useAi.getState().appendMessage(section, {
      id: nextId('ans'),
      role: 'model',
      blocks: chatBlocks,
      raw: parsed.raw,
      at: new Date().toISOString(),
    });
  } catch {
    // Belt and braces: every call above resolves, but a chat that stays
    // "typing" forever is the one failure this file exists to rule out.
    fail(section, mapTransportFailure('network', language), question, stillAsked);
  } finally {
    useAi.getState().setPending(section, false);
  }
}

/* ------------------------------------------------------------------ */
/* Deciding a proposal                                                 */
/* ------------------------------------------------------------------ */

export interface Applied {
  /** `Added Legs + Core to routines` / `Updated Push`. */
  message: string;
  undo: () => void;
}

/**
 * `Add to routines` / `Apply changes`. Null when there is nothing to apply it to
 * — the routine an edit targets was deleted since, or every row was removed.
 */
export function applyProposal(id: string): Applied | null {
  const stored = useAi.getState().proposals[id];
  if (!stored || stored.status !== 'pending') return null;
  const library = useLibrary.getState();
  const snapshot: Library = { exercises: library.exercises, routines: library.routines };
  const next = planApply(stored.proposal, snapshot, { ownerId: seedUser.id });
  if (!next) return null;

  library.replaceLibrary({ exercises: next.exercises, routines: next.routines });
  useAi.getState().setProposalStatus(id, 'accepted');
  const isNew = stored.proposal.kind === 'new';
  if (isNew) useAi.getState().markRoutineAi(next.routineId);

  const language = lang();
  return {
    message: isNew
      ? t('Added {name} to routines', language, { name: next.routineName })
      : t('Updated {name}', language, { name: next.routineName }),
    undo: () => {
      useLibrary.getState().replaceLibrary(snapshot);
      useAi.getState().setProposalStatus(id, 'pending');
      if (isNew) useAi.getState().markRoutineSeen(next.routineId);
    },
  };
}

export function discardProposal(id: string): void {
  const stored = useAi.getState().proposals[id];
  if (stored?.status === 'pending') useAi.getState().setProposalStatus(id, 'discarded');
}
