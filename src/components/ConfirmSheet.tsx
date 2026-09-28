/**
 * ConfirmSheet — "are you sure", in the bottom third where the thumb already is.
 *
 *   ╭────────────────────────────────────────────╮
 *   │ Delete “Weighted dips”?                    │
 *   │ It's in 2 routines. Sets you already logged │
 *   │ stay in your history.                       │
 *   │                                            │
 *   │ ╭──── Keep it ────╮  ╭───── Delete ─────╮ │
 *   │ ╰─────────────────╯  ╰──────────────────╯ │
 *   ╰────────────────────────────────────────────╯
 *
 * A sheet rather than a dialog, for the same reason `FinishSheet` is one: both
 * answers have to stay under the thumb. A centred dialog puts the destructive
 * option in the middle of the screen and asks the user to reach for it.
 *
 * ── RED, FINALLY, AND ONLY WHERE SOMETHING IS LOST ───────────────────────
 *
 * This header used to say there is no red in this app, because a red button
 * teaches people to fear a button. v3 adds exactly one: `tone="danger"` paints
 * the confirm `#E0735F` for the answers that delete, discard or overwrite —
 * and nothing else, so it stays information rather than decoration. Every other
 * confirm keeps the theme gradient. What still makes the sheet safe is that the
 * cancel sits first under the thumb, and that the whole scrim, the handle and
 * hardware back all mean it.
 *
 * Built on `SheetFrame`, so it is the same floating pane, entrance and exits as
 * every other sheet; the cancel animates out before `onCancel`, the confirm
 * answers at once.
 */

import { Text, View } from 'react-native';

import { SheetCancel, SheetFrame, SheetTitle } from './Sheet';
import { useT } from '../hooks/useT';
import { PrimaryButton } from './primitives';

interface ConfirmSheetProps {
  /** "Delete “Weighted dips”?" — a question, naming the actual subject. */
  title: string;
  /** What will happen, and what won't. States consequences, never scolds. */
  body?: string;
  confirmLabel: string;
  /** Defaults to the translated `Cancel`, so a caller only names an unusual one. */
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /**
   * `danger` for a confirm that deletes, discards or overwrites. Defaults to
   * `primary` — the theme gradient — which is what every confirm used to be.
   */
  tone?: 'primary' | 'danger';
}

export function ConfirmSheet({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  tone = 'primary',
}: ConfirmSheetProps) {
  const t = useT();
  const keep = cancelLabel ?? t('Cancel');

  // Tapping the scrim is the safe answer: the easy gesture is never the
  // irreversible one, even when the easy gesture is a mis-tap. Back is `Keep`
  // too — `SheetFrame` registers it.
  return (
    <SheetFrame onDismiss={onCancel} dismissLabel={keep}>
      <SheetTitle>{title}</SheetTitle>
      {body ? (
        <Text style={{ marginTop: 10, fontSize: 15.5, lineHeight: 23, color: BODY }}>{body}</Text>
      ) : null}

      <View className="flex-row" style={{ marginTop: 20, gap: 10 }}>
        <View className="flex-1">
          <SheetCancel label={keep} onDismiss={onCancel} variant="ghost" />
        </View>
        <View className="flex-1">
          <PrimaryButton
            label={confirmLabel}
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onPress={onConfirm}
          />
        </View>
      </View>
    </SheetFrame>
  );
}

/** The design's body grey — between `ink-muted` and ink, for a sentence to read. */
const BODY = '#AEB9B3';
