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
  const standing: Standing = {};
  const entries: TimelineEntry[] = [];
  let first = true;

  for (const rows of sessionsOf(history, exerciseId)) {
    const at = rows[0].performedAt;
    const tops = sessionTops(rows, bodyweightAtDate);

    const moved: TimelineEntry[] = [];
    for (const kind of KIND_ORDER) {
      const top = tops[kind];
      if (!top) continue;
      const before = standing[kind];
      if (!first && (before == null || top.value > before)) {
        moved.push({ kind, value: top.value, at, ...setOf(top.row) });
      }
    }
    raise(standing, tops);
    entries.push(...moved.reverse());
    first = false;
  }

  return entries.reverse();
}

/** One session that set a record on one exercise — what E1/E2 count (Wave 3). */
export interface RecordMoment {
  exerciseId: ID;
  sessionId: ID;
  at: string;
}

/**
 * Every (session, exercise) that broke a record, oldest first, by the FINISH
 * SHEET'S rules (`recordsBrokenIn`), not the timeline's: a record needs a bar on
 * its axis, so an exercise's first session and an axis it never had are not
 * records, and pure bodyweight work has no e1RM. One moment per exercise per
 * session, however many axes moved — the sheet's one row.
 *
 * The badges and XP count these, so "your first record" is the session whose
 * Finish sheet first said so.
 */
export function recordMoments(
  history: readonly SetHistory[],
  bodyweightAtDate: BodyweightLookup = () => null,
): RecordMoment[] {
  const byExercise = new Map<ID, SetHistory[]>();
  for (const row of history) {
    const bucket = byExercise.get(row.exerciseId);
    if (bucket) bucket.push(row);
    else byExercise.set(row.exerciseId, [row]);
  }
  const moments: RecordMoment[] = [];
  for (const [exerciseId, rows] of byExercise) {
    const standing: Standing = {};
    for (const session of sessionsOf(rows, exerciseId)) {
      const tops = sessionTops(session, bodyweightAtDate);
      const moved = KIND_ORDER.some((kind) => {
        const top = tops[kind];
        const bar = standing[kind];
        if (!top || bar == null || !(top.value > bar)) return false;
        return !(kind === 'e1rm' && top.row.loadMode === 'none');
      });
      if (moved) {
        moments.push({ exerciseId, sessionId: session[0].sessionId, at: session[0].performedAt });
      }
      raise(standing, tops);
    }
  }
  return moments.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** One session's best on each axis, and the set that holds it. */
type SessionTops = Partial<Record<RecordKind, { value: number; row: SetHistory }>>;
/** The best on each axis across a run of sessions. */
type Standing = Partial<Record<RecordKind, number>>;

/**
 * One session reduced to its best on each axis — earliest set on a tie. The one
 * reading `prTimeline` and `recordsBrokenIn` share, so the Finish sheet and the
 * exercise screen cannot disagree about what a session set.
 */
function sessionTops(rows: readonly SetHistory[], bodyweightAtDate: BodyweightLookup): SessionTops {
  const tops: SessionTops = {};
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
  return tops;
}

/** Fold one session's tops into the standing bests. */
function raise(standing: Standing, tops: SessionTops): void {
  for (const kind of KIND_ORDER) {
    const top = tops[kind];
    if (!top) continue;
    const before = standing[kind];
    if (before == null || top.value > before) standing[kind] = top.value;
  }
}

/** The fields of the set that did it, as a record row carries them. */
function setOf(row: SetHistory) {
  return {
    sessionId: row.sessionId,
    weightKg: row.weightKg,
    count: row.count,
    countUnit: row.countUnit,
    loadMode: row.loadMode,
  };
}

/* ------------------------------------------------------------------ */
/* Records this session — the Finish sheet (T-09)                      */
/* ------------------------------------------------------------------ */

/** One exercise's record on the Finish sheet: the best kind it set, and the bar. */
export interface SessionRecord {
  exerciseId: ID;
  kind: RecordKind;
  /** Same units as `TimelineEntry.value`. */
  value: number;
  /** The standing best it beat, same units. Always there: no bar, no record. */
  previous: number;
  /** When the set that did it happened, and in which session. */
  at: string;
  sessionId: ID;
  weightKg: number | null;
  count: number;
  countUnit: CountUnit;
  loadMode: LoadMode;
}

/** How many rows the Finish sheet shows: a block, not a list. */
const SESSION_RECORDS_SHOWN = 3;

/**
 * Which exercises in the session being finished beat their previous best.
 *
 * `session` is the live workout's completed rows (`draftToSetHistory`), before
 * it is saved; any of them already in `history` are left out of the bar.
 *
 * THE RULES, all the timeline's (see the file header) plus three of its own:
 *
 *  - A RECORD NEEDS A BAR, per axis. An exercise's first-ever session shows
 *    nothing (IMPLEMENTATION_DECISIONS, T-09), and neither does an axis the
 *    history never had — the first loaded set after months of unweighed work is
 *    a first reading, not a record. Rejected: the timeline's looser "any later
 *    session that adds an axis", which would greet a lifter who just typed their
 *    bodyweight with a record on every dip.
 *  - ONE ROW PER EXERCISE, naming the best kind it set: the e1RM, else the
 *    heaviest, else the most reps (or the longest hold). The estimate leads
 *    because it is the one that moves when either of the facts does, and three
 *    rows for one bench set would be the wall of medals the README rules out.
 *  - NO e1RM FOR PURE BODYWEIGHT WORK (`loadMode: 'none'`). Its "load" is the
 *    scale's reading, so the estimate moves when the lifter gets heavier — the
 *    reason the timeline keeps no heaviest for it. The reps are the honest fact.
 *
 * ORDERED most significant first: by kind in that same order, then by the
 * relative jump over the old best, then by the session's own order. At most
 * `limit` rows.
 */
export function recordsBrokenIn(
  session: readonly SetHistory[],
  history: readonly SetHistory[],
  bodyweightAtDate: BodyweightLookup = () => null,
  limit: number = SESSION_RECORDS_SHOWN,
): SessionRecord[] {
  const live = new Set(session.map((row) => row.sessionId));
  const before = history.filter((row) => !live.has(row.sessionId));

  const exerciseIds: ID[] = [];
  for (const row of session) {
    if (!exerciseIds.includes(row.exerciseId)) exerciseIds.push(row.exerciseId);
  }

  const found: { record: SessionRecord; gain: number; order: number }[] = [];
  exerciseIds.forEach((exerciseId, order) => {
    const earlier = sessionsOf(before, exerciseId);
    if (earlier.length === 0) return;
    const standing: Standing = {};
    for (const rows of earlier) raise(standing, sessionTops(rows, bodyweightAtDate));

    // Every live row of this exercise is read as ONE session — which is what lets
    // a Wrapped month ask the same question of all of its sessions at once.
    const rows = session
      .filter((row) => row.exerciseId === exerciseId && counts(row))
      .sort(
        (a, b) => Date.parse(a.performedAt) - Date.parse(b.performedAt) || a.setIndex - b.setIndex,
      );
    if (rows.length === 0) return;
    const tops = sessionTops(rows, bodyweightAtDate);

    for (const kind of KIND_ORDER) {
      const top = tops[kind];
      const bar = standing[kind];
      if (!top || bar == null || !(top.value > bar)) continue;
      if (kind === 'e1rm' && top.row.loadMode === 'none') continue;
      found.push({
        record: {
          exerciseId,
          kind,
          value: top.value,
          previous: bar,
          at: top.row.performedAt,
          ...setOf(top.row),
        },
        gain: bar > 0 ? (top.value - bar) / bar : Infinity,
        order,
      });
      return;
    }
  });

  return found
    .sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.record.kind) - KIND_ORDER.indexOf(b.record.kind) ||
        b.gain - a.gain ||
        a.order - b.order,
    )
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.record);
}

/**
 * "Bench press · 82.5 × 5" and "new best e1RM, 96.3 kg" — the Finish sheet row,
 * in two halves because the second is lit. The e1RM says e1RM, which is how the
 * row admits it is an estimate (the exercise screen spells out the formula).
 */
export function describeSessionRecord(
  record: SessionRecord,
  name: string,
  unitSystem: UnitSystem,
  lang: Language = 'en',
): { lead: string; record: string } {
  const lead = `${name} · ${recordSet(record, unitSystem)}`;
  const value = recordValue(record, unitSystem, lang);
  if (record.kind === 'e1rm') return { lead, record: t('new best e1RM, {value}', lang, { value }) };
  if (record.kind === 'heaviest')
    return { lead, record: t('heaviest yet, {value}', lang, { value }) };
  const phrase =
    record.countUnit === 'seconds'
      ? 'longest yet, {value}'
      : record.countUnit === 'meters'
        ? 'furthest yet, {value}'
        : record.countUnit === 'rounds'
          ? 'most rounds yet, {value}'
          : 'most reps yet, {value}';
  return {
    lead,
    record: t(phrase, lang, {
      value: record.countUnit === 'reps' ? String(record.value) : value,
    }),
  };
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
