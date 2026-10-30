/**
 * GoalsScreen — what the user is saving towards (M5, design 15).
 *
 *   ‹ SAVINGS GOALS
 *   ┌───────────────────────────────────────────────┐
 *   │ ( 58% )  💻 New laptop                         │
 *   │          380,000 of 650,000 AMD · by 31 March  │
 *   │          45,000 AMD a month to get there       │   ← accent
 *   └───────────────────────────────────────────────┘
 *
 * Each goal reads ONE subsection's balance (`lib/goals.ts`), so there is no
 * "add money to the goal" button here: money goes in the way it always does, a
 * transfer into that subsection from Finance. A past date is said plainly and
 * in the ordinary ink; a goal on an archived subsection stays, last and dimmed,
 * paused. Two goals on one subsection both read all of it, and the card says
 * so instead of splitting the money by a guess.
 */

import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { ConfirmSheet } from '../components/ConfirmSheet';
import { GoalSheet } from '../components/GoalSheet';
import { ProgressRing } from '../components/ProgressRing';
import { ScreenHeader } from '../components/ScreenHeader';
import { BubblePressable } from '../components/bubbles';
import { pressedStyle } from '../components/motion';
import { DashedAdd } from '../components/primitives';
import { useMoneyScale } from '../hooks/useMoneyScale';
import { useToday } from '../hooks/useToday';
import { useLanguage, useT } from '../hooks/useT';
import {
  describeGoalProgress,
  describeGoalStatus,
  goalPercent,
  goalProgress,
  monthEndAhead,
  orderGoals,
  type GoalDraft,
  type SavingsGoal,
} from '../lib/goals';
import { useMoney } from '../state/moneyStore';
import { useSettings } from '../state/settingsStore';
import { glass, palette, radius } from '../theme/tokens';

export function GoalsScreen({ onBack }: { onBack: () => void }) {
  const t = useT();
  const lang = useLanguage();
  const today = useToday();
  const currency = useSettings((s) => s.currencyCode);
  const scale = useMoneyScale();
  const goals = useMoney((s) => s.goals);
  const accounts = useMoney((s) => s.accounts);
  const amounts = useMoney((s) => s.amounts);
  const addGoal = useMoney((s) => s.addGoal);
  const updateGoal = useMoney((s) => s.updateGoal);
  const deleteGoal = useMoney((s) => s.deleteGoal);
  const pinScale = useMoney((s) => s.pinScale);

  const [editing, setEditing] = useState<SavingsGoal | 'new' | null>(null);
  const [deleting, setDeleting] = useState<SavingsGoal | null>(null);

  const live = useMemo(() => accounts.filter((account) => account.archivedAt === null), [accounts]);
  const rows = useMemo(() => {
    const list = goals ?? [];
    const perAccount = new Map<string, number>();
    for (const goal of list)
      perAccount.set(goal.accountId, (perAccount.get(goal.accountId) ?? 0) + 1);
    return orderGoals(
      list.map((goal) => {
        const progress = goalProgress(goal, accounts, amounts, today, scale);
        return {
          goal,
          progress,
          state: progress.state,
          shared: (perAccount.get(goal.accountId) ?? 0) > 1,
          account: accounts.find((account) => account.id === goal.accountId),
        };
      }),
    );
  }, [accounts, amounts, goals, scale, today]);

  const save = (draft: GoalDraft) => {
    pinScale(scale);
    if (editing === 'new') addGoal(draft);
    else if (editing) updateGoal(editing.id, draft);
    setEditing(null);
  };

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />
      <ScreenHeader kicker={t('Savings goals')} onBack={onBack} />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="mx-lg mb-md mt-md text-body text-ink-muted">
          {t(
            'A goal reads one account’s balance. Move money into it with a transfer on Finance, and the goal fills.',
          )}
        </Text>

        <View className="mx-lg" style={{ gap: 8 }}>
          {rows.map(({ goal, progress, shared, account }) => {
            const paused = progress.state === 'paused';
            const status = describeGoalStatus(progress, account?.name ?? '', currency, scale, lang);
            const percent = goalPercent(progress);
            return (
              <BubblePressable
                key={goal.id}
                onPress={() => setEditing(goal)}
                radius={radius.card}
                accessibilityRole="button"
                accessibilityLabel={`${goal.name}. ${percent}%. ${describeGoalProgress(goal, progress, currency, scale, lang)}. ${status ?? ''}`}
                accessibilityHint={t('Opens the goal')}
                style={(state) => [
                  pressedStyle(state),
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 16,
                    borderRadius: radius.card,
                    borderWidth: 1,
                    borderColor: glass.raisedEdge,
                    backgroundColor: glass.raised,
                    opacity: paused ? 0.6 : 1,
                  },
                ]}
              >
                <ProgressRing fraction={progress.fraction} size={64} stroke={4}>
                  <Text
                    maxFontSizeMultiplier={1.3}
                    style={{ fontSize: 13.5 }}
                    className="font-semibold tabular-nums text-ink"
                  >
                    {`${percent}%`}
                  </Text>
                </ProgressRing>
                <View className="ml-md flex-1">
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.3}
                    className="text-body font-medium text-ink"
                  >
                    {`${goal.glyph} ${goal.name}`}
                  </Text>
                  <Text
                    maxFontSizeMultiplier={1.3}
                    className="mt-[2px] text-label tabular-nums text-ink-muted"
                  >
                    {describeGoalProgress(goal, progress, currency, scale, lang)}
                  </Text>
                  {status ? (
                    <Text
                      maxFontSizeMultiplier={1.3}
                      style={{
                        color:
                          progress.state === 'active' || progress.state === 'reached'
                            ? palette.acc
                            : palette.inkMuted,
                      }}
                      className="mt-[2px] text-label font-medium tabular-nums"
                    >
                      {status}
                    </Text>
                  ) : null}
                  {shared && account ? (
                    <Text
                      maxFontSizeMultiplier={1.3}
                      className="mt-[2px] text-label text-ink-faint"
                    >
                      {t('Shares {name} with another goal.', { name: account.name })}
                    </Text>
                  ) : null}
                </View>
              </BubblePressable>
            );
          })}
          <DashedAdd label={t('Add a goal')} onPress={() => setEditing('new')} />
        </View>
      </ScrollView>

      {editing ? (
        <GoalSheet
          title={editing === 'new' ? t('Savings goal') : editing.name}
          initial={
            editing === 'new'
              ? {
                  name: '',
                  glyph: '🎯',
                  target: 0,
                  by: monthEndAhead(today, 6),
                  accountId: live[live.length - 1]?.id ?? accounts[0].id,
                }
              : {
                  name: editing.name,
                  glyph: editing.glyph,
                  target: editing.target,
                  by: editing.by ?? null,
                  accountId: editing.accountId,
                }
          }
          accounts={
            /* An archived subsection stays offered while it is this goal's own,
               so opening a paused goal does not silently move it. */
            editing !== 'new' && !live.some((account) => account.id === editing.accountId)
              ? [...live, ...accounts.filter((account) => account.id === editing.accountId)]
              : live
          }
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
          title={t('Delete “{name}”?', { name: deleting.name })}
          body={t('Only the goal goes. The money stays in its account.')}
          confirmLabel={t('Delete it')}
          cancelLabel={t('Keep it')}
          onConfirm={() => {
            const held = deleting;
            setDeleting(null);
            deleteGoal(held.id);
          }}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </View>
  );
}
