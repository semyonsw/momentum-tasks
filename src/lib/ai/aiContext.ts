/**
 * What the assistant is allowed to know — built on the phone, from the stores,
 * one section at a time, and small.
 *
 *   buildWorkoutContext   routines, the library's names, the last 20 weeks of
 *                         sessions in the app's own shorthand, per-exercise
 *                         rollups, sets per cluster, the app's own verdicts,
 *                         reps in reserve where a set was graded, and what the
 *                         user SAID after each workout (the debriefs)
 *   buildTasksContext     the tasks, and per task: asked, done, excused, missed,
 *                         streaks, weekday rates; plus the daily completion line
 *   buildExpensesContext  months of spent and income, categories per month, the
 *                         whole-month amounts named separately, the balances,
 *                         and every amount the user wrote a NOTE on
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
import { dayKey, parseDay, shiftDay, weekStart, weekdayIndex, weekdayLabels } from '../days';
import { evaluateDeload } from '../deload';
import { MUSCLE_CLUSTER } from '../muscles';
import { evaluateOverloadBatch } from '../progressiveOverload';
import { ladderOf } from '../repLadder';
import { isSupersettedWithAbove } from '../routinePlan';
import { ownRestSeconds } from '../rest';
import { WEEKLY_GOAL_LIMITS } from '../weeklyGoal';
import type { Budget } from '../budgets';
import { plannedStartWeight } from '../weightCarry';
import {
  asksOn,
  dayProgress,
  entryOf,
  isCounted,
  isWeekly,
  streakOf,
  weekProgress,
  type Task,
  type WeekProgress,
  type TaskLog,
} from '../tasks';
import { totalsIn, type Amount, type MoneyAccount, type MoneyCategory } from '../money';
import type { CompletedWorkout } from '../completedWorkout';
import { debriefForAi, type WorkoutDebrief } from '../debrief';
import type { BodyweightEntry } from '../bodyweightLog';
import { exerciseBests } from '../records';
import { effortLine } from '../effort';
import type { Language } from '../i18n';
import type {
  Exercise,
  ID,
  Routine,
  SetHistory,
  TrainingSequence,
  UnitSystem,
} from '../../types/models';

/** How many of the newest sessions carry their id — see `sessionRows`. */
export const ID_SESSIONS = 30;

/**
 * The size every context is held under, in characters of JSON.
 *
 * 400,000 — about 100,000 tokens, a tenth of the model's window. At 24,000 the
 * shedding loops were the normal path rather than the safety net: the workout
 * chat saw 60 sessions at most, the money chat six months and only the amounts
 * that had a note, the tasks chat 90 days. "What did I do in March?" had no
 * answer because March had been thrown away before the question was asked. A
 * year of everything the app records is ~300 KB, so this sends ALL of it for
 * any realistic log and still sheds oldest-first past that.
 *
 * Before that:
 * 24,000 — about 6,000 tokens. It was 6,000, then 12,000 once the contexts
 * carried what the user WROTE (notes on amounts, answers after a workout), and
 * now carries the all-time records, the bodyweight line, the task notes and a
 * short brief of the other two sections. Each time the shedding loops were
 * throwing away exactly the parts the model cannot work out from the numbers.
 * Still a rounding error against the model's window, and the oldest detail
 * still goes first.
 */
export const CONTEXT_CAP = 400_000;

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
  /** What the user answered after their workouts — `lib/debrief.ts`. */
  debriefs?: readonly WorkoutDebrief[];
  /** The training sequence — the loop of routines the user trains in order. */
  sequence?: TrainingSequence;
  /** Bodyweight readings, any order — the line the records are weighed against. */
  bodyweightLog?: readonly BodyweightEntry[];
  /**
   * The app's own workout settings — what a `changes_proposal` of target
   * `setting` would move. Absent: no `settings` key, and the model has no
   * `from` to reason about, so it is told nothing rather than a guess.
   */
  settings?: WorkoutSettings;
  /** Overrides `CONTEXT_CAP` — for tests that exercise the shedding. */
  cap?: number;
}

/** The four settings the assistant may suggest changing (`lib/ai/aiChanges.ts`). */
export interface WorkoutSettings {
  restSecondsBetweenSets: number;
  restSecondsBetweenExercises: number;
  autoStartRest: boolean;
  /** Absent = never set, which the app reads as `WEEKLY_GOAL_LIMITS.default`. */
  weeklyWorkoutGoal?: number;
}

export interface WorkoutContext {
  json: string;
  /** Workouts in the window that was sent — the chat's "Reading 91 workouts…". */
  workoutCount: number;
  /** Debriefs that made it into `json`. */
  debriefCount: number;
  /** The most-trained loaded lift, for "How is my bench press going?". */
  topLift: string | null;
  /** The routine trained most recently that still exists, for "Improve my Push". */
  lastRoutine: { id: ID; name: string } | null;
}

const DAY_MS = 86_400_000;

/** `rest 90s, sets 4, target 10, step 2.5 kg` — an exercise's own settings, compactly. */
function exerciseSettings(e: Exercise): string {
  const own = ownRestSeconds(e);
  const out = [own == null ? 'rest follows setting' : `rest ${own}s`];
  if (e.defaultSets != null) out.push(`sets ${e.defaultSets}`);
  // A ladder's number IS its max — already said as `rep ladder max`.
  if (e.defaultCount != null && !ladderOf(e)) out.push(`target ${e.defaultCount}`);
  if (e.countUnit === 'reps' && e.countToMax === true) out.push('MAX mode');
  if (e.requiresWeight && e.incrementKg != null) out.push(`step ${e.incrementKg} kg`);
  if (e.countUnit !== 'reps' && e.prepareSeconds != null)
    out.push(`get-ready ${e.prepareSeconds}s`);
  return out.join(', ');
}

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
 * The weight each weighted exercise STARTS AT next session — what the prefill will
 * actually put in the cell (`buildDraftEntry`): a starting weight planned since
 * the last session (`plannedStartWeight`), else the last session's top set, else
 * nothing. A proposal's "was" and the model's view of the routine both read this,
 * so an applied weight reads as applied instead of as the same change forever.
 */
export function nextStartWeights(
  exercises: readonly Exercise[],
  workouts: readonly CompletedWorkout[],
): Record<ID, number> {
  const out = lastTopWeights(workouts);
  const lastAt: Record<ID, string> = {};
  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      const at = lastAt[exercise.exerciseId];
      if (at == null || workout.startedAt > at) lastAt[exercise.exerciseId] = workout.startedAt;
    }
  }
  for (const exercise of exercises) {
    const planned = plannedStartWeight(exercise, lastAt[exercise.id]);
    if (planned != null) out[exercise.id] = planned;
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
  const cap = input.cap ?? CONTEXT_CAP;
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

  // What the next session will prefill — the numbers a proposal is compared with.
  const startWeights = nextStartWeights(exercises, workouts);
  const routineRows = routines.map((routine) => {
    const sorted = [...routine.items].sort((a, b) => a.order - b.order);
    return {
      id: routine.id,
      name: routine.name,
      exercises: sorted
        .map((item, position) => ({ item, position }))
        .filter(({ item }) => byId[item.exerciseId])
        .map(({ item, position }) => {
          const exercise = byId[item.exerciseId];
          const row: Record<string, unknown> = {
            exerciseId: exercise.id,
            name: exercise.name,
            sets: item.targetSets,
          };
          const reps = repsLabel(item.targetRepsMin, item.targetRepsMax);
          if (reps) row.reps = reps;
          if (exercise.countUnit !== 'reps') row.unit = exercise.countUnit;
          if (exercise.requiresWeight) {
            const kg = startWeights[exercise.id] ?? exercise.defaultWeightKg;
            if (kg != null) row.weightKg = kg;
          }
          const ladder = ladderOf(exercise);
          if (ladder) row.ladder = ladder.max;
          /* "With the exercise above" — the editor's one control, and what a
           proposal's `superset` means. Marking every member of the group put
           `true` on the FIRST one too, and a model copying it joined that row
           to whatever stood above it. */
          if (isSupersettedWithAbove(sorted, position)) row.superset = true;
          if (exercise.cue?.trim()) row.cue = exercise.cue.trim();
          return row;
        }),
    };
  });

  /*
   * The library, one line per exercise: id, name, where it files, and what kind
   * of exercise it is — what it counts, how it is loaded, where it starts, its
   * ladder. "Swap bench for something easier on the shoulder" needs to know
   * what else is there and what each one IS, not only what it is called.
   *
   * Then its own SETTINGS, the values a `changes_proposal` would move: rest,
   * default sets, target, MAX, weight step, get-ready countdown — each only
   * where it is set and means something for this kind of exercise, in the
   * units the change is written in (seconds, kg), so "my rest on bench is 2:00,
   * make it 1:30" has a `from` the model can read rather than guess.
   */
  const library = exercises
    .filter((e) => !e.isArchived)
    .map((e) => {
      const muscle = e.muscleGroups[0];
      const parts = [e.id, e.name];
      if (muscle) parts.push(`${MUSCLE_CLUSTER[muscle]} > ${e.muscleGroups.join(', ')}`);
      const kind: string[] = [e.countUnit];
      if (e.loadMode !== 'external') kind.push(e.loadMode);
      if (e.isUnilateral) kind.push('one side at a time');
      if (e.requiresWeight && e.defaultWeightKg != null)
        kind.push(`starts ${e.defaultWeightKg} kg`);
      if (e.barWeightKg != null) kind.push(`bar ${e.barWeightKg} kg`);
      const ladder = ladderOf(e);
      if (ladder) kind.push(`rep ladder max ${ladder.max}`);
      parts.push(kind.join(', '));
      parts.push(exerciseSettings(e));
      // The user's own one-line form note — words the numbers cannot carry.
      if (e.cue?.trim()) parts.push(`cue: ${e.cue.trim()}`);
      return parts.join(' | ');
    });

  /*
   * ALL-TIME, not the window: the heaviest set, the most reps, when it was last
   * trained and how many sessions it has — the same bests the exercise screen
   * shows, from the whole log, so "is this a PR?" has an answer.
   */
  const bodyweights = [...(input.bodyweightLog ?? [])].sort((a, b) => a.at.localeCompare(b.at));
  const bodyweightOn = (at: string): number | null => {
    let found: number | null = bodyweightKg ?? null;
    for (const entry of bodyweights) {
      if (entry.at > at) break;
      found = entry.kg;
    }
    return found;
  };
  const allSets = workouts.flatMap((w) => w.sets);
  const setsByExercise = new Map<ID, SetHistory[]>();
  const sessionsByExercise = new Map<ID, Set<string>>();
  const lastByExercise = new Map<ID, string>();
  for (const set of allSets) {
    if (set.isWarmup || !set.isCompleted) continue;
    const bucket = setsByExercise.get(set.exerciseId);
    if (bucket) bucket.push(set);
    else setsByExercise.set(set.exerciseId, [set]);
    const sessions = sessionsByExercise.get(set.exerciseId) ?? new Set<string>();
    sessions.add(set.sessionId);
    sessionsByExercise.set(set.exerciseId, sessions);
    const last = lastByExercise.get(set.exerciseId);
    if (!last || set.performedAt > last) lastByExercise.set(set.exerciseId, set.performedAt);
  }
  const records = [...setsByExercise.entries()]
    .map(([id, sets]) => {
      const exercise = byId[id];
      if (!exercise) return null;
      const bests = exerciseBests(sets, exercise, bodyweightOn);
      const row: Record<string, unknown> = {
        name: exercise.name,
        sessions: sessionsByExercise.get(id)?.size ?? 0,
        last: dayKey(lastByExercise.get(id) ?? ''),
      };
      if (bests.heaviest) {
        row.heaviest = `${bests.heaviest.weightKg ?? bests.heaviest.value}x${bests.heaviest.count} on ${dayKey(bests.heaviest.at)}`;
      }
      if (bests.mostCount) {
        row[`most_${exercise.countUnit}`] =
          `${bests.mostCount.value} on ${dayKey(bests.mostCount.at)}`;
      }
      return row;
    })
    .filter((row): row is Record<string, unknown> => row != null)
    .sort((a, b) => (b.sessions as number) - (a.sessions as number));
  let recordLimit = records.length;

  /* Sessions per week, the last twelve weeks, oldest first — the frequency line. */
  const weekly: string[] = [];
  for (let back = 11; back >= 0; back -= 1) {
    const end = now.getTime() - back * 7 * DAY_MS;
    const start = end - 7 * DAY_MS;
    const count = workouts.filter((w) => {
      const at = new Date(w.startedAt).getTime();
      return at > start && at <= end;
    }).length;
    weekly.push(`${dayKey(new Date(start + DAY_MS))}:${count}`);
  }

  const ordered = [...workouts].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const allTime = {
    workouts: workouts.length,
    ...(ordered[0] ? { firstWorkout: dayKey(ordered[0].startedAt) } : {}),
    ...(ordered.length ? { lastWorkout: dayKey(ordered[ordered.length - 1].startedAt) } : {}),
  };
  const bodyweightLine = bodyweights.map((e) => `${dayKey(e.at)}:${e.kg}`);

  /*
   * EVERY session, newest first — not the window. The rollups and verdicts
   * above read the last 20 weeks because they are about the current block;
   * "when did I last do legs before the summer?" is about the whole log.
   */
  const allSessions = [...workouts].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  let gradedAny = false;
  let typedAny = false;
  const sessionRows = allSessions.map((w, i) => {
    const row: Record<string, unknown> = { date: dayKey(w.startedAt) };
    /* The id, on the newest sessions only: it is what a set correction ("that
       first set on Monday was a warm-up") names, and nobody corrects a set from
       last year — so the older rows do not pay for it. */
    if (i < ID_SESSIONS) row.id = w.id;
    if (numbers[w.id] != null) row.n = numbers[w.id];
    row.routine = w.title;
    if (w.routineId) row.routineId = w.routineId;
    row.min = w.durationMinutes;
    row.sets = w.setCount;
    if (w.effort) row.feel = w.effort;
    row.ex = w.exercises.filter((e) => e.setCount > 0).map((e) => `${e.name}: ${e.summary}`);
    /*
     * EFFORT, only where somebody graded a set: reps in reserve per working set, in
     * the order they were done (`2 1 - 0`, `-` = not said). A log that never used
     * the chip costs this context nothing.
     */
    const effort = w.exercises
      .map((e) => {
        const line = effortLine(
          w.sets
            .filter((set) => set.exerciseId === e.exerciseId && !set.isWarmup)
            .sort((a, b) => a.setIndex - b.setIndex),
        );
        return line ? `${e.name}: ${line}` : null;
      })
      .filter((line): line is string => line != null);
    if (effort.length) {
      row.rir = effort;
      gradedAny = true;
    }
    if (w.sets.some((set) => set.setType)) typedAny = true;
    return row;
  });

  /*
   * THE DEBRIEFS — newest first, for every workout still in the log, and each
   * one only if it says something. They are what the numbers cannot say ("too
   * heavy", "lower back", "make it shorter"), so they are shed LAST of anything
   * optional: down to three before the sessions go below six.
   */
  const loggedIds = new Set(workouts.map((w) => w.id));
  const debriefRows = (input.debriefs ?? [])
    .filter((d) => loggedIds.has(d.workoutId))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map(debriefForAi)
    .filter((row): row is Record<string, unknown> => row != null);
  let debriefLimit = debriefRows.length;

  /*
   * THE LOOP. A user who trains Push → Pull → Legs → again has told the app the
   * order, and the Home screen follows it; without it here the model was asked
   * "do you see my routines loop?" about a fact it had never been given.
   * Resolved to names, in order, with the one that is up next.
   */
  const routineName = new Map(routines.map((r) => [r.id, r.name]));
  const steps = (input.sequence?.routineIds ?? [])
    .map((id) => ({ id, name: routineName.get(id) }))
    .filter((step): step is { id: ID; name: string } => step.name != null);
  const sequence =
    input.sequence?.isActive && steps.length > 0
      ? {
          on: true,
          order: steps.map((step) => step.name),
          routineIds: steps.map((step) => step.id),
          next: steps[((input.sequence.cursor % steps.length) + steps.length) % steps.length].name,
          note: 'the user trains these routines in this order and then starts over',
        }
      : { on: false, note: 'no training sequence is set; the user picks a routine each time' };

  const base = {
    today: dayKey(now),
    language: LANGUAGE_NAME[lang],
    units: unitSystem === 'imperial' ? 'lb (numbers below are kg)' : 'kg',
    ...(bodyweightKg != null ? { bodyweightKg } : {}),
    ...(input.settings
      ? {
          settings: {
            restSecondsBetweenSets: input.settings.restSecondsBetweenSets,
            restSecondsBetweenExercises: input.settings.restSecondsBetweenExercises,
            autoStartRest: input.settings.autoStartRest,
            weeklyWorkoutGoal: input.settings.weeklyWorkoutGoal ?? WEEKLY_GOAL_LIMITS.default,
          },
        }
      : {}),
    routines: routineRows,
    sequence,
    ...(gradedAny
      ? {
          effortNote:
            'sessions[].rir lists reps in reserve per working set in order (RPE = 10 - RIR; "-" = not recorded). RIR 0-0.5 means the set was at the limit; the app does not suggest more weight off such sets.',
        }
      : {}),
    ...(typedAny
      ? {
          setTypeNote:
            'in sessions[].ex the reps carry a mark: 8F = taken to failure, 8+ = AMRAP, 10D = drop set. All three are working sets (they count as volume); warm-ups are never listed. Failure and AMRAP sets count as at the limit unless an RIR says otherwise.',
        }
      : {}),
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
  let sessionLimit = sessionRows.length;
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
      ...(debriefLimit > 0 ? { debriefs: debriefRows.slice(0, debriefLimit) } : {}),
      allTime,
      sessionsPerWeek12w: weekly,
      ...(bodyweightLine.length ? { bodyweightKgLog: bodyweightLine } : {}),
      ...(recordLimit > 0 ? { recordsAllTime: records.slice(0, recordLimit) } : {}),
    });

  let json = render();
  while (json.length > cap && sessionLimit > 6) {
    sessionLimit = Math.max(6, Math.floor(sessionLimit * 0.75));
    json = render();
  }
  if (json.length > cap) {
    libraryRows = exercises
      .filter((e) => !e.isArchived && referenced.has(e.id))
      .map((e) => `${e.id} | ${e.name}`);
    json = render();
  }
  while (json.length > cap && rollupLimit > 5) {
    rollupLimit = Math.max(5, rollupLimit - 5);
    json = render();
  }
  while (json.length > cap && recordLimit > 10) {
    recordLimit = Math.max(10, recordLimit - 5);
    json = render();
  }
  while (json.length > cap && debriefLimit > 3) {
    debriefLimit -= 1;
    json = render();
  }
  while (json.length > cap && sessionLimit > 1) {
    sessionLimit -= 1;
    json = render();
  }
  while (json.length > cap && debriefLimit > 0) {
    debriefLimit -= 1;
    json = render();
  }
  while (json.length > cap && recordLimit > 0) {
    recordLimit -= 1;
    json = render();
  }

  const facts = workoutFacts({ exercises, routines, workouts, now });
  return {
    json,
    workoutCount: Math.min(sessionLimit, sessionRows.length),
    debriefCount: debriefLimit,
    ...facts,
  };
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
  /** Defaults to the whole history: back to the first task or first mark, at least 90 days. */
  days?: number;
  /** Overrides `CONTEXT_CAP` — for tests that exercise the shedding. */
  cap?: number;
}

/** Ten years of days — a bound on a window read off user data, not a limit anyone reaches. */
const MAX_TASK_DAYS = 3650;

/** Days from the first thing the log knows about to `today`, inclusive — at least 90. */
function taskHistoryDays(tasks: readonly Task[], log: TaskLog, today: string): number {
  let earliest = today;
  const consider = (day: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && day < earliest) earliest = day;
  };
  for (const task of tasks) consider(task.startedOn);
  for (const days of Object.values(log)) for (const day of Object.keys(days)) consider(day);
  const from = parseDay(earliest);
  const to = parseDay(today);
  if (!from || !to) return 90;
  const span = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
  return Math.min(MAX_TASK_DAYS, Math.max(90, span));
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
  if (schedule.kind === 'weekly') return `${schedule.times}x a week, any days`;
  const labels = weekdayLabels('en');
  return schedule.days.length === 0 ? 'never' : schedule.days.map((d) => labels[d]).join(' ');
}

export function buildTasksContext(input: TasksContextInput): TasksContext {
  const { tasks, log, today, lang } = input;
  const cap = input.cap ?? CONTEXT_CAP;
  /* The whole history by default: "how was my reading in spring?" is about a
     spring the old 90-day window had already dropped. */
  const days = input.days ?? taskHistoryDays(tasks, log, today);
  const first = shiftDay(today, -(days - 1));
  const window: string[] = [];
  for (let day = first; day <= today; day = shiftDay(day, 1)) window.push(day);
  const labels = weekdayLabels('en');

  /* Archived tasks too: their past days are still the user's past, and the
     trend screen counts them (`asksOn` stops one on the day it was archived).
     Leaving them out made the model's daily numbers disagree with the chart. */
  const perTask = tasks.map((task) => {
    const doneDays: string[] = [];
    const excusedDays: string[] = [];
    /** A counted task's days short of the target, `day:count` (T1). */
    const partialDays: string[] = [];
    let asked = 0;
    let done = 0;
    let excused = 0;
    let missed = 0;
    let run = 0;
    let best = 0;
    const byWeekday = labels.map(() => ({ counted: 0, done: 0 }));
    for (const day of window) {
      // Every window day comes off `shiftDay`, so it always parses; the guard is
      // the type's, not a case that happens.
      const date = parseDay(day);
      if (!date || !asksOn(task, day)) continue;
      asked += 1;
      const { mark } = entryOf(log, task.id, day);
      const weekday = weekdayIndex(date);
      if (mark === 'missed') {
        // Excused ON PURPOSE: out of the denominator, and the run steps over it.
        excused += 1;
        excusedDays.push(day);
        continue;
      }
      if (mark === 'done') {
        done += 1;
        doneDays.push(day);
        run += 1;
        best = Math.max(best, run);
        byWeekday[weekday].counted += 1;
        byWeekday[weekday].done += 1;
      } else if (isWeekly(task)) {
        // Offered, not owed (T2): an unanswered day is not a miss; the week is judged.
      } else if (day < today) {
        missed += 1;
        run = 0;
        byWeekday[weekday].counted += 1;
      }
      const count = entryOf(log, task.id, day).count;
      if (mark !== 'done' && isCounted(task) && count) partialDays.push(`${day}:${count}`);
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
      if (task.reminder.every) row.remindAgainEveryMin = task.reminder.every;
    }
    if (task.auto) row.ticksItself = task.auto;
    // A habit to avoid (T7): its done days are days the user held off.
    if (task.avoid) row.avoid = true;
    if (isWeekly(task)) {
      // Judged by the week (T2): weeks met and short in the window, and the
      // streak and best run in weeks rather than days.
      let met = 0;
      let short = 0;
      let weeks = 0;
      let bestWeeks = 0;
      for (let monday = weekStart(first); monday <= today; monday = shiftDay(monday, 7)) {
        const week = weekProgress(task, log, monday) as WeekProgress;
        if (week.met) {
          met += 1;
          weeks += 1;
          bestWeeks = Math.max(bestWeeks, weeks);
        } else if (week.needed > 0 && week.to < today) {
          short += 1;
          weeks = 0;
        }
      }
      Object.assign(row, { weeksMet: met, weeksShort: short, bestWeekStreak: bestWeeks });
      const current = weekProgress(task, log, today) as WeekProgress;
      row.thisWeek = `${current.done}/${current.needed}`;
    }
    if (task.target) {
      row.target = `${task.target.count} ${task.target.unit.trim() || 'times'} a day`;
    }
    if (task.archivedAt) row.archivedOn = dayKey(task.archivedAt);
    Object.assign(row, {
      asked,
      done,
      excused,
      missed,
      streak: streakOf(task, log, today),
      ...(isWeekly(task) ? { streakUnit: 'weeks' } : { bestStreak: best }),
      donePctByWeekday: rates,
      // The days themselves, so "what did I do on the 12th?" has an answer.
      doneOn: doneDays,
      ...(excusedDays.length ? { excusedOn: excusedDays } : {}),
      ...(partialDays.length ? { partialOn: partialDays } : {}),
    });
    return row;
  });

  const daily: string[] = [];
  for (const day of window) {
    const progress = dayProgress(tasks, log, day);
    // A day that asked for nothing is left out, as the trend screen leaves it out.
    if (progress.total === 0) continue;
    // The full date: a window that crosses New Year has two `01-02`s otherwise.
    daily.push(`${day}:${Math.round(progress.fraction * 100)}`);
  }

  /*
   * THE NOTES written on answered days — "only 10 pages, tired", "did it at the
   * gym instead" — newest first. The ticks say THAT a habit slipped; the notes
   * are the only place that says why.
   */
  const names: Record<ID, string> = Object.fromEntries(tasks.map((task) => [task.id, task.name]));
  const noted: string[] = [];
  for (const [taskId, days] of Object.entries(log)) {
    if (!names[taskId]) continue;
    for (const [day, entry] of Object.entries(days)) {
      if (day < first || day > today) continue;
      const note = entry.note.trim().replace(/\s+/g, ' ');
      if (note === '') continue;
      const mark = entry.mark === 'done' ? 'done' : entry.mark === 'missed' ? 'excused' : 'open';
      noted.push(`${day} ${names[taskId]} (${mark}): ${note}`);
    }
  }
  noted.sort((a, b) => b.localeCompare(a));
  let noteLimit = noted.length;

  const base = {
    today,
    language: LANGUAGE_NAME[lang],
    window: `${first}..${today}`,
    note: 'excused = the user chose not to on purpose, never a miss; missed = asked and left unanswered; notes are what the user wrote on a day, newest first',
    ...(tasks.some((task) => task.avoid)
      ? {
          avoidNote:
            'a task with avoid: true is a habit to NOT do (e.g. no sugar): done means the user avoided it that day; an unanswered day is unknown, not a lapse and not a success',
        }
      : {}),
    ...(tasks.some(isWeekly)
      ? {
          weeklyNote:
            'a task asked N times a week owes no single day: an unanswered day is not a miss; a week (Mon-Sun) is met when done days reach N, and its streak is in weeks',
        }
      : {}),
    ...(tasks.some(isCounted)
      ? {
          targetNote:
            'a task with a target is done on a day only when the count reached it; partialOn lists days short of it as day:count, and those count as missed',
        }
      : {}),
    tasks: perTask,
  };
  let dailyRows = daily;
  const render = () =>
    JSON.stringify({
      ...base,
      dailyDonePct: dailyRows,
      ...(noteLimit > 0 ? { notes: noted.slice(0, noteLimit) } : {}),
    });
  let json = render();
  while (json.length > cap && noteLimit > 20) {
    noteLimit = Math.max(20, Math.floor(noteLimit * 0.8));
    json = render();
  }
  while (json.length > cap && dailyRows.length > 14) {
    dailyRows = dailyRows.slice(Math.ceil(dailyRows.length / 4));
    json = render();
  }
  while (json.length > cap && noteLimit > 0) {
    noteLimit -= 1;
    json = render();
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
  /**
   * The log's scale (`lib/moneyUnits.ts`). 0 or absent: every figure is whole
   * units, and the context is exactly what it always was. 2: every figure is in
   * hundredths, and the context SAYS so rather than dividing — sums of integers
   * stay exact, and the model is told how to read them.
   */
  scale?: number;
  /** The monthly budgets (`lib/budgets.ts`), in the log's units. */
  budgets?: readonly Budget[];
  today: string;
  lang: Language;
  /** Defaults to every month from the first amount to this one, at least six. */
  months?: number;
  /** Overrides `CONTEXT_CAP` — for tests that exercise the shedding. */
  cap?: number;
}

export interface ExpensesContext {
  json: string;
  /** Months in the window with anything in them — "Reading 6 months of amounts…". */
  monthCount: number;
  /** Notes that made it into `json`. */
  noteCount: number;
  /** Amounts listed one by one in `json`. */
  amountCount: number;
  /** The ledger lines that carry a note, newest first — for the other sections' brief. */
  notes: string[];
}

/** `YYYY-MM` of an amount — a whole-month amount's month, or its day's. */
function amountMonth(amount: Amount): string {
  return amount.when.kind === 'month'
    ? `${amount.when.year}-${String(amount.when.month + 1).padStart(2, '0')}`
    : amount.when.date.slice(0, 7);
}

/** Months from the first amount's to `today`'s, inclusive — at least six, at most 20 years. */
function moneyHistoryMonths(amounts: readonly Amount[], today: string): number {
  let earliest = today.slice(0, 7);
  for (const amount of amounts) {
    const month = amountMonth(amount);
    if (/^\d{4}-\d{2}$/.test(month) && month < earliest) earliest = month;
  }
  const [fy, fm] = earliest.split('-').map(Number);
  const [ty, tm] = today.slice(0, 7).split('-').map(Number);
  const span = (ty - fy) * 12 + (tm - fm) + 1;
  return Math.min(240, Math.max(6, Number.isFinite(span) ? span : 6));
}

/** `YYYY-MM-01` of the month `offset` months from the one `day` is in. */
function monthAnchor(day: string, offset: number): string {
  const date = parseDay(day) ?? new Date();
  const shifted = new Date(date.getFullYear(), date.getMonth() + offset, 1);
  return dayKey(shifted);
}

/** `{ valueUnit }` for a log kept in hundredths; nothing at all for whole units. */
function valueUnit(currency: string, scale: number | undefined): Record<string, string> {
  if (!scale || scale <= 0) return {};
  const unit = 10 ** scale;
  return {
    valueUnit: `every money figure is an integer count of 1/${unit} ${currency}: ${unit * 12 + 50} means ${(12.5).toFixed(scale)} ${currency}; divide by ${unit} before showing one`,
  };
}

export function buildExpensesContext(input: ExpensesContextInput): ExpensesContext {
  const { amounts, categories, accounts, currency, today, lang } = input;
  const cap = input.cap ?? CONTEXT_CAP;
  /* Every month there is money in, not the last six: "how much did the car cost
     me last year?" is a question about a year the model was never shown. */
  const months = input.months ?? moneyHistoryMonths(amounts, today);
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
    const incomeByCategory: Record<string, number> = {};
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
      if (amount.direction !== 'expense') {
        const source = catName(amount.categoryId);
        incomeByCategory[source] = (incomeByCategory[source] ?? 0) + amount.value;
        continue;
      }
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
    if (Object.keys(incomeByCategory).length) row.incomeByCategory = incomeByCategory;
    if (wholeMonth.length) row.wholeMonthAmounts = wholeMonth;
    return row;
  });

  const topCategories = Object.entries(overall)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, total]) => ({ name, total }));

  const balances = accounts.map((account) => {
    let balance = account.opening;
    for (const amount of amounts) {
      if (amount.accountId !== account.id) continue;
      balance += amount.direction === 'expense' ? -amount.value : amount.value;
    }
    const row: Record<string, unknown> = {
      account: account.name,
      balance,
      opening: account.opening,
    };
    if (account.archivedAt !== null) row.archived = true;
    return row;
  });

  /*
   * THE LEDGER — every amount in the window, one line each, newest first, with
   * the note the user wrote on it in full. A category says "Food 42,000"; the
   * notes say it was "dinner with Anna", "groceries for the week" — the
   * difference between "you spent a lot on food" and an answer that knows what
   * the money was for. It used to be only the amounts WITH a note, cut to 140
   * characters, so "what did I spend on the 12th?" had no answer for most days.
   * The OLDEST lines are shed first to stay under the cap. Future-dated amounts
   * are in: they are in the month totals too, and they are real plans.
   */
  const windowStart = anchors[0];
  const accountNames: Record<ID, string> = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
  const ledgerEntries = amounts
    .map((amount) => ({
      amount,
      when: amount.when.kind === 'month' ? amountMonth(amount) : amount.when.date,
    }))
    // A whole-month amount's key is `YYYY-MM`, which sorts before that month's days.
    .filter(({ when }) => when >= windowStart.slice(0, 7))
    .sort(
      (a, b) =>
        b.when.localeCompare(a.when) || b.amount.createdAt.localeCompare(a.amount.createdAt),
    )
    .map(({ amount, when }) => {
      const month = amount.when.kind === 'month' ? ' (whole month)' : '';
      const account = accountNames[amount.accountId];
      const where = accounts.length > 1 && account ? ` [${account}]` : '';
      const note = amount.note.trim().replace(/\s+/g, ' ');
      // A transfer half says so, so the model never reads cash withdrawn as income earned.
      const moved = amount.transferId ? ' (transfer)' : '';
      const line = `${when}${month} ${amount.direction}${moved} ${catName(amount.categoryId)} ${amount.value}${where}`;
      return { line: note ? `${line}: ${note}` : line, noted: note !== '' };
    });
  const ledger = ledgerEntries.map((entry) => entry.line);

  /* Expenses and incomes keep separate category lists — the model is told which
     is which, so it never files a salary under Food or suggests one. An expense
     category carries its id and its budget: a budget suggestion names the
     category by id, and "am I over budget on food?" needs the figure. */
  const live = categories.filter((c) => c.archivedAt === null);
  const budgetOf = new Map((input.budgets ?? []).map((b) => [b.categoryId, b.monthly]));
  const categoryLists = {
    expense: live
      .filter((c) => c.direction === 'expense')
      .map((c) => {
        const budget = budgetOf.get(c.id);
        return { id: c.id, name: c.name, ...(budget != null ? { monthlyBudget: budget } : {}) };
      }),
    // With ids now, so a logged salary can name its category the way an expense does.
    income: live.filter((c) => c.direction === 'income').map((c) => ({ id: c.id, name: c.name })),
  };
  // Ids too, so "paid by card" can file an amount under the right account.
  const accountList = accounts
    .filter((a) => a.archivedAt === null)
    .map((a) => ({ id: a.id, name: a.name }));

  const base = {
    today,
    language: LANGUAGE_NAME[lang],
    currency,
    ...valueUnit(currency, input.scale),
    note: 'whole-month amounts count towards their month, never towards a single day; balances are per account and never summed; expense and income categories are separate lists (categories.expense with each id and monthlyBudget when one is set, in the same units as every amount; categories.income with each id) and an amount is only ever in a category of its own direction; a "(transfer)" amount is one half of money moved between two accounts — an expense from one and an income into the other, same value, same day; amounts lists every amount, newest first, as "date direction category value [account]: note" — the note, when present, is what the user wrote on it',
    categories: categoryLists,
    ...(accountList.length > 1 ? { accounts: accountList } : {}),
    months: monthRows,
    topCategories,
    balances,
  };
  let ledgerLimit = ledger.length;
  const render = () =>
    JSON.stringify(ledgerLimit > 0 ? { ...base, amounts: ledger.slice(0, ledgerLimit) } : base);
  let json = render();
  while (json.length > cap && ledgerLimit > 0) {
    ledgerLimit = ledgerLimit > 20 ? Math.floor(ledgerLimit * 0.8) : ledgerLimit - 1;
    json = render();
  }
  const sent = ledgerEntries.slice(0, ledgerLimit);
  const notes = sent.filter((entry) => entry.noted).map((entry) => entry.line);
  return { json, monthCount, noteCount: notes.length, amountCount: ledgerLimit, notes };
}

/* ------------------------------------------------------------------ */
/* The other two sections, briefly                                     */
/* ------------------------------------------------------------------ */

/**
 * ONE SECTION'S CHAT, THE WHOLE PERSON. A question about money is often about
 * training ("am I spending too much on the gym?") and a question about habits is
 * often about both, so every context also carries a short brief of the other two
 * sections: a few numbers and the newest things the user wrote. Small on
 * purpose — the section being asked about keeps the room.
 *
 * THAT WAS ONE APP (2.x). Since 3.0.0 each app is one log and its assistant
 * reads that log alone (`aiScope.briefedSections` is empty): the Workout app's
 * hidden tasks and money are not quoted back by the one voice in it that could.
 * The briefs stay, tested, for the decision to be revisited rather than rebuilt.
 */
export function workoutBrief(input: {
  workouts: readonly CompletedWorkout[];
  routines: readonly Routine[];
  sequence?: TrainingSequence;
  now?: Date;
}): Record<string, unknown> {
  const now = (input.now ?? new Date()).getTime();
  const recent = [...input.workouts].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const last30 = recent.filter((w) => now - new Date(w.startedAt).getTime() <= 30 * DAY_MS);
  const names = new Map(input.routines.map((r) => [r.id, r.name]));
  return {
    workoutsLast30Days: last30.length,
    minutesLast30Days: last30.reduce((sum, w) => sum + w.durationMinutes, 0),
    lastSessions: recent.slice(0, 5).map((w) => {
      const feel = w.effort ? `, felt ${w.effort}` : '';
      return `${dayKey(w.startedAt)} ${w.title} (${w.durationMinutes} min${feel})`;
    }),
    routines: input.routines.map((r) => r.name),
    ...(input.sequence?.isActive && input.sequence.routineIds.length
      ? {
          loop: input.sequence.routineIds.map((id) => names.get(id)).filter(Boolean),
        }
      : {}),
  };
}

export function tasksBrief(input: {
  tasks: readonly Task[];
  log: TaskLog;
  today: string;
}): Record<string, unknown> {
  const built = JSON.parse(
    buildTasksContext({
      tasks: input.tasks,
      log: input.log,
      today: input.today,
      lang: 'en',
      days: 30,
    }).json,
  ) as { tasks: Record<string, unknown>[]; notes?: string[] };
  return {
    last30Days: built.tasks.map((task) => {
      const asked = (task.asked as number) - (task.excused as number);
      const pct = asked > 0 ? Math.round(((task.done as number) / asked) * 100) : null;
      // The unit travels with the number: a weekly task's 4 is four WEEKS, and a
      // bare "streak 4" reads as days.
      const unit = task.streakUnit === 'weeks' ? 'weeks' : 'days';
      return `${task.name}: ${pct == null ? 'n/a' : `${pct}% done`}, streak ${task.streak} ${unit}`;
    }),
    recentNotes: (built.notes ?? []).slice(0, 10),
  };
}

export function expensesBrief(input: {
  amounts: readonly Amount[];
  categories: readonly MoneyCategory[];
  accounts: readonly MoneyAccount[];
  currency: string;
  scale?: number;
  today: string;
}): Record<string, unknown> {
  const context = buildExpensesContext({ ...input, lang: 'en', months: 2 });
  const built = JSON.parse(context.json) as {
    months: { month: string; spent: number; income: number; byCategory: Record<string, number> }[];
  };
  const month = built.months[built.months.length - 1];
  const top = Object.entries(month?.byCategory ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, total]) => `${name} ${total}`);
  return {
    currency: input.currency,
    ...valueUnit(input.currency, input.scale),
    thisMonth: month ? { month: month.month, spent: month.spent, income: month.income } : null,
    topCategoriesThisMonth: top,
    recentNotes: context.notes.slice(0, 10),
  };
}

/**
 * Add the other sections' briefs to a context, if they fit under the cap —
 * notes first to go, then the brief whole. The section asked about is never cut
 * to make room.
 *
 * Unused by the chat since 3.0.0: each app is one log, and `aiScope.briefedSections`
 * says no other section rides along. Kept, with the briefs, for the day an app
 * holds two logs again.
 */
export function withBriefs(json: string, briefs: Record<string, Record<string, unknown>>): string {
  const base = JSON.parse(json) as Record<string, unknown>;
  const attempt = (other: Record<string, unknown>) =>
    JSON.stringify({ ...base, otherSections: other });
  let out = attempt(briefs);
  if (out.length <= CONTEXT_CAP) return out;
  const trimmed = Object.fromEntries(
    Object.entries(briefs).map(([key, brief]) => {
      const { recentNotes: _notes, ...rest } = brief;
      return [key, rest];
    }),
  );
  out = attempt(trimmed);
  return out.length <= CONTEXT_CAP ? out : json;
}
