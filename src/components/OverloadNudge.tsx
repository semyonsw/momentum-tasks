/**
 * OverloadNudge — the stalled-weight offer, a line inside the exercise card.
 *
 *   ╭────────────────────────────────────────────────╮
 *   │ ↗  SAME +25 KG FOR 23 DAYS · 5 SESSIONS        │
 *   │    Try 27.5 kg                     [ Use ]  ×  │
 *   ╰────────────────────────────────────────────────╯
 *   ╭────────────────────────────────────────────────╮
 *   │ ↗  SAME 2:00 FOR 21 DAYS · 3 SESSIONS          │
 *   │    Try 2:15                        [ Use ]  ×  │
 *   ╰────────────────────────────────────────────────╯
 *
 * Tone rules, because a nudge that nags is a nudge that gets ignored:
 *   • It states a FACT first ("same weight, 23 days, 5 sessions"), then a
 *     suggestion. No exclamation marks, no "You've plateaued!", no trophies.
 *   • `Use` rewrites every remaining set of the exercise to the suggested
 *     weight in one tap. `×` dismisses it for the session, green dot and all.
 *   • It renders only for `due_*` verdicts. `building` / `progressing` /
 *     `regressing` produce no UI at all — silence is the default state.
 *   • A plank plateau reads exactly like a bench plateau, because it IS one:
 *     the engine judges the count where there is no weight, and this card names
 *     whichever axis the verdict is about. Time says "2:00", never "120".
 *
 * MOMENTUM v3 took it out of its own `green-wash` card and into the exercise
 * card, as a line under the plan: the fact in `acc` beside `trending-up`, then
 * the offer. A tinted box inside a glass card is a card inside a card, and the
 * accent colour already says "this is the app talking". `Use` is the theme's
 * gradient with `onAcc` text, the same filled control every commit is.
 */

import { Pressable, Text, View } from 'react-native';

import { commit } from '../lib/feedback';
import { describeCount, type OverloadVerdict } from '../lib/progressiveOverload';
import type { CountUnit, LoadMode, UnitSystem } from '../types/models';
import { countUnitLabel, formatWeight, unitLabel } from '../lib/units';
import { useLanguage, useT } from '../hooks/useT';
import { LinearGradient } from 'expo-linear-gradient';

import { gradientFill, palette } from '../theme/tokens';
import { Icon } from './Icon';

interface OverloadNudgeProps {
  verdict: OverloadVerdict;
  unitSystem: UnitSystem;
  loadMode: LoadMode;
  /** Needed to say "2:15" rather than "135" on an unweighted nudge. */
  countUnit: CountUnit;
  /** True once accepted or dismissed this session — hides the nudge. */
  resolved: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}

export function OverloadNudge({
  verdict,
  unitSystem,
  loadMode,
  countUnit,
  resolved,
  onAccept,
  onDismiss,
}: OverloadNudgeProps) {
  const t = useT();
  const lang = useLanguage();

  if (!verdict.shouldNudge || resolved) return null;

  /*
   * WHICH AXIS, read off the data rather than off the status.
   *
   * `due_weight`, `due_reps` and `due_count` are three statuses and two
   * sentences: work with a weight names the weight, work without one names the
   * count. Branching on `currentWeightKg` keeps this component at two branches
   * however many `due_*` the engine grows — and a fourth status arriving would
   * otherwise have rendered "Same — kg for 21 days", which is what a status
   * branch does when it meets a case it was not told about.
   */
  const weighted = verdict.currentWeightKg != null;
  const held = weighted
    ? `${formatWeight(verdict.currentWeightKg, unitSystem, loadMode)} ${unitLabel(unitSystem, lang)}`
    : describeCount(verdict.currentCount ?? 0, countUnit, lang);

  const fact = t('Same {held} for {days} days · {sessions} sessions', {
    held,
    days: verdict.plateauDays,
    sessions: verdict.sessionsInRun,
  });

  const suggestion =
    verdict.suggestedWeightKg != null
      ? t('Try {what}', {
          what: `${formatWeight(verdict.suggestedWeightKg, unitSystem, loadMode)} ${unitLabel(unitSystem, lang)}`,
        })
      : weighted
        ? // Reps before weight: the load stays, the rep target moves.
          t('Try {count} {unit} at the same weight', {
            count: verdict.suggestedCount ?? 0,
            unit: countUnitLabel(countUnit, lang),
          })
        : t('Try {what}', { what: describeCount(verdict.suggestedCount ?? 0, countUnit, lang) });

  const handleAccept = () => {
    commit();
    onAccept();
  };

  return (
    <View className="mt-sm">
      {/* The fact, in `acc` with `trending-up` — the design's one line under the
          plan. It wraps to a second line rather than clipping: the day count
          and the session count are the argument, and both have to be read. */}
      <View className="flex-row items-start" style={{ gap: 6 }}>
        <View style={{ marginTop: 0 }}>
          <Icon name="trending-up" size={16} color={palette.acc} />
        </View>
        <Text
          numberOfLines={2}
          style={{ fontSize: 11.5, lineHeight: 16, letterSpacing: 1.1 }}
          className="flex-1 font-semibold uppercase tabular-nums text-acc"
        >
          {fact}
        </Text>
      </View>

      {/* The offer, under it: the number, `Use` on the gradient, and `×`. */}
      <View className="mt-[6px] flex-row items-center pl-[22px]">
        <Text
          style={{ fontSize: 15, lineHeight: 20 }}
          className="flex-1 font-semibold tabular-nums text-ink"
        >
          {suggestion}
        </Text>

        <Pressable
          onPress={handleAccept}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('{suggestion} — apply to every remaining set', { suggestion })}
          style={{
            marginLeft: 12,
            height: 34,
            paddingHorizontal: 16,
            borderRadius: 9999,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LinearGradient
            {...gradientFill()}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <Text style={{ color: palette.onAcc }} className="text-label font-semibold">
            {t('Use')}
          </Text>
        </Pressable>

        <Pressable
          onPress={onDismiss}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('Dismiss suggestion')}
          className="h-[34px] w-[30px] items-center justify-center"
        >
          <Icon name="x" size={14} color={palette.inkMuted} />
        </Pressable>
      </View>
    </View>
  );
}
