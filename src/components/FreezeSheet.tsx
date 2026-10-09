/**
 * FreezeSheet — what a streak freeze is, opened from the ❄ on a flame (E3,
 * design 21).
 *
 *   ( ❄ )  1 streak freeze
 *          Reading
 *   A freeze covers one day you didn't answer, so the streak carries on.
 *   It's used for you, the morning after.
 *   ┌──────────────────────────────────────────────┐
 *   │ Earn one for every 7 days in a row. Hold up   │
 *   │ to 2. Skipping on purpose never needs one.    │
 *   └──────────────────────────────────────────────┘
 *   Used on 19 September.
 *
 * Read-only: a freeze is not spent by a tap, it is spent by a gap, so there is
 * nothing to decide here — only the rule, said once, with its numbers taken
 * from `lib/streakFreeze.ts` so the sheet cannot drift from what is applied.
 */

import { Text, View } from 'react-native';

import { Icon } from './Icon';
import { SheetCancel, SheetFrame } from './Sheet';
import { useLanguage, useT } from '../hooks/useT';
import { describeCovered, describeFreezeRule, describeFreezes } from '../lib/streakFreeze';
import { glass, palette, radius, tint } from '../theme/tokens';

export function FreezeSheet({
  taskName,
  held,
  covered,
  onDismiss,
}: {
  taskName: string;
  held: number;
  covered: readonly string[];
  onDismiss: () => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const used = describeCovered(covered, lang);
  return (
    <SheetFrame onDismiss={onDismiss} dismissLabel={t('Close')}>
      <View className="flex-row items-center" style={{ gap: 14 }}>
        <View
          style={{
            width: 60,
            height: 60,
            borderRadius: 30,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: tint(0.3),
            backgroundColor: tint(0.13),
          }}
        >
          <Icon name="snowflake" size={28} color={palette.acc} />
        </View>
        <View className="flex-1">
          <Text
            maxFontSizeMultiplier={1.3}
            style={{ fontSize: 22, lineHeight: 27, letterSpacing: -0.4 }}
            className="font-semibold text-ink"
          >
            {describeFreezes(held, lang)}
          </Text>
          <Text maxFontSizeMultiplier={1.3} numberOfLines={2} className="text-label text-ink-muted">
            {taskName}
          </Text>
        </View>
      </View>
      <Text maxFontSizeMultiplier={1.3} className="mt-lg text-body text-ink">
        {`${t("A freeze covers one day you didn't answer, so the streak carries on.")} ${t(
          'It’s used for you, the morning after.',
        )}`}
      </Text>
      <View
        className="mt-md"
        style={{
          padding: 14,
          borderRadius: radius.row,
          borderWidth: 1,
          borderColor: glass.raisedEdge,
          backgroundColor: glass.raised,
        }}
      >
        <Text maxFontSizeMultiplier={1.3} className="text-label text-ink-muted">
          {describeFreezeRule(lang)}
        </Text>
      </View>
      {used ? (
        <Text maxFontSizeMultiplier={1.3} className="mt-sm text-label text-ink-faint">
          {used}
        </Text>
      ) : null}
      <View className="mt-lg">
        <SheetCancel label={t('Close')} onDismiss={onDismiss} variant="ghost" />
      </View>
    </SheetFrame>
  );
}
