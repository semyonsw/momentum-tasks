/**
 * Wrapped (X1) — a month or a year of this app's log, as story cards.
 *
 *   ▬▬▬▬ ▬▬▬▬ ──── ──── ──── ──── ──── ────     the dash bar: where you are
 *   MOMENTUM · 2 / 8                       ✕
 *
 *
 *   TONNAGE
 *   61,480 kg
 *   About as heavy as 41 cars.
 *   Every working set. Warm-ups are left out.
 *
 *   Tap right for next · left to go back
 *
 * ── HOW IT MOVES ──────────────────────────────────────────────────────────
 *
 * Tap the right two thirds to go on, the left third to go back — the left is
 * narrower because going on is what a thumb does nine times in ten. A horizontal
 * swipe does the same either way. It never advances on a timer: these are
 * figures somebody may want to read twice, and an auto-advancing story is one
 * the reader is chasing. TalkBack reads the card and steps with the adjustable
 * gestures. The last tap on the last card does nothing — closing is the ✕ or
 * Back, never a tap that meant "next".
 *
 * ── THE SUMMARY ───────────────────────────────────────────────────────────
 *
 * Laid out inside a 9:16 frame (the 1080 × 1920 a story export would be), with
 * the app's mark and "no account · on my phone" at its foot, so that sharing it
 * later (W7, Wave 4) is an export of what is already on screen. There is no Share
 * button yet: a button that cannot share is worse than none.
 *
 * Composition only. Every word and figure is `lib/wrapped.ts`, read through
 * `useWrapped`; the cards that exist are the cards that had something to say.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from 'react-native';
import { Pressable } from '../components/Pressable';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppMark } from '../components/AppMark';
import { Icon } from '../components/Icon';
import { pressedStyle } from '../components/motion';
import { useMotionScale } from '../hooks/useMotionScale';
import { useT } from '../hooks/useT';
import { useWrapped } from '../hooks/useWrapped';
import { tap } from '../lib/feedback';
import { LAUNCH_BRAND } from '../lib/launchReady';
import type { WrappedCard, WrappedPeriod, WrappedSummary } from '../lib/wrapped';
import { curve, glass, motion, palette, radius, stopTint, tint } from '../theme/tokens';

/*
 * The name on the story's header and on the summary card is the app's own, the
 * same untranslated name the launcher and the launch screen show.
 */
const APP_NAME = LAUNCH_BRAND.wordmark;

/** The share of the width that steps BACK; the rest steps on. */
const BACK_ZONE = 0.35;
/** A horizontal drag this long is a swipe, not a tap. */
const SWIPE = 40;
/** Room the top bar takes under the status bar. */
const TOP = 84;
/** Room the hint line takes above the home indicator. */
const FOOT = 72;

export function WrappedScreen({ period, onClose }: { period: WrappedPeriod; onClose: () => void }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const view = useWrapped(period);
  const [index, setIndex] = useState(0);
  const cards = view?.cards ?? [];
  const last = cards.length - 1;
  const card = cards[Math.min(index, Math.max(0, last))];

  const step = (by: 1 | -1) => {
    const next = Math.max(0, Math.min(last, index + by));
    if (next === index) return;
    tap();
    setIndex(next);
  };

  /* Tap or swipe, decided on release, so a swipe is never also a tap. */
  const startX = useRef(0);
  const onGrant = (e: GestureResponderEvent) => {
    startX.current = e.nativeEvent.pageX;
  };
  const onRelease = (e: GestureResponderEvent) => {
    const dx = e.nativeEvent.pageX - startX.current;
    if (dx <= -SWIPE) step(1);
    else if (dx >= SWIPE) step(-1);
    else step(e.nativeEvent.pageX < width * BACK_ZONE ? -1 : 1);
  };

  if (!view || !card) {
    // The data moved under an open screen (a reset, an import): say so, offer the way out.
    return (
      <View className="flex-1 items-center justify-center bg-bg px-xl">
        <Text maxFontSizeMultiplier={1.3} className="text-center text-body text-ink-muted">
          {t('Nothing to wrap up for this period.')}
        </Text>
        <CloseButton label={t('Close')} onPress={onClose} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg">
      <Glows width={width} height={height} />

      {/* The whole stage is the tap target; the top bar sits above it. */}
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={spoken(card, view.summary)}
        accessibilityHint={t('Tap right for next · left to go back')}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'decrement' ? -1 : 1)}
        onStartShouldSetResponder={() => true}
        onResponderGrant={onGrant}
        onResponderRelease={onRelease}
        style={{ position: 'absolute', top: insets.top + TOP, left: 0, right: 0, bottom: 0 }}
      >
        {card.key === 'summary' ? (
          <SummaryFrame
            key={card.key}
            summary={view.summary}
            width={width}
            available={height - insets.top - TOP - insets.bottom - FOOT}
          />
        ) : (
          <StoryCard key={card.key} card={card} bottom={insets.bottom + FOOT + 48} />
        )}
      </View>

      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', top: insets.top + 14, left: 12, right: 4 }}
      >
        <View style={{ flexDirection: 'row', gap: 4, paddingRight: 8 }}>
          {cards.map((c, i) => (
            <View
              key={c.key}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                backgroundColor: i <= index ? palette.ink : glass.dash,
              }}
            />
          ))}
        </View>
        <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center' }}>
          <Text
            maxFontSizeMultiplier={1.3}
            style={{ flex: 1, fontSize: 12.5, letterSpacing: 1.1, textTransform: 'uppercase' }}
            className="font-semibold text-ink-muted"
          >
            {`${APP_NAME} · ${index + 1} / ${cards.length}`}
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('Close')}
            style={({ pressed }) => [
              { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
              pressedStyle({ pressed }),
            ]}
          >
            <Icon name="x" size={22} color={palette.ink} />
          </Pressable>
        </View>
      </View>

      <Text
        pointerEvents="none"
        maxFontSizeMultiplier={1.3}
        style={{
          position: 'absolute',
          left: 24,
          right: 24,
          bottom: insets.bottom + 28,
          fontSize: 13,
        }}
        className="text-ink-faint"
      >
        {t('Tap right for next · left to go back')}
      </Text>
    </View>
  );
}

/** What TalkBack reads for the card on screen. */
function spoken(card: WrappedCard, summary: WrappedSummary): string {
  if (card.key === 'summary') {
    return [summary.kicker, summary.title, ...summary.cells.map((c) => `${c.label} ${c.value}`)]
      .filter(Boolean)
      .join('. ');
  }
  return [card.kicker, `${card.big} ${card.unit}`.trim(), card.line, card.sub]
    .filter(Boolean)
    .join('. ');
}

/** A card arriving: a short rise on the pop curve. Instant with motion off. */
function useArrival() {
  const motionScale = useMotionScale();
  const run = useRef(new Animated.Value(motionScale === 0 ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(run, {
      toValue: 1,
      duration: 520 * motionScale,
      easing: curve(motion.pop),
      useNativeDriver: true,
    }).start();
  }, [motionScale, run]);
  return useMemo(
    () => ({
      opacity: run.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
      transform: [{ translateY: run.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
    }),
    [run],
  );
}

/** One fact: kicker, the big figure and its unit, the line, the small print. */
function StoryCard({ card, bottom }: { card: WrappedCard; bottom: number }) {
  const arrival = useArrival();
  const long = card.big.length > 7;
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: 24, right: 24, bottom }, arrival]}
    >
      <Text
        maxFontSizeMultiplier={1.3}
        style={{ fontSize: 12.5, letterSpacing: 1.3, textTransform: 'uppercase' }}
        className="font-semibold text-green-bright"
      >
        {card.kicker}
      </Text>
      <View
        style={{
          marginTop: 8,
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'baseline',
          columnGap: 10,
        }}
      >
        <Text
          maxFontSizeMultiplier={1.3}
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{
            fontSize: long ? 64 : 96,
            lineHeight: long ? 70 : 100,
            letterSpacing: -3,
            maxWidth: '100%',
          }}
          className="font-semibold text-ink"
        >
          {card.big}
        </Text>
        {card.unit ? (
          <Text
            maxFontSizeMultiplier={1.3}
            style={{ fontSize: 22 }}
            className="font-semibold text-green-bright"
          >
            {card.unit}
          </Text>
        ) : null}
      </View>
      {card.line ? (
        <Text
          maxFontSizeMultiplier={1.3}
          style={{ marginTop: 16, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 }}
          className="text-ink"
        >
          {card.line}
        </Text>
      ) : null}
      {card.sub ? (
        <Text
          maxFontSizeMultiplier={1.3}
          style={{ marginTop: 10, fontSize: 14.5, lineHeight: 20 }}
          className="text-ink-muted"
        >
          {card.sub}
        </Text>
      ) : null}
    </Animated.View>
  );
}

/** The summary, inside a 9:16 frame that fits the space between the bars. */
function SummaryFrame({
  summary,
  width,
  available,
}: {
  summary: WrappedSummary;
  width: number;
  available: number;
}) {
  const t = useT();
  const arrival = useArrival();
  const frameWidth = Math.max(0, Math.min(width - 48, (available * 9) / 16));
  return (
    <Animated.View pointerEvents="none" style={[{ alignItems: 'center' }, arrival]}>
      <View
        style={{
          width: frameWidth,
          aspectRatio: 9 / 16,
          borderRadius: radius.hero,
          borderWidth: 1,
          borderColor: tint(0.3),
          overflow: 'hidden',
          padding: 20,
          backgroundColor: palette.surface,
        }}
      >
        <LinearGradient
          colors={[tint(0.16), glass.clear]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.5, y: 0.55 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <Text
          maxFontSizeMultiplier={1.3}
          style={{ fontSize: 12.5, letterSpacing: 1.3, textTransform: 'uppercase' }}
          className="font-semibold text-green-bright"
        >
          {summary.kicker}
        </Text>
        <Text
          maxFontSizeMultiplier={1.3}
          style={{ marginTop: 6, fontSize: 30, lineHeight: 34, letterSpacing: -0.8 }}
          className="font-semibold text-ink"
        >
          {summary.title}
        </Text>
        <View style={{ marginTop: 18, flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 }}>
          {summary.cells.map((cell) => (
            <View key={cell.key} style={{ width: '50%', paddingRight: 10 }}>
              <Text
                maxFontSizeMultiplier={1.3}
                numberOfLines={1}
                style={{ fontSize: 12.5, letterSpacing: 1.1, textTransform: 'uppercase' }}
                className="font-semibold text-ink-muted"
              >
                {cell.label}
              </Text>
              <Text
                maxFontSizeMultiplier={1.3}
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{ fontSize: 30, lineHeight: 36 }}
                className="font-semibold text-ink"
              >
                {cell.value}
              </Text>
            </View>
          ))}
        </View>
        <View style={{ marginTop: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <AppMark size={28} />
          <Text
            maxFontSizeMultiplier={1.3}
            style={{ fontSize: 14 }}
            className="font-semibold text-ink"
          >
            {APP_NAME}
          </Text>
          <Text
            maxFontSizeMultiplier={1.3}
            numberOfLines={1}
            style={{ marginLeft: 'auto', flexShrink: 1, fontSize: 12.5 }}
            className="text-ink-faint"
          >
            {t('no account · on my phone')}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

/** Three soft lamps behind the cards, one per gradient stop — the design's glow. */
function Glows({ width, height }: { width: number; height: number }) {
  const lamps: { stop: 1 | 2 | 3; x: number; y: number; r: number; alpha: number }[] = [
    { stop: 2, x: width * 0.28, y: height * 0.45, r: 280, alpha: 0.26 },
    { stop: 1, x: width * 0.85, y: height * 0.15, r: 180, alpha: 0.2 },
    { stop: 3, x: width * 0.78, y: height * 0.9, r: 200, alpha: 0.2 },
  ];
  return (
    <Svg pointerEvents="none" width={width} height={height} style={{ position: 'absolute' }}>
      <Defs>
        {lamps.map((lamp, i) => (
          <RadialGradient key={i} id={`wrapLamp${i}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={stopTint(lamp.stop, 1)} stopOpacity={lamp.alpha} />
            <Stop offset="65%" stopColor={stopTint(lamp.stop, 1)} stopOpacity={0} />
          </RadialGradient>
        ))}
      </Defs>
      {lamps.map((lamp, i) => (
        <Circle key={i} cx={lamp.x} cy={lamp.y} r={lamp.r} fill={`url(#wrapLamp${i})`} />
      ))}
    </Svg>
  );
}

function CloseButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        { marginTop: 16, height: 48, paddingHorizontal: 20, justifyContent: 'center' },
        pressedStyle({ pressed }),
      ]}
    >
      <Text maxFontSizeMultiplier={1.3} className="text-label font-medium text-ink-muted">
        {label}
      </Text>
    </Pressable>
  );
}
