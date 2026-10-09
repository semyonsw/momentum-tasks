/**
 * InsightsScreen — patterns across the three logs (X2, design 18).
 *
 *   ‹ INSIGHTS
 *   Patterns across your three logs. Correlation, not cause.
 *   ╭──────────────────────────────────────────╮
 *   │ On training days you finish more of your │
 *   │ tasks: 82% vs 61% on rest days.          │
 *   │ Training days  ██████████████░░░   82%   │
 *   │ Rest days      ██████████░░░░░░░   61%   │
 *   │ based on 41 training days and 47 rest days│
 *   ╰──────────────────────────────────────────╯
 *
 * Every card is a sentence the numbers under it prove, with its sample in
 * micro text — the thresholds that decide whether a card exists at all are in
 * `lib/insights.ts`, and nothing here adds or rounds anything.
 *
 * "Correlation, not cause." sits ABOVE the cards, once, rather than on each:
 * repeated four times it becomes wallpaper. The empty state is not an apology,
 * it is the rules — what will appear and what it takes — so a new user knows
 * the page is waiting on data rather than broken.
 */

import { ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { ScreenHeader } from '../components/ScreenHeader';
import { Kicker } from '../components/primitives';
import { useInsights } from '../hooks/useInsights';
import { useMoneyScale } from '../hooks/useMoneyScale';
import { useLanguage, useT } from '../hooks/useT';
import {
  describeInsight,
  INSIGHT_WINDOW_DAYS,
  MIN_DAYS_PER_GROUP,
  MIN_POINTS,
  MIN_RELATIVE,
  MIN_WEEKS_PER_GROUP,
  type InsightCard,
} from '../lib/insights';
import { useSettings } from '../state/settingsStore';
import { glass, palette, radius } from '../theme/tokens';

export function InsightsScreen({ onBack }: { onBack: () => void }) {
  const t = useT();
  const lang = useLanguage();
  const found = useInsights();
  const currency = useSettings((s) => s.currencyCode);
  const scale = useMoneyScale();
  const cards = found.map((insight) => ({
    id: insight.id,
    card: describeInsight(insight, { currency, scale }, lang),
  }));

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />
      <ScreenHeader kicker={t('Insights')} onBack={onBack} />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text maxFontSizeMultiplier={1.3} className="mx-lg mb-md mt-md text-body text-ink-muted">
          {`${t('Patterns across your three logs.')} ${t('Correlation, not cause.')}`}
        </Text>

        {cards.length > 0 ? (
          <View className="mx-lg" style={{ gap: 10 }}>
            {cards.map(({ id, card }) => (
              <Card key={id} card={card} />
            ))}
          </View>
        ) : (
          <View
            className="mx-lg"
            style={{
              padding: 16,
              borderRadius: radius.card,
              borderWidth: 1,
              borderColor: glass.raisedEdge,
              backgroundColor: glass.raised,
            }}
          >
            <Kicker>{t('Nothing to show yet')}</Kicker>
            <Text maxFontSizeMultiplier={1.3} className="mt-sm text-body text-ink-muted">
              {t(
                'Cards appear here when one log moves with another: tasks done on training days against rest days, and in weeks with 3+ workouts against weeks with fewer; spending on training days, and at weekends against weekdays.',
              )}
            </Text>
            <Text maxFontSizeMultiplier={1.3} className="mt-sm text-label text-ink-faint">
              {t(
                'A card needs at least {days} days in each group ({weeks} weeks for weeks) over the last {window} weeks, and a gap of {points} points in tasks or {relative}% in spending. Smaller gaps are not shown.',
                {
                  days: MIN_DAYS_PER_GROUP,
                  weeks: MIN_WEEKS_PER_GROUP,
                  window: INSIGHT_WINDOW_DAYS / 7,
                  points: MIN_POINTS,
                  relative: MIN_RELATIVE * 100,
                },
              )}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Card({ card }: { card: InsightCard }) {
  return (
    <View
      accessible
      accessibilityLabel={`${card.title} ${card.aLabel}: ${card.aText}. ${card.bLabel}: ${card.bText}. ${card.sample}.`}
      style={{
        padding: 16,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: glass.raisedEdge,
        backgroundColor: glass.raised,
      }}
    >
      <Text
        maxFontSizeMultiplier={1.3}
        style={{ fontSize: 16.5, lineHeight: 23 }}
        className="text-ink"
      >
        {card.title}
      </Text>
      <View className="mt-md" style={{ gap: 8 }}>
        <Bar label={card.aLabel} text={card.aText} fraction={card.aBar} lit />
        <Bar label={card.bLabel} text={card.bText} fraction={card.bBar} lit={false} />
      </View>
      <Text maxFontSizeMultiplier={1.3} className="mt-md text-micro text-ink-faint">
        {card.sample}
      </Text>
    </View>
  );
}

/** One side of the comparison: its name, a bar, its figure. */
function Bar({
  label,
  text,
  fraction,
  lit,
}: {
  label: string;
  text: string;
  fraction: number;
  lit: boolean;
}) {
  return (
    <View className="flex-row items-center" style={{ gap: 10 }}>
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
        style={{ width: 96 }}
        className="text-label text-ink-muted"
      >
        {label}
      </Text>
      <View
        className="flex-1 overflow-hidden rounded-pill"
        style={{ height: 8, backgroundColor: glass.sunken }}
      >
        <View
          style={{
            height: 8,
            width: `${Math.max(0, Math.min(1, fraction)) * 100}%`,
            borderRadius: radius.pill,
            backgroundColor: lit ? palette.acc : palette.greenDim,
          }}
        />
      </View>
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
        style={{ minWidth: 44, textAlign: 'right' }}
        className="text-label font-semibold tabular-nums text-ink"
      >
        {text}
      </Text>
    </View>
  );
}
