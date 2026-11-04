/**
 * InsightsDoor — the way into Insights (X2), at the foot of each history.
 *
 *   ╭──────────────────────────────────────────╮
 *   │ ▮▯  Insights              2 patterns   › │   56 dp, raised glass
 *   ╰──────────────────────────────────────────╯
 *
 * At the foot of the spending history, under Wrapped and above Settings (the
 * T-10 foot row): the past is where a look back belongs. Until 3.0.0 it sat
 * under all three histories, because most insights compared two logs; since the
 * split only the Expenses app has a card left to show (`insights.insightsOffered`),
 * and the shell passes no `onOpenInsights` elsewhere, so the door is not drawn.
 * Rejected: a card on the section's first screen — a page whose cards change
 * once in weeks does not earn a place there.
 *
 * The count is `useInsights`' own, so the door never promises a card the screen
 * does not show; with none it says so instead of hiding — the screen explains
 * what will appear and when. The two-bar glyph is drawn here for one use.
 */

import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Icon } from './Icon';
import { BubblePressable } from './bubbles';
import { pressedStyle } from './motion';
import { useInsights } from '../hooks/useInsights';
import { useT } from '../hooks/useT';
import { glass, palette, radius } from '../theme/tokens';

export function InsightsDoor({ onPress }: { onPress: () => void }) {
  const t = useT();
  const found = useInsights().length;
  const detail = found > 0 ? t('{n} found', { n: found }) : t('Not enough data yet');

  return (
    <View className="mx-lg mt-sm">
      <BubblePressable
        onPress={onPress}
        radius={radius.row}
        accessibilityRole="button"
        accessibilityLabel={`${t('Insights')}. ${detail}`}
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
        <TwoBars color={palette.acc} />
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          className="flex-1 text-body font-medium text-ink"
        >
          {t('Insights')}
        </Text>
        <View style={{ maxWidth: '50%' }}>
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
    </View>
  );
}

/** Two horizontal bars of unequal length — a comparison, on a 24 grid. */
function TwoBars({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path d="M4 8h15M4 16h9" stroke={color} strokeWidth={3} strokeLinecap="round" fill="none" />
    </Svg>
  );
}
