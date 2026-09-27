/**
 * What the assistant is allowed to know — built on the phone, from the stores,
 * one section at a time, and small.
 *
 *   buildWorkoutContext   routines, the library's names, the last 20 weeks of
 *                         sessions in the app's own shorthand, per-exercise
 *                         rollups, sets per cluster, and the app's own verdicts
 *   buildTasksContext     the tasks, and per task: asked, done, excused, missed,
 *                         streaks, weekday rates; plus the daily completion line
 *   buildExpensesContext  months of spent and income, categories per month, the
 *                         whole-month amounts named separately, the balances
 *
 * ── NEVER THE WHOLE DATABASE ───────────────────────────────────────────────
 *
 * A year of training is thousands of set rows, and a model given all of them
 * does worse arithmetic than a model given the summary the app would have drawn
 * anyway. So each builder hands over what a screen of this app already shows —
 * `CompletedExercise.summary` is literally the shorthand the history list prints
 * — and stays under `CONTEXT_CAP` characters by shedding the OLDEST detail first.
 * A section's context is built only when that section's chat asks, so the
 * workout log never travels with a question about money.
 *
 * ── THE MODEL SHOULD AGREE WITH THE APP ────────────────────────────────────
 *
 * The overload nudges and the deload verdicts are included as `signals`. Without
 * them the model reasons about the same log from first principles and can
 * cheerfully suggest the opposite of what the card is already saying; with them
 * it can build on the verdict instead of contradicting it.
 *
 * ── THE SAME RULES AS EVERY OTHER SCREEN ───────────────────────────────────
 *
 * Warm-ups count towards nothing (the shorthand already drops them, and every
 * rollup here filters on `isWarmup`). A task marked missed on purpose is
 * `excused`, not a miss. A whole-month amount is in its month's totals and in no
 * day's, and it is listed by name so the model can say "rent" instead of
 * inventing a spike on the 1st. Balances are per subsection — the app never sums
 * across accounts, so neither does this — while spending is a sum, because what
 * went out went out whichever pocket it left.
 *
 * Everything returns the JSON string plus the two or three facts the chat needs
 * about it: how much was read (for "Reading 91 workouts…") and the names the
 * suggested prompts are built from.
 */

import { clusterBalance } from '../balance';
import { dayKey, parseDay, shiftDay, weekdayLabels } from '../days';
import { evaluateDeload } from '../deload';
import { MUSCLE_CLUSTER } from '../muscles';
import { evaluateOverloadBatch } from '../progressiveOverload';
import { ladderOf } from '../repLadder';
import { asksOn, dayProgress, entryOf, streakOf, type Task, type TaskLog } from '../tasks';
import { totalsIn, type Amount, type MoneyAccount, type MoneyCategory } from '../money';
import type { CompletedWorkout } from '../completedWorkout';
import type { Language } from '../i18n';
import type { Exercise, ID, Routine, SetHistory, UnitSystem } from '../../types/models';

/** The size every context is held under, in characters of JSON. */
export const CONTEXT_CAP = 6000;

export const LANGUAGE_NAME: Record<Language, string> = { ru: 'Russian', en: 'English' };

/* ------------------------------------------------------------------ */
/* Workout                                                             */
/* ------------------------------------------------------------------ */

export interface WorkoutContextInput {
  exercises: readonly Exercise[];
  routines: readonly Routine[];
  /** Newest first, as the history store holds them. */
  workouts: readonly CompletedWorkout[];
  numbers?: Record<ID, number>;
  bodyweightKg?: number;
  unitSystem: UnitSystem;
  lang: Language;
  now?: Date;
  weeks?: number;
}

export interface WorkoutContext {
  json: string;
  /** Workouts in the window that was sent — the chat's "Reading 91 workouts…". */
  workoutCount: number;
  /** The most-trained loaded lift, for "How is my bench press going?". */
  topLift: string | null;
  /** The routine trained most recently that still exists, for "Improve my Push". */
  lastRoutine: { id: ID; name: string } | null;
}

const DAY_MS = 86_400_000;

function repsLabel(min?: number, max?: number): string | null {
  if (min != null && max != null && min !== max) return `${min}-${max}`;
  const one = max ?? min;
  return one != null ? String(one) : null;
}

/** Oldest → newest top weight, as a direction. Two points or it is `flat`. */
function direction(values: readonly number[]): 'up' | 'down' | 'flat' {
  if (values.length < 2) return 'flat';
  const first = values[0];
  const last = values[values.length - 1];
  if (last > first) return 'up';
  if (last < first) return 'down';
  return 'flat';
}

interface Rollup {
  id: ID;
  name: string;
  s4: number;
  s20: number;
  /** "60x8": the heaviest working set of the window and its reps. */
  top: string | null;
  trend: 'up' | 'down' | 'flat';
}

/** The last session's top-set weight for every exercise that has one. */
export function lastTopWeights(workouts: readonly CompletedWorkout[]): Record<ID, number> {
  const out: Record<ID, number> = {};
  // Newest first, so the first weight met for an exercise is its latest.
  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      if (out[exercise.exerciseId] == null && exercise.topWeightKg != null) {
        out[exercise.exerciseId] = exercise.topWeightKg;
      }
    }
  }
  return out;
}

/**
 * The two names the workout prompts are built from, cheaply enough for the home
 * screen's card to ask on every render of the log.
 *
 *   topLift      the loaded rep lift trained in the most sessions over four
 *                weeks (then twenty), a barbell lift first — "bench press"
 *   lastRoutine  the routine behind the most recent workout that still exists,
 *                else the first routine with anything in it
 */
export function workoutFacts(input: {
  exercises: readonly Exercise[];
  routines: readonly Routine[];
  workouts: readonly CompletedWorkout[];
  now?: Date;
}): Pick<WorkoutContext, 'topLift' | 'lastRoutine'> {
  const { exercises, routines, workouts } = input;
  const now = (input.now ?? new Date()).getTime();
  const byId: Record<ID, Exercise> = Object.fromEntries(exercises.map((e) => [e.id, e]));
  const counts = new Map<ID, { s4: number; s20: number }>();
  for (const workout of workouts) {
    const age = now - new Date(workout.startedAt).getTime();
    if (age > 20 * 7 * DAY_MS) continue;
    for (const done of workout.exercises) {
      if (done.setCount <= 0) continue;
      const exercise = byId[done.exerciseId];
      if (!exercise || !exercise.requiresWeight || exercise.countUnit !== 'reps') continue;
      const count = counts.get(exercise.id) ?? { s4: 0, s20: 0 };
      count.s20 += 1;
      if (age <= 28 * DAY_MS) count.s4 += 1;
      counts.set(exercise.id, count);
    }
  }
  const ranked = [...counts.entries()].sort(
    ([a, ca], [b, cb]) =>
      Number(byId[b].barWeightKg != null) - Number(byId[a].barWeightKg != null) ||
      cb.s4 - ca.s4 ||
      cb.s20 - ca.s20,
  );
  const topLift = ranked.length > 0 ? byId[ranked[0][0]].name : null;

  const byRoutineId = new Map(routines.map((r) => [r.id, r]));
  const recent = [...workouts].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  let lastRoutine: WorkoutContext['lastRoutine'] = null;
  for (const workout of recent) {
    const routine = workout.routineId ? byRoutineId.get(workout.routineId) : undefined;
    if (routine) {
      lastRoutine = { id: routine.id, name: routine.name };
      break;
    }
  }
  if (!lastRoutine) {
    const first = routines.find((r) => r.items.length > 0);
    if (first) lastRoutine = { id: first.id, name: first.name };
  }
  return { topLift, lastRoutine };
}

export function buildWorkoutContext(input: WorkoutContextInput): WorkoutContext {
  const { exercises, routines, workouts, numbers = {}, bodyweightKg, unitSystem, lang } = input;
  const now = input.now ?? new Date();
  const weeks = input.weeks ?? 20;
  const byId: Record<ID, Exercise> = Object.fromEntries(exercises.map((e) => [e.id, e]));
  const windowStart = now.getTime() - weeks * 7 * DAY_MS;
  const fourWeeks = now.getTime() - 28 * DAY_MS;

  const inWindow = workouts
    .filter((w) => new Date(w.startedAt).getTime() >= windowStart)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  /* Per exercise, from the working rows of the window. */
  const rows = new Map<ID, SetHistory[]>();
  for (const workout of inWindow) {
    for (const set of workout.sets) {
      if (set.isWarmup || !set.isCompleted) continue;
      const bucket = rows.get(set.exerciseId);
      if (bucket) bucket.push(set);
      else rows.set(set.exerciseId, [set]);
    }
  }
  const rollups: Rollup[] = [];
  for (const [id, sets] of rows) {
    const sessions = new Map<string, SetHistory[]>();
    for (const set of sets) {
      const bucket = sessions.get(set.sessionId);
      if (bucket) bucket.push(set);
      else sessions.set(set.sessionId, [set]);
    }
    const ordered = [...sessions.values()].sort((a, b) =>
      a[0].performedAt.localeCompare(b[0].performedAt),
    );
    const tops = ordered
      .map((group) => Math.max(...group.map((s) => s.weightKg ?? -1)))
      .filter((w) => w >= 0);
    let best: SetHistory | null = null;
    for (const set of sets) {
      if (set.weightKg == null) continue;
      if (
        !best ||
        set.weightKg > (best.weightKg ?? 0) ||
        (set.weightKg === best.weightKg && set.count > best.count)
      ) {
        best = set;
      }
    }
    rollups.push({
      id,
      name: byId[id]?.name ?? sets[0].exerciseId,
      s4: ordered.filter((g) => new Date(g[0].performedAt).getTime() >= fourWeeks).length,
      s20: ordered.length,
      top: best ? `${best.weightKg}x${best.count}` : null,
      trend: direction(tops),
    });
  }
  rollups.sort((a, b) => b.s20 - a.s20);

  /* The app's own verdicts, so the model builds on them. */
  const history: Record<ID, SetHistory[]> = Object.fromEntries(rows);
  const trained = exercises.filter((e) => rows.has(e.id));
  const verdicts = evaluateOverloadBatch(trained, history, { unitSystem, now });
  const signals: string[] = [];
  for (const exercise of trained) {
    const verdict = verdicts[exercise.id];
    if (verdict?.shouldNudge) {
      const next =
        verdict.suggestedWeightKg != null
          ? `${verdict.suggestedWeightKg} kg`
          : verdict.suggestedCount != null
            ? `${verdict.suggestedCount} ${exercise.countUnit}`
            : '';
      signals.push(`${exercise.name}: stalled ${verdict.plateauDays} days, app suggests ${next}`);
      continue;
    }
    const deload = evaluateDeload({ exercise, history: history[exercise.id] ?? [] });
    if (deload.shouldSuggest && deload.suggestedWeightKg != null) {
      signals.push(
        `${exercise.name}: no progress in ${deload.stalledSessions} sessions, app suggests a back-off at ${deload.suggestedWeightKg} kg`,
      );
    }
  }

  const balance = clusterBalance({ workouts, exercisesById: byId, windowDays: 28, now });
  const setsPerCluster4w = Object.fromEntries(
    balance.clusters.filter((c) => c.sets > 0).map((c) => [c.cluster, c.sets]),
  );

  const routineRows = routines.map((routine) => ({
    id: routine.id,
    name: routine.name,
    exercises: [...routine.items]
      .sort((a, b) => a.order - b.order)
      .filter((item) => byId[item.exerciseId])
      .map((item) => {
        const exercise = byId[item.exerciseId];
        const row: Record<string, unknown> = {
          exerciseId: exercise.id,
          name: exercise.name,
          sets: item.targetSets,
        };
        const reps = repsLabel(item.targetRepsMin, item.targetRepsMax);
        if (reps) row.reps = reps;
        if (exercise.countUnit !== 'reps') row.unit = exercise.countUnit;
        if (exercise.requiresWeight && exercise.defaultWeightKg != null) {
          row.startKg = exercise.defaultWeightKg;
        }
        const ladder = ladderOf(exercise);
        if (ladder) row.ladder = ladder.max;
        if (item.supersetGroup) row.superset = true;
        return row;
      }),
  }));

  const library = exercises
    .filter((e) => !e.isArchived)
    .map((e) => {
      const muscle = e.muscleGroups[0];
      return `${e.id} | ${e.name}${muscle ? ` | ${MUSCLE_CLUSTER[muscle]} > ${muscle}` : ''}`;
    });

  const sessionRows = inWindow.map((w) => {
    const row: Record<string, unknown> = { date: dayKey(w.startedAt) };
    if (numbers[w.id] != null) row.n = numbers[w.id];
    row.routine = w.title;
    row.min = w.durationMinutes;
    if (w.effort) row.feel = w.effort;
    row.ex = w.exercises.filter((e) => e.setCount > 0).map((e) => `${e.name}: ${e.summary}`);
    return row;
  });

  const base = {
    today: dayKey(now),
    language: LANGUAGE_NAME[lang],
    units: unitSystem === 'imperial' ? 'lb (numbers below are kg)' : 'kg',
    ...(bodyweightKg != null ? { bodyweightKg } : {}),
    routines: routineRows,
  };

  /*
   * Fit under the cap by shedding the oldest detail first: sessions from the
   * back of the window, then the library's names past what any routine or
   * session mentions, then the tail of the rollups.
   */
  const referenced = new Set<ID>([
    ...rows.keys(),
    ...routines.flatMap((r) => r.items.map((i) => i.exerciseId)),
  ]);
  let sessionLimit = Math.min(40, sessionRows.length);
  let libraryRows = library;
  let rollupLimit = rollups.length;
  const render = () =>
    JSON.stringify({
      ...base,
      library: libraryRows,
      sessions: sessionRows.slice(0, sessionLimit),
      perExercise: rollups.slice(0, rollupLimit).map((r) => ({
        name: r.name,
        sessions4w: r.s4,
        sessions20w: r.s20,
        ...(r.top ? { topKgXReps: r.top } : {}),
        trend: r.trend,
      })),
      setsPerCluster4w,
      signals,
    });

  let json = render();
  while (json.length > CONTEXT_CAP && sessionLimit > 6) {
    sessionLimit = Math.max(6, Math.floor(sessionLimit * 0.75));
    json = render();
  }
  if (json.length > CONTEXT_CAP) {
    libraryRows = exercises
      .filter((e) => !e.isArchived && referenced.has(e.id))
      .map((e) => `${e.id} | ${e.name}`);
    json = render();
  }
  while (json.length > CONTEXT_CAP && rollupLimit > 5) {
    rollupLimit = Math.max(5, rollupLimit - 5);
    json = render();
  }
  while (json.length > CONTEXT_CAP && sessionLimit > 1) {
    sessionLimit -= 1;
    json = render();
  }

  const facts = workoutFacts({ exercises, routines, workouts, now });
  return { json, workoutCount: Math.min(sessionLimit, inWindow.length), ...facts };
}

/* ------------------------------------------------------------------ */
/* Tasks                                                               */
/* ------------------------------------------------------------------ */

export interface TasksContextInput {
  tasks: readonly Task[];
  log: TaskLog;
  /** `YYYY-MM-DD`. */
  today: string;
  lang: Language;
  days?: number;
}

export interface TasksContext {
  json: string;
  /** Days in the window that asked for anything — "Reading 90 days of tasks…". */
  dayCount: number;
}

function scheduleLabel(task: Task): string {
  const schedule = task.schedule;
  if (schedule.kind === 'daily') return 'every day';
  if (schedule.kind === 'once') return `once on ${schedule.day}`;
  const labels = weekdayLabels('en');
  return schedule.days.length === 0 ? 'never' : schedule.days.map((d) => labels[d]).join(' ');
}

export function buildTasksContext(input: TasksContextInput): TasksContext {
  const { tasks, log, today, lang } = input;
  const days = input.days ?? 90;
  const first = shiftDay(today, -(days - 1));
  const window: string[] = [];
  for (let day = first; day <= today; day = shiftDay(day, 1)) window.push(day);
  const labels = weekdayLabels('en');

  const live = tasks.filter((task) => task.archivedAt === null);
  const perTask = live.map((task) => {
    let asked = 0;
    let done = 0;
    let excused = 0;
    let missed = 0;
    let run = 0;
    let best = 0;
    const byWeekday = labels.map(() => ({ counted: 0, done: 0 }));
    for (const day of window) {
      if (!asksOn(task, day)) continue;
      asked += 1;
      const { mark } = entryOf(log, task.id, day);
      const weekday = (parseDay(day)!.getDay() + 6) % 7;
      if (mark === 'missed') {
        // Excused ON PURPOSE: out of the denominator, and the run steps over it.
        excused += 1;
        continue;
      }
      if (mark === 'done') {
        done += 1;
        run += 1;
        best = Math.max(best, run);
        byWeekday[weekday].counted += 1;
        byWeekday[weekday].done += 1;
      } else if (day < today) {
        missed += 1;
        run = 0;
        byWeekday[weekday].counted += 1;
      }
    }
    const rates = Object.fromEntries(
      byWeekday
        .map((w, i) => [labels[i], w.counted > 0 ? Math.round((w.done / w.counted) * 100) : null])
        .filter(([, rate]) => rate != null),
    );
    const row: Record<string, unknown> = {
      id: task.id,
      name: task.name,
      schedule: scheduleLabel(task),
      since: task.startedOn,
    };
    if (task.reminder) {
      row.remind = `${String(task.reminder.hour).padStart(2, '0')}:${String(task.reminder.minute).padStart(2, '0')}`;
    }
    if (task.auto) row.ticksItself = task.auto;
    Object.assign(row, {
      asked,
      done,
      excused,
      missed,
      streak: streakOf(task, log, today),
      bestStreak: best,
      donePctByWeekday: rates,
    });
    return row;
  });

  const daily: string[] = [];
  for (const day of window) {
    const progress = dayProgress(live, log, day);
    // A day that asked for nothing is left out, as the trend screen leaves it out.
    if (progress.total === 0) continue;
    daily.push(`${day.slice(5)}:${Math.round(progress.fraction * 100)}`);
  }

  const base = {
    today,
    language: LANGUAGE_NAME[lang],
    window: `${first}..${today}`,
    note: 'excused = the user chose not to on purpose, never a miss; missed = asked and left unanswered',
    tasks: perTask,
  };
  let dailyRows = daily;
  let json = JSON.stringify({ ...base, dailyDonePct: dailyRows });
  while (json.length > CONTEXT_CAP && dailyRows.length > 14) {
    dailyRows = dailyRows.slice(Math.ceil(dailyRows.length / 4));
    json = JSON.stringify({ ...base, dailyDonePct: dailyRows });
  }
  return { json, dayCount: daily.length };
}

/* ------------------------------------------------------------------ */
/* Expenses                                                            */
/* ------------------------------------------------------------------ */

export interface ExpensesContextInput {
  amounts: readonly Amount[];
  categories: readonly MoneyCategory[];
  accounts: readonly MoneyAccount[];
  /** The label exactly as the user typed it. */
  currency: string;
  today: string;
  lang: Language;
  months?: number;
}

export interface ExpensesContext {
  json: string;
  /** Months in the window with anything in them — "Reading 6 months of amounts…". */
  monthCount: number;
}

/** `YYYY-MM-01` of the month `offset` months from the one `day` is in. */
function monthAnchor(day: string, offset: number): string {
  const date = parseDay(day) ?? new Date();
  const shifted = new Date(date.getFullYear(), date.getMonth() + offset, 1);
  return dayKey(shifted);
}

export function buildExpensesContext(input: ExpensesContextInput): ExpensesContext {
  const { amounts, categories, accounts, currency, today, lang } = input;
  const months = input.months ?? 6;
  const names: Record<ID, string> = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const catName = (id: ID) => names[id] ?? 'Other';

  const anchors = Array.from({ length: months }, (_, i) => monthAnchor(today, i - (months - 1)));
  const overall: Record<string, number> = {};
  let monthCount = 0;

  const monthRows = anchors.map((anchor) => {
    const month = anchor.slice(0, 7);
    // Whole-month amounts are INSIDE these totals — `inInterval` puts them in
    // their month — and named again below, so neither is lost nor doubled.
    const totals = totalsIn(amounts, 'month', anchor);
    const byCategory: Record<string, number> = {};
    const wholeMonth: string[] = [];
    for (const amount of amounts) {
      const inMonth =
        amount.when.kind === 'month'
          ? `${amount.when.year}-${String(amount.when.month + 1).padStart(2, '0')}` === month
          : amount.when.date.startsWith(month);
      if (!inMonth) continue;
      if (amount.when.kind === 'month') {
        wholeMonth.push(`${amount.direction} ${catName(amount.categoryId)} ${amount.value}`);
      }
      if (amount.direction !== 'expense') continue;
      const name = catName(amount.categoryId);
      byCategory[name] = (byCategory[name] ?? 0) + amount.value;
      overall[name] = (overall[name] ?? 0) + amount.value;
    }
    if (totals.expenses > 0 || totals.incomes > 0) monthCount += 1;
    const row: Record<string, unknown> = {
      month,
      spent: totals.expenses,
      income: totals.incomes,
      byCategory,
    };
    if (wholeMonth.length) row.wholeMonthAmounts = wholeMonth;
    return row;
  });

  const topCategories = Object.entries(overall)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, total]) => ({ name, total }));

  const balances = accounts
    .filter((account) => account.archivedAt === null)
    .map((account) => {
      let balance = account.opening;
      for (const amount of amounts) {
        if (amount.accountId !== account.id) continue;
        balance += amount.direction === 'expense' ? -amount.value : amount.value;
      }
      return { account: account.name, balance, opening: account.opening };
    });

  const json = JSON.stringify({
    today,
    language: LANGUAGE_NAME[lang],
    currency,
    note: 'whole-month amounts count towards their month, never towards a single day; balances are per account and never summed',
    months: monthRows,
    topCategories,
    balances,
  });
  return { json, monthCount };
}
