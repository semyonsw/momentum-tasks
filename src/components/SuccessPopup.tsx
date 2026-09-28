/**
 * SuccessPopup — "it worked", said in the middle of the screen, for a moment.
 *
 *            ╭──────────────────────────╮
 *            │          ( ✓ )           │  ← pops in, on the overshoot curve
 *            │    Export successful     │
 *            │  Saved backup-…json to   │
 *            │  Downloads — 92 workouts │
 *            │  ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░  │  ← drains: how long it will stay
 *            ╰──────────────────────────╯
 *
 * For the three things in Settings that write or replace a whole file — export,
 * restore, back up now. Those used to report in one line of green text at the
 * FOOT of a long scroll, under the reset box: the file was written, and the
 * person who pressed the button at the top saw nothing happen and pressed it
 * again. An action that took their whole log somewhere deserves to be seen
 * landing.
 *
 * Not a dialog: it has no buttons, dismisses itself after `HOLD_MS`, and a tap
 * anywhere closes it sooner. The detail line under the title is the same
 * sentence the status line still carries, so nothing is lost when it goes.
 * It plays `celebrate()` as it lands — this is a 100%, the whole log is safe.
 */

import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';

import { CommitMark } from './glass';
import { useIsOverlay } from './overlay';
import { useMotionScale } from '../hooks/useMotionScale';
import { useT } from '../hooks/useT';
import { celebrate } from '../lib/feedback';
import { curve, glassTier, motion, palette, radius } from '../theme/tokens';

/** Long enough to read two lines, short enough not to be in the way. */
const HOLD_MS = 3200;

export function SuccessPopup({
  title,
  detail,
  onDone,
}: {
  title: string;
  detail?: string;
  onDone: () => void;
}) {
  const t = useT();
  const scale = useMotionScale();
  useIsOverlay(onDone);

  const enter = useRef(new Animated.Value(scale === 0 ? 1 : 0)).current;
  const drain = useRef(new Animated.Value(1)).current;
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    celebrate();
    Animated.timing(enter, {
      toValue: 1,
      duration: 360 * scale,
      easing: curve(motion.pop),
      useNativeDriver: true,
    }).start();
    Animated.timing(drain, {
      toValue: 0,
      duration: HOLD_MS,
      useNativeDriver: false,
    }).start();
    const timer = setTimeout(() => done.current(), HOLD_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Pressable
      onPress={onDone}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${t('Close')}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(6,8,7,0.6)',
          opacity: enter.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 1],
            extrapolate: 'clamp',
          }),
        }}
      />
      <Animated.View
        style={{
          width: '100%',
          maxWidth: 340,
          alignItems: 'center',
          paddingTop: 28,
          paddingBottom: 20,
          paddingHorizontal: 22,
          borderRadius: radius.hero,
          borderWidth: 1,
          borderColor: 'rgba(63,169,108,0.35)',
          backgroundColor: palette.surface,
          overflow: 'hidden',
          boxShadow: [{ offsetX: 0, offsetY: 18, blurRadius: 48, color: 'rgba(0,0,0,0.7)' }],
          opacity: enter.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 1],
            extrapolate: 'clamp',
          }),
          transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }],
        }}
      >
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: glassTier.lit.tint,
          }}
        />
        <CommitMark size={64} glyph={28} />
        <Text className="mt-lg text-center text-title font-medium text-ink">{title}</Text>
        {detail ? (
          <Text numberOfLines={4} className="mt-sm text-center text-label text-ink-muted">
            {detail}
          </Text>
        ) : null}
        <View
          className="mt-lg w-full overflow-hidden rounded-pill"
          style={{ height: 3, backgroundColor: palette.greenDim }}
        >
          <Animated.View
            style={{
              height: 3,
              backgroundColor: palette.greenBright,
              width: drain.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            }}
          />
        </View>
      </Animated.View>
    </Pressable>
  );
}
