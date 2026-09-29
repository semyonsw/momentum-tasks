/**
 * AppShell — four sections and a stack, in about a hundred lines of state.
 *
 *   tab:  Workout | Tasks | Expenses | Settings   ← the roots
 *   stack: session · routineEditor · addExercise · createExercise · editExercise
 *          · exerciseHistory · sequence · workoutHistory · tasksHistory
 *          · moneyHistory · workoutSettings · taskSettings · moneySettings
 *          · aiSettings · aiChat · aiReview
 *
 * ── A SECTION IS A LOG, AND ITS PAST IS NOT A SECTION ──────────────────────
 *
 * `History` used to be a root, which gave the training log a tab for its past
 * while the tasks' and the money's were buried at the bottom of their own
 * screens. Each section now carries a ⟲ in its corner and pushes its OWN history,
 * so the same glyph in the same place answers "how has this been going" for all
 * three. `More` is gone with it: it was a lobby, and Settings — the one screen
 * anybody actually went there for — is a root that leads with a row per section.
 *
 * ── AND THE ORDER OF THE FOUR IS A GESTURE ─────────────────────────────────
 *
 * A horizontal swipe steps along the tab bar (`components/SwipePager.tsx`), so
 * the bar's left-to-right order is navigation rather than layout. Both read
 * `lib/sectionNav.ts` so there is one array and the swipe cannot land somewhere
 * the bar does not highlight. Swiping only works at a ROOT: a pushed screen owns
 * the whole width, and a flick out of a routine editor would be a way to lose an
 * edit sideways.
 *
 * Why not a router library: the app has five roots and six pushable screens, none
 * of them deep-linked, none of them needing URL state. `expo-router` would add a
 * dependency, a file-system convention and a navigator config to express a
 * `Route[]` and two functions. When deep links or a native back-stack are actually
 * needed, every screen below this file is already a plain component taking props
 * and callbacks — they port without edits.
 *
 * The one rule this shell enforces that a router wouldn't: THE TAB BAR DOES NOT
 * EXIST DURING A SESSION. A workout is not a tab.
 *
 * What lives here and what doesn't: the library and the routines moved out to
 * `libraryStore` the moment they became editable — component state that vanishes
 * on a cold launch is not where a user's exercises belong. What is left in this
 * file is navigation, plus the two derived things navigation needs: the training
 * sequence's next step and the overload verdicts behind its nudge count.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { BackHandler, Text, View, useWindowDimensions } from 'react-native';
import { runOnJS, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';

import { ConfirmSheet } from '../components/ConfirmSheet';
import { BlurGate, Toast, type ToastAction } from '../components/glass';
import { isOverlayOpen } from '../components/overlay';
import { PrimaryButton } from '../components/primitives';
import { Segmented } from '../components/primitives';
import { SwipePager } from '../components/SwipePager';
import { NavBar } from '../components/NavBar';
import { ActiveWorkoutScreen } from '../screens/ActiveWorkoutScreen';
import { CreateExerciseScreen } from '../screens/CreateExerciseScreen';
import { ExerciseHistoryScreen } from '../screens/ExerciseHistoryScreen';
import { ExerciseLibraryScreen, clusterKey, muscleKey } from '../screens/ExerciseLibraryScreen';
import { HistoryScreen, type HistoryScreenProps } from '../screens/HistoryScreen';
import { ProgressScreen } from '../screens/ProgressScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
import {
  HomeScreen,
  type RoutineChoice,
  type SequenceView,
  type RunningWorkout,
} from '../screens/HomeScreen';
import { RoutineEditorScreen } from '../screens/RoutineEditorScreen';
import { RoutineListScreen } from '../screens/RoutineListScreen';
import { SequenceScreen } from '../screens/SequenceScreen';
import { SettingsHomeScreen } from '../screens/SettingsHomeScreen';
import { LandingScreen, type TileRect } from '../screens/LandingScreen';
import { Hold } from './Hold';
import { ShellStage, TRANSITION_MS, type ShellTransition } from './ShellStage';
import { PushHost } from './PushHost';
import { mayLeave } from './leaveGuard';
import { WorkoutSettingsScreen } from '../screens/WorkoutSettingsScreen';
import { TaskSettingsScreen } from '../screens/TaskSettingsScreen';
import { MoneySettingsScreen } from '../screens/MoneySettingsScreen';
import { AmountEditorScreen } from '../screens/AmountEditorScreen';
import { CategoryDetailScreen } from '../screens/CategoryDetailScreen';
import { MoneyScreen, type MoneyWindow } from '../screens/MoneyScreen';
import { MoneyHistoryScreen } from '../screens/MoneyHistoryScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';
import { TasksScreen } from '../screens/TasksScreen';
import { TasksHistoryScreen } from '../screens/TasksHistoryScreen';
import { AiChatScreen } from '../screens/AiChatScreen';
import { AiReviewScreen } from '../screens/AiReviewScreen';
import { AiSettingsScreen } from '../screens/AiSettingsScreen';
import { applySequence, applyProposal, discardProposal } from '../state/aiActions';
import { useAi } from '../state/aiStore';
import { useDebriefs } from '../state/debriefStore';
import type { AiSection } from '../lib/ai/aiSchema';
import {
  historyByExerciseId,
  shareUnchanged,
  lastTrainedByRoutine,
  recentlyUsedExerciseIds,
  workoutNumbers,
} from '../lib/completedWorkout';
import { buildDraftEntry, defaultTargetCount, defaultTargetSets } from '../lib/draft';
import { resolveRest } from '../lib/rest';
import { bodyweightAt } from '../lib/bodyweightLog';
import { writeWorkoutToHealthConnect } from '../lib/healthConnect';
import { ladderOutcomes } from '../lib/repLadder';
import { applyPlannedSetDiff, performedSetCounts, plannedSetDiff } from '../lib/routinePlan';
import {
  applyDraftToExercise,
  draftToExercise,
  emptyExerciseDraft,
  exerciseToDraft,
  type ExerciseDraft,
} from '../lib/exerciseDraft';
import { MUSCLE_CLUSTER, describeItemsFocus } from '../lib/muscles';
import { evaluateOverload, type OverloadVerdict } from '../lib/progressiveOverload';
import { searchExercises } from '../lib/search';
import { useActiveWorkout } from '../state/activeWorkoutStore';
import { routineUsageCount, useLibrary } from '../state/libraryStore';
import { platesInForce, useSettings } from '../state/settingsStore';
import { recentSummaries, useWorkoutHistory } from '../state/workoutHistoryStore';
import { useMoney } from '../state/moneyStore';
import { useTasks } from '../state/tasksStore';
import { dayKey } from '../lib/days';
import { useLanguage, usePlural, useT } from '../hooks/useT';
import { useToday } from '../hooks/useToday';
import type { Direction, Interval } from '../lib/money';
import {
  SECTIONS,
  backAction,
  stepSection,
  swipeDecision,
  swipeFollow,
  type SectionTab,
  type ShellRoute,
} from '../lib/sectionNav';
import { seedUser } from '../data/seed';
import type { CompletedWorkout } from '../lib/completedWorkout';
import type { Exercise, ID, MuscleGroup, SetHistory, UnitSystem } from '../types/models';

/** Screens pushed on top of a tab. `session` is pushed and owns the screen. */
type Route =
  | { name: 'session' }
  | {
      name: 'routineEditor';
      routineId: ID;
      /**
       * This routine was created by opening this screen, so backing out without
       * putting anything in it should not leave it behind. See `handleLeaveEditor`.
       */
      isNew?: boolean;
    }
  | {
      name: 'addExercise';
      routineId: ID | null;
      /**
       * Where the picked exercise goes. `session` appends it to the WORKOUT IN
       * FLIGHT with one set — the neck work decided on halfway through pull day —
       * rather than editing any routine. `history` puts it into a workout that
       * already happened, which is the way back from a `Remove exercise` on the
       * wrong card. Same picker, same create flow underneath; only the destination
       * differs, which is why this is a field and not three screens.
       */
      target?: 'routine' | 'session' | 'history';
      /** The finished workout to add to. Only read when `target` is `history`. */
      workoutId?: ID;
    }
  | {
      name: 'createExercise';
      draft: ExerciseDraft;
      /** Created FROM the session picker: add it to the library, then to the workout. */
      addToSession?: boolean;
    }
  | { name: 'editExercise'; exerciseId: ID }
  | { name: 'exerciseHistory'; exerciseId: ID }
  | { name: 'sequence' }
  /* The two screens the training log is SET UP from, pushed from the foot of the
     workout section rather than owning roots of their own. */
  | { name: 'routines' }
  | { name: 'library' }
  /* Each section's own past, pushed by the ⟲ in its corner. Three routes and not
     one with a parameter: they render different screens over different stores,
     and the only thing they share is where the tap came from. */
  | { name: 'workoutHistory' }
  | { name: 'tasksHistory' }
  | { name: 'moneyHistory'; accountId: ID; day: string }
  /* One settings screen per section, pushed from the section list. */
  | { name: 'workoutSettings' }
  | { name: 'taskSettings' }
  | { name: 'moneySettings' }
  | { name: 'taskDetail'; taskId: ID }
  /* The window travels with the tap, so the category opens on the one the tile
     was read through rather than resetting to this month. */
  | { name: 'moneyCategory'; categoryId: ID; accountId: ID; interval: Interval; anchor: string }
  /* `day` travels with the tap for the same reason the window does: a category
     tapped while reading the 16th is an amount ON the 16th. */
  | {
      name: 'moneyAmount';
      amountId: ID | null;
      categoryId: ID | null;
      accountId: ID | null;
      direction?: Direction;
      day?: string;
    }
  /* The assistant. Settings is reached from a section's sparkle when no key is
     connected, and carries the section and the question along so that passing
     the test lands on the chat that was asked for. */
  | { name: 'aiSettings'; from?: AiSection; prompt?: string }
  | { name: 'aiChat'; section: AiSection; prompt?: string }
  | { name: 'aiReview'; proposalId: string };

/**
 * Where the shell was standing, outside React. The tree remounts when the theme
 * changes (`App.tsx`), and this is what lands it back on the same screen rather
 * than on Home — see `route` in the shell.
 */
const remembered: { route: ShellRoute; section: SectionTab } = {
  route: 'Home',
  section: 'Workout',
};

/** From Save to the debrief sheet: the sparks' run, and a breath. */
const DEBRIEF_DELAY_MS = 1500;

/** How long a toast with an Undo stays: long enough to read and reach. */
const UNDO_TOAST_MS = 4500;

/**
 * The expenses window as entering the section puts it: today, in the default
 * interval and direction, on whichever subsection it was on. The SAME object
 * when it already stands there, so a re-seed that changes nothing re-renders
 * nothing.
 */
function seedMoneyWindow(current: MoneyWindow): MoneyWindow {
  const settings = useSettings.getState();
  const anchor = dayKey(new Date());
  if (
    current.anchor === anchor &&
    current.interval === settings.moneyDefaultInterval &&
    current.direction === settings.moneyDefaultDirection
  ) {
    return current;
  }
  return {
    ...current,
    anchor,
    interval: settings.moneyDefaultInterval,
    direction: settings.moneyDefaultDirection,
  };
}

export function AppShell() {
  const t = useT();
  const lang = useLanguage();
  /**
   * What the last commit said, for about two seconds.
   *
   * It lives HERE and not in the screen that raised it, because the whole point
   * of it is that it appears over the screen you land BACK on: the keypad is
   * gone by the time the amount exists, and a toast rendered by a component
   * that has just unmounted is a toast nobody sees.
   */
  const [toast, setToastState] = useState<{
    text: string;
    key: number;
    action?: ToastAction;
  } | null>(null);
  /* Keyed, so a second toast with the same words still replays its entrance. */
  const setToast = useCallback(
    (text: string, action?: ToastAction) => setToastState({ text, key: Date.now(), action }),
    [],
  );
  useEffect(() => {
    if (toast == null) return undefined;
    const timer = setTimeout(() => setToastState(null), toast.action ? UNDO_TOAST_MS : 1900);
    return () => clearTimeout(timer);
  }, [toast]);
  /**
   * The workout that was JUST saved, for the moment Home comes back: the hero
   * throws its sparks and the new Recent row grows in. Cleared by Home once it
   * has played, so coming back to the section later is not a second celebration.
   */
  const [justSaved, setJustSaved] = useState<{ id: ID; at: number } | null>(null);
  /**
   * Where the shell is: Home, or one of the four sections. Home is the landing
   * (see `screens/LandingScreen.tsx`) and not a fifth tab — it is not on the
   * swipe row, and `tab` below is the section the rest of the shell reads, which
   * on Home is simply the last one visited.
   *
   * Seeded from module scope rather than a constant, because the tree under
   * `App.tsx` REMOUNTS when the theme changes — and a theme is chosen in
   * Settings, where the user should still be standing when the colours land.
   */
  const [route, setRouteState] = useState<ShellRoute>(() => remembered.route);
  const [lastSection, setLastSection] = useState<SectionTab>(() => remembered.section);
  const tab: SectionTab = route === 'Home' ? lastSection : route;
  /*
   * The route and the section it leaves behind, set in ONE batch. The section
   * used to follow from an effect, which cost every section switch a second full
   * render of both stage layers, in the first frames of the transition, to change
   * a value nothing reads until the route is Home again.
   */
  const setRoute = useCallback((next: ShellRoute) => {
    setRouteState(next);
    if (next !== 'Home') setLastSection(next);
  }, []);
  useEffect(() => {
    remembered.route = route;
    if (route !== 'Home') remembered.section = route;
  }, [route]);
  /** The tile each section last grew out of, so it can shrink back into it. */
  const tileRects = useRef<Partial<Record<SectionTab, TileRect>>>({});
  const [transition, setTransition] = useState<ShellTransition | null>(null);
  const progress = useSharedValue(0);
  const swipeX = useSharedValue(0);
  const navDrag = useSharedValue(0);
  const covered = useSharedValue(0);
  const [rootsVisible, setRootsVisible] = useState(true);
  const { width: screenWidth } = useWindowDimensions();
  /**
   * A workout somebody tapped somewhere else, waiting for the training history to open
   * it and scroll to it.
   *
   * Both `RECENT` on Home and the session rows on the exercise-history screen hand
   * over a workout id, and both used to have it dropped on the floor —
   * `onOpenSession` was `() => setTab('History')`, so you landed at the top of the
   * log and hunted for the row you had just tapped. The history screen clears this
   * once it has acted, so the row does not spring open again the next time it is
   * opened.
   */
  const [focusWorkoutId, setFocusWorkoutId] = useState<ID | null>(null);
  /**
   * A past day the user has WALKED TO in the tasks section, or null for today.
   *
   * Held here and not in `TasksScreen` because the month grid — the one control
   * that makes walking back three weeks one tap instead of twenty-one — is a
   * PUSHED screen now, and a day picked in it has to outlive the screen that
   * picked it. Everything else about the tasks belongs to the store.
   *
   * NULL RATHER THAN TODAY'S KEY, and it is not a detail. This state used to live
   * in the screen, where it was re-seeded from the clock every time the screen
   * mounted — which is to say every time the tab changed. Lifting it up here made
   * it outlive that, and a stored `2026-09-13` would have gone stale in two ways:
   * the app left open past midnight would keep offering yesterday's circles to
   * tick, and coming back to the section days later would land on whatever day was
   * last read rather than on today. Null is "follow the clock", so both answer
   * themselves, and `leaveSection` below drops the pin on the way out so the old
   * behaviour — leave the section, come back to today — is exactly preserved.
   */
  const [pinnedTaskDay, setPinnedTaskDay] = useState<string | null>(null);
  /* STATE, not `dayKey(new Date())` inline: "follow the clock" only follows it
     if something re-renders when the date turns. See `hooks/useToday.ts`. */
  const today = useToday();
  const taskDay = pinnedTaskDay ?? today;
  /**
   * What the expenses section is reading: the subsection, the window and the
   * direction.
   *
   * Lifted here for the same reason `pinnedTaskDay` is, and it took the same
   * bug to find out: a pushed route replaces the tab root, so opening the ⟲ from
   * July and coming back re-mounted `MoneyScreen` and re-seeded its anchor from
   * the clock. The window you were reading is a place you walked to inside the
   * section, and a detour into that section's own past must not lose it.
   *
   * `leaveSection` below drops it, so the old behaviour — leave the section,
   * come back to this month — is exactly preserved.
   */
  const [moneyWindow, setMoneyWindow] = useState<MoneyWindow>(() => ({
    accountId: null,
    interval: useSettings.getState().moneyDefaultInterval,
    anchor: dayKey(new Date()),
    direction: useSettings.getState().moneyDefaultDirection,
  }));
  const changeMoneyWindow = useCallback(
    (patch: Partial<MoneyWindow>) => setMoneyWindow((current) => ({ ...current, ...patch })),
    [],
  );
  /*
   * Past midnight, a window that was reading TODAY moves on to the new today.
   * One that was walked somewhere else stays where it was put — the same line
   * the tasks' pin draws, with "was on today" standing in for null.
   */
  const previousToday = useRef(today);
  useEffect(() => {
    const was = previousToday.current;
    previousToday.current = today;
    if (was === today) return;
    setMoneyWindow((current) => (current.anchor === was ? { ...current, anchor: today } : current));
  }, [today]);
  /*
   * The same re-seed once the section has been LEFT and the slide is over. The
   * stage builds the next Expenses ahead of time (`navigation/ShellStage.tsx`),
   * from the window as it stands then — so it has to stand where the way in
   * would put it, or the re-seed on arrival would roll every total on screen
   * from the old window's numbers, where a mount at arrival just showed them.
   * And again when a default is edited in Settings, which is next door, for the
   * same reason. The way-in re-seed stays as the backstop, a no-op otherwise.
   */
  const moneyDefaultInterval = useSettings((s) => s.moneyDefaultInterval);
  const moneyDefaultDirection = useSettings((s) => s.moneyDefaultDirection);
  useEffect(() => {
    if (transition == null && tab !== 'Expenses') setMoneyWindow(seedMoneyWindow);
  }, [moneyDefaultDirection, moneyDefaultInterval, tab, transition]);
  const [stack, setStack] = useState<Route[]>([]);
  const [query, setQuery] = useState('');
  /*
   * Which library sections are open. Held here rather than in the screen so a trip
   * out to `createExercise` and back lands the user in the group they were looking
   * at — the whole flow of "open chest, add an exercise, see it appear" depends on
   * chest still being open when they get back.
   */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  /** The exercise the user asked to delete, held while the sheet asks. */
  const [deleting, setDeleting] = useState<Exercise | null>(null);

  const exercises = useLibrary((s) => s.exercises);
  const routines = useLibrary((s) => s.routines);
  const addExercise = useLibrary((s) => s.addExercise);
  const updateExercise = useLibrary((s) => s.updateExercise);
  const deleteExercise = useLibrary((s) => s.deleteExercise);
  const createRoutine = useLibrary((s) => s.createRoutine);
  const updateRoutine = useLibrary((s) => s.updateRoutine);
  const deleteRoutine = useLibrary((s) => s.deleteRoutine);
  const duplicateRoutine = useLibrary((s) => s.duplicateRoutine);
  const appendToRoutine = useLibrary((s) => s.appendToRoutine);
  const sequence = useLibrary((s) => s.sequence);
  const setSequenceActive = useLibrary((s) => s.setSequenceActive);
  const addSequenceStep = useLibrary((s) => s.addSequenceStep);
  const removeSequenceStep = useLibrary((s) => s.removeSequenceStep);
  const moveSequenceStep = useLibrary((s) => s.moveSequenceStep);
  const setSequenceCursor = useLibrary((s) => s.setSequenceCursor);
  const varySequenceStep = useLibrary((s) => s.varySequenceStep);
  const advanceSequence = useLibrary((s) => s.advanceSequence);

  const unitSystem = useSettings((s) => s.unitSystem);
  /*
   * Subscribed, not read once: the routine editor states which rows are FOLLOWING
   * this number, and a row saying "rest · setting 2:00" has to change when the
   * setting does. A primitive selector, so it is a stable snapshot.
   */
  const restSecondsBetweenSets = useSettings((s) => s.restSecondsBetweenSets);

  /*
   * THE SESSION BY ITS FACTS, NOT BY REFERENCE. The draft's identity changes on
   * every ✓ and every ± chip, and subscribing to it re-ran this whole shell — every
   * memo check, every route's element — for each of them, in the same frame as the
   * logging screen's own render. The shell only needs which session it is, what
   * it was built from, and the resume card's numbers; the rest is read from the
   * store at the moment a handler needs it.
   */
  const sessionId = useActiveWorkout((s) => s.session?.localId ?? null);
  const sessionRoutineId = useActiveWorkout((s) => s.session?.routineId ?? null);
  const sessionTitle = useActiveWorkout((s) => s.session?.title ?? '');
  const sessionStartedAt = useActiveWorkout((s) => s.session?.startedAt ?? null);
  const startSession = useActiveWorkout((s) => s.startSession);
  const discardSession = useActiveWorkout((s) => s.discardSession);

  const workouts = useWorkoutHistory((s) => s.workouts);
  /*
   * "The log could not be read", which is NOT "the log is empty" — see
   * `workoutHistoryStore.loadFailed`. Only the training history's empty state reads it.
   */
  const loadFailed = useWorkoutHistory((s) => s.loadFailed);
  const saveSession = useWorkoutHistory((s) => s.saveSession);
  const deleteWorkout = useWorkoutHistory((s) => s.deleteWorkout);
  const updateWorkoutSet = useWorkoutHistory((s) => s.updateWorkoutSet);
  const deleteWorkoutSet = useWorkoutHistory((s) => s.deleteWorkoutSet);
  const editWorkout = useWorkoutHistory((s) => s.editWorkout);
  const addWorkoutSet = useWorkoutHistory((s) => s.addWorkoutSet);
  const addWorkoutExercise = useWorkoutHistory((s) => s.addWorkoutExercise);
  const deleteWorkoutExercise = useWorkoutHistory((s) => s.deleteWorkoutExercise);
  const restoreWorkout = useWorkoutHistory((s) => s.restoreWorkout);
  const numbering = useWorkoutHistory((s) => s.numbering);
  const setWorkoutNumber = useWorkoutHistory((s) => s.setWorkoutNumber);

  /* The assistant: whether a key has passed its test, and the routines it made. */
  const aiStatus = useAi((s) => s.status);
  const aiReady = aiStatus === 'ready';
  const unseenAiRoutines = useAi((s) => s.unseenRoutineIds);

  const exercisesById = useMemo<Record<ID, Exercise>>(
    () => Object.fromEntries(exercises.map((e) => [e.id, e])),
    [exercises],
  );
  const routinesById = useMemo(
    () => Object.fromEntries(routines.map((r) => [r.id, r])),
    [routines],
  );

  /**
   * The workout already running, for the home screen's resume card.
   *
   * Only a STARTED session counts: an unstarted one is a routine somebody opened
   * to read, and it is thrown away when they leave.
   */
  const inProgress = useMemo<RunningWorkout | null>(
    () => (sessionStartedAt ? { title: sessionTitle, startedAt: sessionStartedAt } : null),
    [sessionStartedAt, sessionTitle],
  );

  /** Search results. Browse mode builds its own tree from `exercises`. */
  const matches = useMemo(() => searchExercises(exercises, query), [exercises, query]);

  /** The library's `RECENTLY USED` card — from what was actually trained. */
  const recentlyUsed = useMemo(
    () =>
      recentlyUsedExerciseIds(workouts)
        .map((id) => exercisesById[id])
        .filter((e): e is Exercise => e != null),
    [exercisesById, workouts],
  );

  const currentTop = stack[stack.length - 1] ?? null;
  const push = useCallback((route: Route) => setStack((s) => [...s, route]), []);
  /**
   * Swap the top of the stack for another route.
   *
   * One caller: duplicating a routine, which replaces the editor with an editor on
   * the copy. `push` would be wrong there — backing out of the copy would land on
   * the original's editor, which is a screen the user has already left.
   */
  const replaceTop = useCallback(
    (route: Route) => setStack((s) => (s.length === 0 ? [route] : [...s.slice(0, -1), route])),
    [],
  );
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  /**
   * Back to the logging screen, however many screens deep the detour went.
   *
   * Adding an exercise mid-workout can be one screen (pick it) or two (pick a
   * muscle group, create it), and both end the same way: the user is holding a
   * barbell and wants the set rows back. Popping a fixed number of screens would
   * be right for exactly one of the two paths.
   */
  const popToSession = useCallback(
    () =>
      setStack((s) => {
        const index = s.findIndex((route) => route.name === 'session');
        return index === -1 ? [] : s.slice(0, index + 1);
      }),
    [],
  );
  /** Every pushed screen dismissed at once, back to the tab bar. */
  const popToRoot = useCallback(() => setStack([]), []);

  /**
   * Changing section, by the bar or by a swipe — the one path, so the two cannot
   * leave different state behind.
   *
   * It does one thing beyond `setTab`: LEAVING the tasks unpins the day. Walking
   * back to last Tuesday is a thing you do inside that section, not a place you
   * want the app to still be sitting in the next time you open it — and before
   * this state was lifted out of `TasksScreen`, the unmount did exactly this for
   * free. Pushing a screen (the month grid, a task's own screen) is not leaving,
   * so the pin survives the trip that sets it.
   */
  const navigate = useCallback(
    (next: ShellRoute, options: { from?: TileRect | null; dragFrom?: number } = {}) => {
      if (next === route) return;
      if (tab === 'Tasks' && next !== 'Tasks') setPinnedTaskDay(null);
      /* Same rule, same reason: the window is somewhere you walked to inside the
         section, not somewhere the app should still be standing next time it is
         opened. Pushing a screen — the history, a category, the keypad — is not
         leaving, so the window survives the trip that needed it.

         Re-seeded on the way IN, from the settings as they are NOW. It used to
         reset only the anchor on the way out, so `Opens on: Week` changed in
         Settings did nothing until the next launch — the one moment the shell
         read it. */
      if (next === 'Expenses' && tab !== 'Expenses') setMoneyWindow(seedMoneyWindow);
      /* Which of the three transitions this is, and where it grows from. */
      const section = next === 'Home' ? (route as SectionTab) : next;
      if (next !== 'Home' && options.from) tileRects.current[next] = options.from;
      const kind: ShellTransition['kind'] =
        route === 'Home' ? 'open' : next === 'Home' ? 'close' : 'slide';
      const dir: 1 | -1 =
        kind === 'slide' && SECTIONS.indexOf(next as SectionTab) < SECTIONS.indexOf(tab) ? -1 : 1;
      setTransition({
        kind,
        from: route,
        to: next,
        dir,
        rect: tileRects.current[section] ?? null,
        dragFrom: options.dragFrom ?? 0,
      });
      setRoute(next);
    },
    [route, setRoute, tab],
  );
  /*
   * The transition starts when it is ON STAGE, not when it is asked for. Zeroing
   * the swipe offset in `navigate` snapped a released screen back to centre —
   * and the nav blob back to its old slot — for the frames it took the incoming
   * section to mount, before the slide picked it up again from `dragFrom`; and
   * the clock started early, so a slow mount (Money, Home) ate the first part of
   * the 640 ms.
   */
  useLayoutEffect(() => {
    if (!transition) return;
    swipeX.value = 0;
    navDrag.value = 0;
    progress.value = 0;
    progress.value = withTiming(
      1,
      { duration: TRANSITION_MS, easing: Easing.linear },
      (finished) => {
        if (finished) runOnJS(setTransition)(null);
      },
    );
  }, [navDrag, progress, swipeX, transition]);
  /** A section by name, from anywhere — the nav bar, a swipe, a deep jump. */
  const selectTab = useCallback((next: SectionTab) => navigate(next), [navigate]);
  const goHome = useCallback(() => navigate('Home'), [navigate]);
  /* The jumps that land in a section from UNDER a pushed screen: nothing on
     stage to animate, so the route just changes. */
  const setTab = useCallback((next: SectionTab) => setRoute(next), [setRoute]);

  /**
   * Open one finished workout, wherever the tap came from: go to the workout
   * section, push its history, and hand it the id to expand and scroll to.
   *
   * The id is state rather than an argument threaded into the screen, because the
   * history screen is rendered from the stack and mounts after this runs.
   * `clearFocusWorkout` is how it says it has acted, so the row opens once rather
   * than every time somebody comes back.
   *
   * `setStack` to exactly `[workoutHistory]` and not `push`: every caller of this
   * is on a screen the user is LEAVING — a row on the exercise-history screen, the
   * `RECENT` list on the workout section — and pushing history on top of them would
   * make `‹` walk back through a screen nobody asked to see again.
   */
  const openWorkout = useCallback(
    (sessionId: ID) => {
      setFocusWorkoutId(sessionId);
      setTab('Workout');
      setStack([{ name: 'workoutHistory' }]);
    },
    [setTab],
  );
  const clearFocusWorkout = useCallback(() => setFocusWorkoutId(null), []);

  /** Filled in below, once the editor's exit rule exists. See `leaveTop`. */
  const leaveRoutineEditor = useRef<(route: { routineId: ID; isNew?: boolean }) => void>(pop);

  /**
   * Leaving the logging screen.
   *
   * A STARTED workout keeps running: it is persisted, the user is coming back to
   * it, and the only things that end it are `Finish` and `Stop and exit`. One that
   * was never started is a routine somebody opened to read, so it is thrown away
   * on the way out — that is what makes "get in, look, get out" leave no trace.
   */
  const leaveSession = useCallback(() => {
    if (!useActiveWorkout.getState().session?.startedAt) discardSession();
    pop();
  }, [discardSession, pop]);

  const toggleExpanded = useCallback((key: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  /**
   * Leaving the top screen, by either route out of it.
   *
   * Declared before the back handler so hardware back and the `‹` chevron go
   * through the SAME path — otherwise the two gestures leave different state
   * behind, which is the kind of difference nobody finds until it has already lost
   * something.
   */
  const leaveTop = useRef<() => void>(pop);
  leaveTop.current = () => {
    // A screen with unsaved edits asks first — see `navigation/leaveGuard.ts`.
    if (!mayLeave()) return;
    const route = stack[stack.length - 1];
    if (route?.name === 'routineEditor') {
      leaveRoutineEditor.current(route);
      return;
    }
    if (route?.name === 'session') {
      leaveSession();
      return;
    }
    // The picker's own ‹ reopens the workout it was adding to; hardware back and
    // the edge swipe come through here and must leave the same state behind.
    if (route?.name === 'addExercise' && route.target === 'history' && route.workoutId) {
      setFocusWorkoutId(route.workoutId);
    }
    pop();
  };

  /*
   * ANDROID BACK, in the design's order (`lib/sectionNav.backAction`): a sheet
   * closes itself — overlays register their own handler, later and so first —
   * then a pushed screen pops, then a section goes Home, and Home asks for a
   * second press within two seconds before it lets the app go.
   *
   * Registered ONCE, at mount, so it is always the earliest listener and every
   * sheet and focus mode registered after it gets the press first.
   */
  const exitArmedAt = useRef<number | null>(null);
  const backState = useRef({ depth: stack.length, route });
  backState.current = { depth: stack.length, route };
  const goHomeRef = useRef<() => void>(() => {});
  goHomeRef.current = () => navigate('Home');
  const armExitRef = useRef<() => void>(() => {});
  armExitRef.current = () => setToast(t('Press back again to exit'));
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const action = backAction({
        sheetOpen: isOverlayOpen(),
        stackDepth: backState.current.depth,
        route: backState.current.route,
        exitArmedAt: exitArmedAt.current,
        now: Date.now(),
      });
      if (action === 'closeSheet') return true;
      if (action === 'pop') leaveTop.current();
      else if (action === 'home') goHomeRef.current();
      else if (action === 'armExit') {
        exitArmedAt.current = Date.now();
        armExitRef.current();
      } else {
        BackHandler.exitApp();
      }
      return true;
    });
    return () => sub.remove();
  }, []);

  /*
   * A session claims the screen exactly ONCE per session — on the render after it
   * is started, and on the render after `persist` rehydrates one from a crash or a
   * force-quit mid-workout.
   *
   * Keyed on `localId` rather than on truthiness, because "a session exists" is
   * also true after the user has deliberately backed out of it, and re-pushing
   * there would trap them on the logging screen.
   */
  const claimedSessionId = useRef<string | null>(null);
  useEffect(() => {
    if (!sessionId) {
      claimedSessionId.current = null;
      return;
    }
    if (claimedSessionId.current === sessionId) return;
    claimedSessionId.current = sessionId;
    push({ name: 'session' });
  }, [push, sessionId]);

  /* --- derived: history, the choices, the nudge count ------------------- */
  /*
   * Everything that reads history reads THIS — and history is now ONLY what the
   * user logged. The shipped fixture sessions are gone (see `src/data/seed.ts`):
   * a fresh install used to open on four workouts nobody did, a chart of someone
   * else's pull-downs, and nudges about weights never lifted, none of it
   * distinguishable from real data. What remains is a `CompletedWorkout[]` on
   * disk, flattened to the shape the prefills, the overload engine and the
   * exercise chart all want.
   */
  const historyByIdRef = useRef<Record<ID, SetHistory[]> | null>(null);
  const historyById = useMemo(() => {
    // An exercise whose rows did not change keeps its array, so the verdict cache
    // below recomputes only the exercises that moved. See `shareUnchanged`.
    const next = shareUnchanged(historyByIdRef.current, historyByExerciseId(workouts));
    historyByIdRef.current = next;
    return next;
  }, [workouts]);

  const recent = useMemo(() => recentSummaries(workouts), [workouts]);

  /* The two other logs. Read here rather than in the screens only where a
     PUSHED route needs to resolve its subject — the tab roots read the stores
     themselves, like `SettingsScreen` does. */
  const tasks = useTasks((s) => s.tasks);
  const moneyAccounts = useMoney((s) => s.accounts);
  const categories = useMoney((s) => s.categories);
  const amounts = useMoney((s) => s.amounts);

  /**
   * Every workout's ordinal — "workout 92" — from the one pinned pair.
   *
   * Derived here rather than stored per workout, so a session deleted or a number
   * re-pinned renumbers the whole log in one place. See `workoutNumbers`.
   */
  const numbers = useMemo(() => workoutNumbers(workouts, numbering), [numbering, workouts]);
  const nextWorkoutNumber = useMemo(() => {
    const ordinals = Object.values(numbers);
    return ordinals.length > 0 ? Math.max(...ordinals) + 1 : 1;
  }, [numbers]);

  /*
   * PER EXERCISE, CACHED. A ✓ at a new weight writes that one exercise's default
   * back to the library, which is a new `exercises` array — and re-running the
   * engine over every exercise's whole history on each of those was a synchronous
   * pass over the log inside the tap that logged the set. The library replaces
   * only what it edits, so an exercise object that is the same reference, with the
   * same history array, the same units and the same UTC day (the engine's clock
   * reads no finer than that — see `daysBetween`) gets the same verdict back.
   */
  const verdictCache = useRef(
    new WeakMap<
      Exercise,
      {
        history: SetHistory[] | undefined;
        unitSystem: UnitSystem;
        day: string;
        verdict: OverloadVerdict;
      }
    >(),
  ).current;
  const verdicts = useMemo(() => {
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const out: Record<ID, OverloadVerdict> = {};
    for (const exercise of exercises) {
      const history = historyById[exercise.id];
      const cached = verdictCache.get(exercise);
      if (
        cached &&
        cached.history === history &&
        cached.unitSystem === unitSystem &&
        cached.day === day
      ) {
        out[exercise.id] = cached.verdict;
        continue;
      }
      const verdict = evaluateOverload({
        exercise,
        history: history ?? [],
        policy: seedUser.overloadPolicy,
        unitSystem,
        now,
      });
      verdictCache.set(exercise, { history, unitSystem, day, verdict });
      out[exercise.id] = verdict;
    }
    return out;
  }, [exercises, historyById, unitSystem, verdictCache]);

  /** When each routine was last trained, for the hero's `LAST` stat. */
  const lastTrained = useMemo(() => lastTrainedByRoutine(workouts), [workouts]);

  /** Every routine, described well enough to pick one without opening it. */
  const choices = useMemo<RoutineChoice[]>(
    () =>
      routines.map((routine) => {
        const items = routine.items.filter((item) => exercisesById[item.exerciseId]);
        return {
          routineId: routine.id,
          name: routine.name,
          focus: describeItemsFocus(items, exercisesById, lang),
          exerciseCount: items.length,
          setCount: items.reduce((total, item) => total + item.targetSets, 0),
          lastTrainedAt: lastTrained[routine.id] ?? null,
          isAi: unseenAiRoutines.includes(routine.id),
        };
      }),
    [exercisesById, lastTrained, routines, lang, unseenAiRoutines],
  );

  /**
   * The sequence as the home screen wants it: the steps in order, and the routine
   * whose turn it is.
   *
   * Null whenever the sequence is off or empty, which is the default — the home
   * screen then renders nothing about it and simply lists every routine. A step
   * whose routine was deleted resolves to no `next` rather than to a card
   * suggesting a workout that isn't there; `libraryStore` drops such steps, so
   * this is the belt to that braces.
   */
  const sequenceView = useMemo<SequenceView | null>(() => {
    if (!sequence.isActive || sequence.routineIds.length === 0) return null;

    const steps = sequence.routineIds.map((routineId, index) => ({
      key: `${routineId}-${index}`,
      name: routinesById[routineId]?.name ?? t('Deleted routine'),
      isCurrent: index === sequence.cursor,
    }));

    const currentId = sequence.routineIds[sequence.cursor];
    const choice = choices.find((c) => c.routineId === currentId) ?? null;
    const routine = currentId ? routinesById[currentId] : undefined;
    const items = routine ? routine.items.filter((item) => exercisesById[item.exerciseId]) : [];

    return {
      steps,
      next:
        choice && routine
          ? {
              ...choice,
              // Only counts what the engine would actually surface — an exercise
              // with no load can never contribute a nudge.
              nudgeCount: items.filter((item) => verdicts[item.exerciseId]?.shouldNudge).length,
            }
          : null,
    };
  }, [choices, exercisesById, routinesById, sequence, t, verdicts]);

  /**
   * Open a routine as a workout. It does NOT start it: the session is built with
   * no start time and nothing is timed or dated until `Start` inside the logging
   * screen (or the first logged set) says so. See `ActiveWorkoutScreen`.
   */
  const handleOpenWorkout = useCallback(
    (routineId: ID) => {
      // An AI routine stops saying so once it has been opened. See `aiStore`.
      useAi.getState().markRoutineSeen(routineId);
      const session = useActiveWorkout.getState().session;
      /*
       * A STARTED session is never clobbered: if one exists — the user backed out
       * of it and came back — this returns to it rather than rebuilding the draft,
       * which would silently discard everything already logged. The same is true
       * of re-opening the routine that is already open.
       *
       * An UNSTARTED session for some other routine is a preview nobody committed
       * to, so opening a different routine replaces it. Without this exception,
       * looking at push day and then deciding on pull would land you back on push
       * with no way to tell why.
       */
      if (session && (session.startedAt != null || session.routineId === routineId)) {
        push({ name: 'session' });
        return;
      }

      const routine = routinesById[routineId];
      if (!routine) return;

      /*
       * A routine whose every exercise has been deleted builds a session with no
       * entries: a logging screen with nothing to log and a Finish button that
       * saves nothing. Refuse it and send the user to the editor instead, which is
       * where the problem actually is.
       */
      const hasWork = routine.items.some((item) => exercisesById[item.exerciseId]);
      if (!hasWork) {
        push({ name: 'routineEditor', routineId });
        return;
      }

      const settings = useSettings.getState();
      // The push is left to the claim effect above, which fires for the new
      // session's localId — one code path for "opened" and "rehydrated".
      startSession({
        routine,
        exercisesById,
        historyByExerciseId: historyById,
        policy: seedUser.overloadPolicy,
        unitSystem: settings.unitSystem,
        defaultRestSeconds: settings.restSecondsBetweenSets,
        defaultTransitionRestSeconds: settings.restSecondsBetweenExercises,
        /*
         * What the lifter weighed on the day of each past set, so a bodyweight
         * movement's bests compare honestly: `+20 kg × 8` at 78 kg does not tie
         * the same set at 82 kg. A closure rather than a number, because the
         * answer is different for every row in the history it is about to read.
         */
        bodyweightAtDate: (at) => bodyweightAt(settings.bodyweightLog, at),
        // For the deload suggestion, which must never name an unloadable weight.
        availablePlatesKg: platesInForce(settings),
        lang,
      });
    },
    [exercisesById, historyById, lang, push, routinesById, startSession],
  );

  /**
   * `+ Add routine`.
   *
   * This button did nothing at all — it was wired to an empty handler with a TODO
   * in it, so tapping it was indistinguishable from a dead app. There is no
   * separate create-routine screen and there does not need to be: the editor
   * already owns the name, the exercise list and the order, so creating one is
   * "make an empty routine, then open the thing that edits routines".
   *
   * The routine is created BEFORE the editor opens rather than on Save, because
   * adding an exercise writes straight to the store (`appendToRoutine`), which
   * needs a routine to write into. `handleLeaveEditor` is what keeps that from
   * littering the list.
   */
  const handleAddRoutine = useCallback(() => {
    const routine = createRoutine();
    push({ name: 'routineEditor', routineId: routine.id, isNew: true });
  }, [createRoutine, push]);

  /**
   * Leaving the routine editor.
   *
   * A routine that was just created and still has nothing in it is a cancelled
   * create, not a routine — so it is removed on the way out. One with exercises in
   * it survives: those were already committed to the store when they were added,
   * and silently discarding them would be worse than an unsaved name.
   */
  const handleLeaveEditor = useCallback(
    (route: { routineId: ID; isNew?: boolean }) => {
      const routine = routinesById[route.routineId];
      if (route.isNew && routine && routine.items.length === 0) deleteRoutine(route.routineId);
      pop();
    },
    [deleteRoutine, pop, routinesById],
  );
  // Held in a ref so the back handler above — which is set up before this exists —
  // always calls the current one rather than a stale closure.
  leaveRoutineEditor.current = handleLeaveEditor;

  /**
   * Open the create flow, optionally pre-filed under a muscle group.
   *
   * Also opens that group's disclosure, so the new exercise is visible the moment
   * the user is dropped back on the library rather than hidden behind a chevron
   * they have to remember to tap.
   */
  const handleCreate = useCallback((name: string, muscle?: MuscleGroup) => {
    if (muscle) {
      const cluster = MUSCLE_CLUSTER[muscle];
      setExpanded((current) => new Set(current).add(muscleKey(muscle)).add(clusterKey(cluster)));
    }
    /*
     * Pushed through the updater rather than through `push`, so the route can read
     * what it is being pushed ON TOP OF. Creating an exercise from the session's
     * picker has to end up in the session — "add exercise, push, neck, add
     * exercise, name it, and start doing it" is one gesture from the user's side,
     * and the destination is carried rather than remembered in separate state.
     */
    setStack((s) => {
      const current = s[s.length - 1];
      return [
        ...s,
        {
          name: 'createExercise',
          /* A new exercise inherits the library-wide ladder setting: turning it
             on and then finding tomorrow's exercise without one is the setting
             quietly having stopped applying. Still a starting point — the create
             screen's own toggle is right there. */
          draft: emptyExerciseDraft(
            name,
            muscle,
            useSettings.getState().restSecondsBetweenSets,
            useSettings.getState().ladderAllExercises,
          ),
          addToSession: current?.name === 'addExercise' && current.target === 'session',
        },
      ];
    });
  }, []);

  /**
   * Append an exercise to the session in flight, with ONE set.
   *
   * Takes the row rather than an id because it is also called for an exercise
   * created a moment ago, which is not in `exercisesById` until the next render.
   *
   * One set by default: an exercise added mid-workout with nothing said about it
   * has no plan behind it — the user is deciding set by set, and `Add set` in the
   * card is one tap. The rest of the entry is built by the SAME function the routine
   * path uses, so the prefills, the overload verdict and the last-session lines are
   * identical to what a planned exercise would have shown.
   *
   * TWO EXCEPTIONS, and both are the user having already said how many:
   *
   *  • A SET COUNT ON THE EXERCISE (`defaultSets`, from the create/edit screen).
   *    Somebody who wrote "4 sets" on the movement meant it at the rack too, and
   *    handing them one set to then tap `Add set` three times is the app forgetting
   *    what it was told.
   *  • A LADDER, which arrives with its whole shape. A ladder is not a set, it is a
   *    session — one rung of `16 + 10 + 8 + 8 + 6` is a max effort with nothing
   *    after it.
   *
   * `defaultTargetSets` answers both, and answers 1 for neither.
   */
  const addExerciseToSession = useCallback(
    (exercise: Exercise) => {
      const workout = useActiveWorkout.getState();
      if (!workout.session) return;
      const settings = useSettings.getState();
      /*
       * WHAT IT PLANS ANYWHERE ELSE, which used to be "one set" here.
       *
       * The add-at-the-rack path only honoured a set count the exercise carried
       * itself (or a ladder's five) and fell back to a SINGLE row otherwise — so
       * an exercise added mid-session started as one set while the same exercise
       * appended to a routine started as four, and the difference was invisible
       * until the second set had to be added by hand at the rack. It is the same
       * question in both places, so it is the same answer: `defaultTargetSets`,
       * which is 4 for ordinary rep work and per-unit where four would be wrong.
       */
      const planned = defaultTargetSets(exercise);

      workout.addEntry(
        buildDraftEntry({
          exercise,
          history: historyById[exercise.id] ?? [],
          policy: seedUser.overloadPolicy,
          unitSystem: settings.unitSystem,
          // Its own rest if it has one, the setting otherwise — the same read the
          // routine path makes, so an exercise added at the rack rests exactly as
          // long as the same exercise planned into a routine. See `lib/rest.ts`.
          restSeconds: resolveRest(exercise, settings.restSecondsBetweenSets).seconds,
          transitionRestSeconds: settings.restSecondsBetweenExercises,
          bodyweightAtDate: (at) => bodyweightAt(settings.bodyweightLog, at),
          // For the deload suggestion, which must never name an unloadable weight.
          availablePlatesKg: platesInForce(settings),
          targetSets: planned,
          targetRepsMax: defaultTargetCount(exercise),
          plannedSetCount: planned,
          lang,
        }),
      );
    },
    [historyById, lang],
  );

  /**
   * A section's sparkle or chip. With a key that passed its test it opens that
   * section's chat — asking the chip's question, if a chip was tapped. Without
   * one it opens the AI settings, carrying both along, so the test's ready screen
   * can finish the trip the user started.
   */
  const openAi = useCallback(
    (section: AiSection, prompt?: string) => {
      if (useAi.getState().status === 'ready') push({ name: 'aiChat', section, prompt });
      else push({ name: 'aiSettings', from: section, prompt });
    },
    [push],
  );

  /**
   * `Add to routines` / `Apply changes`, from the card or the review screen —
   * the one write an AI suggestion makes, and its toast with the Undo. Here and
   * not in the chat, because the toast has to outlive the review screen that
   * raised it.
   */
  const acceptProposal = useCallback(
    (proposalId: string) => {
      // A second tap that lands before the buttons re-render: the first one
      // already applied it, and its Undo toast must not be replaced.
      if (useAi.getState().proposals[proposalId]?.status === 'accepted') return;
      const applied = applyProposal(proposalId);
      if (!applied) {
        setToast(t('Nothing left to apply'));
        return;
      }
      setToast(applied.message, { label: t('Undo'), onPress: applied.undo });
    },
    [setToast, t],
  );

  /*
   * The debrief's `Ask the assistant about it`. The sheet lives above the
   * navigation (`DebriefHost`), so it leaves the question in its store and the
   * shell — which owns the routes — opens the chat on it.
   */
  const debriefPrompt = useDebriefs((s) => s.aiPrompt);
  useEffect(() => {
    if (!debriefPrompt) return;
    useDebriefs.getState().clearAiPrompt();
    openAi('Workout', debriefPrompt);
  }, [debriefPrompt, openAi]);

  /* An AI routine stops saying so once its editor has been opened, too. */
  useEffect(() => {
    if (currentTop?.name === 'routineEditor') {
      useAi.getState().markRoutineSeen(currentTop.routineId);
    }
  }, [currentTop]);

  /* ------------------------------------------------------------------ */
  /* Pushed screens                                                      */
  /* ------------------------------------------------------------------ */

  /*
   * One route, as its screen. A function rather than early returns now, because
   * the stack is drawn OVER the sections (`PushHost`) and the screen under the
   * top one is rendered too while it peeks out of a push or an edge drag.
   */
  const renderPushed = (top: Route | null): ReactNode => {
    if (top?.name === 'aiSettings') {
      const route = top;
      return (
        <AiSettingsScreen
          from={route.from}
          onBack={pop}
          onOpenChat={(section) => {
            /* The ready screen's button: the settings screen is REPLACED by the
             chat, so back from the chat lands where the trip began. */
            setTab(section);
            replaceTop({ name: 'aiChat', section, prompt: route.prompt });
          }}
        />
      );
    }

    if (top?.name === 'aiChat') {
      const route = top;
      return (
        <View className="flex-1">
          <AiChatScreen
            key={route.section}
            section={route.section}
            prompt={route.prompt}
            /* Dropped from the route once sent, so coming back from the review
             screen does not ask it a second time. */
            onPromptSent={() => replaceTop({ name: 'aiChat', section: route.section })}
            onBack={pop}
            onReview={(proposalId) => push({ name: 'aiReview', proposalId })}
            onAccept={acceptProposal}
            onApplySequence={(messageId) => {
              const applied = applySequence(route.section, messageId);
              if (applied) setToast(applied.message, { label: t('Undo'), onPress: applied.undo });
            }}
          />
          {toast ? (
            <Toast key={toast.key} label={toast.text} action={toast.action} bottom={132} />
          ) : null}
        </View>
      );
    }

    if (top?.name === 'aiReview') {
      const route = top;
      return (
        <AiReviewScreen
          proposalId={route.proposalId}
          onBack={pop}
          onAccept={() => {
            pop();
            acceptProposal(route.proposalId);
          }}
          onDiscard={() => {
            discardProposal(route.proposalId);
            pop();
            setToast(t('Suggestion discarded'));
          }}
        />
      );
    }

    if (top?.name === 'session') {
      return (
        <View className="flex-1 bg-bg">
          {/* No nav bar. See the file header. The session slides in from the right
            — a workout is somewhere you GO, not a section you switch to — and
            that slide is `PushHost`'s. It used to be wrapped in its own
            `SlideIn` as well, which starts at opacity 0: every time the session
            was remounted under a pop (back from adding an exercise) the whole
            workout blanked and faded back in. */}
          <View className="flex-1">
            <ActiveWorkoutScreen
              unitSystem={unitSystem}
              /* What this workout will be saved as — `#92` in its header. One past the
             highest ordinal in the log, the same arithmetic Home uses. */
              workoutNumber={nextWorkoutNumber}
              /*
               * The plan this session was built from, so the Finish sheet can offer to
               * update it. Absent for a session with no routine behind it, which is
               * also the answer to "is there a plan to update".
               */
              routineItems={sessionRoutineId ? routinesById[sessionRoutineId]?.items : undefined}
              onAddExercise={() =>
                push({ name: 'addExercise', routineId: null, target: 'session' })
              }
              /*
               * `Edit exercise` on the open card. The same editor the Library tab
               * pushes, and the same route — so there is one screen that knows what an
               * exercise is, and it does not grow a second, session-flavoured copy. The
               * write back into the live session happens where the editor is handled
               * (`editExercise`, below), not here.
               */
              onEditExercise={(exerciseId) => push({ name: 'editExercise', exerciseId })}
              onFinish={(finished, updatePlan) => {
                /*
                 * The one write to permanent history. Everything downstream —
                 * the training history, the prefills, the overload verdicts — reads what
                 * this stores; nothing else in the app writes a logged set.
                 *
                 * A session with nothing logged stores nothing (`saveSession` returns
                 * null), so "start a workout, change your mind, finish" leaves no row
                 * claiming a workout happened.
                 */
                const saved = saveSession(finished);
                /*
                 * Everything below is a CONSEQUENCE of the save — the toast, the
                 * debrief, the loop, the ladders, the plan. Past this line the
                 * workout is on disk, so none of them may throw back into the
                 * finish: the screen reads a throw as "not saved" and keeps the
                 * session for another try, which would store the workout twice.
                 */
                try {
                  /*
                   * ...and Home, which is where this lands, says so: `Workout 92 saved`,
                   * with sparks from the hero and the new row growing into Recent. The
                   * number is read AFTER the save, from the log as it now is, so it is
                   * the number History will show rather than the one predicted for it.
                   */
                  if (saved) {
                    const history = useWorkoutHistory.getState();
                    const number = workoutNumbers(history.workouts, history.numbering)[saved.id];
                    setToast(
                      number != null ? t('Workout {number} saved', { number }) : t('Workout saved'),
                    );
                    setJustSaved({ id: saved.id, at: Date.now() });
                  }

                  /*
                   * ...and a few questions about how it went (`lib/debrief.ts`), if
                   * the user has not switched them off. Filed NOW, so a phone locked
                   * straight after Save still has it waiting on Home; opened a beat
                   * later, so the sparks and the toast land first and the sheet does
                   * not arrive on top of the celebration it follows.
                   */
                  if (saved && useSettings.getState().askAfterWorkout) {
                    useDebriefs.getState().offer(saved, DEBRIEF_DELAY_MS);
                  }
                  // The queue only moves when a workout from the step it is on actually
                  // gets recorded. A session with nothing logged saves nothing, and a
                  // workout from some other routine is not this step being done.
                  if (saved) advanceSequence(saved.routineId);

                  /*
                   * ...and the day's `Gym / Boxing` task answers itself.
                   *
                   * On the day the workout STARTED, not today: a session begun at
                   * 23:40 and finished after midnight is Tuesday's training, and the
                   * tick belongs on the square the calendar will draw it on.
                   *
                   * It never overrules a day already answered — see
                   * `tasksStore.tickAuto` — so a day marked "missed on purpose" that
                   * then turns into a workout keeps the mark the user chose.
                   */
                  if (saved) useTasks.getState().tickAuto('workout', dayKey(saved.startedAt));

                  /*
                   * ...and the rest of the phone is told a workout happened, if the user
                   * has switched that on and granted it.
                   *
                   * FIRE AND FORGET, deliberately: it is a `void` on a promise nobody
                   * awaits, it can fail in half a dozen ordinary ways (Health Connect not
                   * installed, permission revoked, provider gone), and none of them are
                   * worth a word on screen because the log is already on disk by this
                   * line. `lib/healthConnect.ts` has the argument for why it writes a
                   * session and nothing else.
                   */
                  if (saved && useSettings.getState().shareToHealthConnect) {
                    void writeWorkoutToHealthConnect(saved);
                  }

                  /*
                   * ...and every ladder that met its target moves up, one rep, without
                   * being asked.
                   *
                   * AUTOMATIC, unlike the routine's set count below it, and the
                   * difference is what the two things are: a routine is a template the
                   * user wrote, so rewriting it is a question, while a ladder is a
                   * progression they switched on precisely so it would advance on its
                   * own. A dialog asking permission to add the rep after every workout
                   * would be the app asking whether the user meant to train.
                   *
                   * `ladderOutcomes` is the whole decision — which sessions count as met,
                   * which set earns the rep, when the max itself moves — and it produces
                   * nothing at all for a session that came up short. The write goes
                   * against the row as the STORE has it rather than the snapshot the
                   * session was built from, so an exercise renamed mid-workout keeps its
                   * new name and only its ladder changes.
                   */
                  for (const outcome of ladderOutcomes(finished.entries)) {
                    const current = exercisesById[outcome.exerciseId];
                    if (!current) continue;
                    updateExercise(current.id, { ...current, ladder: outcome.after });
                  }

                  /*
                   * ...and only if the user asked, the plan learns what actually
                   * happened. Recomputed here rather than passed down as a list, so the
                   * write is against the routine as the STORE has it: the sheet's copy
                   * was rendered from a snapshot, and between rendering it and this line
                   * the routine could have been edited on another screen. The diff is the
                   * same pure function either way.
                   */
                  const routine = finished.routineId ? routinesById[finished.routineId] : undefined;
                  if (updatePlan && routine) {
                    const changes = plannedSetDiff(
                      routine.items,
                      performedSetCounts(finished.entries),
                    );
                    if (changes.length > 0) {
                      updateRoutine(routine.id, {
                        name: routine.name,
                        items: applyPlannedSetDiff(routine.items, changes),
                      });
                    }
                  }
                } catch (error) {
                  console.error('[finish] after the save', error);
                }
              }}
              onExit={leaveSession}
            />
          </View>
        </View>
      );
    }

    if (top?.name === 'routineEditor') {
      const route = top;
      const routine = routinesById[route.routineId];
      if (!routine) return <Fallback onBack={pop} />;
      return (
        <RoutineEditorScreen
          /* Keyed by the routine: `Duplicate` swaps the route to the copy with
           `replaceTop`, and without a key React reused the editor — its draft name
           and items still the ORIGINAL's, which the next Save wrote over the copy. */
          key={routine.id}
          routine={routine}
          exercisesById={exercisesById}
          /* The whole library, for the die — see `RoutineEditorScreenProps`. */
          library={exercises}
          defaultRestSeconds={restSecondsBetweenSets}
          isNew={route.isNew}
          /*
           * The rest row on a routine item edits the EXERCISE, so it writes to the
           * library here rather than into the routine draft — there is nothing about
           * it in the draft to save. Same shape as the removal above it: an edit that
           * could be lost by backing out would be the only one on that screen that
           * lies about what it did.
           */
          onPatchExercise={(exerciseId, fn) => {
            const current = exercisesById[exerciseId];
            if (current) updateExercise(exerciseId, fn(current));
          }}
          onBack={() => handleLeaveEditor(route)}
          onSave={(draft) => {
            updateRoutine(routine.id, draft);
            pop();
          }}
          /*
           * Both of these navigate, and this screen is rebuilt from the store when it
           * comes back — so the working draft is committed on the way out. Without
           * it, adding an exercise threw away a name that had just been typed while
           * keeping the exercise, because `appendToRoutine` writes to the store and
           * the name only lived in the screen. See the editor's file header.
           */
          onOpenItem={(item, draft) => {
            updateRoutine(routine.id, draft);
            push({ name: 'exerciseHistory', exerciseId: item.exerciseId });
          }}
          onAddExercise={(draft) => {
            updateRoutine(routine.id, draft);
            push({ name: 'addExercise', routineId: routine.id });
          }}
          /* Removing an exercise writes through immediately — see the editor. */
          onCommit={(draft) => updateRoutine(routine.id, draft)}
          /*
           * The draft is written back BEFORE the copy is taken, so the copy is of
           * what is on screen and not of what was on disk. Then the editor is
           * REPLACED by one pointed at the copy — pushed rather than swapped would
           * leave the original underneath, and backing out of the copy would land on
           * the routine the user has just finished with.
           */
          onDuplicate={(draft) => {
            updateRoutine(routine.id, draft);
            const copy = duplicateRoutine(routine.id);
            if (copy) replaceTop({ name: 'routineEditor', routineId: copy.id });
          }}
          onDelete={() => {
            deleteRoutine(routine.id);
            pop();
          }}
        />
      );
    }

    if (top?.name === 'addExercise') {
      const { routineId, target, workoutId } = top;
      return (
        <LibraryTab
          query={query}
          kicker={
            target === 'session'
              ? t('Add to workout')
              : target === 'history'
                ? t('Add to that workout')
                : t('Add exercise')
          }
          exercises={exercises}
          matches={matches}
          recentlyUsed={recentlyUsed}
          expanded={expanded}
          onToggleExpanded={toggleExpanded}
          onBack={() => {
            // Backing out of the picker reopens that workout too — see `onPick`.
            if (target === 'history' && workoutId) setFocusWorkoutId(workoutId);
            pop();
          }}
          onChangeQuery={setQuery}
          onPick={(exerciseId) => {
            if (target === 'session') {
              const exercise = exercisesById[exerciseId];
              if (exercise) addExerciseToSession(exercise);
              return popToSession();
            }
            if (target === 'history') {
              /*
               * Into a workout that already happened, with one set. Back to the
               * training history rather than to the picker, with the workout open
               * again — `focusWorkoutId` is set HERE, on the way back. Set on the
               * way out, the history consumed it while the picker slid over it, and
               * the history it came back to was a fresh mount with every row closed.
               */
              const exercise = exercisesById[exerciseId];
              if (exercise && workoutId) addWorkoutExercise(workoutId, exercise);
              if (workoutId) setFocusWorkoutId(workoutId);
              return pop();
            }
            // Every push of this route names a routine or a target; nothing else
            // can reach here, so there is nothing to append to.
            if (!routineId) return pop();
            appendToRoutine(routineId, exerciseId);
            return pop();
          }}
          onCreate={handleCreate}
          onDelete={setDeleting}
          deleting={deleting}
          onCancelDelete={() => setDeleting(null)}
          onConfirmDelete={deleteExercise}
          routineUses={(id) => routineUsageCount(routines, id)}
        />
      );
    }

    if (top?.name === 'createExercise') {
      const addToSession = top.addToSession === true;
      return (
        <CreateExerciseScreen
          initial={top.draft}
          settingsRestSeconds={restSecondsBetweenSets}
          onBack={pop}
          onSubmit={(draft) => {
            const exercise = draftToExercise(draft, `ex_${Date.now().toString(36)}`, seedUser.id);
            addExercise(exercise);
            /*
             * Created from the session's picker: it goes into the library AND into the
             * workout, and the user lands back on the set rows rather than on the
             * picker they no longer need. Both writes happen here so a new exercise
             * cannot end up in one place and not the other.
             */
            if (addToSession) {
              addExerciseToSession(exercise);
              popToSession();
              return;
            }
            pop();
          }}
        />
      );
    }

    if (top?.name === 'editExercise') {
      const exercise = exercisesById[top.exerciseId];
      if (!exercise) return <Fallback onBack={pop} />;
      return (
        <CreateExerciseScreen
          // Rebuilt from the row every time the screen opens, so what you see is what
          // is stored — including anything changed from somewhere else since.
          initial={exerciseToDraft(exercise, useSettings.getState().restSecondsBetweenSets)}
          mode="edit"
          settingsRestSeconds={restSecondsBetweenSets}
          onBack={pop}
          onSubmit={(draft) => {
            // In place, keeping the id: every set ever logged points at it, so the
            // history follows the rename instead of being orphaned by it.
            const next = applyDraftToExercise(draft, exercise);
            updateExercise(exercise.id, next);
            /*
             * ...AND INTO THE WORKOUT IN FLIGHT, if this movement is in one.
             *
             * The session carries its own copy of each exercise on purpose (see
             * `DraftEntry`), which is what stops an edit made in another tab from
             * repricing a workout under way. The edit made FROM that workout is the
             * one case where that protection is the bug: the user changed this
             * exercise's rest between two sets of it, and a rest that starts applying
             * next Tuesday is a control that did nothing. A no-op when no session
             * holds the movement.
             */
            useActiveWorkout.getState().syncExercise(exercise.id, next);
            pop();
          }}
        />
      );
    }

    if (top?.name === 'exerciseHistory') {
      const exercise = exercisesById[top.exerciseId];
      if (!exercise) return <Fallback onBack={pop} />;
      return (
        <ExerciseHistoryScreen
          exercise={exercise}
          history={historyById[exercise.id] ?? []}
          verdict={verdicts[exercise.id]}
          onBack={pop}
          /*
           * Tapping a session row here goes to that workout in History, which means
           * leaving the stack: this screen is pushed over the tabs, and opening a
           * row underneath it would be invisible. `popToRoot` rather than `pop`
           * because the exercise-history screen can itself be reached from the
           * routine editor, and History is not "back" from either of them.
           */
          onOpenSession={(sessionId) => {
            popToRoot();
            openWorkout(sessionId);
          }}
          onEdit={() => push({ name: 'editExercise', exerciseId: exercise.id })}
        />
      );
    }

    if (top?.name === 'sequence') {
      return (
        <SequenceScreen
          sequence={sequence}
          routines={routines}
          onBack={pop}
          onSetActive={setSequenceActive}
          onAddStep={addSequenceStep}
          onRemoveStep={removeSequenceStep}
          onMoveStep={moveSequenceStep}
          onSetCursor={setSequenceCursor}
          /*
           * Both of these land on the routine EDITOR, because "change what this step
           * contains" is editing a routine and there is one screen for that. Neither
           * passes `isNew`: a copy with six exercises in it is not an empty routine
           * somebody opened by accident, so backing out of it must not delete it.
           */
          onEditStep={(routineId) => push({ name: 'routineEditor', routineId })}
          onVaryStep={(index) => {
            const copy = varySequenceStep(index);
            if (copy) push({ name: 'routineEditor', routineId: copy.id });
          }}
        />
      );
    }

    /* ------------------------------------------------------------------ */
    /* Pushed from a section root, and the two logs' own detail screens    */
    /* ------------------------------------------------------------------ */

    if (top?.name === 'routines') {
      return (
        <RoutineListScreen
          routines={routines}
          exercisesById={exercisesById}
          sequence={sequence}
          onOpen={(routineId) => push({ name: 'routineEditor', routineId })}
          onStartWorkout={handleOpenWorkout}
          onCreate={handleAddRoutine}
          onOpenSequence={() => push({ name: 'sequence' })}
          onBack={pop}
        />
      );
    }

    if (top?.name === 'library') {
      return (
        <LibraryTab
          query={query}
          exercises={exercises}
          matches={matches}
          recentlyUsed={recentlyUsed}
          expanded={expanded}
          onToggleExpanded={toggleExpanded}
          onChangeQuery={setQuery}
          onBack={pop}
          onPick={(exerciseId) => push({ name: 'exerciseHistory', exerciseId })}
          onCreate={handleCreate}
          onDelete={setDeleting}
          deleting={deleting}
          onCancelDelete={() => setDeleting(null)}
          onConfirmDelete={deleteExercise}
          routineUses={(id) => routineUsageCount(routines, id)}
        />
      );
    }

    if (top?.name === 'workoutSettings') {
      return <WorkoutSettingsScreen onBack={pop} />;
    }

    if (top?.name === 'taskSettings') {
      return <TaskSettingsScreen onBack={pop} />;
    }

    if (top?.name === 'moneySettings') {
      return <MoneySettingsScreen onBack={pop} />;
    }

    if (top?.name === 'taskDetail') {
      const task = tasks.find((row) => row.id === top.taskId);
      if (!task) return <Fallback onBack={pop} />;
      return <TaskDetailScreen task={task} onBack={pop} />;
    }

    if (top?.name === 'moneyCategory') {
      const category = categories.find((row) => row.id === top.categoryId);
      const account = moneyAccounts.find((row) => row.id === top.accountId);
      if (!category || !account) return <Fallback onBack={pop} />;
      return (
        <View className="flex-1">
          <CategoryDetailScreen
            category={category}
            account={account}
            interval={top.interval}
            anchor={top.anchor}
            direction={moneyWindow.direction}
            onBack={pop}
            onOpenAmount={(amountId) =>
              push({ name: 'moneyAmount', amountId, categoryId: null, accountId: null })
            }
            /* The window this screen was opened with decides the day, exactly as the
             tile that opened it does. */
            onAddAmount={(day) =>
              push({
                name: 'moneyAmount',
                amountId: null,
                categoryId: category.id,
                accountId: account.id,
                // Added from the Incomes tile, it is an income — it was always
                // opened as an expense.
                direction: moneyWindow.direction,
                day,
              })
            }
          />
          {/* The keypad pops back HERE when it was opened from this screen, and the
            toast the tab root renders is not on screen to say so. */}
          {toast ? <Toast key={toast.key} label={toast.text} /> : null}
        </View>
      );
    }

    if (top?.name === 'moneyAmount') {
      const amount = top.amountId ? (amounts.find((row) => row.id === top.amountId) ?? null) : null;
      if (top.amountId && !amount) return <Fallback onBack={pop} />;
      return (
        <AmountEditorScreen
          amount={amount}
          categoryId={top.categoryId}
          accountId={top.accountId}
          direction={top.direction}
          day={top.day}
          onBack={(saved, summary) => {
            pop();
            if (saved) setToast(summary ?? (amount ? t('Saved') : t('Written down')));
          }}
        />
      );
    }

    /* ------------------------------------------------------------------ */
    /* The past of each section, behind its own ⟲                          */
    /* ------------------------------------------------------------------ */

    if (top?.name === 'workoutHistory') {
      return (
        <WorkoutHistory
          workouts={workouts}
          loadFailed={loadFailed}
          numbers={numbers}
          historyByExerciseId={historyById}
          exercisesById={exercisesById}
          focusWorkoutId={focusWorkoutId}
          onFocusHandled={clearFocusWorkout}
          unitSystem={unitSystem}
          onBack={pop}
          onDelete={deleteWorkout}
          onSetNumber={setWorkoutNumber}
          onEditSet={updateWorkoutSet}
          onDeleteSet={deleteWorkoutSet}
          onEditWorkout={editWorkout}
          onAddSet={addWorkoutSet}
          onRemoveExercise={deleteWorkoutExercise}
          onRestoreWorkout={restoreWorkout}
          /*
           * The one edit on that screen that needs navigation: the picker is another
           * pushed route, so the screen cannot open it itself. `focusWorkoutId` is
           * set on the way BACK (the picker's `onPick` and `onBack`), so the workout
           * is open again when the history reappears.
           */
          onAddExercise={(workoutId) => {
            push({ name: 'addExercise', routineId: null, target: 'history', workoutId });
          }}
        />
      );
    }

    if (top?.name === 'tasksHistory') {
      return (
        <TasksHistoryScreen
          selected={taskDay}
          onBack={pop}
          /* A square tapped is a day to ANSWER, so it lands on the screen where the
           circles are rather than leaving the grid open over it. */
          onPickDay={(day) => {
            setPinnedTaskDay(day);
            pop();
          }}
        />
      );
    }

    if (top?.name === 'moneyHistory') {
      const account = moneyAccounts.find((row) => row.id === top.accountId);
      if (!account) return <Fallback onBack={pop} />;
      return (
        <View className="flex-1">
          <MoneyHistoryScreen
            account={account}
            /* The day the money screen was reading when the ⟲ was tapped. */
            day={top.day}
            /* On the route rather than in the screen, so a trip into the editor and
             back returns to the day the list had stepped to. */
            onChangeDay={(day) => replaceTop({ ...top, day })}
            onBack={pop}
            /* A row of the day list is an amount, and the editor is where an amount
             is read and corrected — the same route the category screen pushes. */
            onOpenAmount={(amountId) =>
              push({ name: 'moneyAmount', amountId, categoryId: null, accountId: null })
            }
          />
          {/* Same: an amount corrected from the day list lands back here. */}
          {toast ? <Toast key={toast.key} label={toast.text} /> : null}
        </View>
      );
    }

    return null;
  };

  /* ------------------------------------------------------------------ */
  /* Tab roots                                                           */
  /* ------------------------------------------------------------------ */

  /* The landing's view of the training log: the routine whose turn it is. */
  const landingNext = inProgress
    ? { name: inProgress.title, focus: null }
    : (sequenceView?.next ?? choices.find((c) => c.exerciseCount > 0) ?? null);

  const renderRoot = (r: ShellRoute): ReactElement => {
    if (r === 'Home') {
      return (
        <LandingScreen
          nextWorkoutNumber={nextWorkoutNumber}
          nextWorkout={landingNext}
          workoutInProgress={inProgress != null}
          onOpen={(section, from) => navigate(section, { from })}
        />
      );
    }
    if (r === 'Workout') {
      return (
        <HomeScreen
          inProgress={inProgress}
          onResume={() => push({ name: 'session' })}
          sequence={sequenceView}
          choices={choices}
          recent={recent}
          numbers={numbers}
          onOpen={handleOpenWorkout}
          onOpenSequence={() => push({ name: 'sequence' })}
          // A past session opens where past sessions live. The history row is
          // the detail view — it expands in place — so there is nothing to push
          // beyond the history screen itself.
          onOpenSession={openWorkout}
          onOpenHistory={() => push({ name: 'workoutHistory' })}
          onOpenRoutines={() => push({ name: 'routines' })}
          onOpenLibrary={() => push({ name: 'library' })}
          aiReady={aiReady}
          onOpenAi={(prompt) => openAi('Workout', prompt)}
          justSaved={justSaved}
          onCelebrated={() => setJustSaved(null)}
        />
      );
    }
    if (r === 'Tasks') {
      return (
        <TasksScreen
          onOpenTask={(taskId) => push({ name: 'taskDetail', taskId })}
          onOpenHistory={() => push({ name: 'tasksHistory' })}
          /* The day lives HERE rather than in the screen: the month grid is a
                 pushed route, and a day picked in it has to survive the screen
                 that picked it being unmounted. */
          day={taskDay}
          onChangeDay={setPinnedTaskDay}
          aiReady={aiReady}
          onOpenAi={(prompt) => openAi('Tasks', prompt)}
        />
      );
    }
    if (r === 'Expenses') {
      return (
        <MoneyScreen
          /* The window lives here so a trip into the section's own past
                 comes back to the day it left from. See `moneyWindow`. */
          window={moneyWindow}
          onChangeWindow={changeMoneyWindow}
          onOpenCategory={(categoryId, accountId, interval, anchor) =>
            push({ name: 'moneyCategory', categoryId, accountId, interval, anchor })
          }
          onAddAmount={(categoryId, accountId, direction, day) =>
            push({
              name: 'moneyAmount',
              amountId: null,
              categoryId,
              accountId,
              direction,
              day,
            })
          }
          onOpenHistory={(accountId, anchor) =>
            push({ name: 'moneyHistory', accountId, day: anchor })
          }
          aiReady={aiReady}
          onOpenAi={(prompt) => openAi('Expenses', prompt)}
        />
      );
    }
    return (
      <SettingsHomeScreen
        onOpenWorkoutSettings={() => push({ name: 'workoutSettings' })}
        onOpenTaskSettings={() => push({ name: 'taskSettings' })}
        onOpenMoneySettings={() => push({ name: 'moneySettings' })}
        onOpenAiSettings={() => push({ name: 'aiSettings' })}
      />
    );
  };

  const top = stack[stack.length - 1] ?? null;
  const pushed = renderPushed(top);
  const beneath = () => renderPushed(stack[stack.length - 2] ?? null);
  const topKey = top ? `${stack.length}:${top.name}` : 'none';
  /* The key the screen under the top has, or had, as the top itself. */
  /* Nothing of the roots is on screen: a pushed screen covers them at rest. */
  const rootsCovered = !rootsVisible && stack.length > 0;
  const beneathKey =
    stack.length >= 2 ? `${stack.length - 1}:${stack[stack.length - 2].name}` : 'none';

  /* The section swipe: the screen follows, the blob stretches, release decides. */
  const onSwipeDrag = (dx: number) => {
    if (route === 'Home') return;
    swipeX.value = swipeFollow(dx, route);
    navDrag.value = Math.max(-1, Math.min(1, -dx / (screenWidth * 0.6)));
  };
  const onSwipeRelease = (dx: number, vx: number) => {
    if (route === 'Home') return;
    const step = swipeDecision(dx, vx, route);
    if (step === 0) {
      const spring = { duration: 460, easing: Easing.bezier(0.34, 1.3, 0.64, 1) };
      swipeX.value = withTiming(0, spring);
      navDrag.value = withTiming(0, spring);
      return;
    }
    navigate(stepSection(route, step), { dragFrom: swipeFollow(dx, route) });
  };

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />

      {/* A flick sideways is one section along, and the screen follows the
          finger while it decides. It claims a touch only for a clearly
          horizontal gesture, so every scroll, every row and the
          long-press-then-slide reorder inside these screens are untouched — see
          `components/SwipePager.tsx`. */}
      <View style={{ flex: 1, display: rootsCovered ? 'none' : 'flex' }}>
        {/* Covered roots also let go of their blurs — see `BlurGate`. */}
        <BlurGate.Provider value={!rootsCovered}>
          <Hold frozen={rootsCovered}>
            <SwipePager
              enabled={route !== 'Home' && stack.length === 0 && transition == null}
              onDrag={onSwipeDrag}
              onRelease={onSwipeRelease}
            >
              <ShellStage
                route={route}
                transition={transition}
                progress={progress}
                drag={swipeX}
                covered={covered}
                render={renderRoot}
              />
            </SwipePager>
          </Hold>
        </BlurGate.Provider>
      </View>

      <NavBar
        active={tab}
        /* A sheet being up hides it as well; the pill subscribes to that
           itself, so a sheet opening does not re-render the shell. */
        visible={route !== 'Home' && stack.length === 0}
        onSelect={selectTab}
        onHome={goHome}
        drag={navDrag}
      />

      <PushHost
        depth={stack.length}
        topKey={topKey}
        beneathKey={beneathKey}
        top={pushed}
        renderBeneath={beneath}
        covered={covered}
        onRootsVisible={setRootsVisible}
        onBack={() => leaveTop.current()}
      />

      {/* Last child, over the nav pill, and non-interactive: pressing the
          floating action twice in a row must still work while it is up. The
          pushed screens that raise toasts render their own. */}
      {toast && stack.length === 0 ? (
        <Toast key={toast.key} label={toast.text} action={toast.action} />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The training log's past: the sessions, the lines, or the days.
 *
 * PUSHED by the ⟲ on the workout section rather than owning a root, because it is
 * the past of one section and not a fourth section — the daily tasks and the
 * money each have exactly the same thing behind exactly the same glyph. The three
 * views are one question at three zoom levels, so they stay one screen with a
 * `Segmented` under the shared header, which is where all three screens' own
 * `toolbar` slot puts it: the control does not move as the view changes under it.
 *
 * Which view is showing is held HERE rather than in any of the three: it has to
 * survive switching between them, and none of them should know the others exist.
 */
function WorkoutHistory({
  workouts,
  loadFailed,
  numbers,
  historyByExerciseId: history,
  exercisesById,
  focusWorkoutId,
  onFocusHandled,
  unitSystem,
  onDelete,
  onSetNumber,
  onEditSet,
  onDeleteSet,
  onEditWorkout,
  onAddSet,
  onRemoveExercise,
  onRestoreWorkout,
  onAddExercise,
  onBack,
}: {
  workouts: CompletedWorkout[];
  loadFailed: boolean;
  numbers: Record<ID, number>;
  historyByExerciseId: Record<ID, SetHistory[]>;
  exercisesById: Record<ID, Exercise>;
  focusWorkoutId: ID | null;
  onFocusHandled: () => void;
  unitSystem: UnitSystem;
  onDelete: (id: ID) => void;
  onSetNumber: (id: ID, number: number) => void;
  onEditSet: HistoryScreenProps['onEditSet'];
  onDeleteSet: HistoryScreenProps['onDeleteSet'];
  onEditWorkout: HistoryScreenProps['onEditWorkout'];
  onAddSet: HistoryScreenProps['onAddSet'];
  onRemoveExercise: HistoryScreenProps['onRemoveExercise'];
  onRestoreWorkout: HistoryScreenProps['onRestoreWorkout'];
  onAddExercise: HistoryScreenProps['onAddExercise'];
  onBack: () => void;
}) {
  const t = useT();
  const [view, setView] = useState<'log' | 'graphs' | 'calendar'>('log');

  /*
   * A workout tapped ANYWHERE ELSE in the app lands on this tab expecting the log
   * — see `openWorkout`. The graphs view has no row to open, so without this the
   * tap looks like it did nothing, and `focusWorkoutId` is never handled: it sits
   * there and springs the row open the next time somebody switches to the log.
   * Switching the view here is what makes the two features compose; neither
   * branch could have caught it alone, because neither had both.
   */
  useEffect(() => {
    if (focusWorkoutId) setView('log');
  }, [focusWorkoutId]);

  const toolbar = (
    <View className="mt-md">
      <Segmented
        options={VIEWS.map((option) => ({ ...option, label: t(option.label) }))}
        value={view}
        onChange={setView}
        accessibilityLabel={t('Show the log or the graphs')}
      />
    </View>
  );

  if (view === 'graphs') {
    return (
      <ProgressScreen
        workouts={workouts}
        historyByExerciseId={history}
        exercisesById={exercisesById}
        toolbar={toolbar}
        onBack={onBack}
      />
    );
  }

  if (view === 'calendar') {
    return <CalendarScreen workouts={workouts} toolbar={toolbar} onBack={onBack} />;
  }

  return (
    <HistoryScreen
      onBack={onBack}
      workouts={workouts}
      /* So an unreadable log says so, instead of reading as an empty one. */
      loadFailed={loadFailed}
      numbers={numbers}
      exercisesById={exercisesById}
      focusWorkoutId={focusWorkoutId}
      onFocusHandled={onFocusHandled}
      unitSystem={unitSystem}
      onDelete={onDelete}
      onSetNumber={onSetNumber}
      onEditSet={onEditSet}
      onDeleteSet={onDeleteSet}
      onEditWorkout={onEditWorkout}
      onAddSet={onAddSet}
      onRemoveExercise={onRemoveExercise}
      onRestoreWorkout={onRestoreWorkout}
      onAddExercise={onAddExercise}
      toolbar={toolbar}
    />
  );
}

/*
 * Three views of one log: the sessions, the lines, and the days. `Cal` rather than
 * `Calendar` because three labels have to fit a 360 dp segmented control, and the
 * screen it opens says the word in full.
 */
// English keys, translated where they are rendered: `Segmented` prints labels as
// given, so these reached a Russian phone in English.
const VIEWS = [
  { value: 'log' as const, label: 'Log' },
  { value: 'graphs' as const, label: 'Graphs' },
  { value: 'calendar' as const, label: 'Cal' },
];

type LibraryProps = React.ComponentProps<typeof ExerciseLibraryScreen>;

/**
 * The library plus its delete confirmation.
 *
 * Wrapped rather than inlined because the library appears in two places — the tab
 * root and the picker pushed from a routine editor — and the confirmation has to
 * behave identically in both. Deleting an exercise edits every routine that holds
 * it, so the sheet's copy is written HERE, where the routine count is known,
 * rather than in a screen whose job is to render a list.
 */
function LibraryTab({
  deleting,
  onCancelDelete,
  onConfirmDelete,
  routineUses,
  ...libraryProps
}: LibraryProps & {
  deleting: Exercise | null;
  onCancelDelete: () => void;
  onConfirmDelete: (exerciseId: ID) => void;
  routineUses: (exerciseId: ID) => number;
}) {
  const t = useT();
  const countedRoutines = usePlural();
  const uses = deleting ? routineUses(deleting.id) : 0;

  return (
    <View className="flex-1">
      <View className="flex-1" style={deleting ? { opacity: 0.28 } : undefined}>
        <ExerciseLibraryScreen {...libraryProps} />
      </View>

      {deleting ? (
        <ConfirmSheet
          tone="danger"
          title={t('Delete “{title}”?', { title: deleting.name })}
          body={[
            uses > 0
              ? t('It is in {count} {routines}, and will be removed from them.', {
                  count: uses,
                  routines: countedRoutines(uses, {
                    one: t('routine'),
                    few: 'программы',
                    many: t('routines'),
                  }),
                })
              : t('It is not in any routine.'),
            t('Sets you already logged stay in your history.'),
          ].join(' ')}
          confirmLabel={t('Delete it')}
          cancelLabel={t('Keep it')}
          onConfirm={() => {
            onConfirmDelete(deleting.id);
            onCancelDelete();
          }}
          onCancel={onCancelDelete}
        />
      ) : null}
    </View>
  );
}

/**
 * A pushed route whose subject was deleted underneath it.
 *
 * It used to pop itself in an effect, which is the right instinct and the wrong
 * mechanism: mount, unmount, one frame of an empty screen — indistinguishable from
 * a tap that did nothing, and a real "blink" bug when a route was pushed for a
 * routine that had already been deleted. Callers now refuse to push such a route in
 * the first place (see `handleSelectDay`), so reaching this screen means the
 * subject vanished WHILE it was open — deleted from another tab. That deserves a
 * sentence and a button, not a flicker.
 */
function Fallback({ onBack }: { onBack: () => void }) {
  const t = useT();
  return (
    <View className="flex-1 items-center justify-center bg-bg px-xl">
      <Text className="text-title font-medium text-ink">{t('It is gone')}</Text>
      <Text className="mt-sm text-center text-body text-ink-muted">
        {t('This was deleted while you were looking at it.')}
      </Text>
      <View className="mt-xl w-full">
        <PrimaryButton label={t('Back')} variant="ghost" onPress={onBack} />
      </View>
    </View>
  );
}
