/**
 * The assistant's state: whether it is connected, which model, and the chat —
 * everything about the AI except the key.
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
 * a history: last month's answer about a habit, and the change the user applied
 * from it, are a record of a conversation nobody can ask again word for word.
 * So `Export everything` carries the open chat and the past chats
 * (`chatsForBackup`), and a restore brings them back visible. What never travels
 * is the key (the keystore, not this store), the model and the connection
 * state: a restored phone tests its own key. `dataTransfer.test.ts` pins both
 * halves.
 *
 * ── FORTY MESSAGES DEEP ───────────────────────────────────────────────────
 *
 * Forty messages is twenty exchanges — more than a phone screen shows and far
 * more than the ten turns that travel with a question — and the cap keeps a
 * blob that is rewritten on every message from growing for a year.
 *
 * ── FILED UNDER `Tasks`, ON DISK AND IN A BACKUP ──────────────────────────
 *
 * Momentum kept one chat per section until it was split into apps at 3.0.0,
 * and its persisted blob and its backups file every chat under its section's
 * name: `{ chats: { Tasks: [...] }, archive: { Tasks: [...] } }`. This store
 * holds one chat, and writes it back in exactly that shape (`FILED_AS`), so the
 * blob a 3.0.0 install left on the phone is read as it is, and a backup this
 * app writes opens in 3.0.0 and the other way round.
 *
 * Validated on the way in, like every other store: a blob from an older build or
 * a half-written one must rehydrate to something renderable.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistedStorage } from './persistStorage';

import { DEFAULT_MODEL } from '../lib/ai/gemini';
import { removeById, restoreAt, type Removed } from '../lib/ai/chatArchive';
import { validateBlocks, type SummaryBlock, type TextBlock } from '../lib/ai/aiSchema';
import type { AiChange, ChangeRow } from '../lib/ai/aiChanges';

export type AiStatus = 'off' | 'testing' | 'ready' | 'error';

export type ProposalStatus = 'pending' | 'accepted' | 'discarded';

/**
 * A suggested set of changes to the tasks (`lib/ai/aiChanges.ts`), kept in the
 * message: applied or not, whole. `rows` is the card as it read when the answer
 * arrived — its `from` values are the ones Apply replaced.
 */
export interface ChangesChatBlock {
  type: 'changes';
  changes: AiChange[];
  rows: ChangeRow[];
  why: string;
  status: ProposalStatus;
}

/** A block as the chat stores it. */
export type ChatBlock = TextBlock | SummaryBlock | ChangesChatBlock;

export type AiMessage =
  | { id: string; role: 'user'; text: string; at: string }
  /** `raw` is the JSON the model wrote — the next question sends it back as history. */
  | { id: string; role: 'model'; blocks: ChatBlock[]; raw: string; at: string }
  /** A failure, said in one sentence, and the question that "Try again" resends. */
  | { id: string; role: 'error'; text: string; retry: string; at: string };

/** The chat holds at most this many messages. */
export const CHAT_CAP = 40;

/**
 * The section name the chat is filed under on disk and in a backup — see the
 * file header. Not a choice: it is what Momentum 3.0.0 reads and writes.
 */
const FILED_AS = 'Tasks';

/**
 * A chat that was put away by `Start a new chat` — kept on this phone, listed
 * in the chat's history sheet, and reopenable exactly as it was left.
 *
 * `New chat` used to DELETE the conversation, which made the one button a user
 * presses to change the subject also the button that throws away last week's
 * answer. Now it files it. The archive lives in the same AsyncStorage blob as
 * the chat, and travels in a backup with it.
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
export type DeletedChat = Removed<ArchivedChat>;

/** Past chats kept; the oldest go first. */
export const ARCHIVE_CAP = 30;

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
  chat: AiMessage[];
  /** Past chats, newest first — see `ArchivedChat`. */
  archive: ArchivedChat[];
}

interface AiState extends AiValue {
  /** A question in flight. Not persisted: a killed app is not waiting. */
  pending: boolean;
  /** A pending turn is being asked again after Google failed — for the caption. */
  retrying: boolean;

  setModel: (model: string) => void;
  markTesting: () => void;
  markReady: (latencyMs: number, at?: Date) => void;
  markError: (message: string) => void;
  /** The key is gone (see `aiActions.disconnect`); the chats stay. */
  markOff: () => void;

  appendMessage: (message: AiMessage) => void;
  removeMessage: (id: string) => void;
  /** `Start a new chat`: the current one goes into the history, not the bin. */
  clearChat: () => void;
  /** Bring a past chat back; whatever was open takes its place in the history. */
  openArchived: (id: string) => void;
  /**
   * Take a past chat out of the list. Returns what its Undo needs (U14), or null
   * when there was no such chat.
   */
  deleteArchived: (id: string) => DeletedChat | null;
  /** The Undo: the chat back in its place. */
  restoreArchived: (deleted: DeletedChat) => void;
  setPending: (pending: boolean) => void;
  setRetrying: (retrying: boolean) => void;

  /**
   * Replace the chat and the past chats with a backup's. The key, the model and
   * the connection state are the phone's own and are not touched. Returns how
   * many chats (open and past) landed.
   */
  importChats: (raw: unknown) => number;
  /** Mark a changes card applied, discarded, or (Undo) pending again. */
  setChangesStatus: (messageId: string, status: ProposalStatus) => void;
}

/**
 * One message's changes card set to `status`, in the open chat AND the archive:
 * `Start a new chat` between Apply and Undo files the card away, and the Undo
 * left it "accepted" there for good.
 */
function markChanges(
  state: Pick<AiValue, 'chat' | 'archive'>,
  messageId: string,
  status: ProposalStatus,
): Pick<AiValue, 'chat' | 'archive'> {
  const mark = (messages: AiMessage[]) =>
    messages.map((message) =>
      message.id === messageId && message.role === 'model'
        ? {
            ...message,
            blocks: message.blocks.map((block) =>
              block.type === 'changes' ? { ...block, status } : block,
            ),
          }
        : message,
    );
  return {
    chat: mark(state.chat),
    archive: state.archive.map((chat) =>
      chat.messages.some((m) => m.id === messageId)
        ? { ...chat, messages: mark(chat.messages) }
        : chat,
    ),
  };
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
      chat: [],
      archive: [],
      pending: false,
      retrying: false,

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

      appendMessage: (message) => set({ chat: [...get().chat, message].slice(-CHAT_CAP) }),
      removeMessage: (id) => set({ chat: get().chat.filter((m) => m.id !== id) }),
      clearChat: () => {
        const { chat, archive } = get();
        const filed = toArchived(chat);
        set({ chat: [], archive: filed ? [filed, ...archive].slice(0, ARCHIVE_CAP) : archive });
      },
      openArchived: (id) => {
        const { chat, archive, pending } = get();
        // Not while an answer is on its way: it would land in the reopened chat.
        if (pending) return;
        const chosen = archive.find((c) => c.id === id);
        if (!chosen) return;
        const filed = toArchived(chat);
        const rest = archive.filter((c) => c.id !== id);
        set({
          chat: chosen.messages.slice(-CHAT_CAP),
          archive: (filed ? [filed, ...rest] : rest).slice(0, ARCHIVE_CAP),
        });
      },
      deleteArchived: (id) => {
        const taken = removeById(get().archive, id);
        if (!taken) return null;
        set({ archive: taken.list });
        return taken.removed;
      },
      restoreArchived: (deleted) =>
        set({ archive: restoreAt(get().archive, deleted, ARCHIVE_CAP) }),
      setPending: (pending) => set(pending ? { pending } : { pending, retrying: false }),
      setRetrying: (retrying) => set({ retrying }),

      setChangesStatus: (messageId, status) =>
        set((state) => markChanges(state, messageId, status)),
      importChats: (raw) => {
        const clean = sanitizeAi(raw);
        set({ chat: clean.chat, archive: clean.archive });
        return countChats(clean);
      },
    }),
    {
      name: 'ai',
      version: 1,
      storage: persistedStorage(),
      /* Written in the filed shape — see "FILED UNDER `Tasks`" in the header. */
      partialize: (state) => ({
        provider: state.provider,
        model: state.model,
        status: state.status,
        lastError: state.lastError,
        lastTestedAt: state.lastTestedAt,
        latencyMs: state.latencyMs,
        ...chatsForBackup(state),
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


/**
 * A stored changes card out of anything. The changes were checked against the
 * stores when the answer arrived; what is checked here is only that each is
 * still the SHAPE `applyChanges` reads — anything else is dropped, and Apply
 * skips an id that has gone since.
 */
function sanitizeChangesBlock(raw: Rec): ChangesChatBlock | null {
  const changes = (Array.isArray(raw.changes) ? raw.changes : []).filter(
    (c): c is AiChange =>
      isRec(c) && c.target === 'task' && typeof c.field === 'string',
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

function sanitizeMessage(raw: unknown): AiMessage | null {
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
    if (isRec(block) && block.type === 'changes') {
      const clean = sanitizeChangesBlock(block);
      if (clean) blocks.push(clean);
      continue;
    }
    // Text and summary blocks go through the SAME validator a live answer does.
    const [valid] = validateBlocks([block]);
    if (valid && (valid.type === 'text' || valid.type === 'summary')) blocks.push(valid);
  }
  return blocks.length > 0 ? { id, role: 'model', blocks, raw: str(raw.raw) ?? '', at } : null;
}

/** The messages of one filed list, renderable. */
function sanitizeMessages(raw: unknown): AiMessage[] {
  return (Array.isArray(raw) ? raw : [])
    .map(sanitizeMessage)
    .filter((m): m is AiMessage => m != null)
    .slice(-CHAT_CAP);
}

/** A renderable AI state out of anything at all — the filed shape, see the header. */
export function sanitizeAi(input: unknown): AiValue {
  const raw = isRec(input) ? input : {};
  const chat = sanitizeMessages(isRec(raw.chats) ? raw.chats[FILED_AS] : undefined);
  const rawArchive = isRec(raw.archive) ? raw.archive[FILED_AS] : undefined;
  const archive: ArchivedChat[] = [];
  for (const entry of Array.isArray(rawArchive) ? rawArchive : []) {
    if (!isRec(entry)) continue;
    const id = str(entry.id);
    const messages = sanitizeMessages(entry.messages);
    if (!id || messages.length === 0) continue;
    archive.push({
      id,
      title: str(entry.title) ?? '',
      startedAt: str(entry.startedAt) ?? messages[0].at,
      updatedAt: str(entry.updatedAt) ?? messages[messages.length - 1].at,
      messages,
    });
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
    chat,
    archive: archive.slice(0, ARCHIVE_CAP),
  };
}

/* ------------------------------------------------------------------ */
/* Backups                                                             */
/* ------------------------------------------------------------------ */

/**
 * The conversations as a backup carries them — the open chat and the past
 * chats, filed under `Tasks` (see the header). NEVER the key (that is in the
 * keystore, not this store) and not the connection state — a restored phone
 * has to test its own key. `proposals` is the slot 3.0.0 kept its routine
 * suggestions in; a Tasks chat never had one, and it is written empty so a
 * 3.0.0 reader finds the shape it expects.
 */
export function chatsForBackup(state: Pick<AiValue, 'chat' | 'archive'>): {
  chats: Record<string, AiMessage[]>;
  archive: Record<string, ArchivedChat[]>;
  proposals: Record<string, never>;
} {
  return {
    chats: { [FILED_AS]: state.chat },
    archive: { [FILED_AS]: state.archive },
    proposals: {},
  };
}

/** The open chat if it has anything in it, plus every past chat. */
function countChats(state: Pick<AiValue, 'chat' | 'archive'>): number {
  return (state.chat.length > 0 ? 1 : 0) + state.archive.length;
}
