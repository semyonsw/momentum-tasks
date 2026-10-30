/**
 * CategoryDetailScreen — one category, one window, every amount in it.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹ Money                                      │
 *   │ Transport                                    │
 *   │ 💵 Cash · September 2026 · 10,300 AMD        │
 *   │ ┌────┐ ┌───────────────────────────────────┐ │
 *   │ │ 🚌 │ │ Transport                         │ │
 *   │ └────┘ └───────────────────────────────────┘ │
 *   │ 7 AMOUNTS                                    │
 *   │ │ 400 AMD                                 › │ │
 *   │ │ 12 September · taxi to the gym            │ │
 *   │ │ 6,000 AMD                               › │ │
 *   │ │ September 2026 · whole month · metro pass │ │
 *   │ + Add to this category                       │
 *   │ DANGER ZONE ┌ Archive  Hide it. History… ┐  │
 *   └──────────────────────────────────────────────┘
 *
 * ── THE RENAME IS INLINE, BECAUSE IT IS THE WHOLE EDITOR ──────────────────
 *
 * A category is a glyph and a name. There is nothing else to edit, so there is
 * nothing for an edit screen to hold, and a sheet that appears to change two
 * fields you can already see is ceremony. The two fields ARE the header.
 *
 * ── ARCHIVE, NEVER DELETE, AND THE SCREEN SAYS WHY ────────────────────────
 *
 * Every amount in here is in the month, the year and the balance. Deleting the
 * category would either strand them or silently move three totals the user has
 * already read — so the screen ends with the danger zone every item's own screen
 * ends with (redesign §6), holding `Archive` alone, and the confirm it opens
 * states exactly what survives. `state/moneyStore.ts` makes the same argument
 * from the data side.
 *
 * The window comes from `MoneyScreen` rather than being picked again here: this
 * screen is that screen's tile, opened. Landing on a different window from the
 * one you tapped through is the kind of small lie that makes a total untrustable.
 *
 * THE SUBSECTION TRAVELS THE SAME WAY, and for the same reason: the tile said
 * `Transport 10,300` about Cash, so this screen is about Cash. A list that
 * quietly included the card spending would not add up to the figure that was
 * tapped.
 */

import { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from '../components/KeyboardAware';
import { Pressable } from '../components/Pressable';
import { StatusBar } from 'expo-status-bar';

import { ConfirmSheet } from '../components/ConfirmSheet';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { pressedStyle } from '../components/motion';
import {
  AddRow,
  DangerZone,
  FieldWell,
  Kicker,
  ListCard,
  Separator,
} from '../components/primitives';
import {
  type Amount,
  type Interval,
  type MoneyAccount,
  type MoneyCategory,
  amountsIn,
  dayInWindow,
  inAccount,
  describeAmount,
  describeCount,
  describeInterval,
  formatMoney,
} from '../lib/money';
import { dayKey } from '../lib/days';
import { lastGlyph } from '../lib/glyph';
import { useMoney } from '../state/moneyStore';
import { useLanguage, useT } from '../hooks/useT';
import { useSettings } from '../state/settingsStore';
import { useMoneyScale } from '../hooks/useMoneyScale';
import { palette } from '../theme/tokens';
import type { ID } from '../types/models';
import type { Direction } from '../lib/money';

interface CategoryDetailScreenProps {
  category: MoneyCategory;
  /** The subsection the tile was read through. Only its amounts are listed. */
  account: MoneyAccount;
  /** The window the money screen was reading through when this was tapped. */
  interval: Interval;
  anchor: string;
  /** Expenses or incomes — what the grid was showing. The header sums only that. */
  direction: Direction;
  onBack: () => void;
  onOpenAmount: (amountId: ID) => void;
  /** Handed the day this window means, so the new amount lands inside the list
      it was added from rather than on today. See `dayInWindow`. */
  onAddAmount: (day: string) => void;
}

export function CategoryDetailScreen({
  category,
  account,
  interval,
  anchor,
  direction,
  onBack,
  onOpenAmount,
  onAddAmount,
}: CategoryDetailScreenProps) {
  const t = useT();
  const lang = useLanguage();
  const amounts = useMoney((s) => s.amounts);
  const updateCategory = useMoney((s) => s.updateCategory);
  const archiveCategory = useMoney((s) => s.archiveCategory);
  const currency = useSettings((s) => s.currencyCode);
  const units = useMoneyScale();

  const [archiving, setArchiving] = useState(false);
  /*
   * The name is a LOCAL DRAFT, committed on blur and on the way out.
   *
   * It was fed straight from the store, which trims and refuses an empty name —
   * correctly, for a stored value, and fatally for one being typed: the space in
   * "Eating out" was trimmed off under the cursor, so it came out "Eatingout",
   * and clearing the field to retype it snapped the old name back. Same fix and
   * same reason as the currency field in `MoneySettingsScreen`.
   */
  const [nameDraft, setNameDraft] = useState(category.name);
  const commitName = () => {
    if (nameDraft.trim() === '') setNameDraft(category.name);
    else updateCategory(category.id, { name: nameDraft });
  };
  // Back commits too: leaving with the keyboard up unmounts the field before its
  // blur can run.
  const leave = () => {
    commitName();
    onBack();
  };

  const rows = useMemo(
    () => amountsIn(inAccount(amounts, account.id), category.id, interval, anchor),
    [amounts, account.id, category.id, interval, anchor],
  );
  /*
   * The total of the DIRECTION the tile showed. It was expenses minus incomes,
   * printed unsigned: 3,000 out and 5,000 in under "Family" read "2,000" — a
   * figure on neither tile, and one that looked like spending.
   */
  const total = rows.reduce((sum, row) => (row.direction === direction ? sum + row.value : sum), 0);

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />
      <ScreenHeader kicker={t('Finance')} onBack={leave} bordered={false} />

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="never"
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="mx-lg mt-sm text-title font-semibold text-ink">{category.name}</Text>
        <Text className="mx-lg mt-xs text-label text-ink-muted">
          {account.glyph} {account.name} · {describeInterval(interval, anchor, lang)} ·{' '}
          <Text className="tabular-nums text-green-bright">
            {formatMoney(total, currency, units)}
          </Text>
        </Text>

        <View className="mx-lg mt-lg flex-row">
          <View className="h-row w-row items-center justify-center rounded-surface border border-hairline bg-surface-alt">
            <TextInput
              value={category.glyph}
              onChangeText={(text) => updateCategory(category.id, { glyph: lastGlyph(text) })}
              cursorColor={palette.greenBright}
              selectionColor={palette.greenBright}
              accessibilityLabel={t('Category glyph')}
              className="w-full text-center text-[22px] text-ink"
            />
          </View>
          <View className="ml-md flex-1">
            <FieldWell
              value={nameDraft}
              size="body"
              onChangeText={setNameDraft}
              onBlur={commitName}
              accessibilityLabel={t('Category name')}
            />
          </View>
        </View>

        <Kicker className="mx-lg mb-sm mt-xl">{describeCount(rows.length, lang)}</Kicker>

        {rows.length > 0 ? (
          <ListCard className="mx-lg">
            {rows.map((row, index) => (
              <View key={row.id}>
                {index > 0 ? <Separator /> : null}
                <AmountRow amount={row} currency={currency} onPress={() => onOpenAmount(row.id)} />
              </View>
            ))}
          </ListCard>
        ) : (
          <Text className="mx-lg text-label text-ink-faint">
            {t('Nothing in {window}.', {
              window: describeInterval(interval, anchor, lang).toLowerCase(),
            })}
          </Text>
        )}

        <View className="mx-lg">
          <AddRow
            label={t('Add to this category')}
            onPress={() => onAddAmount(dayInWindow(interval, anchor, dayKey(new Date())))}
          />
        </View>

        <View className="mx-lg mt-xl">
          <DangerZone onArchive={() => setArchiving(true)} />
        </View>
      </KeyboardAwareScrollView>

      {archiving ? (
        <ConfirmSheet
          tone="danger"
          title={t('Archive “{name}”?', { name: category.name })}
          body={t(
            'It leaves the grid and the chips. Every amount in it stays in the month, the year and the balance.',
          )}
          confirmLabel={t('Archive it')}
          cancelLabel={t('Keep it')}
          onConfirm={() => {
            archiveCategory(category.id);
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

function AmountRow({
  amount,
  currency,
  onPress,
}: {
  amount: Amount;
  /** Passed down rather than read here: the lib formats, the screen decides. */
  currency: string;
  onPress: () => void;
}) {
  const lang = useLanguage();
  const units = useMoneyScale();
  const detail = describeAmount(amount, lang);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${formatMoney(amount.value, currency, units)}. ${detail}`}
      style={pressedStyle}
      className="h-row-lg flex-row items-center px-lg"
    >
      <View className="flex-1 pr-md">
        <Text className="text-body tabular-nums text-ink">
          {amount.direction === 'income' ? '+' : ''}
          {formatMoney(amount.value, currency, units)}
        </Text>
        <Text numberOfLines={1} className="mt-[2px] text-label tabular-nums text-ink-faint">
          {detail}
        </Text>
      </View>
      <Icon name="chevron-right" size={16} color={palette.inkFaint} />
    </Pressable>
  );
}
