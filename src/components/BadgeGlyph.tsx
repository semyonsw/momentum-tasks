/**
 * BadgeGlyph — one badge's round mark: lit in its tier's theme stop once
 * earned, a dashed outline while locked (design 19a).
 *
 *   earned   ( ◉ )  the stop at 14% fill, 55% edge, glyph in the stop
 *   locked   ( ┆ )  dashed `ink-faint` edge, no fill, glyph in `ink-faint`
 *
 * The glyph is the series the badge counts — the flame for runs, the tick for
 * everything else — so a row of badges reads by what they are about before a
 * word of them is read. Not one glyph per badge: pictures nobody has to learn
 * are pictures nobody does.
 *
 * Bronze, silver and gold are the THEME's c3, c2 and c1 (the design's note), so
 * a gold badge is the brightest stop of whatever theme is worn, never a metal
 * colour that clashes with it.
 */

import { View } from 'react-native';

import { Icon } from './Icon';
import { MaterialSymbol } from './MaterialSymbol';
import type { Badge, BadgeTier, LogFacts } from '../lib/achievements';
import { palette, stopTint } from '../theme/tokens';

/** Theme stop per tier: bronze c3, silver c2, gold c1. */
function tierStop(tier: BadgeTier): 1 | 2 | 3 {
  return tier === 3 ? 1 : tier === 2 ? 2 : 3;
}

/** The tier's own colour — the stop itself. */
export function tierColor(tier: BadgeTier): string {
  return stopTint(tierStop(tier), 1);
}

function Glyph({ series, size, color }: { series: keyof LogFacts; size: number; color: string }) {
  if (series === 'runs') return <Icon name="flame" size={size} color={color} />;
  return <MaterialSymbol name="task_alt" size={size} color={color} filled />;
}

export function BadgeGlyph({
  badge,
  series,
  size = 52,
}: {
  badge: Pick<Badge, 'tier' | 'earnedOn'>;
  series: keyof LogFacts;
  size?: number;
}) {
  const earned = badge.earnedOn !== null;
  const stop = tierStop(badge.tier);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: earned ? 1.5 : 1.25,
        borderStyle: earned ? 'solid' : 'dashed',
        borderColor: earned ? stopTint(stop, 0.55) : palette.inkFaint,
        backgroundColor: earned ? stopTint(stop, 0.14) : 'transparent',
      }}
    >
      <Glyph
        series={series}
        size={Math.round(size * 0.44)}
        color={earned ? stopTint(stop, 1) : palette.inkFaint}
      />
    </View>
  );
}
