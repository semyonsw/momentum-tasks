/**
 * The assistant's side effects: testing a key, asking a question, applying a
 * suggestion — the only place the AI reads other stores and the network.
 *
 *   testKey        shape check → GET /models → POST hello → key into the keystore
 *   sendMessage    context from the stores → Gemini → validated blocks → the chat
 *   applyProposal  the next library, written through `libraryStore`, with an Undo
 *   applyChanges   a settings card — exercises, app settings, tasks, budgets —
 *                  written through each store's own actions, with one Undo
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
 *
 * NOTHING IS WRITTEN OUTSIDE THIS APP'S LOG. Each APK is one section since 3.0.0
 * (`lib/appVariant.ts`), and the Workout app's store still holds the tasks and
 * the money from 2.x — kept for the backup, never shown. Every entry point that
 * asks or writes takes the app's variant (defaulting to the build's) and does
 * nothing for a section that app's assistant does not serve (`aiScope.ts`), and
 * every change is checked against it once more as it is written. The parameter
 * is there so the tests can be each of the three apps; the screens never pass it.
 */

import {
  buildExpensesContext,
  buildTasksContext,
  buildWorkoutContext,
  expensesBrief,
  nextStartWeights,
  tasksBrief,
  withBriefs,
  workoutBrief,
} from '../lib/ai/aiContext';
import { aiServes, briefedSections } from '../lib/ai/aiScope';
import {
  applyExerciseChange,
  changeSection,
  describeChanges,
  validateChanges,
  type AiChange,
  type ChangeContext,
  type CurrentValues,
} from '../lib/ai/aiChanges';
import { suggestionNote, systemPrompt, type SuggestionFate } from '../lib/ai/aiPrompts';
import { normalizeProposal, planApply, type Library } from '../lib/ai/aiProposal';
import { validateBlocks, type AiSection } from '../lib/ai/aiSchema';
import { APP_VARIANT, type AppVariant } from '../lib/appVariant';
import { keepSteps } from '../lib/ai/sequenceCursor';
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
import { formatMoney, isTransferCategory } from '../lib/money';
import { dayKey, monthNames } from '../lib/days';
import type { CompletedWorkout } from '../lib/completedWorkout';
import type { TaskEntry } from '../lib/tasks';
import type { ID } from '../types/models';
import { t } from '../lib/i18n';
import { seedUser } from '../data/seed';
import { useActiveWorkout } from './activeWorkoutStore';
import { useAi, type AiMessage, type ChatBlock } from './aiStore';
import { setRestBetweenExercises, setRestBetweenSets } from './restSync';
import { useDebriefs } from './debriefStore';
import { useLibrary } from './libraryStore';
import { useMoney } from './moneyStore';
import { logIsEmpty, moneyScale } from '../lib/moneyUnits';
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

/**
 * What one section's chat reads, and how much of it — for "Reading 91 workouts…".
 *
 * The section's own log, and other sections only as `briefedSections` allows —
 * which since the split is none (`aiScope.ts` has the why).
 */
export function sectionContext(
  section: AiSection,
  variant: AppVariant = APP_VARIANT,
): {
  json: string;
  count: number;
  routineIds: Set<string>;
  /** The same routines' names — an edit naming its routine still finds it. */
  routineNames?: Map<string, string>;
} {
  const language = lang();
  const today = dayKey(new Date());
  const library = useLibrary.getState();
  const history = useWorkoutHistory.getState();
  const settings = useSettings.getState();
  const { tasks, log } = useTasks.getState();
  const money = useMoney.getState();
  /* What `1250` means in this log — see `lib/moneyUnits.ts`. */
  const moneyScaleNow = moneyScale({
    pinned: money.scale,
    empty: logIsEmpty(money.amounts, money.accounts),
    currency: settings.currencyCode,
  });
  const routineIds = new Set(library.routines.map((r) => r.id));

  /* What other sections look like, briefly — see `withBriefs`. Only those
     `briefedSections` names are built: none, in every app since the split. */
  const briefs = {
    Workout: () =>
      workoutBrief({
        workouts: history.workouts,
        routines: library.routines,
        sequence: library.sequence,
      }),
    Tasks: () => tasksBrief({ tasks, log, today }),
    Expenses: () =>
      expensesBrief({
        amounts: money.amounts,
        categories: money.categories,
        accounts: money.accounts,
        currency: settings.currencyCode,
        scale: moneyScaleNow,
        today,
      }),
  };
  const others = (asked: AiSection) =>
    Object.fromEntries(
      briefedSections(variant, asked)
        .filter((s) => s !== asked)
        .map((s) => [s.toLowerCase(), briefs[s]()]),
    );
  /* No briefs is no `otherSections` key at all, rather than an empty one the
     model would read as "the other logs are empty". */
  const brief = (json: string, asked: AiSection) => {
    const extra = others(asked);
    return Object.keys(extra).length > 0 ? withBriefs(json, extra) : json;
  };

  if (section === 'Workout') {
    const built = buildWorkoutContext({
      debriefs: useDebriefs.getState().debriefs,
      sequence: library.sequence,
      bodyweightLog: settings.bodyweightLog,
      exercises: library.exercises,
      routines: library.routines,
      workouts: history.workouts,
      numbers: workoutNumbers(history.workouts, history.numbering),
      bodyweightKg: settings.bodyweightKg,
      settings: {
        restSecondsBetweenSets: settings.restSecondsBetweenSets,
        restSecondsBetweenExercises: settings.restSecondsBetweenExercises,
        autoStartRest: settings.autoStartRest,
        weeklyWorkoutGoal: settings.weeklyWorkoutGoal,
      },
      unitSystem: settings.unitSystem,
      lang: language,
    });
    return {
      json: brief(built.json, 'Workout'),
      count: built.workoutCount,
      routineIds,
      routineNames: new Map(library.routines.map((r) => [r.id, r.name])),
    };
  }
  if (section === 'Tasks') {
    const built = buildTasksContext({ tasks, log, today, lang: language });
    return {
      json: brief(built.json, 'Tasks'),
      count: built.dayCount,
      routineIds: new Set(),
    };
  }
  const built = buildExpensesContext({
    amounts: money.amounts,
    categories: money.categories,
    accounts: money.accounts,
    currency: settings.currencyCode,
    scale: moneyScaleNow,
    budgets: money.budgets ?? [],
    today,
    lang: language,
  });
  return {
    json: brief(built.json, 'Expenses'),
    count: built.monthCount,
    routineIds: new Set(),
  };
}

/* ------------------------------------------------------------------ */
/* A chat turn                                                         */
/* ------------------------------------------------------------------ */

/** Each suggestion the chat made, oldest first, and whether it was applied. */
function fatesOf(messages: readonly AiMessage[]): SuggestionFate[] {
  const { proposals } = useAi.getState();
  const fates: SuggestionFate[] = [];
  for (const message of messages) {
    if (message.role !== 'model') continue;
    for (const block of message.blocks) {
      if (block.type === 'sequence') {
        fates.push({ what: 'loop', name: '', status: block.status });
      } else if (block.type === 'changes') {
        fates.push({ what: 'settings', name: '', status: block.status });
      } else if (block.type === 'proposal') {
        const stored = proposals[block.proposalId];
        if (stored) {
          fates.push({ what: 'routine', name: stored.proposal.name, status: stored.status });
        }
      }
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
 * A section this app's assistant does not serve is not asked at all.
 */
export async function sendMessage(
  section: AiSection,
  text: string,
  retryOf?: string,
  variant: AppVariant = APP_VARIANT,
): Promise<void> {
  const question = text.trim();
  const store = useAi.getState();
  if (!aiServes(variant, section) || question === '' || store.pending[section]) return;
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

    const context = sectionContext(section, variant);
    const chosen = useAi.getState().model;
    // Read now, not when the question was typed: Apply may have been pressed since.
    const note = suggestionNote(fatesOf(earlier));
    const asked = note ? `${note}\n\n${question}` : question;
    const request = (model: string, userText = asked) =>
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
        ? validateBlocks(parsed.json, {
            section,
            routineIds: context.routineIds,
            routineNames: context.routineNames,
          })
        : [];
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
      fail(section, mapParseFailure(parsed.reason, language), question, stillAsked);
      return;
    }

    /* A proposal becomes a stored, editable record, and the chat keeps its id. */
    const library = useLibrary.getState();
    const chatBlocks: ChatBlock[] = [];
    for (const block of blocks) {
      if (block.type === 'sequence_proposal') {
        chatBlocks.push({ type: 'sequence', ...block.sequence, status: 'pending' });
        continue;
      }
      if (block.type === 'changes_proposal') {
        // Checked against the stores NOW, and the card's `from` read now too.
        const changes = validateChanges(block.changes.items, changeContext(section));
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
        continue;
      }
      if (block.type !== 'routine_proposal') {
        chatBlocks.push(block);
        continue;
      }
      const review = normalizeProposal(block.proposal, {
        exercises: library.exercises,
        routines: library.routines,
        lastWeights: nextStartWeights(library.exercises, useWorkoutHistory.getState().workouts),
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
export function applyProposal(id: string, variant: AppVariant = APP_VARIANT): Applied | null {
  // A routine is the training log's: no other app's assistant writes one.
  if (!aiServes(variant, 'Workout')) return null;
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

/* ------------------------------------------------------------------ */
/* Deciding a suggested loop                                           */
/* ------------------------------------------------------------------ */

/**
 * `Apply loop`: the training sequence becomes the suggested one, switched on,
 * pointing at the step the suggestion named — with an Undo that puts the old
 * loop back exactly, cursor and on/off included. Null when there is nothing to
 * apply: the message is gone, it was already decided, or every routine it named
 * has been deleted since.
 */
export function applySequence(
  section: AiSection,
  messageId: string,
  variant: AppVariant = APP_VARIANT,
): Applied | null {
  // The loop is the training log's, and only from this app's own chat.
  if (section !== 'Workout' || !aiServes(variant, section)) return null;
  const message = useAi.getState().chats[section].find((m) => m.id === messageId);
  const block =
    message?.role === 'model' ? message.blocks.find((b) => b.type === 'sequence') : undefined;
  if (!block || block.type !== 'sequence' || block.status !== 'pending') return null;

  const library = useLibrary.getState();
  const known = new Set(library.routines.map((r) => r.id));
  // "Next" is re-counted on the routine the card highlighted — `keepSteps`.
  const { routineIds, next } = keepSteps(block.routineIds, block.next, (id) => known.has(id));
  if (routineIds.length === 0) return null;

  const before = library.sequence;
  library.replaceSequence({ isActive: true, routineIds, cursor: next });
  useAi.getState().setSequenceStatus(section, messageId, 'accepted');
  return {
    message: t('Training loop updated', lang()),
    undo: () => {
      useLibrary.getState().replaceSequence(before);
      useAi.getState().setSequenceStatus(section, messageId, 'pending');
    },
  };
}

export function discardSequence(section: AiSection, messageId: string): void {
  useAi.getState().setSequenceStatus(section, messageId, 'discarded');
}

/* ------------------------------------------------------------------ */
/* Deciding a settings card                                            */
/* ------------------------------------------------------------------ */

/** What `validateChanges` checks ids against — this section's own things. */
function changeContext(section: AiSection): ChangeContext {
  const money = useMoney.getState();
  const live = money.categories.filter((c) => c.archivedAt === null && !isTransferCategory(c.id));
  return {
    section,
    exercises: useLibrary.getState().exercises,
    tasks: useTasks.getState().tasks,
    categories: live.filter((c) => c.direction === 'expense'),
    today: dayKey(new Date()),
    moneyCategories: live.map((c) => ({ id: c.id, name: c.name, direction: c.direction })),
    accounts: money.accounts
      .filter((a) => a.archivedAt === null)
      .sort((a, b) => a.order - b.order)
      .map((a) => ({ id: a.id, name: a.name })),
    workouts: useWorkoutHistory.getState().workouts,
  };
}

/** `2026-10-27` → `27 Oct`, the card's date. */
function formatDay(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  const month = monthNames(lang())[m - 1] ?? '';
  return `${d} ${month.slice(0, 3)}`;
}

/** The values in force, for the card's `from`. */
function currentValues(): CurrentValues {
  const settings = useSettings.getState();
  const money = useMoney.getState();
  const scale = moneyScale({
    pinned: money.scale,
    empty: logIsEmpty(money.amounts, money.accounts),
    currency: settings.currencyCode,
  });
  return {
    exercises: useLibrary.getState().exercises,
    tasks: useTasks.getState().tasks,
    categories: money.categories,
    settings: {
      restSecondsBetweenSets: settings.restSecondsBetweenSets,
      restSecondsBetweenExercises: settings.restSecondsBetweenExercises,
      autoStartRest: settings.autoStartRest,
      weeklyWorkoutGoal: settings.weeklyWorkoutGoal,
    },
    budgets: Object.fromEntries((money.budgets ?? []).map((b) => [b.categoryId, b.monthly])),
    formatMoney: (value) => formatMoney(value, settings.currencyCode, scale),
    moneyCategories: money.categories,
    bodyweightKg: settings.bodyweightKg,
    formatDay,
  };
}

/**
 * `Apply changes` on a settings card: every change, through each store's own
 * action, and ONE Undo that puts every touched store back as it was.
 *
 * Null when there is nothing to apply — the card is gone, already decided, or
 * everything it named has been deleted since. Each change is re-checked against
 * the store as it is NOW: an exercise deleted between the answer and the tap is
 * skipped rather than resurrected.
 */
export function applyChanges(
  section: AiSection,
  messageId: string,
  variant: AppVariant = APP_VARIANT,
): Applied | null {
  if (!aiServes(variant, section)) return null;
  const message = useAi.getState().chats[section].find((m) => m.id === messageId);
  const block =
    message?.role === 'model' ? message.blocks.find((b) => b.type === 'changes') : undefined;
  if (!block || block.type !== 'changes' || block.status !== 'pending') return null;

  const library = useLibrary.getState();
  const settings = useSettings.getState();
  const tasks = useTasks.getState();
  const money = useMoney.getState();
  const snapshot = {
    library: { exercises: library.exercises, routines: library.routines },
    rest: settings.restSecondsBetweenSets,
    restExercises: settings.restSecondsBetweenExercises,
    autoRest: settings.autoStartRest,
    goal: settings.weeklyWorkoutGoal,
    tasks: tasks.tasks,
    budgets: money.budgets ?? [],
    bodyweightKg: settings.bodyweightKg,
    bodyweightLog: settings.bodyweightLog,
  };
  /* What the LOGGING changes wrote, filled in as they apply, so the Undo removes
     exactly those rows and puts back exactly those days and workouts. */
  const written: Written = { amounts: [], taskDays: [], workouts: new Map() };
  /* The workout in flight carries its own copy of each exercise, and Apply
     writes into it (`syncExercise`, `followGlobalRest`) — so the Undo has to put
     those copies back too, or the open card keeps the change it just undid. */
  const session = useActiveWorkout.getState().session;
  const liveBefore = session
    ? { localId: session.localId, exercises: session.entries.map((e) => e.exercise) }
    : null;

  /* Settings first: a new between-sets rest clears every exercise's own rest
     (`restSync`), and an exercise rest on the same card must survive it. */
  const ordered = [...(block.changes as AiChange[])].sort(
    (a, b) => Number(b.target === 'setting') - Number(a.target === 'setting'),
  );
  let applied = 0;
  for (const change of ordered) {
    // The validator already kept only the chat's own section; this is the wall
    // between a card and a log this app does not show (`aiScope.ts`).
    if (!aiServes(variant, changeSection(change.target))) continue;
    if (applyOne(change, written)) applied += 1;
  }
  if (applied === 0) return null;
  useAi.getState().setChangesStatus(section, messageId, 'accepted');

  return {
    message: t('{n} changes applied', lang(), { n: applied }),
    undo: () => {
      useLibrary.getState().replaceLibrary(snapshot.library);
      const live = useActiveWorkout.getState();
      // The same session only: a workout started since never held these copies.
      if (liveBefore && live.session?.localId === liveBefore.localId) {
        for (const e of liveBefore.exercises) useActiveWorkout.getState().syncExercise(e.id, e);
      }
      const s = useSettings.getState();
      s.setNumber('restSecondsBetweenSets', snapshot.rest);
      s.setNumber('restSecondsBetweenExercises', snapshot.restExercises);
      s.setFlag('autoStartRest', snapshot.autoRest);
      s.setWeeklyWorkoutGoal(snapshot.goal);
      useTasks.getState().restoreTaskList(snapshot.tasks);
      const m = useMoney.getState();
      const before = new Map(snapshot.budgets.map((b) => [b.categoryId, b]));
      for (const budget of m.budgets ?? []) {
        if (!before.has(budget.categoryId)) m.setBudget(budget.categoryId, 0);
      }
      for (const budget of snapshot.budgets) {
        m.setBudget(budget.categoryId, budget.monthly, budget.alerts === true);
      }
      // Only a card that weighed in puts the weight back: a weigh-in made by hand
      // since an Expenses card was applied is not this Undo's to take.
      // And FIRST, because restoring a workout reprices it at the weight in force.
      if (ordered.some((c) => c.target === 'bodyweight')) {
        useSettings.setState({
          bodyweightKg: snapshot.bodyweightKg,
          bodyweightLog: snapshot.bodyweightLog,
        });
      }
      for (const id of written.amounts) useMoney.getState().deleteAmount(id);
      // Newest first, so a day written twice ends on what it said before either.
      for (const { id, day, before } of [...written.taskDays].reverse()) {
        useTasks.getState().restoreEntry(id, day, before ?? { mark: null, note: '' });
      }
      for (const workout of written.workouts.values()) {
        useWorkoutHistory.getState().restoreWorkout(workout);
      }
      useAi.getState().setChangesStatus(section, messageId, 'pending');
    },
  };
}

/** What the logging changes wrote, for the Undo. */
interface Written {
  amounts: ID[];
  taskDays: { id: ID; day: string; before: TaskEntry | undefined }[];
  /** The workout as it was before its FIRST correction on this card. */
  workouts: Map<ID, CompletedWorkout>;
}

/** One change, through its store. False when its target is gone. */
function applyOne(change: AiChange, written: Written): boolean {
  if (change.target === 'amount') {
    const money = useMoney.getState();
    const category = money.categories.find((c) => c.id === change.id && c.archivedAt === null);
    const accounts = money.accounts
      .filter((a) => a.archivedAt === null)
      .sort((a, b) => a.order - b.order);
    const account = accounts.find((a) => a.id === change.accountId) ?? accounts[0];
    if (!category || !account) return false;
    /* `addAmount` also ticks the `Track expenses` task on that day — so the Undo
       has to know what that day said before, or it leaves a tick for an amount
       that no longer exists. */
    const tasks = useTasks.getState();
    for (const task of tasks.tasks) {
      if (task.auto !== 'money' || task.archivedAt !== null) continue;
      written.taskDays.push({
        id: task.id,
        day: change.day,
        before: tasks.log[task.id]?.[change.day],
      });
    }
    const id = money.addAmount({
      categoryId: category.id,
      accountId: account.id,
      direction: category.direction,
      value: change.value,
      when: { kind: 'day', date: change.day },
      note: change.note,
    });
    if (id) written.amounts.push(id);
    return id != null;
  }
  if (change.target === 'bodyweight') {
    useSettings.getState().setBodyweightKg(change.value);
    return true;
  }
  if (change.target === 'workout_set') {
    const history = useWorkoutHistory.getState();
    const workout = history.workouts.find((w) => w.id === change.id);
    if (!workout) return false;
    if (!written.workouts.has(workout.id)) written.workouts.set(workout.id, workout);
    return history.updateWorkoutSet(workout.id, change.setId, { kind: change.value });
  }
  if (change.target === 'exercise') {
    const library = useLibrary.getState();
    const exercise = library.exercises.find((e) => e.id === change.id && !e.isArchived);
    if (!exercise) return false;
    // Through `updateExercise`, which also re-plans the routines on a `sets` change.
    const next = applyExerciseChange(exercise, change);
    library.updateExercise(exercise.id, next);
    // And on the card of a workout in flight, as an edit made by hand lands there.
    useActiveWorkout.getState().syncExercise(next.id, next);
    return true;
  }
  if (change.target === 'setting') {
    const settings = useSettings.getState();
    if (change.field === 'auto_rest') settings.setFlag('autoStartRest', change.value === true);
    else if (change.field === 'weekly_goal') settings.setWeeklyWorkoutGoal(Number(change.value));
    // The same writes the Settings rows make — `state/restSync.ts`.
    else if (change.field === 'rest_between_sets') setRestBetweenSets(Number(change.value));
    else setRestBetweenExercises(Number(change.value));
    return true;
  }
  if (change.target === 'budget') {
    const money = useMoney.getState();
    if (!money.categories.some((c) => c.id === change.id && c.archivedAt === null)) return false;
    money.setBudget(change.id, change.value);
    return true;
  }
  if (change.target !== 'task') return false;
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

export function discardChanges(section: AiSection, messageId: string): void {
  useAi.getState().setChangesStatus(section, messageId, 'discarded');
}
