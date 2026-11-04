/**
 * TasksHistoryScreen — the month and the line, behind the ⟲.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹ TASK HISTORY      ╭ Month ╮╭ Year ╮╭ Trend ╮ │
 *   │        ‹   September 2026   ›                │
 *   │  M  T  W  T  F  S  S                         │
 *   │  ▢  ▣  ▤  ▥  ▦  ▢  ▢                         │
 *   │  …                                           │
 *   └──────────────────────────────────────────────┘
 *
 * ── WHY THIS IS A SCREEN AND NOT TWO MORE SEGMENTS ─────────────────────────
 *
 * It was `Day | Month | Trend` at the top of the tasks tab, which made the grid
 * and the line two thirds of a control the user passes through on the way to the
 * thing they open the app for. Worse, the same three-way switch existed in three
 * different shapes across the app — a segmented control here, a segmented control
 * in History, and a scroll to the bottom of the money.
 *
 * The past of a section now lives behind one glyph in that section's corner, the
 * same glyph in the same place in all three. `Day` is not a view any more: it is
 * the tasks screen. What is left in here is genuinely one question — how has this
 * been going — at two zoom levels, which is what the segmented control is for.
 *
 * A day on which every task that asked was excused — a pause (T3) — is drawn
 * HATCHED rather than on the green scale, and is out of the month's count: it is
 * not a score, and no step of green can say "not counted".
 *
 * YEAR (T5) is the same question at the widest zoom: twelve rows of thirty-one
 * squares, for the whole list or one task, drawn by `lib/yearPixels.ts` on the
 * month's own rules. It sits between the two because it is a grid like Month
 * and a span like Trend. A tap there does NOT open the day — a 10 dp square is
 * too easy to hit by accident to navigate on — it names the day in a line under
 * the grid, with `Open this day` beside it for when that is what you wanted.
 *
 * Picking a day in the grid still opens it, which is the one thing the grid is
 * for: walking back three weeks with the `‹` pager is twenty-one taps. It closes
 * this screen on the way, because the day it selected is on the one underneath.
 */

import { useMemo, useState } from 'react';
import { ScrollView, Text, View, type GestureResponderEvent } from 'react-native';
import { Pressable } from '../components/Pressable';
import { StatusBar } from 'expo-status-bar';

import { Hatch } from '../components/Hatch';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { SettingsFootRow } from '../components/SettingsFootRow';
import { WrappedHistoryFoot } from '../components/WrappedEntry';
import type { WrappedPeriod } from '../lib/wrapped';
import { TrendChart } from '../components/TrendChart';
import { pressedStyle } from '../components/motion';
import {
  GlassCard,
  Kicker,
  Segmented,
  SelectChip,
  StatTile,
  TextButton,
} from '../components/primitives';
import { useLanguage, usePlural, useT, type Translate } from '../hooks/useT';
import { WEEKDAY_INITIALS, dayKey, formatShortDay, monthNames, parseDay } from '../lib/days';
import { tap } from '../lib/feedback';
import {
  type DayCell,
  type Task,
  type TaskLog,
  summarizeTaskTrend,
  taskTrendSeries,
  tasksMonth,
} from '../lib/tasks';
import { TREND_RANGES, TREND_RANGE_LABELS, type TrendRange } from '../lib/trends';
import {
  type HeatLevel,
  type Pixel,
  type PixelScope,
  describePixel,
  heatLevel,
  pixelAtPoint,
  pixelTaskChoices,
  pixelYears,
  yearPercent,
  yearPixels,
} from '../lib/yearPixels';
import { useSettings } from '../state/settingsStore';
import { useTasks } from '../state/tasksStore';
import { greenSteps, heat, palette } from '../theme/tokens';

/*
 * A function rather than a constant, because the labels are translated: a
 * module-level array would be frozen in whichever language the app started in.
 */
function views(t: Translate) {
  return [
    { value: 'month' as const, label: t('Month') },
    { value: 'year' as const, label: t('Year') },
    { value: 'trend' as const, label: t('Trend') },
  ];
}

interface TasksHistoryScreenProps {
  /** The day the tasks screen is showing, so the grid opens on its month. */
  selected: string;
  onBack: () => void;
  /** A square tapped: show that day on the screen underneath, and close. */
  onPickDay: (day: string) => void;
  /** `Settings ›` at the foot: the daily tasks' settings (U24). */
  onOpenSettings?: () => void;
  /** X1: open a Wrapped. Absent = no Wrapped row at the foot. */
  onOpenWrapped?: (period: WrappedPeriod) => void;
}

export function TasksHistoryScreen({
  selected,
  onBack,
  onPickDay,
  onOpenSettings,
  onOpenWrapped,
}: TasksHistoryScreenProps) {
  const t = useT();
  const tasks = useTasks((s) => s.tasks);
  const log = useTasks((s) => s.log);
  const today = dayKey(new Date());
  const [view, setView] = useState<'month' | 'year' | 'trend'>('month');

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />
      <ScreenHeader kicker={t('Task history')} onBack={onBack} bordered={false}>
        <View className="mt-md">
          <Segmented
            options={views(t)}
            value={view}
            onChange={setView}
            accessibilityLabel={t('Month, year or trend')}
          />
        </View>
      </ScreenHeader>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: 24, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {view === 'month' ? (
          <MonthView tasks={tasks} log={log} today={today} selected={selected} onPick={onPickDay} />
        ) : view === 'year' ? (
          <YearView tasks={tasks} log={log} today={today} selected={selected} onPick={onPickDay} />
        ) : (
          <TrendView tasks={tasks} log={log} today={today} />
        )}

        {/* X1: last month's Wrapped, at any time (and the year's, in its window). */}
        {onOpenWrapped ? <WrappedHistoryFoot onOpen={onOpenWrapped} /> : null}
        {/* U24: the tasks' settings, where you notice one is wrong. */}
        {onOpenSettings ? (
          <SettingsFootRow sectionLabel={t('Daily tasks settings')} onPress={onOpenSettings} />
        ) : null}
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ */

/**
 * THE WHOLE MONTH, every task at once.
 *
 * One square per day, filled by the share of that day that got done — five steps
 * of green rather than a number, because the point of a grid is a shape and a
 * grid of fractions is a spreadsheet. Tapping a square is how you get to that
 * day, which is the one thing the `‹ ›` pager makes slow: walking back three
 * weeks is twenty-one taps.
 */
function MonthView({
  tasks,
  log,
  today,
  selected,
  onPick,
}: {
  tasks: readonly Task[];
  log: TaskLog;
  today: string;
  selected: string;
  onPick: (day: string) => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const counted = usePlural();
  const start = parseDay(today) ?? new Date();
  const [cursor, setCursor] = useState(() => {
    const at = parseDay(selected) ?? start;
    return { year: at.getFullYear(), month: at.getMonth() };
  });

  const month = useMemo(
    () => tasksMonth(tasks, log, cursor.year, cursor.month, today, lang),
    [tasks, log, cursor, today, lang],
  );
  const atLatest = cursor.year === start.getFullYear() && cursor.month === start.getMonth();

  const step = (delta: number) => {
    const next = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
  };

  return (
    <>
      <View className="mx-lg flex-row items-center justify-center">
        <Pressable
          onPress={() => step(-1)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('The month before')}
          style={pressedStyle}
          className="h-hit w-[32px] items-center justify-center"
        >
          <Icon name="chevron-left" size={18} color={palette.inkMuted} />
        </Pressable>
        <Text className="mx-lg text-title font-semibold tabular-nums text-ink">{month.label}</Text>
        <Pressable
          onPress={() => step(1)}
          disabled={atLatest}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('The month after')}
          style={pressedStyle}
          className="h-hit w-[32px] items-center justify-center"
        >
          {atLatest ? null : <Icon name="chevron-right" size={18} color={palette.inkMuted} />}
        </Pressable>
      </View>

      <Text className="mx-lg mt-xs text-center text-label tabular-nums text-ink-muted">
        {month.asked === 0
          ? t('Nothing recorded this month')
          : t('{done} of {asked} done · {days} {dayWord}', {
              done: month.done,
              asked: month.asked,
              days: month.days,
              dayWord: counted(month.days, { one: t('day'), few: 'дня', many: t('days') }),
            })}
        {month.paused > 0 ? ` · ${t('{n} paused', { n: month.paused })}` : ''}
      </Text>

      <View className="mx-lg mt-lg flex-row">
        {WEEKDAY_INITIALS.map((initial, index) => (
          <Text
            key={`${initial}${index}`}
            className="flex-1 text-center text-micro font-semibold text-ink-faint"
          >
            {initial}
          </Text>
        ))}
      </View>

      <View className="mx-lg mt-sm">
        {month.weeks.map((week, index) => (
          <View key={index} className="flex-row">
            {week.map((cell, position) => (
              <MonthCell
                key={cell.date ?? `pad${position}`}
                cell={cell}
                selected={cell.date !== null && cell.date === selected}
                onPress={cell.date ? () => onPick(cell.date as string) : undefined}
              />
            ))}
            {/* The last week is short rather than padded — a trailing blank would
                draw squares for days that have not happened. */}
            {week.length < 7
              ? Array.from({ length: 7 - week.length }, (_, i) => (
                  <View key={`tail${i}`} className="flex-1" />
                ))
              : null}
          </View>
        ))}
      </View>

      <HeatLegend />

      <Text className="mx-lg mt-md text-label text-ink-faint">
        {t(
          'The fuller the bubble, the more of that day was done. Tap one to open it and answer its tasks.',
        )}{' '}
        {month.paused > 0
          ? t('Hatched days were paused: every task excused, and out of the count.')
          : ''}
      </Text>
    </>
  );
}

/**
 * LESS → MORE, and the hatch beside it. Shared by Month and Year: they are the
 * same four fills, and a key that differed between the two zoom levels would be
 * two scales.
 */
function HeatLegend() {
  const t = useT();
  return (
    <>
      {/* LESS → MORE. The grid is one colour at four distances, which is only
          readable if the scale itself is on screen once — drawn as the four fills
          it is actually made of rather than as a gradient, which is both honest
          and the only thing this renderer can draw without a native module. */}
      <View className="mx-lg mt-lg flex-row items-center">
        <Kicker>{t('Less')}</Kicker>
        <View className="mx-sm h-[6px] flex-1 flex-row overflow-hidden rounded-pill">
          {greenSteps().map((step) => (
            <View key={step} className="h-[6px] flex-1" style={{ backgroundColor: step }} />
          ))}
        </View>
        <Kicker>{t('More')}</Kicker>
        {/* The hatch is the one cell that is NOT on the scale, so it is keyed
            beside it rather than inside it (T3). */}
        <View
          className="ml-md overflow-hidden"
          style={{ width: 14, height: 14, borderRadius: 4 }}
          accessible={false}
        >
          <Hatch />
        </View>
        <Text className="ml-xs text-label text-ink-faint">{t('paused')}</Text>
      </View>
    </>
  );
}

/**
 * Five steps of fill, because a continuous opacity is a value nobody can read
 * back off a screen — and four states plus empty is what the eye can actually
 * count in a grid.
 *
 * The step is the BUBBLE's own alpha now rather than the cell's opacity. Dimming
 * the whole cell took the date down with the fill, so a quarter-done day was a
 * date you could not read; this leaves the numeral alone and only moves the
 * light behind it.
 */
function fillFor(fraction: number): string | null {
  return stepFill(heatLevel(fraction));
}

/** A heat level's fill: one of the four steps, or null for the empty one. */
function stepFill(level: HeatLevel): string | null {
  return level === 0 ? null : greenSteps()[level - 1];
}

function MonthCell({
  cell,
  selected,
  onPress,
}: {
  cell: DayCell;
  selected: boolean;
  onPress?: () => void;
}) {
  const t = useT();
  if (cell.day === null) return <View className="flex-1 p-[3px]" />;

  const fill = cell.isBlank ? null : fillFor(cell.fraction);
  // Every task that asked was excused: not a score, so not on the green scale.
  const paused = cell.paused;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={
        paused
          ? t('{day}, paused · not counted', { day: cell.day })
          : cell.isBlank
            ? t('{day}, nothing asked', { day: cell.day })
            : t('{day}, {done} of {asked}', { day: cell.day, done: cell.done, asked: cell.asked })
      }
      accessibilityState={{ selected }}
      style={pressedStyle}
      className="flex-1 p-[3px]"
    >
      <View
        className={[
          'aspect-square items-center justify-center overflow-hidden rounded-pill',
          fill === null && !cell.isBlank && !paused ? 'border border-ink-faint/30' : '',
        ].join(' ')}
        style={{
          backgroundColor: fill ?? undefined,
          // The app's one glow, spent here on the single square that is today.
          ...(cell.isToday
            ? {
                borderWidth: 1,
                borderColor: palette.greenBright,
                // `boxShadow`, not `elevation`: Android's elevation draws a far
                // wider shadow than the radius asked for, which on a 40 dp cell
                // is a smudge rather than a ring. See `theme/tokens.ts`.
              }
            : selected
              ? { borderWidth: 1, borderColor: palette.inkMuted }
              : {}),
        }}
      >
        {paused ? <Hatch /> : null}
        <Text
          className={[
            'text-label tabular-nums',
            // The two top steps are 60–82% c2, close enough to a fill that the
            // numeral takes `onAcc` like any other text on c2; ink below that.
            paused
              ? 'text-ink-muted'
              : cell.isBlank
                ? 'text-ink-faint'
                : cell.fraction >= 0.75
                  ? 'font-medium text-on-acc'
                  : cell.fraction >= 0.5
                    ? 'font-medium text-ink'
                    : 'text-ink-faint',
          ].join(' ')}
        >
          {cell.day}
        </Text>
      </View>
    </Pressable>
  );
}

/** The month initials' gutter, and the gap between rows that makes room for them. */
const PIXEL_LABEL = 16;
const PIXEL_ROW_GAP = 2;

/**
 * THE YEAR, one square a day (T5) — for every task, or one.
 *
 * Twelve rows of thirty-one: the whole year inside 328 dp with no sideways
 * scroll (see `lib/yearPixels.ts` for why not 53 week-columns). One press
 * target for the grid, not one per square — `pixelAtPoint` turns the touch into
 * a day — and the tap NAMES the day rather than leaving: the line under the grid
 * says what it holds, and `Open this day` is there for when you meant to go.
 */
function YearView({
  tasks,
  log,
  today,
  selected,
  onPick,
}: {
  tasks: readonly Task[];
  log: TaskLog;
  today: string;
  selected: string;
  onPick: (day: string) => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const choices = useMemo(() => pixelTaskChoices(tasks), [tasks]);
  const span = useMemo(() => pixelYears(tasks, today), [tasks, today]);
  const [year, setYear] = useState(() => Number((selected || today).slice(0, 4)) || span.last);
  const [scope, setScope] = useState<PixelScope>('all');
  const [picked, setPicked] = useState<string | null>(null);
  const [width, setWidth] = useState(0);

  // A task archived while it was chosen falls back to the whole list.
  const one = scope === 'all' ? null : (choices.find((task) => task.id === scope) ?? null);
  const shown: PixelScope = one ? one.id : 'all';
  const pixels = useMemo(
    () => yearPixels(tasks, log, year, today, shown),
    [tasks, log, year, today, shown],
  );
  const pickedPixel: Pixel | null = useMemo(() => {
    if (!picked || Number(picked.slice(0, 4)) !== year) return null;
    const month = pixels.months[Number(picked.slice(5, 7)) - 1];
    return month?.cells[Number(picked.slice(8, 10)) - 1] ?? null;
  }, [picked, pixels, year]);
  const percent = yearPercent(pixels);

  const stepYear = (delta: number) => {
    tap();
    setYear((current) => Math.min(span.last, Math.max(span.first, current + delta)));
    setPicked(null);
  };

  const onGridPress = (event: GestureResponderEvent) => {
    const { locationX, locationY } = event.nativeEvent;
    const hit = pixelAtPoint(locationX, locationY, width, PIXEL_LABEL, year, PIXEL_ROW_GAP);
    if (!hit) return;
    tap();
    setPicked(hit.date);
  };

  return (
    <>
      {/* Which tasks: a set too long for a segmented control, so chips that
          scroll — the GRID never does. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16 }}
        accessibilityLabel={t('Which tasks the year shows')}
      >
        <SelectChip
          label={t('All tasks')}
          selected={shown === 'all'}
          onPress={() => {
            tap();
            setScope('all');
          }}
        />
        {choices.map((task) => (
          <SelectChip
            key={task.id}
            label={task.name}
            selected={shown === task.id}
            onPress={() => {
              tap();
              setScope(task.id);
            }}
          />
        ))}
      </ScrollView>

      <View className="mx-lg mt-md flex-row items-center">
        <Pressable
          onPress={() => stepYear(-1)}
          disabled={year <= span.first}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('The year before')}
          style={pressedStyle}
          className="h-hit w-[32px] items-center justify-center"
        >
          {year <= span.first ? null : (
            <Icon name="chevron-left" size={18} color={palette.inkMuted} />
          )}
        </Pressable>
        <Kicker className="flex-1 text-center">
          {`${year} · ${t('Year in pixels')}`}
          {percent === null ? '' : ` · ${percent}%`}
        </Kicker>
        <Pressable
          onPress={() => stepYear(1)}
          disabled={year >= span.last}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('The year after')}
          style={pressedStyle}
          className="h-hit w-[32px] items-center justify-center"
        >
          {year >= span.last ? null : (
            <Icon name="chevron-right" size={18} color={palette.inkMuted} />
          )}
        </Pressable>
      </View>

      <Pressable
        onPress={onGridPress}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        accessibilityRole="button"
        accessibilityLabel={t('{year}: {done} of {asked} done. Tap a square to see that day.', {
          year,
          done: pixels.done,
          asked: pixels.asked,
        })}
        className="mx-lg mt-sm"
      >
        {/* Children take no touches, so the press's location is always
            relative to the grid itself and not to whichever square was hit. */}
        <View pointerEvents="none">
          {pixels.months.map((month, index) => (
            <View
              key={month.month}
              className="flex-row"
              style={{ marginBottom: index < 11 ? PIXEL_ROW_GAP : 0 }}
            >
              <View style={{ width: PIXEL_LABEL }} className="justify-center">
                <Text
                  className="text-micro font-semibold text-ink-faint"
                  style={{ position: 'absolute', left: 0, top: '50%', marginTop: -8 }}
                >
                  {monthNames(lang)[month.month].slice(0, 1)}
                </Text>
              </View>
              {month.cells.map((pixel) => (
                <PixelSquare
                  key={pixel.day}
                  pixel={pixel}
                  selected={pixel.date !== null && pixel.date === picked}
                />
              ))}
            </View>
          ))}
        </View>
      </Pressable>

      {/* The day axis: where 1, 10, 20 and 31 fall, so a square can be counted to.
          Each label is centred on its column inside a box that starts where the
          squares do, so the percentages are of the grid and not of the gutter. */}
      <View className="mx-lg mt-xs flex-row">
        <View style={{ width: PIXEL_LABEL }} />
        <View className="h-[16px] flex-1">
          {[1, 10, 20, 31].map((day) => (
            <Text
              key={day}
              className="absolute text-center text-micro tabular-nums text-ink-faint"
              style={{ left: `${((day - 0.5) / 31) * 100}%`, width: 24, marginLeft: -12 }}
            >
              {day}
            </Text>
          ))}
        </View>
      </View>

      <GlassCard className="mx-lg mt-md flex-row items-center px-lg py-md">
        <Text className="flex-1 text-label tabular-nums text-ink">
          {pickedPixel
            ? describePixel(pickedPixel, one, lang)
            : t('Tap any square to see that day.')}
        </Text>
        {pickedPixel?.date && pickedPixel.date <= today ? (
          <TextButton
            label={t('Open this day')}
            onPress={() => onPick(pickedPixel.date as string)}
          />
        ) : null}
      </GlassCard>

      <HeatLegend />

      <Text className="mx-lg mt-md text-label text-ink-faint">
        {t(
          'One row a month, one square a day. Hatched days were excused and are out of the count; empty squares asked for nothing.',
        )}
      </Text>
    </>
  );
}

/**
 * One day of the year: a heat step, the empty step, the quiet fill of a day
 * with nothing to say, or the hatch. A hole (30 February) keeps its slot and
 * draws nothing, so every column stays a day of the month.
 */
function PixelSquare({ pixel, selected }: { pixel: Pixel; selected: boolean }) {
  const fill =
    pixel.kind === 'score'
      ? (stepFill(pixel.level) ?? heat.empty)
      : pixel.kind === 'blank' || pixel.kind === 'future'
        ? heat.quiet
        : null;
  return (
    <View className="flex-1" style={{ aspectRatio: 1, padding: 1 }}>
      {pixel.kind === 'none' ? null : (
        <View
          className="flex-1 overflow-hidden"
          style={{
            borderRadius: 2,
            backgroundColor: fill ?? undefined,
            ...(selected
              ? { borderWidth: 1, borderColor: palette.ink }
              : pixel.isToday
                ? { borderWidth: 1, borderColor: palette.greenBright }
                : {}),
          }}
        >
          {pixel.kind === 'paused' ? <Hatch /> : null}
        </View>
      )}
    </View>
  );
}

/**
 * THE HABIT LINE — percent of each day's tasks done, over a range you pick.
 *
 * Percent rather than a count, because the denominator moves: a Monday asks for
 * nine things and a Sunday for six, and a line of raw counts would draw a weekly
 * sawtooth that is about the schedule rather than about the person.
 * `taskTrendSeries` owns that and every other rule the chart obeys.
 */
function TrendView({ tasks, log, today }: { tasks: readonly Task[]; log: TaskLog; today: string }) {
  const t = useT();
  const lang = useLanguage();
  /*
   * Seeded from the setting, and then the chips own it. A range that wrote itself
   * back to settings on every tap would make "which range does this open on" and
   * "which range am I looking at" the same fact, and then there would be no way to
   * glance at the year without changing what tomorrow opens on.
   */
  const opensOn = useSettings((s) => s.tasksTrendRange);
  const [range, setRange] = useState<TrendRange>(opensOn);
  const points = useMemo(
    () => taskTrendSeries(tasks, log, range, today),
    [tasks, log, range, today],
  );
  const summary = useMemo(() => summarizeTaskTrend(points), [points]);

  return (
    <>
      <View className="mx-lg flex-row flex-wrap">
        {TREND_RANGES.map((option) => (
          <SelectChip
            key={option}
            label={t(TREND_RANGE_LABELS[option])}
            selected={option === range}
            onPress={() => {
              tap();
              setRange(option);
            }}
          />
        ))}
      </View>

      <View className="mx-lg mt-md flex-row gap-md">
        <StatTile
          label={t('Done')}
          value={`${summary.percent}%`}
          unit={t('of {asked}', { asked: summary.asked })}
          tone="green"
        />
        <StatTile
          label={t('Full days')}
          value={String(summary.perfectDays)}
          unit={t('of {asked}', { asked: summary.days })}
        />
      </View>

      {points.length >= 2 ? (
        <>
          <Kicker className="mx-lg mt-xl">{t('Percent done, day by day')}</Kicker>
          <View className="mx-lg mt-md">
            <TrendChart points={points} formatValue={(value) => `${Math.round(value)}%`} />
          </View>
          <Text className="mx-lg mt-sm text-label tabular-nums text-ink-faint">
            {t('{from} to {to} · {done} of {asked} answered done', {
              from: formatShortDay(points[0].day, lang),
              to: formatShortDay(points[points.length - 1].day, lang),
              done: summary.done,
              asked: summary.asked,
            })}
          </Text>
        </>
      ) : (
        <GlassCard className="mx-lg mt-xl p-lg">
          <Kicker>{t('Not enough yet')}</Kicker>
          <Text className="mt-sm text-body text-ink-muted">
            {t(
              'A line needs two days to have a direction. Answer today and tomorrow and it draws itself.',
            )}
          </Text>
        </GlassCard>
      )}

      <Text className="mx-lg mt-md text-label text-ink-faint">
        {t(
          'Days that asked for nothing are left out rather than plotted as zero — a day off is not a day you failed. A task you marked missed on purpose leaves the denominator.',
        )}
      </Text>
    </>
  );
}
