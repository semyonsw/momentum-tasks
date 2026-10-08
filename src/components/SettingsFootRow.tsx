/**
 * SettingsFootRow — `Settings ›` at the foot of a section's history (U24).
 *
 * A section's settings (rest times, the trend range, the default direction)
 * were reachable only from Settings → the section's row: three taps from the
 * place where you notice one of them is wrong, which is the history. So each
 * history ends with this row, and it opens THAT section's settings — the route
 * is `sectionSettingsRoute` in `lib/discoverability.ts`.
 *
 * At the FOOT and quiet, not in the header: the header corner holds the screen's
 * own controls, and a setting is the last thing a history is for. A 52 dp row on
 * the sunken step, the word in `inkMuted`, a chevron — a door, not an action.
 * Rejected: a ⚙ in the history header (a third glyph in a corner U23 just thinned
 * out) and a link in the section's root (the root is for doing, not tuning).
 */

import { Text, View } from 'react-native';

import { Icon } from './Icon';
import { Pressable } from './Pressable';
import { pressedStyle } from './motion';
import { useT } from '../hooks/useT';
import { palette } from '../theme/tokens';

export function SettingsFootRow({
  sectionLabel,
  onPress,
}: {
  /** Spoken in full — "Workout settings" — since the row itself says `Settings`. */
  sectionLabel: string;
  onPress: () => void;
}) {
  const t = useT();
  return (
    <View className="mx-lg mt-xl">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={sectionLabel}
        style={pressedStyle}
        className="h-row flex-row items-center rounded-surface border border-hairline bg-surface-alt px-lg"
      >
        <Text className="flex-1 text-body font-medium text-ink-muted">{t('Settings')}</Text>
        <Icon name="chevron-right" size={16} color={palette.inkFaint} />
      </Pressable>
    </View>
  );
}
