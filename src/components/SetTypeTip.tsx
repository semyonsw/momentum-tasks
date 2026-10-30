/**
 * SetTypeTip — the set row's letters, explained once (redesign #1).
 *
 *   ╭──────────────────────────────────────────────╮
 *   │ W warm-up · D drop set · F to failure ·       │
 *   │ A as many as possible. Tap a set number to    │
 *   │ change it.                          [Got it]  │
 *   ╰──────────────────────────────────────────────╯
 *
 * Above the open card's set rows, until it is answered — then never again
 * (`seenSetTypeTip`, persisted with the rest of Settings). The letters on a row
 * and the ▾ in its set well are the whole interface for a set's type, and they
 * cost nothing to a lifter who knows them; this is the one sentence for the one
 * who does not.
 *
 * ON THE OPEN CARD, not "the first card in the list": at most one card is open,
 * so the tip is drawn once, and it is drawn over the rows the user is looking at.
 * At the start of a session that IS the first exercise.
 *
 * REJECTED: a ✕. "Got it" is the same act with its meaning written on it, and a
 * tip that can be closed without being read is a tip that comes back as a banner
 * nobody reads.
 */

import { Text, View } from 'react-native';
import { Pressable } from './Pressable';

import { tap } from '../lib/feedback';
import { SET_TYPE_LEGEND } from '../lib/setType';
import { useT } from '../hooks/useT';
import { useSettings } from '../state/settingsStore';
import { glass, tint } from '../theme/tokens';

export function SetTypeTip() {
  const t = useT();
  const seen = useSettings((s) => s.seenSetTypeTip);
  const setFlag = useSettings((s) => s.setFlag);
  if (seen) return null;
  return (
    <View
      accessibilityRole="summary"
      style={{
        marginTop: 12,
        padding: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: glass.raisedEdge,
        backgroundColor: glass.sunken,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <Text
        maxFontSizeMultiplier={1.3}
        className="flex-1 text-[13px] leading-[18px] text-ink-muted"
      >
        {`${t(SET_TYPE_LEGEND)}. ${t('Tap a set number to change it.')}`}
      </Text>
      <Pressable
        onPress={() => {
          tap();
          setFlag('seenSetTypeTip', true);
        }}
        accessibilityRole="button"
        accessibilityLabel={t('Got it')}
        style={({ pressed }) => [
          {
            minHeight: 44,
            paddingHorizontal: 14,
            borderRadius: 9999,
            borderWidth: 1,
            borderColor: tint(0.45),
            backgroundColor: tint(0.14),
            alignItems: 'center',
            justifyContent: 'center',
          },
          pressed ? { opacity: 0.7 } : null,
        ]}
      >
        <Text maxFontSizeMultiplier={1.3} className="text-label font-semibold text-acc">
          {t('Got it')}
        </Text>
      </Pressable>
    </View>
  );
}
