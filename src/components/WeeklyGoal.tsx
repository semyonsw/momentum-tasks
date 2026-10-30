/**
 * WeeklyGoal — the weekly workout goal's card on the Workout section (W8, and
 * the 2.9 redesign's #11 / #13), and the small sheet a tap on it opens.
 *
 *   ╭──────────────────────────────────────────╮
 *   │ WEEKLY WORKOUT GOAL                    › │   raised glass, under the hero
 *   │ 2 of 4 this week                         │
 *   │ ▬▬▬▬  ▬▬▬▬  ────  ────                   │   one pip per workout of the goal
 *   ╰──────────────────────────────────────────╯
 *
 *   WEEKLY GOAL
 *   Workouts a week                3   ( − ) ( + )
 *   Excuse this week                        ( ● )
 *   Excuse last week                        (   )
 *   A week runs Monday to Sunday and starts empty. No streaks.
 *
 * PIPS AND A SENTENCE, NOTHING ELSE. It was a ring (the app's `ProgressRing`);
 * 2.9 went back to the original design's pips, because a goal of four is four
 * workouts and four marks count them where a ring only shows a share. The
 * "6 weeks in a row at 3+" half of that design is still not built (see
 * `lib/weeklyGoal.ts`). An excused week dims its pips and its sentence says
 * "excused" — it is not a week short.
 *
 * Its own card rather than a fourth stat inside the hero: the hero only exists
 * while a training sequence is on, and a goal for the week is not about which
 * routine is next. ALWAYS SHOWN since 2.9 — it used to sit behind the
 * "Achievements and levels" switch, which is no place to look for a target.
 *
 * Set in two places that open the same sheet: a tap on this card, and the
 * `Weekly workout goal` row in Workout settings (#13). The row is where somebody
 * looking for the setting looks; the card is where somebody looking at the
 * number wants to change it.
 */

import { Text, View } from 'react-native';

import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { BubblePressable } from './bubbles';
import { pressedStyle } from './motion';
import { Kicker, StepperRow, SwitchRow } from './primitives';
import { useToday } from '../hooks/useToday';
import { useLanguage, useT } from '../hooks/useT';
import { shiftDay } from '../lib/days';
import { weekGoalStatus } from '../lib/weeklyGoal';
import { describeGoalShort, goalPips } from '../lib/workoutHome';
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

  const line = describeGoalShort(status, lang);
  const pips = goalPips(status.done, status.goal);
  return (
    <View className="mx-lg mt-md">
      <BubblePressable
        onPress={onPress}
        radius={radius.row}
        accessibilityRole="button"
        accessibilityLabel={t('Weekly workout goal: {line}. Opens the goal.', { line })}
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
        <View className="flex-1">
          <Kicker>{t('Weekly workout goal')}</Kicker>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
            className="mt-[2px] text-body font-medium tabular-nums text-ink"
          >
            {line}
          </Text>
          <View className="mt-sm flex-row" style={{ gap: 6, opacity: status.excused ? 0.45 : 1 }}>
            {pips.map((lit, i) => (
              <View
                key={i}
                style={{
                  flex: 1,
                  maxWidth: 48,
                  height: 6,
                  borderRadius: radius.pill,
                  backgroundColor: lit ? palette.acc : palette.hairline,
                }}
              />
            ))}
          </View>
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
