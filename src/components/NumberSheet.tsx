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
 * THE RETURN KEY SAVES (U8), under exactly the rule `Save` uses
 * (`lib/sheetSubmit.ts`), and the keyboard no longer covers `Save`: the field's
 * reach (see `FieldWell`'s `keyboardReach`) runs to the foot of the pane, so
 * Android's pan lifts the buttons with it. Measured rather than spelled out,
 * because the body and the two buttons are whatever height the text makes them.
 *
 * The chrome is `SheetFrame`'s — the same floating pane, handle and animated
 * exits as every other sheet — rather than a docked copy of its own.
 */

import { useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '../hooks/useT';
import { SheetCancel, SheetFrame, SheetTitle } from './Sheet';
import { FieldWell, PrimaryButton } from './primitives';
import { sheetNumber } from '../lib/sheetSubmit';

/** `SheetFrame`'s pane: 22 of padding under the last button, 8 off the screen's foot. */
const PANE_FOOT = 22 + 8;

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
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(initial == null ? '' : String(initial));
  /** From the field's foot to the pane's last button's foot, once laid out. */
  const [fieldFoot, setFieldFoot] = useState<number | null>(null);
  const [buttonsFoot, setButtonsFoot] = useState<number | null>(null);
  const keyboardReach =
    fieldFoot !== null && buttonsFoot !== null
      ? Math.max(0, buttonsFoot - fieldFoot) + PANE_FOOT + insets.bottom
      : 0;

  const parsed = sheetNumber(text, { min, decimal });
  const valid = parsed !== null;
  const submit = () => {
    if (parsed !== null) onConfirm(parsed);
  };

  return (
    <SheetFrame onDismiss={onCancel} dismissLabel={keep}>
      <SheetTitle>{title}</SheetTitle>
      {body ? (
        <Text style={{ marginTop: 10, fontSize: 15.5, lineHeight: 23, color: '#AEB9B3' }}>
          {body}
        </Text>
      ) : null}

      <View
        className="mt-lg"
        onLayout={(e) => setFieldFoot(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
      >
        <FieldWell
          value={text}
          onChangeText={setText}
          keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
          autoFocus
          selectAllOnFocus
          lit
          placeholder={String(min)}
          onSubmitEditing={submit}
          keyboardReach={keyboardReach}
          accessibilityLabel={title}
        />
      </View>

      <View
        className="mt-xl"
        onLayout={(e) => setButtonsFoot(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
      >
        {/* Inert rather than hidden while the field holds nothing usable: a
            button that vanishes as you delete a digit is a moving target. */}
        <PrimaryButton label={save} variant={valid ? 'primary' : 'ghost'} onPress={submit} />
        <View className="h-sm" />
        <SheetCancel label={keep} onDismiss={onCancel} variant="ghost" />
      </View>
    </SheetFrame>
  );
}
