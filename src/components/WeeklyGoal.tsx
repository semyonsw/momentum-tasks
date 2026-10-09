/**
 * WeeklyGoal — the weekly training goal's ring on the Workout home (W8), and the
 * small sheet a tap on it opens.
 *
 *   ╭──────────────────────────────────────────╮
 *   │ (◔)  THIS WEEK                         › │   raised glass, under the hero
 *   │      2 of 3 workouts this week           │
 *   ╰──────────────────────────────────────────╯
 *
 *   WEEKLY GOAL
 *   Workouts a week                3   ( − ) ( + )
 *   Excuse this week                        ( ● )
 *   Excuse last week                        (   )
 *   A week runs Monday to Sunday and starts empty. No streaks.
 *
 * A RING AND A SENTENCE, NOTHING ELSE. The design's slot held a bar of pips and
 * "6 weeks in a row at 3+"; the streak half is not built (see `lib/weeklyGoal.ts`),
 * and the pips became the app's own `ProgressRing`, which already says "a share
 * of something" everywhere else. An excused week draws its ring in the track
 * colour alone and its sentence says "excused" — it is not a week short.
 *
 * Its own card rather than a fourth stat inside the hero: the hero only exists
 * while a training sequence is on, and a goal for the week is not about which
 * routine is next. Opt-in with the rest of Wave 3 — `weeklyGoalVisible`.
 *
 * The goal is set where it is read. Rejected: a row in Workout settings — a
 * number that only means something next to the ring belongs one tap from it.
 */

import { Text, View } from 'react-native';

import { Icon } from './Icon';
import { ProgressRing } from './ProgressRing';
import { Sheet } from './Sheet';
import { BubblePressable } from './bubbles';
import { pressedStyle } from './motion';
import { Kicker, StepperRow, SwitchRow } from './primitives';
import { useToday } from '../hooks/useToday';
import { useLanguage, useT } from '../hooks/useT';
import { shiftDay } from '../lib/days';
import { engagementOn } from '../lib/engagement';
import { describeWeekGoal, weekGoalStatus, weeklyGoalVisible } from '../lib/weeklyGoal';
import { useSettings } from '../state/settingsStore';
import { useWorkoutHistory } from '../state/workoutHistoryStore';
import { glass, palette, radius } from '../theme/tokens';

/** The week `day` is in, against the stored goal and excusals. */
function useWeekGoal(day: string) {
  const workouts = useWorkoutHistory((s) => s.workouts);
  const goal = useSettings((s) => s.weeklyWorkoutGoal);
  const excusedWeeks = useSettings((s) => s.excusedWeeks);
  return weekGoalStatus({ workouts, day, goal, excusedWeeks });
}

export function WeeklyGoalCard({ onPress }: { onPress: () => void }) {
  const t = useT();
  const lang = useLanguage();
  const today = useToday();
  const status = useWeekGoal(today);
  // The Wave 3 switch, off by default: nothing here shows unless it is on.
  const engagement = useSettings(engagementOn);
  if (!weeklyGoalVisible(engagement)) return null;

  const line = describeWeekGoal(status, lang);
  return (
    <View className="mx-lg mt-md">
      <BubblePressable
        onPress={onPress}
        radius={radius.row}
        accessibilityRole="button"
        accessibilityLabel={t('Weekly goal: {line}. Opens the goal.', { line })}
        style={(state) => [
          pressedStyle(state),
          {
            minHeight: 64,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 14,
            paddingVertical: 12,
            gap: 12,
            borderRadius: radius.row,
            borderWidth: 1,
            borderColor: glass.raisedEdge,
            backgroundColor: glass.raised,
          },
        ]}
      >
        <ProgressRing
          fraction={status.excused ? 0 : status.fraction}
          size={40}
          stroke={4}
          color={palette.acc}
        >
          <Text
            maxFontSizeMultiplier={1.2}
            style={{ fontSize: 13 }}
            className="font-semibold tabular-nums text-ink"
          >
            {status.done}
          </Text>
        </ProgressRing>
        <View className="flex-1">
          <Kicker>{t('This week')}</Kicker>
          <Text
            numberOfLines={2}
            maxFontSizeMultiplier={1.3}
            className="mt-[2px] text-body font-medium text-ink"
          >
            {line}
          </Text>
        </View>
        <Icon name="chevron-right" size={16} color={palette.inkFaint} />
      </BubblePressable>
    </View>
  );
}

export function WeeklyGoalSheet({ onDismiss }: { onDismiss: () => void }) {
  const t = useT();
  const today = useToday();
  const thisWeek = useWeekGoal(today);
  const lastWeek = useWeekGoal(shiftDay(today, -7));
  const step = useSettings((s) => s.stepWeeklyWorkoutGoal);
  const excuse = useSettings((s) => s.setWeekExcused);

  return (
    <Sheet title={t('Weekly goal')} onDismiss={onDismiss}>
      <StepperRow
        label={t('Workouts a week')}
        value={String(thisWeek.goal)}
        onDecrease={() => step(-1)}
        onIncrease={() => step(1)}
      />
      <SwitchRow
        label={t('Excuse this week')}
        hint={t('Illness, travel: an excused week is not a miss.')}
        value={thisWeek.excused}
        onChange={(next) => excuse(today, next, today)}
      />
      <SwitchRow
        label={t('Excuse last week')}
        hint={t('Last week: {done} of {goal}', { done: lastWeek.done, goal: lastWeek.goal })}
        value={lastWeek.excused}
        onChange={(next) => excuse(lastWeek.from, next, today)}
      />
      <Text className="mt-md px-lg text-label text-ink-faint">
        {t('A week runs Monday to Sunday and starts empty. No streaks.')}
      </Text>
    </Sheet>
  );
}
