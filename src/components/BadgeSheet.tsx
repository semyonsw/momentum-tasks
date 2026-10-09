/**
 * BadgeSheet — one badge, opened from the gallery (E1, design 19b).
 *
 *   ( ◉ )
 *   SILVER
 *   30-day streak
 *   ███████████████████████████░░░░
 *   23 / 30 days
 *   Do one daily task 30 asked days in a row. …
 *   Earned 14 September 2026
 *
 * What it takes, where the log stands, and — once earned — the day the log
 * crossed it. Nothing to press but the way out: a badge is read, not acted on.
 * The design's "next tier at the next round number" line is not here, because
 * every tier is its own badge in the gallery's ladder, one row below.
 */

import { Text, View } from 'react-native';

import { BadgeGlyph, tierColor } from './BadgeGlyph';
import { SheetCancel, SheetFrame, SheetTitle } from './Sheet';
import { useLanguage, useT } from '../hooks/useT';
import { describeBadgeProgress, describeEarned, tierName, type Badge } from '../lib/achievements';
import { glass, palette, radius } from '../theme/tokens';

export function BadgeSheet({ badge, onDismiss }: { badge: Badge; onDismiss: () => void }) {
  const t = useT();
  const lang = useLanguage();
  const earned = describeEarned(badge, lang);
  return (
    <SheetFrame onDismiss={onDismiss} dismissLabel={t('Close')}>
      <View className="items-start">
        <BadgeGlyph badge={badge} series={badge.series} size={72} />
        <Text
          maxFontSizeMultiplier={1.3}
          style={{
            marginTop: 12,
            fontSize: 12.5,
            letterSpacing: 1.1,
            color: badge.earnedOn ? tierColor(badge.tier) : palette.inkFaint,
          }}
          className="font-semibold uppercase"
        >
          {badge.earnedOn ? tierName(badge.tier, lang) : t('Locked')}
        </Text>
      </View>
      <SheetTitle>{t(badge.title)}</SheetTitle>
      <View
        className="mt-md overflow-hidden"
        style={{ height: 8, borderRadius: radius.pill, backgroundColor: glass.sunken }}
      >
        <View
          style={{
            height: 8,
            width: `${badge.fraction * 100}%`,
            borderRadius: radius.pill,
            backgroundColor: badge.earnedOn ? tierColor(badge.tier) : palette.greenDim,
          }}
        />
      </View>
      <Text
        maxFontSizeMultiplier={1.3}
        className="mt-sm text-label font-medium tabular-nums text-ink-muted"
      >
        {describeBadgeProgress(badge, lang)}
      </Text>
      <Text maxFontSizeMultiplier={1.3} className="mt-md text-body text-ink">
        {t(badge.what)}
      </Text>
      {earned ? (
        <Text maxFontSizeMultiplier={1.3} className="mt-sm text-label text-ink-faint">
          {earned}
        </Text>
      ) : null}
      <View className="mt-lg">
        <SheetCancel label={t('Close')} onDismiss={onDismiss} variant="ghost" />
      </View>
    </SheetFrame>
  );
}
