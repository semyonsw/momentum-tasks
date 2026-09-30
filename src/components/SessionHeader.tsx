/**
 * SessionHeader — the bar across the top of a workout.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹  Pull + swimming (tension on b░      #92   │  ← title runs, never wraps
 *   │    3 of 17 sets · 12:04                      │  ← the count rolls, the clock ticks
 *   │    ( Stop and exit )( Restart clock )        │
 *   │▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│  ← 2 dp: the share of sets done
 *   └──────────────────────────────────────────────┘
 *
 * It replaced `ScreenHeader` on this one screen because a workout's header is an
 * INSTRUMENT, not a location: it says how far through you are three ways at once
 * — the count, the clock and a line along its bottom edge that fills as sets land
 * — and a generic header has no slot for the third, which is the one you read
 * without reading.
 *
 *   • THE TITLE RUNS (`RunningText`) instead of ellipsising, so two routines that
 *     differ at the end of their names can still be told apart mid-workout.
 *   • THE SET COUNT ROLLS, so a ✓ landing is visible up here as well as on the row.
 *   • THE CLOCK IS m:ss, ticking once a second in its own leaf component — the
 *     screen above it must not re-render every second for a number only this
 *     line shows.
 *   • `#92` is the workout this will be saved as, the same ordinal History shows.
 *   • THE PROGRESS LINE's width travels over 600 ms. Layout, so the JS driver: it
 *     changes once per ✓, which is the one pace at which that is free.
 *
 * The moving-a-card state keeps its words: `MOVING · PULL` in acc where the
 * title was, and the position where the count was, with `Drop` in the corner.
 *
 * MOMENTUM v3 gives it the pushed screens' shared header: a 46 dp glass back
 * circle, the routine name as the KICKER (13, ls 1.4, muted, uppercase) and
 * "3 of 25 sets · 12:21" as the subline in 14.5 ink. The name dropped from
 * body-semibold to a kicker because the subline is the line that changes — the
 * count rolls and the clock ticks — and the one you glance at should be the
 * brighter of the two.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMotionScale } from '../hooks/useMotionScale';
import { useT } from '../hooks/useT';
import { curve, motion, palette, radius, tint } from '../theme/tokens';
import { GlassBar, SpecularEdge } from './glass';
import { Icon } from './Icon';
import { RollingPhrase } from './RollingNumber';
import { FADE_ON, RunningText } from './RunningText';
import { formatElapsed } from '../lib/units';

/** The pushed-screen kicker: 13 / 16, letter-spacing 1.4. */
const KICKER = { fontSize: 13, lineHeight: 16, letterSpacing: 1.4 } as const;
/** The pushed-screen subline: 14.5 / 19, ink. */
const SUBLINE = { fontSize: 14.5, lineHeight: 19 } as const;
/** Hoisted: it reaches the memoized `RollingNumber` inside the phrase. */
const PHRASE_STYLE = { fontSize: 14.5 } as const;

export function SessionHeader({
  title,
  done,
  total,
  startedAt,
  workoutNumber,
  onBack,
  moving,
  children,
}: {
  title: string;
  done: number;
  total: number;
  /** ISO start, or null while the workout has not been started. */
  startedAt: string | null;
  /** What this workout will be saved as. Null hides the pill. */
  workoutNumber: number | null;
  onBack?: () => void;
  /** A card is in the air: what to say instead, and the way to put it down. */
  moving?: { kicker: string; subtitle: string; onDrop: () => void; dropLabel: string };
  /** The session's own chips, under the two lines. */
  children?: ReactNode;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const fraction = total > 0 ? done / total : 0;

  return (
    <GlassBar style={{ paddingTop: insets.top }}>
      <View className="h-[60px] flex-row items-center pl-[10px] pr-md">
        {/* The pushed screens' 46 dp back circle. Kept as an empty slot of the
            same size mid-move, so the two lines beside it do not jump. */}
        <Pressable
          onPress={onBack}
          disabled={!onBack}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t('Back')}
          style={
            onBack
              ? {
                  width: 46,
                  height: 46,
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  backgroundColor: 'rgba(236,241,238,0.055)',
                  borderWidth: 1,
                  borderColor: 'rgba(236,241,238,0.07)',
                }
              : { width: 46, height: 46 }
          }
        >
          {onBack ? (
            <>
              <SpecularEdge color="rgba(236,241,238,0.10)" radius={radius.pill} />
              <Icon name="chevron-left" size={22} color={palette.ink} />
            </>
          ) : null}
        </Pressable>

        <View className="ml-[10px] flex-1" style={{ minWidth: 0 }}>
          {moving ? (
            <>
              <Text numberOfLines={1} style={KICKER} className="font-semibold uppercase text-acc">
                {moving.kicker}
              </Text>
              <Text style={SUBLINE} className="mt-[3px] tabular-nums text-ink">
                {moving.subtitle}
              </Text>
            </>
          ) : (
            <>
              {/* The kicker is the routine's name — 13 / ls 1.4, muted, the
                  shared pushed-screen header — and it RUNS rather than wrapping. */}
              <RunningText
                text={title}
                fadeColor={FADE_ON.bar}
                style={KICKER}
                className="font-semibold uppercase text-ink-muted"
              />
              {startedAt ? (
                <View className="mt-[3px] flex-row items-center">
                  <RollingPhrase
                    template={t('{done} of {total} sets', { total })}
                    values={{ done }}
                    lineHeight={19}
                    duration={450}
                    style={PHRASE_STYLE}
                    className="text-ink"
                  />
                  <Text allowFontScaling={false} style={SUBLINE} className="tabular-nums text-ink">
                    {' · '}
                  </Text>
                  <ElapsedClock startedAt={startedAt} />
                </View>
              ) : (
                <Text style={SUBLINE} className="mt-[3px] tabular-nums text-ink">
                  {t('{total} sets planned · not started', { total })}
                </Text>
              )}
            </>
          )}
        </View>

        {moving ? (
          <Pressable
            onPress={moving.onDrop}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={moving.dropLabel}
            className="h-[36px] items-center justify-center rounded-pill bg-green px-lg"
          >
            <Text className="text-label font-semibold text-on-acc">{moving.dropLabel}</Text>
          </Pressable>
        ) : workoutNumber != null ? (
          <View
            accessibilityLabel={t('Workout {number}', { number: workoutNumber })}
            style={{
              height: 28,
              paddingHorizontal: 10,
              justifyContent: 'center',
              borderRadius: radius.pill,
              backgroundColor: tint(0.14),
              borderWidth: 1,
              borderColor: tint(0.3),
            }}
          >
            <Text
              allowFontScaling={false}
              style={{ fontSize: 12 }}
              className="font-semibold tabular-nums text-green-bright"
            >
              {`#${workoutNumber}`}
            </Text>
          </View>
        ) : null}
      </View>

      {children ? <View className="pb-md pl-[66px] pr-md">{children}</View> : null}

      <ProgressLine fraction={fraction} />
    </GlassBar>
  );
}

/** The share of sets done, as a 2 dp line along the bar's bottom edge. */
function ProgressLine({ fraction }: { fraction: number }) {
  const scale = useMotionScale();
  const clamped = Math.max(0, Math.min(1, fraction));
  const width = useRef(new Animated.Value(clamped)).current;
  useEffect(() => {
    Animated.timing(width, {
      toValue: clamped,
      duration: 600 * scale,
      easing: curve(motion.ease),
      useNativeDriver: false,
    }).start();
  }, [clamped, scale, width]);
  /* Memoized: the header re-renders on every ✓, and a fresh interpolation is a
     fresh animated node for the view to detach and re-attach. */
  const fill = useMemo(
    () => width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
    [width],
  );

  return (
    <View style={{ height: 2, backgroundColor: tint(0.22) }}>
      <Animated.View
        style={{
          height: 2,
          width: fill,
          backgroundColor: palette.greenBright,
        }}
      />
    </View>
  );
}

/** `12:04`, or `1:12:04` past an hour. Ticks once a second, and only itself. */
function ElapsedClock({ startedAt }: { startedAt: string }) {
  const startMs = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  return (
    <Text allowFontScaling={false} style={SUBLINE} className="tabular-nums text-ink">
      {formatElapsed(Number.isFinite(startMs) ? now - startMs : 0)}
    </Text>
  );
}
