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
 *   │ REMIND AGAIN                               │
 *   │ ╭Off╮ 15 min  30 min  1 h  2 h  3 h        │
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
 *
 * ── `REMIND AGAIN` IS UNDER THE WHEEL, AND IT IS `OFF` UNTIL ASKED ────────
 *
 * It only exists once there is a reminder, and it starts at one alert, for the
 * same reason the switch starts off. The chips are the spacing, and the
 * stopping rule is fixed rather than a field: it stops when the day is
 * answered or over (`lib/reminders.ts`). "Stop after N times" was the
 * alternative, and it asks for a number nobody has an opinion about.
 *
 * And a one-day task gets `Today` / `Tomorrow` beside its date, because those
 * two are nearly every one-day task ever typed, and the month grid is three
 * taps for either.
 *
 * ── WHAT KIND OF TASK, AS SWITCHES UNDER THE NAME (Wave 2) ───────────────
 *
 * `A target, counted in parts` (T1) is a switch that opens a ± and a row of
 * unit chips. A switch rather than a fourth `Repeats` segment, because it is
 * not a schedule: "8 glasses" asks every day or on Mondays just the same. The
 * number moves on ± only (`stepTarget`), never the system keyboard — a number
 * in a form here is always chips. The unit is a word, so `+ unit` does open
 * a text field: glasses / pages / minutes cover most targets, and "times" is
 * the empty unit rather than a stored English word, so it follows the app's
 * language. The presets are stored in the language they were picked in.
 *
 * `A number of times per week` (T2) IS a schedule — "any 3 days" — so turning
 * it on folds `Repeats` away rather than leaving two answers to one question;
 * turning it off brings back whatever the segments last said. 1–7 on ±.
 *
 * `Avoid this` (T7) only rewords the task — done becomes "avoided" — so it is
 * a plain switch. It and the target exclude each other (switching one on
 * switches the other off): a count of things avoided is not a thing.
 *
 * ── A DRAFT IS NOT THROWN AWAY BY A STRAY TAP ─────────────────────────────
 *
 * Scrim, handle, back and `Cancel` used to drop whatever was typed. Now, when
 * saving would write something different from what was opened
 * (`lib/sheetDirty.ts`), they ask "Discard changes?" — `Keep editing` first,
 * under the thumb and on the scrim, `Discard` in coral. An untouched sheet still
 * closes on one tap. And the keyboard's ✓ saves, when `Save task` would
 * (`lib/sheetSubmit.ts`), so a name-only task never needs the reach past it.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Keyboard, Text, View } from 'react-native';

import { BubblePressable } from './bubbles';
import { ConfirmSheet } from './ConfirmSheet';
import { DayPicker } from './DayPicker';
import { Icon } from './Icon';
import { MaterialSymbol } from './MaterialSymbol';
import { Sheet, SheetCancel, type SheetGuard } from './Sheet';
import { TimeWheel } from './TimeWheel';
import {
  FieldWell,
  GradientFill,
  Kicker,
  PrimaryButton,
  Segmented,
  SelectChip,
  Separator,
  StepperRow,
  SwitchRow,
  Toggle,
} from './primitives';
import { dayKey, formatLongDay, shiftDay, weekdayLabels } from '../lib/days';
import { editorBack } from '../lib/editorLeave';
import { ensureNotificationPermission } from '../lib/notify';
import { taskDraftChanged } from '../lib/sheetDirty';
import { taskSavable } from '../lib/sheetSubmit';
import { useLanguage, useT } from '../hooks/useT';
import {
  REMIND_AGAIN_MINUTES,
  UNIT_MAX,
  WEEKLY_MAX,
  formatInterval,
  stepTarget,
  type TaskReminder,
  type TaskSchedule,
  type TaskTarget,
  type Weekday,
} from '../lib/tasks';
import { curve, palette } from '../theme/tokens';

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
  /** A target counted in parts (T1), or null for a one-tap task. */
  target: TaskTarget | null;
  /** A habit to avoid (T7): done means held off. Never with a target. */
  avoid: boolean;
}

/** What `A target, counted in parts` starts at when switched on. */
const DEFAULT_TARGET = 8;
/** What `A number of times per week` starts at: the design's Растяжка, 3. */
const DEFAULT_PER_WEEK = 3;

/** The unit chips, in English; each is stored in the language it was picked in. */
const UNIT_PRESETS = ['glasses', 'pages', 'minutes'] as const;

interface TaskEditorSheetProps {
  title: string;
  /** Absent for a new task. */
  name?: string;
  schedule?: TaskSchedule;
  startedOn?: string;
  reminder?: TaskReminder | null;
  target?: TaskTarget | null;
  avoid?: boolean;
  onSave: (draft: TaskDraft) => void;
  onDismiss: () => void;
}

export function TaskEditorSheet({
  title,
  name: initialName = '',
  schedule: initialSchedule = { kind: 'daily' },
  startedOn: initialStartedOn,
  reminder: initialReminder = null,
  target: initialTarget = null,
  avoid: initialAvoid = false,
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
      : // A weekly task's segments sit on `Every day` — what switching it off gives.
        initialSchedule.kind === 'weekly'
        ? 'daily'
        : initialSchedule.kind,
  );
  /** `A number of times per week` (T2): N, or null while the switch is off. */
  const [perWeek, setPerWeek] = useState<number | null>(
    initialSchedule.kind === 'weekly' ? initialSchedule.times : null,
  );
  const [days, setDays] = useState<readonly Weekday[]>(
    initialSchedule.kind === 'weekdays' ? initialSchedule.days : [0, 2, 4],
  );
  const kind =
    perWeek !== null ? 'weekly' : mode === 'workdays' || mode === 'pick' ? 'weekdays' : mode;
  const [onceDay, setOnceDay] = useState(
    initialSchedule.kind === 'once' ? initialSchedule.day : shiftDay(today, 1),
  );
  const [startedOn, setStartedOn] = useState(initialStartedOn ?? today);
  /** Which of the two dates the grid is pointing at, or neither. */
  const [datePicker, setDatePicker] = useState<'start' | 'once' | null>(null);
  const [reminder, setReminder] = useState<TaskReminder | null>(initialReminder);
  /** The permission was asked for when the switch went on, and refused. */
  const [blocked, setBlocked] = useState(false);
  const [target, setTarget] = useState<TaskTarget | null>(initialTarget);
  const [avoid, setAvoid] = useState(initialAvoid);
  /** `+ unit` was tapped, or the saved unit is none of the presets. */
  const presetUnits = UNIT_PRESETS.map((unit) => t(unit));
  const [customUnit, setCustomUnit] = useState(
    initialTarget !== null &&
      initialTarget.unit !== '' &&
      !presetUnits.includes(initialTarget.unit),
  );

  const schedule: TaskSchedule =
    perWeek !== null
      ? { kind: 'weekly', times: perWeek }
      : kind === 'daily'
        ? { kind: 'daily' }
        : kind === 'once'
          ? { kind: 'once', day: onceDay }
          : { kind: 'weekdays', days: mode === 'workdays' ? WORKDAYS : days };

  /*
   * A one-day task for today, set to remind at a minute that has already gone,
   * would save fine and then say nothing, which looks exactly like a broken
   * reminder. Said here, while the wheel is still under the thumb.
   */
  const now = new Date();
  const reminderPassed =
    reminder !== null &&
    kind === 'once' &&
    onceDay === today &&
    reminder.hour * 60 + reminder.minute <= now.getHours() * 60 + now.getMinutes();

  // A task with no name is not a task, and one that asks on no day never asks.
  const savable = taskSavable(name, mode === 'pick' && perWeek === null ? days : null);

  /** What `Save task` would send — and so what a close would lose. */
  const draft: TaskDraft = {
    name: name.trim(),
    schedule,
    // A one-day task's two dates are one fact — the store enforces it too, and
    // this is the half that keeps the sheet honest about what it is about to send.
    startedOn: kind === 'once' ? onceDay : startedOn,
    reminder,
    target: target ? { count: target.count, unit: target.unit.trim() } : null,
    avoid: avoid && target === null,
  };
  // What the sheet opened with, frozen: the props are the saved task.
  const opened = useRef<TaskDraft>({
    name: initialName,
    schedule: initialSchedule,
    startedOn: initialSchedule.kind === 'once' ? initialSchedule.day : (initialStartedOn ?? today),
    reminder: initialReminder,
    target: initialTarget,
    avoid: initialAvoid,
  }).current;
  const dirty = taskDraftChanged(opened, draft);

  const save = () => {
    if (savable) onSave(draft);
  };

  /** The held exit, waiting on "Discard changes?". */
  const [pendingClose, setPendingClose] = useState<(() => void) | null>(null);
  const guard: SheetGuard = (proceed) => {
    if (editorBack(dirty) === 'leave') return true;
    // The question is answered with a tap, not typed into: left up, the
    // keyboard would only lift it to mid-screen, over a draft nobody is editing.
    Keyboard.dismiss();
    setPendingClose(() => proceed);
    return false;
  };

  const MODES = [
    { value: 'daily' as const, label: t('Every day') },
    { value: 'workdays' as const, label: t('Weekdays') },
    { value: 'pick' as const, label: t('Pick days') },
    { value: 'once' as const, label: t('Once') },
  ];

  return (
    <>
      <Sheet title={title} onDismiss={onDismiss} guard={guard}>
        <Kicker className="mb-sm">{t('Name')}</Kicker>
        <FieldWell
          value={name}
          size="body"
          lit
          placeholder={t('What are you asking yourself to do?')}
          onChangeText={setName}
          onSubmitEditing={save}
          autoFocus={initialName === ''}
          accessibilityLabel={t('Task name')}
        />

        {/* What kind of task (Wave 2): switches, each opening its own few
            controls. See the header. */}
        <View className="mt-md overflow-hidden rounded-surface bg-surface-alt">
          <SwitchRow
            label={t('A target, counted in parts')}
            hint={t('The circle fills by parts · +1 per tap')}
            value={target !== null}
            onChange={(on) => {
              setTarget(on ? { count: DEFAULT_TARGET, unit: '' } : null);
              // A count is something done, not something avoided: one or the other.
              if (on) setAvoid(false);
            }}
          />
          {target ? (
            <>
              <StepperRow
                label={t('Target')}
                value={`${target.count} ${target.unit.trim() || t('times')}`}
                onDecrease={() => setTarget({ ...target, count: stepTarget(target.count, -1) })}
                onIncrease={() => setTarget({ ...target, count: stepTarget(target.count, 1) })}
              />
              <View className="flex-row flex-wrap px-lg pb-sm">
                <SelectChip
                  label={t('times')}
                  selected={!customUnit && target.unit === ''}
                  onPress={() => {
                    setCustomUnit(false);
                    setTarget({ ...target, unit: '' });
                  }}
                />
                {presetUnits.map((unit) => (
                  <SelectChip
                    key={unit}
                    label={unit}
                    selected={!customUnit && target.unit === unit}
                    onPress={() => {
                      setCustomUnit(false);
                      setTarget({ ...target, unit });
                    }}
                  />
                ))}
                <SelectChip
                  label={`+ ${t('unit')}`}
                  selected={customUnit}
                  onPress={() => {
                    setCustomUnit(true);
                    // A preset carried into the field would have to be deleted first.
                    if (presetUnits.includes(target.unit)) setTarget({ ...target, unit: '' });
                  }}
                />
              </View>
              {customUnit ? (
                <View className="px-lg pb-md">
                  <FieldWell
                    value={target.unit}
                    size="body"
                    placeholder={t('e.g. km, push-ups, pages')}
                    onChangeText={(unit) => setTarget({ ...target, unit: unit.slice(0, UNIT_MAX) })}
                    autoFocus
                    accessibilityLabel={t('Unit')}
                  />
                </View>
              ) : null}
            </>
          ) : null}
          <Separator inset={16} />
          <SwitchRow
            label={t('A number of times per week')}
            hint={t('Any days you like · the streak counts weeks')}
            value={perWeek !== null}
            onChange={(on) => {
              setPerWeek(on ? DEFAULT_PER_WEEK : null);
              setDatePicker(null);
            }}
          />
          {perWeek !== null ? (
            <StepperRow
              label={t('Times a week')}
              hint={t('A day not done is not a miss; the week is what counts.')}
              value={t('{n} × a week', { n: perWeek })}
              onDecrease={() => setPerWeek(Math.max(1, perWeek - 1))}
              onIncrease={() => setPerWeek(Math.min(WEEKLY_MAX, perWeek + 1))}
            />
          ) : null}
          <Separator inset={16} />
          <SwitchRow
            label={t('Avoid this')}
            hint={t('A habit to not do · tap when you held off')}
            value={avoid}
            onChange={(on) => {
              setAvoid(on);
              if (on) setTarget(null);
            }}
          />
        </View>

        {/* `Repeats` answers which days; a weekly task answers "any of them", so
            the switch above replaces it rather than sitting beside it. */}
        {perWeek === null ? (
          <>
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
          </>
        ) : null}

        {mode === 'pick' && perWeek === null ? (
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
            <View className="mt-md flex-row flex-wrap">
              <SelectChip
                label={t('Today')}
                selected={onceDay === today}
                onPress={() => setOnceDay(today)}
              />
              <SelectChip
                label={t('Tomorrow')}
                selected={onceDay === shiftDay(today, 1)}
                onPress={() => setOnceDay(shiftDay(today, 1))}
              />
            </View>
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
            <Text className="mt-[1px] text-[13.5px] text-ink-faint">
              {reminder
                ? kind === 'once'
                  ? t('A notification with this task, at the time you set.')
                  : t('The phone will ask on the days this task asks.')
                : t('Off')}
            </Text>
          </View>
          <Toggle
            value={reminder !== null}
            // 07:00 rather than the current time: a reminder is a thing you want
            // in the morning far more often than you want it at 14:36. Except on a
            // one-day task for TODAY, where 07:00 has usually gone, so it is the
            // next whole hour instead.
            onChange={(on) => {
              setReminder(on ? defaultReminder(kind === 'once' && onceDay === today) : null);
              if (on)
                void ensureNotificationPermission().then((state) =>
                  setBlocked(state !== 'granted'),
                );
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
              onChange={(hour, minute) => setReminder({ ...reminder, hour, minute })}
            />
            {reminderPassed ? (
              <Text className="mt-sm text-label text-ink-faint">
                {t('That time has already passed today, so pick a later one.')}
              </Text>
            ) : null}

            <Kicker className="mb-sm mt-lg">{t('Remind again')}</Kicker>
            <View className="flex-row flex-wrap">
              <SelectChip
                label={t('Off')}
                selected={!reminder.every}
                onPress={() => setReminder({ hour: reminder.hour, minute: reminder.minute })}
              />
              {REMIND_AGAIN_MINUTES.map((minutes) => (
                <SelectChip
                  key={minutes}
                  label={formatInterval(minutes, lang)}
                  selected={reminder.every === minutes}
                  onPress={() => setReminder({ ...reminder, every: minutes })}
                />
              ))}
            </View>
            <Text className="mt-sm text-label text-ink-faint">
              {reminder.every
                ? t('Every {interval} after that, until you tick it off or the day ends.', {
                    interval: formatInterval(reminder.every, lang),
                  })
                : t('Just the one notification.')}
            </Text>
          </View>
        ) : null}

        {savable ? null : (
          <Text className="mt-sm text-label text-ink-faint">
            {name.trim() === '' ? t('Give it a name.') : t('Pick at least one day.')}
          </Text>
        )}

        <View style={{ marginTop: 18 }}>
          <SaveButton label={t('Save task')} awake={savable} onPress={save} />
          <SheetCancel label={t('Cancel')} onDismiss={onDismiss} />
        </View>
      </Sheet>

      {pendingClose ? (
        <ConfirmSheet
          tone="danger"
          title={t('Discard changes?')}
          body={
            initialName === ''
              ? t('This task hasn’t been saved.')
              : t('Your changes to this task aren’t saved yet.')
          }
          confirmLabel={t('Discard changes')}
          cancelLabel={t('Keep editing')}
          onConfirm={() => {
            const proceed = pendingClose;
            setPendingClose(null);
            proceed();
          }}
          onCancel={() => setPendingClose(null)}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */

/** 07:00, or the next whole hour when the reminder is for later today. */
function defaultReminder(forToday: boolean): TaskReminder {
  if (!forToday) return { hour: 7, minute: 0 };
  return { hour: Math.min(23, new Date().getHours() + 1), minute: 0 };
}

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
