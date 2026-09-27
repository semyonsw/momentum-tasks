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
 * ── NOT IN THE BACKUP, ON PURPOSE ──────────────────────────────────────────
 *
 * `state/dataTransfer.ts` names every store the backup file carries, and this is
 * not one of them. The chats are DERIVED — every answer can be asked again from
 * the log — and they hold the user's data restated in sentences, which is not
 * something they meant to export when they tapped "Export everything". A test in
 * `dataTransfer.test.ts` pins that neither a chat nor a key reaches the file.
 *
 * ── ONE CHAT PER SECTION, FORTY MESSAGES DEEP ──────────────────────────────
 *
 * Workout, Tasks and Expenses each keep their own history, because each is a
 * different conversation about a different log. Forty messages is twenty
 * exchanges — more than a phone screen shows and far more than the ten turns
 * that travel with a question — and the cap keeps a blob that is rewritten on
 * every message from growing for a year.
 *
 * A proposal lives beside the chats, keyed by id, because it is EDITED: the
 * review screen changes its numbers, and a chat message holding a copy would be
 * a second version of it. The message holds the id. A proposal no message points
 * at any more is dropped with the message.
 *
 * Validated on the way in, like every other store: a blob from an older build or
 * a half-written one must rehydrate to something renderable.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_MODEL } from '../lib/ai/gemini';
import {
  AI_SECTIONS,
  validateBlocks,
  type AiSection,
  type SummaryBlock,
  type TextBlock,
} from '../lib/ai/aiSchema';
import type { ProposalRow, ReviewProposal } from '../lib/ai/aiProposal';
import type { ID } from '../types/models';

export type AiStatus = 'off' | 'testing' | 'ready' | 'error';

/** A block as the chat stores it: a proposal is a reference, not a copy. */
export type ChatBlock = TextBlock | SummaryBlock | { type: 'proposal'; proposalId: string };

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

interface AiValue {
  provider: 'google';
  model: string;
  status: AiStatus;
  lastError: string | null;
  lastTestedAt: string | null;
  latencyMs: number | null;
  chats: Chats;
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

  setModel: (model: string) => void;
  markTesting: () => void;
  markReady: (latencyMs: number, at?: Date) => void;
  markError: (message: string) => void;
  /** The key is gone (see `aiActions.disconnect`); the chats stay. */
  markOff: () => void;

  appendMessage: (section: AiSection, message: AiMessage) => void;
  removeMessage: (section: AiSection, id: string) => void;
  clearChat: (section: AiSection) => void;
  setPending: (section: AiSection, pending: boolean) => void;

  putProposal: (id: string, proposal: ReviewProposal) => void;
  updateProposal: (id: string, proposal: ReviewProposal) => void;
  setProposalStatus: (id: string, status: ProposalStatus) => void;

  markRoutineAi: (routineId: ID) => void;
  markRoutineSeen: (routineId: ID) => void;
}

/** Every proposal id some message in some chat still points at. */
function referenced(chats: Chats): Set<string> {
  const ids = new Set<string>();
  for (const section of AI_SECTIONS) {
    for (const message of chats[section]) {
      if (message.role !== 'model') continue;
      for (const block of message.blocks) if (block.type === 'proposal') ids.add(block.proposalId);
    }
  }
  return ids;
}

function prune(
  proposals: Record<string, StoredProposal>,
  chats: Chats,
): Record<string, StoredProposal> {
  const keep = referenced(chats);
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
      proposals: {},
      unseenRoutineIds: [],
      pending: { Workout: false, Tasks: false, Expenses: false },

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
        const { chats, proposals } = get();
        const next = { ...chats, [section]: [...chats[section], message].slice(-CHAT_CAP) };
        set({ chats: next, proposals: prune(proposals, next) });
      },
      removeMessage: (section, id) => {
        const { chats, proposals } = get();
        const next = { ...chats, [section]: chats[section].filter((m) => m.id !== id) };
        set({ chats: next, proposals: prune(proposals, next) });
      },
      clearChat: (section) => {
        const { chats, proposals } = get();
        const next = { ...chats, [section]: [] };
        set({ chats: next, proposals: prune(proposals, next) });
      },
      setPending: (section, pending) =>
        set((state) => ({ pending: { ...state.pending, [section]: pending } })),

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

      markRoutineAi: (routineId) =>
        set((state) =>
          state.unseenRoutineIds.includes(routineId)
            ? {}
            : { unseenRoutineIds: [...state.unseenRoutineIds, routineId] },
        ),
      markRoutineSeen: (routineId) =>
        set((state) =>
          state.unseenRoutineIds.includes(routineId)
            ? { unseenRoutineIds: state.unseenRoutineIds.filter((id) => id !== routineId) }
            : {},
        ),
    }),
    {
      name: 'ai',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state): AiValue => ({
        provider: state.provider,
        model: state.model,
        status: state.status,
        lastError: state.lastError,
        lastTestedAt: state.lastTestedAt,
        latencyMs: state.latencyMs,
        chats: state.chats,
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
    // Text and summary blocks go through the SAME validator a live answer does.
    const [valid] = validateBlocks([block], { section, routineIds: new Set() });
    if (valid && valid.type !== 'routine_proposal') blocks.push(valid);
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
    proposals: prune(proposals, chats),
    unseenRoutineIds: Array.isArray(raw.unseenRoutineIds)
      ? raw.unseenRoutineIds.filter((id): id is string => typeof id === 'string')
      : [],
  };
}
