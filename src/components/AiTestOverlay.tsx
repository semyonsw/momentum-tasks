/**
 * AiTestOverlay — the key being tested, and then the key having passed.
 *
 *   testing                         ready
 *   ┌──────────────────────┐        ┌──────────────────────┐
 *   │        (( ✦ ))       │        │        (( ✓ ))       │
 *   │    GOOGLE GEMINI     │        │ GEMINI ANSWERED IN … │
 *   │   Testing your key   │        │  Your AI is ready.   │
 *   │  AIza••••••••••3kQ2  │        │  …the sparkle…       │
 *   │  ✓ Reaching Google   │        │ [ Try it on your … ] │
 *   │  ◌ Checking your key │        └──────────────────────┘
 *   │  · Asking … hello    │
 *   └──────────────────────┘
 *
 * ── WHY A WHOLE SCREEN FOR A TWO-SECOND CALL ───────────────────────────────
 *
 * Because it is the one moment the user hands a secret to the app and waits to
 * hear whether it worked, and a spinner on a button says neither what is being
 * checked nor which part failed. Three named steps do: "Reaching Google" failing
 * is the phone's connection, "Checking your key" is the key, and the hello is the
 * model. The screen that owns the test keeps this up for at least 2.5 s so the
 * steps can actually be read, even when Google answers in 0.4.
 *
 * ── THE INSTRUMENT ─────────────────────────────────────────────────────────
 *
 * One outer ring breathing on the floating halo, a quarter arc turning inside it,
 * and a dashed ring turning the other way — the same green at three distances,
 * which is the whole palette. All three are transforms on the native driver, and
 * with animations removed (`useMotionScale`) they stand still in their end state
 * rather than being skipped: the screen still says what it is doing.
 */

import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BubblePressable } from './bubbles';
import { CommitMark, GlassSurface, Lamps, SpecularEdge } from './glass';
import { Icon } from './Icon';
import { Pop, Stagger } from './motion';
import { useIsOverlay } from './overlay';
import { useMotionScale } from '../hooks/useMotionScale';
import { useT } from '../hooks/useT';
import { success } from '../lib/feedback';
import {
  focalType,
  glass,
  gradientFill,
  halo,
  palette,
  radius,
  specularHeavy,
  textGlow,
} from '../theme/tokens';

const INSTRUMENT = 176;

/** A value that runs 0 → 1 forever, or sits at `rest` with animations off. */
function useLoop(duration: number, rest: number, mode: 'linear' | 'breathe'): Animated.Value {
  const scale = useMotionScale();
  const v = useRef(new Animated.Value(rest)).current;
  useEffect(() => {
    if (scale === 0) {
      v.setValue(rest);
      return undefined;
    }
    const loop =
      mode === 'linear'
        ? Animated.loop(
            Animated.timing(v, {
              toValue: 1,
              duration,
              easing: Easing.linear,
              useNativeDriver: true,
            }),
          )
        : Animated.loop(
            Animated.sequence([
              Animated.timing(v, {
                toValue: 1,
                duration: duration / 2,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }),
              Animated.timing(v, {
                toValue: 0,
                duration: duration / 2,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }),
            ]),
          );
    v.setValue(0);
    loop.start();
    return () => loop.stop();
  }, [duration, mode, rest, scale, v]);
  return v;
}

function Instrument() {
  const breath = useLoop(2400, 1, 'breathe');
  const spin = useLoop(1100, 0, 'linear');
  const drift = useLoop(9000, 0, 'linear');
  const size = INSTRUMENT;
  const inner = size - 36;
  // Built once: a fresh interpolation node per render makes each Animated.View
  // detach and re-attach its native animation graph.
  const nodes = useMemo(
    () => ({
      opacity: breath.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
      scale: breath.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.04] }),
      drift: drift.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] }),
      spin: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }),
    }),
    [breath, drift, spin],
  );

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: glass.greenEdge,
          boxShadow: [...halo.floating],
          opacity: nodes.opacity,
          transform: [{ scale: nodes.scale }],
        }}
      />
      {/* The dashed ring, turning the other way, slowly. */}
      <Animated.View
        style={{
          position: 'absolute',
          transform: [{ rotate: nodes.drift }],
        }}
      >
        <Svg width={size - 16} height={size - 16}>
          <Circle
            cx={(size - 16) / 2}
            cy={(size - 16) / 2}
            r={(size - 16) / 2 - 1}
            stroke={palette.greenDim}
            strokeWidth={1}
            strokeDasharray="3 7"
            fill="none"
          />
        </Svg>
      </Animated.View>
      {/* The arc: a dim track and one bright quarter of it, turning. */}
      <Animated.View
        style={{
          position: 'absolute',
          transform: [{ rotate: nodes.spin }],
        }}
      >
        <Svg width={inner} height={inner}>
          <Circle
            cx={inner / 2}
            cy={inner / 2}
            r={inner / 2 - 2}
            stroke={palette.greenDim}
            strokeWidth={3}
            fill="none"
          />
          <Circle
            cx={inner / 2}
            cy={inner / 2}
            r={inner / 2 - 2}
            stroke={palette.greenBright}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={`${(Math.PI * (inner - 4)) / 4} ${Math.PI * (inner - 4)}`}
            fill="none"
          />
        </Svg>
      </Animated.View>
      <View style={{ boxShadow: [...halo.single], borderRadius: radius.pill }}>
        <Icon name="sparkle" size={44} color={palette.greenBright} />
      </View>
    </View>
  );
}

/** One step's mark: a dot while it waits, a turning arc while it runs, a ✓ once done. */
function StepMark({ state }: { state: 'pending' | 'active' | 'done' }) {
  const spin = useLoop(900, 0, 'linear');
  const rotate = useMemo(
    () => spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }),
    [spin],
  );
  if (state === 'done') {
    return (
      <Pop>
        <CommitMark size={20} glyph={11} glow={false} />
      </Pop>
    );
  }
  if (state === 'active') {
    return (
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Svg width={20} height={20}>
          <Circle cx={10} cy={10} r={8} stroke={palette.greenDim} strokeWidth={2} fill="none" />
          <Circle
            cx={10}
            cy={10}
            r={8}
            stroke={palette.greenBright}
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray={`${Math.PI * 4} ${Math.PI * 16}`}
            fill="none"
          />
        </Svg>
      </Animated.View>
    );
  }
  return (
    <View style={{ width: 20, alignItems: 'center' }}>
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: radius.pill,
          backgroundColor: palette.inkFaint,
        }}
      />
    </View>
  );
}

/** Two rings leaving the ✓, three times, and then stillness. */
function Ripples({ size }: { size: number }) {
  const scale = useMotionScale();
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (scale === 0) return undefined;
    const ring = (v: Animated.Value, delay: number) =>
      Animated.sequence([
        Animated.delay(delay),
        Animated.loop(
          Animated.timing(v, {
            toValue: 1,
            duration: 1600,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          { iterations: 3 },
        ),
      ]);
    const run = Animated.parallel([ring(a, 0), ring(b, 800)]);
    run.start();
    return () => run.stop();
  }, [a, b, scale]);
  const [styleA, styleB] = useMemo(() => {
    const style = (v: Animated.Value) => ({
      position: 'absolute' as const,
      width: size,
      height: size,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: palette.greenBright,
      opacity: v.interpolate({ inputRange: [0, 0.01, 1], outputRange: [0, 0.7, 0] }),
      transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 2.2] }) }],
    });
    return [style(a), style(b)];
  }, [a, b, size]);
  return (
    <>
      <Animated.View pointerEvents="none" style={styleA} />
      <Animated.View pointerEvents="none" style={styleB} />
    </>
  );
}

export interface AiTestOverlayProps {
  phase: 'testing' | 'ready';
  /** Steps done so far, 0–3. */
  step: number;
  maskedKey: string;
  model: string;
  latencyMs: number | null;
  /** "Try it on your workouts" / "Open Tasks AI". */
  ctaLabel: string;
  onCta: () => void;
  /** Back on the ready screen. Back during the test does nothing — it is two seconds. */
  onDismiss: () => void;
}

export function AiTestOverlay({
  phase,
  step,
  maskedKey,
  model,
  latencyMs,
  ctaLabel,
  onCta,
  onDismiss,
}: AiTestOverlayProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  useIsOverlay(phase === 'ready' ? onDismiss : () => {});

  useEffect(() => {
    if (phase === 'ready') success();
  }, [phase]);

  const steps = [
    t('Reaching Google'),
    t('Checking your key'),
    t('Asking {model} to say hello', { model }),
  ];
  const seconds = latencyMs == null ? '–' : (latencyMs / 1000).toFixed(1);

  return (
    <View
      accessibilityViewIsModal
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: palette.bg,
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 24,
      }}
    >
      <Lamps section="Focus" />

      {phase === 'testing' ? (
        <View className="flex-1 items-center justify-center">
          <Instrument />
          <Text
            style={{ letterSpacing: 1.3 }}
            className="mt-xxl text-micro font-semibold uppercase text-green-bright"
          >
            {t('Google Gemini')}
          </Text>
          <Text style={focalType.heroName} className="mt-sm font-semibold text-ink">
            {t('Testing your key')}
          </Text>
          <Text
            style={{ fontFamily: 'monospace' }}
            className="mt-sm text-label tabular-nums text-ink-faint"
          >
            {maskedKey}
          </Text>

          <GlassSurface tier="well" radius={radius.row} flat className="mt-xl w-full">
            {steps.map((label, index) => {
              const state = index < step ? 'done' : index === step ? 'active' : 'pending';
              return (
                <View key={label}>
                  {index > 0 ? <View className="ml-[48px] h-hairline bg-hairline" /> : null}
                  <View className="h-hit flex-row items-center px-lg">
                    <StepMark state={state} />
                    <Text
                      numberOfLines={1}
                      style={{ fontSize: 15 }}
                      className={[
                        'ml-md flex-1',
                        state === 'done'
                          ? 'text-ink'
                          : state === 'active'
                            ? 'font-medium text-green-bright'
                            : 'text-ink-faint',
                      ].join(' ')}
                    >
                      {label}
                    </Text>
                  </View>
                </View>
              );
            })}
          </GlassSurface>
        </View>
      ) : (
        <View className="flex-1 justify-center">
          <View className="items-center">
            <View
              style={{ width: 112, height: 112, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ripples size={112} />
              <Pop duration={420}>
                <CommitMark size={112} glyph={52} />
              </Pop>
            </View>
          </View>
          <Stagger delay={100}>
            <Text
              style={{ letterSpacing: 1.3 }}
              className="mt-xxl text-center text-micro font-semibold uppercase text-green-bright"
            >
              {t('Gemini answered in {s} s', { s: seconds })}
            </Text>
          </Stagger>
          <Stagger delay={200}>
            <Text
              style={textGlow.hero}
              className="mt-md text-center text-display font-semibold text-ink"
            >
              {t('Your AI is ready.')}
            </Text>
          </Stagger>
          <Stagger delay={300}>
            <Text className="mt-md text-center text-body text-ink-muted">
              {t(
                'Workout, Tasks and Expenses each have their own chat now. Look for the sparkle in the corner.',
              )}
            </Text>
          </Stagger>
          <Stagger delay={400}>
            <View
              style={{ marginTop: 32, borderRadius: radius.pill, boxShadow: [...halo.floating] }}
            >
              <BubblePressable
                onPress={onCta}
                radius="pill"
                bubbleColor={palette.ink}
                accessibilityRole="button"
                accessibilityLabel={ctaLabel}
                style={{
                  height: 56,
                  borderRadius: radius.pill,
                  overflow: 'hidden',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <LinearGradient
                  {...gradientFill()}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                />
                <SpecularEdge color={specularHeavy} radius={radius.pill} height={2} />
                <Text numberOfLines={1} className="text-body font-semibold text-on-acc">
                  {ctaLabel}
                </Text>
                <View style={{ marginLeft: 6 }}>
                  <Icon name="chevron-right" size={16} color={palette.onAcc} />
                </View>
              </BubblePressable>
            </View>
          </Stagger>
        </View>
      )}
    </View>
  );
}
