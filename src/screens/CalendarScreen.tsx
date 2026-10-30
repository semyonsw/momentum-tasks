/**
 * CalendarScreen — which days you trained.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ HISTORY          [ Log | Graphs | Calendar ] │
 *   │  …                                    ↑ older│
 *   │ AUGUST 2026 · 12 WORKOUTS                    │
 *   │  …                                           │
 *   │ SEPTEMBER 2026 · 8 WORKOUTS · 7 DAYS         │
 *   │  M  T  W  T  F  S  S                         │
 *   │     1  2 ▓3▓ 4 ▓5▓ 6                         │
 *   │ ▓7▓ 8 ▓9▓10 11 12 13                         │
 *   │ 14 15 16 17 18 19 20                    ▲ you│
 *   └──────────────────────────────────────────────┘
 *
 * ── IT RUNS THE WAY A WALL CALENDAR RUNS ───────────────────────────────────
 *
 * This month is at the BOTTOM and you climb up through the older ones. Every other
 * list in the app is newest-first, and this one is the exception on purpose: a
 * calendar is read rather than scanned, and reversing it puts the 30th of one month
 * directly above the 1st of the next, which reads as time running backwards down
 * the page.
 *
 * Which makes the opening scroll position load-bearing — see `settleToBottom`. A
 * chronological list that opened at the top would open on the oldest month in the
 * log, which for a three-year history is a screen full of 2023.
 *
 * The third view of the training history, and the one that answers a question the other
 * two cannot: not "what did I lift" and not "is it going up", but "how often am I
 * actually going". Sixteen rows of dates is not a shape; a grid with holes in it is.
 *
 * ── A DOT, AND THAT IS THE WHOLE VOCABULARY ────────────────────────────────
 *
 * A day either has training in it or it does not. No intensity scale, no colour
 * ramp by volume, no ring to close, and no streak counter anywhere — `lib/calendar.ts`
 * has the argument for why a calendar is a fact and a streak is not.
 *
 * The mark is an `acc` dot under the numeral (redesign #12), not a filled square:
 * a filled square read as a selected one, and now a day CAN be selected — so the
 * fact and the selection needed two different looks.
 *
 * Two workouts in one day get the same dot as one. That is deliberate: the
 * question is whether you trained, and a "2" in the corner of a square is a second
 * number nobody is asking for. The count is in the month's header line, where it is
 * a total rather than a grade.
 *
 * ── A DOT OPENS ITS WORKOUT ────────────────────────────────────────────────
 *
 * The Tasks and Finance calendars answer a tapped day; this one used to be a
 * picture you could not touch. Tapping a trained day selects it and puts a
 * preview row under that month — the workout's name and time, and `Open ›` —
 * which hands the id to the shell, and the shell opens it in the Log the way a
 * tap on Home's recent rows does (`focusWorkoutId`). A preview first rather than
 * jumping straight to the Log, because the calendar is read by scanning and a
 * mis-tapped square should not throw the reader out of it.
 *
 * ── EMPTY MONTHS ARE THE POINT ─────────────────────────────────────────────
 *
 * Every month between the first workout and this one is rendered, including the ones
 * with nothing in them. A calendar that skipped those would have no gaps in it, and
 * the gaps are the only thing on this screen that tells you something you did not
 * already know.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { Icon } from '../components/Icon';
import { Pressable } from '../components/Pressable';
import { pressedStyle } from '../components/motion';
import { ScreenHeader } from '../components/ScreenHeader';
import { Kicker } from '../components/primitives';
import {
  describeMonth,
  trainingMonths,
  type CalendarCell,
  type CalendarMonth,
} from '../lib/calendar';
import type { CompletedWorkout } from '../lib/completedWorkout';
import { formatMonth, weekdayInitials } from '../lib/days';
import { tap } from '../lib/feedback';
import { workoutsOnDay } from '../lib/pastWorkout';
import { formatTimeSpan } from '../lib/workoutEdit';
import { useLanguage, usePlural, useT, type Translate } from '../hooks/useT';
import type { PluralForms } from '../lib/i18n';
import { palette, tint } from '../theme/tokens';
import type { ID } from '../types/models';

interface CalendarScreenProps {
  workouts: CompletedWorkout[];
  /** The `Log | Graphs | Calendar` switch, owned by the tab. */
  toolbar?: ReactNode;
  /** `‹` — this screen is pushed by the ⟲ on the workout section now. */
  onBack?: () => void;
  /** `Open ›` on a day's preview row: show that workout in the Log. */
  onOpenWorkout?: (workoutId: ID) => void;
}

export function CalendarScreen({ workouts, toolbar, onBack, onOpenWorkout }: CalendarScreenProps) {
  const t = useT();
  const countedDays = usePlural();
  /*
   * One pass over the log, then one grid per month. Memoized on the log itself:
   * the index is a few thousand rows and the grids are pure arithmetic over it, so
   * neither needs rebuilding until a workout is added or deleted.
   */
  const months = useMemo(() => trainingMonths(workouts), [workouts]);
  const totalDays = useMemo(
    () => months.reduce((sum, month) => sum + month.daysTrained, 0),
    [months],
  );

  /** The trained day whose preview row is showing, `YYYY-MM-DD`. */
  const [selected, setSelected] = useState<string | null>(null);
  const onPick = useCallback((day: string) => {
    tap();
    setSelected((current) => (current === day ? null : day));
  }, []);

  const scrollRef = useRef<ScrollView>(null);
  /**
   * Whether the opening jump to the bottom has happened.
   *
   * ONCE, and never again: `onContentSizeChange` also fires when the grids finish
   * measuring, so an unguarded `scrollToEnd` would keep yanking the list down while
   * somebody is reading their way up through last spring.
   */
  const settled = useRef(false);

  /**
   * Land on THIS month.
   *
   * `animated: false`, because this is not a movement the user made — it is where
   * the screen starts, and animating it would look like the list scrolling away from
   * them. Fired from `onContentSizeChange` rather than an effect on mount, since at
   * mount the months have no measured height and `scrollToEnd` would have nothing to
   * scroll to.
   */
  const settleToBottom = useCallback(() => {
    if (settled.current) return;
    settled.current = true;
    scrollRef.current?.scrollToEnd({ animated: false });
  }, []);

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader
        kicker={t('Training history')}
        onBack={onBack}
        subtitle={
          workouts.length === 0
            ? t('Nothing finished yet')
            : t('{count} {days} trained', {
                count: totalDays,
                // `few` is Russian's own third form, so it is the Russian word.
                days: countedDays(totalDays, { one: t('day'), few: 'дня', many: t('days') }),
              })
        }
        bordered={false}
      >
        {toolbar}
      </ScreenHeader>

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={settleToBottom}
      >
        {months.length === 0 ? (
          <Text className="mx-lg mt-xl text-label text-ink-faint">
            {t('Finish a workout and the days you trained appear here.')}
          </Text>
        ) : (
          <>
            {months.map((month) => {
              const key = `${month.year}-${month.month}`;
              /* The preview goes under the month that holds the picked day, so it
                 appears where the thumb already is. */
              const holds =
                selected != null &&
                selected.startsWith(`${month.year}-${String(month.month + 1).padStart(2, '0')}-`);
              return (
                <Month key={key} month={month} selected={holds ? selected : null} onPick={onPick}>
                  {holds && selected ? (
                    <DayPreview
                      workouts={workoutsOnDay(workouts, selected)}
                      onOpen={onOpenWorkout}
                    />
                  ) : null}
                </Month>
              );
            })}
            <Text maxFontSizeMultiplier={1.3} className="mx-lg mt-lg text-label text-ink-faint">
              {t('A dot means you trained that day. Tap it to open the workout.')}
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ */

function Month({
  month,
  selected,
  onPick,
  children,
}: {
  month: CalendarMonth;
  /** The picked day, when it is in this month. */
  selected: string | null;
  onPick: (day: string) => void;
  /** The picked day's preview, under the grid. */
  children?: ReactNode;
}) {
  const lang = useLanguage();
  /* Read once per month and handed down: in each `Day` they were two store
     subscriptions per square — up to two thousand, mounted in one pass. */
  const t = useT();
  const countedWorkouts = usePlural();
  const summary = describeMonth(month, lang);

  return (
    <View className="mt-xl">
      {/* Green only when there is something in the month — the same rule the
          create screen's kickers follow: the accent means "this has content". */}
      <Kicker tone={month.total > 0 ? 'green' : 'faint'} className="mx-lg mb-sm">
        {formatMonth(month.year, month.month, lang)}
        {summary ? ` · ${summary}` : ''}
      </Kicker>

      <View className="mx-lg">
        {/* The column headings. `ink-faint` and micro, because they are a ruler
            rather than data — the same treatment the set index column gets. */}
        <View className="flex-row">
          {weekdayInitials(lang).map((initial, index) => (
            <View key={`${initial}-${index}`} className="flex-1 items-center py-xs">
              <Text className="text-micro font-semibold uppercase text-ink-faint">{initial}</Text>
            </View>
          ))}
        </View>

        {month.weeks.map((week, weekIndex) => (
          <View key={weekIndex} className="flex-row">
            {week.map((cell, dayIndex) => (
              <Day
                key={`${weekIndex}-${dayIndex}`}
                cell={cell}
                t={t}
                countedWorkouts={countedWorkouts}
                selected={cell.date != null && cell.date === selected}
                onPick={onPick}
              />
            ))}
            {/*
              The last week is SHORT rather than padded. A trailing pad would draw
              empty squares for days that have not happened yet, which reads as
              untrained instead of as future — so the row is filled with spacers
              that carry no square at all.
            */}
            {week.length < 7
              ? Array.from({ length: 7 - week.length }, (_, i) => (
                  <View key={`pad-${i}`} className="flex-1" />
                ))
              : null}
          </View>
        ))}
        {children}
      </View>
    </View>
  );
}

/**
 * One square.
 *
 * A trained day is its numeral in `ink` over an `acc` dot — the dot is the fact
 * (see the file header). An untrained day is the bare page with a faint numeral,
 * which is what "nothing here" should look like when most of a month is nothing.
 * The picked day is lit (acc-soft fill, acc outline), the same look a lit well
 * has, because it is the one the preview under the month is about.
 *
 * Only a trained day is a button: an empty square has nothing to open, and two
 * thousand Pressables mounted for days that answer nothing is cost for no use.
 */
function Day({
  cell,
  t,
  countedWorkouts,
  selected,
  onPick,
}: {
  cell: CalendarCell;
  t: Translate;
  countedWorkouts: (n: number, forms: PluralForms) => string;
  selected: boolean;
  onPick: (day: string) => void;
}) {
  if (cell.day == null) return <View className="flex-1 py-xs" />;

  const trained = cell.workouts > 0;
  const date = cell.date;

  const square = (
    <View
      className="h-[40px] w-[40px] items-center justify-center rounded-surface"
      style={
        selected
          ? { backgroundColor: tint(0.14), borderWidth: 1, borderColor: tint(0.45) }
          : undefined
      }
    >
      <Text
        className={[
          'text-label tabular-nums',
          trained ? 'font-semibold text-ink' : 'text-ink-faint',
        ].join(' ')}
      >
        {cell.day}
      </Text>
      {trained ? (
        <View
          style={{
            marginTop: 2,
            width: 5,
            height: 5,
            borderRadius: 2.5,
            backgroundColor: palette.acc,
          }}
        />
      ) : null}
    </View>
  );

  if (!trained || date == null) {
    return (
      <View
        accessible
        accessibilityLabel={`${cell.date}: ${t('no workout')}`}
        className="flex-1 items-center py-[2px]"
      >
        {square}
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => onPick(date)}
      hitSlop={{ top: 2, bottom: 2 }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${date}: ${t('{count} {workouts}', {
        count: cell.workouts,
        workouts: countedWorkouts(cell.workouts, {
          one: t('workout'),
          few: 'тренировки',
          many: t('workouts'),
        }),
      })}`}
      accessibilityHint={t('Shows the workout under the month')}
      style={pressedStyle}
      className="flex-1 items-center py-[2px]"
    >
      {square}
    </Pressable>
  );
}

/**
 * The picked day's workouts, one row each: name, clock times, `Open ›`. Usually
 * one row; two on a day with a morning and an evening session, which is the case
 * a single "open this day" button could not have answered.
 */
function DayPreview({
  workouts,
  onOpen,
}: {
  workouts: readonly CompletedWorkout[];
  onOpen?: (workoutId: ID) => void;
}) {
  const t = useT();
  return (
    <View className="mt-sm" style={{ gap: 8 }}>
      {workouts.map((workout) => {
        const span = formatTimeSpan(workout.startedAt, workout.endedAt);
        return (
          <Pressable
            key={workout.id}
            onPress={() => {
              tap();
              onOpen?.(workout.id);
            }}
            disabled={!onOpen}
            accessibilityRole="button"
            accessibilityLabel={`${workout.title}, ${span}. ${t('Open')}`}
            style={pressedStyle}
            className="min-h-[56px] flex-row items-center rounded-surface border border-hairline bg-surface px-md"
          >
            <View className="flex-1 pr-sm" style={{ minWidth: 0 }}>
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
                className="text-body font-medium text-ink"
              >
                {workout.title}
              </Text>
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
                className="text-label tabular-nums text-ink-muted"
              >
                {`${span} · ${t('{minutes} min', { minutes: workout.durationMinutes })}`}
              </Text>
            </View>
            <Text maxFontSizeMultiplier={1.3} className="text-label font-semibold text-acc">
              {t('Open')}
            </Text>
            <Icon name="chevron-right" size={16} color={palette.acc} />
          </Pressable>
        );
      })}
    </View>
  );
}
