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
 * The chips WRAP rather than scroll, for the same reason the money section's
 * account chips do: the section swipe claims a sideways drag, so a scrolling row
 * would change section under the thumb.
 */

import { Text, View } from 'react-native';

import { BubblePressable } from './bubbles';
import { GlassSurface, SpecularEdge } from './glass';
import { Icon } from './Icon';
import { pressedStyle } from './motion';
import { useAiPrompts } from '../hooks/useAiPrompts';
import { useT } from '../hooks/useT';
import type { AiSection } from '../lib/ai/aiSchema';
import { glassTier, halo, palette, radius } from '../theme/tokens';

const TITLE: Record<AiSection, string> = {
  Workout: 'Ask about your training',
  Tasks: 'Ask about your habits',
  Expenses: 'Ask about your money',
};

/** The assistant's mark in its green circle — the ▶ circle's recipe, `ChoiceRow`'s. */
export function SparkleCircle({ size = 40, glow = false }: { size?: number; glow?: boolean }) {
  return (
    <View
      style={{
        height: size,
        width: size,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.pill,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(63,169,108,0.26)',
        backgroundColor: 'rgba(63,169,108,0.14)',
        ...(glow ? { boxShadow: [...halo.single] } : {}),
      }}
    >
      <SpecularEdge color="rgba(236,241,238,0.12)" radius={radius.pill} />
      <Icon name="sparkle" size={Math.round(size * 0.45)} color={palette.greenBright} />
    </View>
  );
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

  return (
    <GlassSurface tier="card" radius={radius.card} shadow="e1" flat className="mx-lg mt-lg">
      <View style={{ padding: 16 }}>
        <BubblePressable
          onPress={() => onOpen()}
          radius={radius.row}
          accessibilityRole="button"
          accessibilityLabel={`${title}. ${line}`}
          style={(state) => [pressedStyle(state), { flexDirection: 'row', alignItems: 'center' }]}
        >
          <SparkleCircle />
          <View className="flex-1 px-md">
            <Text className="text-body font-medium text-ink">{title}</Text>
            <Text numberOfLines={1} className="mt-[2px] text-label text-ink-faint">
              {line}
            </Text>
          </View>
          <Icon name="chevron-right" size={16} color={palette.inkFaint} />
        </BubblePressable>

        <View className="mt-[14px] flex-row flex-wrap" style={{ gap: 8 }}>
          {prompts.map((prompt) => (
            <BubblePressable
              key={prompt.key}
              onPress={() => onOpen(prompt.label)}
              radius="pill"
              accessibilityRole="button"
              accessibilityLabel={prompt.label}
              style={(state) => [
                pressedStyle(state),
                {
                  height: 34,
                  maxWidth: '100%',
                  justifyContent: 'center',
                  paddingHorizontal: 14,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: glassTier.well.border,
                  backgroundColor: glassTier.well.tint,
                },
              ]}
            >
              <Text numberOfLines={1} className="text-label text-ink-muted">
                {prompt.chip}
              </Text>
            </BubblePressable>
          ))}
        </View>
      </View>
    </GlassSurface>
  );
}
