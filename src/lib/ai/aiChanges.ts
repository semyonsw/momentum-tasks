/**
 * Changes to the tasks the assistant may suggest — a task added, renamed,
 * rescheduled, given a target or stopped, and a day answered — checked,
 * described, and applied.
 *
 *   model's items ──validateChanges──► AiChange[] ──describeChanges──► the card
 *                                          └──── applied in `state/aiActions.ts`
 *
 * ── WHY A CARD AND NOT PROSE ───────────────────────────────────────────────
 *
 * Asked "make stretching three times a week", a model that can only reply in
 * prose leaves the user to find the field. Instead it writes one card listing
 * each change as `from → to`, and Apply writes them all, with one Undo.
 *
 * ── THE CONTRACT ──────────────────────────────────────────────────────────
 *
 * Nothing is written without a tap. Every id must be one the context named (an
 * unknown one is dropped, never guessed at); every number is clamped to the
 * range its own editor allows. The card is drawn from what SURVIVED, so it
 * never shows a change Apply would not make.
 *
 * ── AND THE DAYS THE USER ANSWERS, NOT ONLY THE TASKS THEY TUNE ───────────
 *
 * "Mark stretching done for yesterday" is a thing the user does by hand on the
 * tasks screen, so the chat can draft it too — as a card, through the same
 * Apply and the same Undo, never written behind the user's back.
 *
 * Pure, like everything in `lib/`: the stores are read by the caller and passed
 * in, and the writes happen in `state/aiActions.ts`.
 */

import {
  TARGET_MAX,
  UNIT_MAX,
  WEEKLY_MAX,
  type Task,
  type TaskSchedule,
  type Weekday,
} from '../tasks';
import { t, type Language } from '../i18n';
import type { ID } from '../../types/models';

/* ------------------------------------------------------------------ */
/* The changes                                                         */
/* ------------------------------------------------------------------ */

export type TaskField =
  | 'add'
  | 'name'
  | 'schedule'
  | 'target'
  | 'archive'
  /** A DAY's answer, not the task's shape — `day` says which. */
  | 'done'
  | 'excused'
  | 'clear';

/** The fields that answer one day rather than change the task. */
export const TASK_DAY_FIELDS: readonly TaskField[] = ['done', 'excused', 'clear'];

/**
 * One change, already checked. `value` is the new value in the field's own
 * terms — `null` where the field can be cleared (a task's target removed).
 *
 * `target` is always `task`: it is the word the model writes and the word a
 * stored card carries, so a chat filed by Momentum 3.0.0 reads back unchanged.
 */
export interface AiChange {
      target: 'task';
      /** Absent for `add`. */
      id?: ID;
      field: TaskField;
      /** The name for `name` and `add`; the count for `target`; true for `archive`. */
      value: string | number | boolean | null;
      /** For `schedule` and `add`. */
      schedule?: TaskSchedule;
      /** For `target`: what is counted ("glasses"). */
      unit?: string;
      /** For `done` / `excused` / `clear`: the day answered, `YYYY-MM-DD`. */
      day?: string;
}

/** What the validator needs to know about the stores. */
export interface ChangeContext {
  tasks: readonly Pick<Task, 'id' | 'name' | 'schedule' | 'target' | 'archivedAt'>[];
  /** Today, `YYYY-MM-DD` — what a missing `day` means, and the latest one allowed. */
  today?: string;
}

/** A task name, as the editor holds it. */
const TASK_NAME_MAX = 60;

/* ------------------------------------------------------------------ */
/* Reading the model's items                                           */
/* ------------------------------------------------------------------ */

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

function num(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function str(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed === '' ? null : trimmed.slice(0, max);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** "Rename", "re-name", " RENAME " → `rename`. */
function fieldKey(value: unknown): string {
  return typeof value === 'string'
    ? value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
    : '';
}

const TASK_ALIASES: Record<string, TaskField> = {
  add: 'add',
  create: 'add',
  new: 'add',
  name: 'name',
  rename: 'name',
  schedule: 'schedule',
  target: 'target',
  archive: 'archive',
  stop: 'archive',
  done: 'done',
  tick: 'done',
  check: 'done',
  complete: 'done',
  excused: 'excused',
  excuse: 'excused',
  skip: 'excused',
  clear: 'clear',
  untick: 'clear',
};

/**
 * A day the model named, or today when it named none — null for a malformed date
 * or one after today. Nothing is answered in the future: a task not yet asked
 * is a thing that has not happened.
 */
export function readDay(value: unknown, today: string): string | null {
  if (value == null || value === '') return today;
  if (typeof value !== 'string') return null;
  const day = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return day > today ? null : day;
}

/**
 * A task schedule from the item: `days` (0 = Monday) makes it those weekdays,
 * `number` makes it N times a week, `text` may name the kind ("daily"). Nothing
 * at all is `fallback`. `once` is not offered — a one-off job is not something
 * an assistant reading a habit history should be scheduling.
 */
function readSchedule(item: Rec, fallback: TaskSchedule | null): TaskSchedule | null {
  const kind = fieldKey(item.text);
  const days = Array.isArray(item.days)
    ? [
        ...new Set(
          item.days
            .map((d) => num(d))
            .filter((d): d is number => d != null && Number.isInteger(d) && d >= 0 && d <= 6),
        ),
      ].sort((a, b) => a - b)
    : [];
  const times = num(item.number);
  if (kind === 'daily' || kind === 'every_day') return { kind: 'daily' };
  if (days.length > 0) {
    return days.length === 7 ? { kind: 'daily' } : { kind: 'weekdays', days: days as Weekday[] };
  }
  if (times != null && times > 0) {
    const n = clamp(Math.round(times), 1, WEEKLY_MAX);
    return n === WEEKLY_MAX ? { kind: 'daily' } : { kind: 'weekly', times: n };
  }
  return fallback;
}

function validateTaskItem(item: Rec, ctx: ChangeContext): AiChange | null {
  const field = TASK_ALIASES[fieldKey(item.field)];
  if (!field) return null;
  if (field === 'add') {
    // The name in `text`; the schedule from `days` / `number`, daily without.
    const name = str(item.text, TASK_NAME_MAX);
    if (!name) return null;
    const schedule = readSchedule({ days: item.days, number: item.number }, { kind: 'daily' });
    const taken = ctx.tasks.some(
      (task) => !task.archivedAt && task.name.trim().toLowerCase() === name.toLowerCase(),
    );
    return taken || !schedule ? null : { target: 'task', field, value: name, schedule };
  }
  const id = typeof item.id === 'string' ? item.id.trim() : '';
  const task = ctx.tasks.find((candidate) => candidate.id === id && !candidate.archivedAt);
  if (!task) return null;
  if (TASK_DAY_FIELDS.includes(field)) {
    if (!ctx.today) return null;
    const day = readDay(item.day, ctx.today);
    return day ? { target: 'task', id, field, value: null, day } : null;
  }
  if (field === 'name') {
    const name = str(item.text, TASK_NAME_MAX);
    return name && name !== task.name ? { target: 'task', id, field, value: name } : null;
  }
  if (field === 'schedule') {
    const schedule = readSchedule(item, null);
    return schedule ? { target: 'task', id, field, value: null, schedule } : null;
  }
  if (field === 'target') {
    const n = num(item.number);
    if (n == null) return null;
    if (n <= 0) return task.target ? { target: 'task', id, field, value: null } : null;
    const unit = str(item.text, UNIT_MAX) ?? task.target?.unit ?? '';
    return {
      target: 'task',
      id,
      field,
      value: clamp(Math.round(n), 1, TARGET_MAX),
      unit,
    };
  }
  return { target: 'task', id, field: 'archive', value: true };
}

/** Same thing changed twice in one card — the later one is what the model settled on. */
function identity(change: AiChange): string {
  // Case-folded, as the "already a task" check above is: `Stretch` and `stretch`
  // are one task asked for twice, not two tasks.
  if (change.field === 'add') {
    return `task:add:${String(change.value).toLowerCase()}`;
  }
  // A day's answer is per day: done Monday and done Tuesday are two changes.
  if (change.day) return `task:${change.id}:day:${change.day}`;
  return `task:${change.id ?? ''}:${change.field}`;
}

/**
 * The changes worth offering out of what the model wrote. Unknown targets,
 * unknown ids and unreadable fields are all dropped — see the file header.
 */
export function validateChanges(items: readonly unknown[], ctx: ChangeContext): AiChange[] {
  const out = new Map<string, AiChange>();
  for (const raw of items) {
    if (!isRec(raw) || fieldKey(raw.target) !== 'task') continue;
    const change = validateTaskItem(raw, ctx);
    if (!change) continue;
    const key = identity(change);
    out.delete(key);
    out.set(key, change);
  }
  return [...out.values()];
}

/* ------------------------------------------------------------------ */
/* What the card says                                                   */
/* ------------------------------------------------------------------ */

/** The values in force now, for each change's `from`. */
export interface CurrentValues {
  tasks: readonly Pick<Task, 'id' | 'name' | 'schedule' | 'target'>[];
  /** A day as the card prints it — `27 Oct`. Absent: the ISO date. */
  formatDay?: (day: string) => string;
}

/** One line of the card: `Stretch · Schedule  Every day → 3× a week`. */
export interface ChangeRow {
  subject: string;
  label: string;
  /** Empty when there was nothing before (a new task). */
  from: string;
  to: string;
}

const WEEKDAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function scheduleText(schedule: TaskSchedule, lang: Language): string {
  if (schedule.kind === 'daily') return t('Every day', lang);
  if (schedule.kind === 'once') return schedule.day;
  if (schedule.kind === 'weekly') return t('{n}× a week', lang, { n: schedule.times });
  return schedule.days.map((d) => t(WEEKDAY_KEYS[d], lang)).join(' ');
}

/**
 * The card's rows, computed when the reply is filed and STORED with it: once
 * applied, the stores hold the new values, and a `from` recomputed then would
 * read `3× a week → 3× a week`.
 */
export function describeChanges(
  changes: readonly AiChange[],
  now: CurrentValues,
  lang: Language,
): ChangeRow[] {
  const tasks = new Map(now.tasks.map((task) => [task.id, task]));
  const tr = (key: string) => t(key, lang);
  const dayText = (day: string) => (now.formatDay ? now.formatDay(day) : day);
  const rows: ChangeRow[] = [];
  for (const change of changes) {
    if (change.day) {
      const task = change.id ? tasks.get(change.id) : undefined;
      if (!task) continue;
      const to =
        change.field === 'done'
          ? tr('Done')
          : change.field === 'excused'
            ? tr('Excused')
            : tr('Not answered');
      rows.push({ subject: task.name, label: dayText(change.day), from: '', to });
      continue;
    }
    if (change.field === 'add') {
      rows.push({
        subject: String(change.value),
        label: tr('New task'),
        from: '',
        to: change.schedule ? scheduleText(change.schedule, lang) : tr('Every day'),
      });
      continue;
    }
    const task = change.id ? tasks.get(change.id) : undefined;
    if (!task) continue;
    if (change.field === 'name') {
      rows.push({
        subject: task.name,
        label: tr('Name'),
        from: task.name,
        to: String(change.value),
      });
    } else if (change.field === 'schedule' && change.schedule) {
      rows.push({
        subject: task.name,
        label: tr('Schedule'),
        from: scheduleText(task.schedule, lang),
        to: scheduleText(change.schedule, lang),
      });
    } else if (change.field === 'target') {
      const was = task.target ? `${task.target.count} ${task.target.unit}`.trim() : tr('None');
      const to =
        change.value == null ? tr('None') : `${String(change.value)} ${change.unit ?? ''}`.trim();
      rows.push({ subject: task.name, label: tr('Daily target'), from: was, to });
    } else if (change.field === 'archive') {
      rows.push({ subject: task.name, label: tr('Stop this task'), from: '', to: tr('Archived') });
    }
  }
  return rows;
}
