/**
 * GoalSheet — add or edit one savings goal (M5).
 *
 *   SAVINGS GOAL
 *   [ 💻 ] [ New laptop                ]
 *   ( −5,000 )    650,000    ( +5,000 )
 *   SUBSECTION ( 💵 Cash ) ( 🏦 Savings )
 *   A date to reach it by                        ( ● )
 *   By                        March 2027   ( − ) ( + )
 *   [ Save ]
 *   Delete this goal…
 *
 * The date steps by MONTHS and lands on the month's last day: "by March" is how
 * people set a savings date, and a day picker would ask for a precision nobody
 * has. Off means "someday" — the goal shows its progress and no monthly figure.
 *
 * Deleting follows the destructive rule (U19); the confirm is the screen's. It
 * removes the goal and nothing else: the money is in its subsection either way.
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
  SelectChip,
  StepperRow,
  SwitchRow,
} from './primitives';
import { useLanguage, useT } from '../hooks/useT';
import { formatMonth, parseDay } from '../lib/days';
import { monthEndAhead, type GoalDraft } from '../lib/goals';
import type { MoneyAccount } from '../lib/money';

/** Whole months from `today`'s month to `by`'s. */
function monthOffset(today: string, by: string): number {
  const a = parseDay(today);
  const b = parseDay(by);
  if (!a || !b) return 0;
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

export function GoalSheet({
  title,
  initial,
  accounts,
  today,
  currency,
  scale,
  onSave,
  onDelete,
  onDismiss,
}: {
  title: string;
  initial: GoalDraft;
  /** Live subsections only. */
  accounts: readonly MoneyAccount[];
  today: string;
  currency: string;
  scale: number;
  onSave: (draft: GoalDraft) => void;
  onDelete?: () => void;
  onDismiss: () => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const [draft, setDraft] = useState<GoalDraft>(initial);
  const patch = (next: Partial<GoalDraft>) => setDraft((current) => ({ ...current, ...next }));
  const offset = draft.by ? monthOffset(today, draft.by) : 6;
  const byDate = draft.by ? parseDay(draft.by) : null;
  const ready = draft.name.trim() !== '' && draft.target > 0;

  return (
    <Sheet title={title} onDismiss={onDismiss}>
      <Kicker className="mb-sm">{t('Name')}</Kicker>
      <View className="flex-row" style={{ gap: 8 }}>
        <View style={{ width: 64 }}>
          <FieldWell
            value={draft.glyph}
            placeholder="🎯"
            onChangeText={(glyph) => patch({ glyph: [...glyph].slice(-2).join('') })}
            accessibilityLabel={t('Glyph')}
          />
        </View>
        <View className="flex-1">
          <FieldWell
            value={draft.name}
            placeholder={t('e.g. New laptop')}
            onChangeText={(name) => patch({ name })}
            accessibilityLabel={t('Name')}
          />
        </View>
      </View>

      <Kicker className="mb-sm mt-lg">{`${t('Target')} · ${currency}`}</Kicker>
      <PlanFigure
        value={draft.target}
        onChange={(target) => patch({ target })}
        scale={scale}
        currency={currency}
        accessibilityLabel={t('Target in {currency}', { currency })}
      />

      <Kicker className="mb-sm mt-lg">{t('Subsection')}</Kicker>
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
      <Text className="text-label text-ink-faint">
        {t('Its balance is the progress: move money in with a transfer and the goal fills.')}
      </Text>

      <View className="mt-md">
        <SwitchRow
          label={t('A date to reach it by')}
          hint={t('Then it says what a month needs.')}
          value={draft.by !== null}
          onChange={(on) => patch({ by: on ? monthEndAhead(today, offset) : null })}
        />
        {draft.by && byDate ? (
          <StepperRow
            label={t('By')}
            value={formatMonth(byDate.getFullYear(), byDate.getMonth(), lang)}
            onDecrease={() => patch({ by: monthEndAhead(today, Math.max(0, offset - 1)) })}
            onIncrease={() => patch({ by: monthEndAhead(today, Math.min(240, offset + 1)) })}
          />
        ) : null}
      </View>

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
          label={t('Delete this goal')}
          hint={t('The money stays where it is.')}
          onPress={onDelete}
          className="mt-md"
        />
      ) : null}
    </Sheet>
  );
}
