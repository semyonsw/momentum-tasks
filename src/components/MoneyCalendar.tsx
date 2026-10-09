/**
 * MoneyCalendar — a month of spending as squares, the second view of the
 * finance history (M4).
 *
 *   ‹      September 2026      ›
 *        171,400 AMD spent
 *   ┌ WHOLE MONTH · NOT ON ANY DAY ───────────┐
 *   │ (🏠 Rent · 150,000) (📱 Phone · 5,900)   │
 *   └─────────────────────────────────────────┘
 *    M    T    W    T    F    S    S
 *        ▢1   ▣2   ▤3   ▥4   ▦5   ▢6
 *         ·  2.4k  900  12k  152k   ·
 *   ┌ 5 September · 152,400 AMD · 2 amounts   Open this day ┐
 *
 * Every rule — what counts as spending, where whole-month amounts go, what the
 * four steps mean — is `lib/moneyCalendar.ts`; this draws it.
 *
 * Each square prints its spend in a COMPACT figure (`152k`) under the date,
 * because a heat grid alone answers "which day" and never "how much", and the
 * second question is the one that follows. The figure is an abbreviation, so a
 * tap names the exact sum (and the category that took most of it) in a line
 * under the grid, with `Open this day` for the full list — the history's own
 * day view, on that day. A tap does not jump straight there: reading three days'
 * totals in a row is the common case, and leaving the grid on every tap would
 * make it three round trips.
 *
 * Rejected: a per-square sheet (a sheet over a grid hides the grid you are
 * comparing against) and colouring the whole-month strip on the same scale
 * (rent would be the darkest thing on screen every month, which is the problem
 * the strip exists to solve).
 */

import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { Icon } from './Icon';
import { Pressable } from './Pressable';
import { pressedStyle } from './motion';
import { GlassCard, Kicker, TextButton } from './primitives';
import { useLanguage, useT } from '../hooks/useT';
import { parseDay, weekdayInitials } from '../lib/days';
import { tap } from '../lib/feedback';
import { formatMoney, formatValue, type Amount, type MoneyCategory } from '../lib/money';
import {
  compactMoney,
  describeSpendDay,
  moneyMonth,
  type SpendDay,
  type SpendLevel,
} from '../lib/moneyCalendar';
import { greenSteps, heat, palette } from '../theme/tokens';
import type { ID } from '../types/models';

export function MoneyCalendar({
  amounts,
  accountId,
  categories,
  currency,
  scale,
  today,
  day,
  onOpenDay,
}: {
  /** The whole log: the lib filters to the account. */
  amounts: readonly Amount[];
  /** The subsection the history was opened for. */
  accountId: ID;
  categories: readonly MoneyCategory[];
  currency: string;
  scale: number;
  today: string;
  /** The history's day: the calendar opens on its month. */
  day: string;
  /** `Open this day`: show that day in the history's day list. */
  onOpenDay: (day: string) => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const [cursor, setCursor] = useState(() => {
    const at = parseDay(day) ?? parseDay(today) ?? new Date();
    return { year: at.getFullYear(), month: at.getMonth() };
  });
  const [picked, setPicked] = useState<string | null>(null);

  const cal = useMemo(
    () => moneyMonth(amounts, cursor.year, cursor.month, today, accountId, lang),
    [amounts, cursor, today, accountId, lang],
  );
  const byId = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const pickedCell = picked
    ? (cal.weeks.flat().find((cell) => cell.date === picked) ?? null)
    : null;
  const initials = weekdayInitials(lang);

  const step = (delta: number) => {
    tap();
    const next = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
    setPicked(null);
  };

  const line = pickedCell
    ? describeSpendDay(
        pickedCell,
        currency,
        scale,
        lang,
        pickedCell.topCategoryId
          ? (byId.get(pickedCell.topCategoryId)?.name ?? t('Archived'))
          : null,
      )
    : t('Tap a day for its amounts.');

  return (
    <>
      <View className="mx-lg flex-row items-center">
        <Pressable
          onPress={() => step(-1)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('The month before')}
          style={pressedStyle}
          className="h-hit w-[44px] items-center justify-center"
        >
          <Icon name="chevron-left" size={20} color={palette.inkMuted} />
        </Pressable>
        <View className="flex-1 items-center">
          <Text className="text-title font-semibold tabular-nums text-ink">{cal.label}</Text>
          <Text className="text-label tabular-nums text-ink-muted">
            {t('{total} spent', { total: formatMoney(cal.total, currency, scale) })}
          </Text>
        </View>
        <Pressable
          onPress={() => step(1)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('The month after')}
          style={pressedStyle}
          className="h-hit w-[44px] items-center justify-center"
        >
          <Icon name="chevron-right" size={20} color={palette.inkMuted} />
        </Pressable>
      </View>

      {/* Whole-month amounts: on no day, so above the days rather than on the 1st. */}
      {cal.whole.length > 0 ? (
        <GlassCard tone="sunken" className="mx-lg mt-md px-md py-sm">
          <Kicker>{t('Whole month · not on any day')}</Kicker>
          <View className="mt-xs flex-row flex-wrap">
            {cal.whole.map((item) => {
              const category = byId.get(item.categoryId);
              return (
                <View
                  key={item.categoryId}
                  className="mb-xs mr-sm h-[30px] flex-row items-center rounded-pill px-md"
                  style={{ backgroundColor: heat.empty }}
                >
                  <Text className="text-label tabular-nums text-ink">
                    {`${category?.glyph ?? '•'} ${category?.name ?? t('Archived')} · ${formatValue(item.total, scale)}`}
                  </Text>
                </View>
              );
            })}
          </View>
        </GlassCard>
      ) : null}

      <View className="mx-lg mt-md flex-row">
        {initials.map((initial, index) => (
          <Text
            key={`${initial}${index}`}
            className="flex-1 text-center text-micro font-semibold text-ink-faint"
          >
            {initial}
          </Text>
        ))}
      </View>

      <View className="mx-lg mt-xs">
        {cal.weeks.map((week, index) => (
          <View key={index} className="flex-row">
            {week.map((cell, position) => (
              <SpendCell
                key={cell.date ?? `pad${position}`}
                cell={cell}
                currency={currency}
                scale={scale}
                selected={cell.date !== null && cell.date === picked}
                onPress={() => {
                  if (!cell.date) return;
                  tap();
                  setPicked(cell.date);
                }}
              />
            ))}
            {/* Short last week rather than padded, like the task month. */}
            {week.length < 7
              ? Array.from({ length: 7 - week.length }, (_, i) => (
                  <View key={`tail${i}`} className="flex-1" />
                ))
              : null}
          </View>
        ))}
      </View>

      <GlassCard className="mx-lg mt-md flex-row items-center px-lg py-md">
        <Text className="flex-1 text-label tabular-nums text-ink">{line}</Text>
        {pickedCell?.date ? (
          <TextButton
            label={t('Open this day')}
            onPress={() => onOpenDay(pickedCell.date as string)}
          />
        ) : null}
      </GlassCard>

      {cal.total === 0 ? (
        <Text className="mx-lg mt-md text-label text-ink-muted">
          {t('Record an amount and its day fills in here, darker the more it cost.')}
        </Text>
      ) : null}

      <View className="mx-lg mt-lg flex-row items-center">
        <Kicker>{t('Less')}</Kicker>
        <View className="mx-sm h-[6px] flex-1 flex-row overflow-hidden rounded-pill">
          {greenSteps().map((fill) => (
            <View key={fill} className="h-[6px] flex-1" style={{ backgroundColor: fill }} />
          ))}
        </View>
        <Kicker>{t('More')}</Kicker>
      </View>

      <Text className="mx-lg mt-md text-label text-ink-faint">
        {t(
          'Expenses only: incomes, and transfers between your accounts, are not spending. The dearest day of the month is the darkest; every other day is shaded against it.',
        )}
      </Text>
    </>
  );
}

function fillOf(level: SpendLevel, future: boolean): string {
  if (level > 0) return greenSteps()[level - 1];
  return future ? heat.quiet : heat.empty;
}

/**
 * One day: the date on top, the compact spend under it, on its step's fill.
 * 50 dp tall and a seventh of 328 wide — a target, unlike a year pixel.
 */
function SpendCell({
  cell,
  currency,
  scale,
  selected,
  onPress,
}: {
  cell: SpendDay;
  currency: string;
  scale: number;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useT();
  if (cell.day === null) return <View className="flex-1 p-[2px]" />;
  // The two top steps are close enough to a fill that text takes `onAcc`.
  const onFill = cell.level >= 3;
  const figure = compactMoney(cell.total, scale);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={
        cell.total > 0
          ? t('{day}, {amount} spent', {
              day: cell.day,
              amount: formatMoney(cell.total, currency, scale),
            })
          : t('{day}, nothing spent', { day: cell.day })
      }
      style={pressedStyle}
      className="flex-1 p-[2px]"
    >
      <View
        className="h-[50px] items-center rounded-cell pt-[4px]"
        style={{
          backgroundColor: fillOf(cell.level, cell.isFuture),
          ...(selected
            ? { borderWidth: 1.5, borderColor: palette.ink }
            : cell.isToday
              ? { borderWidth: 1, borderColor: palette.greenBright }
              : {}),
        }}
      >
        <Text
          className={`text-micro tabular-nums ${onFill ? 'text-on-acc' : 'text-ink-faint'}`}
          style={{ letterSpacing: 0 }}
        >
          {cell.day}
        </Text>
        <Text
          numberOfLines={1}
          className={`text-micro font-semibold tabular-nums ${
            onFill ? 'text-on-acc' : figure ? 'text-ink' : 'text-ink-faint'
          }`}
          style={{ letterSpacing: 0 }}
        >
          {figure || '·'}
        </Text>
      </View>
    </Pressable>
  );
}
