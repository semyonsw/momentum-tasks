/**
 * What an answer from the assistant is allowed to look like — the types, the
 * schema Gemini is asked to follow, and the validator that does not take its
 * word for it.
 *
 *   { "blocks": [
 *       { "type": "text", "text": "Bench has sat at 60 kg for three sessions." },
 *       { "type": "summary", "title": "Last 4 weeks", "stats": [...], "rows": [...] },
 *       { "type": "changes_proposal", "changes": { "items": [...], "why": "..." } }
 *   ] }
 *
 * ── TYPED BLOCKS, NOT PROSE ────────────────────────────────────────────────
 *
 * A chat that renders free text would be a chat whose numbers sit in sentences
 * the screen cannot lay out: a month of answered days as a paragraph, a change
 * as a sentence the user has to act on by hand. So the model answers in three
 * shapes the chat already knows how to draw — a short text, a summary (stats,
 * rows, bars, notes) and a card of changes to the tasks — and anything else is
 * dropped rather than shown.
 *
 * ── ONE FLAT OBJECT, BECAUSE GEMINI'S SCHEMA HAS NO `oneOf` ────────────────
 *
 * `responseSchema` is an OpenAPI subset. A union of three block shapes cannot be
 * said in it, so the schema describes ONE block object with a `type` enum and
 * every field optional, and `validateBlocks` below is what decides which fields
 * each type actually needs. The schema steers the model; the validator is the
 * contract.
 *
 * ── THE OUTPUT IS UNTRUSTED ────────────────────────────────────────────────
 *
 * Everything here runs on a string that came off the network from a model that
 * can be wrong in any way at all. So: unknown types are dropped, blocks missing
 * their fields are dropped, strings are trimmed and capped, arrays are cut to
 * the lengths the screen was designed for, and what a change means is checked
 * against the stores before it is ever offered (`aiChanges.ts`). A reply that
 * loses everything to these rules is an EMPTY list, and the caller says so in
 * one sentence — it never throws into a render.
 */

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface SummaryRow {
  label: string;
  value: string;
  delta?: string;
  trend?: 'up' | 'down' | 'flat';
}

export interface SummaryBlock {
  type: 'summary';
  title: string;
  stats?: { label: string; value: string }[];
  rows?: SummaryRow[];
  bars?: { label: string; value: number }[];
  notes?: string[];
}

/**
 * A CHANGE TO THE TASKS: a task added, renamed, rescheduled, given a target or
 * stopped, or a day answered. `lib/ai/aiChanges.ts` owns what each one means,
 * how it is checked, and how it is applied (on a tap, with Undo). The block
 * carries them raw; the validator here only keeps the shape.
 */
export interface ChangesBlock {
  type: 'changes_proposal';
  changes: { items: Record<string, unknown>[]; why: string };
}

export type AiBlock = TextBlock | SummaryBlock | ChangesBlock;

/* ------------------------------------------------------------------ */
/* The limits                                                          */
/* ------------------------------------------------------------------ */

/**
 * The shape the screen was drawn for. A summary card with nine stats is not a
 * summary, and a card of forty changes is not a suggestion anybody can review
 * on a phone — so these are caps, and the rest is cut rather than scrolled.
 */
const LIMITS = {
  stats: 3,
  rows: 8,
  bars: 12,
  notes: 4,
  blocks: 8,
  text: 1200,
  label: 60,
  title: 80,
  why: 400,
  /** Changes in one card — enough for "every task this week", short of a wall. */
  changes: 12,
} as const;

/* ------------------------------------------------------------------ */
/* The schema sent to Gemini                                           */
/* ------------------------------------------------------------------ */

const str = { type: 'string' } as const;

/**
 * `generationConfig.responseSchema`. Plain data, so a test can read it and the
 * request builder can send it verbatim.
 */
export const responseSchema = {
  type: 'object',
  properties: {
    blocks: {
      type: 'array',
      // An empty list was the other way to send "nothing I could read".
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['text', 'summary', 'changes_proposal'],
          },
          text: { type: 'string', description: 'The paragraph, for a "text" block.' },
          title: { type: 'string', description: 'The heading, for a "summary" block.' },
          stats: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: str,
                value: { type: 'string', description: 'A string, e.g. "11" or "60x8".' },
              },
              required: ['label', 'value'],
            },
          },
          rows: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: str,
                value: str,
                delta: str,
                trend: { type: 'string', enum: ['up', 'down', 'flat'] },
              },
              required: ['label', 'value'],
            },
          },
          bars: {
            type: 'array',
            items: {
              type: 'object',
              properties: { label: str, value: { type: 'number' } },
              required: ['label', 'value'],
            },
          },
          notes: { type: 'array', items: str },
          changes: {
            type: 'object',
            description: 'For a "changes_proposal" block: changes to the tasks, applied on a tap.',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    target: { type: 'string', enum: ['task'] },
                    id: {
                      type: 'string',
                      description: 'taskId from CONTEXT; omit for a new task.',
                    },
                    day: { type: 'string', description: 'A date, YYYY-MM-DD; omit for today.' },
                    field: { type: 'string' },
                    number: { type: 'number' },
                    text: { type: 'string' },
                    on: { type: 'boolean' },
                    days: { type: 'array', items: { type: 'integer' } },
                  },
                  required: ['target', 'field'],
                },
              },
              why: str,
            },
            required: ['items', 'why'],
          },
        },
        required: ['type'],
        propertyOrdering: ['type', 'text', 'title', 'stats', 'rows', 'bars', 'notes', 'changes'],
      },
    },
  },
  required: ['blocks'],
} as const;

/* ------------------------------------------------------------------ */
/* The validator                                                       */
/* ------------------------------------------------------------------ */

type Rec = Record<string, unknown>;

function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A trimmed, capped string, or null when there is nothing in it. */
function text(value: unknown, max: number): string | null {
  // A model asked for `"value": "12"` writes `"value": 12` often enough that a
  // number is read as the string it would have been.
  if (typeof value === 'number' && Number.isFinite(value)) value = String(value);
  if (typeof value === 'boolean') value = value ? 'yes' : 'no';
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
}

function finite(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function list<T>(value: unknown, max: number, each: (item: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const item of value) {
    if (out.length >= max) break;
    const kept = each(item);
    if (kept != null) out.push(kept);
  }
  return out;
}

const TRENDS = new Set(['up', 'down', 'flat']);

function validateSummary(raw: Rec): SummaryBlock | null {
  // A summary without a title still has its numbers; the heading is the part
  // that can be done without. (`label` and `name` are where a model puts one
  // when it forgets the field's name.)
  const title = text(raw.title ?? raw.label ?? raw.name, LIMITS.title) ?? '';

  const stats = list(raw.stats, LIMITS.stats, (item) => {
    if (!isRecord(item)) return null;
    const label = text(item.label, LIMITS.label);
    const value = text(item.value, LIMITS.label);
    return label && value ? { label, value } : null;
  });
  const rows = list(raw.rows, LIMITS.rows, (item): SummaryRow | null => {
    if (!isRecord(item)) return null;
    const label = text(item.label, LIMITS.label);
    const value = text(item.value, LIMITS.label);
    if (!label || !value) return null;
    const row: SummaryRow = { label, value };
    const delta = text(item.delta, 16);
    if (delta) row.delta = delta;
    if (typeof item.trend === 'string' && TRENDS.has(item.trend)) {
      row.trend = item.trend as SummaryRow['trend'];
    }
    return row;
  });
  const bars = list(raw.bars, LIMITS.bars, (item) => {
    if (!isRecord(item)) return null;
    const label = text(item.label, 12);
    const value = finite(item.value);
    // A negative bar has nowhere to be drawn, and a bar chart of one direction
    // is what this block is for.
    return label && value != null && value >= 0 ? { label, value } : null;
  });
  const notes = list(raw.notes, LIMITS.notes, (item) =>
    text(isRecord(item) ? (item.text ?? item.note) : item, 240),
  );

  const block: SummaryBlock = { type: 'summary', title };
  if (stats.length) block.stats = stats;
  if (rows.length) block.rows = rows;
  if (bars.length) block.bars = bars;
  if (notes.length) block.notes = notes;
  // A title and nothing under it is a heading, not a summary.
  return stats.length || rows.length || bars.length || notes.length ? block : null;
}

/**
 * The blocks worth drawing out of whatever came back.
 *
 * Takes the PARSED JSON — `{ blocks: [...] }` — or a bare array of blocks, since
 * a model that drops the wrapper has still said something readable. Returns an
 * empty list for anything else; see the file header on why this never throws.
 */
export function validateBlocks(raw: unknown): AiBlock[] {
  const source = blockList(raw);
  if (!source) return [];

  const out: AiBlock[] = [];
  for (const item of source) {
    if (out.length >= LIMITS.blocks) break;
    if (typeof item === 'string') {
      // A bare string in the list is a sentence the model meant as a text block.
      const body = text(item, LIMITS.text);
      if (body) out.push({ type: 'text', text: body });
      continue;
    }
    if (!isRecord(item)) continue;

    if (item.type === 'changes_proposal' || (item.type == null && isRecord(item.changes))) {
      // One per reply: two cards at once is a choice the model should have made,
      // not the user. Its reason survives a bad shape.
      const changes = !out.some((b) => b.type === 'changes_proposal')
        ? validateChangesShape(item.changes)
        : null;
      if (changes) {
        out.push({ type: 'changes_proposal', changes });
        continue;
      }
      const why = isRecord(item.changes) ? text(item.changes.why, LIMITS.text) : null;
      if (why) out.push({ type: 'text', text: why });
      continue;
    }

    if (item.type === 'summary' || (item.type == null && hasSummaryParts(item))) {
      const block = validateSummary(item);
      if (block) {
        out.push(block);
        continue;
      }
    }

    // `text`, or any block whose type the app does not draw: whatever prose it
    // carries is still the answer. A summary with nothing drawable but a
    // sentence falls through to here too.
    const body = text(item.text ?? item.content ?? item.message ?? item.body, LIMITS.text);
    if (body) out.push({ type: 'text', text: body });
  }
  return out;
}

/**
 * The changes block's SHAPE only: a list of objects and a reason. What each item
 * means — which ids exist, which fields a target has, what range a number is held
 * to — needs the stores, and is `lib/ai/aiChanges.ts`'s job at the moment the
 * reply is filed. A bare array is read as the items.
 */
function validateChangesShape(raw: unknown): ChangesBlock['changes'] | null {
  const source = Array.isArray(raw) ? { items: raw } : raw;
  if (!isRecord(source) || !Array.isArray(source.items)) return null;
  const items = source.items.filter(isRecord).slice(0, LIMITS.changes);
  if (items.length === 0) return null;
  return { items, why: text(source.why, LIMITS.why) ?? '' };
}

/** The list of blocks, from any of the shapes a model has been seen to send. */
function blockList(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw;
  if (!isRecord(raw)) return typeof raw === 'string' && raw.trim() !== '' ? [raw] : null;
  if (Array.isArray(raw.blocks)) return raw.blocks;
  // The list serialised INTO a string: `{"blocks": "[{...}]"}`.
  if (typeof raw.blocks === 'string') {
    // Anything else that parses — one block, a whole reply, a quoted sentence —
    // is read through the same shapes; what reads as nothing is the sentence.
    try {
      const inner: unknown = JSON.parse(raw.blocks);
      return Array.isArray(inner) ? inner : (blockList(inner) ?? [raw.blocks]);
    } catch {
      return [raw.blocks];
    }
  }
  // One block with no wrapper at all.
  if (typeof raw.type === 'string' || typeof raw.text === 'string') return [raw];
  for (const key of ['response', 'answer', 'reply']) {
    if (raw[key] != null) return blockList(raw[key]);
  }
  return null;
}

function hasSummaryParts(item: Rec): boolean {
  return ['stats', 'rows', 'bars', 'notes'].some((key) => Array.isArray(item[key]));
}
