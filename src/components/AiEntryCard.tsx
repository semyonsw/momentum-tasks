/**
 * AiEntryCard — the assistant's door in each section, directly under the hero.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ (✦)  Ask about your training               › │
 *   │      Gemini · summaries, trends, suggestions │
 *   │ [Last 4 weeks] [Squat trend] [Suggest a …]   │
 *   └──────────────────────────────────────────────┘
 *
 * ── ALWAYS SHOWN, AND TWO WAYS IN ──────────────────────────────────────────
 *
 * The sparkle in the corner is the quiet way in, for somebody who already knows
 * it is there. This card is how anybody finds out — so it is drawn whether or not
 * a key is connected, and without one its line says what it takes to start. The
 * row opens the chat empty; a chip opens it and asks that question. Either,
 * without a key, lands on the settings screen first and comes back afterwards.
 *
 * `flat`, like every repeating pane: the section's blur budget belongs to its
 * hero, and this is the card under it rather than a second hero.
 *
 * ── THE v3 LOOK ───────────────────────────────────────────────────────────
 *
 * The mark is the `AiOrb` — the top-bar button's conic ring and breathing
 * sparkle at 44 dp, without its sheen and stars (two copies of the full show on
 * one screen, 60 dp apart, is noise) — and the subline is written in the
 * assistant's own gradient, violet → pink → cyan. Both are fixed colours: the
 * card is the assistant's door, and it looks like the assistant on every theme.
 *
 * The gradient text is an SVG `<Text>` with a gradient fill, because React
 * Native cannot clip a gradient to glyphs and `MaskedView` is not in this build.
 * SVG text does not truncate, so the line measures itself with an invisible RN
 * copy and runs like `RunningText` when it is longer than the row.
 *
 * The chips WRAP rather than scroll, like the money section's account chips:
 * every chip is visible without a gesture.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, Text, View, type LayoutChangeEvent } from 'react-native';
import { LinearGradient as FadeGradient } from 'expo-linear-gradient';
import Svg, { Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';

import { AiOrb } from './AiOrb';

export { AiOrb };
import { BubblePressable } from './bubbles';
import { GlassSurface } from './glass';
import { Icon } from './Icon';
import { usePressScale } from './motion';
import { FADE_ON, RunningText } from './RunningText';
import { useAiPrompts } from '../hooks/useAiPrompts';
import { useArrived } from '../hooks/useArrived';
import { useMotionScale } from '../hooks/useMotionScale';
import { useT } from '../hooks/useT';
import type { AiSection } from '../lib/ai/aiSchema';
import { MARQUEE_DELAY_MS, MARQUEE_FADE, marqueePhases, marqueeTravel } from '../lib/marquee';
import { ai, curve, motion, palette, radius } from '../theme/tokens';

const TITLE: Record<AiSection, string> = {
  Workout: 'Ask about your training',
  Tasks: 'Ask about your habits',
  Expenses: 'Ask about your money',
};

/** The subline's type: 14 / 19. */
const LINE_SIZE = 14;
const LINE_HEIGHT = 19;
/** Roboto's baseline in a 19 tall line at 14: ascent ≈ 0.93 em plus half the leading. */
const BASELINE = 14.5;

/**
 * The assistant's mark — kept under its old name for the callers that draw it
 * outside this card (the chat's empty state, the settings row). It is the
 * `AiOrb` now.
 */
export function SparkleCircle({ size = 40 }: { size?: number }) {
  return <AiOrb size={size} />;
}

export function AiEntryCard({
  section,
  ready,
  onOpen,
}: {
  section: AiSection;
  ready: boolean;
  /** The chat, empty, or asking `prompt`. */
  onOpen: (prompt?: string) => void;
}) {
  const t = useT();
  const prompts = useAiPrompts(section).slice(0, 3);
  const title = t(TITLE[section]);
  const line = ready
    ? t('Gemini · summaries, trends, suggestions')
    : t('Connect a Google AI key to start');
  const press = usePressScale(0.97);

  return (
    <GlassSurface tier="card" radius={radius.card} shadow="e1" flat className="mx-lg mt-lg">
      <View style={{ padding: 16 }}>
        <BubblePressable
          onPress={() => onOpen()}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          radius={radius.row}
          accessibilityRole="button"
          accessibilityLabel={`${title}. ${line}`}
        >
          <Animated.View
            style={[{ flexDirection: 'row', alignItems: 'center', gap: 12 }, press.style]}
          >
            <AiOrb size={44} glyph={20} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} className="text-body font-medium text-ink">
                {title}
              </Text>
              <GradientLine text={line} />
            </View>
            <Icon name="chevron-right" size={18} color={palette.inkFaint} />
          </Animated.View>
        </BubblePressable>

        <View className="mt-[14px] flex-row flex-wrap" style={{ gap: 8 }}>
          {prompts.map((prompt) => (
            <PromptChip
              key={prompt.key}
              label={prompt.label}
              chip={prompt.chip}
              onPress={() => onOpen(prompt.label)}
            />
          ))}
        </View>
      </View>
    </GlassSurface>
  );
}

function PromptChip({
  label,
  chip,
  onPress,
}: {
  label: string;
  chip: string;
  onPress: () => void;
}) {
  const press = usePressScale(0.94);
  return (
    <BubblePressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      radius="pill"
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ maxWidth: '100%' }}
    >
      <Animated.View
        style={[
          {
            height: 36,
            justifyContent: 'center',
            paddingHorizontal: 14,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: 'rgba(236,241,238,0.045)',
            backgroundColor: 'rgba(236,241,238,0.028)',
          },
          press.style,
        ]}
      >
        <RunningText
          text={chip}
          fadeColor={FADE_ON.card}
          style={{ fontSize: 14, lineHeight: 19, color: palette.inkMuted }}
        />
      </Animated.View>
    </BubblePressable>
  );
}

/**
 * One line of the assistant's gradient text — `linear-gradient(90deg, #C4B5FD,
 * #F9A8D4, #A5F3FC)` across the string's own width, not the row's, so a short
 * line still shows all three colours. Runs when it overflows, on the same loop
 * and fade as `RunningText` (`lib/marquee.ts`).
 */
function GradientLine({ text }: { text: string }) {
  const motionScale = useMotionScale();
  const arrived = useArrived();
  const [boxWidth, setBoxWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const travel = marqueeTravel(textWidth, boxWidth);

  useEffect(() => {
    x.setValue(0);
    // Waits for its section to arrive, as `RunningText`'s does.
    if (travel === 0 || motionScale === 0 || !arrived) return undefined;
    const phases = marqueePhases(travel);
    const ease = curve(motion.ease);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(phases.holdStartMs),
        Animated.timing(x, {
          toValue: -travel,
          duration: phases.outMs,
          easing: ease,
          useNativeDriver: true,
        }),
        Animated.delay(phases.holdEndMs),
        Animated.timing(x, {
          toValue: 0,
          duration: phases.backMs,
          easing: ease,
          useNativeDriver: true,
        }),
        Animated.delay(phases.restMs),
      ]),
    );
    const start = setTimeout(() => loop.start(), MARQUEE_DELAY_MS);
    return () => {
      clearTimeout(start);
      loop.stop();
    };
  }, [arrived, motionScale, text, travel, x]);

  const onBox = (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    if (Math.abs(width - boxWidth) > 0.5) setBoxWidth(width);
  };
  const onText = (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    if (Math.abs(width - textWidth) > 0.5) setTextWidth(width);
  };
  // A couple of dp of slack: SVG and RN lay the same string out a hair apart.
  const svgWidth = Math.ceil(textWidth) + 2;

  return (
    <View
      onLayout={onBox}
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      style={{ marginTop: 2, height: LINE_HEIGHT, overflow: 'hidden' }}
    >
      {/* The measuring copy — natural width, never clipped, never seen. */}
      <View style={{ position: 'absolute', left: 0, top: 0, width: 4000, opacity: 0 }}>
        <View style={{ alignSelf: 'flex-start' }} onLayout={onText}>
          <Text allowFontScaling={false} style={{ fontSize: LINE_SIZE, lineHeight: LINE_HEIGHT }}>
            {text}
          </Text>
        </View>
      </View>

      {textWidth > 0 ? (
        <Animated.View style={{ width: svgWidth, transform: [{ translateX: x }] }}>
          <Svg width={svgWidth} height={LINE_HEIGHT}>
            <Defs>
              <LinearGradient
                id="aiSubline"
                x1="0"
                y1="0"
                x2={svgWidth}
                y2="0"
                gradientUnits="userSpaceOnUse"
              >
                <Stop offset="0" stopColor={ai.subline[0]} />
                <Stop offset="0.5" stopColor={ai.subline[1]} />
                <Stop offset="1" stopColor={ai.subline[2]} />
              </LinearGradient>
            </Defs>
            <SvgText x={0} y={BASELINE} fontSize={LINE_SIZE} fill="url(#aiSubline)">
              {text}
            </SvgText>
          </Svg>
        </Animated.View>
      ) : null}

      {travel > 0 ? (
        <FadeGradient
          colors={[`${FADE_ON.card}00`, FADE_ON.card]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: MARQUEE_FADE }}
        />
      ) : null}
    </View>
  );
}
