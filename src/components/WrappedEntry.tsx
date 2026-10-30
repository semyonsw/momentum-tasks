/**
 * WrappedEntry — the door to a Wrapped (X1): one lit row.
 *
 *   ╭──────────────────────────────────────────╮
 *   │ 📖  September, wrapped                 › │   56 dp, the lit tier
 *   │     8 cards · your month in numbers      │
 *   ╰──────────────────────────────────────────╯
 *
 * The same row on the Landing (in the first seven days of a month, and through
 * December and January for the year) and at the foot of each history (always,
 * for last month). It reads the period through `useWrapped`, so the card count it
 * prints is the count the screen shows — and a period with nothing in it draws
 * no row at all rather than a door to an empty story.
 *
 * Lit, where the other Landing rows are plain glass: it is the one row there
 * that is an occasion rather than a log. The book is drawn here (three strokes)
 * rather than added to the symbol set for one use.
 */

import { Text, View } from 'react-native';
import { Pressable } from './Pressable';
import Svg, { Path } from 'react-native-svg';

import { useWrapped } from '../hooks/useWrapped';
import { useLanguage } from '../hooks/useT';
import { useToday } from '../hooks/useToday';
import {
  lastMonth,
  monthlyWrappedOffer,
  wrappedEntry,
  yearlyWrappedOffer,
  type WrappedPeriod,
} from '../lib/wrapped';
import { palette, radius, tint } from '../theme/tokens';
import { Icon } from './Icon';
import { pressedStyle } from './motion';

function WrappedEntry({
  period,
  onOpen,
  marginTop = 12,
}: {
  period: WrappedPeriod;
  onOpen: (period: WrappedPeriod) => void;
  marginTop?: number;
}) {
  const lang = useLanguage();
  const view = useWrapped(period);
  if (!view) return null;
  const { title, detail } = wrappedEntry(period, view.cards.length, lang);

  return (
    <Pressable
      onPress={() => onOpen(period)}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      style={({ pressed }) => [
        {
          marginTop,
          minHeight: 56,
          paddingLeft: 16,
          paddingRight: 12,
          paddingVertical: 8,
          borderRadius: radius.row,
          borderWidth: 1,
          borderColor: tint(0.3),
          backgroundColor: tint(0.13),
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        },
        pressedStyle({ pressed }),
      ]}
    >
      <Book color={palette.acc} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          maxFontSizeMultiplier={1.3}
          numberOfLines={1}
          style={{ fontSize: 16.5, lineHeight: 22 }}
          className="text-ink"
        >
          {title}
        </Text>
        <Text
          maxFontSizeMultiplier={1.3}
          numberOfLines={1}
          style={{ fontSize: 13 }}
          className="text-ink-muted"
        >
          {detail}
        </Text>
      </View>
      <Icon name="chevron-right" size={16} color={palette.inkMuted} />
    </Pressable>
  );
}

/** An open book: two pages and the spine, on a 24 grid. */
function Book({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path
        d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5M12 6.5C14 5 17 4.5 20.5 5v13c-3.5-.5-6.5 0-8.5 1.5M12 6.5v13"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/**
 * The Landing's offers: last month's during the first seven days of a month, the
 * year's through December and January — both, in early January.
 */
export function WrappedOffers({ onOpen }: { onOpen: (period: WrappedPeriod) => void }) {
  const today = useToday();
  const month = monthlyWrappedOffer(today);
  const year = yearlyWrappedOffer(today);
  return (
    <>
      {month ? <WrappedEntry period={month} onOpen={onOpen} /> : null}
      {year ? <WrappedEntry period={year} onOpen={onOpen} /> : null}
    </>
  );
}

/**
 * At the foot of each history, above its Settings row: last month's Wrapped at
 * any time, and the year's in its window. The past is where a look back belongs.
 */
export function WrappedHistoryFoot({ onOpen }: { onOpen: (period: WrappedPeriod) => void }) {
  const today = useToday();
  const year = yearlyWrappedOffer(today);
  return (
    <View className="mx-lg">
      <WrappedEntry period={lastMonth(today)} onOpen={onOpen} marginTop={24} />
      {year ? <WrappedEntry period={year} onOpen={onOpen} marginTop={8} /> : null}
    </View>
  );
}
