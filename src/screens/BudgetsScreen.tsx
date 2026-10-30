/**
 * BudgetsScreen — every expense category against its month (M1, design 12a).
 *
 *   ‹ BUDGETS
 *   October · day 5 of 31. The tick on each bar is how much of the month has passed.
 *   ┌──────────────────────────────────────────┐
 *   │ 🛒 Food                     65,800 left  │
 *   │ ▕████▌───────────────────────────────▏   │   ← the tick at 5/31
 *   │ 14,200 / 80,000 AMD                      │
 *   └──────────────────────────────────────────┘
 *   │ 🎁 Gifts           8,000 AMD over budget │   ← coral, past 100% only
 *
 * Reached from the row of plans at the foot of the Finance screen, beside
 * Recurring payments and Savings goals — the design's placement, and the same
 * "the rare door is at the foot" rule T-U7 used for Settings.
 *
 * THIS MONTH ONLY. The question is "how am I doing", and a month picker would
 * make it a history screen; a finished month's budgets are in its totals.
 *
 * Every live expense category is listed, with or without a budget, because the
 * row is also where one is SET: a category without a figure reads `No budget`
 * and opens the same sheet. The colour rule is the token's: coral appears on a
 * bar past 100% and its note, and nowhere else — being ahead of the month is
 * said in words.
 */

import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';

import { BudgetSheet } from '../components/BudgetSheet';
import { ScreenHeader } from '../components/ScreenHeader';
import { BubblePressable } from '../components/bubbles';
import { pressedStyle } from '../components/motion';
import { useMoneyScale } from '../hooks/useMoneyScale';
import { useToday } from '../hooks/useToday';
import { useLanguage, useT } from '../hooks/useT';
import {
  budgetAlertsDue,
  budgetNote,
  budgetStatus,
  describeBudgetMonth,
  monthElapsed,
  type BudgetStatus,
} from '../lib/budgets';
import { categoriesFor, formatValue, isTransferCategory, type MoneyCategory } from '../lib/money';
import { parseDay } from '../lib/days';
import { useMoney } from '../state/moneyStore';
import { useSettings } from '../state/settingsStore';
import { overBudget, glass, gradientBar, palette, radius } from '../theme/tokens';

export function BudgetsScreen({ onBack }: { onBack: () => void }) {
  const t = useT();
  const lang = useLanguage();
  const today = useToday();
  const currency = useSettings((s) => s.currencyCode);
  const scale = useMoneyScale();
  const categories = useMoney((s) => s.categories);
  const amounts = useMoney((s) => s.amounts);
  const budgets = useMoney((s) => s.budgets);
  const setBudget = useMoney((s) => s.setBudget);
  const pinScale = useMoney((s) => s.pinScale);
  const [editing, setEditing] = useState<MoneyCategory | null>(null);

  const date = parseDay(today) ?? new Date();
  const year = date.getFullYear();
  const month = date.getMonth();
  const elapsed = monthElapsed(year, month, today);

  const rows = useMemo(() => {
    const byId = new Map((budgets ?? []).map((budget) => [budget.categoryId, budget]));
    return categoriesFor(categories, 'expense')
      .filter((category) => !isTransferCategory(category.id))
      .map((category) => {
        const budget = byId.get(category.id);
        return {
          category,
          budget,
          status: budget ? budgetStatus(budget, amounts, year, month, today) : null,
        };
      });
  }, [amounts, budgets, categories, month, today, year]);
  const held = editing ? (budgets ?? []).find((b) => b.categoryId === editing.id) : undefined;

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />
      <ScreenHeader kicker={t('Budgets')} onBack={onBack} />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="mx-lg mb-md mt-md text-body text-ink-muted">
          {`${describeBudgetMonth(year, month, today, lang)} ${t(
            'The tick on each bar is how much of the month has passed.',
          )}`}
        </Text>

        <View className="mx-lg" style={{ gap: 8 }}>
          {rows.map(({ category, status }) => (
            <BudgetRow
              key={category.id}
              category={category}
              status={status}
              elapsed={elapsed}
              currency={currency}
              scale={scale}
              onPress={() => setEditing(category)}
            />
          ))}
        </View>

        <Text className="mx-lg mt-lg text-label text-ink-faint">
          {t(
            'Budgets count every account, so food bought by card is still food. Each month starts at its own figure: what is left over does not carry into the next.',
          )}
        </Text>
      </ScrollView>

      {editing ? (
        <BudgetSheet
          categoryName={`${editing.glyph}  ${editing.name}`}
          monthly={held?.monthly ?? 0}
          alerts={held?.alerts === true}
          currency={currency}
          scale={scale}
          onSave={(monthly, alerts) => {
            // A budget is money written down: the first one pins the scale it
            // was typed in, as an amount would (`lib/moneyUnits.ts`).
            pinScale(scale);
            setBudget(editing.id, monthly, alerts);
            /* Whatever the month has ALREADY crossed is on this screen: the
               alert is for spending that crosses a line, not for a figure just
               typed under it, so those thresholds count as said. */
            const state = useMoney.getState();
            const crossed = budgetAlertsDue({
              budgets: (state.budgets ?? []).filter((b) => b.categoryId === editing.id),
              categories: state.categories,
              amounts: state.amounts,
              year,
              month,
              fired: state.budgetAlertsFired ?? [],
            });
            state.recordBudgetAlerts(crossed.record, year, month);
            setEditing(null);
          }}
          onDismiss={() => setEditing(null)}
        />
      ) : null}
    </View>
  );
}

/** One category: its name, the note in the corner, and the bar — or `No budget`. */
function BudgetRow({
  category,
  status,
  elapsed: gone,
  currency: code,
  scale: units,
  onPress,
}: {
  category: MoneyCategory;
  status: BudgetStatus | null;
  elapsed: number;
  currency: string;
  scale: number;
  onPress: () => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const note = status ? budgetNote(status, code, units, lang) : t('No budget');
  return (
    <BubblePressable
      onPress={onPress}
      radius={radius.row}
      accessibilityRole="button"
      accessibilityLabel={`${category.name}. ${note}`}
      accessibilityHint={status ? t('Opens the budget') : t('Tap to set one')}
      style={(state) => [
        pressedStyle(state),
        {
          paddingHorizontal: 14,
          paddingVertical: 12,
          minHeight: 56,
          borderRadius: radius.row,
          borderWidth: 1,
          borderColor: glass.raisedEdge,
          backgroundColor: glass.raised,
        },
      ]}
    >
      <View className="flex-row items-center">
        <Text className="mr-sm text-[18px]">{category.glyph}</Text>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          className="flex-1 text-body font-medium text-ink"
        >
          {category.name}
        </Text>
        <Text
          maxFontSizeMultiplier={1.3}
          style={{ fontSize: 13, color: status?.over ? overBudget : palette.inkMuted }}
          className="tabular-nums"
        >
          {note}
        </Text>
      </View>
      {status ? (
        <>
          <BudgetBar fraction={status.fraction} over={status.over} elapsed={gone} />
          <Text
            maxFontSizeMultiplier={1.3}
            style={{ fontSize: 13 }}
            className="tabular-nums text-ink-faint"
          >
            {`${formatValue(status.spent, units)} / ${formatValue(status.limit, units)} ${code}`}
          </Text>
        </>
      ) : (
        <Text maxFontSizeMultiplier={1.3} className="mt-[2px] text-label text-ink-faint">
          {t('Tap to set one')}
        </Text>
      )}
    </BubblePressable>
  );
}

/** The bar: gradient up to 100%, coral past it; a 2 dp tick at the month's share gone. */
function BudgetBar({
  fraction,
  over,
  elapsed,
}: {
  fraction: number;
  over: boolean;
  elapsed: number;
}) {
  const width = `${Math.max(0, Math.min(1, fraction)) * 100}%` as const;
  return (
    <View style={{ height: 14, justifyContent: 'center', marginVertical: 6 }}>
      <View
        style={{
          height: 6,
          borderRadius: radius.pill,
          overflow: 'hidden',
          backgroundColor: glass.sunken,
        }}
      >
        {over ? (
          <View style={{ width, height: 6, backgroundColor: overBudget }} />
        ) : fraction > 0 ? (
          <LinearGradient {...gradientBar()} style={{ width, height: 6 }} />
        ) : null}
      </View>
      <View
        style={{
          position: 'absolute',
          left: `${Math.max(0, Math.min(1, elapsed)) * 100}%`,
          top: 0,
          width: 2,
          height: 14,
          marginLeft: -1,
          borderRadius: 1,
          backgroundColor: palette.ink,
        }}
      />
    </View>
  );
}
