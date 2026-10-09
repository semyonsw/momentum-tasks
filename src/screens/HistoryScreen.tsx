/**
 * HistoryScreen — every workout you have actually finished.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ HISTORY                                      │
 *   │ 12 workouts · 214 sets · 41 200 kg           │
 *   │ SETS PER CLUSTER          [4w][12w][ All ]   │
 *   │ pull    42  ██████████████████████           │
 *   │ push    31  ████████████████                 │
 *   │ core    18  █████████                        │
 *   │ legs     8  ████                             │
 *   │ cardio   0                                   │
 *   │ AUGUST                                       │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ #92  Pull + swimming     17 Aug · 74 min │ │
 *   │ │      6 exercises · 18 sets · 4 720 kg  ⌄ │ │
 *   │ │  Weighted 90° pull-ups   +40 kg · 4 4 4  │ │  ← open
 *   │ │                             12 REPS TOTAL │ │
 *   │ │    1   40 kg    4 reps               ⌄   │ │
 *   │ │        −2  −0.5   40 KG   +0.5  +2       │ │  ← one row, correcting
 *   │ │        Reps    Remove set        Done    │ │
 *   │ │  + Add a set          Remove exercise    │ │
 *   │ │  Plank                   2:00 · 2:00     │ │
 *   │ │                                4:00 TOTAL │ │
 *   │ │  + Add an exercise                       │ │
 *   │ │  Edit name, date and length              │ │
 *   │ │  ╭ Pull + swimming                     ╮ │ │
 *   │ │  │ Date       17 Aug 2026   ( − )( + ) │ │ │
 *   │ │  │ Started    17:00         ( − )( + ) │ │ │
 *   │ │  ╰ Took       74 min        ( − )( + ) ╯ │ │
 *   │ │  Workout number: 92                      │ │
 *   │ │                                          │ │  ← 24 dp
 *   │ │  ────────────────────────────────────    │ │
 *   │ │  Delete this workout                     │ │
 *   │ └──────────────────────────────────────────┘ │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ #91  Push                 15 Aug · 51 min│ │
 *   │ └──────────────────────────────────────────┘ │
 *   └──────────────────────────────────────────────┘
 *
 * Design decisions worth keeping:
 *
 *  • A ROW OPENS IN PLACE. Tapping a workout expands it rather than pushing a
 *    detail screen. What you want from history is almost always one line — "what
 *    did I do last Tuesday" — and a route you have to come back from turns a
 *    glance into navigation. The exercise lines use the SAME shorthand as the
 *    exercise cards and the exercise-history screen, so a session reads the same
 *    everywhere it appears.
 *  • GROUPED BY MONTH, NOT PAGINATED. A training log is read backwards from today
 *    and the interesting unit is "this month". The month kicker is what carries the
 *    year, and only when it isn't the current one — a log full of "2026" is noise.
 *  • A TYPO IS NOT A WORKOUT. Tapping an exercise line inside an open workout
 *    lists its logged sets, and one of them at a time can be corrected with the
 *    same ± chips the session uses. 40 kg typed where 4 was meant used to cost the
 *    whole session — delete the workout and re-enter it was the only route, and it
 *    also took those sets out of what the prefills and the suggestions read.
 *  • AND NEITHER IS A MIS-TAP. The same argument applied to everything a session
 *    gets wrong that is NOT one number: a set removed by accident, an exercise
 *    dropped by `Remove exercise` on the wrong card, a workout finished an hour
 *    after it ended because the phone was in a bag, a session dated to the wrong
 *    day because it ran past midnight. So an open workout can also gain a set,
 *    gain or lose an exercise, be renamed, be moved in time and be told how long
 *    it took — every one of them through `lib/workoutEdit.ts`, and every one of
 *    them regenerating the record rather than patching it.
 *
 *    THE STRUCTURAL EDITS ARE WHERE THEIR SUBJECT IS. `+ Add a set` and `Remove
 *    exercise` appear under the exercise whose rows are open, because that is the
 *    exercise the user is looking at and the only one for which "one more" is
 *    unambiguous. The workout-level ones — name, date, length — are behind one
 *    row, shut by default: history is read far more often than it is corrected,
 *    and five controls between the reader and the sets would tax the common case
 *    to serve the rare one.
 *
 *    Every number around the corrected row is REGENERATED, never patched: the
 *    store hands the new row list to `recomputeWorkout`, which reruns
 *    `summarizeSessionSets` and the volume maths that built the record in the first
 *    place. So the shorthand, the set count, the exercise total and the volume
 *    cannot drift from the rows they claim to describe.
 *
 *    ONE ROW AT A TIME, AND VISIBLY. The set being corrected is the only one with
 *    an editor under it, and it stays on screen while it changes — this is the one
 *    place in the app where a number the user is looking at is already history, so
 *    it has to be obvious which row is being touched.
 *  • DELETE IS INSIDE THE OPEN ROW, AND IT ASKS. History is the one thing in this
 *    app that must be true, so removing a piece of it is never a swipe away: you
 *    open the workout, read what it was, and then confirm.
 *  • EVERY EXERCISE STATES ITS TOTAL. Under the per-set line — "+40 kg · 4 4 4"
 *    — sits the sum of those counts: 12 reps, or 4:00 of plank. It is the number
 *    you actually compare between sessions, and reading a row of per-set counts is
 *    the one piece of mental arithmetic this screen used to make you do. Only when
 *    there was more than one set, because the total of one set is the set.
 *  • AND NO SUMMARY MAY TAKE THE NAME'S HALF OF THE ROW. Seven held sets of
 *    fifteen seconds is a legal shorthand and it is wider than the row, so the
 *    name beside it collapsed to nothing — an exercise line with no exercise on
 *    it. The summary is clamped to five values before it is rendered
 *    (`lib/summaryClamp.ts`) with green dots after it, and opening the exercise —
 *    the tap that lists every set one per line anyway — is what shows the whole
 *    thing. The dots are inside the row's own Pressable: what they open is what
 *    the row opens.
 *  • EVERY WORKOUT IS NUMBERED, AND THE NUMBERING IS YOURS. `Workout 92` is an
 *    ordinal, not an id: one workout is pinned to a number you type and every other
 *    one counts from it, forwards and backwards. That is what makes a log that
 *    starts at session 91 — because ninety of them happened before this app
 *    existed — say so. See `workoutNumbers`.
 *  • THE TOTALS LINE IS A FACT, NOT A GOAL. No streaks, no badges, no weekly
 *    target. Three numbers that say how much training is in here.
 *  • SETS PER CLUSTER IS A COUNT, NOT A SCORE. `lib/muscles.ts` files every
 *    exercise under exactly one cluster and every set row carries its
 *    `exerciseId`; nothing had ever joined the two across history, so the one
 *    thing a lifter could not see was the one thing the data answers for free.
 *    It states counts and stops: no target, no ratio to hit, no cluster
 *    coloured as neglected, no "you should train legs". A cluster with zero sets
 *    shows zero, and that IS the feature — "legs 0" over twelve weeks is a fact,
 *    and what to do about it belongs to the person who did the training.
 *    The bar is the theme gradient, scaled to the largest cluster, and it is a
 *    comparison between the user's own numbers rather than against a goal.
 *  • AND WHEN A NUMBER CANNOT BE STOOD BEHIND, IT IS NOT SHOWN. Session volume
 *    needs a bodyweight to weigh a push-up or a −20 kg assisted pull-up, and the
 *    app is only told one if the user types it in `Settings → Body`. A workout
 *    logged without it carries `volumeIsPartial`, and both the header total and
 *    the row's own line drop their volume clause rather than print a figure that
 *    silently omits half the session. A missing clause is a gap somebody can ask
 *    about; a wrong total is one nobody can spot.
 */

import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable } from '../components/Pressable';

import { ConfirmSheet } from '../components/ConfirmSheet';
import { GlassSurface, Toast, type ToastAction } from '../components/glass';
import { FADE_ON, RunningText } from '../components/RunningText';
import { Icon } from '../components/Icon';
import { pressedStyle, Reveal } from '../components/motion';
import { NumberSheet } from '../components/NumberSheet';
import { ScreenHeader } from '../components/ScreenHeader';
import { SettingsFootRow } from '../components/SettingsFootRow';
import { WrappedHistoryFoot } from '../components/WrappedEntry';
import type { WrappedPeriod } from '../lib/wrapped';
import {
  DangerFootAction,
  FieldWell,
  Kicker,
  Separator,
  StepperRow,
} from '../components/primitives';
import {
  BALANCE_WINDOWS,
  balanceWindowDays,
  clusterBalance,
  describeClusterTotals,
  type BalanceWindow,
  type ClusterCount,
} from '../lib/balance';
import { tap, undo } from '../lib/feedback';
import { monthKey, type CompletedExercise, type CompletedWorkout } from '../lib/completedWorkout';
import { clusterLabel } from '../lib/muscles';
import { clampSummary } from '../lib/summaryClamp';
import {
  countStep,
  countUnitLabel,
  formatCount,
  formatDuration,
  formatShortDate,
  formatVolumeKg,
  formatWeight,
  kgToLb,
  lbToKg,
  unitLabel,
  weightSteps,
} from '../lib/units';
import { historyTotals, type SetCorrection } from '../state/workoutHistoryStore';
import { SetMarksSheet } from '../components/SetMarksSheet';
import { describeRir, effortApplies, rirChipLabel } from '../lib/effort';
import { kindBadge, kindName, setKindOf } from '../lib/setType';
import { workingSetLabels } from '../lib/draft';
import { useLanguage, usePlural, useT, type Translate } from '../hooks/useT';
import { term, type Language } from '../lib/i18n';
import { formatMonth } from '../lib/days';
import { HISTORY_PAGE, monthsToRender, nearEnd, rowsIn } from '../lib/historyWindow';
import { curve, gradientBar, palette, radius, tint } from '../theme/tokens';
import { useSettings } from '../state/settingsStore';
import {
  DURATION_LIMITS,
  formatEndTime,
  formatTimeOfDay,
  formatTimeSpan,
} from '../lib/workoutEdit';
import type { Exercise, ID, SessionEffort, SetHistory, UnitSystem } from '../types/models';

/**
 * How a session's effort reads on a history row.
 *
 * Lower case, because it is a clause in a sentence of facts and not a label:
 * `6 exercises · 18 sets · 4 720 kg · brutal`.
 */
/** One day, in the minutes the retime stepper counts in. */
const MINUTES_PER_DAY = 1440;

/**
 * The step on the `Started` row, in minutes.
 *
 * Fifteen, not one: nobody corrects the start of a finished workout to the minute,
 * and the reason to touch this row at all is a phone that was in a bag for half an
 * hour. Four taps an hour is the right coarseness for that.
 */
const TIME_STEP_MINUTES = 15;

/** The second line of a session card — a step below muted. See HomeScreen. */
const DETAIL_INK = palette.inkFaint;

/*
 * The motion curves the design gives this screen: the range thumb and the
 * chevron land with a slight overshoot, the bars with a smaller one.
 */
const THUMB_EASE = [0.34, 1.3, 0.64, 1] as const;
const CHEVRON_EASE = THUMB_EASE;
const BAR_RESIZE_EASE = [0.34, 1.2, 0.64, 1] as const;
const BAR_GROW_EASE = [0.2, 0.8, 0.2, 1] as const;
/** One segment of the `4w / 12w / All` switch, and the thumb that slides under it. */
const RANGE_SEGMENT = 46;

/*
 * A function rather than a constant, because the words are translated: a
 * module-level record would be frozen in whichever language the app started in.
 */
function effortWords(t: Translate): Record<SessionEffort, string> {
  return {
    easy: t('easy'),
    right: t('right'),
    hard: t('brutal'),
  };
}

export interface HistoryScreenProps {
  workouts: CompletedWorkout[];
  /**
   * The log could not be READ off disk — see `workoutHistoryStore.loadFailed`.
   *
   * Changes the empty state and nothing else, which is the whole reason it is a
   * prop: "you have not finished a workout yet" and "your workouts are on disk and
   * I could not open them" are different facts, and one screen printing the first
   * over the second is what makes an app look like it lost a year of training.
   */
  loadFailed?: boolean;
  /** Every workout's ordinal, keyed by id — see `workoutNumbers`. */
  numbers: Record<ID, number>;
  /** The library, for the muscles behind the cluster counts. */
  exercisesById: Record<ID, Exercise>;
  /**
   * A workout to open and scroll to, from a tap somewhere else in the app.
   *
   * Home's `RECENT` rows and the exercise-history session rows both hand over a
   * workout id, and both used to have it thrown away — you landed at the top of
   * this screen and hunted for the row you had just tapped. An id that no longer
   * resolves opens nothing and is not an error: the workout may have been deleted
   * between the tap and the render.
   */
  focusWorkoutId?: ID | null;
  /** Called once the id above has been acted on, so it fires once and not again. */
  onFocusHandled?: () => void;
  unitSystem: UnitSystem;
  onDelete: (id: ID) => void;
  /**
   * Correct one logged set. The store recomputes every derived number from the
   * rows — see `recomputeWorkout` — so this screen never patches a summary string.
   */
  onEditSet: (workoutId: ID, setId: ID, patch: SetCorrection) => void;
  /** Remove one logged set. False when it was refused — the last row of a workout. */
  onDeleteSet: (workoutId: ID, setId: ID) => boolean;
  /**
   * Change what a finished workout IS: its name, when it happened, how long it took.
   *
   * `shiftMinutes` nudges the start and drags every set's date with it — see
   * `lib/workoutEdit.ts` on why those cannot move independently.
   */
  onEditWorkout: (
    workoutId: ID,
    patch: { title?: string; shiftMinutes?: number; durationMinutes?: number },
  ) => void;
  /** One more row on an exercise the workout already has. */
  onAddSet: (workoutId: ID, exerciseId: ID) => void;
  /** Take an exercise out, rows and all. False when it was the last one. */
  onRemoveExercise: (workoutId: ID, exerciseId: ID) => boolean;
  /**
   * Put a workout back as it was before a removal — the toast's Undo. Absent =
   * removals still happen, with no Undo offered.
   */
  onRestoreWorkout?: (snapshot: CompletedWorkout) => void;
  /**
   * Open the library picker to put an exercise INTO a finished workout.
   *
   * Optional because it is the one edit on this screen that needs navigation, and a
   * caller with nowhere to push should render no row rather than a dead one.
   */
  onAddExercise?: (workoutId: ID) => void;
  /** Pin this workout's number; everything else renumbers from it. */
  onSetNumber: (id: ID, number: number) => void;
  /** The `Log | Graphs` switch, rendered under the header by whoever owns it. */
  toolbar?: ReactNode;
  /** `‹` — this screen is pushed by the ⟲ on the workout section now. */
  onBack?: () => void;
  /** `Settings ›` at the foot: the workout settings (U24). */
  onOpenSettings?: () => void;
  /** X1: open a Wrapped. Absent = no Wrapped row at the foot. */
  onOpenWrapped?: (period: WrappedPeriod) => void;
  /** W3: the muscle map, from the foot of the sets-per-cluster card. */
  onOpenMuscles?: () => void;
}

export function HistoryScreen({
  workouts,
  loadFailed,
  exercisesById,
  focusWorkoutId,
  onFocusHandled,
  unitSystem,
  onDelete,
  onEditSet,
  onDeleteSet,
  onEditWorkout,
  onAddSet,
  onRemoveExercise,
  onRestoreWorkout,
  onAddExercise,
  numbers,
  onSetNumber,
  toolbar,
  onBack,
  onOpenSettings,
  onOpenWrapped,
  onOpenMuscles,
}: HistoryScreenProps) {
  const t = useT();
  const lang = useLanguage();
  const counted = usePlural();
  /** The open workout, the one being deleted, the one being renumbered. */
  const [openId, setOpenId] = useState<ID | null>(null);
  const [deleting, setDeleting] = useState<CompletedWorkout | null>(null);
  const [numbering, setNumbering] = useState<CompletedWorkout | null>(null);
  /** The logged set whose annotations sheet is open. */
  const [marking, setMarking] = useState<{ workoutId: ID; setId: ID; title: string } | null>(null);
  const markingRow = marking
    ? workouts.find((w) => w.id === marking.workoutId)?.sets.find((r) => r.id === marking.setId)
    : undefined;
  const scrollRef = useRef<ScrollView>(null);
  /**
   * Where each workout row sits in the SCROLL CONTENT, captured on layout.
   *
   * `onLayout` reports a y relative to the immediate parent, so a row's position
   * in the scroll is the sum of three: the month group's offset in the content,
   * the card's offset inside that group (a Kicker sits above it), and the row's
   * offset inside the card. Each level records its own, which is why there are
   * three refs instead of one — and why none of them guesses a Kicker's height.
   *
   * Refs rather than state: written during layout, read by an effect. In state,
   * every row measuring itself would re-render the list.
   */
  const monthOffsets = useRef<Record<string, number>>({});
  const cardOffsets = useRef<Record<string, number>>({});
  const rowOffsets = useRef<Record<ID, { monthKey: string; y: number }>>({});
  /**
   * The balance window. Four weeks by default: long enough that one missed
   * session does not swing it, short enough that it is about now.
   */
  const [window, setWindow] = useState<BalanceWindow>('4w');

  /*
   * The user's own weekly set targets, if they have set any. Read here rather than
   * passed in for the same reason the bodyweight log is on the Progress screen: it
   * is a setting, and threading it through `AppShell` would make the shell
   * responsible for a number it has no opinion about.
   */
  const weeklyTargets = useSettings((s) => s.weeklySetTargets);

  const totals = useMemo(() => historyTotals(workouts), [workouts]);
  const months = useMemo(() => groupByMonth(workouts, lang), [lang, workouts]);
  const balance = useMemo(
    () => clusterBalance({ workouts, exercisesById, windowDays: balanceWindowDays(window) }),
    [workouts, exercisesById, window],
  );
  /* Either sheet takes the screen; the list behind it dims and stops scrolling. */
  const dimmed = deleting != null || numbering != null;

  /*
   * HOW MUCH OF THE LOG IS MOUNTED — `lib/historyWindow.ts`. A page of workouts
   * first, the next as the reader nears the bottom, and always as far back as
   * the workout somebody asked to open.
   */
  const [rowBudget, setRowBudget] = useState(HISTORY_PAGE);
  const monthSizes = useMemo(() => months.map((month) => month.workouts.length), [months]);
  const focusMonth = focusWorkoutId
    ? months.findIndex((month) => month.workouts.some((w) => w.id === focusWorkoutId))
    : -1;
  const shownMonths = monthsToRender(monthSizes, rowBudget, focusMonth);
  const shown = months.slice(0, shownMonths);
  const hasMore = shownMonths < months.length;

  /*
   * ONE STABLE SET OF HANDLERS for every row, reading the latest props through a
   * ref. Each row used to get five fresh closures per render, so opening one
   * workout re-rendered every card in the log; with these the memoised rows
   * redraw only when their own workout, number or open state changes.
   */
  const latest = useRef({
    t,
    workouts,
    onEditSet,
    onDeleteSet,
    onEditWorkout,
    onAddSet,
    onRemoveExercise,
    onRestoreWorkout,
    onAddExercise,
  });
  latest.current = {
    t,
    workouts,
    onEditSet,
    onDeleteSet,
    onEditWorkout,
    onAddSet,
    onRemoveExercise,
    onRestoreWorkout,
    onAddExercise,
  };

  /*
   * REMOVING FROM THE RECORD OFFERS AN UNDO, the session's rule. A set's ✕ and
   * `Remove exercise` are one tap each, and the "way back" they had was `+ Add a
   * set` — a default row, not the 82.5 × 6 that was there. The workout is
   * snapshotted before the edit and the toast's Undo writes the snapshot back.
   */
  const [toast, setToast] = useState<{ text: string; key: number; action: ToastAction } | null>(
    null,
  );
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), UNDO_TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);
  const withUndo = (workoutId: ID, text: string, remove: () => boolean): boolean => {
    const snapshot = latest.current.workouts.find((w) => w.id === workoutId);
    const removed = remove();
    const restore = latest.current.onRestoreWorkout;
    if (removed && snapshot && restore) {
      setToast({
        text,
        key: Date.now(),
        action: {
          label: t('Undo'),
          onPress: () => {
            tap();
            restore(snapshot);
            setToast(null);
          },
        },
      });
    }
    return removed;
  };
  const undoable = useRef(withUndo);
  undoable.current = withUndo;

  const actions = useMemo<RowActions>(
    () => ({
      editSet: (workoutId, setId, patch) => latest.current.onEditSet(workoutId, setId, patch),
      deleteSet: (workoutId, setId) =>
        undoable.current(workoutId, latest.current.t('Removed a set'), () =>
          latest.current.onDeleteSet(workoutId, setId),
        ),
      editWorkout: (workoutId, patch) => latest.current.onEditWorkout(workoutId, patch),
      addSet: (workoutId, exerciseId) => latest.current.onAddSet(workoutId, exerciseId),
      removeExercise: (workoutId, exerciseId) => {
        const name =
          latest.current.workouts
            .find((w) => w.id === workoutId)
            ?.exercises.find((e) => e.exerciseId === exerciseId)?.name ?? '';
        return undoable.current(workoutId, latest.current.t('Removed {name}', { name }), () =>
          latest.current.onRemoveExercise(workoutId, exerciseId),
        );
      },
      addExercise: (workoutId) => latest.current.onAddExercise?.(workoutId),
      toggle: (workoutId) => {
        tap();
        setOpenId((current) => (current === workoutId ? null : workoutId));
      },
      askDelete: (workout) => {
        undo();
        setDeleting(workout);
      },
      askNumber: (workout) => {
        tap();
        setNumbering(workout);
      },
      askMarks: (workoutId, setId, title) => setMarking({ workoutId, setId, title }),
    }),
    [],
  );

  /*
   * OPEN THE WORKOUT SOMEBODY TAPPED, and scroll it into view.
   *
   * Two steps rather than one, because the row cannot be scrolled to until it has
   * been measured and it is only measured once it is rendered. So the effect opens
   * it immediately and asks for the scroll on the next frame, by which time the
   * expanded row's `onLayout` has run and `rowOffsets` knows where it is.
   *
   * `onFocusHandled` IS CALLED FROM INSIDE THE FRAME, and that is not a detail.
   * Calling it beside `setOpenId` clears the parent's id, which changes this
   * effect's deps, which runs its CLEANUP — and the cleanup cancels the frame that
   * has not fired yet. The row opened and never scrolled, which is the half of this
   * feature that is hard to notice in a list short enough to fit on screen.
   * Deferring the callback keeps the deps stable until the scroll has happened.
   *
   * An id that does not resolve is handled and forgotten rather than treated as an
   * error: the workout may have been deleted between the tap and this render, and
   * landing at the top of History is the right outcome for that.
   */
  useEffect(() => {
    if (!focusWorkoutId) return;

    if (!workouts.some((w) => w.id === focusWorkoutId)) {
      onFocusHandled?.();
      return;
    }
    setOpenId(focusWorkoutId);
    /* Keep it mounted once the id is cleared, too: the window is about to stop
       reaching for it, and a row that unmounted on the next render is one the
       scroll below can no longer find. */
    const index = months.findIndex((month) => month.workouts.some((w) => w.id === focusWorkoutId));
    if (index >= 0) setRowBudget((budget) => Math.max(budget, rowsIn(monthSizes, index + 1)));

    const frame = requestAnimationFrame(() => {
      const row = rowOffsets.current[focusWorkoutId];
      if (row != null) {
        const y =
          (monthOffsets.current[row.monthKey] ?? 0) +
          (cardOffsets.current[row.monthKey] ?? 0) +
          row.y;
        // −8 so the row is not flush against the header's hairline.
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
      }
      // Only now: see above.
      onFocusHandled?.();
    });
    return () => cancelAnimationFrame(frame);
    // `months`/`monthSizes` follow `workouts`, which is already a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusWorkoutId, onFocusHandled, workouts]);

  return (
    <View className="flex-1 bg-bg">
      <View className="flex-1" style={dimmed ? { opacity: 0.28 } : undefined}>
        <ScreenHeader
          kicker={t('Training history')}
          onBack={onBack}
          subtitle={
            totals.workouts > 0
              ? `${t('{count} {workouts}', {
                  count: totals.workouts,
                  // `few` is Russian's own third form, so it is the Russian word.
                  workouts: counted(totals.workouts, {
                    one: t('workout'),
                    few: 'тренировки',
                    many: t('workouts'),
                  }),
                })} · ${t('{count} sets', { count: totals.sets })}${
                  totals.volumeKg > 0 && !totals.volumeIsPartial
                    ? ` · ${formatVolumeKg(totals.volumeKg, lang)}`
                    : ''
                }`
              : undefined
          }
          bordered={false}
        >
          {toolbar}
        </ScreenHeader>

        {workouts.length === 0 ? (
          <>
            <Empty loadFailed={loadFailed} />
            {onOpenWrapped ? <WrappedHistoryFoot onOpen={onOpenWrapped} /> : null}
            {onOpenSettings ? (
              <View style={{ paddingBottom: 40 }}>
                <SettingsFootRow sectionLabel={t('Workout settings')} onPress={onOpenSettings} />
              </View>
            ) : null}
          </>
        ) : (
          <ScrollView
            ref={scrollRef}
            className="flex-1"
            contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            scrollEnabled={!dimmed}
            scrollEventThrottle={100}
            onScroll={
              hasMore
                ? (e) => {
                    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
                    if (nearEnd(contentOffset.y, layoutMeasurement.height, contentSize.height)) {
                      setRowBudget((budget) =>
                        Math.max(budget, rowsIn(monthSizes, shownMonths) + HISTORY_PAGE),
                      );
                    }
                  }
                : undefined
            }
          >
            {/* ----------------------------------------------------------
                SETS PER CLUSTER — above the months, because it is about the
                shape of recent training rather than about one session. */}
            {balance.totalSets > 0 ? (
              <GlassSurface
                tier="lit"
                radius={radius.hero}
                shadow="e2"
                glow="hero"
                flat
                className="mx-lg"
              >
                <View className="p-[18px]">
                  <View className="flex-row items-center" style={{ gap: 8 }}>
                    <Text
                      maxFontSizeMultiplier={1.3}
                      numberOfLines={1}
                      style={{ letterSpacing: 1.1 }}
                      className="flex-1 text-micro font-semibold uppercase text-acc"
                    >
                      {t('Sets per cluster')}
                    </Text>
                    <RangeSwitch
                      value={window}
                      onChange={(next) => {
                        tap();
                        setWindow(next);
                      }}
                    />
                  </View>
                  <View className="mt-lg" style={{ gap: 12 }}>
                    {balance.clusters.map((row, index) => (
                      <ClusterRow
                        key={row.cluster}
                        row={row}
                        index={index}
                        maxSets={balance.maxSets}
                        target={weeklyTargets[row.cluster]}
                      />
                    ))}
                    {/* Only when there is something to say. Sets whose exercise has
                        been deleted still happened, and a total that quietly omitted
                        them would be worse than one that admits it cannot place
                        them. */}
                    {balance.unfiled > 0 ? (
                      <View className="flex-row items-center">
                        <Text className="flex-1 text-label text-ink-faint">
                          {t('Exercise since deleted')}
                        </Text>
                        <Text className="text-label font-semibold tabular-nums text-ink-faint">
                          {balance.unfiled}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {/* W3: the same count one level down, this week, on a body.
                      Inside the card because it is this card's question asked
                      per muscle. */}
                  {onOpenMuscles ? (
                    <Pressable
                      onPress={onOpenMuscles}
                      accessibilityRole="button"
                      accessibilityLabel={t('Muscle map · this week')}
                      style={pressedStyle}
                      className="-mb-sm mt-md h-[44px] flex-row items-center"
                    >
                      <Text
                        maxFontSizeMultiplier={1.3}
                        className="flex-1 text-label font-medium text-acc"
                      >
                        {t('Muscle map · this week')}
                      </Text>
                      <Icon name="chevron-right" size={16} color={palette.acc} />
                    </Pressable>
                  ) : null}
                </View>
              </GlassSurface>
            ) : null}

            {shown.map((month) => (
              <View
                key={month.key}
                onLayout={(e) => {
                  monthOffsets.current[month.key] = e.nativeEvent.layout.y;
                }}
              >
                <Kicker className="mx-lg mb-kicker-gap mt-kicker">{month.label}</Kicker>
                <View
                  onLayout={(e) => {
                    cardOffsets.current[month.key] = e.nativeEvent.layout.y;
                  }}
                >
                  {/* One card per session, 8 apart — a session that opens grows
                      its OWN pane, rather than pushing a seam through a shared
                      one. */}
                  <View className="mx-lg" style={{ gap: 8 }}>
                    {month.workouts.map((workout) => (
                      <View
                        key={workout.id}
                        onLayout={(e) => {
                          rowOffsets.current[workout.id] = {
                            monthKey: month.key,
                            y: e.nativeEvent.layout.y,
                          };
                        }}
                      >
                        <HistoryRow
                          workout={workout}
                          number={numbers[workout.id]}
                          isOpen={openId === workout.id}
                          unitSystem={unitSystem}
                          canAddExercise={onAddExercise != null}
                          actions={actions}
                        />
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            ))}

            {/* X1: last month's Wrapped, at any time (and the year's, in its window). */}
            {onOpenWrapped ? <WrappedHistoryFoot onOpen={onOpenWrapped} /> : null}
            {/* U24: the section's settings, where you notice one is wrong. */}
            {onOpenSettings ? (
              <SettingsFootRow sectionLabel={t('Workout settings')} onPress={onOpenSettings} />
            ) : null}
          </ScrollView>
        )}
      </View>

      {numbering ? (
        <NumberSheet
          title={t('Which workout was this?')}
          body={t(
            'Every other workout renumbers from this one — the ones before it count down, the ones after it count up. Set it once on any session and the whole log lines up, including the sessions you did before this app existed.',
          )}
          initial={numbers[numbering.id] ?? null}
          onConfirm={(value) => {
            onSetNumber(numbering.id, value);
            setNumbering(null);
          }}
          onCancel={() => setNumbering(null)}
        />
      ) : null}

      {deleting ? (
        <ConfirmSheet
          tone="danger"
          title={t('Delete “{title}”?', { title: deleting.title })}
          body={t(
            '{date} · {count} sets. This is the record of a workout you did — deleting it also removes those sets from what the overload suggestions read.',
            {
              date: formatShortDate(deleting.startedAt, lang),
              count: deleting.setCount,
            },
          )}
          confirmLabel={t('Delete it')}
          cancelLabel={t('Keep it')}
          onConfirm={() => {
            onDelete(deleting.id);
            setDeleting(null);
            setOpenId(null);
          }}
          onCancel={() => setDeleting(null)}
        />
      ) : null}

      {marking && markingRow ? (
        <SetMarksSheet
          title={marking.title}
          kind={setKindOf(markingRow)}
          onKind={(kind) => onEditSet(marking.workoutId, marking.setId, { kind })}
          rir={markingRow.rir}
          showEffort={effortApplies(markingRow.countUnit)}
          onRir={(rir) => onEditSet(marking.workoutId, marking.setId, { rir })}
          onDismiss={() => setMarking(null)}
        />
      ) : null}

      {toast ? <Toast key={toast.key} label={toast.text} action={toast.action} /> : null}
    </View>
  );
}

/** How long the Undo after a removal stays up — the session screen's number. */
const UNDO_TOAST_MS = 4500;

/* ------------------------------------------------------------------ */

/** What every row can do, keyed by workout — one object for the whole list. */
interface RowActions {
  editSet: (workoutId: ID, setId: ID, patch: SetCorrection) => void;
  deleteSet: (workoutId: ID, setId: ID) => boolean;
  editWorkout: (
    workoutId: ID,
    patch: { title?: string; shiftMinutes?: number; durationMinutes?: number },
  ) => void;
  addSet: (workoutId: ID, exerciseId: ID) => void;
  removeExercise: (workoutId: ID, exerciseId: ID) => boolean;
  addExercise: (workoutId: ID) => void;
  toggle: (workoutId: ID) => void;
  askDelete: (workout: CompletedWorkout) => void;
  askNumber: (workout: CompletedWorkout) => void;
  /** Open a logged set's annotations sheet (RIR). */
  askMarks: (workoutId: ID, setId: ID, title: string) => void;
}

/**
 * One workout of the list, memoised: its props are its own data plus the list's
 * one stable `actions`, so it redraws when THIS workout changes and not when a
 * neighbour opens. The per-workout closures are made here, below the memo.
 */
/** One labelled clock time in an open session: `STARTED` over `18:05`. */
function SessionTime({ label, value }: { label: string; value: string }) {
  return (
    <View accessible accessibilityLabel={`${label} ${value}`}>
      <Kicker>{label}</Kicker>
      <Text
        maxFontSizeMultiplier={1.3}
        style={{ fontSize: 17, lineHeight: 22 }}
        className="mt-[2px] font-semibold tabular-nums text-ink"
      >
        {value}
      </Text>
    </View>
  );
}

const HistoryRow = memo(function HistoryRow({
  workout,
  number,
  isOpen,
  unitSystem,
  canAddExercise,
  actions,
}: {
  workout: CompletedWorkout;
  number?: number;
  isOpen: boolean;
  unitSystem: UnitSystem;
  canAddExercise: boolean;
  actions: RowActions;
}) {
  const id = workout.id;
  return (
    <WorkoutRow
      workout={workout}
      number={number}
      isOpen={isOpen}
      unitSystem={unitSystem}
      onEditSet={(setId, patch) => actions.editSet(id, setId, patch)}
      onDeleteSet={(setId) => actions.deleteSet(id, setId)}
      onEditWorkout={(patch) => actions.editWorkout(id, patch)}
      onAddSet={(exerciseId) => actions.addSet(id, exerciseId)}
      onRemoveExercise={(exerciseId) => actions.removeExercise(id, exerciseId)}
      onAddExercise={canAddExercise ? () => actions.addExercise(id) : undefined}
      onPress={() => actions.toggle(id)}
      onDelete={() => actions.askDelete(workout)}
      onEditNumber={() => actions.askNumber(workout)}
      onOpenMarks={(setId, title) => actions.askMarks(id, setId, title)}
    />
  );
});

function WorkoutRow({
  workout,
  number,
  isOpen,
  unitSystem,
  onPress,
  onDelete,
  onEditSet,
  onDeleteSet,
  onEditNumber,
  onEditWorkout,
  onAddSet,
  onRemoveExercise,
  onAddExercise,
  onOpenMarks,
}: {
  workout: CompletedWorkout;
  /** Its ordinal, or undefined / below 1 when the pinning leaves it without one. */
  number?: number;
  isOpen: boolean;
  unitSystem: UnitSystem;
  onPress: () => void;
  onDelete: () => void;
  onEditSet: (setId: ID, patch: SetCorrection) => void;
  onDeleteSet: (setId: ID) => boolean;
  onEditNumber: () => void;
  /** Rename it, move it in time, or say how long it took. */
  onEditWorkout: (patch: {
    title?: string;
    shiftMinutes?: number;
    durationMinutes?: number;
  }) => void;
  /** One more row on an exercise this workout already has. */
  onAddSet: (exerciseId: ID) => void;
  /** Take an exercise out, rows and all. False when it was the last one. */
  onRemoveExercise: (exerciseId: ID) => boolean;
  /** Open the library picker for this workout. Absent = no way to navigate there. */
  onAddExercise?: () => void;
  /** Open one logged set's annotations sheet, under the title given. */
  onOpenMarks: (setId: ID, title: string) => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const counted = usePlural();
  const exerciseCount = workout.exercises.length;
  const numbered = number != null && number >= 1;
  /** The exercise whose logged sets are listed, and the set being corrected. */
  const [openExerciseId, setOpenExerciseId] = useState<ID | null>(null);
  const [editing, setEditing] = useState<{ setId: ID; field: 'weight' | 'count' } | null>(null);
  /**
   * The workout-level edit block is SHUT by default.
   *
   * What you want from history is almost always a glance — the file header says so
   * — and a name field, three steppers and an `Add an exercise` row on every open
   * workout would put five controls between the reader and the sets they came to
   * see. One row reveals them, which is the same shape `Set the workout number`
   * already had.
   */
  const [editingWorkout, setEditingWorkout] = useState(false);
  /** The name, while it is being typed. Committed on blur — see the field below. */
  const [draftTitle, setDraftTitle] = useState(workout.title);
  /* The chevron turns over rather than swapping glyphs: 180° in 320 ms. */
  const turn = useRef(new Animated.Value(isOpen ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(turn, {
      toValue: isOpen ? 1 : 0,
      duration: 320,
      easing: curve(CHEVRON_EASE),
      useNativeDriver: true,
    }).start();
  }, [isOpen, turn]);

  /*
   * ONE LINE OF FACTS under the title, the date first — the date and length used
   * to be a right-hand column, and on a 360 dp phone that column is what squeezed
   * the title to three letters. It RUNS instead of being cut.
   *
   * The clock times sit right after the date, `17 Aug · 18:05–19:20 · 74 min`,
   * because "when did I train" is one question with a date half and a time half,
   * and the length that follows them is the difference between the two.
   */
  const span = formatTimeSpan(workout.startedAt, workout.endedAt);
  const detail = [
    formatShortDate(workout.startedAt, lang),
    span,
    t('{minutes} min', { minutes: workout.durationMinutes }),
    t('{count} {exercises}', {
      count: exerciseCount,
      // `few` is Russian's own third form, so it is the Russian word.
      exercises: counted(exerciseCount, {
        one: t('exercise'),
        few: 'упражнения',
        many: t('exercises'),
      }),
    }),
    t('{count} sets', { count: workout.setCount }),
    workout.totalVolumeKg > 0 && !workout.volumeIsPartial
      ? formatVolumeKg(workout.totalVolumeKg, lang)
      : null,
    /* HOW IT FELT, where the user said: one more fact on a line of facts, not a
       badge — a brutal session is not a worse session. Absent on every workout
       logged before the question existed, and on every one where it was skipped,
       which are the same thing and read the same way. */
    workout.effort ? effortWords(t)[workout.effort] : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const turnRotate = useMemo(
    () => turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }),
    [turn],
  );
  return (
    <View
      style={{
        borderRadius: radius.card,
        overflow: 'hidden',
        borderWidth: 1,
        // The open session is lit at the edge, so it reads as the one being
        // looked at in a column of eight identical cards.
        borderColor: isOpen ? tint(0.26) : 'rgba(236,241,238,0.06)',
        backgroundColor: isOpen ? 'rgba(236,241,238,0.07)' : 'rgba(236,241,238,0.045)',
      }}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        accessibilityLabel={[
          numbered ? `${t('Workout {number}', { number })},` : '',
          workout.title,
          formatShortDate(workout.startedAt, lang),
          t('from {start} to {end}', {
            start: formatTimeOfDay(workout.startedAt),
            end: formatTimeOfDay(workout.endedAt),
          }),
          t('{count} sets', { count: workout.setCount }),
          t('{minutes} minutes', { minutes: workout.durationMinutes }),
        ]
          .filter(Boolean)
          .join(' ')}
        style={pressedStyle}
        className="min-h-[64px] flex-row items-center px-lg py-[14px]"
      >
        {/* The ordinal is its own left column so the numbers line up down the
            list like a ledger, and so a long title can never push it off. The
            gutter is reserved even when a workout has no number, because a row
            that shifts left is harder to scan than one with a gap. */}
        <Text
          maxFontSizeMultiplier={1.3}
          style={{ fontSize: 14 }}
          className="w-[38px] font-semibold tabular-nums text-acc"
        >
          {numbered ? `#${number}` : ''}
        </Text>

        <View className="flex-1 pr-md" style={{ minWidth: 0 }}>
          <RunningText
            text={workout.title}
            fadeColor={FADE_ON.card}
            className="text-task text-ink"
          />
          <RunningText
            text={detail}
            fadeColor={FADE_ON.card}
            containerStyle={{ marginTop: 2 }}
            style={{ fontSize: 13.5, lineHeight: 18, color: DETAIL_INK }}
            className="tabular-nums"
          />
        </View>

        <Animated.View
          style={{
            transform: [{ rotate: turnRotate }],
          }}
        >
          <Icon name="chevron-down" size={18} color={palette.inkMuted} />
        </Animated.View>
      </Pressable>

      {isOpen ? (
        <Reveal>
          <View className="border-t border-hairline pb-sm pt-xs">
            {/* WHEN, spelled out. The row above says it in one run of facts;
                open, the two times get a label each, because "18:05–19:20" in a
                marquee is easy to read past and the start and end are exactly
                what someone opens a past session to check. */}
            <View className="flex-row px-lg pb-xs pt-sm" style={{ gap: 28 }}>
              <SessionTime label={t('Started')} value={formatTimeOfDay(workout.startedAt)} />
              <SessionTime
                label={t('Ended')}
                value={formatEndTime(workout.startedAt, workout.endedAt) ?? '--:--'}
              />
            </View>
            {workout.exercises.map((exercise) => {
              const total = describeTotal(exercise, t, lang);
              const listing = openExerciseId === exercise.exerciseId;
              /* Bounded before it is rendered, so it can never take the name's
               half of the row. Open, the row shows the whole thing. */
              const clamped = clampSummary(exercise.summary);
              const rows = listing
                ? workout.sets
                    .filter((row) => row.exerciseId === exercise.exerciseId)
                    .sort((a, b) => a.setIndex - b.setIndex)
                : [];
              /* Working sets numbered around warm-ups, as the session numbers
                 them: W, 1, 2 — so `Set 2` here is the `Set 2` it was on the day. */
              const labels = workingSetLabels(rows);

              return (
                <View key={`${exercise.exerciseId}-${exercise.name}`}>
                  <Pressable
                    onPress={() => {
                      tap();
                      setEditing(null);
                      setOpenExerciseId((current) =>
                        current === exercise.exerciseId ? null : exercise.exerciseId,
                      );
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: listing }}
                    accessibilityLabel={`${exercise.name}, ${exercise.summary}. ${
                      clamped.hidden > 0 && !listing
                        ? `${t('Show all {count} sets.', { count: exercise.setCount })} `
                        : ''
                    }${t('Correct a set.')}`}
                    style={pressedStyle}
                    className="flex-row items-start px-lg py-sm"
                  >
                    {/* TWO LINES OF NAME, and a column no summary can take.

                      The name used to be `flex-1` beside a column that sized
                      itself to whatever the shorthand was, and an exercise with
                      seven held sets rendered a row with NO NAME ON IT — see
                      `lib/summaryClamp.ts`. `maxWidth` is inline because it is a
                      percentage and the scale in `tailwind.config.js` is dp on
                      purpose; this is the one place in the app where the split has
                      to follow the phone's width rather than a step of the
                      spacing scale. */}
                    <Text
                      numberOfLines={2}
                      className="flex-1 pr-md text-label font-medium text-ink"
                    >
                      {exercise.name}
                    </Text>
                    <View className="shrink items-end" style={{ maxWidth: '56%' }}>
                      <View className="flex-row items-baseline">
                        <Text
                          /* Open, the summary is worth its full height: the rows
                           under it are the same sets one per line, so a wrapped
                           shorthand above them is a heading, not a wall. */
                          numberOfLines={listing ? 3 : 1}
                          className="shrink text-label tabular-nums text-ink-muted"
                        >
                          {listing ? exercise.summary : clamped.text}
                        </Text>
                        {/* THE DOTS. Green, because green is what a tap does in this
                          app, and inside the row's own Pressable rather than a
                          nested one — the thing they open is the thing the row
                          opens. */}
                        {clamped.hidden > 0 && !listing ? (
                          <Text className="ml-xs text-body font-semibold leading-none text-green-bright">
                            {'\u2026'}
                          </Text>
                        ) : null}
                      </View>
                      {total ? (
                        <Text className="mt-[2px] text-micro font-semibold uppercase tabular-nums text-green-bright">
                          {total}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>

                  {/* The logged rows, one correctable at a time. See the header. */}
                  {listing ? (
                    <Reveal>
                      {rows.map((row, index) => (
                        <LoggedSetRow
                          key={row.id}
                          row={row}
                          number={labels[index]}
                          unitSystem={unitSystem}
                          editing={editing?.setId === row.id ? editing.field : null}
                          onFocusField={(field) =>
                            setEditing((current) =>
                              current?.setId === row.id && current.field === field
                                ? null
                                : { setId: row.id, field },
                            )
                          }
                          onChange={(patch) => onEditSet(row.id, patch)}
                          onRemove={() => {
                            if (onDeleteSet(row.id)) setEditing(null);
                          }}
                          onDone={() => setEditing(null)}
                          onOpenMarks={() => {
                            const n = labels[index];
                            onOpenMarks(row.id, n == null ? t('Warm-up') : t('Set {n}', { n }));
                          }}
                          canRemove={workout.sets.length > 1}
                        />
                      ))}
                    </Reveal>
                  ) : null}

                  {/* THE TWO STRUCTURAL EDITS, and only on the exercise whose rows
                    are open — which is the exercise the user is looking at, and
                    the only one for which "one more set" is unambiguous.

                    `+ Add a set` is the way back from a mis-tapped ✕, and it is
                    the reason a set row's ✕ can stay a single tap. `Remove
                    exercise` is `ink-muted` rather than green because it takes
                    something away, the same weight `Delete this workout` has —
                    and not `ink-faint`, which is for labels, never actions (U3). */}
                  {listing ? (
                    <View className="flex-row px-lg pb-sm">
                      <Pressable
                        onPress={() => {
                          tap();
                          onAddSet(exercise.exerciseId);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={t('Add a set to {name}', { name: exercise.name })}
                        style={pressedStyle}
                        className="h-hit flex-1 justify-center"
                      >
                        <Text className="text-label font-medium text-green-bright">
                          {t('+ Add a set')}
                        </Text>
                      </Pressable>

                      {exerciseCount > 1 ? (
                        <Pressable
                          onPress={() => {
                            undo();
                            if (onRemoveExercise(exercise.exerciseId)) {
                              setOpenExerciseId(null);
                              setEditing(null);
                            }
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={t('Remove {name} from this workout', {
                            name: exercise.name,
                          })}
                          style={pressedStyle}
                          className="h-hit justify-center"
                        >
                          <Text className="text-label font-medium text-ink-muted">
                            {t('Remove exercise')}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}

            {/* An exercise the session missed, or one removed by mistake. Above the
              edit block because it is about the CONTENT of the workout, which is
              what everything above it is too. */}
            {onAddExercise ? (
              <Pressable
                onPress={() => {
                  tap();
                  onAddExercise();
                }}
                accessibilityRole="button"
                accessibilityLabel={t('Add an exercise to this workout')}
                style={pressedStyle}
                className="h-hit justify-center px-lg"
              >
                <Text className="text-label font-medium text-green-bright">
                  {t('+ Add an exercise')}
                </Text>
              </Pressable>
            ) : null}

            {/* WHAT THE WORKOUT IS: its name, when it happened, how long it took.

              Behind one row, because history is read far more often than it is
              corrected. Every control in here is the app's own ± idiom rather than
              a native picker: there is no date picker in this codebase, a stepper
              needs no permissions and no module, and the edits people actually
              make to a finished session are small ones — a day out because it ran
              past midnight, an hour because the phone was in a bag, a duration
              that kept counting on the walk home. */}
            <Pressable
              onPress={() => {
                tap();
                setDraftTitle(workout.title);
                setEditingWorkout((open) => !open);
              }}
              accessibilityRole="button"
              accessibilityState={{ expanded: editingWorkout }}
              accessibilityLabel={t('Edit the name, date and length of {title}', {
                title: workout.title,
              })}
              style={pressedStyle}
              className="h-hit justify-center px-lg"
            >
              <Text className="text-label font-medium text-green-bright">
                {editingWorkout ? t('Done editing') : t('Edit name, date and length')}
              </Text>
            </Pressable>

            {editingWorkout ? (
              <View className="px-lg pb-sm">
                <Kicker className="mb-sm">{t('Name')}</Kicker>
                <FieldWell
                  value={draftTitle}
                  placeholder={t('Workout name')}
                  onChangeText={setDraftTitle}
                  /*
                   * Committed on BLUR, not on every keystroke. Every write here
                   * recomputes the record and re-sorts the log, and doing that once
                   * per typed character would rebuild the list under the keyboard.
                   */
                  onBlur={() => onEditWorkout({ title: draftTitle })}
                  accessibilityLabel={t('Workout name')}
                />

                <View className="mt-md overflow-hidden rounded-surface border border-hairline bg-surface">
                  <StepperRow
                    label={t('Date')}
                    hint={t('Every set in this workout moves with it')}
                    value={formatShortDate(workout.startedAt, lang)}
                    onDecrease={() => {
                      tap();
                      onEditWorkout({ shiftMinutes: -MINUTES_PER_DAY });
                    }}
                    onIncrease={() => {
                      tap();
                      onEditWorkout({ shiftMinutes: MINUTES_PER_DAY });
                    }}
                  />
                  <Separator />
                  <StepperRow
                    label={t('Started')}
                    value={formatTimeOfDay(workout.startedAt)}
                    onDecrease={() => {
                      tap();
                      onEditWorkout({ shiftMinutes: -TIME_STEP_MINUTES });
                    }}
                    onIncrease={() => {
                      tap();
                      onEditWorkout({ shiftMinutes: TIME_STEP_MINUTES });
                    }}
                  />
                  <Separator />
                  <StepperRow
                    label={t('Took')}
                    // The end is not a third control: it IS start + length, so
                    // it moves with either stepper and is stated here.
                    hint={t('Ended at {time}', { time: formatTimeOfDay(workout.endedAt) })}
                    value={t('{minutes} min', { minutes: workout.durationMinutes })}
                    onDecrease={() => {
                      tap();
                      onEditWorkout({
                        durationMinutes: workout.durationMinutes - DURATION_LIMITS.step,
                      });
                    }}
                    onIncrease={() => {
                      tap();
                      onEditWorkout({
                        durationMinutes: workout.durationMinutes + DURATION_LIMITS.step,
                      });
                    }}
                  />
                </View>
              </View>
            ) : null}

            {/* Renumbering sits above delete because it is the one you actually
              reach for, and both are inside the open row for the same reason:
              you read what the workout was before you touch it. */}
            <Pressable
              onPress={onEditNumber}
              accessibilityRole="button"
              accessibilityLabel={
                numbered
                  ? t('Change the number of workout {number}', { number })
                  : t('Set this workout’s number')
              }
              style={pressedStyle}
              className="h-hit justify-center px-lg"
            >
              <Text className="text-label font-medium text-green-bright">
                {numbered ? t('Workout number: {number}', { number }) : t('Set the workout number')}
              </Text>
            </Pressable>

            {/* No red, and not a swipe: see the file header. 24 dp and a
              hairline away from the number above it (U20): the two were
              stacked 44 dp rows, and a thumb reaching for the renumber
              landed on delete. The gap says "a different kind of thing". */}
            <View className="mt-xl">
              <Separator inset={16} />
            </View>
            <DangerFootAction
              label={t('Delete this workout')}
              accessibilityLabel={t('Delete the {title} workout', { title: workout.title })}
              onPress={onDelete}
              className="mx-md"
            />
          </View>
        </Reveal>
      ) : null}
    </View>
  );
}

/**
 * `4w / 12w / All`, with one gradient thumb sliding under the choice.
 *
 * Not `Segmented`: that one stretches its segments across the row and lights the
 * selected one in place, and this sits in the card's header beside the kicker at
 * a fixed 46 per segment, which is what lets the thumb be a plain native-driven
 * translate — no measuring, no layout pass on a tap. The short labels are shown;
 * the long ones (`4 weeks`) are what is spoken.
 */
function RangeSwitch({
  value,
  onChange,
}: {
  value: BalanceWindow;
  onChange: (next: BalanceWindow) => void;
}) {
  const t = useT();
  const index = Math.max(
    0,
    BALANCE_WINDOWS.findIndex((w) => w.value === value),
  );
  const x = useRef(new Animated.Value(index)).current;
  useEffect(() => {
    Animated.timing(x, {
      toValue: index,
      duration: 360,
      easing: curve(THUMB_EASE),
      useNativeDriver: true,
    }).start();
  }, [index, x]);
  const short: Record<BalanceWindow, string> = { '4w': t('4w'), '12w': t('12w'), all: t('All') };

  const slideX = useMemo(
    () =>
      x.interpolate({
        inputRange: [0, 1],
        outputRange: [0, RANGE_SEGMENT],
      }),
    [x],
  );
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('How far back the cluster counts reach')}
      style={{
        flexDirection: 'row',
        padding: 3,
        borderRadius: radius.pill,
        backgroundColor: 'rgba(6,8,7,0.35)',
        borderWidth: 1,
        borderColor: 'rgba(236,241,238,0.06)',
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 3,
          bottom: 3,
          left: 3,
          width: RANGE_SEGMENT,
          borderRadius: radius.pill,
          overflow: 'hidden',
          transform: [
            {
              translateX: slideX,
            },
          ],
        }}
      >
        <LinearGradient
          /* The design's thumb is the gradient's first two stops only: at
             46 dp the third would be a sliver. 135deg, like every fill. */
          colors={[palette.c1, palette.c2]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
      {BALANCE_WINDOWS.map((w) => {
        const selected = w.value === value;
        return (
          <Pressable
            key={w.value}
            onPress={() => onChange(w.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={t(w.label)}
            style={pressedStyle}
          >
            <View
              style={{
                width: RANGE_SEGMENT,
                height: 30,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                maxFontSizeMultiplier={1.3}
                numberOfLines={1}
                style={{ fontSize: 13.5, color: selected ? palette.onAcc : palette.inkMuted }}
                className="font-semibold"
              >
                {short[w.value]}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * One cluster: name, count, bar.
 *
 * The bar is scaled to the LARGEST cluster, not to a target — it compares the
 * user's own numbers to each other, which is the only comparison this screen is
 * willing to draw. A cluster with no sets gets an empty track and a plain `0`,
 * because the zero is the information.
 *
 * The count is `ink` even at zero: it is a fact, not a warning, and dimming it
 * would be the screen having an opinion.
 *
 * THE BAR MOVES TWICE, and they are two different motions on two nodes. On
 * mount it GROWS from its left edge (`scaleX`, 800 ms, 70 ms apart per row,
 * native-driven), which says "these were just counted". When the range changes
 * its WIDTH travels to the new share (640 ms, 50 ms apart) — a width, so
 * JS-driven, and on the inner node so the two drivers never share one.
 */
function ClusterRow({
  row,
  index,
  maxSets,
  target,
}: {
  row: ClusterCount;
  /** Its place in the list — the stagger of both motions. */
  index: number;
  maxSets: number;
  /** The user's own weekly target for this cluster, or undefined. */
  target?: number;
}) {
  const t = useT();
  const lang = useLanguage();
  const totals = describeClusterTotals(row.totals, (s) => formatDuration(s, lang), lang);
  /*
   * THE BAR IS MEASURED AGAINST THE TARGET WHERE THERE IS ONE, and against the
   * busiest cluster otherwise.
   *
   * That is the whole difference the target makes. Without one, the bars are a
   * comparison between clusters — "back got twice the work chest did" — which is
   * `balance.ts`'s "a count, not a score" and stays exactly as it was. With one,
   * the bar is progress toward a number the USER typed, which is the only kind of
   * target this app is willing to draw. It is capped at full: a bar past 100% would
   * need a second visual language for overshoot, and the numerals already say it.
   */
  const fraction =
    target != null && target > 0
      ? Math.min(1, row.sets / target)
      : maxSets > 0
        ? row.sets / maxSets
        : 0;

  const grow = useRef(new Animated.Value(0)).current;
  const width = useRef(new Animated.Value(fraction)).current;
  useEffect(() => {
    Animated.timing(grow, {
      toValue: 1,
      duration: 800,
      delay: 260 + index * 70,
      easing: curve(BAR_GROW_EASE),
      useNativeDriver: true,
    }).start();
    // Mount only: the grow is the arrival, not the range.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    Animated.timing(width, {
      toValue: fraction,
      duration: 640,
      delay: index * 50,
      easing: curve(BAR_RESIZE_EASE),
      useNativeDriver: false,
    }).start();
  }, [fraction, index, width]);

  const fillWidth = useMemo(
    () => width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
    [width],
  );
  return (
    <View
      className="flex-row items-center"
      style={{ gap: 10 }}
      accessibilityLabel={`${clusterLabel(row.cluster, lang)}, ${t('{count} sets', {
        count: row.sets,
      })}${target != null ? ` ${t('of {target}', { target })}` : ''}${totals ? `, ${totals}` : ''}`}
    >
      <Text
        numberOfLines={1}
        style={{ width: 64, fontSize: 14.5, lineHeight: 20, color: '#AEB9B3' }}
      >
        {clusterLabel(row.cluster, lang)}
      </Text>

      {/* `14 / 16` where a target exists, `14` where it does not. The target is
          `ink-faint` because it is the thing the user typed, not the thing that
          happened — the fact is the number in full ink beside it. */}
      <View className="flex-row items-baseline justify-end" style={{ minWidth: 40 }}>
        <Text
          style={{ fontSize: 14.5, lineHeight: 20 }}
          className="font-semibold tabular-nums text-ink"
        >
          {row.sets}
        </Text>
        {target != null ? (
          <Text className="text-micro tabular-nums text-ink-faint">/{target}</Text>
        ) : null}
      </View>

      {/* The bar, and what those sets added up to, on one line. */}
      <View className="flex-1">
        <View
          style={{
            height: 10,
            borderRadius: radius.pill,
            overflow: 'hidden',
            backgroundColor: 'rgba(236,241,238,0.05)',
          }}
        >
          <Animated.View
            style={{
              height: '100%',
              transformOrigin: 'left',
              transform: [{ scaleX: grow }],
            }}
          >
            <Animated.View
              style={{
                height: '100%',
                borderRadius: radius.pill,
                overflow: 'hidden',
                width: fillWidth,
              }}
            >
              <LinearGradient {...gradientBar()} style={{ flex: 1 }} />
            </Animated.View>
          </Animated.View>
        </View>
        {totals ? (
          <Text className="mt-[3px] text-micro tabular-nums text-ink-faint">{totals}</Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * One logged set, correctable.
 *
 * ── WHY THIS IS NOT `SetRow` + `QuickAdjust` ────────────────────────────────
 *
 * They are the right shape and the wrong contract. `SetRow` is 56 dp built around
 * a ✓ that logs, a ▶ that runs a clock, and a prefill-ghost state — none of which
 * means anything about a set that happened three weeks ago, and the ✓ in
 * particular would be a control that either does nothing or un-logs history.
 * `QuickAdjust` edits a `DraftSet` and offers `Remove set` against a live session.
 *
 * So this is deliberately quieter and smaller than both: a number, a chip row, and
 * two words. It reuses the app's own weight and count steps (`weightSteps`,
 * `countStep`) so a correction nudges by exactly what a set row nudges by, and it
 * snaps nothing — `QuickAdjust`'s rule about not rounding to a grid the app has
 * never seen applies at least as strongly to a number that is already a record.
 *
 * TYPE AND EFFORT (T-11, T-12) are corrected here too, through the same sheet the
 * session uses (`SetMarksSheet`): the set's number or letter opens it, so do the
 * `Set type` and `Reps in reserve` rows in the correction panel, and so does a
 * graded set's `RIR` chip. The left column numbers WORKING sets now (W, 1, 2),
 * as the session does — it used to count warm-ups, so a set read `2` here that
 * had been `Set 1` on the day.
 *
 * NO CONFIRMATION on a nudge, because a nudge is reversible by the opposite nudge
 * and the number is on screen while it changes. `Remove set` is not offered at all
 * on the last row of a workout: that is deleting the workout, which exists two rows
 * below and asks first.
 */
function LoggedSetRow({
  row,
  number,
  unitSystem,
  editing,
  canRemove,
  onFocusField,
  onChange,
  onRemove,
  onDone,
  onOpenMarks,
}: {
  row: SetHistory;
  /** The working-set number (warm-ups not counted), or null for a warm-up. */
  number: number | null;
  unitSystem: UnitSystem;
  editing: 'weight' | 'count' | null;
  canRemove: boolean;
  onFocusField: (field: 'weight' | 'count') => void;
  onChange: (patch: SetCorrection) => void;
  onRemove: () => void;
  onDone: () => void;
  /** The `RIR` door in the correction panel, and the chip's tap. */
  onOpenMarks: () => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const weighted = row.weightKg != null;
  const graded = row.rir != null && effortApplies(row.countUnit);
  const kind = setKindOf(row);
  const steps = weightSteps(unitSystem);
  const countDelta = countStep(row.countUnit);

  const bumpWeight = (delta: number) => {
    tap();
    const current = unitSystem === 'imperial' ? kgToLb(row.weightKg ?? 0) : (row.weightKg ?? 0);
    const next = Math.max(0, Number((current + delta).toFixed(2)));
    onChange({ weightKg: unitSystem === 'imperial' ? lbToKg(next) : next });
  };

  const bumpCount = (delta: number) => {
    tap();
    onChange({ count: Math.max(0, row.count + delta) });
  };

  return (
    <View>
      <View className="flex-row items-center px-lg py-xs">
        {/* The number, or the set type's letter in its place (W D F A) — tapping it
            opens the type and RIR sheet, as on the session's row. */}
        <Pressable
          onPress={() => {
            tap();
            onOpenMarks();
          }}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 0 }}
          accessibilityRole="button"
          accessibilityLabel={
            number == null
              ? kindName(kind, lang)
              : kind === 'working'
                ? t('Set {n}', { n: number })
                : t('Set {n}, {kind}', { n: number, kind: kindName(kind, lang) })
          }
          accessibilityHint={t('Opens the set type and reps in reserve')}
          className="w-[24px]"
        >
          <Text
            className={[
              'text-micro font-semibold uppercase tabular-nums',
              kind === 'working' || kind === 'warmup' ? 'text-ink-faint' : 'text-green-bright',
            ].join(' ')}
          >
            {kindBadge(kind) ?? number}
          </Text>
        </Pressable>

        {weighted ? (
          <Pressable
            onPress={() => onFocusField('weight')}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t('Correct the weight, {weight} {unit}', {
              weight: formatWeight(row.weightKg, unitSystem, row.loadMode),
              unit: unitLabel(unitSystem, lang),
            })}
            style={pressedStyle}
            className={[
              'min-w-[76px] flex-row items-baseline',
              editing === 'weight' ? 'rounded-surface bg-surface px-xs' : '',
            ].join(' ')}
          >
            <Text className="text-label font-semibold tabular-nums text-ink">
              {formatWeight(row.weightKg, unitSystem, row.loadMode)}
            </Text>
            <Text className="ml-xs text-micro uppercase text-ink-faint">
              {unitLabel(unitSystem, lang)}
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => onFocusField('count')}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t('Correct the count, {count} {unit}', {
            count: formatCount(row.count, row.countUnit),
            unit: countUnitLabel(row.countUnit, lang),
          })}
          style={pressedStyle}
          className={[
            'ml-md min-w-[76px] flex-row items-baseline',
            editing === 'count' ? 'rounded-surface bg-surface px-xs' : '',
          ].join(' ')}
        >
          <Text className="text-label font-semibold tabular-nums text-ink">
            {formatCount(row.count, row.countUnit)}
          </Text>
          <Text className="ml-xs text-micro uppercase text-ink-faint">
            {countUnitLabel(row.countUnit, lang)}
          </Text>
        </Pressable>

        {graded ? (
          <Pressable
            onPress={onOpenMarks}
            hitSlop={{ top: 9, bottom: 9, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel={describeRir(row.rir ?? 0, lang)}
            style={pressedStyle}
            className="ml-sm h-[26px] justify-center rounded-pill border border-hairline px-sm"
          >
            <Text
              maxFontSizeMultiplier={1.3}
              className="text-[12.5px] font-semibold tabular-nums text-ink-muted"
            >
              {rirChipLabel(row.rir ?? 0)}
            </Text>
          </Pressable>
        ) : null}

        <View className="flex-1" />
        <Icon
          name={editing ? 'chevron-down' : 'chevron-right'}
          size={14}
          color={palette.inkFaint}
        />
      </View>

      {editing ? (
        <View className="mx-lg mb-sm rounded-surface bg-surface px-md py-sm">
          <View className="flex-row items-center justify-between">
            {(editing === 'weight'
              ? [-steps.coarse, -steps.fine, steps.fine, steps.coarse]
              : [-countDelta * 2, -countDelta, countDelta, countDelta * 2]
            ).map((delta) => (
              <Pressable
                key={delta}
                onPress={() => (editing === 'weight' ? bumpWeight(delta) : bumpCount(delta))}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`${delta > 0 ? 'Add' : 'Subtract'} ${Math.abs(delta)}`}
                style={pressedStyle}
                className="h-hit min-w-[52px] items-center justify-center rounded-pill border border-hairline bg-surface-alt"
              >
                <Text className="text-label font-medium tabular-nums text-ink">
                  {delta < 0 ? '−' : '+'}
                  {Math.abs(Number(delta.toFixed(2)))}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* The set's kind, as in the session's editor: the door to the sheet. */}
          <View className="mt-sm flex-row items-center justify-between">
            <Text maxFontSizeMultiplier={1.3} className="text-label text-ink-muted">
              {t('Set type')}
            </Text>
            <Pressable
              onPress={() => {
                tap();
                onOpenMarks();
              }}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={`${t('Set type')}: ${kindName(kind, lang)}`}
              style={pressedStyle}
              className="h-hit min-w-[72px] items-center justify-center rounded-pill border border-hairline bg-surface-alt px-md"
            >
              <Text
                className={[
                  'text-label font-semibold',
                  kind === 'working' ? 'text-ink' : 'text-green-bright',
                ].join(' ')}
              >
                {kindName(kind, lang)}
              </Text>
            </Pressable>
          </View>

          {/* Effort, as in the session's editor: the door to the scale. */}
          {effortApplies(row.countUnit) ? (
            <View className="mt-sm flex-row items-center justify-between">
              <Text maxFontSizeMultiplier={1.3} className="text-label text-ink-muted">
                {t('Reps in reserve')}
              </Text>
              <Pressable
                onPress={() => {
                  tap();
                  onOpenMarks();
                }}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel={
                  row.rir != null ? describeRir(row.rir, lang) : t('Add reps in reserve')
                }
                style={pressedStyle}
                className="h-hit min-w-[72px] items-center justify-center rounded-pill border border-hairline bg-surface-alt px-md"
              >
                <Text
                  className={[
                    'text-label font-semibold tabular-nums',
                    row.rir != null ? 'text-ink' : 'text-green-bright',
                  ].join(' ')}
                >
                  {row.rir != null ? rirChipLabel(row.rir) : '+ RIR'}
                </Text>
              </Pressable>
            </View>
          ) : null}

          <View className="mt-sm flex-row items-center justify-between">
            {/* Only where it is not the last row of the workout. See the note above. */}
            {canRemove ? (
              <Pressable
                onPress={onRemove}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('Remove this set from the workout')}
                style={pressedStyle}
                className="h-hit justify-center"
              >
                <Text className="text-label font-medium text-ink-muted">{t('Remove set')}</Text>
              </Pressable>
            ) : (
              <Text className="text-label text-ink-faint">
                {t('The only set — delete the workout')}
              </Text>
            )}

            <Pressable
              onPress={onDone}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('Done correcting')}
              style={pressedStyle}
              className="h-hit justify-center"
            >
              <Text className="text-label font-semibold text-green-bright">{t('Done')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Nothing to show — and WHICH nothing, because they are not the same.
 *
 * An empty log is the normal state of a new install and reads as an invitation. A
 * log that could not be opened is a fault, the workouts are still on disk, and the
 * worst thing the screen can do is describe it as an empty log: that is the app
 * telling somebody their training is gone when it is not. So it says what happened
 * and what to do about it — reopening the app re-reads the file, and the number of
 * workouts actually on disk is stated in Settings.
 */
function Empty({ loadFailed = false }: { loadFailed?: boolean }) {
  const t = useT();

  if (loadFailed) {
    return (
      <View className="flex-1 items-center justify-center px-xl">
        <Text className="text-title font-medium text-ink">{t("Couldn't open your log")}</Text>
        <Text className="mt-sm text-center text-body text-ink-muted">
          {t(
            'Your workouts are still on disk — this is a failure to READ them, not a loss. Close the app and open it again. Settings states how many are down there, and “Export data” still works.',
          )}
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center px-xl">
      <Text className="text-title font-medium text-ink">{t('Nothing finished yet')}</Text>
      <Text className="mt-sm text-center text-body text-ink-muted">
        {t(
          'Finish a workout and it lands here — every set, with what you lifted and how long it took.',
        )}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */

interface MonthGroup {
  key: string;
  label: string;
  workouts: CompletedWorkout[];
}

/**
 * Workouts bucketed by month, newest month first.
 *
 * The input is already newest-first (the store keeps it that way), so insertion
 * order is the right order and nothing is re-sorted here.
 */
function groupByMonth(
  workouts: readonly CompletedWorkout[],
  lang: Language,
  now: Date = new Date(),
): MonthGroup[] {
  const groups = new Map<string, MonthGroup>();

  for (const workout of workouts) {
    const key = monthKey(workout.startedAt);
    const existing = groups.get(key);
    if (existing) {
      existing.workouts.push(workout);
      continue;
    }
    groups.set(key, {
      key,
      label: monthLabel(workout.startedAt, now, lang),
      workouts: [workout],
    });
  }

  return [...groups.values()];
}

/** "August", or "August 2025" once the year stops being obvious. */
function monthLabel(iso: string, now: Date, lang: Language): string {
  const date = new Date(iso);
  // The nominative month, because this is a heading naming the month itself —
  // `formatMonth` owns that table, and the genitive one is for dates.
  const full = formatMonth(date.getFullYear(), date.getMonth(), lang);
  if (date.getFullYear() !== now.getFullYear()) return full;
  // Same year, so the year is noise: drop it off whatever `formatMonth` built.
  return full.replace(` ${date.getFullYear()}`, '');
}

/**
 * "12 reps total" / "4:00 total" — every set of one exercise added up.
 *
 * Null for a single set, where the total is just the set restated, and for work
 * whose counts don't add to anything meaningful. Rounds state both numbers,
 * because "12 rounds" and "36:00" are two different facts about the same session.
 */
function describeTotal(exercise: CompletedExercise, t: Translate, lang: Language): string | null {
  const { totalCount, setCount, countUnit } = exercise;
  if (setCount <= 1 || totalCount <= 0) return null;

  if (countUnit === 'seconds') return t('{what} total', { what: formatDuration(totalCount, lang) });
  if (countUnit === 'rounds') {
    return `${t('{count} rounds', { count: setCount })} · ${formatDuration(totalCount, lang)}`;
  }
  return t('{what} total', {
    what: `${totalCount} ${term('unit', countUnit === 'meters' ? 'm' : 'reps', lang)}`,
  });
}

/**
 * "4 720 kg" — space-grouped thousands, because five digits of session volume is
 * normal and `47200` is unreadable at Label size.
 *
 * Grouped by hand rather than with `toLocaleString`: number formatting through
 * Intl depends on which ICU the engine shipped with, and a volume figure that
 * silently loses its grouping on one build and not another is not worth the
 * dependency for one regex.
 */
