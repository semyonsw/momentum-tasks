/**
 * The assistant's state: whether it is connected, which model, and one chat per
 * section — everything about the AI except the key.
 *
 * ── THE KEY IS NOT HERE ────────────────────────────────────────────────────
 *
 * It is in the keystore (`lib/ai/secureKey.ts`). This store holds the STATUS the
 * key earned — `off`, `testing`, `ready`, `error` — and that is what every entry
 * point reads: the sparkle lights on `ready`, and everything else routes to the
 * settings screen first.
 *
 * ── THE CHATS ARE IN THE BACKUP; THE KEY NEVER IS ────────────────────────
 *
 * They used to be left out, as derived data. They are not derived once there is
 * a history: last month's answer about the bench press, and the loop the user
 * accepted from it, are a record of a conversation nobody can ask again word for
 * word. So `Export everything` carries the open chats, the past chats and their
 * suggestions (`chatsForBackup`), and a restore brings them back visible. What
 * never travels is the key (the keystore, not this store), the model and the
 * connection state: a restored phone tests its own key. `dataTransfer.test.ts`
 * pins both halves.
 *
 * ── ONE CHAT PER SECTION, FORTY MESSAGES DEEP ──────────────────────────────
 *
 * Workout, Tasks and Expenses each keep their own history, because each is a
 * different conversation about a different log. Forty messages is twenty
 * exchanges — more than a phone screen shows and far more than the ten turns
 * that travel with a question — and the cap keeps a blob that is rewritten on
 * every message from growing for a year.
 *
 * All three keys stay in every app after the 3.0.0 split, though each app shows
 * one chat (`lib/ai/aiScope.ts`). The Workout app is the 2.x install, and its
 * Tasks and Expenses chats are on disk: they ride its backup to the apps that
 * show them, so this store keeps them rather than dropping the keys it no
 * longer draws. A Tasks or Expenses app simply has two empty ones.
 *
 * A proposal lives beside the chats, keyed by id, because it is EDITED: the
 * review screen changes its numbers, and a chat message holding a copy would be
 * a second version of it. The message holds the id. A proposal no message points
 * at any more is dropped with the message.
 *
 * Validated on the way in, like every other store: a blob from an older build or
 * a half-written one must rehydrate to something renderable.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistedStorage } from './persistStorage';

import { DEFAULT_MODEL } from '../lib/ai/gemini';
import { droppedEntries, removeById, restoreAt, type Removed } from '../lib/ai/chatArchive';
import {
  AI_SECTIONS,
  validateBlocks,
  type AiSection,
  type SummaryBlock,
  type TextBlock,
} from '../lib/ai/aiSchema';
import type { AiChange, ChangeRow } from '../lib/ai/aiChanges';
import type { ProposalRow, ReviewProposal } from '../lib/ai/aiProposal';
import type { ID } from '../types/models';

export type AiStatus = 'off' | 'testing' | 'ready' | 'error';

/**
 * A suggested training loop, as the chat keeps it: the steps, the step that is
 * up next, the reason — and whether it was applied. Stored IN the message rather
 * than as a separate record (a routine proposal is a record because it has an
 * editor; a loop is applied or not, whole).
 */
export interface SequenceChatBlock {
  type: 'sequence';
  routineIds: ID[];
  next: number;
  why: string;
  status: ProposalStatus;
}

/**
 * A suggested set of SETTINGS changes (`lib/ai/aiChanges.ts`), kept in the
 * message like a loop: applied or not, whole. `rows` is the card as it read
 * when the answer arrived — its `from` values are the ones Apply replaced.
 */
export interface ChangesChatBlock {
  type: 'changes';
  changes: AiChange[];
  rows: ChangeRow[];
  why: string;
  status: ProposalStatus;
}

/** A block as the chat stores it: a proposal is a reference, not a copy. */
export type ChatBlock =
  | TextBlock
  | SummaryBlock
  | { type: 'proposal'; proposalId: string }
  | SequenceChatBlock
  | ChangesChatBlock;

export type AiMessage =
  | { id: string; role: 'user'; text: string; at: string }
  /** `raw` is the JSON the model wrote — the next question sends it back as history. */
  | { id: string; role: 'model'; blocks: ChatBlock[]; raw: string; at: string }
  /** A failure, said in one sentence, and the question that "Try again" resends. */
  | { id: string; role: 'error'; text: string; retry: string; at: string };

export type ProposalStatus = 'pending' | 'accepted' | 'discarded';

export interface StoredProposal {
  proposal: ReviewProposal;
  status: ProposalStatus;
}

/** Each section's chat holds at most this many messages. */
export const CHAT_CAP = 40;

type Chats = Record<AiSection, AiMessage[]>;

const EMPTY_CHATS: Chats = { Workout: [], Tasks: [], Expenses: [] };

/**
 * A chat that was put away by `Start a new chat` — kept on this phone, listed
 * in the chat's history sheet, and reopenable exactly as it was left.
 *
 * `New chat` used to DELETE the conversation, which made the one button a user
 * presses to change the subject also the button that throws away last week's
 * answer about their bench press. Now it files it. The archive lives in the same
 * AsyncStorage blob as the chats, and travels in a backup with them.
 */
export interface ArchivedChat {
  id: string;
  /** The first question, as the list shows it. */
  title: string;
  startedAt: string;
  updatedAt: string;
  messages: AiMessage[];
}

/** What `deleteArchived` leaves for its Undo — see `lib/ai/chatArchive.ts`. */
export interface DeletedChat extends Removed<ArchivedChat> {
  section: AiSection;
  /** The suggestions only this chat pointed at, pruned with it. */
  proposals: Record<string, StoredProposal>;
}

/** Past chats kept per section; the oldest go first. */
export const ARCHIVE_CAP = 30;

type Archive = Record<AiSection, ArchivedChat[]>;

const EMPTY_ARCHIVE: Archive = { Workout: [], Tasks: [], Expenses: [] };

let archiveSeed = 0;

/** A chat worth keeping: one the user actually asked something in. */
function toArchived(messages: readonly AiMessage[]): ArchivedChat | null {
  const first = messages.find((m) => m.role === 'user');
  if (!first || first.role !== 'user') return null;
  archiveSeed += 1;
  return {
    id: `chat_${Date.now().toString(36)}_${archiveSeed}`,
    title: first.text.trim().slice(0, 120),
    startedAt: messages[0].at,
    updatedAt: messages[messages.length - 1].at,
    messages: [...messages],
  };
}

interface AiValue {
  provider: 'google';
  model: string;
  status: AiStatus;
  lastError: string | null;
  lastTestedAt: string | null;
  latencyMs: number | null;
  chats: Chats;
  /** Past chats, per section, newest first — see `ArchivedChat`. */
  archive: Archive;
  proposals: Record<string, StoredProposal>;
  /**
   * Routines the assistant created that have not been opened yet — the `AI` pill
   * on the home screen's rows. Opening one clears it: the pill says where a
   * routine came from until the user has looked at it, and not forever.
   */
  unseenRoutineIds: ID[];
}

interface AiState extends AiValue {
  /** A question in flight, per section. Not persisted: a killed app is not waiting. */
  pending: Record<AiSection, boolean>;
  /** A pending turn is being asked again after Google failed — for the caption. */
  retrying: Record<AiSection, boolean>;

  setModel: (model: string) => void;
  markTesting: () => void;
  markReady: (latencyMs: number, at?: Date) => void;
  markError: (message: string) => void;
  /** The key is gone (see `aiActions.disconnect`); the chats stay. */
  markOff: () => void;

  appendMessage: (section: AiSection, message: AiMessage) => void;
  removeMessage: (section: AiSection, id: string) => void;
  /** `Start a new chat`: the current one goes into the history, not the bin. */
  clearChat: (section: AiSection) => void;
  /** Bring a past chat back; whatever was open takes its place in the history. */
  openArchived: (section: AiSection, id: string) => void;
  /**
   * Take a past chat out of the list. Returns what its Undo needs (U14), or null
   * when there was no such chat.
   */
  deleteArchived: (section: AiSection, id: string) => DeletedChat | null;
  /** The Undo: the chat back in its place, with the suggestions it took along. */
  restoreArchived: (deleted: DeletedChat) => void;
  setPending: (section: AiSection, pending: boolean) => void;
  setRetrying: (section: AiSection, retrying: boolean) => void;

  putProposal: (id: string, proposal: ReviewProposal) => void;
  updateProposal: (id: string, proposal: ReviewProposal) => void;
  setProposalStatus: (id: string, status: ProposalStatus) => void;

  /**
   * Replace every chat, past chat and suggestion with a backup's. The key, the
   * model and the connection state are the phone's own and are not touched.
   * Returns how many chats (open and past) landed.
   */
  importChats: (raw: unknown) => number;
  /** Mark a suggested loop applied, discarded, or (Undo) pending again. */
  setSequenceStatus: (section: AiSection, messageId: string, status: ProposalStatus) => void;
  /** The same for a settings-changes card. */
  setChangesStatus: (section: AiSection, messageId: string, status: ProposalStatus) => void;

  markRoutineAi: (routineId: ID) => void;
  markRoutineSeen: (routineId: ID) => void;
}

/**
 * One message's loop or changes card set to `status`, in the open chat AND the
 * archive: `Start a new chat` between Apply and Undo files the card away, and
 * the Undo left it "accepted" there for good.
 */
function markBlocks(
  state: Pick<AiValue, 'chats' | 'archive'>,
  section: AiSection,
  messageId: string,
  type: 'sequence' | 'changes',
  status: ProposalStatus,
): Pick<AiValue, 'chats' | 'archive'> {
  const mark = (messages: AiMessage[]) =>
    messages.map((message) =>
      message.id === messageId && message.role === 'model'
        ? {
            ...message,
            blocks: message.blocks.map((block) =>
              block.type === type ? { ...block, status } : block,
            ),
          }
        : message,
    );
  return {
    chats: { ...state.chats, [section]: mark(state.chats[section]) },
    archive: {
      ...state.archive,
      [section]: state.archive[section].map((chat) =>
        chat.messages.some((m) => m.id === messageId)
          ? { ...chat, messages: mark(chat.messages) }
          : chat,
      ),
    },
  };
}

/** Every proposal id some message in some chat still points at. */
function referenced(chats: Chats, archive: Archive = EMPTY_ARCHIVE): Set<string> {
  const ids = new Set<string>();
  for (const section of AI_SECTIONS) {
    const all = [...chats[section], ...archive[section].flatMap((c) => c.messages)];
    for (const message of all) {
      if (message.role !== 'model') continue;
      for (const block of message.blocks) if (block.type === 'proposal') ids.add(block.proposalId);
    }
  }
  return ids;
}

function prune(
  proposals: Record<string, StoredProposal>,
  chats: Chats,
  archive: Archive = EMPTY_ARCHIVE,
): Record<string, StoredProposal> {
  const keep = referenced(chats, archive);
  return Object.fromEntries(Object.entries(proposals).filter(([id]) => keep.has(id)));
}

export const useAi = create<AiState>()(
  persist(
    (set, get) => ({
      provider: 'google',
      model: DEFAULT_MODEL,
      status: 'off',
      lastError: null,
      lastTestedAt: null,
      latencyMs: null,
      chats: EMPTY_CHATS,
      archive: EMPTY_ARCHIVE,
      proposals: {},
      unseenRoutineIds: [],
      pending: { Workout: false, Tasks: false, Expenses: false },
      retrying: { Workout: false, Tasks: false, Expenses: false },

      setModel: (model) => {
        const trimmed = model.trim().replace(/^models\//, '');
        if (trimmed) set({ model: trimmed });
      },
      markTesting: () => set({ status: 'testing', lastError: null }),
      markReady: (latencyMs, at = new Date()) =>
        set({
          status: 'ready',
          lastError: null,
          latencyMs: Math.max(0, Math.round(latencyMs)),
          lastTestedAt: at.toISOString(),
        }),
      markError: (message) => set({ status: 'error', lastError: message }),
      markOff: () => set({ status: 'off', lastError: null, lastTestedAt: null, latencyMs: null }),

      appendMessage: (section, message) => {
        const { chats, archive, proposals } = get();
        const next = { ...chats, [section]: [...chats[section], message].slice(-CHAT_CAP) };
        set({ chats: next, proposals: prune(proposals, next, archive) });
      },
      removeMessage: (section, id) => {
        const { chats, archive, proposals } = get();
        const next = { ...chats, [section]: chats[section].filter((m) => m.id !== id) };
        set({ chats: next, proposals: prune(proposals, next, archive) });
      },
      clearChat: (section) => {
        const { chats, archive, proposals } = get();
        const filed = toArchived(chats[section]);
        const nextArchive = filed
          ? { ...archive, [section]: [filed, ...archive[section]].slice(0, ARCHIVE_CAP) }
          : archive;
        const next = { ...chats, [section]: [] };
        set({ chats: next, archive: nextArchive, proposals: prune(proposals, next, nextArchive) });
      },
      openArchived: (section, id) => {
        const { chats, archive, proposals, pending } = get();
        // Not while an answer is on its way: it would land in the reopened chat.
        if (pending[section]) return;
        const chosen = archive[section].find((c) => c.id === id);
        if (!chosen) return;
        const filed = toArchived(chats[section]);
        const rest = archive[section].filter((c) => c.id !== id);
        const nextArchive = {
          ...archive,
          [section]: (filed ? [filed, ...rest] : rest).slice(0, ARCHIVE_CAP),
        };
        const next = { ...chats, [section]: chosen.messages.slice(-CHAT_CAP) };
        set({ chats: next, archive: nextArchive, proposals: prune(proposals, next, nextArchive) });
      },
      deleteArchived: (section, id) => {
        const { chats, archive, proposals } = get();
        const taken = removeById(archive[section], id);
        if (!taken) return null;
        const nextArchive = { ...archive, [section]: taken.list };
        const kept = prune(proposals, chats, nextArchive);
        set({ archive: nextArchive, proposals: kept });
        return { section, ...taken.removed, proposals: droppedEntries(proposals, kept) };
      },
      restoreArchived: (deleted) => {
        const { archive, proposals } = get();
        const list = restoreAt(archive[deleted.section], deleted, ARCHIVE_CAP);
        set({
          archive: { ...archive, [deleted.section]: list },
          // Its own suggestions back as they were; anything newer wins.
          proposals: { ...deleted.proposals, ...proposals },
        });
      },
      setPending: (section, pending) =>
        set((state) => ({
          pending: { ...state.pending, [section]: pending },
          ...(pending ? {} : { retrying: { ...state.retrying, [section]: false } }),
        })),
      setRetrying: (section, retrying) =>
        set((state) => ({ retrying: { ...state.retrying, [section]: retrying } })),

      putProposal: (id, proposal) =>
        set((state) => ({
          proposals: { ...state.proposals, [id]: { proposal, status: 'pending' } },
        })),
      updateProposal: (id, proposal) =>
        set((state) => {
          const current = state.proposals[id];
          // A decided proposal is a record of what happened; the review screen
          // cannot reach one, and nothing else should rewrite it either.
          if (!current || current.status !== 'pending') return {};
          return { proposals: { ...state.proposals, [id]: { ...current, proposal } } };
        }),
      setProposalStatus: (id, status) =>
        set((state) => {
          const current = state.proposals[id];
          if (!current) return {};
          return { proposals: { ...state.proposals, [id]: { ...current, status } } };
        }),

      setSequenceStatus: (section, messageId, status) =>
        set((state) => markBlocks(state, section, messageId, 'sequence', status)),
      setChangesStatus: (section, messageId, status) =>
        set((state) => markBlocks(state, section, messageId, 'changes', status)),
      importChats: (raw) => {
        const clean = sanitizeAi(raw);
        set({ chats: clean.chats, archive: clean.archive, proposals: clean.proposals });
        return countChats(clean);
      },
      markRoutineAi: (routineId) =>
        set((state) =>
          state.unseenRoutineIds.includes(routineId)
            ? {}
            : { unseenRoutineIds: [...state.unseenRoutineIds, routineId] },
        ),
      /* Called on every routine opened, nearly always for one already seen — so
         that case does not `set` at all, rather than notifying every subscriber. */
      markRoutineSeen: (routineId) => {
        if (!get().unseenRoutineIds.includes(routineId)) return;
        set((state) => ({
          unseenRoutineIds: state.unseenRoutineIds.filter((id) => id !== routineId),
        }));
      },
    }),
    {
      name: 'ai',
      version: 1,
      storage: persistedStorage(),
      partialize: (state): AiValue => ({
        provider: state.provider,
        model: state.model,
        status: state.status,
        lastError: state.lastError,
        lastTestedAt: state.lastTestedAt,
        latencyMs: state.latencyMs,
        chats: state.chats,
        archive: state.archive,
        proposals: state.proposals,
        unseenRoutineIds: state.unseenRoutineIds,
      }),
      merge: (persisted, current) => ({ ...current, ...sanitizeAi(persisted) }),
    },
  ),
);

/* ------------------------------------------------------------------ */
/* Rehydration guards                                                  */
/* ------------------------------------------------------------------ */

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function sanitizeRow(raw: unknown): ProposalRow | null {
  if (!isRec(raw)) return null;
  const key = str(raw.key);
  const name = str(raw.name);
  const sets = num(raw.sets);
  const reps = num(raw.reps);
  const weightKg = num(raw.weightKg);
  if (!key || !name || sets == null || reps == null || weightKg == null) return null;
  const was = isRec(raw.was)
    ? {
        sets: num(raw.was.sets) ?? sets,
        reps: num(raw.was.reps) ?? reps,
        weightKg: num(raw.was.weightKg) ?? weightKg,
      }
    : null;
  return {
    key,
    exerciseId: str(raw.exerciseId),
    name,
    ...(str(raw.muscle) ? { muscle: raw.muscle as ProposalRow['muscle'] } : {}),
    sets,
    reps,
    weightKg,
    was,
    ...(str(raw.itemId) ? { itemId: raw.itemId as string } : {}),
    removed: raw.removed === true,
    repsLocked: raw.repsLocked === true,
    weightLocked: raw.weightLocked === true,
    baseWeightKg: num(raw.baseWeightKg),
  };
}

function sanitizeProposal(raw: unknown): StoredProposal | null {
  if (!isRec(raw) || !isRec(raw.proposal)) return null;
  const p = raw.proposal;
  const kind = p.kind === 'new' || p.kind === 'edit' ? p.kind : null;
  const rows = Array.isArray(p.rows) ? p.rows.map(sanitizeRow).filter((r) => r != null) : [];
  if (!kind || rows.length === 0) return null;
  const status: ProposalStatus =
    raw.status === 'accepted' || raw.status === 'discarded' ? raw.status : 'pending';
  return {
    status,
    proposal: {
      kind,
      ...(str(p.targetRoutineId) ? { targetRoutineId: p.targetRoutineId as string } : {}),
      name: str(p.name) ?? '',
      ...(str(p.focus) ? { focus: p.focus as string } : {}),
      why: str(p.why) ?? '',
      rows: rows as ProposalRow[],
    },
  };
}

const CHANGE_TARGETS = new Set(['exercise', 'setting', 'task', 'budget']);

/**
 * A stored changes card out of anything. The changes were checked against the
 * stores when the answer arrived; what is checked here is only that each is
 * still the SHAPE `applyChanges` reads — anything else is dropped, and Apply
 * skips an id that has gone since.
 */
function sanitizeChangesBlock(raw: Rec): ChangesChatBlock | null {
  const changes = (Array.isArray(raw.changes) ? raw.changes : []).filter(
    (c): c is AiChange =>
      isRec(c) &&
      typeof c.target === 'string' &&
      CHANGE_TARGETS.has(c.target) &&
      typeof c.field === 'string',
  );
  const rows = (Array.isArray(raw.rows) ? raw.rows : []).flatMap((r): ChangeRow[] =>
    isRec(r) && typeof r.label === 'string' && typeof r.to === 'string'
      ? [{ subject: str(r.subject) ?? '', label: r.label, from: str(r.from) ?? '', to: r.to }]
      : [],
  );
  if (changes.length === 0 || rows.length === 0) return null;
  const status: ProposalStatus =
    raw.status === 'accepted' || raw.status === 'discarded' ? raw.status : 'pending';
  return { type: 'changes', changes, rows, why: str(raw.why) ?? '', status };
}

function sanitizeMessage(
  raw: unknown,
  section: AiSection,
  proposals: Record<string, StoredProposal>,
): AiMessage | null {
  if (!isRec(raw)) return null;
  const id = str(raw.id);
  const at = str(raw.at) ?? new Date(0).toISOString();
  if (!id) return null;
  if (raw.role === 'user') {
    const text = str(raw.text);
    return text ? { id, role: 'user', text, at } : null;
  }
  if (raw.role === 'error') {
    const text = str(raw.text);
    return text ? { id, role: 'error', text, retry: str(raw.retry) ?? '', at } : null;
  }
  if (raw.role !== 'model' || !Array.isArray(raw.blocks)) return null;
  const blocks: ChatBlock[] = [];
  for (const block of raw.blocks) {
    if (isRec(block) && block.type === 'proposal') {
      const proposalId = str(block.proposalId);
      if (proposalId && proposals[proposalId]) blocks.push({ type: 'proposal', proposalId });
      continue;
    }
    if (isRec(block) && block.type === 'sequence') {
      const routineIds = Array.isArray(block.routineIds)
        ? block.routineIds.filter((id): id is string => typeof id === 'string')
        : [];
      const why = str(block.why) ?? '';
      if (routineIds.length === 0) continue;
      const status: ProposalStatus =
        block.status === 'accepted' || block.status === 'discarded' ? block.status : 'pending';
      const next = num(block.next) ?? 0;
      blocks.push({
        type: 'sequence',
        routineIds,
        next: Math.min(Math.max(0, Math.round(next)), routineIds.length - 1),
        why,
        status,
      });
      continue;
    }
    if (isRec(block) && block.type === 'changes') {
      const clean = sanitizeChangesBlock(block);
      if (clean) blocks.push(clean);
      continue;
    }
    // Text and summary blocks go through the SAME validator a live answer does.
    const [valid] = validateBlocks([block], { section, routineIds: new Set() });
    if (valid && (valid.type === 'text' || valid.type === 'summary')) blocks.push(valid);
  }
  return blocks.length > 0 ? { id, role: 'model', blocks, raw: str(raw.raw) ?? '', at } : null;
}

/** A renderable AI state out of anything at all. */
export function sanitizeAi(input: unknown): AiValue {
  const raw = isRec(input) ? input : {};
  const proposals: Record<string, StoredProposal> = {};
  if (isRec(raw.proposals)) {
    for (const [id, value] of Object.entries(raw.proposals)) {
      const clean = sanitizeProposal(value);
      if (clean) proposals[id] = clean;
    }
  }
  const chats: Chats = { Workout: [], Tasks: [], Expenses: [] };
  const rawChats = isRec(raw.chats) ? raw.chats : {};
  for (const section of AI_SECTIONS) {
    const list = Array.isArray(rawChats[section]) ? (rawChats[section] as unknown[]) : [];
    chats[section] = list
      .map((message) => sanitizeMessage(message, section, proposals))
      .filter((m): m is AiMessage => m != null)
      .slice(-CHAT_CAP);
  }
  const archive: Archive = { Workout: [], Tasks: [], Expenses: [] };
  const rawArchive = isRec(raw.archive) ? raw.archive : {};
  for (const section of AI_SECTIONS) {
    const list = Array.isArray(rawArchive[section]) ? (rawArchive[section] as unknown[]) : [];
    for (const entry of list) {
      if (!isRec(entry)) continue;
      const id = str(entry.id);
      const messages = (Array.isArray(entry.messages) ? entry.messages : [])
        .map((message) => sanitizeMessage(message, section, proposals))
        .filter((m): m is AiMessage => m != null)
        .slice(-CHAT_CAP);
      if (!id || messages.length === 0) continue;
      archive[section].push({
        id,
        title: str(entry.title) ?? '',
        startedAt: str(entry.startedAt) ?? messages[0].at,
        updatedAt: str(entry.updatedAt) ?? messages[messages.length - 1].at,
        messages,
      });
    }
    archive[section] = archive[section].slice(0, ARCHIVE_CAP);
  }
  /*
   * `testing` does not survive a relaunch: the app was killed mid-test, and
   * whether the key it was testing got stored is exactly what is not known.
   * `off` sends the user back to the settings screen to test again.
   */
  const status: AiStatus = raw.status === 'ready' || raw.status === 'error' ? raw.status : 'off';
  return {
    provider: 'google',
    model: str(raw.model)?.trim() || DEFAULT_MODEL,
    status,
    lastError: status === 'error' ? str(raw.lastError) : null,
    lastTestedAt: str(raw.lastTestedAt),
    latencyMs: num(raw.latencyMs),
    chats,
    archive,
    proposals: prune(proposals, chats, archive),
    unseenRoutineIds: Array.isArray(raw.unseenRoutineIds)
      ? raw.unseenRoutineIds.filter((id): id is string => typeof id === 'string')
      : [],
  };
}

/* ------------------------------------------------------------------ */
/* Backups                                                             */
/* ------------------------------------------------------------------ */

/**
 * The conversations as a backup carries them: the open chat of each section,
 * the past chats, and the suggestions they point at. NEVER the key (that is in
 * the keystore, not this store) and not the connection state — a restored phone
 * has to test its own key.
 */
export function chatsForBackup(state: Pick<AiValue, 'chats' | 'archive' | 'proposals'>): {
  chats: Chats;
  archive: Archive;
  proposals: Record<string, StoredProposal>;
} {
  return { chats: state.chats, archive: state.archive, proposals: state.proposals };
}

/** Open chats with anything in them, plus every past chat. */
function countChats(state: Pick<AiValue, 'chats' | 'archive'>): number {
  let count = 0;
  for (const section of AI_SECTIONS) {
    if (state.chats[section].length > 0) count += 1;
    count += state.archive[section].length;
  }
  return count;
}
