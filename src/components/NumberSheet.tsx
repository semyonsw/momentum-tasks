/**
 * NumberSheet — type one number, in the bottom third where the keyboard is.
 *
 *   ╭────────────────────────────────────────────╮
 *   │ Which workout was this?                    │
 *   │ Everything before and after renumbers from │
 *   │ this one.                                  │
 *   │ ╭ 91                                     ╮ │
 *   │ ╭──────────────── Save ──────────────────╮ │
 *   │ ╰─────────────── Cancel ─────────────────╯ │
 *   ╰────────────────────────────────────────────╯
 *
 * `ConfirmSheet` with a field in it, deliberately kept as its own component
 * rather than a mode of that one: a confirmation is "yes or no" and its safe
 * answer is the scrim, while this has a THIRD state — a value that isn't a usable
 * number yet — and `Save` has to be able to refuse. Sharing one component would
 * mean a disabled-button branch inside the sheet every confirmation in the app
 * pays for.
 *
 * The keyboard is opened on mount and the current value is selected, so the first
 * keystroke replaces it: nobody opens this to append a digit.
 *
 * The chrome is `SheetFrame`'s — the same floating pane, handle and animated
 * exits as every other sheet — rather than a docked copy of its own.
 */

import { useState } from 'react';
import { Text, View } from 'react-native';

import { useT } from '../hooks/useT';
import { SheetCancel, SheetFrame, SheetTitle } from './Sheet';
import { FieldWell, PrimaryButton } from './primitives';

interface NumberSheetProps {
  title: string;
  body?: string;
  /** What the field starts at. Empty for "no number yet". */
  initial: number | null;
  /** Smallest value `Save` will accept. Anything below it keeps Save inert. */
  min?: number;
  /**
   * Accept one decimal place ("62.5", or "62,5" from a Russian keyboard). Off by
   * default: a workout number or a set count has no decimal point.
   */
  decimal?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (value: number) => void;
  onCancel: () => void;
}

export function NumberSheet({
  title,
  body,
  initial,
  min = 1,
  decimal = false,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: NumberSheetProps) {
  const t = useT();
  // Defaulted here rather than in the parameter list, because the default is a
  // translation and a parameter default is evaluated before the hook can run.
  const save = confirmLabel ?? t('Save');
  const keep = cancelLabel ?? t('Cancel');
  const [text, setText] = useState(initial == null ? '' : String(initial));

  /* Digits only — a workout number has no sign, no decimal point and no spaces.
     A weight may carry one decimal place, with either separator. */
  const cleaned = text.trim().replace(',', '.');
  const pattern = decimal ? /^\d+(\.\d?)?$/ : /^\d+$/;
  const parsed = pattern.test(cleaned) ? Number(cleaned) : NaN;
  const valid = Number.isFinite(parsed) && parsed >= min;

  return (
    <SheetFrame onDismiss={onCancel} dismissLabel={keep}>
      <SheetTitle>{title}</SheetTitle>
      {body ? (
        <Text style={{ marginTop: 10, fontSize: 15.5, lineHeight: 23, color: '#AEB9B3' }}>
          {body}
        </Text>
      ) : null}

      <View className="mt-lg">
        <FieldWell
          value={text}
          onChangeText={setText}
          keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
          autoFocus
          selectAllOnFocus
          lit
          placeholder={String(min)}
          accessibilityLabel={title}
        />
      </View>

      <View className="mt-xl">
        {/* Inert rather than hidden while the field holds nothing usable: a
            button that vanishes as you delete a digit is a moving target. */}
        <PrimaryButton
          label={save}
          variant={valid ? 'primary' : 'ghost'}
          onPress={valid ? () => onConfirm(parsed) : () => {}}
        />
        <View className="h-sm" />
        <SheetCancel label={keep} onDismiss={onCancel} variant="ghost" />
      </View>
    </SheetFrame>
  );
}
