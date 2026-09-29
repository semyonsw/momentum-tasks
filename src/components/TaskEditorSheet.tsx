/**
 * TaskEditorSheet — a task's name, the days it asks on, when it starts, and
 * whether the phone says anything about it.
 *
 *   ╭────────────────────────────────────────────╮
 *   │ New task                                   │
 *   │ ┌────────────────────────────────────────┐ │
 *   │ │ Wash the dishes                        │ │
 *   │ └────────────────────────────────────────┘ │
 *   │ REPEATS                                    │
 *   │ ╭Every day╮ Weekdays  Pick days  Once      │  ← one lit pane, sliding
 *   │  Mon  Tue  Wed  Thu  Fri  Sat  Sun         │
 *   │ STARTS ON                    14 September ▾│
 *   │   ‹ September 2026 ›   (the grid)          │
 *   │ 🔔 Remind me                       [ ●━ ]  │
 *   │        06      28                          │
 *   │      ╭ 07  :  30 ╮                         │
 *   │        08      32                          │
 *   │ ╭──────────── ✓ Save task ──────────────╮  │
 *   ╰────────────────────────────────────────────╯
 *
 * ── FOUR FACTS, AND THREE OF THEM ARE FOLDED AWAY ─────────────────────────
 *
 * This file's header used to say a task is TWO facts and that "a notification is
 * a different product". It grew two more, and the reason the old argument was
 * right is also the reason these fit: the common answer to all three of the new
 * questions is the one the sheet already gives without being touched. Daily,
 * starting today, silent. Nothing opens unless you say so — the weekday chips
 * only exist under `Chosen days`, the month grid only under a tapped date, the
 * wheel only under a switch that is off.
 *
 * So the sheet is the same height it always was for the task everybody actually
 * types, and it is a form only for the one somebody deliberately asked for.
 *
 * ── `JUST ONCE`, AND WHY IT IS A THIRD SEGMENT ────────────────────────────
 *
 * Not a checkbox beside the schedule, because it is not a modifier on a
 * schedule — it REPLACES it. A daily task that is also once is nothing, and a
 * checkbox invites exactly that question. Three mutually exclusive answers in
 * one control is what `Segmented` is for, and picking `Just once` swaps the
 * weekday chips for a date, because those are the same slot answering the same
 * question: which day.
 *
 * ── `WEEKDAYS` IS A PRESET, NOT A FOURTH KIND ─────────────────────────────
 *
 * v3's control has four answers, and the model still has three: `Weekdays` is
 * `{ kind: 'weekdays', days: Mon–Fri }` with the chips folded away, because the
 * commonest "chosen days" answer by far is the working week and it should not
 * cost five taps. `Pick days` is the same kind with the chips open. A task saved
 * as exactly Mon–Fri reopens on `Weekdays`; any other set reopens on `Pick days`.
 *
 * ── STARTS ON DEFAULTS TO TODAY, AND THAT IS THE FEATURE ──────────────────
 *
 * A task written on Sunday evening must not appear on Saturday's list. Saturday
 * was finished — nine of nine, the bar full — and a row added retroactively
 * turns it into nine of ten and takes a completed day away from somebody who
 * completed it. `startedOn` is the floor that stops that, it has always existed,
 * and this is the control that finally lets it be anything else on purpose: a
 * habit that genuinely began on the 1st can say so.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Text, View } from 'react-native';

import { BubblePressable } from './bubbles';
import { DayPicker } from './DayPicker';
import { Icon } from './Icon';
import { MaterialSymbol } from './MaterialSymbol';
import { Sheet, SheetCancel } from './Sheet';
import { TimeWheel } from './TimeWheel';
import {
  FieldWell,
  GradientFill,
  Kicker,
  PrimaryButton,
  Segmented,
  SelectChip,
  Toggle,
} from './primitives';
import { dayKey, formatLongDay, shiftDay, weekdayLabels } from '../lib/days';
import { ensureNotificationPermission } from '../lib/notify';
import { useLanguage, useT } from '../hooks/useT';
import type { TaskReminder, TaskSchedule, Weekday } from '../lib/tasks';
import { curve, palette, tint } from '../theme/tokens';

/** What the segmented control shows. `workdays` and `pick` are both `weekdays`. */
type Mode = 'daily' | 'workdays' | 'pick' | 'once';

const WORKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4];

function isWorkdays(days: readonly Weekday[]): boolean {
  return days.length === WORKDAYS.length && WORKDAYS.every((day) => days.includes(day));
}

/** Everything the sheet hands back. One object, because it is one act. */
export interface TaskDraft {
  name: string;
  schedule: TaskSchedule;
  startedOn: string;
  reminder: TaskReminder | null;
}

interface TaskEditorSheetProps {
  title: string;
  /** Absent for a new task. */
  name?: string;
  schedule?: TaskSchedule;
  startedOn?: string;
  reminder?: TaskReminder | null;
  onSave: (draft: TaskDraft) => void;
  onDismiss: () => void;
}

export function TaskEditorSheet({
  title,
  name: initialName = '',
  schedule: initialSchedule = { kind: 'daily' },
  startedOn: initialStartedOn,
  reminder: initialReminder = null,
  onSave,
  onDismiss,
}: TaskEditorSheetProps) {
  const t = useT();
  const lang = useLanguage();

  /**
   * THE CLOCK, not the day the screen behind this sheet is showing.
   *
   * It was the screen's day for one revision, and that was a bug with the exact
   * shape this whole feature exists to prevent: the tasks screen lets you walk
   * back to any past day, so adding a task while reading last Tuesday would have
   * defaulted its start to last Tuesday — silently adding a row to a day that was
   * already finished and turning 9 of 9 into 9 of 10. Both defaults below are the
   * real today, because both are claims about when the task begins, and a task
   * begins when you write it down.
   */
  const today = dayKey(new Date());

  const [name, setName] = useState(initialName);
  const [mode, setMode] = useState<Mode>(
    initialSchedule.kind === 'weekdays'
      ? isWorkdays(initialSchedule.days)
        ? 'workdays'
        : 'pick'
      : initialSchedule.kind,
  );
  const [days, setDays] = useState<readonly Weekday[]>(
    initialSchedule.kind === 'weekdays' ? initialSchedule.days : [0, 2, 4],
  );
  const kind = mode === 'workdays' || mode === 'pick' ? 'weekdays' : mode;
  const [onceDay, setOnceDay] = useState(
    initialSchedule.kind === 'once' ? initialSchedule.day : shiftDay(today, 1),
  );
  const [startedOn, setStartedOn] = useState(initialStartedOn ?? today);
  /** Which of the two dates the grid is pointing at, or neither. */
  const [datePicker, setDatePicker] = useState<'start' | 'once' | null>(null);
  const [reminder, setReminder] = useState<TaskReminder | null>(initialReminder);
  /** The permission was asked for when the switch went on, and refused. */
  const [blocked, setBlocked] = useState(false);

  const schedule: TaskSchedule =
    kind === 'daily'
      ? { kind: 'daily' }
      : kind === 'once'
        ? { kind: 'once', day: onceDay }
        : { kind: 'weekdays', days: mode === 'workdays' ? WORKDAYS : days };

  // A task with no name is not a task, and one that asks on no day never asks.
  const savable = name.trim() !== '' && (mode !== 'pick' || days.length > 0);

  const MODES = [
    { value: 'daily' as const, label: t('Every day') },
    { value: 'workdays' as const, label: t('Weekdays') },
    { value: 'pick' as const, label: t('Pick days') },
    { value: 'once' as const, label: t('Once') },
  ];

  return (
    <Sheet title={title} onDismiss={onDismiss}>
      <Kicker className="mb-sm">{t('Name')}</Kicker>
      <FieldWell
        value={name}
        size="body"
        lit
        placeholder={t('What are you asking yourself to do?')}
        onChangeText={setName}
        autoFocus={initialName === ''}
        accessibilityLabel={t('Task name')}
      />

      <Kicker className="mb-sm mt-lg">{t('Repeats')}</Kicker>
      <Segmented
        options={MODES}
        value={mode}
        onChange={(next) => {
          setMode(next);
          // The grid belongs to whichever date is in play; switching kind while
          // it is open would leave it editing a date the sheet no longer shows.
          setDatePicker(null);
        }}
        accessibilityLabel={t('Repeats')}
      />

      {mode === 'pick' ? (
        <View className="mt-md flex-row flex-wrap">
          {weekdayLabels(lang).map((label, index) => {
            const weekday = index as Weekday;
            const selected = days.includes(weekday);
            return (
              <SelectChip
                key={label + index}
                label={label}
                selected={selected}
                onPress={() =>
                  setDays((current) =>
                    selected ? current.filter((day) => day !== weekday) : [...current, weekday],
                  )
                }
              />
            );
          })}
        </View>
      ) : null}

      {kind === 'once' ? (
        <>
          <Text className="mt-md text-label text-ink-faint">
            {t('A one-day task. It asks on that day and never again.')}
          </Text>
          <DateRow
            label={t('Which day')}
            value={formatLongDay(onceDay, lang)}
            open={datePicker === 'once'}
            onToggle={() => setDatePicker(datePicker === 'once' ? null : 'once')}
          />
          {datePicker === 'once' ? (
            <View className="mt-sm">
              <DayPicker value={onceDay} onChange={setOnceDay} />
            </View>
          ) : null}
        </>
      ) : (
        <>
          <DateRow
            label={t('Starts on')}
            value={formatLongDay(startedOn, lang)}
            open={datePicker === 'start'}
            onToggle={() => setDatePicker(datePicker === 'start' ? null : 'start')}
          />
          {datePicker === 'start' ? (
            <>
              <View className="mt-sm">
                <DayPicker value={startedOn} onChange={setStartedOn} />
              </View>
              <Text className="mt-sm text-label text-ink-faint">
                {t('The day it first asks. Days before it stay exactly as you left them.')}
              </Text>
            </>
          ) : null}
        </>
      )}

      <View
        className="mt-md flex-row items-center rounded-[18px] border"
        style={{
          gap: 12,
          paddingVertical: 12,
          paddingHorizontal: 14,
          backgroundColor: 'rgba(236,241,238,0.03)',
          borderColor: 'rgba(236,241,238,0.05)',
        }}
      >
        <MaterialSymbol name="notifications" size={22} color={palette.acc} filled />
        <View className="flex-1">
          <Text className="text-[16px] font-medium text-ink">{t('Remind me')}</Text>
          <Text className="mt-[1px] text-[13.5px] text-[#6B766F]">
            {reminder ? t('The phone will ask on the days this task asks.') : t('Off')}
          </Text>
        </View>
        <Toggle
          value={reminder !== null}
          // 07:00 rather than the current time: a reminder is a thing you want
          // in the morning far more often than you want it at 14:36.
          onChange={(on) => {
            setReminder(on ? { hour: 7, minute: 0 } : null);
            if (on)
              void ensureNotificationPermission().then((state) => setBlocked(state !== 'granted'));
          }}
          accessibilityLabel={t('Remind me about this')}
        />
      </View>

      {reminder && blocked ? (
        <Text className="mt-sm text-label text-ink-faint">
          {t('Notifications are switched off for this app, so nothing will arrive.')}
        </Text>
      ) : null}

      {reminder ? (
        <View className="mt-lg">
          <TimeWheel
            hour={reminder.hour}
            minute={reminder.minute}
            onChange={(hour, minute) => setReminder({ hour, minute })}
          />
        </View>
      ) : null}

      {savable ? null : (
        <Text className="mt-sm text-label text-ink-faint">
          {name.trim() === '' ? t('Give it a name.') : t('Pick at least one day.')}
        </Text>
      )}

      <View style={{ marginTop: 18 }}>
        <SaveButton
          label={t('Save task')}
          awake={savable}
          onPress={() => {
            if (!savable) return;
            onSave({
              name: name.trim(),
              schedule,
              // A one-day task's two dates are one fact — the store enforces it
              // too, and this is the half that keeps the sheet honest about what
              // it is about to send.
              startedOn: kind === 'once' ? onceDay : startedOn,
              reminder,
            });
          }}
        />
        <SheetCancel label={t('Cancel')} onDismiss={onDismiss} />
      </View>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */

/** `(.34,1.3,.64,1)` over 420 ms — the button waking when a name appears. */
const WAKE_CURVE = [0.34, 1.3, 0.64, 1] as const;
const WAKE_MS = 420;

/**
 * `✓ Save task`, 58 tall on the theme gradient — ASLEEP at half opacity and
 * .94 scale until the task is savable, and waking on a spring the moment it is.
 *
 * Asleep rather than hidden or greyed-out-and-identical: the button stays where
 * the thumb will look for it, and the wake is the sheet's way of saying "that is
 * enough to save" without a word. It still answers a press while asleep — the
 * hint text above it says why nothing happened.
 */
function SaveButton({
  label,
  awake,
  onPress,
}: {
  label: string;
  awake: boolean;
  onPress: () => void;
}) {
  const wake = useRef(new Animated.Value(awake ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(wake, {
      toValue: awake ? 1 : 0,
      duration: WAKE_MS,
      easing: curve(WAKE_CURVE),
      useNativeDriver: true,
    }).start();
  }, [awake, wake]);
  // Built once: the sheet re-renders on every keystroke in the name field, and
  // a fresh interpolation node per render makes this view re-attach its graph.
  const style = useMemo(
    () => ({
      opacity: wake.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }),
      transform: [{ scale: wake.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
    }),
    [wake],
  );

  return (
    <Animated.View style={style}>
      <BubblePressable
        onPress={onPress}
        radius="pill"
        bubbleColor={palette.onAcc}
        accessibilityRole="button"
        accessibilityState={{ disabled: !awake }}
        accessibilityLabel={label}
        style={
          awake
            ? { boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 34, color: tint(0.45) }] }
            : undefined
        }
        className="h-[58px] flex-row items-center justify-center rounded-pill"
      >
        <GradientFill />
        <Icon name="check" size={20} color={palette.onAcc} />
        <Text className="ml-sm text-[17px] font-semibold" style={{ color: palette.onAcc }}>
          {label}
        </Text>
      </BubblePressable>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */

/**
 * A date, stated, that opens the grid under it.
 *
 * The date is on the ROW rather than only inside the picker, so the common case
 * — leave it alone — never costs a tap to confirm what it is set to.
 */
function DateRow({
  label,
  value,
  open,
  onToggle,
}: {
  label: string;
  value: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <View className="mt-lg">
      <Kicker className="mb-sm">{label}</Kicker>
      <PrimaryButton label={value} variant={open ? 'primary' : 'ghost'} onPress={onToggle} />
    </View>
  );
}
