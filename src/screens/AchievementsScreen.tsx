/**
 * AchievementsScreen — the badge gallery (E1, design 19a), behind the one
 * Wave 3 switch.
 *
 *   ‹ BADGES
 *   12 of 16 earned.
 *   Worked out from your logs, so days before the switch count too.
 *   WORKOUT
 *   ( ◉ )        ( ◉ )        ( ┆ )
 *   First        10           50
 *   workout      workouts     workouts
 *   Bronze       Bronze       27 / 50 workouts
 *   ● Bronze  ● Silver  ● Gold
 *
 * One LADDER, from its first step to its last, so the next one up is always
 * beside the last one earned. Since 3.0.0 it is this app's log's ladder only
 * (`badgeDomain`, `lib/achievements.ts`) — the Workout app shows the workout
 * badges, Tasks the task ones, Expenses the money ones — so the gallery is one
 * kicker and one grid; the per-domain loop stays because the kicker is still
 * the right heading for it. A locked badge is a dashed
 * outline with where the log stands under it — progress, never a lock icon or a
 * "you have not" sentence. Tapping any badge opens `BadgeSheet`.
 *
 * The design's line "Badges are never taken back" is NOT used: badges are
 * worked out from the logs (`lib/achievements.ts`), so deleting the hundredth
 * workout does put "100 workouts" back to 99 / 100 — the log is the record, and
 * a promise the screen cannot keep is worse than no promise. What it does say
 * is the true and more useful thing: the past counts.
 */

import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Pressable } from '../components/Pressable';
import { StatusBar } from 'expo-status-bar';

import { BadgeGlyph, tierColor } from '../components/BadgeGlyph';
import { BadgeSheet } from '../components/BadgeSheet';
import { ScreenHeader } from '../components/ScreenHeader';
import { Kicker } from '../components/primitives';
import { pressedStyle } from '../components/motion';
import { useBadges } from '../hooks/useEngagement';
import { APP_VARIANT } from '../lib/appVariant';
import { useLanguage, useT } from '../hooks/useT';
import {
  badgeDomain,
  describeBadgeProgress,
  describeGallery,
  tierName,
  type Badge,
  type BadgeDomain,
  type BadgeTier,
} from '../lib/achievements';
import { tap } from '../lib/feedback';
import { glass, palette, radius } from '../theme/tokens';

const ALL_DOMAINS: { domain: BadgeDomain; label: string }[] = [
  { domain: 'workout', label: 'Workout' },
  { domain: 'tasks', label: 'Tasks' },
  { domain: 'money', label: 'Finance' },
];

/** This app's one ladder — `useBadges` already returns only its badges. */
const DOMAINS = ALL_DOMAINS.filter(({ domain }) => domain === badgeDomain(APP_VARIANT));

/** Rows of three; the last row padded so its tiles keep a third each. */
function rowsOf<T>(list: readonly T[]): (T | null)[][] {
  const rows: (T | null)[][] = [];
  for (let i = 0; i < list.length; i += 3) {
    const row: (T | null)[] = list.slice(i, i + 3);
    while (row.length < 3) row.push(null);
    rows.push(row);
  }
  return rows;
}

export function AchievementsScreen({ onBack }: { onBack: () => void }) {
  const t = useT();
  const lang = useLanguage();
  const badges = useBadges();
  const [open, setOpen] = useState<Badge | null>(null);

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />
      <ScreenHeader kicker={t('Badges')} onBack={onBack} />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={open === null}
      >
        <Text maxFontSizeMultiplier={1.3} className="mx-lg mt-md text-body text-ink-muted">
          {describeGallery(badges, lang)}
        </Text>
        <Text maxFontSizeMultiplier={1.3} className="mx-lg mt-xs text-label text-ink-faint">
          {t('Worked out from your logs, so days before the switch count too.')}
        </Text>

        {DOMAINS.map(({ domain, label }) => (
          <View key={domain}>
            <Kicker className="mx-lg mb-kicker-gap mt-kicker">{t(label)}</Kicker>
            <View className="mx-lg" style={{ gap: 8 }}>
              {rowsOf(badges.filter((badge) => badge.domain === domain)).map((row) => (
                <View
                  key={row.map((badge) => badge?.id ?? '-').join()}
                  className="flex-row"
                  style={{ gap: 8 }}
                >
                  {row.map((badge, i) =>
                    badge ? (
                      <Tile
                        key={badge.id}
                        badge={badge}
                        onPress={() => {
                          tap();
                          setOpen(badge);
                        }}
                      />
                    ) : (
                      <View key={`pad${i}`} className="flex-1" />
                    ),
                  )}
                </View>
              ))}
            </View>
          </View>
        ))}

        <View className="mx-lg mt-lg flex-row" style={{ gap: 14 }}>
          {([1, 2, 3] as BadgeTier[]).map((tier) => (
            <View key={tier} className="flex-row items-center" style={{ gap: 6 }}>
              <View
                style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tierColor(tier) }}
              />
              <Text maxFontSizeMultiplier={1.3} className="text-label text-ink-faint">
                {tierName(tier, lang)}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {open ? <BadgeSheet badge={open} onDismiss={() => setOpen(null)} /> : null}
    </View>
  );
}

function Tile({ badge, onPress }: { badge: Badge; onPress: () => void }) {
  const t = useT();
  const lang = useLanguage();
  const earned = badge.earnedOn !== null;
  const status = earned ? tierName(badge.tier, lang) : describeBadgeProgress(badge, lang);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${t(badge.title)}. ${status}`}
      className="flex-1"
      style={(state) => [
        pressedStyle(state),
        {
          minHeight: 132,
          alignItems: 'center',
          paddingTop: 14,
          paddingBottom: 12,
          paddingHorizontal: 6,
          borderRadius: radius.row,
          borderWidth: 1,
          borderColor: glass.raisedEdge,
          backgroundColor: earned ? glass.raised : glass.sunken,
        },
      ]}
    >
      <BadgeGlyph badge={badge} series={badge.series} />
      <Text
        maxFontSizeMultiplier={1.3}
        numberOfLines={3}
        style={{ marginTop: 10, fontSize: 13.5, lineHeight: 17, textAlign: 'center' }}
        className={earned ? 'text-ink' : 'text-ink-muted'}
      >
        {t(badge.title)}
      </Text>
      <Text
        maxFontSizeMultiplier={1.3}
        numberOfLines={2}
        style={{
          marginTop: 4,
          fontSize: 12.5,
          lineHeight: 16,
          textAlign: 'center',
          color: earned ? tierColor(badge.tier) : palette.inkFaint,
        }}
        className="font-semibold tabular-nums"
      >
        {status}
      </Text>
    </Pressable>
  );
}
