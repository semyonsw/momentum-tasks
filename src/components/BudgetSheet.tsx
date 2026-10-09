/**
 * BudgetSheet — one category's monthly budget (M1, design 12b).
 *
 *   MONTHLY BUDGET
 *   Food
 *   ( −5,000 )   80,000   ( +5,000 )
 *   The ring on the tile turns coral only once the month goes past 100%.
 *   Tell me at 80% and 100%                                   ( ○ )
 *   [ Save budget ]
 *
 * Zero is "no budget" — the sheet says so — rather than a separate destructive
 * `Remove` control: a budget is a plan, it holds no record, and taking one away
 * loses nothing that typing the figure back would not restore.
 *
 * The alert switch is off until it is turned on here, per budget, and turning
 * it on is the moment the phone is asked for the permission (as a reminder's
 * switch does): it is the one moment the user knows why.
 */

import { useState } from 'react';
import { Text, View } from 'react-native';

import { PlanFigure } from './PlanFigure';
import { Sheet, SheetCancel } from './Sheet';
import { Kicker, PrimaryButton, Toggle } from './primitives';
import { useT } from '../hooks/useT';
import { ensureNotificationPermission } from '../lib/notify';

export function BudgetSheet({
  categoryName,
  monthly,
  alerts,
  currency,
  scale,
  onSave,
  onDismiss,
}: {
  categoryName: string;
  /** The current figure, 0 for none. */
  monthly: number;
  alerts: boolean;
  currency: string;
  scale: number;
  onSave: (monthly: number, alerts: boolean) => void;
  onDismiss: () => void;
}) {
  const t = useT();
  const [value, setValue] = useState(monthly);
  const [notify, setNotify] = useState(alerts);
  const [blocked, setBlocked] = useState(false);

  return (
    <Sheet title={categoryName} onDismiss={onDismiss}>
      <Kicker className="mb-sm">{`${t('Monthly budget')} · ${currency}`}</Kicker>
      <PlanFigure
        value={value}
        onChange={setValue}
        scale={scale}
        currency={currency}
        accessibilityLabel={t('Budget in {currency}', { currency })}
      />
      <Text className="mt-sm text-label text-ink-faint">
        {t('The ring on the tile turns coral only once the month goes past 100%.')}{' '}
        {t('Set it to 0 to remove the budget.')}
      </Text>

      <View className="mt-lg flex-row items-center">
        <View className="flex-1 pr-md">
          <Text className="text-body font-medium text-ink">{t('Tell me at 80% and 100%')}</Text>
          <Text className="mt-[2px] text-label text-ink-faint">
            {t('One notification each, once a month. Off unless you turn it on.')}
          </Text>
        </View>
        <Toggle
          value={notify}
          onChange={(on) => {
            setNotify(on);
            if (on)
              void ensureNotificationPermission().then((state) => setBlocked(state !== 'granted'));
          }}
          accessibilityLabel={t('Tell me at 80% and 100%')}
        />
      </View>
      {notify && blocked ? (
        <Text className="mt-sm text-label text-ink-faint">
          {t('Notifications are switched off for this app, so nothing will arrive.')}
        </Text>
      ) : null}

      <View className="mt-xl">
        <PrimaryButton label={t('Save budget')} onPress={() => onSave(value, notify)} />
        <SheetCancel label={t('Cancel')} onDismiss={onDismiss} />
      </View>
    </Sheet>
  );
}
