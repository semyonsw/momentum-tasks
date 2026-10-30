/**
 * RoutineListScreen — the `Routines` half of `Routines & exercises`.
 *
 * Since U23 the workout corner has one door for this list and the exercise
 * library; the `switcher` under the header (`components/LibrarySwitch.tsx`) is
 * how one reaches the other.
 *
 * Not one of the fourteen designed frames: it is the landing surface the tab bar
 * needs in order to lead somewhere. Deliberately built from nothing but the
 * primitives the designed screens already establish — 64-high two-line rows, an
 * `Add routine` footer — so it inherits the system rather than inventing a
 * fifteenth layout to maintain.
 *
 * TWO TARGETS PER ROW, and they answer different questions. The row opens the
 * routine to EDIT it; the ▶ on the right OPENS THE WORKOUT (which then starts on
 * its own `Start` — see `ActiveWorkoutScreen`). This tab is where someone is
 * already looking at their routines, so it can reach either without a detour.
 *
 * The `Training sequence` row at the top is the way in to the optional running
 * order of those routines. It states whether it is on, because a feature that is
 * off and invisible is a feature nobody finds.
 *
 * `ADD ROUTINE` ASKS HOW (redesign #16): `Empty` or `Random…`. The random
 * routine used to be a die in the header of EVERY routine's editor, where one
 * stray tap replaced a routine somebody had spent weeks shaping. Rolling is a
 * way to START a routine, so it now lives where routines start, and the die is
 * gone from the editor of an existing one. `Random…` opens the same
 * `RandomRoutineSheet` the die's long press did, and the roll itself still
 * happens in the new routine's editor, where the reel can show it.
 */

import { useState, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Pressable } from '../components/Pressable';

import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { pressedStyle } from '../components/motion';
import { FADE_ON, RunningText } from '../components/RunningText';
import { RandomRoutineSheet } from '../components/RandomRoutineSheet';
import { Sheet, SheetCancel } from '../components/Sheet';
import { AddRow, Kicker, ListCard, Separator } from '../components/primitives';
import { useLanguage, usePlural, useT, type Translate } from '../hooks/useT';
import type { Language } from '../lib/i18n';
import { describeItemsFocus } from '../lib/muscles';
import { DEFAULT_RANDOM_SPEC, type RandomSpec } from '../lib/randomRoutine';
import { palette } from '../theme/tokens';
import type { Exercise, ID, Routine, TrainingSequence } from '../types/models';

interface RoutineListScreenProps {
  routines: Routine[];
  exercisesById: Record<ID, Exercise>;
  sequence: TrainingSequence;
  onOpen: (routineId: ID) => void;
  /** Open this routine as a workout. It starts inside, not here. */
  onStartWorkout: (routineId: ID) => void;
  /** `Empty` in the add-routine sheet. */
  onCreate: () => void;
  /**
   * `Random…` in the add-routine sheet, once the spec sheet says `Roll`. The new
   * routine's editor does the rolling, so the reel plays where the answer lands.
   */
  onCreateRandom: (spec: RandomSpec) => void;
  /** The whole library, for the random sheet's "N exercises to draw from". */
  library: readonly Exercise[];
  onOpenSequence: () => void;
  /** `‹` — the screen is pushed from the workout section, never a tab root. */
  onBack: () => void;
  /** The `Routines | Exercises` switch, under the header (U23). */
  switcher?: ReactNode;
}

export function RoutineListScreen({
  routines,
  exercisesById,
  sequence,
  onOpen,
  onStartWorkout,
  onCreate,
  onCreateRandom,
  library,
  onOpenSequence,
  onBack,
  switcher,
}: RoutineListScreenProps) {
  const t = useT();
  /** Which of the two add sheets is up: the choice, or the random spec. */
  const [adding, setAdding] = useState<'choose' | 'random' | null>(null);
  const lang = useLanguage();
  const counted = usePlural();
  const stepCount = sequence.routineIds.length;

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader kicker={t('Routines & exercises')} onBack={onBack} bordered={false}>
        {switcher}
      </ScreenHeader>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: switcher ? 16 : 8, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Kicker className="mx-lg mb-sm">{t('Sequence')}</Kicker>
        <ListCard className="mx-lg">
          <Pressable
            onPress={onOpenSequence}
            accessibilityRole="button"
            accessibilityLabel={t('Training sequence')}
            style={pressedStyle}
            className="h-row-lg flex-row items-center px-lg"
          >
            <View className="flex-1 pr-md">
              <Text className="text-body font-medium text-ink">{t('Training sequence')}</Text>
              <Text numberOfLines={1} className="mt-[2px] text-label tabular-nums text-ink-faint">
                {stepCount === 0
                  ? t('Off · no order set')
                  : `${sequence.isActive ? t('On') : t('Off')} · ${t('{count} {steps}', {
                      count: stepCount,
                      // `few` is Russian's own third form, so it is the Russian word.
                      steps: counted(stepCount, {
                        one: t('step'),
                        few: 'шага',
                        many: t('steps'),
                      }),
                    })}`}
              </Text>
            </View>
            <Icon name="chevron-right" size={18} color={palette.inkFaint} />
          </Pressable>
        </ListCard>

        <Kicker className="mx-lg mb-sm mt-xl">
          {t('Routines')} · {routines.length}
        </Kicker>

        <ListCard className="mx-lg">
          {routines.map((routine, index) => {
            // A routine whose every exercise was deleted has nothing to open.
            const startable = routine.items.some((item) => exercisesById[item.exerciseId]);

            return (
              <View key={routine.id}>
                {index > 0 ? <Separator /> : null}
                <View className="flex-row items-center">
                  <Pressable
                    onPress={() => onOpen(routine.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('Edit routine')} — ${routine.name}`}
                    style={pressedStyle}
                    className="h-row-lg flex-1 flex-row items-center pl-lg"
                  >
                    <View className="flex-1" style={{ minWidth: 0 }}>
                      <RunningText
                        text={routine.name}
                        fadeColor={FADE_ON.card}
                        className="text-body font-medium text-ink"
                      />
                      <Text
                        numberOfLines={1}
                        className="mt-[2px] text-label tabular-nums text-ink-faint"
                      >
                        {summarize(routine, exercisesById, t, lang)}
                      </Text>
                    </View>
                    <View className="ml-md">
                      <Icon name="chevron-right" size={18} color={palette.inkFaint} />
                    </View>
                  </Pressable>

                  {/* 52 wide, full row height, and its own hit area: opening the
                      workout must not be reachable by a thumb aiming at `Edit`. */}
                  {startable ? (
                    <Pressable
                      onPress={() => onStartWorkout(routine.id)}
                      accessibilityRole="button"
                      accessibilityLabel={t('Open {name} as a workout', { name: routine.name })}
                      style={pressedStyle}
                      className="h-row-lg w-[52px] items-center justify-center"
                    >
                      <View className="h-[32px] w-[32px] items-center justify-center rounded-pill border border-hairline bg-surface-alt">
                        <Icon name="play" size={14} color={palette.greenBright} />
                      </View>
                    </Pressable>
                  ) : (
                    <View className="w-lg" />
                  )}
                </View>
              </View>
            );
          })}

          <Separator inset={0} />
          <AddRow label={t('Add routine')} onPress={() => setAdding('choose')} />
        </ListCard>
      </ScrollView>

      {adding === 'choose' ? (
        <Sheet title={t('Add routine')} onDismiss={() => setAdding(null)}>
          <AddChoices
            onEmpty={() => {
              setAdding(null);
              onCreate();
            }}
            onRandom={() => setAdding('random')}
          />
          <SheetCancel label={t('Cancel')} onDismiss={() => setAdding(null)} />
        </Sheet>
      ) : null}

      {adding === 'random' ? (
        <RandomRoutineSheet
          exercises={library}
          spec={DEFAULT_RANDOM_SPEC}
          onRoll={(spec) => {
            setAdding(null);
            onCreateRandom(spec);
          }}
          onDismiss={() => setAdding(null)}
        />
      ) : null}
    </View>
  );
}

/**
 * The two ways to start a routine, each a 64-high two-line row: the verb, then
 * one line saying what happens next.
 */
function AddChoices({ onEmpty, onRandom }: { onEmpty: () => void; onRandom: () => void }) {
  const t = useT();
  const choices = [
    {
      key: 'empty',
      label: t('Empty'),
      detail: t('Start blank and add exercises yourself'),
      onPress: onEmpty,
    },
    {
      key: 'random',
      label: t('Random…'),
      detail: t('Pick muscles and length, Momentum fills it in'),
      onPress: onRandom,
    },
  ];
  return (
    <ListCard>
      {choices.map((choice, index) => (
        <View key={choice.key}>
          {index > 0 ? <Separator /> : null}
          <Pressable
            onPress={choice.onPress}
            accessibilityRole="button"
            accessibilityLabel={`${choice.label}. ${choice.detail}`}
            style={pressedStyle}
            className="min-h-[64px] flex-row items-center px-lg py-sm"
          >
            <View className="flex-1 pr-md">
              <Text className="text-body font-medium text-ink">{choice.label}</Text>
              <Text className="mt-[2px] text-label text-ink-faint">{choice.detail}</Text>
            </View>
            <Icon name="chevron-right" size={18} color={palette.inkFaint} />
          </Pressable>
        </View>
      ))}
    </ListCard>
  );
}

/**
 * "Pull · back, biceps · 6 exercises" — what day it is, then how much of it.
 *
 * The focus clause comes from the exercises themselves (see `lib/muscles.ts`), so
 * it is a fact about the routine rather than a repeat of the name someone typed:
 * a routine called "Pull + swimming" that is secretly all squats says `Legs`.
 * It leads because it is the thing you scan for when you are looking for the
 * right session, and it drops out silently for a routine with no muscles filed.
 */
function summarize(
  routine: Routine,
  exercisesById: Record<ID, Exercise>,
  t: Translate,
  lang: Language,
): string {
  const items = routine.items.filter((item) => exercisesById[item.exerciseId]);
  const sets = items.reduce((total, item) => total + item.targetSets, 0);
  const focus = describeItemsFocus(items, exercisesById, lang);
  return [focus, t('{exercises} exercises · {sets} sets', { exercises: items.length, sets })]
    .filter(Boolean)
    .join(' · ');
}
