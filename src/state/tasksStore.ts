/**
 * The daily-task log, on disk.
 *
 * AsyncStorage rather than SQLite, like `libraryStore` and unlike
 * `workoutHistoryStore`: a dozen tasks and one small record per answered day is
 * a few hundred KB after a decade, it is read whole on every launch, and the
 * screens that read it want the whole month at once anyway. The write-heavy
 * table in this app is `set_history` and this is not it.
 *
 * ── THE LOG IS SPARSE AND IT IS KEYED BY DAY ──────────────────────────────
 *
 * `log[taskId][YYYY-MM-DD]`. Days nobody answered have no row at all, which is
 * what makes UNANSWERED the default rather than a value that has to be written
 * for every task every midnight by a job that will not run when the phone is
 * off. It also means the month grid is a lookup rather than a scan.
 *
 * ── THE SEED IS A LIST, NOT A PAST ────────────────────────────────────────
 *
 * `seedTasks()` ships the nine rows and NOT ONE MARK — the same rule
 * `data/seed.ts` states for training. It is also a function rather than a
 * constant because every task needs `startedOn` to be the day the app first
 * opened: a hard-coded date would draw months of unanswered squares for a phone
 * set up last week, and every one of them would read as a day you let go by.
 *
 * Rehydration is TOTAL and it replaces rather than merges, like `libraryStore`:
 * a first launch has nothing persisted, so the seeds stand — `merge` IS called
 * then, with `undefined`, and says so explicitly; every launch after that is the
 * user's list, seeds included or deleted.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistedStorage } from './persistStorage';

import { clampHour, clampMinute, dayKey } from '../lib/days';
import { t } from '../lib/i18n';
import { toggledMark } from '../lib/taskTap';
import { useSettings } from './settingsStore';
import {
  asksOn,
  clearExcused,
  COUNT_MAX,
  entryOf,
  isCounted,
  isEmptyEntry,
  tappedCount,
  TARGET_MAX,
  UNIT_MAX,
  WEEKLY_MAX,
  withCount,
  type TaskEntry,
  type TaskTarget,
  excuseCells,
  excuseRange,
  type ExcusedCell,
  REMIND_AGAIN_MINUTES,
  reorderWithinVisible,
  type Task,
  type TaskAutoSource,
  type TaskLog,
  type TaskMark,
  type TaskReminder,
  type TaskSchedule,
  type Weekday,
} from '../lib/tasks';
import type { ID } from '../types/models';

export interface TasksValue {
  tasks: Task[];
  log: TaskLog;
}

/**
 * The nine rows the app opens with, in English — the key the catalogue is
 * indexed by, and what a device installed before 1.9.0 has on disk.
 *
 * Names rather than ids because a task is free text the user edits: the rename
 * below matches the exact shipped string and leaves anything else alone.
 */
export const SEED_TASK_NAMES: [string, 'daily' | 'mwf', TaskAutoSource | null][] = [
  ['Morning Bible/Narek reading', 'daily', null],
  ['In-Work Task Report', 'mwf', null],
  ['Gym / Boxing', 'mwf', 'workout'],
  ['Productivity/Day Tasks', 'daily', null],
  ['Evening Bible reading', 'daily', null],
  ["Plan tomorrow's tasks", 'daily', null],
  ['Book reading before sleep', 'daily', null],
  ['Sleep before midnight', 'daily', null],
  ['Track expenses', 'daily', 'money'],
];

/** The nine rows the app opens with, starting today. */
export function seedTasks(today = dayKey(new Date())): Task[] {
  const daily: TaskSchedule = { kind: 'daily' };
  const mwf: TaskSchedule = { kind: 'weekdays', days: [0, 2, 4] };
  const rows: [string, TaskSchedule, TaskAutoSource | null][] = SEED_TASK_NAMES.map(
    ([english, kind, auto]) => [
      t(english, useSettings.getState().language),
      kind === 'daily' ? daily : mwf,
      auto,
    ],
  );
  return rows.map(([name, schedule, auto], order) => ({
    id: `task_${order + 1}`,
    name,
    schedule,
    auto,
    startedOn: today,
    // The nine shipped rows are silent, like every task is until it is asked to
    // speak — see `Task.reminder`.
    reminder: null,
    archivedAt: null,
    order,
  }));
}

function sanitizeSchedule(raw: unknown, fallbackDay: string): TaskSchedule {
  const value = raw as
    { kind?: string; days?: unknown; day?: unknown; times?: unknown } | undefined;
  if (value && value.kind === 'weekdays') {
    const days = Array.isArray(value.days) ? value.days : [];
    const kept = [
      ...new Set(
        days.filter((day): day is Weekday => Number.isInteger(day) && day >= 0 && day <= 6),
      ),
    ];
    return { kind: 'weekdays', days: kept.sort((a, b) => a - b) };
  }
  if (value && value.kind === 'weekly') {
    /*
     * N times a week (T2), N whole and 1–7. An unreadable N falls to 1, the
     * least the shape can ask — a junk value should never make a week harder.
     */
    const times = Number(value.times);
    return {
      kind: 'weekly',
      times: Number.isFinite(times) ? Math.max(1, Math.min(WEEKLY_MAX, Math.round(times))) : 1,
    };
  }
  if (value && value.kind === 'once') {
    /*
     * A one-day task with an unreadable day would ask on no day ever, which is a
     * row that sits in the list doing nothing and cannot be explained. It falls
     * back to the task's own start day — the only other date it carries.
     */
    const day = typeof value.day === 'string' && DAY_KEY.test(value.day) ? value.day : fallbackDay;
    return { kind: 'once', day };
  }
  return { kind: 'daily' };
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** A time the wheel could have produced, or null. */
function sanitizeReminder(raw: unknown): TaskReminder | null {
  const value = raw as Partial<TaskReminder> | null | undefined;
  if (!value || typeof value !== 'object') return null;
  if (!Number.isFinite(value.hour) || !Number.isFinite(value.minute)) return null;
  const reminder: TaskReminder = {
    hour: clampHour(Number(value.hour)),
    minute: clampMinute(Number(value.minute)),
  };
  // Only a spacing the editor offers survives: a stray `every: 1` from a hand-
  // edited backup would otherwise arm sixty alerts an hour.
  if ((REMIND_AGAIN_MINUTES as readonly number[]).includes(Number(value.every))) {
    reminder.every = Number(value.every);
  }
  return reminder;
}

/**
 * A target the editor could have produced, or undefined — and undefined means an
 * ordinary task, which is what every task saved before targets existed is. A
 * count that is not a whole number of at least one is not a target.
 */
function sanitizeTarget(raw: unknown): TaskTarget | undefined {
  const value = raw as { count?: unknown; unit?: unknown } | null | undefined;
  if (!value || typeof value !== 'object') return undefined;
  const count = Number(value.count);
  if (!Number.isInteger(count) || count < 1) return undefined;
  const unit = typeof value.unit === 'string' ? value.unit.trim().slice(0, UNIT_MAX) : '';
  return { count: Math.min(TARGET_MAX, count), unit };
}

function sanitizeTask(raw: unknown, index: number, today: string): Task | null {
  const value = raw as Partial<Task> | undefined;
  if (!value || typeof value.id !== 'string' || value.id === '') return null;
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (name === '') return null;
  const auto = value.auto === 'workout' || value.auto === 'money' ? value.auto : null;
  const startedOn =
    typeof value.startedOn === 'string' && value.startedOn !== '' ? value.startedOn : today;
  const target = sanitizeTarget(value.target);
  // A habit to avoid (T7): only a literal `true`, and never beside a target —
  // the target is the one carrying data, so it is the one kept.
  const avoid = value.avoid === true && !target;
  return {
    // Spread only when present, so an old task comes back key for key.
    ...(target ? { target } : {}),
    ...(avoid ? { avoid: true as const } : {}),
    id: value.id,
    name,
    schedule: sanitizeSchedule(value.schedule, startedOn),
    auto,
    startedOn,
    reminder: sanitizeReminder(value.reminder),
    archivedAt: typeof value.archivedAt === 'string' ? value.archivedAt : null,
    order: Number.isFinite(value.order) ? Number(value.order) : index,
  };
}

function sanitizeLog(raw: unknown, tasks: readonly Task[]): TaskLog {
  const source = (raw ?? {}) as Record<string, unknown>;
  const known = new Set(tasks.map((task) => task.id));
  const log: TaskLog = {};
  for (const [taskId, days] of Object.entries(source)) {
    // A log for a task that no longer exists is dropped: it can never be read
    // and it would otherwise grow forever behind a list the user has curated.
    if (!known.has(taskId) || !days || typeof days !== 'object') continue;
    const kept: TaskLog[string] = {};
    for (const [day, entry] of Object.entries(days as Record<string, unknown>)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      const value = entry as { mark?: unknown; note?: unknown; count?: unknown } | null;
      const mark =
        value?.mark === 'done' || value?.mark === 'missed' ? (value.mark as TaskMark) : null;
      const note = typeof value?.note === 'string' ? value.note : '';
      // A counted day's parts (T1). Kept even on a task that has since lost its
      // target — the number is still what happened, and the target may return.
      const count =
        Number.isInteger(value?.count) && (value?.count as number) > 0
          ? Math.min(COUNT_MAX, value?.count as number)
          : undefined;
      const answer: TaskEntry = count !== undefined ? { mark, note, count } : { mark, note };
      if (isEmptyEntry(answer)) continue;
      kept[day] = answer;
    }
    if (Object.keys(kept).length > 0) log[taskId] = kept;
  }
  return log;
}

/** The one validator. Total: `unknown` in, a complete value out. */
export function sanitizeTasks(input: Partial<TasksValue> | undefined | null): TasksValue {
  const today = dayKey(new Date());
  const rawTasks = Array.isArray(input?.tasks) ? input.tasks : [];
  const tasks = rawTasks
    .map((task, index) => sanitizeTask(task, index, today))
    .filter((task): task is Task => task !== null)
    .sort((a, b) => a.order - b.order)
    .map((task, order) => ({ ...task, order }));
  return { tasks, log: sanitizeLog(input?.log, tasks) };
}

/**
 * Everything a new task is, as one object.
 *
 * It was `(name, schedule)`, and it grew a start day and a reminder in the same
 * release — three positional arguments where two of them are optional is a call
 * site nobody can read, and the fourth would have been worse.
 */
export interface TaskSpec {
  name: string;
  schedule: TaskSchedule;
  /**
   * The first day it asks. Defaults to TODAY, and that default is the whole
   * point: a task added this evening must not appear on yesterday's list and
   * turn a day that was finished into a day with a hole in it.
   */
  startedOn?: string;
  reminder?: TaskReminder | null;
  /** A target counted in parts (T1). Absent or null: an ordinary task. */
  target?: TaskTarget | null;
  /** A habit to avoid (T7). Ignored beside a target. */
  avoid?: boolean;
}

interface TasksState extends TasksValue {
  addTask: (spec: TaskSpec) => ID | null;
  updateTask: (
    id: ID,
    patch: {
      name?: string;
      schedule?: TaskSchedule;
      startedOn?: string;
      /** `null` clears it, which is why this is not `TaskReminder | undefined`. */
      reminder?: TaskReminder | null;
      /**
       * `null` makes it an ordinary task again. The days already counted keep
       * their marks and their numbers — see "A COUNTED TASK…" in `lib/tasks.ts`.
       */
      target?: TaskTarget | null;
      /** A habit to avoid (T7); false makes it an ordinary task again. */
      avoid?: boolean;
    },
  ) => void;
  archiveTask: (id: ID) => void;
  /**
   * Put `movedId` at `toIndex` within the rows the DAY SCREEN is showing.
   *
   * `visibleIds` rather than a bare index because the day screen shows a subset —
   * a Mon/Wed/Fri task is simply not there on a Tuesday, and "third row to the
   * top" has to mean third VISIBLE row. `reorderWithinVisible` in `lib/tasks.ts`
   * has the whole argument; this only renumbers afterwards, because `order` is
   * persisted and the list sorts by it, so it has to stay a dense 0..n.
   */
  reorderTasks: (visibleIds: readonly ID[], movedId: ID, toIndex: number) => void;
  setMark: (id: ID, day: string, mark: TaskMark | null) => void;
  /**
   * The circle's tap: done ↔ unanswered, and an excused day becomes done. It
   * never writes `missed` — that is `setMark(…, 'missed')`, behind the row's hold
   * menu. `lib/taskTap.ts` has why. Returns the mark it replaced, for an Undo.
   */
  toggleMark: (id: ID, day: string) => TaskMark | null;
  /**
   * A counted row's tap (T1): one more part, or back to zero from a finished
   * day (`tappedCount`). Returns the entry it replaced, for the Undo; null (and
   * nothing written) on a task with no target.
   */
  tapCount: (id: ID, day: string) => TaskEntry | null;
  /** "Set a number…" (T1): the day's count, the mark judged from it. Returns the old entry. */
  setCount: (id: ID, day: string, count: number) => TaskEntry | null;
  /** Put an entry back exactly as it was — the Undo of a count. */
  restoreEntry: (id: ID, day: string, entry: TaskEntry) => void;
  setNote: (id: ID, day: string, note: string) => void;
  /**
   * Vacation mode (T3): excuse `from`…`to` for `taskIds` in one action. Writes
   * the ordinary `missed` mark — `excuseRange` in `lib/tasks.ts` has why — and
   * returns exactly the squares it wrote, for the Undo.
   */
  pauseTasks: (taskIds: readonly ID[], from: string, to: string) => ExcusedCell[];
  /** Undo a pause, or `Resume now`: those squares back to unanswered if still excused. */
  unpause: (cells: readonly ExcusedCell[]) => void;
  /** The inverse: excuse exactly these squares where still unanswered (Resume's Undo). */
  excuse: (cells: readonly ExcusedCell[]) => void;
  /**
   * Tick every live task fed by `source`, for `day`, if nobody has answered it.
   *
   * A deliberate answer WINS — training on a day you had already marked "missed
   * on purpose" leaves your mark alone, because the app watching you train is
   * not a reason for it to overrule you.
   */
  tickAuto: (source: TaskAutoSource, day?: string) => void;
  importTasks: (raw: unknown) => void;
}

function writeEntry(
  log: TaskLog,
  id: ID,
  day: string,
  patch: { mark?: TaskMark | null; note?: string },
): TaskLog {
  const current = log[id]?.[day] ?? { mark: null, note: '' };
  // The spread carries a counted day's parts through a note or a skip.
  return putEntry(log, id, day, {
    ...current,
    mark: patch.mark !== undefined ? patch.mark : current.mark,
    note: patch.note ?? current.note,
  });
}

/** Write a whole entry. An empty one is deleted rather than stored, so the log stays sparse. */
function putEntry(log: TaskLog, id: ID, day: string, next: TaskEntry): TaskLog {
  const days = { ...(log[id] ?? {}) };
  if (isEmptyEntry(next)) delete days[day];
  else days[day] = next;
  const updated = { ...log };
  if (Object.keys(days).length === 0) delete updated[id];
  else updated[id] = days;
  return updated;
}

export const useTasks = create<TasksState>()(
  persist(
    (set, get) => ({
      tasks: seedTasks(),
      log: {},

      addTask: (spec) => {
        const trimmed = spec.name.trim();
        if (trimmed === '') return null;
        const id = `task_${Date.now().toString(36)}`;
        const today = dayKey(new Date());
        /*
         * A one-day task starts on its own day, whatever was passed.
         *
         * Those two dates are the same fact for a `once` row, and letting them
         * differ is how you get a task whose schedule says the 14th while
         * `startedOn` says the 20th — `asksOn` answers from the schedule, so the
         * row would be right and the detail screen's "since" line would be a lie.
         * That includes a task set for TOMORROW, which is the whole reason the
         * shape exists.
         */
        const startedOn =
          spec.schedule.kind === 'once' ? spec.schedule.day : (spec.startedOn ?? today);
        set((state) => ({
          tasks: [
            ...state.tasks,
            {
              id,
              name: trimmed,
              schedule: spec.schedule,
              auto: null,
              startedOn,
              reminder: spec.reminder ?? null,
              archivedAt: null,
              order: state.tasks.length,
              ...(spec.target ? { target: spec.target } : {}),
              ...(spec.avoid && !spec.target ? { avoid: true as const } : {}),
            },
          ],
        }));
        return id;
      },

      updateTask: (id, patch) =>
        set((state) => ({
          tasks: state.tasks.map((task) => {
            if (task.id !== id) return task;
            const name = patch.name?.trim();
            const schedule = patch.schedule ?? task.schedule;
            const next: Task = { ...task };
            if (patch.target === null) delete next.target;
            else if (patch.target !== undefined) next.target = patch.target;
            if (patch.avoid === false) delete next.avoid;
            else if (patch.avoid === true) next.avoid = true;
            // Never both (see `Task.avoid`): a target wins, as in the sanitizer.
            if (next.target) delete next.avoid;
            return {
              ...next,
              name: name !== undefined && name !== '' ? name : task.name,
              schedule,
              // Same rule as `addTask`: for a one-day row the two dates are one
              // fact, so the schedule's day is the answer to both.
              startedOn:
                schedule.kind === 'once' ? schedule.day : (patch.startedOn ?? task.startedOn),
              reminder: patch.reminder !== undefined ? patch.reminder : task.reminder,
            };
          }),
        })),

      // Archived, not deleted: the marks stay, and so does every month that
      // already drew them.
      archiveTask: (id) =>
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === id ? { ...task, archivedAt: new Date().toISOString() } : task,
          ),
        })),

      reorderTasks: (visibleIds, movedId, toIndex) =>
        set((state) => {
          const ordered = [...state.tasks].sort((a, b) => a.order - b.order);
          const nextIds = reorderWithinVisible(
            ordered.map((task) => task.id),
            visibleIds,
            movedId,
            toIndex,
          );
          const byId = new Map(ordered.map((task) => [task.id, task]));
          const tasks: Task[] = [];
          nextIds.forEach((id, order) => {
            const task = byId.get(id);
            if (task) tasks.push({ ...task, order });
          });
          return { tasks };
        }),

      setMark: (id, day, mark) =>
        set((state) => ({ log: writeEntry(state.log, id, day, { mark }) })),

      toggleMark: (id, day) => {
        const current = get().log[id]?.[day]?.mark ?? null;
        const next = toggledMark(current);
        set((state) => ({ log: writeEntry(state.log, id, day, { mark: next }) }));
        return current;
      },

      tapCount: (id, day) => {
        const task = get().tasks.find((row) => row.id === id);
        if (!task || !isCounted(task)) return null;
        const before = entryOf(get().log, id, day);
        const next = withCount(before, tappedCount(task, before), task.target.count);
        set((state) => ({ log: putEntry(state.log, id, day, next) }));
        return before;
      },

      setCount: (id, day, count) => {
        const task = get().tasks.find((row) => row.id === id);
        if (!task || !isCounted(task)) return null;
        const before = entryOf(get().log, id, day);
        const next = withCount(before, count, task.target.count);
        set((state) => ({ log: putEntry(state.log, id, day, next) }));
        return before;
      },

      restoreEntry: (id, day, entry) =>
        set((state) => ({ log: putEntry(state.log, id, day, entry) })),

      setNote: (id, day, note) =>
        set((state) => ({ log: writeEntry(state.log, id, day, { note }) })),

      pauseTasks: (taskIds, from, to) => {
        const { log, tasks } = get();
        const result = excuseRange(log, tasks, taskIds, from, to);
        if (result.written.length > 0) set({ log: result.log });
        return result.written;
      },

      unpause: (cells) => set((state) => ({ log: clearExcused(state.log, cells) })),

      excuse: (cells) => set((state) => ({ log: excuseCells(state.log, cells) })),

      tickAuto: (source, day = dayKey(new Date())) => {
        /*
         * THE SWITCH IS CHECKED HERE, not at the two call sites.
         *
         * `Let the app tick what it knows` is off, so nothing in the app answers a
         * row on its own — and the guard belongs where the write happens, because
         * there is one write and there will be more callers. Read rather than
         * subscribed: this runs outside React, from a `Finish` and from an amount
         * being saved, and the answer only has to be right at that instant.
         */
        if (!useSettings.getState().autoTickTasks) return;
        const { tasks, log } = get();
        let next = log;
        for (const task of tasks) {
          if (task.auto !== source || task.archivedAt !== null) continue;
          // Only on a day the task asks: a Tuesday workout under a Mon/Wed/Fri
          // "Gym" wrote a hidden `done` that surfaced the day the schedule changed.
          if (!asksOn(task, day)) continue;
          if ((next[task.id]?.[day]?.mark ?? null) !== null) continue;
          next = writeEntry(next, task.id, day, { mark: 'done' });
        }
        if (next !== log) set({ log: next });
      },

      importTasks: (raw) =>
        set({ ...sanitizeTasks(raw as Partial<TasksValue> | undefined | null) }),
    }),
    {
      name: 'tasks',
      /*
       * 2 — THE NINE SHIPPED ROWS ARE RENAMED INTO THE APP'S LANGUAGE, ONCE.
       *
       * Same reasoning as `libraryStore`'s v3: the seeds are only ever used by a
       * FIRST launch, so translating `seedTasks` alone would leave every phone
       * that already has the app reading "Sleep before midnight" in an otherwise
       * Russian screen. Only an exact match on the shipped string is touched — a
       * row the user has reworded is theirs.
       */
      version: 2,
      migrate: renameSeedTasks,
      storage: persistedStorage(),
      partialize: (state) => ({ tasks: state.tasks, log: state.log }),
      // `undefined` on a first launch: keep the seeds rather than sanitise nothing.
      merge: (persisted, current) =>
        persisted == null
          ? current
          : { ...current, ...sanitizeTasks(persisted as Partial<TasksValue>) },
    },
  ),
);

/** Read path for code outside React — the auto-tick callers. */
export function tickTaskSource(source: TaskAutoSource, day?: string): void {
  useTasks.getState().tickAuto(source, day);
}

/**
 * v1 → v2: the nine shipped rows, in the language the app is set to.
 *
 * Exported for the test that pins it — it runs once per device and then never
 * again. Tolerant of shape: it runs on a raw blob from disk, before
 * `sanitizeTasks` has had a look at it.
 */
export function renameSeedTasks(persisted: unknown): unknown {
  if (typeof persisted !== 'object' || persisted === null) return persisted;
  const state = persisted as { tasks?: unknown };
  if (!Array.isArray(state.tasks)) return persisted;

  const shipped = new Set(SEED_TASK_NAMES.map(([name]) => name));
  const lang = useSettings.getState().language;

  return {
    ...state,
    tasks: state.tasks.map((row) => {
      if (typeof row !== 'object' || row === null) return row;
      const task = row as { name?: unknown };
      if (typeof task.name !== 'string' || !shipped.has(task.name)) return row;
      return { ...task, name: t(task.name, lang) };
    }),
  };
}
