/**
 * Bests — the facts in the log that nothing was reading.
 *
 *   Weighted 90° pull-ups     BEST  +32.5 kg × 5  ·  14 reps  ·  178 kg set
 *   Plank                     BEST  3:10
 *
 * ── WHY THESE FOUR AND NOT AN ESTIMATED 1RM ────────────────────────────────
 *
 * `ExerciseHistoryScreen` states the case against a 1RM directly and it is right:
 * an Epley estimate is a number that goes up on its own and tells you nothing about
 * whether to add a plate. `SetHistory` used to carry one, computed on every rep set
 * and displayed nowhere, and it was deleted for exactly that reason.
 *
 * These are the opposite kind of number. Every one of them is a set that HAPPENED —
 * a row you can point at in the log — and none of them is a model of anything:
 *
 *  `heaviest`     the most weight ever moved on this movement, and the reps it went
 *                 for. The number you actually want before loading a bar.
 *  `mostCount`    the most reps (or the longest hold, or the furthest distance) in
 *                 one set. The other axis, and the one that moves first on
 *                 bodyweight work.
 *  `bestSetLoad`  the heaviest single set by weight × reps. It is the only one that
 *                 is a product rather than a reading, and it earns its place because
 *                 it is the one that distinguishes `100 × 3` from `85 × 8` — which
 *                 the two above cannot, and which is the whole question on a day
 *                 you are deciding whether to go heavy or long.
 *
 * ── AND WHY THERE IS NO BADGE ──────────────────────────────────────────────
 *
 * `HistoryScreen`'s header: "THE TOTALS LINE IS A FACT, NOT A GOAL. No streaks, no
 * badges, no weekly target." A best is the same kind of thing — it is what the log
 * says, not a prize the app awards — so it renders as one micro line and nothing
 * else. No medal on the row, no notification mid-set, no confetti. Other trackers
 * fire a banner the moment you tap ✓; that is a different product's idea of why
 * somebody trains.
 *
 * ── BODYWEIGHT WORK IS COMPARED HONESTLY ───────────────────────────────────
 *
 * `heaviest` and `bestSetLoad` read the EFFECTIVE load (`effectiveLoadKg`), so a
 * pull-up at `+20 kg` when you weighed 78 and the same set at `+20` when you weigh
 * 82 are not tied — the second is 4 kg heavier and it wins. That needs the
 * bodyweight of the day each set happened, which is why the caller passes a lookup
 * rather than a number (`lib/bodyweightLog.ts`).
 *
 * Where no bodyweight is known at all the effective load is null, those two records
 * are absent, and `mostCount` carries the exercise on its own. That is the same
 * silence `sessionVolume` keeps rather than printing a figure it knows undercounts.
 *
 * ── THE e1RM, AFTER ALL — AS AN ESTIMATE THAT SAYS SO ──────────────────────
 *
 * The case above against a 1RM was a case against a number shown as if it were a
 * fact. Roadmap W5 (T-02) brought it back for one job the bests cannot do: put
 * `100 × 3` and `85 × 8` on ONE line over time, so "is this going up" has an answer
 * on the weeks the weight stood still and the reps moved. It comes back on terms:
 *
 *  - Epley (`load × (1 + reps / 30)`), on the EFFECTIVE load, rep work only — and a
 *    single is its own weight, not 3% more than what was actually lifted.
 *  - ONE POINT PER SESSION: that session's best set, the granularity every chart
 *    and the overload engine use (`lib/trends.ts`).
 *  - Every screen that shows it says "estimate" beside it. Still never on a set row.
 *
 * `prTimeline` is the bests told as a history: each time a session moved one of
 * them. It rejects the obvious per-set version — a session that climbs 95, 100,
 * 105 is one record, not three — and it gives the first session no entry, the
 * same rule the Finish sheet keeps (IMPLEMENTATION_DECISIONS, T-09): a record
 * needs a previous best to beat, otherwise everybody's first day is a wall of
 * "records". Heaviest is not kept for `loadMode: 'none'`, where the only load is
 * the scale's reading and a "record" would mean the lifter got heavier.
 */

import { t, type Language } from './i18n';
import type { TrendPoint } from './trends';
import {
  countUnitLabel,
  effectiveLoadKg,
  formatClock,
  formatShortDate,
  formatWeight,
  unitLabel,
} from './units';
import type { CountUnit, Exercise, ID, LoadMode, SetHistory, UnitSystem } from '../types/models';

/** One record: the number, and enough of the set to recognise it. */
export interface RecordSet {
  /** The record value — kilograms, or reps/seconds/metres depending on the axis. */
  value: number;
  /** The set's own logged weight, for rendering `+32.5 kg × 5`. Null if unweighted. */
  weightKg: number | null;
  count: number;
  /** When it happened, so the row can say how long the record has stood. */
  at: string;
}

export interface ExerciseBests {
  /** Heaviest effective load ever moved on this movement, in one set. */
  heaviest: RecordSet | null;
  /** Most reps / longest hold / furthest distance in one set. */
  mostCount: RecordSet | null;
  /** Heaviest single set by effective load × reps. Rep-counted work only. */
  bestSetLoad: RecordSet | null;
}

/** How the app asks what the lifter weighed on the day of a set. */
export type BodyweightLookup = (at: string) => number | null;

const NO_BESTS: ExerciseBests = { heaviest: null, mostCount: null, bestSetLoad: null };

/** A row that actually happened and is worth comparing. */
function counts(row: SetHistory): boolean {
  return !row.isWarmup && row.isCompleted !== false && Number.isFinite(row.count) && row.count > 0;
}

/**
 * The standing bests for one exercise.
 *
 * Warm-ups and unlogged rows are excluded — the same rule the overload engine and
 * every chart applies, so a best can never come from a set that did not count.
 *
 * TIES GO TO THE OLDER SET. A record is "when did this last move", and re-doing
 * your best set does not move it: reporting today's date for a number you first hit
 * in June would make the age of every record meaningless.
 */
export function exerciseBests(
  history: readonly SetHistory[],
  exercise: Pick<Exercise, 'id' | 'countUnit' | 'loadMode'>,
  bodyweightAtDate: BodyweightLookup = () => null,
): ExerciseBests {
  const rows = history.filter((row) => row.exerciseId === exercise.id && counts(row));
  if (rows.length === 0) return NO_BESTS;

  // Oldest first, so a strict `>` leaves the earliest of equal values standing.
  const ordered = [...rows].sort((a, b) => Date.parse(a.performedAt) - Date.parse(b.performedAt));

  let heaviest: RecordSet | null = null;
  let mostCount: RecordSet | null = null;
  let bestSetLoad: RecordSet | null = null;

  for (const row of ordered) {
    const as = (value: number): RecordSet => ({
      value,
      weightKg: row.weightKg,
      count: row.count,
      at: row.performedAt,
    });

    if (mostCount == null || row.count > mostCount.value) mostCount = as(row.count);

    // The load ON THE BODY, so bodyweight work compares across a changed bodyweight.
    const load = effectiveLoadKg(row.weightKg, row.loadMode, bodyweightAtDate(row.performedAt));
    if (load == null || !Number.isFinite(load) || load <= 0) continue;

    if (heaviest == null || load > heaviest.value) heaviest = as(Number(load.toFixed(2)));

    // Weight × reps only means something when the count IS reps: `80 kg × 120
    // seconds` is not a set load, it is two units multiplied together.
    if (row.countUnit === 'reps') {
      const setLoad = Number((load * row.count).toFixed(2));
      if (bestSetLoad == null || setLoad > bestSetLoad.value) bestSetLoad = as(setLoad);
    }
  }

  return { heaviest, mostCount, bestSetLoad };
}

/** Which axes a set beat. Empty = an ordinary good set. */
export interface BeatenRecords {
  heaviest: boolean;
  mostCount: boolean;
  bestSetLoad: boolean;
}

const NOTHING_BEATEN: BeatenRecords = {
  heaviest: false,
  mostCount: false,
  bestSetLoad: false,
};

/** Did any axis move? */
export function beatSomething(beaten: BeatenRecords): boolean {
  return beaten.heaviest || beaten.mostCount || beaten.bestSetLoad;
}

/**
 * Does this set beat the standing bests?
 *
 * STRICTLY. Equalling your best is not beating it, and a card that says "new best"
 * for a set you have done four times is a card nobody believes the fifth time.
 *
 * The set is described loosely (a weight, a count, a load mode) rather than as a
 * `SetHistory`, because the live session's rows are `DraftSet`s that have no id, no
 * `performedAt` and no exercise id yet — and the whole value of this function is
 * being able to ask the question mid-workout.
 */
export function recordsBeatenBy(
  set: { weightKg: number | null; count: number; isWarmup?: boolean },
  bests: ExerciseBests,
  exercise: Pick<Exercise, 'countUnit' | 'loadMode'>,
  bodyweightKg: number | null,
): BeatenRecords {
  if (set.isWarmup) return NOTHING_BEATEN;
  if (!Number.isFinite(set.count) || set.count <= 0) return NOTHING_BEATEN;

  const load = effectiveLoadKg(set.weightKg, exercise.loadMode, bodyweightKg);
  const usable = load != null && Number.isFinite(load) && load > 0 ? load : null;

  return {
    heaviest: usable != null && (bests.heaviest == null || usable > bests.heaviest.value),
    mostCount: bests.mostCount == null || set.count > bests.mostCount.value,
    bestSetLoad:
      exercise.countUnit === 'reps' &&
      usable != null &&
      (bests.bestSetLoad == null || usable * set.count > bests.bestSetLoad.value),
  };
}

/**
 * "+32.5 kg × 5 · 14 reps · 178 kg set" — the standing bests in one line.
 *
 * Null when the log has nothing to say, so the caller drops the row rather than
 * rendering a label with nothing after it. Deliberately the same `×` and `·`
 * separators the history shorthand uses.
 */
export function describeBests(
  bests: ExerciseBests,
  countUnit: CountUnit,
  formatWeight: (kg: number) => string,
  formatCount: (count: number) => string,
  lang: Language = 'en',
): string | null {
  const parts: string[] = [];

  if (bests.heaviest) {
    parts.push(`${formatWeight(bests.heaviest.value)} × ${formatCount(bests.heaviest.count)}`);
  }
  if (bests.mostCount) {
    // Named only when it is a different set from the heaviest — otherwise the line
    // states the same row twice.
    const sameSet = bests.heaviest?.at === bests.mostCount.at;
    if (!sameSet) parts.push(formatCount(bests.mostCount.value));
  }
  if (bests.bestSetLoad && countUnit === 'reps') {
    parts.push(t('{weight} set', lang, { weight: formatWeight(bests.bestSetLoad.value) }));
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}

/* ------------------------------------------------------------------ */
/* e1RM trend and the records timeline                                 */
/* ------------------------------------------------------------------ */

/** Two decimals: what every record compares on, so float drift is never a "record". */
function settle(value: number): number {
  return Number(value.toFixed(2));
}

/**
 * Epley's estimated one-rep max for `reps` at `loadKg`.
 *
 * A single is returned as itself: a 1RM you actually lifted is not an estimate,
 * and Epley's 1 + 1/30 would put the "estimate" above the measured fact.
 */
export function e1rm(loadKg: number, reps: number): number {
  if (!Number.isFinite(loadKg) || loadKg <= 0 || !Number.isFinite(reps) || reps <= 0) return 0;
  return reps === 1 ? loadKg : loadKg * (1 + reps / 30);
}

/** One session on the e1RM line, and the set that put it there. */
export interface E1rmPoint extends TrendPoint {
  /** Estimated 1RM in kilograms, two decimals. */
  value: number;
  sessionId: ID;
  /** The set's own logged weight (`+20` on a belt), for "the set: +20 × 5". */
  weightKg: number | null;
  count: number;
  loadMode: LoadMode;
}

/** Rows of one exercise that count, grouped per session, sessions oldest first. */
function sessionsOf(history: readonly SetHistory[], exerciseId: ID): SetHistory[][] {
  const bySession = new Map<ID, SetHistory[]>();
  for (const row of history) {
    if (row.exerciseId !== exerciseId || !counts(row)) continue;
    const bucket = bySession.get(row.sessionId);
    if (bucket) bucket.push(row);
    else bySession.set(row.sessionId, [row]);
  }
  const started = (rows: SetHistory[]) => Math.min(...rows.map((r) => Date.parse(r.performedAt)));
  return [...bySession.values()]
    .map((rows) => [...rows].sort((a, b) => a.setIndex - b.setIndex))
    .sort((a, b) => started(a) - started(b));
}

/** The load on the body for a row, or null when there is none worth comparing. */
function loadOf(row: SetHistory, bodyweightAtDate: BodyweightLookup): number | null {
  const load = effectiveLoadKg(row.weightKg, row.loadMode, bodyweightAtDate(row.performedAt));
  return load != null && Number.isFinite(load) && load > 0 ? load : null;
}

/** One session's best e1RM (earliest set on a tie), or null if it had no rep set with a load. */
function sessionE1rm(
  rows: readonly SetHistory[],
  bodyweightAtDate: BodyweightLookup,
): { value: number; row: SetHistory } | null {
  let best: { value: number; row: SetHistory } | null = null;
  for (const row of rows) {
    if (row.countUnit !== 'reps') continue;
    const load = loadOf(row, bodyweightAtDate);
    if (load == null) continue;
    const value = settle(e1rm(load, row.count));
    if (best == null || value > best.value) best = { value, row };
  }
  return best;
}

/**
 * Oldest first, one point per session: that session's best estimated 1RM.
 *
 * Warm-ups and unlogged rows never count; neither do timed or distance sets (an
 * Epley of seconds is not a number). Bodyweight lifts are estimated on the load the
 * body moved that day, so `+20 × 5` at 78 kg and at 82 kg are different points. A
 * session with nothing to estimate from is left out, not plotted as a zero.
 */
export function e1rmSeries(
  history: readonly SetHistory[],
  exerciseId: ID,
  bodyweightAtDate: BodyweightLookup = () => null,
): E1rmPoint[] {
  const points: E1rmPoint[] = [];
  for (const rows of sessionsOf(history, exerciseId)) {
    const best = sessionE1rm(rows, bodyweightAtDate);
    if (!best) continue;
    points.push({
      at: rows[0].performedAt,
      value: best.value,
      sessionId: best.row.sessionId,
      weightKg: best.row.weightKg,
      count: best.row.count,
      loadMode: best.row.loadMode,
    });
  }
  return points;
}

/** Which best moved. */
export type RecordKind = 'e1rm' | 'heaviest' | 'mostCount';

/** One moment a best moved: the new value, and the set that did it. */
export interface TimelineEntry {
  kind: RecordKind;
  /** Kilograms for `e1rm` and `heaviest`; reps / seconds / metres for `mostCount`. */
  value: number;
  /** When the session happened. */
  at: string;
  sessionId: ID;
  weightKg: number | null;
  count: number;
  countUnit: CountUnit;
  loadMode: LoadMode;
}

/** Display order of entries from the same session: the estimate, then the two facts. */
const KIND_ORDER: readonly RecordKind[] = ['e1rm', 'heaviest', 'mostCount'];

/**
 * Newest first: every session that moved a best, one entry per best it moved.
 *
 * Each session is reduced to its own best on each axis and compared, STRICTLY, with
 * the best of every session before it. Equalling a best is not a record. The first
 * session sets the bar and has no entry. Kept separate from `exerciseBests` (which
 * answers "what stands now") so `recordsBrokenIn` can ask the same question of one
 * session without building the whole history twice.
 */
export function prTimeline(
  history: readonly SetHistory[],
  exerciseId: ID,
  bodyweightAtDate: BodyweightLookup = () => null,
): TimelineEntry[] {
  const standing: Partial<Record<RecordKind, number>> = {};
  const entries: TimelineEntry[] = [];
  let first = true;

  for (const rows of sessionsOf(history, exerciseId)) {
    const at = rows[0].performedAt;
    const tops: Partial<Record<RecordKind, { value: number; row: SetHistory }>> = {};

    const e = sessionE1rm(rows, bodyweightAtDate);
    if (e) tops.e1rm = e;
    for (const row of rows) {
      if (tops.mostCount == null || row.count > tops.mostCount.value) {
        tops.mostCount = { value: row.count, row };
      }
      if (row.loadMode === 'none') continue;
      const load = loadOf(row, bodyweightAtDate);
      if (load == null) continue;
      const value = settle(load);
      if (tops.heaviest == null || value > tops.heaviest.value) tops.heaviest = { value, row };
    }

    const moved: TimelineEntry[] = [];
    for (const kind of KIND_ORDER) {
      const top = tops[kind];
      if (!top) continue;
      const before = standing[kind];
      if (!first && (before == null || top.value > before)) {
        moved.push({
          kind,
          value: top.value,
          at,
          sessionId: top.row.sessionId,
          weightKg: top.row.weightKg,
          count: top.row.count,
          countUnit: top.row.countUnit,
          loadMode: top.row.loadMode,
        });
      }
      if (before == null || top.value > before) standing[kind] = top.value;
    }
    entries.push(...moved.reverse());
    first = false;
  }

  return entries.reverse();
}

/** Where the line went: the sentence above the e1RM chart. */
export interface TrendConclusion {
  direction: 'up' | 'down' | 'level';
  text: string;
}

/**
 * "Up 7.5 kg since 12 Jun, to 96.3 kg." — first session against the latest.
 *
 * The latest, not the peak: the line is read for where it stands now, and a
 * sentence that said "to 100" under a line ending at 92 would be the chart
 * disagreeing with itself. The difference is judged in the unit the user reads,
 * so a 0.02 kg wobble that prints as "0" is called level, not "up 0 lb".
 * Null under two points — there is no direction to state.
 */
export function describeE1rmTrend(
  points: readonly TrendPoint[],
  unitSystem: UnitSystem,
  lang: Language = 'en',
): TrendConclusion | null {
  if (points.length < 2) return null;
  const firstPoint = points[0];
  const last = points[points.length - 1];
  const unit = unitLabel(unitSystem, lang);
  // Both ends as printed, then their difference — so the sentence's three numbers
  // always add up on screen (88.8 → 96.3 is "up 7.5", never "up 7.4").
  const shown = (kg: number) => Number(formatWeight(kg, unitSystem));
  const from = shown(firstPoint.value);
  const to = shown(last.value);
  const delta = Number((to - from).toFixed(1));
  const date = formatShortDate(firstPoint.at, lang);
  const latest = `${formatWeight(last.value, unitSystem)} ${unit}`;
  if (delta === 0) {
    return {
      direction: 'level',
      text: t('Level since {date}, at {latest}.', lang, { date, latest }),
    };
  }
  const magnitude = Math.abs(delta);
  const amount = `${Number.isInteger(magnitude) ? magnitude : magnitude.toFixed(1)} ${unit}`;
  return {
    direction: delta > 0 ? 'up' : 'down',
    text: t(
      delta > 0
        ? 'Up {delta} since {date}, to {latest}.'
        : 'Down {delta} since {date}, to {latest}.',
      lang,
      { delta: amount, date, latest },
    ),
  };
}

/** The kicker on a timeline row: BEST e1RM / HEAVIEST / MOST REPS (or its timed twin). */
export function recordLabel(kind: RecordKind, countUnit: CountUnit, lang: Language = 'en'): string {
  if (kind === 'e1rm') return t('Best e1RM', lang);
  if (kind === 'heaviest') return t('Heaviest', lang);
  if (countUnit === 'seconds') return t('Longest', lang);
  if (countUnit === 'meters') return t('Furthest', lang);
  if (countUnit === 'rounds') return t('Most rounds', lang);
  return t('Most reps', lang);
}

/** "96.3 kg" / "15 reps" / "3:10" — the record's own value, in the user's units. */
export function recordValue(
  entry: Pick<TimelineEntry, 'kind' | 'value' | 'countUnit'>,
  unitSystem: UnitSystem,
  lang: Language = 'en',
): string {
  if (entry.kind !== 'mostCount') {
    return `${formatWeight(entry.value, unitSystem)} ${unitLabel(unitSystem, lang)}`;
  }
  if (entry.countUnit === 'seconds' || entry.countUnit === 'rounds')
    return formatClock(entry.value);
  return `${entry.value} ${countUnitLabel(entry.countUnit, lang)}`;
}

/** "82.5 × 5" / "+20 × 5" / "15" — the set that did it, as the history shorthand writes it. */
export function recordSet(
  entry: Pick<TimelineEntry, 'weightKg' | 'count' | 'countUnit' | 'loadMode'>,
  unitSystem: UnitSystem,
): string {
  const count =
    entry.countUnit === 'seconds' || entry.countUnit === 'rounds'
      ? formatClock(entry.count)
      : String(entry.count);
  // Bodyweight work with nothing on the belt has no weight to write.
  if (entry.weightKg == null || (entry.loadMode !== 'external' && entry.weightKg === 0)) {
    return count;
  }
  return `${formatWeight(entry.weightKg, unitSystem, entry.loadMode)} × ${count}`;
}
