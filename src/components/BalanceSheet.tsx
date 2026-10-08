/**
 * BalanceSheet — the money you HAVE, typed in directly.
 *
 *   ╭────────────────────────────────────────────╮
 *   │ Cash                                       │
 *   │ WHAT YOU HAVE · AMD                        │
 *   │ ┌────────────────────────────────────────┐ │
 *   │ │ 40,000▎                                │ │
 *   │ └────────────────────────────────────────┘ │
 *   │ Set directly. Nothing is recorded as an    │
 *   │ income, and no month or chart moves.       │
 *   │ ╭──────────────── Save ────────────────╮   │
 *   ╰────────────────────────────────────────────╯
 *
 * Every other number in this app arrives as a logged event. This one does not,
 * and that is the whole point of it: what is already in a pocket on the day the
 * app is installed is not an income, and filing it as one would put a figure
 * nobody earned into September's incomes and into every chart drawn from them.
 *
 * So the field is the BALANCE, not the correction — the user types what they
 * have, exactly as they read it off the screen they tapped — and the difference
 * lands on the account's `opening` (`lib/money.ts`). Asking for the correction
 * instead would mean asking somebody to do the subtraction the app is holding
 * all the numbers for.
 *
 * IN WHOLE UNITS, even in a log kept in cents (`lib/moneyUnits.ts`): the field
 * converts at the edge, and Save on an untouched field keeps the cents as they
 * were rather than rounding them off.
 *
 * A MINUS SIGN IS ALLOWED. An account can honestly hold less than nothing, and
 * a field that silently ate the `-` would make that unsayable.
 */

import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Sheet, SheetCancel } from './Sheet';
import { Kicker, PrimaryButton } from './primitives';
import { useT } from '../hooks/useT';
import { editBalanceInput, formatValue, parseBalanceInput } from '../lib/money';
import { majorToMinor } from '../lib/moneyUnits';
import { palette, tint } from '../theme/tokens';

interface BalanceSheetProps {
  /** The subsection being set — its name is the sheet's title. */
  title: string;
  /** What the screen is currently showing, so the field opens on it. */
  balance: number;
  currency: string;
  /** The log's scale (`lib/moneyUnits.ts`): `balance` and the saved value are in it. */
  scale?: number;
  onSave: (balance: number) => void;
  onDismiss: () => void;
}

export function BalanceSheet({
  title,
  balance,
  currency,
  scale = 0,
  onSave,
  onDismiss,
}: BalanceSheetProps) {
  const t = useT();
  /* Whole units in the field, whatever the scale: what is in a pocket is read
     off to the unit. The cents already in the balance survive a Save that did
     not change the whole part — see `save`. */
  const opened = String(Math.trunc(balance / 10 ** scale));
  const [digits, setDigits] = useState(opened);
  const parsed = parseBalanceInput(digits);
  const save = () => onSave(digits === opened ? balance : majorToMinor(parsed.value, scale));
  const shown = digits === '' || digits === '-' ? digits : formatValue(parsed.value);

  return (
    <Sheet title={title} onDismiss={onDismiss}>
      <Kicker className="mb-sm">
        {t('What you have')} · {currency}
      </Kicker>
      <View
        className="h-row flex-row items-center rounded-[18px] border px-lg"
        style={{
          borderColor: tint(0.34),
          backgroundColor: 'rgba(236,241,238,0.04)',
          boxShadow: [
            { offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 4, color: tint(0.09) },
          ],
        }}
      >
        <TextInput
          value={shown}
          onChangeText={(text) => setDigits(editBalanceInput(shown, text))}
          placeholder="0"
          placeholderTextColor={palette.inkFaint}
          cursorColor={palette.greenBright}
          selectionColor={palette.greenBright}
          keyboardType="numeric"
          autoFocus
          selectTextOnFocus
          accessibilityLabel={t('Amount in {currency}', { currency })}
          className="flex-1 text-title-xl font-semibold tabular-nums text-ink"
        />
      </View>

      <Text className="mt-sm text-label text-ink-faint">
        {t(
          'This sets the balance directly. Nothing is recorded as an income, and no month, category or chart moves.',
        )}
      </Text>

      <View className="mt-xl">
        <PrimaryButton label={t('Save')} onPress={save} />
        <SheetCancel label={t('Cancel')} onDismiss={onDismiss} />
      </View>
    </Sheet>
  );
}
