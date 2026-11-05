/**
 * TaskActionList — a task's five actions, as labelled two-line rows.
 *
 *   ┌──────────────────────────────────────────┐
 *   │ Set a number…                            │   counted tasks only
 *   │ Skip today, on purpose                   │
 *   │   An excused day — your streak stays     │
 *   │ Pause for a while…                       │
 *   │ Move                                     │
 *   │ Open history                             │
 *   └──────────────────────────────────────────┘
 *
 * ONE list, drawn in two places (redesign #19): inside the row's menu — which
 * the hold and the `⋯` both open — and on the task's own screen, where the same
 * rows sit above the danger zone. The words live here so the two can never
 * drift: a user who learned `Skip today, on purpose` in the sheet finds the same
 * sentence on the detail screen. Which rows appear is a rule, not a layout, so
 * it is `lib/taskTap.ts`'s (`taskRowActions`, `taskDetailActions`).
 */

import { Text, View } from 'react-native';

import { Pressable } from './Pressable';
import { pressedStyle } from './motion';
import { Separator } from './primitives';
import { useT } from '../hooks/useT';
import type { TaskRowAction } from '../lib/taskTap';

export function TaskActionList({
  actions,
  isToday,
  onAction,
}: {
  actions: readonly TaskRowAction[];
  /** The skip names its day: `today`, or `this day` on a past one. */
  isToday: boolean;
  onAction: (action: TaskRowAction) => void;
}) {
  const t = useT();
  const copy: Record<TaskRowAction, { label: string; detail: string }> = {
    count: {
      label: t('Set a number…'),
      detail: t('Type how many, instead of a tap each'),
    },
    skip: {
      label: isToday ? t('Skip today, on purpose') : t('Skip this day, on purpose'),
      detail: t('An excused day — your streak stays'),
    },
    unskip: { label: t('Take the skip back'), detail: t('Back to not answered') },
    pause: {
      label: t('Pause for a while…'),
      detail: t('Excuse a run of days, for every task or a few'),
    },
    move: { label: t('Move'), detail: t('Slide it to a new place, then Drop') },
    open: { label: t('Open history'), detail: t('The month and the streak') },
  };
  return (
    <View className="overflow-hidden rounded-surface bg-surface-alt">
      {actions.map((action, index) => (
        <View key={action}>
          {index > 0 ? <Separator inset={16} /> : null}
          <ActionRow
            label={copy[action].label}
            detail={copy[action].detail}
            onPress={() => onAction(action)}
          />
        </View>
      ))}
    </View>
  );
}

function ActionRow({
  label,
  detail,
  onPress,
}: {
  label: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${detail}`}
      style={pressedStyle}
      className="min-h-row-lg justify-center px-lg py-sm"
    >
      <Text maxFontSizeMultiplier={1.3} className="text-body text-ink">
        {label}
      </Text>
      <Text
        maxFontSizeMultiplier={1.3}
        numberOfLines={1}
        className="mt-[2px] text-label text-ink-faint"
      >
        {detail}
      </Text>
    </Pressable>
  );
}
