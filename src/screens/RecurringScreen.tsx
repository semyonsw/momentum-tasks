/**
 * RecurringScreen — what repeats, and when it is next due (M2, design 13a).
 *
 *   ‹ RECURRING PAYMENTS
 *   246,900 AMD a month · 64,000 AMD a year
 *   ┌───────────────────────────────────────────────┐
 *   │ 🏠 Rent                              150,000  │
 *   │    Monthly on the 5th · Cash        Due today │   ← accent when due
 *   └───────────────────────────────────────────────┘
 *   ┌ + Add a payment ┐
 *
 * The list is the PLANS; the asking happens on the Finance screen, where a
 * "Due today" card confirms or skips each occurrence (`lib/recurring.ts`). A row
 * opens the editor; deleting from there asks first, in a danger confirm, and
 * removes the plan only — every amount it recorded stays.
 *
 * The total line states each period as itself (a month, a week, a year) rather
 * than converting weekly payments into a monthly figure: 52 / 12 is a guess
 * about which months have five Mondays.
 */

import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { ConfirmSheet } from '../components/ConfirmSheet';
import { RecurringSheet, newRecurringDraft } from '../components/RecurringSheet';
import { ScreenHeader } from '../components/ScreenHeader';
import { BubblePressable } from '../components/bubbles';
import { pressedStyle } from '../components/motion';
import { DashedAdd } from '../components/primitives';
import { useMoneyScale } from '../hooks/useMoneyScale';
import { useToday } from '../hooks/useToday';
import { useLanguage, useT } from '../hooks/useT';
import { formatValue } from '../lib/money';
import {
  describeSchedule,
  describeTotals,
  nextOccurrence,
  nextWord,
  type RecurringDraft,
  type RecurringPayment,
} from '../lib/recurring';
import { useMoney } from '../state/moneyStore';
import { useSettings } from '../state/settingsStore';
import { glass, palette, radius } from '../theme/tokens';

export function RecurringScreen({ onBack }: { onBack: () => void }) {
  const t = useT();
  const lang = useLanguage();
  const today = useToday();
  const currency = useSettings((s) => s.currencyCode);
  const scale = useMoneyScale();
  const recurring = useMoney((s) => s.recurring);
  const categories = useMoney((s) => s.categories);
  const accounts = useMoney((s) => s.accounts);
  const addRecurring = useMoney((s) => s.addRecurring);
  const updateRecurring = useMoney((s) => s.updateRecurring);
  const deleteRecurring = useMoney((s) => s.deleteRecurring);
  const pinScale = useMoney((s) => s.pinScale);

  /** `null` closed, `'new'` adding, or the payment being edited. */
  const [editing, setEditing] = useState<RecurringPayment | 'new' | null>(null);
  const [deleting, setDeleting] = useState<RecurringPayment | null>(null);

  const items = useMemo(() => recurring ?? [], [recurring]);
  const live = useMemo(() => accounts.filter((account) => account.archivedAt === null), [accounts]);
  const nameOf = (item: RecurringPayment) =>
    item.name || categories.find((category) => category.id === item.categoryId)?.name || '';

  const save = (draft: RecurringDraft) => {
    // A plan's figure is money written down: it pins the scale like an amount.
    pinScale(scale);
    if (editing === 'new') addRecurring(draft, today);
    else if (editing) updateRecurring(editing.id, draft);
    setEditing(null);
  };

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />
      <ScreenHeader kicker={t('Recurring payments')} onBack={onBack} />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="mx-lg mb-md mt-md text-body text-ink-muted">
          {items.length > 0
            ? describeTotals(items, currency, scale, lang)
            : t(
                'Rent, a phone plan, a gym membership: add one, and on its day a card on Finance asks whether it was paid.',
              )}
        </Text>

        <View className="mx-lg" style={{ gap: 8 }}>
          {items.map((item) => {
            const category = categories.find((row) => row.id === item.categoryId);
            const account = accounts.find((row) => row.id === item.accountId);
            const next = nextOccurrence(item, today);
            const due = next !== null && next <= today;
            const when = nextWord(next, today, lang);
            return (
              <BubblePressable
                key={item.id}
                onPress={() => setEditing(item)}
                radius={radius.row}
                accessibilityRole="button"
                accessibilityLabel={`${nameOf(item)}. ${formatValue(item.value, scale)} ${currency}. ${describeSchedule(item.schedule, lang)}. ${when}`}
                accessibilityHint={t('Opens the payment')}
                style={(state) => [
                  pressedStyle(state),
                  {
                    minHeight: 64,
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: radius.row,
                    borderWidth: 1,
                    borderColor: glass.raisedEdge,
                    backgroundColor: glass.raised,
                  },
                ]}
              >
                <Text className="mr-md text-[22px]">{category?.glyph ?? '•'}</Text>
                <View className="flex-1 pr-sm">
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.3}
                    className="text-body font-medium text-ink"
                  >
                    {nameOf(item)}
                  </Text>
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.3}
                    className="mt-[2px] text-label text-ink-faint"
                  >
                    {`${describeSchedule(item.schedule, lang)}${account ? ` · ${account.name}` : ''}`}
                  </Text>
                </View>
                <View className="items-end">
                  <Text
                    maxFontSizeMultiplier={1.3}
                    className="text-body font-semibold tabular-nums text-ink"
                  >
                    {formatValue(item.value, scale)}
                  </Text>
                  <Text
                    maxFontSizeMultiplier={1.3}
                    style={{ fontSize: 12.5, color: due ? palette.acc : palette.inkMuted }}
                    className="mt-[2px] tabular-nums"
                  >
                    {when}
                  </Text>
                </View>
              </BubblePressable>
            );
          })}
          <DashedAdd label={t('Add a payment')} onPress={() => setEditing('new')} />
        </View>
      </ScrollView>

      {editing ? (
        <RecurringSheet
          title={editing === 'new' ? t('Recurring payment') : nameOf(editing)}
          initial={
            editing === 'new'
              ? newRecurringDraft(categories, live[0]?.id ?? accounts[0].id, today)
              : {
                  name: editing.name,
                  categoryId: editing.categoryId,
                  accountId: editing.accountId,
                  value: editing.value,
                  schedule: editing.schedule,
                  wholeMonth: editing.wholeMonth === true,
                }
          }
          categories={categories}
          accounts={live}
          today={today}
          currency={currency}
          scale={scale}
          onSave={save}
          onDelete={
            editing === 'new'
              ? undefined
              : () => {
                  const held = editing;
                  setEditing(null);
                  setDeleting(held);
                }
          }
          onDismiss={() => setEditing(null)}
        />
      ) : null}

      {deleting ? (
        <ConfirmSheet
          tone="danger"
          title={t('Delete “{name}”?', { name: nameOf(deleting) })}
          body={t('It stops being asked about. Everything it already recorded stays recorded.')}
          confirmLabel={t('Delete it')}
          cancelLabel={t('Keep it')}
          onConfirm={() => {
            const held = deleting;
            setDeleting(null);
            deleteRecurring(held.id);
          }}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </View>
  );
}
