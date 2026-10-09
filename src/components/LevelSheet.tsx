/**
 * LevelChip + LevelSheet — the level (E2, design 20), behind Wave 3's switch.
 *
 *   Good afternoon                       ◎        ← the greeting
 *   ( Lv 6 ▬▬░ )                                  ← the chip, under it
 *
 *   LEVEL 6
 *   1,920  of 2,100 XP to level 7
 *   ███████████████████░░░░░░░
 *   HOW XP IS EARNED
 *   Log a working set                 +2
 *   Finish a workout                 +40   …
 *   XP only goes up. A missed day earns nothing and takes nothing.
 *   [ Badges ]
 *
 * The chip is small and sits UNDER the greeting rather than in place of the
 * app mark beside it: the landing's argument is the three logs, and a score
 * that took the corner would make it the point. The sheet states the whole
 * rule — the table every figure is made of, and `xp.note` — so the number is
 * never a mystery to be optimised; it is the logs, counted.
 *
 * Nothing here can show a fall: the total is recomputed from the logs
 * (`lib/xp.ts`), every weight is positive, and no line compares today with
 * yesterday.
 */

import { Text, View } from 'react-native';
import { Pressable } from './Pressable';

import { SheetCancel, SheetFrame } from './Sheet';
import { PrimaryButton } from './primitives';
import { pressedStyle } from './motion';
import { useLanguage, useT } from '../hooks/useT';
import { formatValue } from '../lib/money';
import { describeNextLevel, type LevelProgress, type XpLine } from '../lib/xp';
import { glass, gradientBar, palette, radius, tint } from '../theme/tokens';
import { LinearGradient } from 'expo-linear-gradient';

export function LevelChip({ progress, onPress }: { progress: LevelProgress; onPress: () => void }) {
  const t = useT();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('Level {n}, {xp} XP. Open the level', {
        n: progress.level,
        xp: formatValue(progress.xp),
      })}
      // 28 drawn, 44 to the thumb.
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 12 }}
      style={(state) => [
        pressedStyle(state),
        {
          alignSelf: 'flex-start',
          height: 28,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 11,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: tint(0.3),
          backgroundColor: tint(0.13),
        },
      ]}
    >
      <Text
        maxFontSizeMultiplier={1.3}
        style={{ fontSize: 13, color: palette.acc }}
        className="font-semibold tabular-nums"
      >
        {t('Lv {n}', { n: progress.level })}
      </Text>
      <View
        style={{ width: 28, height: 4, borderRadius: 2, backgroundColor: glass.raisedEdge }}
        className="overflow-hidden"
      >
        <View
          style={{
            width: `${progress.fraction * 100}%`,
            height: 4,
            borderRadius: 2,
            backgroundColor: palette.acc,
          }}
        />
      </View>
    </Pressable>
  );
}

export function LevelSheet({
  progress,
  lines,
  onOpenBadges,
  onDismiss,
}: {
  progress: LevelProgress;
  lines: readonly XpLine[];
  onOpenBadges: () => void;
  onDismiss: () => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const bar = gradientBar();
  return (
    <SheetFrame onDismiss={onDismiss} dismissLabel={t('Close')}>
      <Text
        maxFontSizeMultiplier={1.3}
        style={{ fontSize: 12.5, letterSpacing: 1.1, color: palette.acc }}
        className="font-semibold uppercase"
      >
        {t('Level {n}', { n: progress.level })}
      </Text>
      <View className="mt-xs flex-row items-baseline" style={{ gap: 8 }}>
        <Text
          maxFontSizeMultiplier={1.3}
          style={{ fontSize: 40, lineHeight: 46, letterSpacing: -1 }}
          className="font-semibold tabular-nums text-ink"
        >
          {formatValue(progress.xp)}
        </Text>
        <Text maxFontSizeMultiplier={1.3} className="flex-1 text-label text-ink-muted">
          {describeNextLevel(progress, lang)}
        </Text>
      </View>
      <View
        className="mt-md overflow-hidden"
        style={{ height: 8, borderRadius: radius.pill, backgroundColor: glass.sunken }}
      >
        <LinearGradient
          colors={bar.colors}
          start={bar.start}
          end={bar.end}
          style={{ height: 8, width: `${progress.fraction * 100}%`, borderRadius: radius.pill }}
        />
      </View>

      <Text
        maxFontSizeMultiplier={1.3}
        style={{ marginTop: 22, fontSize: 12.5, letterSpacing: 1.1 }}
        className="font-semibold uppercase text-ink-faint"
      >
        {t('How XP is earned')}
      </Text>
      <View className="mt-xs">
        {lines.map((line, i) => (
          <View
            key={line.source}
            className="flex-row items-center"
            style={{
              minHeight: 44,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: glass.raisedEdge,
            }}
          >
            <View className="flex-1 pr-md">
              <Text maxFontSizeMultiplier={1.3} className="text-body text-ink">
                {t(line.label)}
              </Text>
              {line.count > 0 ? (
                <Text maxFontSizeMultiplier={1.3} className="text-micro text-ink-faint">
                  {t('{n} so far', { n: `${formatValue(line.xp)} ${t('XP')}` })}
                </Text>
              ) : null}
            </View>
            <Text
              maxFontSizeMultiplier={1.3}
              style={{ color: palette.acc }}
              className="text-body font-semibold tabular-nums"
            >
              {`+${line.each}`}
            </Text>
          </View>
        ))}
      </View>
      <Text maxFontSizeMultiplier={1.3} className="mt-sm text-label text-ink-faint">
        {t('XP only goes up. A missed day earns nothing and takes nothing.')}
      </Text>

      <View className="mt-lg">
        <PrimaryButton label={t('Badges')} variant="ghost" onPress={onOpenBadges} />
        <SheetCancel label={t('Close')} onDismiss={onDismiss} />
      </View>
    </SheetFrame>
  );
}
