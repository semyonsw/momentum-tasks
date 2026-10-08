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
 * ── RED ONLY ON THE LAST CHANCE, AND THE SAFE ANSWER IS THE FILLED ONE ───
 *
 *   ╭─────────────────────────────────────────── coral edge ╮
 *   │ CAN'T BE UNDONE                              coral     │
 *   │ Delete “Push A”?                                       │
 *   │ It is in 2 routines. Sets you logged stay.             │
 *   │ ╭──────────────── Keep it ───────────────╮  filled     │
 *   │ ╭──────────────── Delete it ─────────────╮  coral line │
 *   ╰────────────────────────────────────────────────────────╯
 *
 * `tone="danger"` is the ONE destructive rule's second half (U19): the control
 * that opens it is muted text at the foot of its screen (`DangerFootAction`),
 * and this sheet is where the colour finally appears — a coral edge, a
 * coral `Can't be undone` kicker and a coral OUTLINED answer. The safe answer
 * sits first and is the filled pill, so the heavier thing under the thumb is
 * the one that loses nothing. It used to be the other way round — keep as a
 * ghost, delete as a filled coral pill — which made the destructive answer the
 * most finished-looking button on the screen. The two are stacked full-width,
 * as drawn, rather than side by side: a mis-tap between neighbours is a
 * sideways slip, and stacking turns it into a reach.
 *
 * Every confirm that deletes, discards, archives or overwrites passes it — a
 * grep test (`lib/destructive.test.ts`) holds that line, and today that is
 * every confirm in the app (`Disconnect` too: the chats stay, the key goes;
 * `Restart the clock` too: the time on it is overwritten). `primary`, the
 * gradient side by side with `Cancel`, stays for a confirm that loses nothing.
 *
 * Whatever the tone, the scrim, the handle and hardware back all mean the safe
 * answer.
 *
 * Built on `SheetFrame`, so it is the same floating pane, entrance and exits as
 * every other sheet; the cancel animates out before `onCancel`, the confirm
 * answers at once.
 */

import { Text, View } from 'react-native';

import { SheetCancel, SheetFrame, SheetTitle } from './Sheet';
import { useT } from '../hooks/useT';
import { PrimaryButton } from './primitives';
import { danger, dangerTint } from '../theme/tokens';

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
   * `danger` for a confirm that deletes, discards, archives or overwrites.
   * Defaults to `primary` — the theme gradient — for a confirm that loses nothing.
   */
  tone?: 'primary' | 'danger';
  /** The danger kicker. `Can't be undone` unless something truer applies. */
  kicker?: string;
}

export function ConfirmSheet({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  tone = 'primary',
  kicker,
}: ConfirmSheetProps) {
  const t = useT();
  const keep = cancelLabel ?? t('Cancel');
  const isDanger = tone === 'danger';

  // Tapping the scrim is the safe answer: the easy gesture is never the
  // irreversible one, even when the easy gesture is a mis-tap. Back is `Keep`
  // too — `SheetFrame` registers it.
  return (
    <SheetFrame
      onDismiss={onCancel}
      dismissLabel={keep}
      edge={isDanger ? dangerTint.edge : undefined}
    >
      {isDanger ? (
        <Text
          maxFontSizeMultiplier={1.3}
          style={{ color: danger, fontSize: 12.5, letterSpacing: 1.1, marginBottom: 4 }}
          className="font-semibold uppercase"
        >
          {kicker ?? t('Can’t be undone')}
        </Text>
      ) : null}
      <SheetTitle>{title}</SheetTitle>
      {body ? (
        <Text style={{ marginTop: 10, fontSize: 15.5, lineHeight: 23, color: BODY }}>{body}</Text>
      ) : null}

      {isDanger ? (
        // Stacked, safe first and filled, the destructive answer outlined under it.
        <View style={{ marginTop: 20, gap: 8 }}>
          <SheetCancel label={keep} onDismiss={onCancel} variant="ghost" />
          <PrimaryButton label={confirmLabel} variant="danger" onPress={onConfirm} />
        </View>
      ) : (
        <View className="flex-row" style={{ marginTop: 20, gap: 10 }}>
          <View className="flex-1">
            <SheetCancel label={keep} onDismiss={onCancel} variant="ghost" />
          </View>
          <View className="flex-1">
            <PrimaryButton label={confirmLabel} onPress={onConfirm} />
          </View>
        </View>
      )}
    </SheetFrame>
  );
}

/** The design's body grey — between `ink-muted` and ink, for a sentence to read. */
const BODY = '#AEB9B3';
