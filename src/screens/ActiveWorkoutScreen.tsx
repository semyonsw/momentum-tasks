/**
 * ActiveWorkoutScreen — the screen the app exists for.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ (‹) PULL + SWIMMING                  #92   ⋮ │   ← header, always visible
 *   │     11 of 18 sets · 42:10                    │   ← ⋮: Restart clock, Stop and exit…
 *   ├──────────────────────────────────────────────┤
 *   │ ╭──────────────────────────────────────────╮ │
 *   │ │ BETWEEN SETS               Next: set 3   │ │   ← the lit rest card, up top
 *   │ │ 1:28                                     │ │
 *   │ │ ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │ │
 *   │ │ ( −15 s )( +15 s )( ⏸ )( Skip )          │ │
 *   │ ╰──────────────────────────────────────────╯ │
 *   │ Weighted 90° pull-ups                        │   ← expanded
 *   │ 4 × 4–6 reps · last: +40 kg · 4 4            │
 *   │  ↗ SAME +25 KG FOR 23 DAYS · 5 SESSIONS      │
 *   │  1   +40 KG   ×   4 REPS                 (✓) │
 *   │  3   +40 KG   ×   4 REPS                 ( ) │   ← primed, surface-alt
 *   │  + Add set              − Remove set          │
 *   │ Wide pull-ups machine                  0/4 ● │   ← collapsed
 *   │ Plank                                  0/3   │
 *   │  1      2:00 MIN                   ( ▶ )( ) │   ← timed: run the clock
 *   │ ( + Add an exercise )                        │   ← anything, mid-workout
 *   └──────────────────────────────────────────────┘
 *
 * NO TAB BAR. The session owns the screen: there is nothing else worth doing
 * mid-set, and a tab bar would put a navigation target a thumb-slip from the ✓.
 *
 * Everything here is composition and wiring: state lives in the store, decisions
 * live in `lib/`. The screen's only real job is to keep the thing the user is
 * doing right now under their thumb.
 *
 * ── OPENING A WORKOUT IS NOT STARTING ONE ───────────────────────────────────
 *
 * A routine can be opened just to read it — "what is on push day again?" — and
 * that must leave no trace: no date, no duration, no history row. So the session
 * arrives with `startedAt: null` and this screen offers three things instead of
 * two:
 *
 *   • `Start` anchors the clock to now. Until it is pressed the header says
 *     `not started` and nothing is timed. Logging a set starts it too, because a
 *     ✓ says "I am training" as clearly as the button does.
 *   • `Stop and exit` leaves WITHOUT SAVING. On a workout with sets logged it
 *     asks first; on one with nothing logged it just goes.
 *   • `Finish` saves, and is only offered once the workout has started.
 *
 * The back chevron — and Android's own back gesture, which goes through the same
 * path — is the fourth way out and the quiet one: it leaves a started workout
 * running (the store persists it, so the session is still there when you come
 * back) and throws away one that was only being looked at.
 *
 * `Restart the clock` is the same action as `Start`, offered again (in the
 * header's ⋮) while a workout runs: a session left open in a locker reads five
 * hours, and one tap re-anchors it without touching a single logged set.
 *
 * ── THE SESSION IS EDITABLE WHILE IT RUNS ───────────────────────────────────
 *
 * A plan survives contact with the gym for about ten minutes. Three things on this
 * screen are that admission:
 *
 *   • `+ Add an exercise` at the bottom — pick anything from the library, or create
 *     something that isn't in it yet, and it lands at the end of THIS session with
 *     one set. Neck work at the end of pull day is not a routine edit.
 *   • THE ✎ on the open card — SESSION EDIT MODE. `editingEntryId` below is the
 *     one card in it: every row grows its own `−`, and `Add set`, `Warm-up`,
 *     `Rest, targets and cue` and `Remove exercise` replace the footer. It ends on
 *     `Done` and nothing else. See `ExerciseCard`.
 *   • LONG PRESS, THEN SLIDE to reorder. The order you planned is not the order the
 *     machines are free in.
 *
 * REMOVING AN EXERCISE DOES NOT ASK. The card closes and slides out, the entry
 * leaves the store when it has gone, and a toast says `Removed Barbell row` with
 * an Undo for 4.5 s that puts the snapshot back at the same index, logged sets
 * and all (`insertEntry`). The sheet it replaced protected the logged sets; the
 * Undo protects them too, and costs nothing on the removals that were meant.
 *
 * ── ONE CARD OPEN, OR NONE ──────────────────────────────────────────────────
 *
 * Two different questions used to share one answer, and that is what made the list
 * feel stuck:
 *
 *   • WHICH EXERCISE AM I ON? — the cursor, `activeEntryId` in the store. It is
 *     what `completeSet` advances, what `Rest` belongs to, and what the auto-scroll
 *     follows. It always points somewhere while the session has exercises.
 *   • WHICH CARD IS OPEN? — a view state, and it is allowed to be NOTHING. Tapping
 *     the open card's header shuts it; tapping any other card opens that one and
 *     moves the cursor to it, because tapping an exercise is saying "I'm doing this
 *     now".
 *
 * So `collapsedId` below is not a second cursor. It records the one thing the
 * store has no business knowing: that the user has shut the card they are on. The
 * moment the cursor moves — a finished exercise, an exercise added mid-session —
 * the new card opens, which is the behaviour that made one-card-at-a-time worth
 * having in the first place.
 *
 * A SHUT CARD HOLDING THE NEXT SET GLOWS. It has to: with everything closed the
 * list is eight names and nothing else, and "where was I" is then a question the
 * user has to answer by remembering. The name goes green-bright and the card takes
 * a green ring, the same green the next set's row outline uses inside the open
 * card, because both mean THIS IS THE WORK.
 *
 * ── AND THE GLOW IS NOT THE CURSOR ──────────────────────────────────────────
 *
 * It was, and that was the bug. `activeEntryId` moves when a card is TAPPED,
 * because tapping an exercise is how you say "I'm doing this now" — so opening a
 * card just to check what you lifted last week moved the glow onto that card, and
 * the set you were actually about to do stopped being marked.
 *
 * So the mark is derived from the log instead: `upNextSet` (`lib/upNext.ts`) is the
 * set after the one you last logged, and nothing but a ✓ can move it. Reordering
 * the list moves it too — an exercise dragged in above the work genuinely is the
 * next thing to do — which is exactly what the drag is promising.
 *
 * The cursor stays, and keeps the two jobs that are actually about the view: which
 * card is open, and which card the auto-scroll chases.
 *
 * ── FOCUS MODE IS THIS SCREEN WITH EVERYTHING ELSE TAKEN AWAY ───────────────
 *
 * `components/FocusMode.tsx` — a sheet over this screen, opened from the `Focus`
 * row in the open card or from the up-next row itself, holding the two facts this
 * screen has to fit around a header, a pill and eighteen rows: the set you are
 * about to do, and how long until you do it.
 *
 * It is a SHEET rather than a route because rest keeps running when you leave it,
 * and this screen's own pill picks the countdown up mid-flight. Two things follow
 * from that and both are here rather than in the sheet:
 *
 *   • `focusOpen` is screen-local and NOT persisted, for the same reason
 *     `collapsedId` is not: reopening the app should show you the session, not the
 *     fact that focus mode was open at some point.
 *   • NO PILL RENDERS WHILE IT IS OPEN. `useRestTimer` and `useSetTimer` count the
 *     last seconds out loud and hold the keep-awake lock; the sheet runs its own
 *     instance of each, and two live instances would double both. (The pocket
 *     alarms are not theirs — `useTimerAlerts`, once, in `App.tsx`.) The deadline lives in the store, so the hand-off costs
 *     nothing — see `FocusMode`'s header.
 *
 * ── HOW THE DRAG WORKS ──────────────────────────────────────────────────────
 *
 * LONG PRESS, THEN SLIDE — `hooks/useDragReorder.ts`, shared with the routine
 * editor so the gesture is the same one in both lists. This screen supplies the
 * three things only it knows: the card ids in order, the layouts captured on each
 * card's `onLayout`, and `moveEntry` to commit. What it renders for the mode is
 * here — the lifted card following `dragY`, every other card dimmed, and the whole
 * list refusing touches so a finger sliding a card across a ✓ does not log a set.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { ConfirmSheet } from '../components/ConfirmSheet';
import { ExerciseCard } from '../components/ExerciseCard';
import { FinishSheet, type FinishRecord } from '../components/FinishSheet';
import { FocusMode } from '../components/FocusMode';
import { GrowIn, pressedStyle } from '../components/motion';
import { ReorderRow } from '../components/ReorderRow';
import { RestTimerPill } from '../components/RestTimerPill';
import { SessionHeader } from '../components/SessionHeader';
import { SetTimerPill } from '../components/SetTimerPill';
import { useLanguage, useT } from '../hooks/useT';
import { describeDeload } from '../lib/deload';
import type { DraftEntry, DraftSession, DraftSet } from '../lib/draft';
import { celebrate, commit, tap, undo } from '../lib/feedback';
import { useDragReorder, type CardLayout } from '../hooks/useDragReorder';
import { ADVANCE_HOLD_MS, holdsAfterFinishing } from '../lib/cardAdvance';
import { resolveRest } from '../lib/rest';
import { describeLadderOutcomes, ladderOutcomes } from '../lib/repLadder';
import { describePlannedSetDiff, performedSetCounts, plannedSetDiff } from '../lib/routinePlan';
import { supersetPosition } from '../lib/superset';
import { upNextSet } from '../lib/upNext';
import { describeWarmup, warmupSets, type WarmupSet } from '../lib/warmup';
import {
  beatSomething,
  describeSessionRecord,
  recordsBeatenBy,
  recordsBrokenIn,
} from '../lib/records';
import { bodyweightAt } from '../lib/bodyweightLog';
import { useWorkoutHistory } from '../state/workoutHistoryStore';
import { formatCount, formatWeight, unitLabel } from '../lib/units';
import { useActiveWorkout, useSessionProgress } from '../state/activeWorkoutStore';
import { platesInForce, useSettings } from '../state/settingsStore';
import { PrimaryButton, Separator, TextButton } from '../components/primitives';
import { Sheet } from '../components/Sheet';
import { FloatingPair, Lamps, Toast, type ToastAction } from '../components/glass';
import { draftToSetHistory, sessionVolume } from '../lib/draft';
import type { ID, RoutineItem, UnitSystem } from '../types/models';

/**
 * The air left above the auto-scrolled card, in dp.
 *
 * Small on purpose: the top of the card lands ON the line the timer pill sits on,
 * so the exercise's name and its first sets are the first thing in the viewport
 * and nothing above them is wasted. Any more than a hair here and the list looks
 * like it stopped short.
 */
const CARD_TOP_GAP = 8;

/**
 * How long the auto-scroll keeps correcting itself against fresh layouts, in ms.
 *
 * Long enough for the collapse-and-expand pass that follows a cursor move, short
 * enough that the next `Add set` is the user's business and not the scroll's. See
 * `pendingScroll`.
 */
const LAYOUT_SETTLE_MS = 350;

/** What one card is handed, bound to its entry once — see `handlersFor`. */
interface CardHandlers {
  onToggleExpanded: () => void;
  onLift: () => void;
  onPressTimer: (setId: ID) => void;
  onToggleSet: (setId: ID) => void;
  onPatchSet: (setId: ID, patch: Partial<DraftSet>) => void;
  onAddWarmup: () => void;
  onAddSet: () => void;
  onRemoveSet: (setId: ID) => void;
  onAcceptOverload: () => void;
  onDismissOverload: () => void;
  onRemoveExercise: () => void;
  onToggleEditing: () => void;
  onEditExercise: () => void;
}

interface ActiveWorkoutScreenProps {
  unitSystem: UnitSystem;
  /**
   * Persist the finished session; navigation happens after it resolves.
   *
   * Handed the whole draft rather than pre-flattened rows: history keeps a record
   * of the WORKOUT — its title, how long it took, which exercises were in it — and
   * a screen whose job is logging sets should not be the thing that decides what
   * that record looks like. `lib/completedWorkout.ts` owns that shape.
   */
  onFinish: (session: DraftSession, updatePlan?: boolean) => Promise<void> | void;
  /**
   * The routine items this session was built from, for the `Finish` sheet's one
   * extra offer: "Dips did 5 sets, not 4 — update the routine?"
   *
   * Absent when the session did not come from a routine, which is also the answer
   * to whether there is a plan to update. The DIFF is not computed here — this
   * screen hands the items to `plannedSetDiff` and renders the sentence it gets
   * back, because "which exercise's item learns from which entry" is a decision
   * and decisions live in `lib/`.
   */
  routineItems?: readonly RoutineItem[];
  /**
   * Leave the logging screen. The CALLER decides what that means for the session
   * itself — a started workout keeps running, an unstarted one is thrown away
   * (see `AppShell.leaveSession`), and both `Finish` and `Stop and exit` have
   * already ended it by the time they call this.
   */
  onExit: () => void;
  /**
   * Open the library as a picker for THIS session. Absent = no add button, which
   * is what a caller with nowhere to navigate should get rather than a dead row.
   */
  onAddExercise?: () => void;
  /**
   * Open the exercise editor on one of this session's movements.
   *
   * Handed the LIBRARY id rather than the entry id, because that is what the editor
   * edits: the session's copy is updated on the way back by the shell
   * (`syncExercise`), so the card the user was looking at shows the new rest before
   * the next set. Absent = no `Edit exercise` row, the same rule `onAddExercise`
   * follows.
   */
  onEditExercise?: (exerciseId: ID) => void;
  /**
   * The ordinal this workout will be saved as — `#92` in the header, `Workout 92`
   * on the Finish sheet. The shell has the numbering; this screen only prints it.
   */
  workoutNumber?: number;
}

/** How long a toast with an Undo in it stays up. */
const UNDO_TOAST_MS = 4500;
/**
 * The floating pair's `bottom` — the design's 28 for the live workout, a little
 * higher than the sections' 24 because nothing sits under it here (no nav bar).
 */
const PAIR_BOTTOM = 28;
/** The pair is 64 tall at `PAIR_BOTTOM`; a toast clears it by 12. */
const SESSION_TOAST_BOTTOM = PAIR_BOTTOM + 64 + 12;

export function ActiveWorkoutScreen({
  unitSystem,
  routineItems,
  onFinish,
  onExit,
  onAddExercise,
  onEditExercise,
  workoutNumber,
}: ActiveWorkoutScreenProps) {
  const t = useT();
  const lang = useLanguage();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  /**
   * y offset + height of each card, captured on layout: auto-scroll and dragging.
   *
   * The offsets are relative to the list wrapper, not to the scroll content — the
   * drag only ever compares them to each other, and `listTop` is what turns one
   * into a scroll position.
   */
  const cardLayouts = useRef<Record<ID, CardLayout>>({});
  /** Where the list wrapper starts inside the scroll content. */
  const listTop = useRef(0);
  const [confirming, setConfirming] = useState<'finish' | 'clock' | 'discard' | 'menu' | null>(
    null,
  );
  /**
   * The exercise on its way out: still drawn, closing, with the snapshot and the
   * index its Undo will need. It leaves the store when its card has finished
   * leaving the screen — see the file header.
   */
  const [removing, setRemoving] = useState<{ entry: DraftEntry; index: number } | null>(null);
  /** The one card in session edit mode, or none. See `ExerciseCard`. */
  const [editingEntryId, setEditingEntryId] = useState<ID | null>(null);
  /** What the last removal said, and the Undo that goes with it. */
  const [toast, setToast] = useState<{ text: string; action?: ToastAction; key: number } | null>(
    null,
  );
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), toast.action ? UNDO_TOAST_MS : 1900);
    return () => clearTimeout(timer);
  }, [toast]);
  /**
   * A card that has just been finished, held open for one beat before the next
   * one opens — `lib/cardAdvance.ts` has the rule and the reason.
   */
  const [holdOpenId, setHoldOpenId] = useState<ID | null>(null);
  /**
   * The card the user has SHUT, when it is the one the cursor is on.
   *
   * Screen-local and deliberately not persisted: reopening the app should show you
   * the exercise you are on, not the fact that you closed it at some point. It is
   * compared against the live cursor rather than cleared when the cursor moves, so
   * a finished exercise opens the next one without a second piece of bookkeeping —
   * see the file header.
   */
  const [collapsedId, setCollapsedId] = useState<ID | null>(null);
  /** Focus mode is open over this screen. See the file header. */
  const [focusOpen, setFocusOpen] = useState(false);

  /* --- store bindings: one selector per slice, never the whole store --- */
  const session = useActiveWorkout((s) => s.session);
  const activeEntryId = useActiveWorkout((s) => s.activeEntryId);
  /*
   * Set counts, through a hook rather than `useActiveWorkout(selectProgress)`.
   *
   * That selector builds a `{done, total}` object, and Zustand v5 compares
   * selector results by reference: a fresh object every call means every render
   * reports a changed snapshot, `useSyncExternalStore` re-renders to catch up, and
   * the render after that reports changed again — an unbounded loop ending in
   * "Maximum update depth exceeded". This screen was the only place it happened,
   * which made it a crash the instant a workout started. `useSessionProgress`
   * wraps the same selector in `useShallow`. See the note on `selectProgress`.
   */
  const progress = useSessionProgress();
  /*
   * 100%: the last planned set just got its ✓. Felt once, on the transition —
   * the ref starts at the CURRENT answer, so reopening a session that was
   * already complete is not a second celebration.
   */
  const everySetLogged = progress.total > 0 && progress.done === progress.total;
  const wasEverySetLogged = useRef(everySetLogged);
  useEffect(() => {
    if (everySetLogged && !wasEverySetLogged.current) celebrate();
    wasEverySetLogged.current = everySetLogged;
  }, [everySetLogged]);
  /*
   * The timer object, not its ticking clock: this identity changes only when a
   * timer starts, is adjusted, or ends. The 4 Hz tick lives inside the pill, so
   * a running plank does not re-render eighteen set rows four times a second.
   */
  const setTimer = useActiveWorkout((s) => s.setTimer);

  const setActiveEntry = useActiveWorkout((s) => s.setActiveEntry);
  const completeSet = useActiveWorkout((s) => s.completeSet);
  const uncompleteSet = useActiveWorkout((s) => s.uncompleteSet);
  const patchSet = useActiveWorkout((s) => s.patchSet);
  const addSet = useActiveWorkout((s) => s.addSet);
  const addWarmupSets = useActiveWorkout((s) => s.addWarmupSets);
  const removeSet = useActiveWorkout((s) => s.removeSet);
  const insertSet = useActiveWorkout((s) => s.insertSet);
  const removeEntry = useActiveWorkout((s) => s.removeEntry);
  const insertEntry = useActiveWorkout((s) => s.insertEntry);
  const moveEntry = useActiveWorkout((s) => s.moveEntry);
  const startWorkout = useActiveWorkout((s) => s.startWorkout);
  const discardSession = useActiveWorkout((s) => s.discardSession);
  const acceptOverload = useActiveWorkout((s) => s.acceptOverload);
  const dismissOverload = useActiveWorkout((s) => s.dismissOverload);
  const finishSession = useActiveWorkout((s) => s.finishSession);
  const startSetTimer = useActiveWorkout((s) => s.startSetTimer);
  const commitSetTimer = useActiveWorkout((s) => s.commitSetTimer);
  const startRestNow = useActiveWorkout((s) => s.startRestNow);
  const setSessionEffort = useActiveWorkout((s) => s.setSessionEffort);

  /*
   * The live between-sets setting. Each card resolves its OWN rest from it
   * (`resolveRest`, below) rather than showing it flat: an exercise with a rest of
   * its own runs that, and a `Rest 2:00` button that then started a 3:00 countdown
   * is the same lie this rework exists to remove. Read here rather than off the
   * entry so an exercise that is following the setting follows it live — which is
   * also what `completeSet` will do.
   */
  const restSeconds = useSettings((s) => s.restSecondsBetweenSets);
  /*
   * The plates of whichever gym the user says they are in, for the `20 + 2×10`
   * line under a barbell lift. Memoized on the two stable references it derives
   * from, because `platesInForce` builds a fresh array and `SetRow` is memoized:
   * a new array identity every render would repaint eighteen rows on every tick
   * of the rest timer.
   */
  /*
   * Today's bodyweight, for reading a bodyweight-loaded set against its own record.
   * The scalar rather than the log, because every set being compared here happened
   * in this session — today is the only day involved.
   */
  const bodyweightKg = useSettings((s) => s.bodyweightKg);
  const gyms = useSettings((s) => s.gyms);
  const activeGymId = useSettings((s) => s.activeGymId);
  const availablePlatesKg = useMemo(
    () => platesInForce({ gyms, activeGymId }),
    [gyms, activeGymId],
  );

  /**
   * The warm-up rows each exercise would get, keyed by entry.
   *
   * ONE PASS FOR THE WHOLE SESSION, memoized, because the alternative is running
   * `loadableAtOrBelow`'s plate walk inside a render that happens four times a
   * second while a rest timer ticks. Keyed by entry rather than by exercise, since
   * two entries can be the same movement at different weights.
   *
   * An exercise is absent from the map when there is nothing to offer — see
   * `warmupSets` for the four cases — and the card reads that as "no row".
   */
  const warmupPlans = useMemo(() => {
    const plans: Record<ID, { sets: WarmupSet[]; summary: string }> = {};
    for (const entry of session?.entries ?? []) {
      // Nothing to warm up for once the exercise is under way — or once its
      // warm-ups are already on it: a second tap used to add the ramp twice.
      if (entry.sets.some((set) => set.isCompleted || set.isWarmup)) continue;
      // The first working set's weight is what the rungs are a fraction of.
      const working = entry.sets.find((set) => !set.isWarmup)?.weightKg ?? null;
      const sets = warmupSets({
        workingWeightKg: working,
        exercise: entry.exercise,
        availablePlatesKg,
      });
      const summary = describeWarmup(sets);
      if (summary) plans[entry.localId] = { sets, summary };
    }
    return plans;
  }, [availablePlatesKg, session?.entries]);

  /**
   * The best each exercise has broken in this session, keyed by entry.
   *
   * Read off LOGGED rows only, and compared against the bests copied onto the entry
   * when the session was built — so the second good set of a day does not stop
   * reading as a best because the first one already moved the bar. Memoized on the
   * entries, because it walks every logged set and this screen re-renders on every
   * tick of the rest timer.
   */
  const bestLines = useMemo(() => {
    const lines: Record<ID, string> = {};
    for (const entry of session?.entries ?? []) {
      const bests = entry.bests;
      if (!bests) continue;

      let best: { weightKg: number | null; count: number } | null = null;
      for (const set of entry.sets) {
        if (!set.isCompleted || set.isWarmup) continue;
        const beaten = recordsBeatenBy(set, bests, entry.exercise, bodyweightKg ?? null);
        if (!beatSomething(beaten)) continue;
        // The last one that beat something — a session that keeps climbing should
        // report where it got to, not where it started.
        best = set;
      }
      if (!best) continue;

      lines[entry.localId] = entry.exercise.requiresWeight
        ? `${formatWeight(best.weightKg, unitSystem, entry.exercise.loadMode)} ${unitLabel(unitSystem, lang)} × ${formatCount(best.count, entry.exercise.countUnit)}`
        : formatCount(best.count, entry.exercise.countUnit);
    }
    return lines;
  }, [bodyweightKg, lang, session?.entries, unitSystem]);

  /**
   * Stalled lifts, keyed by entry.
   *
   * Suppressed wherever the overload nudge is already speaking: "add a rep" and
   * "take some weight off" on one card is one of them wrong, and the deload wins
   * because three failed sessions is newer information than a stale weight.
   *
   * Memoized for the same reason the warm-up plan is — it walks history and this
   * screen re-renders four times a second while a rest timer runs.
   */
  const deloadMessages = useMemo(() => {
    const out: Record<ID, string> = {};
    for (const entry of session?.entries ?? []) {
      if (entry.overload.shouldNudge && !entry.overloadAccepted) continue;
      if (entry.deload?.shouldSuggest) out[entry.localId] = describeDeload(entry.deload, lang);
    }
    return out;
  }, [session?.entries, lang]);

  /**
   * THE BEAT AFTER AN EXERCISE'S LAST ✓. The store has already moved the cursor
   * on; the finished card stays open for `ADVANCE_HOLD_MS` so the ✓ is seen to
   * land, and then the next card that still has work in it opens.
   */
  const previousActive = useRef(activeEntryId);
  useEffect(() => {
    const previous = previousActive.current;
    previousActive.current = activeEntryId;
    if (previous == null || previous === activeEntryId) return undefined;
    const finished = useActiveWorkout
      .getState()
      .session?.entries.find((entry) => entry.localId === previous);
    if (!holdsAfterFinishing(finished, Date.now())) return undefined;

    setHoldOpenId(previous);
    const timer = setTimeout(() => {
      setHoldOpenId(null);
      /* The store opens the NEXT card, which may be one already done; the design
         opens the next one with a set left to do. */
      const state = useActiveWorkout.getState();
      const current = state.session?.entries.find((e) => e.localId === state.activeEntryId);
      if (current && current.sets.every((set) => set.isCompleted)) {
        const next = upNextSet(state.session);
        if (next && next.entryId !== current.localId) state.setActiveEntry(next.entryId);
      }
    }, ADVANCE_HOLD_MS);
    return () => {
      clearTimeout(timer);
      setHoldOpenId(null);
    };
  }, [activeEntryId]);

  /** The one open card, or null when the user has shut the one they are on. */
  const expandedEntryId =
    holdOpenId ?? (activeEntryId != null && activeEntryId === collapsedId ? null : activeEntryId);

  /**
   * THE set of the whole session that glows — see the file header.
   *
   * Memoized on the session because it walks every set of every exercise, and this
   * screen re-renders four times a second while a rest timer runs. The session's
   * identity changes on every ✓ and every reorder, which is exactly when the
   * answer can change.
   */
  const upNext = useMemo(() => upNextSet(session), [session]);

  const isStarted = session?.startedAt != null;
  const elapsedMinutes = useElapsedMinutes(session?.startedAt ?? null);

  /* --- reorder ------------------------------------------------------- */
  const entryIds = useMemo(
    () => (session?.entries ?? []).map((e) => e.localId),
    [session?.entries],
  );
  const reorder = useDragReorder(entryIds, cardLayouts, moveEntry);
  const { lifted, dragY, panHandlers, lift, drop, shiftFor } = reorder;
  const liftedName = lifted
    ? (session?.entries.find((e) => e.localId === lifted)?.exercise.name ?? '')
    : '';

  /* --- keep the active card in view ---------------------------------- */
  /**
   * Scroll so THE TOP OF THE CARD sits just under the timer pill.
   *
   * That is the whole rule, and it is the one that makes the auto-scroll useful:
   * the exercise's name and its first sets are what you need to see when the
   * cursor lands on it, so the card starts where the list starts. `CARD_TOP_GAP`
   * is the hair of air that keeps the name off the pill's edge — the card is
   * under the pill, not tucked behind it.
   */
  const scrollToCard = useCallback((entryId: ID) => {
    const layout = cardLayouts.current[entryId];
    if (layout == null) return;
    scrollRef.current?.scrollTo({
      y: Math.max(0, listTop.current + layout.y - CARD_TOP_GAP),
      animated: true,
    });
  }, []);

  /**
   * The card the scroll is chasing, and the moment it stops chasing it.
   *
   * THE LAYOUTS ARE ONE FRAME BEHIND, and that is what made this scroll wrong.
   * Moving the cursor shuts the card above and opens this one, so every `y` below
   * the change is stale at the instant the effect runs — by the height of a whole
   * expanded card, which is what "it scrolls too far" was. `onLayout` is where the
   * true number arrives, so the scroll is re-issued there.
   *
   * Time-boxed rather than one-shot, because several layout passes can land (the
   * card above collapsing, this one expanding), and NOT left armed, because the
   * card re-lays out for ordinary reasons too — `Add set`, a plate line appearing —
   * and yanking the list to the top on those would be the app fighting the thumb.
   */
  const pendingScroll = useRef<{ id: ID; until: number } | null>(null);

  useEffect(() => {
    if (!expandedEntryId || lifted) return;
    pendingScroll.current = { id: expandedEntryId, until: Date.now() + LAYOUT_SETTLE_MS };
    // Immediately as well, off whatever is known: a card whose layout does not
    // change at all still has to be scrolled to.
    scrollToCard(expandedEntryId);
  }, [expandedEntryId, lifted, scrollToCard]);

  /* --- handlers ------------------------------------------------------ */
  /**
   * Tapping a card: open it, or — if it is already the open one — shut it.
   *
   * Opening one also moves the CURSOR to it. That is not an extra: the cursor is
   * "which exercise am I on", and reaching past three cards to open the fourth is
   * how a user says they are on the fourth.
   */
  const handleToggleCard = useCallback(
    (entryId: ID) => {
      tap();
      if (entryId === expandedEntryId) {
        setCollapsedId(entryId);
        return;
      }
      setCollapsedId(null);
      if (entryId !== activeEntryId) setActiveEntry(entryId);
    },
    [activeEntryId, expandedEntryId, setActiveEntry],
  );

  const handleToggleSet = useCallback(
    (entryId: ID, setId: ID, isCompleted: boolean) => {
      if (isCompleted) uncompleteSet(entryId, setId);
      else completeSet(entryId, setId); // also starts rest + advances the cursor
    },
    [completeSet, uncompleteSet],
  );

  /** ▶ starts the clock; ▶ again on the running set stops it and logs the time. */
  const handlePressTimer = useCallback(
    (entryId: ID, setId: ID) => {
      if (setTimer?.setId === setId) commitSetTimer();
      else startSetTimer(entryId, setId);
    },
    [commitSetTimer, setTimer?.setId, startSetTimer],
  );

  /**
   * Where the finished session's set counts disagree with the routine's plan.
   *
   * Computed while the sheet is open, from the LIVE session — the draft is gone by
   * the time `commitFinish` has run, so this cannot be derived afterwards.
   * `null`/empty means there is nothing to offer, and the sheet renders no offer.
   */
  const planChanges = useMemo(
    () =>
      confirming === 'finish' && session?.routineId && routineItems
        ? plannedSetDiff(routineItems, performedSetCounts(session.entries))
        : [],
    [confirming, routineItems, session?.entries, session?.routineId],
  );

  /**
   * What the ladders in this session earned, computed from the LIVE session for
   * the same reason `planChanges` is: the draft is gone by the time the finish has
   * run, so this cannot be derived afterwards.
   *
   * Read-only here. The sheet states it and `AppShell` is what writes the new max
   * back to the library — a screen whose job is logging sets does not get to edit
   * the exercise library, and recomputing it there means the write lands on the
   * row as the STORE has it rather than on the snapshot this line rendered.
   */
  const ladderChange = useMemo(
    () => describeLadderOutcomes(ladderOutcomes(session?.entries ?? []), lang),
    [session?.entries, lang],
  );

  /**
   * The records this session broke (W6), for the Finish sheet.
   *
   * Against the whole saved log, with each set weighed at that day's bodyweight —
   * the same reading the exercise screen's timeline makes, so the row on the sheet
   * and the timeline entry the save is about to create say the same number.
   * A function rather than a memo because `handleFinish` asks it before the sheet
   * exists; the memo below is only the sheet's copy, worked out while it is open.
   */
  const historyWorkouts = useWorkoutHistory((s) => s.workouts);
  const bodyweightLog = useSettings((s) => s.bodyweightLog);
  const findRecords = useCallback(
    (draft: DraftSession) => {
      const rows = draftToSetHistory(draft);
      if (rows.length === 0) return [];
      const ids = new Set(rows.map((row) => row.exerciseId));
      const history = historyWorkouts.flatMap((w) => w.sets.filter((r) => ids.has(r.exerciseId)));
      return recordsBrokenIn(rows, history, (at) => bodyweightAt(bodyweightLog, at));
    },
    [bodyweightLog, historyWorkouts],
  );
  const finishRecords = useMemo((): FinishRecord[] => {
    if (confirming !== 'finish' || !session) return [];
    return findRecords(session).map((record) => {
      const name =
        session.entries.find((entry) => entry.exercise.id === record.exerciseId)?.exercise.name ??
        '';
      return {
        key: record.exerciseId,
        ...describeSessionRecord(record, name, unitSystem, lang),
      };
    });
  }, [confirming, findRecords, lang, session, unitSystem]);

  /*
   * SAVE FIRST, CLEAR SECOND. This used to clear the session (and so its
   * persisted copy) and then save it: a save that threw — a full disk, a
   * database that could not be opened at launch — lost the whole workout, from
   * memory and from disk, and left the screen empty. Now a failed save leaves
   * the session exactly where it was, says so, and Finish can be pressed again.
   */
  const commitFinish = useCallback(
    async (updatePlan = false) => {
      setConfirming(null);
      const draft = useActiveWorkout.getState().session;
      if (!draft) return;
      try {
        await onFinish(draft, updatePlan);
      } catch (error) {
        console.error('[finish] save failed', error);
        setToast({
          text: t('Could not save the workout. It is still here: try Finish again.'),
          key: Date.now(),
        });
        return;
      }
      finishSession();
      onExit();
    },
    [finishSession, onExit, onFinish, t],
  );

  /**
   * Remove an exercise: start its card leaving, and remember enough to put it
   * back. It leaves the STORE in `finishRemoval`, once it has left the screen.
   */
  const handleRemoveEntry = useCallback(
    (entryId: ID) => {
      if (removing) return;
      const entries = useActiveWorkout.getState().session?.entries ?? [];
      const index = entries.findIndex((e) => e.localId === entryId);
      if (index === -1) return;
      setRemoving({ entry: entries[index], index });
    },
    [removing],
  );

  /**
   * A LOGGED set just left: say so, with the Undo that puts it back where it
   * was. Unlogged rows go quietly — `+ Add set` is their way back, and a toast
   * on every `− Remove set` would be noise over the one removal that costs data.
   */
  const offerSetUndo = useCallback(
    (entryId: ID, removed: DraftSet, index: number) => {
      const name =
        useActiveWorkout.getState().session?.entries.find((e) => e.localId === entryId)?.exercise
          .name ?? '';
      setToast({
        text: t('Removed a logged set from {name}', { name }),
        key: Date.now(),
        action: {
          label: t('Undo'),
          onPress: () => {
            tap();
            insertSet(entryId, removed, index);
            setToast(null);
          },
        },
      });
    },
    [insertSet, t],
  );

  const openFocus = useCallback(() => setFocusOpen(true), []);

  /*
   * THE CARDS' HANDLERS, ONE STABLE SET PER ENTRY.
   *
   * `ExerciseCard` is memoized, and it used to be handed fourteen fresh closures
   * per render — so a ✓ on one card re-rendered every card in the list, each with
   * its rolling counter, ring and marquee, three or four times over as the cursor
   * advanced. Now each entry keeps the same functions for its whole life, and they
   * read what they need (the open card, the warm-up plan, the set's own state) at
   * the moment they are pressed, from `live` and the store. The store keeps
   * untouched entries by identity, so a ✓ re-renders the card it landed on.
   */
  const live = useRef({
    handleToggleCard,
    handleToggleSet,
    handlePressTimer,
    handleRemoveEntry,
    offerSetUndo,
    lift,
    warmupPlans,
    onEditExercise,
  });
  live.current = {
    handleToggleCard,
    handleToggleSet,
    handlePressTimer,
    handleRemoveEntry,
    offerSetUndo,
    lift,
    warmupPlans,
    onEditExercise,
  };
  const cardHandlers = useRef(new Map<ID, CardHandlers>()).current;
  const handlersFor = (entryId: ID): CardHandlers => {
    const known = cardHandlers.get(entryId);
    if (known) return known;
    const entryNow = () =>
      useActiveWorkout.getState().session?.entries.find((e) => e.localId === entryId);
    const handlers: CardHandlers = {
      onToggleExpanded: () => live.current.handleToggleCard(entryId),
      onLift: () => live.current.lift(entryId),
      onPressTimer: (setId) => live.current.handlePressTimer(entryId, setId),
      onToggleSet: (setId) => {
        const target = entryNow()?.sets.find((set) => set.localId === setId);
        live.current.handleToggleSet(entryId, setId, target?.isCompleted ?? false);
      },
      onPatchSet: (setId, patch) => patchSet(entryId, setId, patch),
      onAddWarmup: () => {
        const plan = live.current.warmupPlans[entryId];
        if (plan) addWarmupSets(entryId, plan.sets);
      },
      onAddSet: () => addSet(entryId),
      onRemoveSet: (setId) => {
        const sets = entryNow()?.sets ?? [];
        const index = sets.findIndex((set) => set.localId === setId);
        const removed = sets[index];
        removeSet(entryId, setId);
        if (removed?.isCompleted) live.current.offerSetUndo(entryId, removed, index);
      },
      onAcceptOverload: () => acceptOverload(entryId),
      onDismissOverload: () => dismissOverload(entryId),
      onRemoveExercise: () => live.current.handleRemoveEntry(entryId),
      onToggleEditing: () => setEditingEntryId((current) => (current === entryId ? null : entryId)),
      onEditExercise: () => {
        const entry = entryNow();
        if (entry) live.current.onEditExercise?.(entry.exercise.id);
      },
    };
    cardHandlers.set(entryId, handlers);
    return handlers;
  };

  /** ▶ Start — the workout is happening as of now. */
  const handleStart = useCallback(() => {
    commit();
    startWorkout();
  }, [startWorkout]);

  /**
   * Leave without saving. Confirms only when there is something to lose: a
   * workout nobody logged a set in has nothing to throw away, and asking about it
   * is a dialog that only ever has one answer.
   */
  const handleStopAndExit = useCallback(() => {
    if (progress.done > 0) {
      setConfirming('discard');
      return;
    }
    undo();
    discardSession();
    onExit();
  }, [discardSession, onExit, progress.done]);

  const handleFinish = useCallback(() => {
    if (!session) return;
    /*
     * The sheet appears for any of three reasons.
     *
     *  1. UNLOGGED SETS are an intention, not history. Say so, then let them go.
     *  2. A LADDER MOVED. Nothing is being asked — the rep is earned either way —
     *     but the number that just changed is the reason the user turned the
     *     ladder on, and a new max that only shows up next Tuesday when the card
     *     is opened is a progression the app forgot to mention. One tap, on the
     *     button the thumb is already going for.
     *
     *  3. A RECORD FELL (W6). The same argument as the ladder: the number is the
     *     news, and it is only news today. Still one tap to save.
     *
     * Neither is a nag: with nothing unlogged, no ladder and no record in the
     * session, Finish still finishes in one tap, exactly as it always did.
     */
    if (progress.total - progress.done > 0 || ladderChange || findRecords(session).length > 0) {
      setConfirming('finish');
      return;
    }
    void commitFinish();
  }, [commitFinish, findRecords, ladderChange, progress.done, progress.total, session]);

  /* --- empty states --------------------------------------------------- */
  /*
   * Both of these used to be a bare centred line with no way off the screen —
   * which on Android meant hardware-back or nothing. They get a button now,
   * because a screen you cannot leave is indistinguishable from a hang.
   */
  if (!session) {
    return (
      <View className="flex-1 items-center justify-center bg-bg px-xl">
        <Text className="text-body text-ink-muted">{t('No workout in progress')}</Text>
        <View className="mt-xl w-full">
          <PrimaryButton label={t('Back')} variant="ghost" onPress={onExit} />
        </View>
      </View>
    );
  }

  /*
   * A session with nothing in it. Reachable two ways: a routine whose exercises
   * were all deleted after it was started, and a session the user emptied out from
   * here one `Remove exercise` at a time. The second is why this screen offers the
   * picker rather than only a way out — the fix for "I removed them all" is adding
   * one back, not abandoning the workout.
   */
  if (session.entries.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-bg px-xl">
        <Text className="text-title font-medium text-ink">{t('Nothing to log')}</Text>
        <Text className="mt-sm text-center text-body text-ink-muted">
          {t('This workout has no exercises in it right now.')}
        </Text>
        <View className="mt-xl w-full">
          {onAddExercise ? (
            <View className="mb-sm">
              <PrimaryButton label={t('Add an exercise')} onPress={onAddExercise} />
            </View>
          ) : null}
          <PrimaryButton label={t('Back')} variant="ghost" onPress={onExit} />
        </View>
      </View>
    );
  }

  const finishRemoval = () => {
    if (!removing) return;
    const { entry, index } = removing;
    setRemoving(null);
    if (editingEntryId === entry.localId) setEditingEntryId(null);
    removeEntry(entry.localId);
    setToast({
      text: t('Removed {name}', { name: entry.exercise.name }),
      key: Date.now(),
      action: {
        label: t('Undo'),
        onPress: () => {
          tap();
          insertEntry(entry, index);
          setCollapsedId(null);
          setToast(null);
        },
      },
    });
  };

  const dimmed = confirming != null;
  const allLogged = progress.total > 0 && progress.done === progress.total;

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />
      <Lamps section="Session" />

      {/* The list dims behind a sheet rather than being replaced — the user is
          confirming something about THIS list, and should still see it. */}
      <View className="flex-1" style={dimmed ? { opacity: 0.28 } : undefined}>
        <SessionHeader
          title={session.title}
          done={progress.done}
          total={progress.total}
          startedAt={session.startedAt}
          workoutNumber={workoutNumber ?? null}
          onBack={lifted ? undefined : onExit}
          // `Stop and exit` and `Restart clock` live behind the ⋮ (U16).
          onMenu={() => {
            tap();
            setConfirming('menu');
          }}
          /*
           * NO COMMIT ACTION IN THIS BAR — placement rule 1. `Finish` and `Start`
           * are the floating pair at the foot of the screen, where the thumb that
           * spends the session pressing ✓ already is. `Drop` stays up here because
           * it is not a commit: it is the escape from a transient mode the header
           * is already announcing, and it has to sit with the sentence that
           * explains it.
           */
          moving={
            lifted
              ? {
                  kicker: `${t('Moving')} · ${liftedName}`,
                  subtitle: t('Slide to move it · position {position} of {total}', {
                    position: reorder.targetIndex + 1,
                    total: entryIds.length,
                  }),
                  onDrop: drop,
                  dropLabel: t('Drop'),
                }
              : undefined
          }
        />

        {/*
          One pill, two instruments, directly under the header: a rest countdown
          and the clock on a plank. A set timer outranks rest — you cannot be
          holding and resting, and `startSetTimer` clears rest for that reason.
          Each renders null when it isn't running, so this is either one pill or
          nothing at all.
        */}
        {focusOpen ? null : setTimer ? <SetTimerPill /> : <RestTimerPill />}

        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{
            paddingTop: 8,
            // The floating pair is 64 tall at `PAIR_BOTTOM`; this is what keeps
            // the last card clear of it.
            paddingBottom: insets.bottom + PAIR_BOTTOM + 96,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          scrollEnabled={!dimmed && !lifted}
        >
          {/* The drag surface. Claims a touch only while something is lifted. */}
          <View
            {...panHandlers}
            onLayout={(e) => {
              listTop.current = e.nativeEvent.layout.y;
            }}
          >
            {session.entries.map((entry, index) => {
              const isLifted = entry.localId === lifted;
              const handlers = handlersFor(entry.localId);
              return (
                <ReorderRow
                  key={entry.localId}
                  lifted={isLifted}
                  dragging={lifted != null}
                  dragY={dragY}
                  // The cards either side open the gap while the finger is still
                  // over it, so which two exercises you are landing between is
                  // something you can see rather than something you find out on
                  // release.
                  shift={shiftFor(entry.localId)}
                  onLayout={(e) => {
                    const { y, height } = e.nativeEvent.layout;
                    cardLayouts.current[entry.localId] = { y, height };
                    // The real offset, one frame after the effect wanted it.
                    const pending = pendingScroll.current;
                    if (pending?.id === entry.localId && Date.now() < pending.until) {
                      scrollToCard(entry.localId);
                    }
                  }}
                >
                  <GrowIn
                    appear={false}
                    leaving={removing?.entry.localId === entry.localId}
                    onLeft={finishRemoval}
                  >
                    <ExerciseCard
                      entry={entry}
                      isExpanded={entry.localId === expandedEntryId}
                      /* The glow, and only for the one card that holds it: the set
                       after the one last logged, which is not the same question as
                       "is it open" or "is it the cursor". See the file header. */
                      upNextSetId={upNext?.entryId === entry.localId ? upNext.setId : null}
                      /* And the door into focus mode, on that same card only —
                       focus mode always shows the work, so the row that opens it
                       belongs where the work is. */
                      onOpenFocus={upNext?.entryId === entry.localId ? openFocus : undefined}
                      focusModeOpen={focusOpen}
                      unitSystem={unitSystem}
                      /* The bracket down a superset's left edge. Computed here
                       because only the screen can see the cards either side. */
                      superset={supersetPosition(session.entries, index)}
                      availablePlatesKg={availablePlatesKg}
                      timingSetId={setTimer?.entryId === entry.localId ? setTimer.setId : null}
                      isLifted={isLifted}
                      dimmed={lifted != null && !isLifted}
                      restSeconds={resolveRest(entry.exercise, restSeconds).seconds}
                      onStartRest={entry.localId === activeEntryId ? startRestNow : undefined}
                      onRemoveExercise={handlers.onRemoveExercise}
                      /* SESSION EDIT MODE — one card at a time, ended only by
                       `Done`. See `ExerciseCard`. */
                      isEditing={editingEntryId === entry.localId}
                      onToggleEditing={handlers.onToggleEditing}
                      /* Only on the open card, like `Rest` and `Focus`: it is a
                       control you press about the exercise you are doing. */
                      onEditExercise={onEditExercise ? handlers.onEditExercise : undefined}
                      onToggleExpanded={handlers.onToggleExpanded}
                      // One exercise cannot be reordered, and the gesture would only
                      // ever end where it started.
                      onLift={entryIds.length > 1 ? handlers.onLift : undefined}
                      onPressTimer={handlers.onPressTimer}
                      onToggleSet={handlers.onToggleSet}
                      onPatchSet={handlers.onPatchSet}
                      /*
                      WARM-UP. Decided here rather than in the card because it
                      needs the gym's plates and `lib/warmup.ts` — the card renders
                      the offer and nothing else. Both props go undefined together
                      when there is nothing to add, so the row disappears rather
                      than becoming a control that does nothing.
                    */
                      bestLine={bestLines[entry.localId] ?? null}
                      deloadMessage={deloadMessages[entry.localId] ?? null}
                      warmupSummary={warmupPlans[entry.localId]?.summary ?? null}
                      onAddWarmup={warmupPlans[entry.localId] ? handlers.onAddWarmup : undefined}
                      onAddSet={handlers.onAddSet}
                      onRemoveSet={handlers.onRemoveSet}
                      onAcceptOverload={handlers.onAcceptOverload}
                      onDismissOverload={handlers.onDismissOverload}
                    />
                  </GrowIn>
                </ReorderRow>
              );
            })}

            {/* Anything at all, appended to the workout in flight. Last in the
                list because that is where it lands — and DASHED, a slot rather
                than a card, left-aligned under the cards (Momentum v3). */}
            {onAddExercise && !lifted ? (
              <Pressable
                onPress={() => {
                  tap();
                  onAddExercise();
                }}
                accessibilityRole="button"
                accessibilityLabel={t('Add an exercise to this workout')}
                style={({ pressed }) => ({
                  alignSelf: 'flex-start',
                  height: 44,
                  paddingHorizontal: 16,
                  borderRadius: 9999,
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: 'rgba(236,241,238,0.14)',
                  backgroundColor: pressed ? 'rgba(236,241,238,0.05)' : 'transparent',
                })}
                className="mx-lg mt-xs"
              >
                <Text style={{ fontSize: 15, color: '#AEB9B3' }} className="font-medium">
                  {`+ ${t('Add an exercise')}`}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </View>

      {/*
        THE FLOATING PAIR — placement rule 4, and the one place in the app where
        two actions share the slot.

        `Focus` is filled at 64 and `Finish` is ghost at 52, with 10 between
        them. Different weight AND different geometry, deliberately: a thumb that
        has pressed `Focus` sixty times this session must not be able to end the
        workout by muscle memory. Finishing is the one commit in this app that is
        not one tap to undo.

        Before the workout is started there is nothing to finish and nothing to
        focus on, so the pair is one button and it is the one thing to do.
      */}
      {dimmed || lifted || focusOpen ? null : isStarted && allLogged ? (
        /* Every set logged: nothing left to focus on, so the pair becomes the one
           thing left to do, and it pops in. */
        <FloatingPair
          bottom={PAIR_BOTTOM}
          primary={{ label: t('Finish workout'), icon: 'check', onPress: handleFinish }}
        />
      ) : isStarted ? (
        <FloatingPair
          bottom={PAIR_BOTTOM}
          secondary={{ label: t('Finish'), onPress: handleFinish }}
          primary={{
            label: t('Focus'),
            symbol: 'center_focus_strong',
            onPress: () => setFocusOpen(true),
          }}
        />
      ) : (
        <FloatingPair
          bottom={PAIR_BOTTOM}
          secondary={{ label: t('Stop and exit'), onPress: handleStopAndExit }}
          primary={{ label: t('Start workout'), icon: 'play', onPress: handleStart }}
        />
      )}

      {/* FOCUS MODE. After the list so it covers it, before the sheets so
          `FinishSheet` and `ConfirmSheet` still paint on top — pressing
          `Finish workout` in the sheet opens the same sheet everything else
          opens, over the top of it. */}
      {focusOpen ? (
        <FocusMode
          unitSystem={unitSystem}
          elapsedMinutes={isStarted ? elapsedMinutes : null}
          onClose={() => setFocusOpen(false)}
          onFinish={() => setConfirming('finish')}
        />
      ) : null}

      {confirming === 'finish' ? (
        <FinishSheet
          workoutNumber={workoutNumber ?? null}
          minutes={isStarted ? elapsedMinutes : null}
          volumeKg={sessionVolume(session, bodyweightKg ?? null).kg}
          unloggedCount={progress.total - progress.done}
          loggedCount={progress.done}
          planChange={describePlannedSetDiff(planChanges, lang)}
          ladderChange={ladderChange}
          records={finishRecords}
          effort={session.effort}
          onSetEffort={(effort) => {
            tap();
            setSessionEffort(effort);
          }}
          onConfirm={() => void commitFinish()}
          onConfirmAndUpdatePlan={() => void commitFinish(true)}
          onDismiss={() => setConfirming(null)}
        />
      ) : null}

      {/* THE ⋮ (U16). Restart only once there is a clock to restart. Neither
          row acts on its own: Restart goes on to its confirm as the chip did,
          and Stop goes through `handleStopAndExit`, which asks first in the
          danger sheet when sets would be thrown away. */}
      {confirming === 'menu' ? (
        <Sheet title={t('Session options')} onDismiss={() => setConfirming(null)}>
          <View className="overflow-hidden rounded-surface bg-surface-alt">
            {isStarted ? (
              <>
                <MenuRow
                  label={t('Restart clock')}
                  detail={t('Counts from now. Logged sets stay.')}
                  onPress={() => {
                    tap();
                    setConfirming('clock');
                  }}
                />
                <Separator inset={16} />
              </>
            ) : null}
            <MenuRow
              label={t('Stop and exit…')}
              detail={t('Leaves without saving.')}
              quiet
              onPress={() => {
                setConfirming(null);
                handleStopAndExit();
              }}
            />
          </View>
          <TextButton label={t('Cancel')} onPress={() => setConfirming(null)} />
        </Sheet>
      ) : null}

      {confirming === 'clock' ? (
        // Danger: the time already on the clock is overwritten, not kept.
        <ConfirmSheet
          tone="danger"
          title={t('Restart the clock?')}
          body={t(
            'This workout reads {minutes} min. Restarting the clock makes it 0, and history will record it from this moment — the sets you already logged stay exactly as they are.',
            { minutes: elapsedMinutes },
          )}
          confirmLabel={t('Restart it')}
          cancelLabel={t('Keep {minutes} min', { minutes: elapsedMinutes })}
          onConfirm={() => {
            commit();
            startWorkout();
            setConfirming(null);
          }}
          onCancel={() => setConfirming(null)}
        />
      ) : null}

      {/* Last child, over the floating pair's band rather than on it: this one
          can carry an Undo, so it takes touches for that and nothing else. */}
      {toast ? (
        <Toast
          key={toast.key}
          label={toast.text}
          action={toast.action}
          bottom={SESSION_TOAST_BOTTOM}
        />
      ) : null}

      {confirming === 'discard' ? (
        <ConfirmSheet
          tone="danger"
          title={t('Stop and exit without saving?')}
          body={t(
            '{count} sets logged in this workout will be thrown away, and nothing will reach your history. Use Finish instead if you want to keep them.',
            { count: progress.done },
          )}
          confirmLabel={t('Throw it away')}
          cancelLabel={t('Keep logging')}
          onConfirm={() => {
            undo();
            discardSession();
            setConfirming(null);
            onExit();
          }}
          onCancel={() => setConfirming(null)}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */

/**
 * One row of the session's ⋮ menu: a label and what it will do, 64 tall —
 * past the 48 a mid-workout target needs. `quiet` is the leave-without-saving
 * row, muted rather than coral: the colour belongs to the confirm that follows,
 * not to the door to it (U19's one rule for destructive actions).
 */
function MenuRow({
  label,
  detail,
  quiet = false,
  onPress,
}: {
  label: string;
  detail: string;
  quiet?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${detail}`}
      style={pressedStyle}
      className="h-row-lg justify-center px-lg"
    >
      <Text className={`text-body ${quiet ? 'text-ink-muted' : 'text-ink'}`}>{label}</Text>
      <Text numberOfLines={1} className="mt-[2px] text-label text-ink-faint">
        {detail}
      </Text>
    </Pressable>
  );
}

/**
 * Session clock in whole minutes.
 * Ticks every 15 s rather than every second: the header shows minutes, so a
 * 1 Hz interval would re-render the screen 900 times an hour to change nothing.
 */
function useElapsedMinutes(startedAt: string | null): number {
  const startMs = useMemo(() => (startedAt ? new Date(startedAt).getTime() : null), [startedAt]);
  const [minutes, setMinutes] = useState(() =>
    startMs ? Math.floor((Date.now() - startMs) / 60_000) : 0,
  );

  useEffect(() => {
    if (!startMs) return undefined;
    const tick = () => setMinutes(Math.floor((Date.now() - startMs) / 60_000));
    tick();
    const interval = setInterval(tick, 15_000);
    return () => clearInterval(interval);
  }, [startMs]);

  return minutes;
}
