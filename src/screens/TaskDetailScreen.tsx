/**
 * TaskDetailScreen — one task, one month.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹ TASKS                                      │
 *   │ Morning Bible/Narek reading                  │   30 / 35
 *   │ Every day · since 4 January 2026             │
 *   │ ┌─ STREAK ────────┐┌─ THIS MONTH ──────────┐ │
 *   │ │ 12 🜂            ││ 11 of 13              │ │   lit | card
 *   │ └─────────────────┘└───────────────────────┘ │
 *   │          ‹ September 2026 ›                  │
 *   │  M  T  W  T  F  S  S                         │
 *   │     ▢  ▢  ■  ■  ■  ■                         │   cells pop in, 14 ms apart
 *   │  ■  ■  ■  ■  ■  ■  ◉  ← today                │
 *   │  ■ Done  ┆ On purpose  ▫ Not answered        │
 *   │ NOTE · 12 SEPTEMBER                          │
 *   │ Archive this task                            │   in danger
 *   │                              ╭ ✎ Edit task ╮ │   ghost, floating
 *   └──────────────────────────────────────────────┘
 *
 * ── THE GRID IS THE ANSWER TO A QUESTION THE LIST CANNOT ANSWER ───────────
 *
 * Exactly the argument `lib/calendar.ts` makes for the training calendar: "how
 * did September go" is a question about a SHAPE, and thirty rows of dates is not
 * a shape. Four squares in a row with a gap after them says something no counter
 * does.
 *
 * Four cell states and they are four different things — filled is done, dashed
 * is missed on purpose, faint is a day that went by unanswered, and BLANK is a
 * day this task never asked about. The blanks are what stop a Mon/Wed/Fri task
 * from looking like a daily one with a terrible record.
 *
 * ── THE NOTE IS ATTACHED TO A DAY, NOT TO THE TASK ────────────────────────
 *
 * Tapping a square moves the note field to that square's day. A note on the task
 * itself would be a description, and a task that needs describing needs renaming.
 *
 * ── THE CELLS ARE THE THEME, AND THE GRID IS NOT IN A CARD ──────────────
 *
 * Momentum's grid sits straight on the page, 6 dp between cells: done is c2 at
 * 75% with an `onAcc` numeral (a light theme's c2 swallows ink), on purpose is
 * a dashed outline, not answered is ink at 5%, and today is a 2 dp `acc` ring
 * with a glow. The old glass card around it was a frame around something that
 * is already a shape. The grid is keyed by its month so paging re-runs the
 * staggered pop — a new month arriving is a new shape being drawn.
 *
 * ── ARCHIVE, AND NO DELETE ────────────────────────────────────────────────
 *
 * Archiving keeps the months that were already drawn; deleting would silently
 * remove a year of answered days from a log whose only job is to remember them.
 * It is a plain text action in `danger` at the foot of the scroll — the one
 * thing here that takes the task off the day list — and it asks first.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, Text, View } from 'react-native';
import { Pressable } from '../components/Pressable';
import { StatusBar } from 'expo-status-bar';

import { ConfirmSheet } from '../components/ConfirmSheet';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { TaskEditorSheet } from '../components/TaskEditorSheet';
import { pressedStyle } from '../components/motion';
import { BubblePressable } from '../components/bubbles';
import { FloatingAction, Lamps } from '../components/glass';
import { FieldWell, Kicker } from '../components/primitives';
import { useLanguage, usePlural, useT } from '../hooks/useT';
import {
  dayKey,
  formatLongDay,
  formatMonth,
  formatShortDay,
  parseDay,
  weekdayInitials,
} from '../lib/days';
import {
  type Task,
  type TaskCell,
  describeReminder,
  describeSchedule,
  entryOf,
  streakOf,
  taskMonth,
} from '../lib/tasks';
import { useTasks } from '../state/tasksStore';
import { danger, palette, radius, tint } from '../theme/tokens';

interface TaskDetailScreenProps {
  task: Task;
  onBack: () => void;
}

export function TaskDetailScreen({ task, onBack }: TaskDetailScreenProps) {
  const t = useT();
  const lang = useLanguage();
  const plural = usePlural();
  const log = useTasks((s) => s.log);
  const setNote = useTasks((s) => s.setNote);
  const updateTask = useTasks((s) => s.updateTask);
  const archiveTask = useTasks((s) => s.archiveTask);

  const today = dayKey(new Date());
  const start = parseDay(today) ?? new Date();
  const [cursor, setCursor] = useState({ year: start.getFullYear(), month: start.getMonth() });
  const [noteDay, setNoteDay] = useState(today);
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const month = useMemo(
    () => taskMonth(task, log, cursor.year, cursor.month, today, lang),
    [task, log, cursor, today, lang],
  );
  const streak = streakOf(task, log, today);
  const note = entryOf(log, task.id, noteDay).note;

  const step = (delta: number) => {
    const next = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
  };
  // Nothing is recorded past this month, so there is nowhere forward to go.
  const atLatest = cursor.year === start.getFullYear() && cursor.month === start.getMonth();

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />
      <Lamps section="Tasks" />
      <ScreenHeader kicker={t('Tasks')} onBack={onBack} bordered={false} />

      <ScrollView
        className="flex-1"
        // Clears the floating pill, which sits at the same `bottom: 92` here as
        // in every section even though this screen has no nav pill under it —
        // the slot is a position a thumb learns, not a position relative to
        // whatever else happens to be on screen.
        contentContainerStyle={{ paddingBottom: 170 }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          allowFontScaling={false}
          style={{ fontSize: 30, lineHeight: 35, letterSpacing: -0.8 }}
          className="mx-lg mt-sm font-semibold text-ink"
        >
          {task.name}
        </Text>
        <Text
          allowFontScaling={false}
          style={{ fontSize: 15, lineHeight: 20 }}
          className="mx-lg mt-[6px] text-ink-muted"
        >
          {[
            describeSchedule(task.schedule, lang),
            /* A one-day task's start day IS its day — see `addTask` — so saying
               "since the 14th" about a task that only ever asks on the 14th is a
               sentence with no information in it. */
            task.schedule.kind === 'once'
              ? null
              : `${t('since')} ${formatLongDay(task.startedOn, lang)}`,
            describeReminder(task, lang),
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>

        {/* The streak is what this screen is ABOUT, so it is the lit one; the
            month beside it is the context that makes a streak mean something. */}
        <View className="mx-lg mt-lg flex-row" style={{ gap: 10 }}>
          <View
            accessible
            accessibilityLabel={`${t('Streak')}: ${streak} ${plural(streak, {
              one: t('day'),
              few: 'дня',
              many: t('days'),
            })}`}
            style={[STAT_CARD, LIT_CARD()]}
          >
            <Text style={STAT_KICKER} className="font-semibold uppercase text-acc">
              {t('Streak')}
            </Text>
            <View className="mt-[6px] flex-row items-center" style={{ gap: 6 }}>
              <Text
                allowFontScaling={false}
                style={STAT_VALUE}
                className="font-semibold tabular-nums text-ink"
              >
                {streak}
              </Text>
              <Icon name="flame" size={20} color={palette.acc} />
            </View>
          </View>
          <View style={[STAT_CARD, PLAIN_CARD]}>
            <Text style={STAT_KICKER} className="font-semibold uppercase text-ink-faint">
              {t('This month')}
            </Text>
            <View className="mt-[6px] flex-row items-baseline">
              <Text
                allowFontScaling={false}
                style={STAT_VALUE}
                className="font-semibold tabular-nums text-ink"
              >
                {month.done}
              </Text>
              <Text className="ml-xs text-label text-ink-muted">
                {t('of {asked}', { asked: month.asked })}
              </Text>
            </View>
          </View>
        </View>

        <View className="mx-lg mt-[18px] flex-row items-center justify-center" style={{ gap: 4 }}>
          <Pressable
            onPress={() => step(-1)}
            accessibilityRole="button"
            accessibilityLabel={t('The month before')}
            style={pressedStyle}
            className="h-[44px] w-[44px] items-center justify-center"
          >
            <Icon name="chevron-left" size={22} color={palette.inkMuted} />
          </Pressable>
          <Text
            allowFontScaling={false}
            style={{ fontSize: 16 }}
            className="font-medium tabular-nums text-ink"
          >
            {formatMonth(cursor.year, cursor.month, lang)}
          </Text>
          <Pressable
            onPress={() => step(1)}
            disabled={atLatest}
            accessibilityRole="button"
            accessibilityLabel={t('The month after')}
            accessibilityState={{ disabled: atLatest }}
            // 25% rather than absent, like the day pager: the month label does
            // not jump sideways on the latest month.
            style={atLatest ? { opacity: 0.25 } : undefined}
            className="h-[44px] w-[44px] items-center justify-center"
          >
            <Icon name="chevron-right" size={22} color={palette.inkMuted} />
          </Pressable>
        </View>

        <View className="mx-lg mt-sm flex-row" style={{ gap: CELL_GAP }}>
          {weekdayInitials(lang).map((initial, index) => (
            <Text
              key={`${initial}${index}`}
              allowFontScaling={false}
              style={{ fontSize: 11.5, lineHeight: 16, letterSpacing: 1.1 }}
              className="flex-1 text-center font-semibold uppercase text-ink-faint"
            >
              {initial}
            </Text>
          ))}
        </View>

        {/* Keyed by the month: paging remounts the grid, so the cells pop in
            again — the new month is drawn, not swapped. */}
        <View key={`${cursor.year}-${cursor.month}`} className="mx-lg mt-[6px]">
          {month.weeks.map((week, index) => (
            <View
              key={index}
              className="flex-row"
              style={{ gap: CELL_GAP, marginTop: index === 0 ? 0 : CELL_GAP }}
            >
              {week.map((cell, position) => (
                <Cell
                  key={cell.date ?? `pad${position}`}
                  cell={cell}
                  future={cell.date !== null && cell.date > today}
                  selected={cell.date !== null && cell.date === noteDay}
                  onPress={cell.date ? () => setNoteDay(cell.date as string) : undefined}
                />
              ))}
              {/* The last week is short rather than padded — a trailing blank
                  would draw squares for days that have not happened. */}
              {week.length < 7
                ? Array.from({ length: 7 - week.length }, (_, i) => (
                    <View key={`tail${i}`} className="flex-1" />
                  ))
                : null}
            </View>
          ))}
        </View>

        <View className="mx-lg mt-[14px] flex-row flex-wrap" style={{ gap: 14 }}>
          <LegendItem label={t('Done')} swatch={{ backgroundColor: tint(0.75) }} />
          <LegendItem
            label={t('On purpose')}
            swatch={{ borderWidth: 1, borderStyle: 'dashed', borderColor: DASHED }}
          />
          <LegendItem label={t('Not answered')} swatch={{ backgroundColor: NOT_ANSWERED }} />
        </View>

        <Kicker className="mx-lg mb-kicker-gap mt-kicker">
          {t('Note')} · {formatShortDay(noteDay, lang)}
        </Kicker>
        <View className="mx-lg">
          <FieldWell
            value={note}
            size="body"
            placeholder={t('What happened that day')}
            onChangeText={(text) => setNote(task.id, noteDay, text)}
            accessibilityLabel={`${t('Note')} · ${formatLongDay(noteDay, lang)}`}
          />
        </View>

        {/* Plain text at the foot of the scroll, out of a thumb's resting reach,
            and it opens a confirm rather than acting. */}
        <BubblePressable
          onPress={() => setArchiving(true)}
          radius={14}
          accessibilityRole="button"
          accessibilityLabel={t('Archive this task')}
          accessibilityHint={t(
            'It leaves the day list. Every day you already answered stays where it is.',
          )}
          style={(state) => [
            pressedStyle(state),
            {
              marginTop: 24,
              marginHorizontal: 12,
              alignSelf: 'flex-start',
              height: 44,
              paddingHorizontal: 4,
              justifyContent: 'center',
            },
          ]}
        >
          <Text
            allowFontScaling={false}
            style={{ fontSize: 15, color: danger }}
            className="font-medium"
          >
            {t('Archive this task')}
          </Text>
        </BubblePressable>
      </ScrollView>

      {/* Ghost, not filled: this screen's point is reading the month, and
          editing is the thing you occasionally do from it. At 28 because a
          pushed screen has no nav bar under it to clear. */}
      <FloatingAction
        variant="ghost"
        label={t('Edit task')}
        icon="edit"
        bottom={28}
        onPress={() => setEditing(true)}
      />

      {editing ? (
        <TaskEditorSheet
          title={t('Edit task')}
          name={task.name}
          schedule={task.schedule}
          startedOn={task.startedOn}
          reminder={task.reminder}
          onSave={(draft) => {
            updateTask(task.id, draft);
            setEditing(false);
          }}
          onDismiss={() => setEditing(false)}
        />
      ) : null}

      {archiving ? (
        <ConfirmSheet
          title={`${t('Archive this task')} — “${task.name}”?`}
          body={t('It leaves the day list. Every day you already answered stays where it is.')}
          confirmLabel={t('Archive it')}
          cancelLabel={t('Keep it')}
          onConfirm={() => {
            archiveTask(task.id);
            setArchiving(false);
            onBack();
          }}
          onCancel={() => setArchiving(false)}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */

/* The cell skins, as in the prototype. Colours that follow the theme are read in
   render (functions), never captured at module load. */
const CELL_GAP = 6;
const CELL_RADIUS = 11;
const DASHED = 'rgba(138,150,143,0.5)';
const NOT_ANSWERED = 'rgba(236,241,238,0.05)';
const CELL_MUTED = '#6B766F';
const CELL_FUTURE = '#3A433F';
const POP_MS = 380;
const POP_DELAY = 160;
const POP_STAGGER = 14;

const STAT_CARD = { flex: 1, padding: 16, borderRadius: radius.card, borderWidth: 1 } as const;
const PLAIN_CARD = {
  backgroundColor: 'rgba(236,241,238,0.055)',
  borderColor: 'rgba(236,241,238,0.06)',
} as const;
function LIT_CARD() {
  return {
    backgroundColor: tint(0.13),
    borderColor: tint(0.3),
  };
}
const STAT_KICKER = { fontSize: 12.5, lineHeight: 16, letterSpacing: 1.1 } as const;
const STAT_VALUE = { fontSize: 28, lineHeight: 32, letterSpacing: -0.8 } as const;

function LegendItem({ label, swatch }: { label: string; swatch: object }) {
  return (
    <View className="flex-row items-center" style={{ gap: 6 }}>
      <View style={[{ width: 12, height: 12, borderRadius: 4 }, swatch]} />
      <Text allowFontScaling={false} style={{ fontSize: 13, color: CELL_MUTED }}>
        {label}
      </Text>
    </View>
  );
}

function Cell({
  cell,
  future,
  selected,
  onPress,
}: {
  cell: TaskCell;
  /** After today — faint, and never a state. */
  future: boolean;
  selected: boolean;
  onPress?: () => void;
}) {
  const t = useT();
  /* 0 → 1.18 → 1 on the overshoot, 14 ms after the day before it: the month is
     drawn in reading order rather than appearing. Mount only — see the key on
     the grid. */
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (cell.day === null) return;
    const easing = Easing.bezier(0.34, 1.56, 0.64, 1);
    Animated.sequence([
      Animated.delay(POP_DELAY + (cell.day - 1) * POP_STAGGER),
      Animated.timing(pop, {
        toValue: 1.18,
        duration: POP_MS * 0.7,
        easing,
        useNativeDriver: true,
      }),
      Animated.timing(pop, { toValue: 1, duration: POP_MS * 0.3, easing, useNativeDriver: true }),
    ]).start();
    // Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pop]);

  if (cell.day === null) return <View className="flex-1" />;

  /* Four answers, four skins. Today's ring sits OVER its state, so a today that
     is already done is still a filled square — with the ring round it. */
  const done = cell.state === 'done';
  const skin = done
    ? {
        backgroundColor: tint(0.75),
      }
    : cell.state === 'missed'
      ? { borderWidth: 1, borderStyle: 'dashed' as const, borderColor: DASHED }
      : cell.state === 'unanswered'
        ? { backgroundColor: NOT_ANSWERED }
        : {};
  const ring = cell.isToday
    ? {
        borderWidth: 2,
        borderStyle: 'solid' as const,
        borderColor: palette.acc,
        // `boxShadow`, not `elevation`: Android's elevation draws a far wider
        // shadow than the radius asked for. See `theme/tokens.ts`.
      }
    : selected
      ? { borderWidth: 1, borderStyle: 'solid' as const, borderColor: palette.inkMuted }
      : {};
  const color = done
    ? palette.onAcc
    : cell.isToday
      ? palette.ink
      : future || cell.state === 'blank'
        ? CELL_FUTURE
        : CELL_MUTED;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      // The state is spoken, so it is a WORD rather than the stored key.
      accessibilityLabel={`${cell.day}, ${t(cell.state)}`}
      accessibilityState={{ selected }}
      style={pressedStyle}
      className="flex-1"
    >
      <Animated.View
        style={[
          {
            aspectRatio: 1,
            borderRadius: CELL_RADIUS,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ scale: pop }],
          },
          skin,
          ring,
        ]}
      >
        <Text
          allowFontScaling={false}
          style={{ fontSize: 13.5, fontWeight: '600', color }}
          className="tabular-nums"
        >
          {cell.day}
        </Text>
      </Animated.View>
    </Pressable>
  );
}
