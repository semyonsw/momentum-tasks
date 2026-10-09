/**
 * TasksScreen — the day, and nothing but the day.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ DAILY TASKS                           ✦  ⟲   │
 *   │               ╭───────╮                      │
 *   │           ‹   │ TODAY │   ›                  │   the day dial, 132 dp: the
 *   │               │  13   │                      │   date inside the day's
 *   │               ╰───────╯                      │   fraction
 *   │      (6 done) (2 left) ┆1 on purpose┆        │
 *   │ ╭────────────────────────────────────────╮   │
 *   │ │ ✓  Morning Bible reading      (🜂 12) › │   │  lit — this one is done
 *   │ ╰────────────────────────────────────────╯   │
 *   │ ╭────────────────────────────────────────╮   │
 *   │ │ ○  Evening Bible reading             › │   │
 *   │ ╰────────────────────────────────────────╯   │
 *   │ ( ✦ Ask about your habits             ✕ )    │  until closed or used
 *   │ Tap a circle to mark it done. Hold a row…    │
 *   │                                     ( + )    │
 *   └──────────────────────────────────────────────┘
 *
 * ── THE DIAL IS THE DAY ───────────────────────────────────────────────────
 *
 * The date used to be a line of text with a pager either side of it, a 6px
 * progress bar under that, and a count under THAT: three separate objects, in
 * reading order, none of them the thing the app is opened for. They are one
 * object now — `components/DayDial.tsx` — with the date drawn inside the
 * fraction, with a halo that brightens as the day fills. The counts stayed, as
 * three pills under it, because a ring cannot say `6 of 8` and that is what you
 * tell somebody when they ask.
 *
 * ── THE LIST IS ABOVE THE FOLD (U1) ───────────────────────────────────────
 *
 * The dial was 196 dp with the weekday on its own line under it and the
 * assistant's card under that: about 500 dp before the first row, so a phone at
 * 360 × 800 showed two or three rows of the list it was opened for. The dial is
 * 132 now with the weekday inside it, rows are 60 rather than 74, and the
 * assistant's card moved UNDER the list (and can be closed — U2). Six to seven
 * rows fit on that phone. Rejected: collapsing the dial into the bubble past four rows —
 * the dial is the day's one picture, and a screen whose top changes shape with
 * the length of the list is a screen you have to re-read every morning.
 *
 * ── THE CIRCLE IS THE SCREEN ──────────────────────────────────────────────
 *
 * Everything else here is a label on it. A tap toggles done ↔ unanswered (U6);
 * `missed on purpose` — the state that makes the other two mean anything,
 * because without a way to say "I chose not to" a habit list can only report
 * failure (`lib/tasks.ts`) — is a sentence in the row's HOLD MENU, with an Undo
 * toast. It used to be one tap past done, so a double tap excused a day without
 * anybody seeing it happen; `lib/taskTap.ts` has the rule. `on purpose` leaves
 * the denominator entirely, so the ring reads `done / (asked − excused)`.
 *
 * The mark's tap target is 62 × 60 inside a 60-high card; tapping the rest of
 * the row opens that one task's own screen. Only the left column toggles.
 *
 * ── THE THREE STATES ARE THREE SURFACES ───────────────────────────────────
 *
 * Unanswered is `card` glass, done is a LIT pane with a repeating halo, and `on
 * purpose` is a DASHED outline at 72% — the same dashed vocabulary the app uses
 * for "a slot rather than a thing", because a day excused on purpose is exactly
 * that. None of the three needs colour to be told apart from the others, which
 * is what makes the list readable at arm's length.
 *
 * ── AND NONE OF THEM IS BLURRED ───────────────────────────────────────────
 *
 * `BlurView` is not free and this is the one screen that can ask for ten of
 * them at once, in a list, on the screen opened every single day. The design's
 * own fallback was "blur the done rows only"; this goes one step further and
 * flattens all of them, because a pane already 94% opaque has nothing left
 * behind it to see. The tint, the border and the halo are what say `done`. The
 * blur budget is spent on the two bars, which is where the glass does its
 * actual work — see `components/glass.tsx`.
 *
 * ── HOLD A ROW FOR ITS MENU; `Move` LIFTS IT ──────────────────────────────
 *
 * The hold used to lift the row straight away. It opens a menu now — Skip today,
 * Move, Open — so the skip has somewhere to live that a stray tap cannot reach,
 * and the reorder is still there, one word further in. `Move` puts the row in
 * the air with the same hook and the same `Drop` escape as the routine editor
 * and the logging screen: `hooks/useDragReorder.ts`. What is different
 * here is what is on screen — the day shows only the tasks that ASKED for
 * something, so a Mon/Wed/Fri row is genuinely absent on a Tuesday, and dragging
 * the third visible row to the top has to mean third VISIBLE row. That is
 * `reorderWithinVisible` in `lib/tasks.ts`, and the whole reason the store takes
 * the visible ids rather than a bare index.
 *
 * ── THE DAY CLOSING IS THE ONE CELEBRATION ────────────────────────────────
 *
 * When the last unanswered task is answered and at least one of them was done,
 * fourteen sparks leave the dial (`components/SparkBurst.tsx`). Once per day,
 * never on a ✓ that still leaves something open, and never on a day closed
 * entirely by `on purpose`.
 *
 * ── THE MONTH AND THE TREND LEFT ──────────────────────────────────────────
 *
 * It was `Day | Month | Trend` across the top, which meant two thirds of a
 * control the user passes through every time to reach the one thing they open the
 * app for. The other two are behind the ⟲ in the corner now
 * (`TasksHistoryScreen`). `Day` stopped being a view and became this screen.
 *
 * The day itself is a PROP. The month grid is a pushed screen, and a day picked
 * in it has to outlive the screen that picked it — so `AppShell` holds it.
 *
 * ── THE PAGER GOES BACKWARDS, AND ONLY BACKWARDS ──────────────────────────
 *
 * You can walk to any past day and answer it — a day you forgot to open the app
 * on is exactly the day worth answering late. You cannot walk into tomorrow:
 * there is nothing there to tick, and a screen offering to let you tick it would
 * be offering to lie. The `›` is at 25% on today rather than absent, so the dial
 * does not shift sideways when you step back to yesterday.
 *
 * ── THE MOTION PASS ───────────────────────────────────────────────────────
 *
 *   • The done / left counts ROLL, and so does each row's streak.
 *   • The mark sinks to 0.88 under the thumb — it is pressed without being
 *     looked at, so the press has to be felt in the finger's own movement.
 *   • THE DAY BUBBLE. Scroll the dial away and a small copy of it follows you at
 *     the top: a mini ring, the date, `3 of 6 done` and the share. Ticking a row
 *     while scrolled down refills it, rolls its numbers and grows its halo with
 *     the day; at 100% the share fills with the theme gradient. Tapping it scrolls
 *     back up.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Pressable } from '../components/Pressable';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';

import { DayDial } from '../components/DayDial';
import { FloatingBubble, useHeroRecede } from '../components/FloatingBubble';
import { RollingNumber, RollingPhrase } from '../components/RollingNumber';
import { FADE_ON, RunningText } from '../components/RunningText';
import { useBubbleOnScroll } from '../hooks/useBubbleOnScroll';
import { useArrived } from '../hooks/useArrived';
import { useMotionScale } from '../hooks/useMotionScale';
import { Icon } from '../components/Icon';
import { ReorderRow } from '../components/ReorderRow';
import { SectionTopBar } from '../components/SectionTopBar';
import { AiEntryCard } from '../components/AiEntryCard';
import { SparkBurst, SPARK_MS } from '../components/SparkBurst';
import { PauseSheet, raisePauseToast } from '../components/PauseSheet';
import { ProgressRing } from '../components/ProgressRing';
import { StreakFlame } from '../components/StreakFlame';
import { habitStrength, strengthPercent } from '../lib/habitStrength';
import {
  CommitMark,
  FloatingAction,
  GlassSurface,
  Lamps,
  useBarInsets,
  type ToastAction,
} from '../components/glass';
import { pressedStyle, usePressScale } from '../components/motion';
import { Kicker, Separator, TextButton } from '../components/primitives';
import { NumberSheet } from '../components/NumberSheet';
import { Sheet } from '../components/Sheet';
import { TaskEditorSheet } from '../components/TaskEditorSheet';
import { useDragReorder, type CardLayout } from '../hooks/useDragReorder';
import { useLanguage, useT } from '../hooks/useT';
import {
  dayKey,
  formatLongDay,
  formatShortDay,
  monthNames,
  parseDay,
  shiftDay,
  weekdayIndex,
  weekdayLabels,
  weekdayNames,
} from '../lib/days';
import {
  type Task,
  type TaskMark,
  asksOn,
  dayProgress,
  describeProgress,
  describeTaskRow,
  entryOf,
  isCounted,
  progressOf,
  streakOf,
  tasksOn,
  unitOf,
  upcomingOnce,
  weekProgress,
  type WeekProgress,
} from '../lib/tasks';
import type { Language } from '../lib/i18n';
import { showTasksHint, taskRowActions, tasksEmptyState, type TaskRowAction } from '../lib/taskTap';
import { mixSrgb } from '../lib/theme';
import { useTasks } from '../state/tasksStore';
import {
  curve,
  focalType,
  glass,
  gradientFill,
  motion,
  palette,
  radius,
  textGlow,
  tint,
} from '../theme/tokens';
import type { ID } from '../types/models';

interface TasksScreenProps {
  onOpenTask: (taskId: ID) => void;
  /** The ⟲ in the corner: the month grid and the habit line. */
  onOpenHistory: () => void;
  /** The day the grid last sent back, so opening a square lands here. */
  day: string;
  onChangeDay: (day: string) => void;
  /** A key has passed its test: the sparkle is lit. */
  aiReady: boolean;
  /** The habits chat, asking `prompt` if a chip was tapped. */
  onOpenAi: (prompt?: string) => void;
  /** The shell's toast — the skip says what it did there, with an Undo. */
  onToast: (text: string, action?: ToastAction) => void;
}

export function TasksScreen({
  onOpenTask,
  onOpenHistory,
  day,
  onChangeDay,
  aiReady,
  onOpenAi,
  onToast,
}: TasksScreenProps) {
  const t = useT();
  const lang = useLanguage();
  const tRef = useRef(t);
  tRef.current = t;
  const langRef = useRef(lang);
  langRef.current = lang;
  const tasks = useTasks((s) => s.tasks);
  const log = useTasks((s) => s.log);
  const toggleMark = useTasks((s) => s.toggleMark);
  const tapCount = useTasks((s) => s.tapCount);
  const setCount = useTasks((s) => s.setCount);
  const restoreEntry = useTasks((s) => s.restoreEntry);
  const setMark = useTasks((s) => s.setMark);
  const addTask = useTasks((s) => s.addTask);
  const reorderTasks = useTasks((s) => s.reorderTasks);

  const bars = useBarInsets();
  const today = dayKey(new Date());
  const [adding, setAdding] = useState(false);
  /** The row whose hold menu is up. */
  const [menuFor, setMenuFor] = useState<ID | null>(null);
  /** The pause sheet, opened from the hold menu (T3). */
  const [pausing, setPausing] = useState(false);
  /** The counted row whose "Set a number…" sheet is up (T1). */
  const [countingFor, setCountingFor] = useState<ID | null>(null);
  const unpause = useTasks((s) => s.unpause);

  const rows = useMemo(() => tasksOn(tasks, day), [tasks, day]);
  const liveTasks = useMemo(() => tasks.filter((task) => task.archivedAt === null).length, [tasks]);
  const empty = tasksEmptyState(liveTasks, rows.length);
  const progress = dayProgress(tasks, log, day);
  const isToday = day === today;

  /*
   * How many of the day's rows are still unanswered, and how many were excused.
   * Both are derived rather than stored — the same rule `dayProgress` follows,
   * and the counts row would otherwise be a second opinion about the ring.
   */
  const excused = useMemo(
    () =>
      tasks.filter((task) => asksOn(task, day) && entryOf(log, task.id, day).mark === 'missed')
        .length,
    [tasks, log, day],
  );
  const open = progress.total - progress.done;

  /*
   * THE DAY CLOSING, and why it is a ref and not a piece of state.
   *
   * The burst has to fire on the TRANSITION into a closed day, not on every
   * render of one — otherwise walking back to a finished Tuesday would throw
   * confetti at somebody reading their own history. So the last value is
   * remembered per day, and the effect only fires when a day that was open
   * becomes closed while you are looking at it.
   */
  const closed = progress.total > 0 && open === 0 && progress.done > 0;
  const wasClosed = useRef<{ day: string; closed: boolean }>({ day, closed });
  const [celebrating, setCelebrating] = useState(false);
  /* Built ahead and still hidden, it only keeps count: a day closed from
     elsewhere is not one closed while you are looking at it. */
  const arrived = useArrived();
  useEffect(() => {
    const previous = wasClosed.current;
    wasClosed.current = { day, closed };
    if (!arrived || previous.day !== day) return;
    if (closed && !previous.closed) setCelebrating(true);
  }, [arrived, closed, day]);
  useEffect(() => {
    if (!celebrating) return;
    const timer = setTimeout(() => setCelebrating(false), SPARK_MS);
    return () => clearTimeout(timer);
  }, [celebrating]);

  /*
   * The one-day tasks that have not come round yet. Only on TODAY: on a past day
   * this would be a list of things that had not happened then either, which is
   * a sentence about nothing.
   */
  const upcoming = useMemo(
    () => (isToday ? upcomingOnce(tasks, today) : []),
    [isToday, tasks, today],
  );

  /*
   * Everything each row draws, computed once per change rather than once per
   * render.
   *
   * `streakOf` walks backwards a day at a time to the start of the run, so on a
   * task answered every day since January it is by some distance the most
   * expensive thing on this screen — and the screen re-renders on every mark, on
   * every frame of a drag, and whenever the day changes under it. Ten rows
   * recomputing a year of history each time is what makes a list feel heavy for
   * no reason anybody can point at.
   */
  const rowViews = useMemo(
    () =>
      rows.map((task) => ({
        task,
        mark: entryOf(log, task.id, day).mark,
        // T1: how far a counted row got today, and of what. Null on a plain row.
        progress: progressOf(task, entryOf(log, task.id, day)),
        // T2: a weekly row's week — its pips, and the flame's unit.
        week: weekProgress(task, log, day),
        streak: streakOf(task, log, day),
        // T4: the 22 dp ring beside the flame — as of the day on screen, like
        // the streak. Null for a one-day task, which then draws no ring.
        strength: habitStrength(task, log, day),
        // `false`: the flame beside the row already says the number, and saying
        // it twice in one 72 dp card makes both copies read as decoration.
        detail: describeTaskRow(task, log, day, lang, false),
      })),
    [rows, log, day, lang],
  );

  /* The drag: the same hook and the same geometry as every other reorder here. */
  const rowLayouts = useRef<Record<ID, CardLayout>>({});
  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const { lifted, dragY, targetIndex, panHandlers, lift, drop, shiftFor } = useDragReorder(
    rowIds,
    rowLayouts,
    (id, toIndex) => reorderTasks(rowIds, id, toIndex),
  );
  const liftedTask = lifted ? (rows.find((row) => row.id === lifted) ?? null) : null;

  /*
   * The rows' handlers, stable and handed the task's id, so `TaskRow` can be
   * memoized: a mark re-renders the row it landed on rather than every row with
   * its flame, its marquee and its press spring. `onOpenTask` comes from the
   * shell as a fresh closure on each of its renders, so it is read through a ref.
   */
  const openTask = useRef(onOpenTask);
  openTask.current = onOpenTask;
  /*
   * The circle's tap. A plain row toggles and says nothing — the tap is its own
   * undo. A COUNTED row (T1) adds a part, and from a finished day goes back to
   * zero, which a second tap cannot reverse; so it says the new count in the
   * toast with an Undo that puts the entry back exactly. Read through refs so
   * the callback stays stable for the memoized rows.
   */
  const toastRef = useRef(onToast);
  toastRef.current = onToast;
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const toggleRow = useCallback(
    (taskId: ID) => {
      const task = tasksRef.current.find((row) => row.id === taskId);
      if (!task || !isCounted(task)) {
        toggleMark(taskId, day);
        return;
      }
      const before = tapCount(taskId, day);
      if (!before) return;
      const after = entryOf(useTasks.getState().log, taskId, day);
      toastRef.current(`${task.name} · ${describeProgress(task, after, langRef.current)}`, {
        label: tRef.current('Undo'),
        onPress: () => restoreEntry(taskId, day, before),
      });
    },
    [toggleMark, tapCount, restoreEntry, day],
  );
  const openRow = useCallback((taskId: ID) => openTask.current(taskId), []);
  const holdRow = useCallback((taskId: ID) => setMenuFor(taskId), []);

  /*
   * The hold menu's answers. The skip is the only one that writes, and it says
   * so in the toast with the mark it replaced ready to put back — `setMark`
   * with the old value, so the Undo restores a `done` as a `done` and leaves
   * the day's note alone either way.
   */
  const menuTask = menuFor ? (rows.find((row) => row.id === menuFor) ?? null) : null;
  const countingTask = countingFor ? (rows.find((row) => row.id === countingFor) ?? null) : null;
  const menuMark = menuTask ? entryOf(log, menuTask.id, day).mark : null;
  const onMenu = (action: TaskRowAction) => {
    if (!menuTask) return;
    const taskId = menuTask.id;
    setMenuFor(null);
    if (action === 'skip') {
      const before = menuMark;
      setMark(taskId, day, 'missed');
      onToast(
        isToday
          ? t('Skipped today, on purpose. The streak keeps.')
          : t('Skipped on purpose. The streak keeps.'),
        { label: t('Undo'), onPress: () => setMark(taskId, day, before) },
      );
    } else if (action === 'unskip') setMark(taskId, day, null);
    else if (action === 'count') setCountingFor(taskId);
    else if (action === 'pause') setPausing(true);
    else if (action === 'move') lift(taskId);
    else openRow(taskId);
  };

  /* The day bubble, and the dial stepping back while it is up. */
  const {
    visible: bubbleUp,
    fabHidden,
    onScroll,
    scrollRef,
    scrollToTop,
  } = useBubbleOnScroll(BUBBLE_SHOW, BUBBLE_HIDE);
  const heroRecede = useHeroRecede(bubbleUp);

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />
      <Lamps section="Tasks" />

      {/* The ⟲ goes while a row is in the air: leaving the screen mid-drag would
          unmount the row under the finger, and there is one thing to do. */}
      <SectionTopBar
        title={t('Daily tasks')}
        onOpenHistory={lifted ? undefined : onOpenHistory}
        historyLabel={t('Task history')}
        /* Gone mid-drag too, for the same reason as the ⟲. */
        actions={
          lifted
            ? []
            : [
                {
                  key: 'ai',
                  icon: 'sparkle',
                  label: t('Open the AI assistant'),
                  lit: aiReady,
                  onPress: () => onOpenAi(),
                },
              ]
        }
      />

      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        className="flex-1"
        contentContainerStyle={{ paddingTop: bars.top, paddingBottom: bars.bottom }}
        showsVerticalScrollIndicator={false}
        // The list must not scroll under a row that is in the air.
        scrollEnabled={lifted == null}
      >
        {lifted && liftedTask ? (
          <View className="mx-lg mt-lg items-center">
            <Kicker tone="green">
              {t('Moving')} · {liftedTask.name}
            </Kicker>
            <Text className="mt-xs text-label tabular-nums text-ink-muted">
              {t('Slide to move it · position {at} of {of}', {
                at: targetIndex + 1,
                of: rows.length,
              })}
            </Text>
            <Pressable
              onPress={drop}
              accessibilityRole="button"
              accessibilityLabel={t('Drop it here')}
              style={pressedStyle}
              className="mt-sm h-hit justify-center px-lg"
            >
              <Text className="text-label font-semibold text-green-bright">{t('Drop')}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* THE DAY DIAL. The date is inside the fraction rather than above
                it: one object answering "what day, and how did it go" instead of
                a pager, a bar and a sentence stacked in reading order. */}
            <Animated.View
              style={[
                { marginTop: 8, flexDirection: 'row', alignItems: 'center' },
                { justifyContent: 'center', paddingHorizontal: 16 },
                heroRecede,
              ]}
            >
              <Pressable
                onPress={() => onChangeDay(shiftDay(day, -1))}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('The day before')}
                style={pressedStyle}
                className="h-[44px] w-[48px] items-center justify-center"
              >
                <Icon name="chevron-left" size={22} color={palette.inkMuted} />
              </Pressable>

              <View
                accessibilityRole="progressbar"
                accessibilityLabel={`${formatLongDay(day, lang)}. ${
                  progress.total === 0
                    ? t('Nothing asked for today')
                    : t('{done} of {total} done', {
                        done: progress.done,
                        total: progress.total,
                      })
                }`}
              >
                <DayDial fraction={progress.fraction} size={DIAL} stroke={DIAL_STROKE}>
                  {/* The weekday moved INSIDE (it was a kicker line under the
                      dial): one object, and 30 dp of the fold back. */}
                  <View className="items-center">
                    <Text
                      maxFontSizeMultiplier={1.15}
                      numberOfLines={1}
                      style={{ fontSize: 12.5, letterSpacing: 1.1, maxWidth: DIAL - 28 }}
                      className={[
                        'font-semibold uppercase',
                        isToday ? 'text-green-bright' : 'text-ink-faint',
                      ].join(' ')}
                    >
                      {isToday ? t('Today') : weekdayName(day, lang)}
                    </Text>
                    <Text
                      allowFontScaling={false}
                      style={[focalType.dayDial, textGlow.hero]}
                      className="font-semibold tabular-nums text-ink"
                    >
                      {dayNumber(day)}
                    </Text>
                    <Text
                      maxFontSizeMultiplier={1.15}
                      style={{ fontSize: 12.5, letterSpacing: 1.1 }}
                      className="mt-[2px] font-semibold uppercase tabular-nums text-ink-faint"
                    >
                      {monthLabel(day, lang)}
                    </Text>
                  </View>
                </DayDial>
              </View>

              <Pressable
                onPress={() => onChangeDay(shiftDay(day, 1))}
                disabled={isToday}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('The day after')}
                accessibilityState={{ disabled: isToday }}
                // 25% rather than absent: a chevron that vanishes on today would
                // shift the dial sideways every time you step back a day.
                //
                // A plain object and not the `pressedStyle` callback — see
                // `components/bubbles.tsx` on why a function in this prop never
                // reaches the native view.
                style={isToday ? { opacity: 0.25 } : undefined}
                className="h-[44px] w-[48px] items-center justify-center"
              >
                <Icon name="chevron-right" size={22} color={palette.inkMuted} />
              </Pressable>
            </Animated.View>

            {/* Three pills, and the third is dashed for the same reason the card
                below it is: an excused day is a slot the user deliberately left
                empty, not a thing that happened. A day with no rows has no
                pills at all — the empty state below says it, once (U13). */}
            {empty === null ? (
              <View className="mt-md flex-row items-center justify-center px-lg">
                <CountPill template={t('{count} done')} count={progress.done} tone="done" />
                {open > 0 ? (
                  <CountPill template={t('{count} left')} count={open} tone="left" />
                ) : null}
                {excused > 0 ? (
                  <CountPill template={t('{count} on purpose')} count={excused} tone="excused" />
                ) : null}
              </View>
            ) : null}
          </>
        )}

        {/* The drag surface — its own View around the rows rather than a row
            itself, because a `ReorderRow` takes props it understands and would
            drop these on the floor. It claims a touch only while a row is
            lifted.

            ONE CARD PER ROW, with 8px of air between them. A done task is a lit
            pane, and a lit pane needs an edge of its own to be lit against. The
            gap is padding INSIDE each row's measured box, so the reorder's
            geometry still adds up. 16 above it — card to card is the rhythm's
            short step; the old 24 read as a new section starting. */}
        <View {...panHandlers} className="mx-lg mt-md">
          {rowViews.map(({ task, mark, progress, week, streak, strength, detail }) => {
            const isLifted = task.id === lifted;
            return (
              <ReorderRow
                key={task.id}
                lifted={isLifted}
                dragging={lifted != null}
                dragY={dragY}
                // The row slides out of the way while the finger is still over
                // the gap, so the drop is something you can see coming.
                shift={shiftFor(task.id)}
                onLayout={(e) => {
                  const { y, height } = e.nativeEvent.layout;
                  rowLayouts.current[task.id] = { y, height };
                }}
              >
                <View className="pb-sm">
                  <TaskRow
                    task={task}
                    mark={mark}
                    progress={progress}
                    week={week}
                    streak={streak}
                    strength={strength}
                    detail={detail}
                    dimmed={lifted != null && !isLifted}
                    onToggle={toggleRow}
                    onOpen={openRow}
                    // The hold menu: skip, move, open. Not while a row is in
                    // the air — the rows take no touches then anyway.
                    onLongPress={lifted ? undefined : holdRow}
                  />
                </View>
              </ReorderRow>
            );
          })}
        </View>

        {empty === 'first' ? <FirstTaskCard onPress={() => setAdding(true)} /> : null}
        {empty === 'quiet' ? (
          <Text className="mx-lg mt-lg text-center text-label text-ink-muted">
            {t('Nothing is scheduled for this day.')}
          </Text>
        ) : null}

        {/* Stated, not listed as rows: there is no circle, because a day that
            has not arrived cannot be answered. See `upcomingOnce`. */}
        {!lifted && upcoming.length > 0 ? (
          <View className="mx-lg mt-kicker">
            <Kicker className="mb-kicker-gap">{t('Coming up')}</Kicker>
            {upcoming.map((task, index) => (
              <Text
                key={task.id}
                numberOfLines={1}
                className={[
                  index > 0 ? 'mt-sm' : '',
                  'text-label tabular-nums text-ink-muted',
                ].join(' ')}
              >
                {task.name}
                <Text className="text-ink-faint">
                  {'  ·  '}
                  {task.schedule.kind === 'once' ? formatLongDay(task.schedule.day, lang) : ''}
                </Text>
              </Text>
            ))}
          </View>
        ) : null}

        {/* The assistant's door, UNDER the list now (U1): the list is what the
            screen is opened for. Not on an empty screen — the first task is the
            one thing to do there. */}
        {lifted || liveTasks === 0 ? null : (
          <View className="mt-xs">
            <AiEntryCard section="Tasks" ready={aiReady} onOpen={onOpenAi} />
          </View>
        )}

        {!lifted && showTasksHint(rows.length) ? (
          <Text className="mx-lg mt-[14px] text-label text-ink-faint">
            {t(
              'Tap a circle to mark it done. Hold a row to skip today on purpose or pause the task.',
            )}
          </Text>
        ) : null}
      </ScrollView>

      {/* The day closed. Fired from the dial's own band, which is where the eye
          already is when the last mark lands. */}
      {celebrating ? <SparkBurst y={bars.top + 8 + DIAL / 2} /> : null}

      {/* THE DAY BUBBLE — the dial, carried along once it has scrolled away. */}
      {lifted ? null : (
        <DayBubble
          visible={bubbleUp}
          day={day}
          isToday={isToday}
          done={progress.done}
          total={progress.total}
          fraction={progress.fraction}
          onTop={scrollToTop}
        />
      )}

      {/* `Add task` — the same slot, in the same place, as every other section's
          one commit action. It was a dashed row at the foot of the list, which
          is a target that moves as the day fills. */}
      {lifted ? null : (
        <FloatingAction
          round
          label={t('Add task')}
          icon="plus"
          hidden={fabHidden}
          onPress={() => setAdding(true)}
        />
      )}

      {menuTask ? (
        <TaskMenu
          task={menuTask}
          day={day}
          isToday={isToday}
          actions={taskRowActions(menuMark, rows.length, isCounted(menuTask))}
          onAction={onMenu}
          onDismiss={() => setMenuFor(null)}
        />
      ) : null}

      {countingTask && isCounted(countingTask) ? (
        <NumberSheet
          title={t('Set a number')}
          body={t('{name} · the target is {count} {unit}', {
            name: countingTask.name,
            count: countingTask.target.count,
            unit: unitOf(countingTask, lang),
          })}
          initial={progressOf(countingTask, entryOf(log, countingTask.id, day))}
          min={0}
          onConfirm={(value) => {
            const taskId = countingTask.id;
            setCountingFor(null);
            const before = setCount(taskId, day, value);
            if (!before) return;
            const after = entryOf(useTasks.getState().log, taskId, day);
            onToast(`${countingTask.name} · ${describeProgress(countingTask, after, lang)}`, {
              label: t('Undo'),
              onPress: () => restoreEntry(taskId, day, before),
            });
          }}
          onCancel={() => setCountingFor(null)}
        />
      ) : null}

      {pausing ? (
        <PauseSheet
          onDismiss={() => setPausing(false)}
          onPaused={(written, days) => {
            setPausing(false);
            raisePauseToast(written, days, t, onToast, unpause);
          }}
        />
      ) : null}

      {adding ? (
        <TaskEditorSheet
          title={t('New task')}
          onSave={(draft) => {
            addTask(draft);
            setAdding(false);
          }}
          onDismiss={() => setAdding(false)}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The empty screen's one card (U13): a dashed slot — the app's vocabulary for
 * "a place for a thing rather than a thing" — that opens the editor. It
 * replaced two lines that both said "nothing" in different words.
 */
function FirstTaskCard({ onPress }: { onPress: () => void }) {
  const t = useT();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${t('Add your first task')}. ${t('Add task')}`}
      style={pressedStyle}
      className="mx-lg mt-lg"
    >
      <View
        style={{
          borderRadius: radius.sheet,
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: glass.ghostEdge,
          backgroundColor: glass.ghost,
          paddingHorizontal: 18,
          paddingVertical: 20,
        }}
      >
        <Text
          maxFontSizeMultiplier={1.3}
          style={{ fontSize: 22, lineHeight: 28, letterSpacing: -0.4 }}
          className="font-semibold text-ink"
        >
          {t('Add your first task')}
        </Text>
        <Text className="mt-xs text-body text-ink-muted">
          {t(
            "One circle per day. Tap it when it's done; the streak and the month build from there.",
          )}
        </Text>
        <Text className="mt-md text-body font-semibold text-green-bright">+ {t('Add task')}</Text>
      </View>
    </Pressable>
  );
}

/**
 * The row's hold menu (U6): the skip, the move and the month, as a sheet of
 * two-line rows — the session's ⋮ menu, the same shape. The skip leads, because
 * it is the one that only lives here.
 */
function TaskMenu({
  task,
  day,
  isToday,
  actions,
  onAction,
  onDismiss,
}: {
  task: Task;
  day: string;
  isToday: boolean;
  actions: TaskRowAction[];
  onAction: (action: TaskRowAction) => void;
  onDismiss: () => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const copy: Record<TaskRowAction, { label: string; detail: string }> = {
    count: {
      label: t('Set a number…'),
      detail: t('Type how many, instead of a tap each'),
    },
    skip: isToday
      ? {
          label: t('Skip today, on purpose'),
          detail: t("Keeps the streak and leaves today's count"),
        }
      : {
          label: t('Skip this day, on purpose'),
          detail: t("Keeps the streak and leaves the day's count"),
        },
    unskip: { label: t('Take the skip back'), detail: t('Back to not answered') },
    pause: {
      label: t('Pause for a while…'),
      detail: t('Excuse a run of days, for every task or a few'),
    },
    move: { label: t('Move'), detail: t('Slide it to a new place, then Drop') },
    open: { label: t('Open history'), detail: t('The month and the streak') },
  };
  return (
    <Sheet title={task.name} onDismiss={onDismiss}>
      <Kicker className="mb-sm">
        {isToday ? `${t('Today')} · ${formatLongDay(day, lang)}` : formatLongDay(day, lang)}
      </Kicker>
      <View className="overflow-hidden rounded-surface bg-surface-alt">
        {actions.map((action, index) => (
          <View key={action}>
            {index > 0 ? <Separator inset={16} /> : null}
            <MenuRow
              label={copy[action].label}
              detail={copy[action].detail}
              onPress={() => onAction(action)}
            />
          </View>
        ))}
      </View>
      <TextButton label={t('Cancel')} onPress={onDismiss} />
    </Sheet>
  );
}

function MenuRow({
  label,
  detail,
  onPress,
}: {
  label: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${detail}`}
      style={pressedStyle}
      className="h-row-lg justify-center px-lg"
    >
      <Text className="text-body text-ink">{label}</Text>
      <Text numberOfLines={1} className="mt-[2px] text-label text-ink-faint">
        {detail}
      </Text>
    </Pressable>
  );
}

function weekdayName(day: string, lang: Language): string {
  const date = parseDay(day);
  return date ? weekdayNames(lang)[weekdayIndex(date)] : '';
}

/** The number in the middle of the dial. Bare — the month is the line under it. */
function dayNumber(day: string): string {
  const date = parseDay(day);
  return date ? String(date.getDate()) : '';
}

/** `SEP 2026`. Uppercased by the style it is drawn in. */
function monthLabel(day: string, lang: Language): string {
  const date = parseDay(day);
  if (!date) return '';
  return `${monthNames(lang)[date.getMonth()].slice(0, 3)} ${date.getFullYear()}`;
}

/**
 * One of the three counts under the dial. 30 tall, the third one dashed, and the
 * number ROLLS when a mark moves it.
 */
function CountPill({
  template,
  count,
  tone,
}: {
  /** Translated with its `{count}` hole still in it — see `RollingPhrase`. */
  template: string;
  count: number;
  tone: 'done' | 'left' | 'excused';
}) {
  const done = tone === 'done';
  const excused = tone === 'excused';
  return (
    <View
      style={{
        height: 32,
        justifyContent: 'center',
        paddingHorizontal: 13,
        marginHorizontal: 4,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderStyle: excused ? 'dashed' : 'solid',
        borderColor: done
          ? tint(0.3)
          : excused
            ? 'rgba(138,150,143,0.30)'
            : 'rgba(236,241,238,0.06)',
        backgroundColor: done ? tint(0.14) : excused ? 'transparent' : 'rgba(236,241,238,0.04)',
      }}
    >
      <RollingPhrase
        template={template}
        values={{ count }}
        lineHeight={18}
        duration={450}
        className={[
          'text-label font-medium',
          done ? 'text-green-bright' : excused ? 'text-ink-faint' : 'text-ink-muted',
        ].join(' ')}
      />
    </View>
  );
}

const TaskRow = memo(function TaskRow({
  task,
  mark,
  progress,
  week,
  streak,
  strength,
  detail,
  dimmed,
  onToggle,
  onOpen,
  onLongPress,
}: {
  task: Task;
  mark: TaskMark | null;
  /** A counted row's parts today (T1), or null on a plain row. */
  progress: number | null;
  /** A weekly row's week (T2), or null. */
  week: WeekProgress | null;
  streak: number;
  /** Habit strength 0–100 (T4), or null for a one-day task. */
  strength: number | null;
  detail: string;
  dimmed: boolean;
  onToggle: (taskId: ID) => void;
  onOpen: (taskId: ID) => void;
  onLongPress?: (taskId: ID) => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const done = mark === 'done';
  const missed = mark === 'missed';
  const press = usePressScale(0.88);
  // What the running text fades into: the row's own fill over the page. Read in
  // render, since a lit row is c2 and c2 is the theme's.
  const fade = done ? mixSrgb(palette.c2, palette.bg, 0.115) : missed ? palette.bg : FADE_ON.card;

  return (
    <GlassSurface
      tier={done ? 'lit' : 'card'}
      radius={radius.card}
      shadow="e1"
      glow={done ? 'repeating' : 'none'}
      // FLAT, all of them. The design's fallback was "blur the done rows only",
      // and this list is the case that fallback was written for — eight rows,
      // scrolling, on the one screen opened every day. On Android a blurred pane
      // re-draws what is behind it as the list moves, so the honest budget here
      // is zero: the tint, the border and the halo are what say "done", and the
      // blur behind a 94%-opaque card was never what anybody was reading.
      flat
      dashed={missed}
      tint={done ? tint(0.115) : missed ? 'transparent' : 'rgba(236,241,238,0.055)'}
      borderColor={done ? tint(0.3) : missed ? 'rgba(138,150,143,0.26)' : 'rgba(236,241,238,0.06)'}
      style={{ opacity: dimmed ? 0.4 : missed ? 0.72 : 1 }}
    >
      <View style={{ height: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          onPress={() => onToggle(task.id)}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          onLongPress={onLongPress ? () => onLongPress(task.id) : undefined}
          delayLongPress={280}
          accessibilityRole={progress === null ? 'checkbox' : 'button'}
          accessibilityState={progress === null ? { checked: done } : undefined}
          accessibilityLabel={
            progress !== null && task.target
              ? `${task.name}. ${t('{n} of {count} {unit}', {
                  n: progress,
                  count: task.target.count,
                  unit: unitOf(task, lang),
                })}. ${done ? t('Tap to start again.') : t('Tap to add one.')}`
              : `${task.name}. ${t(answerOf(mark))}. ${t('Tap to change.')}`
          }
          accessibilityHint={onLongPress ? t('Hold for more: skip today, pause, move') : undefined}
          style={pressedStyle}
          // 62 × 60, the row's full height — the one control on this screen
          // that is pressed without being looked at.
          className="h-[60px] w-[62px] items-center justify-center"
        >
          <Animated.View style={{ transform: press.style.transform }}>
            {progress !== null && task.target && mark === null ? (
              <CountMark count={progress} target={task.target.count} />
            ) : (
              <Mark mark={mark} />
            )}
          </Animated.View>
        </Pressable>

        <Pressable
          onPress={() => onOpen(task.id)}
          onLongPress={onLongPress ? () => onLongPress(task.id) : undefined}
          delayLongPress={280}
          accessibilityRole="button"
          accessibilityLabel={[
            task.name,
            detail,
            strength !== null ? t('Habit strength {n}%', { n: strengthPercent(strength) }) : null,
            t('Open the month.'),
          ]
            .filter(Boolean)
            .join('. ')}
          accessibilityHint={onLongPress ? t('Hold for more: skip today, pause, move') : undefined}
          style={pressedStyle}
          className="h-[60px] flex-1 flex-row items-center pr-lg"
        >
          <View className="flex-1 pr-sm">
            {/* Both lines RUN: `Evening Bible reading and a short journal entry`
                is one task, and its end is the part that says which one — and
                the detail line in Russian is routinely longer than the name. */}
            <RunningText
              text={task.name}
              maxFontSizeMultiplier={1.3}
              fadeColor={fade}
              className={['text-task', missed ? 'text-ink-muted' : 'text-ink'].join(' ')}
            />
            <View className="flex-row items-center" style={{ marginTop: 2 }}>
              {week && task.schedule.kind === 'weekly' ? (
                <WeekPips done={week.done} times={task.schedule.times} />
              ) : null}
              <RunningText
                text={missed ? `${detail} · ${t('streak kept')}` : detail}
                maxFontSizeMultiplier={1.3}
                fadeColor={fade}
                containerStyle={{ flex: 1 }}
                style={{ fontSize: 13.5, lineHeight: 18, color: DETAIL_INK }}
                className="tabular-nums"
              />
            </View>
          </View>
          {/* T4: habit strength, 22 dp, then the flame — the design's order.
              Both hidden while excused: the run is kept, but that day's row is
              not about the run. No ring on a one-day task. Decorative here: the
              row's label says the number. 28 dp in all, so at 360 dp the name
              still has ~140 dp before it runs (RunningText scrolls the rest). */}
          {missed || strength === null ? null : (
            <View className="mr-[6px]" accessible={false}>
              <ProgressRing
                fraction={strengthPercent(strength) / 100}
                size={ROW_RING}
                stroke={ROW_RING_STROKE}
              />
            </View>
          )}
          {missed ? null : <StreakFlame streak={streak} unit={week ? t('wk') : undefined} />}
          <View className="ml-sm">
            <Icon name="chevron-right" size={16} color={palette.inkFaint} />
          </View>
        </Pressable>
      </View>
    </GlassSurface>
  );
});

/**
 * 60, down from 74 (U1): the name's 22 and the detail's 18 with 9 of air each
 * way. The design's floor is 56; 60 keeps the ✓'s 36 dp mark from touching the
 * card's edges, and is what puts six or seven rows above the fold.
 */
const ROW_HEIGHT = 60;
/** The habit-strength ring on a row (T4): the design's 22 dp, 3 dp stroke. */
const ROW_RING = 22;
const ROW_RING_STROKE = 3;
/** The day dial (U1): 196 → 132, the design's figure, with a lighter stroke. */
const DIAL = 132;
const DIAL_STROKE = 8;
/** The detail line's grey — was the prototype's #6B766F; the raised `inkFaint` (U3) is that step now. */
const DETAIL_INK = palette.inkFaint;
/** The done mark and the two it replaces are one 36 dp footprint. */
const MARK = 36;

/**
 * The three answers, as three marks. The filled one is the app's shared commit
 * mark — the same gradient, edge and specular as a logged set's ✓ and focus
 * mode's DONE, so "I did that" is one object at three sizes. Its ✓ is `onAcc`,
 * because on a light theme's gradient an ink tick disappears.
 */
function Mark({ mark }: { mark: TaskMark | null }) {
  if (mark === 'done') {
    // `glow` off: `halo`'s rule is a count, and a column of nine done tasks is
    // exactly the case a per-mark halo turns into a green wall. The ROW carries
    // the repeating halo instead, once.
    return (
      <CheckPop>
        <CommitMark size={MARK} glyph={17} />
      </CheckPop>
    );
  }
  if (mark === 'missed') {
    return (
      <View
        style={{
          width: MARK,
          height: MARK,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(236,241,238,0.05)',
        }}
      >
        <Icon name="x" size={13} color={DETAIL_INK} />
      </View>
    );
  }
  return (
    <View
      style={{
        width: MARK,
        height: MARK,
        borderRadius: radius.pill,
        borderWidth: 1.5,
        borderColor: '#2A3330',
      }}
    />
  );
}

/**
 * A counted row's circle on an unfinished day (T1): the 36 dp footprint of the
 * other marks, a track cut into one dash per part and the parts done filled in
 * over it, with `3/8` in the middle — the design's "fills by parts". Past
 * `SEGMENTS_MAX` parts the dashes would be slivers, so the track is whole and
 * the fill is a share. A finished day is the ordinary ✓, because done is done.
 */
function CountMark({ count, target }: { count: number; target: number }) {
  const r = (MARK - COUNT_STROKE) / 2;
  const length = 2 * Math.PI * r;
  const parts = Math.min(count, target);
  const cut = target <= SEGMENTS_MAX;
  const segment = length / target;
  const filled = cut
    ? Math.max(0, segment * parts - (parts > 0 ? COUNT_GAP : 0))
    : (length * parts) / target;
  return (
    <View style={{ width: MARK, height: MARK, alignItems: 'center', justifyContent: 'center' }}>
      <Svg
        width={MARK}
        height={MARK}
        style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
      >
        <Circle
          cx={MARK / 2}
          cy={MARK / 2}
          r={r}
          fill="none"
          stroke={palette.greenDim}
          strokeWidth={COUNT_STROKE}
          strokeDasharray={cut ? `${segment - COUNT_GAP} ${COUNT_GAP}` : undefined}
        />
        {parts > 0 ? (
          <Circle
            cx={MARK / 2}
            cy={MARK / 2}
            r={r}
            fill="none"
            stroke={palette.greenBright}
            strokeWidth={COUNT_STROKE}
            strokeDasharray={`${filled} ${length}`}
          />
        ) : null}
      </Svg>
      {/* `3/8` while it fits inside the ring at the app's 12.5 floor; past
          three characters just the count — the line beside it says the rest. */}
      <Text
        allowFontScaling={false}
        style={{ fontSize: 12.5, letterSpacing: -0.4 }}
        className="font-semibold tabular-nums text-ink"
      >
        {`${count}/${target}`.length <= 3 ? `${count}/${target}` : String(count)}
      </Text>
    </View>
  );
}

/**
 * A weekly row's week (T2): one 8 dp pip per time it asks, lit for each day
 * done — `●●○ 2 / 3 this week`. Done past N lights them all; the line beside
 * says the true count. Decorative: the line and the row's label say it.
 */
function WeekPips({ done, times }: { done: number; times: number }) {
  return (
    <View className="mr-[6px] flex-row" style={{ gap: 3 }} accessible={false}>
      {Array.from({ length: times }, (_, i) => (
        <View
          key={i}
          style={{
            width: PIP,
            height: PIP,
            borderRadius: PIP / 2,
            backgroundColor: i < done ? palette.greenBright : glass.dash,
          }}
        />
      ))}
    </View>
  );
}

const PIP = 8;

/** The counted ring's stroke, the gap between its parts, and where the parts stop being drawn. */
const COUNT_STROKE = 3;
const COUNT_GAP = 3;
const SEGMENTS_MAX = 12;

/**
 * The ✓ arriving: scale 0 → 1.18 → 1 over 340 ms, on the overshoot curve.
 *
 * It runs on MOUNT and nothing else, which is the whole trick: the ✓ only
 * exists while the answer is `done`, so the component mounting IS the moment the
 * mark was made. No previous-value ref, no comparison, and no way for it to
 * replay because the row above it re-rendered — walking back to a day that was
 * finished last Tuesday shows a still ✓, because that one never mounts fresh
 * under your finger.
 *
 * Two legs rather than one timing through an interpolated 1.18: the design's
 * keyframes put the curve on EACH leg (0 → 1.18 by 70%, then back), and a single
 * overshooting timing through three stops would overshoot the overshoot.
 * `.34,1.56,.64,1` is kept to the moments that should feel CAUGHT — this and a
 * logged set — so it never reads as a bounce.
 */
function CheckPop({ children }: { children: React.ReactNode }) {
  const pop = useRef(new Animated.Value(0)).current;
  const arrived = useArrived();
  useEffect(() => {
    if (!arrived) return;
    const easing = Easing.bezier(0.34, 1.56, 0.64, 1);
    Animated.sequence([
      Animated.timing(pop, {
        toValue: 1.18,
        duration: POP_MS * 0.7,
        easing,
        useNativeDriver: true,
      }),
      Animated.timing(pop, {
        toValue: 1,
        duration: POP_MS * 0.3,
        easing,
        useNativeDriver: true,
      }),
    ]).start();
  }, [arrived, pop]);

  return <Animated.View style={{ transform: [{ scale: pop }] }}>{children}</Animated.View>;
}

const POP_MS = 340;

function answerOf(mark: TaskMark | null): string {
  if (mark === 'done') return 'Done';
  if (mark === 'missed') return 'Missed on purpose';
  return 'Not answered';
}

/* ------------------------------------------------------------------ */

/**
 * Tasks' bubble line: shown once the 132 dp dial has left under the top bar
 * (8 + 132 + the pills), hidden again 40 below — the hysteresis every bubble
 * keeps, so a thumb resting on the line does not flicker the pill.
 */
const BUBBLE_SHOW = 170;
const BUBBLE_HIDE = 130;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const MINI = 52;
const MINI_R = 22;
const MINI_STROKE = 4;
const MINI_LENGTH = 2 * Math.PI * MINI_R;

/*
 * The capsule is 300 wide (spec §8). Inside its 1 dp border and 6 / 8 padding
 * that leaves 284 for ring (52) + gap + text + gap + share. The share is held at
 * a minimum that fits `100%`, so the text column can be a fixed width and RUN
 * when a long month name in Russian does not fit — the bubble's children are
 * each wrapped for their staggered entrance, so `flex: 1` has nothing to grow
 * into.
 */
const BUBBLE_WIDTH = 300;
const BUBBLE_GAP = 12;
const SHARE_MIN = 62;
const TEXT_WIDTH = BUBBLE_WIDTH - 2 - 6 - 8 - MINI - BUBBLE_GAP * 2 - SHARE_MIN;

/**
 * THE DAY BUBBLE — the dial at a quarter of its size.
 *
 *   ╭────────────────────────────────────────╮
 *   │ (28)  TODAY · MON               ( 75% ) │
 *   │       28 September                      │
 *   │       6 of 8 done                       │
 *   ╰────────────────────────────────────────╯
 *
 * The mini ring refills over 760 ms as marks land, the counts and the share roll,
 * and the capsule's halo grows with the day, so a nearly finished day glows
 * brighter than an empty one even at the top of a scrolled list. The share pill's
 * own glow scales the same way — blur 10 → 30, alpha 0.2 → 0.5 — and at 100% it
 * fills solid with the gradient, its number turning `onAcc`. Tapping any of it
 * scrolls back to the dial.
 */
function DayBubble({
  visible,
  day,
  isToday,
  done,
  total,
  fraction,
  onTop,
}: {
  visible: boolean;
  day: string;
  isToday: boolean;
  done: number;
  total: number;
  fraction: number;
  onTop: () => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const scale = useMotionScale();
  const clamped = Math.max(0, Math.min(1, fraction));
  const full = total > 0 && done >= total;
  const percent = Math.round(clamped * 100);
  const ring = useRef(new Animated.Value(clamped)).current;
  useEffect(() => {
    Animated.timing(ring, {
      toValue: clamped,
      duration: 760 * scale,
      easing: curve(motion.ease),
      useNativeDriver: false,
    }).start();
  }, [clamped, ring, scale]);

  const date = parseDay(day);
  const weekday = date ? weekdayLabels(lang)[weekdayIndex(date)] : '';
  const kicker = isToday ? `${t('Today')} · ${weekday}` : weekday;
  const bubbleFade = FADE_ON.bar;

  const ringOffset = useMemo(
    () =>
      ring.interpolate({
        inputRange: [0, 1],
        outputRange: [MINI_LENGTH, 0],
      }),
    [ring],
  );
  return (
    <FloatingBubble
      visible={visible}
      width={BUBBLE_WIDTH}
      contentStyle={{ gap: BUBBLE_GAP, padding: 6, paddingRight: 8 }}
      accessibilityLabel={`${isToday ? t('Today') : weekdayName(day, lang)}, ${t(
        '{done} of {total} done',
        { done, total },
      )}, ${t('{percent} percent', { percent })}`}
    >
      <Pressable
        onPress={onTop}
        accessibilityRole="button"
        accessibilityLabel={t('Back to the dial')}
        style={{ width: MINI, height: MINI, alignItems: 'center', justifyContent: 'center' }}
      >
        <Svg
          width={MINI}
          height={MINI}
          style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
        >
          <Circle
            cx={MINI / 2}
            cy={MINI / 2}
            r={MINI_R}
            fill="rgba(6,8,7,0.35)"
            // The dial's own track: c1 38% into the dark, so the two rings match.
            stroke={mixSrgb(palette.c1, '#0b1410', 0.38)}
            strokeWidth={MINI_STROKE}
          />
          <AnimatedCircle
            cx={MINI / 2}
            cy={MINI / 2}
            r={MINI_R}
            fill="none"
            stroke={palette.acc}
            strokeWidth={MINI_STROKE}
            strokeLinecap="round"
            strokeDasharray={MINI_LENGTH}
            strokeDashoffset={ringOffset}
          />
        </Svg>
        <Text
          maxFontSizeMultiplier={1.3}
          style={{
            fontSize: 17,
            letterSpacing: -0.5,
          }}
          className="font-bold tabular-nums text-ink"
        >
          {dayNumber(day)}
        </Text>
      </Pressable>

      <Pressable
        onPress={onTop}
        accessibilityRole="button"
        accessibilityLabel={t('Back to the dial')}
        style={{ width: TEXT_WIDTH }}
      >
        <RunningText
          text={kicker}
          maxFontSizeMultiplier={1.3}
          fadeColor={bubbleFade}
          style={{ fontSize: 12.5, lineHeight: 16, letterSpacing: 1.1, color: palette.acc }}
          className="font-semibold uppercase"
        />
        <RunningText
          text={formatShortDay(day, lang)}
          maxFontSizeMultiplier={1.3}
          fadeColor={bubbleFade}
          containerStyle={{ marginTop: 2 }}
          style={{ fontSize: 16, lineHeight: 20 }}
          className="font-semibold text-ink"
        />
        <RollingPhrase
          template={t('{done} of {total} done')}
          values={{ done, total }}
          lineHeight={16}
          duration={500}
          containerStyle={{ marginTop: 1 }}
          style={{ fontSize: 12.5 }}
          className="text-ink-muted"
        />
      </Pressable>

      <SharePill percent={percent} full={full} onPress={onTop} />
    </FloatingBubble>
  );
}

/**
 * The share. At 100% it stops being a tint and becomes the gradient, because a
 * finished day is the one state worth a fill.
 */
function SharePill({
  percent,
  full,
  onPress,
}: {
  percent: number;
  full: boolean;
  onPress: () => void;
}) {
  const t = useT();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('Back to the dial')}
      style={{
        height: 30,
        minWidth: SHARE_MIN,
        paddingHorizontal: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: tint(0.3),
        backgroundColor: full ? 'transparent' : tint(0.14),
      }}
    >
      {full ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: radius.pill,
            overflow: 'hidden',
          }}
        >
          <LinearGradient
            {...gradientFill()}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
        </View>
      ) : null}
      <RollingNumber
        value={`${percent}%`}
        lineHeight={18}
        duration={700}
        style={{ fontSize: 14, color: full ? palette.onAcc : palette.acc }}
        className="font-bold"
      />
    </Pressable>
  );
}
