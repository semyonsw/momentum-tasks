/**
 * AiBlocks — how each kind of chat message is drawn.
 *
 *   UserBubble    what was asked, right-aligned, on the lit tint
 *   TextAnswer    `GEMINI` and a short paragraph
 *   SummaryCard   up to three stats, bars, rows in a well, notes
 *   Typing        three dots, and how much of the log is being read
 *   ErrorAnswer   one sentence, and `Try again`
 *
 * ── A SUMMARY IS DRAWN IN THE APP'S OWN VOCABULARY ─────────────────────────
 *
 * The stats are the hero's `HeroStat` at a smaller step, the bars are the one
 * gradient the ✓ marks use (the tallest bar only, because one lit thing per card
 * is the rule), and the rows sit in a `well` the way the home screen's Recent
 * list does. An answer from the assistant should read as another screen of this
 * app rather than as a pasted web page — which is also why every value is
 * tabular and nothing here carries a colour the palette does not have.
 *
 * `trend: down` is `ink-muted` and not red, for the reason `trending-down` is:
 * green means progress in this app, and its absence is not an alarm.
 */

import { useEffect, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { BubblePressable } from './bubbles';
import { COMMIT_GRADIENT, GlassSurface } from './glass';
import { Icon } from './Icon';
import { pressedStyle } from './motion';
import { useMotionScale } from '../hooks/useMotionScale';
import { useT } from '../hooks/useT';
import type { SummaryBlock } from '../lib/ai/aiSchema';
import { glassTier, greenSteps, palette, radius } from '../theme/tokens';

/** The 10 px green kicker every answer opens with. */
function AnswerKicker({ children }: { children: string }) {
  return (
    <Text
      allowFontScaling={false}
      style={{ fontSize: 10, letterSpacing: 1.2 }}
      className="mb-xs font-semibold uppercase text-green-bright"
    >
      {children}
    </Text>
  );
}

export function UserBubble({ text }: { text: string }) {
  return (
    <View style={{ alignSelf: 'flex-end', maxWidth: '82%' }}>
      <View
        style={{
          backgroundColor: glassTier.lit.tint,
          borderColor: glassTier.lit.border,
          borderWidth: 1,
          borderRadius: 18,
          borderBottomRightRadius: 6,
          paddingHorizontal: 14,
          paddingVertical: 10,
        }}
      >
        <Text style={{ fontSize: 15, lineHeight: 21 }} className="text-ink">
          {text}
        </Text>
      </View>
    </View>
  );
}

export function TextAnswer({ text }: { text: string }) {
  const t = useT();
  return (
    <View style={{ maxWidth: '94%' }}>
      <AnswerKicker>{t('Gemini')}</AnswerKicker>
      <Text style={{ fontSize: 15, lineHeight: 22 }} className="text-ink">
        {text}
      </Text>
    </View>
  );
}

/** `187 400` → `187k`: a bar's label has room for four characters. */
function compact(value: number): string {
  if (value >= 10_000) return `${Math.round(value / 1000)}k`;
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(Math.round(value * 10) / 10);
}

const BAR_HEIGHT = 58;

export function SummaryCard({ block }: { block: SummaryBlock }) {
  const max = block.bars ? Math.max(1, ...block.bars.map((b) => b.value)) : 1;
  return (
    <GlassSurface tier="card" radius={radius.card} shadow="e1" flat>
      <View style={{ padding: 16 }}>
        {block.title ? <AnswerKicker>{block.title}</AnswerKicker> : null}

        {block.stats ? (
          <View className="mt-sm flex-row">
            {block.stats.map((stat) => (
              <View key={stat.label} className="flex-1 pr-sm">
                <Text
                  allowFontScaling={false}
                  numberOfLines={1}
                  style={{ fontSize: 10, letterSpacing: 1 }}
                  className="font-semibold uppercase text-ink-faint"
                >
                  {stat.label}
                </Text>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={{ fontSize: 20, lineHeight: 24 }}
                  className="mt-[2px] font-semibold tabular-nums text-ink"
                >
                  {stat.value}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {block.bars ? (
          <View className="mt-lg flex-row items-end" style={{ gap: 6 }}>
            {block.bars.map((bar, index) => {
              const top = bar.value === max;
              return (
                <View key={`${bar.label}-${index}`} className="flex-1 items-center">
                  <Text
                    numberOfLines={1}
                    style={{ fontSize: 10 }}
                    className={[
                      'mb-xs tabular-nums',
                      top ? 'text-green-bright' : 'text-ink-faint',
                    ].join(' ')}
                  >
                    {compact(bar.value)}
                  </Text>
                  <View
                    style={{
                      width: '100%',
                      height: Math.max(3, Math.round((bar.value / max) * BAR_HEIGHT)),
                      borderRadius: 6,
                      overflow: 'hidden',
                      backgroundColor: top ? undefined : greenSteps[0],
                      ...(top
                        ? {
                            boxShadow: [
                              {
                                offsetX: 0,
                                offsetY: 0,
                                blurRadius: 14,
                                color: 'rgba(63,169,108,0.35)',
                              },
                            ],
                          }
                        : {}),
                    }}
                  >
                    {top ? (
                      <LinearGradient
                        colors={[...COMMIT_GRADIENT]}
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                      />
                    ) : null}
                  </View>
                  <Text numberOfLines={1} style={{ fontSize: 10 }} className="mt-xs text-ink-faint">
                    {bar.label}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}

        {block.rows ? (
          <GlassSurface tier="well" radius={14} flat className="mt-lg">
            {block.rows.map((row, index) => (
              <View
                key={`${row.label}-${index}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderTopWidth: index > 0 ? 1 : 0,
                  borderTopColor: palette.hairline,
                }}
              >
                <View className="flex-1 pr-sm">
                  <Text numberOfLines={1} style={{ fontSize: 14 }} className="text-ink">
                    {row.label}
                  </Text>
                  <Text
                    numberOfLines={1}
                    className="mt-[1px] text-[12px] tabular-nums text-ink-faint"
                  >
                    {row.value}
                  </Text>
                </View>
                {row.trend === 'up' || row.trend === 'down' ? (
                  <View style={{ marginRight: 6 }}>
                    <Icon
                      name={row.trend === 'up' ? 'trending-up' : 'trending-down'}
                      size={14}
                      color={row.trend === 'up' ? palette.greenBright : palette.inkMuted}
                    />
                  </View>
                ) : null}
                {row.delta ? (
                  <Text
                    numberOfLines={1}
                    style={{ minWidth: 48, textAlign: 'right', fontSize: 13 }}
                    className={[
                      'font-semibold tabular-nums',
                      row.trend === 'up' ? 'text-green-bright' : 'text-ink-muted',
                    ].join(' ')}
                  >
                    {row.delta}
                  </Text>
                ) : null}
              </View>
            ))}
          </GlassSurface>
        ) : null}

        {block.notes ? (
          <View className="mt-md">
            {block.notes.map((note, index) => (
              <View key={index} className="mt-sm flex-row">
                <View
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: 2,
                    marginTop: 8,
                    marginRight: 10,
                    backgroundColor: palette.greenBright,
                  }}
                />
                <Text style={{ fontSize: 14, lineHeight: 20 }} className="flex-1 text-ink-muted">
                  {note}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </GlassSurface>
  );
}

/** One dot, lifting on a 1.2 s cycle a third of a beat after the one before it. */
function Dot({ delay }: { delay: number }) {
  const scale = useMotionScale();
  const v = useRef(new Animated.Value(scale === 0 ? 1 : 0)).current;
  useEffect(() => {
    if (scale === 0) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, {
          toValue: 1,
          duration: 240,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 0,
          duration: 240,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.delay(720 - delay),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delay, scale, v]);
  return (
    <Animated.View
      style={{
        width: 6,
        height: 6,
        marginHorizontal: 2.5,
        borderRadius: 3,
        backgroundColor: palette.greenBright,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }),
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }],
      }}
    />
  );
}

export function Typing({ caption }: { caption: string }) {
  return (
    <View className="flex-row items-center">
      <View
        style={{
          height: 36,
          paddingHorizontal: 14,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: glassTier.card.border,
          backgroundColor: glassTier.card.tint,
        }}
        className="flex-row items-center"
      >
        <Dot delay={0} />
        <Dot delay={160} />
        <Dot delay={320} />
      </View>
      <Text className="ml-md text-label text-ink-faint">{caption}</Text>
    </View>
  );
}

export function ErrorAnswer({ text, onRetry }: { text: string; onRetry?: () => void }) {
  const t = useT();
  return (
    <View style={{ maxWidth: '94%' }}>
      <AnswerKicker>{t('Gemini')}</AnswerKicker>
      <Text style={{ fontSize: 15, lineHeight: 22 }} className="text-ink-muted">
        {text}
      </Text>
      {onRetry ? (
        <BubblePressable
          onPress={onRetry}
          radius="pill"
          accessibilityRole="button"
          accessibilityLabel={t('Try again')}
          style={(state) => [
            pressedStyle(state),
            { height: 44, justifyContent: 'center', alignSelf: 'flex-start' },
          ]}
        >
          <Text className="text-label font-semibold text-green-bright">{t('Try again')}</Text>
        </BubblePressable>
      ) : null}
    </View>
  );
}
