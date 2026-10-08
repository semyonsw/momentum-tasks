/**
 * PauseSheet — vacation mode (T3): pick a run of days, excuse it for every task
 * or for the ones you choose, in one action.
 *
 *   ╭────────────────────────────────────────────╮
 *   │ Pause for a while                          │
 *   │ Paused days don't count: no streak lost…   │
 *   │ 12 – 18 OCTOBER · 7 DAYS                   │   green, once a day is tapped
 *   │        ‹  October 2026  ›                  │
 *   │  M  T  W  T  F  S  S                       │
 *   │           1  2  3  4                       │
 *   │ [12][13][14][15][16][17][18]               │   ends filled, between tinted
 *   │ All tasks                          [ ●━ ]  │
 *   │                        ( ॥ Pause 7 days )  │
 *   ╰────────────────────────────────────────────╯
 *
 * Reached from three doors — the row's hold menu, a task's own screen, and the
 * daily tasks' settings — and it is the same sheet behind all three, defaulting
 * to every task: a vacation is from the list, not from one row. Unticking `All
 * tasks` shows the rows to choose from.
 *
 * What it writes is the ordinary "missed on purpose" mark, day by day
 * (`excuseRange` in `lib/tasks.ts` has the argument), so the sheet holds no state
 * of its own past the pick: the caller is handed exactly the squares written and
 * raises the Undo toast with them. Rejected: a confirm step before writing — the
 * Undo is cheaper than a question, and nothing here is lost that the Undo cannot
 * put back.
 *
 * The CTA sits under the scroll rather than in it, so a long task list never
 * pushes it out of reach, and it is asleep (dimmed, untouchable) until there is a
 * range and something to pause.
 */

import { useMemo, useState } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { Icon } from './Icon';
import { Pressable } from './Pressable';
import { SheetFrame, SheetTitle } from './Sheet';
import { pressedStyle } from './motion';
import { PrimaryButton, SwitchRow } from './primitives';
import { useLanguage, useT } from '../hooks/useT';
import { dayKey, formatLongDay, formatMonth, parseDay, weekdayInitials } from '../lib/days';
import { tap } from '../lib/feedback';
import {
  canPause,
  describePauseRange,
  pauseDays,
  pauseMonth,
  pausableTasks,
  pauseTargets,
  pickPauseDay,
  type PauseCell,
  type PauseRange,
} from '../lib/pausePicker';
import type { ExcusedCell } from '../lib/tasks';
import type { ToastAction } from './glass';
import { useTasks } from '../state/tasksStore';
import { glass, palette, radius, tint } from '../theme/tokens';
import type { ID } from '../types/models';

interface PauseSheetProps {
  onDismiss: () => void;
  /** Written: the squares this pause excused, for the caller's Undo toast. */
  onPaused: (written: ExcusedCell[], days: number) => void;
}

export function PauseSheet({ onDismiss, onPaused }: PauseSheetProps) {
  const t = useT();
  const lang = useLanguage();
  const { height } = useWindowDimensions();
  const tasks = useTasks((s) => s.tasks);
  const pauseTasks = useTasks((s) => s.pauseTasks);

  const today = dayKey(new Date());
  const start = parseDay(today) ?? new Date();
  const [cursor, setCursor] = useState({ year: start.getFullYear(), month: start.getMonth() });
  const [range, setRange] = useState<PauseRange | null>(null);
  const [all, setAll] = useState(true);
  const [picked, setPicked] = useState<ID[]>([]);

  const live = useMemo(() => pausableTasks(tasks), [tasks]);
  const weeks = useMemo(
    () => pauseMonth(cursor.year, cursor.month, range, today),
    [cursor, range, today],
  );
  const targets = pauseTargets(tasks, all, picked);
  const ready = canPause(range, targets);
  const n = pauseDays(range);
  const rangeLine = describePauseRange(range, lang);

  const step = (delta: number) => {
    const next = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
  };

  const toggleTask = (id: ID) => {
    tap();
    setPicked((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  const commit = () => {
    if (!range || !ready) return;
    const written = pauseTasks(targets, range.from, range.to);
    onPaused(written, n);
  };

  return (
    <SheetFrame onDismiss={onDismiss}>
      <SheetTitle>{t('Pause for a while')}</SheetTitle>
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ maxHeight: Math.max(320, height * 0.6) }}
      >
        <Text className="mt-xs text-label text-ink-muted">
          {t("Paused days don't count: no streak lost, no misses.")}{' '}
          {t('Tap the first and last day.')}
        </Text>
        <Text
          maxFontSizeMultiplier={1.3}
          style={{ fontSize: 12.5, lineHeight: 16, letterSpacing: 1.1 }}
          className={[
            'mt-md font-semibold uppercase tabular-nums',
            rangeLine ? 'text-green-bright' : 'text-ink-faint',
          ].join(' ')}
        >
          {rangeLine ?? t('No days picked yet')}
        </Text>

        <View className="mt-sm flex-row items-center justify-center">
          <Pressable
            onPress={() => step(-1)}
            accessibilityRole="button"
            accessibilityLabel={t('The month before')}
            style={pressedStyle}
            className="h-[44px] w-[44px] items-center justify-center"
          >
            <Icon name="chevron-left" size={20} color={palette.inkMuted} />
          </Pressable>
          <Text
            maxFontSizeMultiplier={1.3}
            style={{ fontSize: 16 }}
            className="mx-sm font-medium tabular-nums text-ink"
          >
            {formatMonth(cursor.year, cursor.month, lang)}
          </Text>
          <Pressable
            onPress={() => step(1)}
            accessibilityRole="button"
            accessibilityLabel={t('The month after')}
            style={pressedStyle}
            className="h-[44px] w-[44px] items-center justify-center"
          >
            <Icon name="chevron-right" size={20} color={palette.inkMuted} />
          </Pressable>
        </View>

        <View className="mt-xs flex-row" style={{ gap: GAP }}>
          {weekdayInitials(lang).map((initial, index) => (
            <Text
              key={`${initial}${index}`}
              maxFontSizeMultiplier={1.3}
              style={{ fontSize: 12.5, lineHeight: 16 }}
              className="flex-1 text-center font-semibold uppercase text-ink-faint"
            >
              {initial}
            </Text>
          ))}
        </View>
        <View className="mt-[6px]">
          {weeks.map((week, index) => (
            <View
              key={index}
              className="flex-row"
              style={{ gap: GAP, marginTop: index === 0 ? 0 : GAP }}
            >
              {week.map((cell, position) =>
                cell ? (
                  <DayButton
                    key={cell.date}
                    cell={cell}
                    onPress={() => {
                      tap();
                      setRange((current) => pickPauseDay(current, cell.date));
                    }}
                  />
                ) : (
                  <View key={`pad${position}`} className="flex-1" />
                ),
              )}
              {week.length < 7
                ? Array.from({ length: 7 - week.length }, (_, i) => (
                    <View key={`tail${i}`} className="flex-1" />
                  ))
                : null}
            </View>
          ))}
        </View>

        <View
          className="mt-md overflow-hidden"
          style={{
            borderRadius: radius.row,
            borderWidth: 1,
            borderColor: glass.raisedEdge,
            backgroundColor: glass.raised,
          }}
        >
          <SwitchRow
            label={t('All tasks')}
            hint={all ? undefined : t('Tick the ones to pause')}
            value={all}
            onChange={(value) => {
              setAll(value);
              setPicked([]);
            }}
          />
        </View>

        {all
          ? null
          : live.map((task) => {
              const on = picked.includes(task.id);
              return (
                <Pressable
                  key={task.id}
                  onPress={() => toggleTask(task.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={task.name}
                  style={pressedStyle}
                  className="min-h-[48px] flex-row items-center px-sm"
                >
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 7,
                      borderWidth: 1.5,
                      borderColor: on ? palette.c2 : palette.inkFaint,
                      backgroundColor: on ? palette.c2 : 'transparent',
                    }}
                    className="items-center justify-center"
                  >
                    {on ? <Icon name="check" size={14} color={palette.onAcc} /> : null}
                  </View>
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.3}
                    className="ml-md flex-1 text-body text-ink"
                  >
                    {task.name}
                  </Text>
                </Pressable>
              );
            })}
        <View className="h-md" />
      </ScrollView>

      {/* Asleep until there is a range and a task: dimmed and untouchable, the
          amount editor's Save rule, rather than a button that answers "no". */}
      <View
        className="mt-sm"
        pointerEvents={ready ? 'auto' : 'none'}
        style={{ opacity: ready ? 1 : 0.4 }}
        accessibilityState={{ disabled: !ready }}
      >
        <PrimaryButton
          label={n <= 1 ? t('Pause 1 day') : t('Pause {n} days', { n })}
          onPress={commit}
        />
      </View>
    </SheetFrame>
  );
}

const GAP = 4;

function DayButton({ cell, onPress }: { cell: PauseCell; onPress: () => void }) {
  const t = useT();
  const lang = useLanguage();
  const fill = cell.edge ? palette.c2 : cell.inRange ? tint(0.24) : glass.sunken;
  const color = cell.edge ? palette.onAcc : cell.pickable ? palette.ink : palette.inkFaint;
  return (
    <Pressable
      onPress={onPress}
      disabled={!cell.pickable}
      accessibilityRole="button"
      accessibilityLabel={
        cell.inRange
          ? `${formatLongDay(cell.date, lang)}, ${t('paused')}`
          : formatLongDay(cell.date, lang)
      }
      accessibilityState={{ selected: cell.inRange, disabled: !cell.pickable }}
      style={pressedStyle}
      className="flex-1"
    >
      <View
        style={{
          height: 42,
          borderRadius: radius.cell,
          backgroundColor: fill,
          borderWidth: cell.isToday && !cell.edge ? 1 : 0,
          borderColor: palette.inkMuted,
        }}
        className="items-center justify-center"
      >
        <Text
          maxFontSizeMultiplier={1.3}
          style={{ fontSize: 14, fontWeight: '500', color }}
          className="tabular-nums"
        >
          {cell.day}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * The toast a finished pause raises, with its Undo — one helper because three
 * screens open this sheet and the sentence should not drift between them. A
 * pause that wrote nothing (every day already answered) says so and offers no
 * Undo, since there is nothing to take back.
 */
export function raisePauseToast(
  written: readonly ExcusedCell[],
  days: number,
  t: ReturnType<typeof useT>,
  onToast: (text: string, action?: ToastAction) => void,
  unpause: (cells: readonly ExcusedCell[]) => void,
): void {
  if (written.length === 0) {
    onToast(t('Nothing to pause: those days are already answered.'));
    return;
  }
  onToast(
    days <= 1
      ? t("Paused 1 day. It won't count.")
      : t("Paused {n} days. They won't count.", { n: days }),
    {
      label: t('Undo'),
      onPress: () => unpause(written),
    },
  );
}

/**
 * The door to this sheet on a task's own screen and in the tasks' settings: the
 * design's 56 dp glass row — glyph, sentence, chevron. The hold menu has its own
 * row shape and does not use this.
 */
export function PauseDoorRow({ onPress, hint }: { onPress: () => void; hint?: string }) {
  const t = useT();
  const label = t('Pause for a vacation…');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={pressedStyle}
    >
      <View
        style={{
          minHeight: 56,
          borderRadius: radius.row,
          borderWidth: 1,
          borderColor: glass.raisedEdge,
          backgroundColor: glass.sunken,
          paddingLeft: 16,
          paddingRight: 12,
        }}
        className="flex-row items-center"
      >
        <Icon name="pause" size={20} color={palette.greenBright} />
        <Text maxFontSizeMultiplier={1.3} className="ml-md flex-1 text-body text-ink">
          {label}
        </Text>
        <Icon name="chevron-right" size={16} color={palette.inkFaint} />
      </View>
    </Pressable>
  );
}
