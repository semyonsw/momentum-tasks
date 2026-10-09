/**
 * BodyDoor — the way into the tape-measure log (W9): one glass row.
 *
 *   ╭──────────────────────────────────────────╮
 *   │ 📏  Body measurements    3 measured    › │   56 dp, raised glass
 *   ╰──────────────────────────────────────────╯
 *
 * In the two places bodyweight already lives — under the Graphs view's lines
 * and in Workout settings → Body — rather than a new corner glyph or a tab: the
 * body is part of the training log's story, and a door where you already look at
 * your weight is found without being taught. The ruler is drawn here (two
 * strokes and the ticks) rather than added to the symbol set for one use.
 */

import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Icon } from './Icon';
import { BubblePressable } from './bubbles';
import { pressedStyle } from './motion';
import { useT } from '../hooks/useT';
import { MEASUREMENTS } from '../lib/bodyMeasurements';
import { useSettings } from '../state/settingsStore';
import { glass, palette, radius } from '../theme/tokens';

export function BodyDoor({ onPress }: { onPress: () => void }) {
  const t = useT();
  const log = useSettings((s) => s.bodyMeasurements);
  const measured = MEASUREMENTS.filter((key) => (log?.[key]?.length ?? 0) > 0).length;
  const detail = measured > 0 ? t('{n} measured', { n: measured }) : t('Waist, chest, arm…');

  return (
    <BubblePressable
      onPress={onPress}
      radius={radius.row}
      accessibilityRole="button"
      accessibilityLabel={`${t('Body measurements')}. ${detail}`}
      style={(state) => [
        pressedStyle(state),
        {
          minHeight: 56,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          gap: 12,
          borderRadius: radius.row,
          borderWidth: 1,
          borderColor: glass.raisedEdge,
          backgroundColor: glass.raised,
        },
      ]}
    >
      <Ruler color={palette.acc} />
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
        className="flex-1 text-body font-medium text-ink"
      >
        {t('Body measurements')}
      </Text>
      <View style={{ maxWidth: '45%' }}>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          style={{ fontSize: 13 }}
          className="tabular-nums text-ink-faint"
        >
          {detail}
        </Text>
      </View>
      <Icon name="chevron-right" size={16} color={palette.inkFaint} />
    </BubblePressable>
  );
}

/** A tape: a slanted bar with four ticks, on a 24 grid. */
function Ruler({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path
        d="M3.5 15.5 15.5 3.5l5 5-12 12zM7 12l1.8 1.8M9.8 9.2l2.6 2.6M12.6 6.4l1.8 1.8"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
