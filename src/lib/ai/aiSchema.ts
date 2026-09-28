/**
 * What an answer from the assistant is allowed to look like — the types, the
 * schema Gemini is asked to follow, and the validator that does not take its
 * word for it.
 *
 *   { "blocks": [
 *       { "type": "text", "text": "Bench has sat at 60 kg for three sessions." },
 *       { "type": "summary", "title": "Last 4 weeks", "stats": [...], "rows": [...] },
 *       { "type": "routine_proposal", "proposal": { "kind": "new", ... } }
 *   ] }
 *
 * ── TYPED BLOCKS, NOT PROSE ────────────────────────────────────────────────
 *
 * A chat that renders free text would be a chat whose numbers sit in sentences
 * the screen cannot lay out: a month of spending as a paragraph, a proposal as a
 * list the user has to retype. So the model answers in three shapes the chat
 * already knows how to draw — a short text, a summary (stats, rows, bars, notes)
 * and, in the workout section only, a routine proposal — and anything else is
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
 * the lengths the screen was designed for, and every number that can reach the
 * library is clamped to a range a real routine could hold. A reply that loses
 * everything to these rules is an EMPTY list, and the caller says so in one
 * sentence — it never throws into a render.
 *
 * One field beyond the handoff: `muscle` on a proposed exercise. A name the
 * library does not know becomes a new exercise only if the user accepts it, and
 * an exercise with no muscle group files under nothing in the library tree — so
 * the model is asked which group it is, and a group the app does not have is
 * simply ignored.
 */

import { MUSCLE_GROUPS } from '../muscles';
import type { MuscleGroup } from '../../types/models';

export type AiSection = 'Workout' | 'Tasks' | 'Expenses';

export const AI_SECTIONS: readonly AiSection[] = ['Workout', 'Tasks', 'Expenses'];

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

export type ProposalChange = 'same' | 'changed' | 'new' | 'removed';

export interface ProposedExercise {
  exerciseId?: string;
  name: string;
  sets: number;
  reps: number;
  /** 0 = bodyweight. */
  weightKg: number;
  restSeconds?: number;
  /** The model's own label. Never trusted — `aiProposal` re-derives it. */
  change?: ProposalChange;
  /** Where a NEW exercise files in the library tree. See the file header. */
  muscle?: MuscleGroup;
}

export interface RoutineProposal {
  kind: 'new' | 'edit';
  /** Required for `edit`, and it must be a routine the context named. */
  targetRoutineId?: string;
  name: string;
  focus?: string;
  why: string;
  exercises: ProposedExercise[];
}

export interface ProposalBlock {
  type: 'routine_proposal';
  proposal: RoutineProposal;
}

/**
 * A new TRAINING LOOP: the whole list of routine ids in order (repeats allowed —
 * Push at steps 1 and 4 is the point of a loop), and which step is up next.
 * Applied only on a tap, like a routine proposal, and only in the Workout chat.
 */
export interface SequenceProposal {
  routineIds: string[];
  /** 0-based index of the step to train next. */
  next: number;
  why: string;
}

export interface SequenceBlock {
  type: 'sequence_proposal';
  sequence: SequenceProposal;
}

export type AiBlock = TextBlock | SummaryBlock | ProposalBlock | SequenceBlock;

/* ------------------------------------------------------------------ */
/* The limits                                                          */
/* ------------------------------------------------------------------ */

/**
 * The shape the screen was drawn for. A summary card with nine stats is not a
 * summary, and a routine with twenty exercises is not a suggestion anybody can
 * review on a phone — so these are caps, and the rest is cut rather than
 * scrolled.
 */
export const LIMITS = {
  stats: 3,
  rows: 8,
  bars: 12,
  notes: 4,
  exercises: 12,
  blocks: 8,
  text: 1200,
  label: 60,
  title: 80,
  name: 40,
  why: 400,
  /** Steps in a suggested loop. Twelve is a quarter of training; 24 is room. */
  sequence: 24,
} as const;

/** Every number that can reach the library, and the range it is held to. */
export const CLAMP = {
  sets: { min: 1, max: 10 },
  reps: { min: 1, max: 50 },
  weightKg: { min: 0, max: 500, step: 0.5 },
  restSeconds: { min: 0, max: 600 },
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
            enum: ['text', 'summary', 'routine_proposal', 'sequence_proposal'],
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
          proposal: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['new', 'edit'] },
              targetRoutineId: str,
              name: str,
              focus: str,
              why: str,
              exercises: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    exerciseId: str,
                    name: str,
                    sets: { type: 'integer' },
                    reps: { type: 'integer' },
                    weightKg: { type: 'number' },
                    restSeconds: { type: 'integer' },
                    change: { type: 'string', enum: ['same', 'changed', 'new', 'removed'] },
                    muscle: { type: 'string', enum: [...MUSCLE_GROUPS] },
                  },
                  required: ['name', 'sets', 'reps', 'weightKg'],
                },
              },
            },
            required: ['kind', 'name', 'why', 'exercises'],
          },
          sequence: {
            type: 'object',
            description: 'For a "sequence_proposal" block: the WHOLE training loop.',
            properties: {
              routineIds: {
                type: 'array',
                description:
                  'Routine ids from CONTEXT.routines, in training order. Repeats allowed.',
                items: str,
              },
              next: { type: 'integer', description: '0-based index of the step to train next.' },
              why: str,
            },
            required: ['routineIds', 'why'],
          },
        },
        required: ['type'],
        propertyOrdering: [
          'type',
          'text',
          'title',
          'stats',
          'rows',
          'bars',
          'notes',
          'proposal',
          'sequence',
        ],
      },
    },
  },
  required: ['blocks'],
} as const;

/* ------------------------------------------------------------------ */
/* The validator                                                       */
/* ------------------------------------------------------------------ */

export interface ValidateContext {
  section: AiSection;
  /** The routine ids the context named. An `edit` must point at one of them. */
  routineIds: ReadonlySet<string>;
}

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

/** Into `[min, max]`, rounded to whole numbers — sets, reps, rest. */
export function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Kilograms into `[0, 500]` on a 0.5 grid. A plate that does not exist is not a suggestion. */
export function clampWeight(value: number): number {
  const { min, max, step } = CLAMP.weightKg;
  const snapped = Math.round(value / step) * step;
  return Math.min(max, Math.max(min, snapped));
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
const CHANGES = new Set(['same', 'changed', 'new', 'removed']);
const MUSCLES = new Set<string>(MUSCLE_GROUPS);

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

function validateExercise(item: unknown): ProposedExercise | null {
  if (!isRecord(item)) return null;
  const name = text(item.name, LIMITS.name);
  const sets = finite(item.sets);
  const reps = finite(item.reps);
  const weight = finite(item.weightKg);
  if (!name || sets == null || reps == null || weight == null) return null;

  const out: ProposedExercise = {
    name,
    sets: clampInt(sets, CLAMP.sets.min, CLAMP.sets.max),
    reps: clampInt(reps, CLAMP.reps.min, CLAMP.reps.max),
    weightKg: clampWeight(weight),
  };
  const id = text(item.exerciseId, 80);
  if (id) out.exerciseId = id;
  const rest = finite(item.restSeconds);
  if (rest != null) {
    out.restSeconds = clampInt(rest, CLAMP.restSeconds.min, CLAMP.restSeconds.max);
  }
  if (typeof item.change === 'string' && CHANGES.has(item.change)) {
    out.change = item.change as ProposalChange;
  }
  if (typeof item.muscle === 'string' && MUSCLES.has(item.muscle)) {
    out.muscle = item.muscle as MuscleGroup;
  }
  return out;
}

function validateProposal(raw: unknown, ctx: ValidateContext): RoutineProposal | null {
  if (!isRecord(raw)) return null;
  const kind = raw.kind === 'new' || raw.kind === 'edit' ? raw.kind : null;
  const name = text(raw.name, LIMITS.name);
  const why = text(raw.why, LIMITS.why);
  if (!kind || !name || !why) return null;

  const exercises = list(raw.exercises, LIMITS.exercises, validateExercise);
  if (exercises.length === 0) return null;

  const proposal: RoutineProposal = { kind, name, why, exercises };
  if (kind === 'edit') {
    const target = text(raw.targetRoutineId, 80);
    // An edit of a routine the phone did not describe is an edit of nothing.
    if (!target || !ctx.routineIds.has(target)) return null;
    proposal.targetRoutineId = target;
  }
  const focus = text(raw.focus, LIMITS.label);
  if (focus) proposal.focus = focus;
  return proposal;
}

/**
 * The blocks worth drawing out of whatever came back.
 *
 * Takes the PARSED JSON — `{ blocks: [...] }` — or a bare array of blocks, since
 * a model that drops the wrapper has still said something readable. Returns an
 * empty list for anything else; see the file header on why this never throws.
 */
export function validateBlocks(raw: unknown, ctx: ValidateContext): AiBlock[] {
  const source = blockList(raw);
  if (!source) return [];

  const out: AiBlock[] = [];
  let proposals = 0;
  for (const item of source) {
    if (out.length >= LIMITS.blocks) break;
    if (typeof item === 'string') {
      // A bare string in the list is a sentence the model meant as a text block.
      const body = text(item, LIMITS.text);
      if (body) out.push({ type: 'text', text: body });
      continue;
    }
    if (!isRecord(item)) continue;

    if (item.type === 'routine_proposal' || (item.type == null && isRecord(item.proposal))) {
      // Workout only, and one per reply: two suggestions at once is a choice
      // the model should have made, not the user.
      const proposal =
        ctx.section === 'Workout' && proposals === 0 ? validateProposal(item.proposal, ctx) : null;
      if (proposal) {
        out.push({ type: 'routine_proposal', proposal });
        proposals += 1;
        continue;
      }
      // A suggestion that cannot be applied — an edit of a routine id the phone
      // never named, one in a chat that cannot hold one — still carried its reason.
      // Said as text, rather than dropped along with everything it explained.
      // A second one in the same reply is simply the one too many.
      const why =
        proposals === 0 && isRecord(item.proposal) ? text(item.proposal.why, LIMITS.text) : null;
      if (why) out.push({ type: 'text', text: why });
      continue;
    }

    if (item.type === 'sequence_proposal' || (item.type == null && isRecord(item.sequence))) {
      const sequence =
        ctx.section === 'Workout' && !out.some((b) => b.type === 'sequence_proposal')
          ? validateSequence(item.sequence, ctx)
          : null;
      if (sequence) {
        out.push({ type: 'sequence_proposal', sequence });
        continue;
      }
      const why = isRecord(item.sequence) ? text(item.sequence.why, LIMITS.text) : null;
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

function validateSequence(raw: unknown, ctx: ValidateContext): SequenceProposal | null {
  if (!isRecord(raw) || !Array.isArray(raw.routineIds)) return null;
  const why = text(raw.why, LIMITS.why);
  const routineIds: string[] = [];
  for (const id of raw.routineIds) {
    if (routineIds.length >= LIMITS.sequence) break;
    // A step naming a routine the phone never described is a step into nothing.
    if (typeof id === 'string' && ctx.routineIds.has(id.trim())) routineIds.push(id.trim());
  }
  if (!why || routineIds.length === 0) return null;
  const next = finite(raw.next);
  return {
    routineIds,
    next: next == null ? 0 : clampInt(next, 0, routineIds.length - 1),
    why,
  };
}

/** The list of blocks, from any of the shapes a model has been seen to send. */
function blockList(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw;
  if (!isRecord(raw)) return typeof raw === 'string' && raw.trim() !== '' ? [raw] : null;
  if (Array.isArray(raw.blocks)) return raw.blocks;
  // The list serialised INTO a string: `{"blocks": "[{...}]"}`.
  if (typeof raw.blocks === 'string') {
    try {
      const inner: unknown = JSON.parse(raw.blocks);
      if (Array.isArray(inner)) return inner;
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
