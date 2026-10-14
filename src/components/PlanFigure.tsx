/**
 * PlanFigure — one money figure for a PLAN, with a − and a + either side.
 *
 *   ╭──────────────────────────────────────────╮
 *   │ ( −5,000 )        80,000        ( +5,000 ) │
 *   ╰──────────────────────────────────────────╯
 *
 * The budget, the recurring payment and the savings goal are each one number
 * that is set once and nudged after that, so the chips do the common thing and
 * the figure itself is a field for the exact one: tap it and the phone's number
 * pad opens on it (`typedToMinor` reads what comes back).
 *
 * REJECTED: the amount editor's own twelve-key pad. It is the right tool for a
 * screen whose whole job is typing a number; on a sheet that also holds a name,
 * a category and a schedule it would push everything else off the pane, for a
 * figure that is typed once a year.
 *
 * The step is in STORED units (`BUDGET_STEP`), so `±5,000` in a whole-unit log
 * is `±50` in a log kept in cents — see `lib/budgets.ts`.
 */

import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { BubblePressable } from './bubbles';
import { useRevealOnFocus } from './KeyboardAware';
import { pressedStyle } from './motion';
import { useT } from '../hooks/useT';
import { BUDGET_STEP } from '../lib/budgets';
import { formatValue } from '../lib/money';
import { formatEntry, minorToEntry, typedToMinor } from '../lib/moneyUnits';
import { glass, palette, radius } from '../theme/tokens';

function shown(value: number, scale: number): string {
  return value > 0 ? formatEntry(minorToEntry(value, scale)) : '';
}

export function PlanFigure({
  value,
  onChange,
  scale,
  currency,
  step = BUDGET_STEP,
  accessibilityLabel,
}: {
  /** In the log's units. 0 shows an empty field. */
  value: number;
  onChange: (value: number) => void;
  scale: number;
  currency: string;
  step?: number;
  accessibilityLabel: string;
}) {
  const t = useT();
  const reveal = useRevealOnFocus();
  const [text, setText] = useState(() => shown(value, scale));
  const nudge = (direction: 1 | -1) => {
    const next = Math.max(0, value + direction * step);
    setText(shown(next, scale));
    onChange(next);
  };
  const stepLabel = formatValue(step, scale);

  return (
    <View
      className="flex-row items-center"
      style={{
        gap: 8,
        padding: 8,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: glass.raisedEdge,
        backgroundColor: glass.sunken,
      }}
    >
      <StepChip
        label={`−${stepLabel}`}
        accessibilityLabel={t('Less by {amount}', { amount: `${stepLabel} ${currency}` })}
        onPress={() => nudge(-1)}
      />
      <TextInput
        value={text}
        onChangeText={(next) => {
          setText(next);
          const typed = typedToMinor(next, scale);
          onChange(typed ?? 0);
        }}
        onFocus={reveal}
        onBlur={() => setText(shown(value, scale))}
        placeholder="0"
        placeholderTextColor={palette.inkFaint}
        cursorColor={palette.greenBright}
        selectionColor={palette.greenBright}
        keyboardType={scale > 0 ? 'decimal-pad' : 'number-pad'}
        selectTextOnFocus
        maxFontSizeMultiplier={1.3}
        accessibilityLabel={accessibilityLabel}
        style={{ flex: 1, minWidth: 0, fontSize: 30, textAlign: 'center' }}
        className="font-semibold tabular-nums text-ink"
      />
      <StepChip
        label={`+${stepLabel}`}
        accessibilityLabel={t('More by {amount}', { amount: `${stepLabel} ${currency}` })}
        onPress={() => nudge(1)}
      />
    </View>
  );
}

/** A 48 dp pill: big enough to hit while the other thumb holds the phone. */
function StepChip({
  label,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <BubblePressable
      onPress={onPress}
      radius="pill"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={(state) => [
        pressedStyle(state),
        {
          height: 48,
          paddingHorizontal: 14,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: glass.ghostEdge,
          alignItems: 'center',
          justifyContent: 'center',
        },
      ]}
    >
      <Text
        maxFontSizeMultiplier={1.3}
        style={{ fontSize: 14.5 }}
        className="font-semibold tabular-nums text-ink"
      >
        {label}
      </Text>
    </BubblePressable>
  );
}
