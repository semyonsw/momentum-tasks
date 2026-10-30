/**
 * RecurringSheet — add or edit one recurring payment (M2, design 13b).
 *
 *   RECURRING PAYMENT
 *   [ Rent                         ]
 *   ( −5,000 )    150,000    ( +5,000 )
 *   CATEGORY   ( 🏠 Home ) ( 🧊 Food ) …
 *   SUBSECTION ( 💵 Cash ) ( 💳 Online )
 *   REPEAT     [ Weekly | Monthly | Yearly ]
 *   On day                          5   ( − ) ( + )
 *   Counts for the whole month                 ( ● )
 *   On that day a “Due today” card asks you to confirm. Nothing is recorded on its own.
 *   [ Save ]
 *   Delete this payment…
 *
 * EXPENSE categories only: what repeats and gets forgotten is money going out.
 * The store and the lib take a recurring income as readily (a payment takes
 * its category's side), so offering one later is a chip row, not a migration.
 *
 * Deleting is the destructive rule's (U19): muted foot action here, and the
 * screen behind asks in a danger confirm. It removes the PLAN only — whatever
 * it already recorded stays in the log.
 */

import { useState } from 'react';
import { Text, View } from 'react-native';

import { PlanFigure } from './PlanFigure';
import { Sheet, SheetCancel } from './Sheet';
import {
  DangerFootAction,
  FieldWell,
  Kicker,
  PrimaryButton,
  Segmented,
  SelectChip,
  StepperRow,
  SwitchRow,
} from './primitives';
import { useLanguage, useT } from '../hooks/useT';
import { monthNames, weekdayLabels } from '../lib/days';
import { categoriesFor, type MoneyAccount, type MoneyCategory } from '../lib/money';
import {
  daysIn,
  scheduleOfKind,
  type RecurringDraft,
  type RecurringSchedule,
  type ScheduleKind,
} from '../lib/recurring';
import type { ID } from '../types/models';

/** One step on a wrapping stepper: 31 → 1, 1 → 31. */
function wrap(value: number, step: 1 | -1, max: number): number {
  const next = value + step;
  return next < 1 ? max : next > max ? 1 : next;
}

export function RecurringSheet({
  title,
  initial,
  categories,
  accounts,
  today,
  currency,
  scale,
  onSave,
  onDelete,
  onDismiss,
}: {
  title: string;
  /** The payment being edited, or a starting draft for a new one. */
  initial: RecurringDraft;
  categories: readonly MoneyCategory[];
  /** Live subsections only. */
  accounts: readonly MoneyAccount[];
  today: string;
  currency: string;
  scale: number;
  onSave: (draft: RecurringDraft) => void;
  /** Present when editing: the foot action that asks to delete it. */
  onDelete?: () => void;
  onDismiss: () => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const [draft, setDraft] = useState<RecurringDraft>(initial);
  const patch = (next: Partial<RecurringDraft>) => setDraft((current) => ({ ...current, ...next }));
  const setSchedule = (schedule: RecurringSchedule) => patch({ schedule });
  const { schedule } = draft;
  const pickable = categoriesFor(categories, 'expense', { pickable: true });
  const ready = draft.value > 0 && draft.categoryId !== '';

  const kinds: { value: ScheduleKind; label: string }[] = [
    { value: 'weekly', label: t('Weekly') },
    { value: 'monthly', label: t('Monthly') },
    { value: 'yearly', label: t('Yearly') },
  ];

  return (
    <Sheet title={title} onDismiss={onDismiss}>
      <Kicker className="mb-sm">{t('Name')}</Kicker>
      <FieldWell
        value={draft.name}
        placeholder={t('e.g. Rent')}
        onChangeText={(name) => patch({ name })}
        accessibilityLabel={t('Name')}
      />

      <Kicker className="mb-sm mt-lg">{`${t('Amount')} · ${currency}`}</Kicker>
      <PlanFigure
        value={draft.value}
        onChange={(value) => patch({ value })}
        scale={scale}
        currency={currency}
        accessibilityLabel={t('Amount in {currency}', { currency })}
      />

      <Kicker className="mb-sm mt-lg">{t('Category')}</Kicker>
      <View className="flex-row flex-wrap">
        {pickable.map((category) => (
          <SelectChip
            key={category.id}
            label={`${category.glyph} ${category.name}`}
            selected={category.id === draft.categoryId}
            onPress={() => patch({ categoryId: category.id })}
          />
        ))}
      </View>

      <Kicker className="mb-sm mt-md">{t('Account')}</Kicker>
      <View className="flex-row flex-wrap">
        {accounts.map((account) => (
          <SelectChip
            key={account.id}
            label={`${account.glyph} ${account.name}`}
            selected={account.id === draft.accountId}
            onPress={() => patch({ accountId: account.id })}
          />
        ))}
      </View>

      <Kicker className="mb-sm mt-md">{t('Repeat')}</Kicker>
      <Segmented
        options={kinds}
        value={schedule.kind}
        onChange={(kind) => {
          if (kind !== schedule.kind) setSchedule(scheduleOfKind(kind, today));
        }}
        accessibilityLabel={t('Repeat')}
      />

      <View className="mt-sm">
        {schedule.kind === 'monthly' ? (
          <StepperRow
            label={t('On day')}
            hint={schedule.day > 28 ? t('In a shorter month, on its last day.') : undefined}
            value={String(schedule.day)}
            onDecrease={() => setSchedule({ ...schedule, day: wrap(schedule.day, -1, 31) })}
            onIncrease={() => setSchedule({ ...schedule, day: wrap(schedule.day, 1, 31) })}
          />
        ) : null}
        {schedule.kind === 'weekly' ? (
          <View className="mt-sm flex-row flex-wrap">
            {weekdayLabels(lang).map((label, weekday) => (
              <SelectChip
                key={label}
                label={label}
                selected={weekday === schedule.weekday}
                onPress={() => setSchedule({ kind: 'weekly', weekday })}
              />
            ))}
          </View>
        ) : null}
        {schedule.kind === 'yearly' ? (
          <>
            <StepperRow
              label={t('Month')}
              value={monthNames(lang)[schedule.month]}
              onDecrease={() => {
                const month = (schedule.month + 11) % 12;
                setSchedule({
                  ...schedule,
                  month,
                  day: Math.min(schedule.day, daysIn(2028, month)),
                });
              }}
              onIncrease={() => {
                const month = (schedule.month + 1) % 12;
                setSchedule({
                  ...schedule,
                  month,
                  day: Math.min(schedule.day, daysIn(2028, month)),
                });
              }}
            />
            <StepperRow
              label={t('On day')}
              value={String(schedule.day)}
              onDecrease={() =>
                setSchedule({
                  ...schedule,
                  day: wrap(schedule.day, -1, daysIn(2028, schedule.month)),
                })
              }
              onIncrease={() =>
                setSchedule({
                  ...schedule,
                  day: wrap(schedule.day, 1, daysIn(2028, schedule.month)),
                })
              }
            />
          </>
        ) : null}
        {schedule.kind === 'monthly' ? (
          <SwitchRow
            label={t('Counts for the whole month')}
            hint={t('Recorded as a whole-month amount, on no single day — the way rent is.')}
            value={draft.wholeMonth}
            onChange={(wholeMonth) => patch({ wholeMonth })}
          />
        ) : null}
      </View>

      <Text className="mt-sm text-label text-ink-faint">
        {t('On that day a “Due today” card asks you to confirm. Nothing is recorded on its own.')}
      </Text>

      <View className="mt-xl">
        <PrimaryButton
          label={t('Save')}
          onPress={() => {
            if (ready) onSave(draft);
          }}
        />
        <SheetCancel label={t('Cancel')} onDismiss={onDismiss} />
      </View>
      {onDelete ? (
        <DangerFootAction
          label={t('Delete this payment')}
          hint={t('What it already recorded stays recorded.')}
          onPress={onDelete}
          className="mt-md"
        />
      ) : null}
    </Sheet>
  );
}

/** A fresh draft: the first pickable expense category, the given subsection, monthly today. */
export function newRecurringDraft(
  categories: readonly MoneyCategory[],
  accountId: ID,
  today: string,
): RecurringDraft {
  const first = categoriesFor(categories, 'expense', { pickable: true })[0];
  return {
    name: '',
    categoryId: first?.id ?? '',
    accountId,
    value: 0,
    schedule: scheduleOfKind('monthly', today),
    wholeMonth: false,
  };
}
