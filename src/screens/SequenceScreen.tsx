/**
 * SequenceScreen — the order you train in, if you train in one.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹  TRAINING SEQUENCE                         │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ Use this sequence                  [ o ] │ │
 *   │ └──────────────────────────────────────────┘ │
 *   │ THE ORDER · 3 STEPS                          │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ ⋮⋮ (1) Push              [Make next]  ✕  │ │
 *   │ │        5 exercises · 15 sets             │ │
 *   │ │ ⋮⋮ (2) Pull + swimming      NEXT      ✕  │ │
 *   │ │ ⋮⋮ (3) Push              [Make next]  ✕  │ │
 *   │ │        make it different                 │ │
 *   │ │              +  Add a step               │ │
 *   │ └──────────────────────────────────────────┘ │
 *   │            Start the sequence over           │
 *   └──────────────────────────────────────────────┘
 *
 * OFF AND EMPTY BY DEFAULT. This screen exists for the person who does follow a
 * fixed order — push, pull, push, boxing — and it stays out of the way of the
 * person who decides in the changing room. Nothing here is required to use the
 * app: with the toggle off, the home screen simply lists every routine.
 *
 * The decisions worth keeping:
 *
 *  • A STEP IS A ROUTINE, AND REPEATS ARE THE POINT. `push → pull → push` is
 *    three steps, two of them the same routine. So steps are added from a list of
 *    routines and identified by position, never deduplicated.
 *  • THE ORDER IS A QUEUE, NOT A CALENDAR. `NEXT` marks the step whose turn it is,
 *    and it advances when a workout from that step is finished — never when the
 *    week does. `Make next` moves the mark by hand, which is what "actually, I
 *    did pull yesterday" needs.
 *  • TAPPING A ROW OPENS ITS ROUTINE, AND ONLY `Make next` MOVES THE MARK
 *    (redesign #18). The whole row used to move the mark, silently — the biggest
 *    target on the screen did the least expected thing, and opening the routine
 *    was a small text link underneath. A row is a routine; tapping it opens it,
 *    as it does in the Routines list.
 *  • A REPEATED ROUTINE IS STILL ONE ROUTINE, until you say otherwise. That is
 *    right for `push → pull → push` and wrong for a twelve-step loop with three
 *    back days in it, which is the whole reason somebody builds a long loop: the
 *    three back days are variations on a theme, not the same six exercises three
 *    times. `Make it different` gives THIS step its own copy of the routine and
 *    leaves every other step pointing at the original, so the next thing the user
 *    does — swapping two exercises in the editor it opens — changes one step of
 *    the loop and not three. It only appears on a step whose routine is repeated,
 *    because a step that is already unique has nothing to be separated from.
 *  • THE GRIP DRAGS, AS IT DOES IN THE ROUTINE EDITOR. This used to be ⌃ / ⌄
 *    per row, on the grounds that a short list opened rarely did not need a
 *    gesture. The row now carries a number, a name, a sub-line and `Make next`,
 *    and two 30 dp arrows beside all that left the name a word and a half; the
 *    ⋮⋮ grip is one mark, it is the reorder vocabulary the rest of the app
 *    already uses (`hooks/useDragReorder.ts`), and screen readers keep the
 *    one-place moves as accessibility actions on it. The store still moves one
 *    place at a time — a drag is a run of those (`lib/sequenceSteps.ts`).
 *  • `+ Add a step` IS ONE BUTTON, opening a sheet of routines. It used to be the
 *    whole routine list, printed under the order, forever — a second list as long
 *    as the first for an action taken once per step.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Pressable } from '../components/Pressable';

import { Icon } from '../components/Icon';
import { ReorderRow } from '../components/ReorderRow';
import { ScreenHeader } from '../components/ScreenHeader';
import { Sheet, SheetCancel } from '../components/Sheet';
import { pressedStyle } from '../components/motion';
import { AddRow, Kicker, ListCard, Separator, TextButton, Toggle } from '../components/primitives';
import { useDragReorder, type CardLayout } from '../hooks/useDragReorder';
import { commit, tap, undo } from '../lib/feedback';
import { stepIndexOf, stepKey, swapsToMove } from '../lib/sequenceSteps';
import { usePlural, useT } from '../hooks/useT';
import { useLeaveGuard } from '../navigation/leaveGuard';
import { palette, tint } from '../theme/tokens';
import type { ID, Routine, TrainingSequence } from '../types/models';

interface SequenceScreenProps {
  sequence: TrainingSequence;
  /** Every routine, for the add-a-step sheet. */
  routines: Routine[];
  onBack: () => void;
  onSetActive: (isActive: boolean) => void;
  onAddStep: (routineId: ID) => void;
  onRemoveStep: (index: number) => void;
  onMoveStep: (index: number, direction: -1 | 1) => void;
  onSetCursor: (index: number) => void;
  /**
   * Open a step's routine in the editor. A TAP ON THE ROW does this (#18) — it is
   * the way to change what a step contains, and the one thing a row should do.
   */
  onEditStep: (routineId: ID) => void;
  /**
   * Give this step its own copy of its routine, and open it.
   *
   * By INDEX, not by routine id, because that is what makes it one step: the same
   * routine at steps 2 and 7 is two steps, and varying the first must leave the
   * second exactly where it was.
   */
  onVaryStep: (index: number) => void;
}

export function SequenceScreen({
  sequence,
  routines,
  onBack,
  onSetActive,
  onAddStep,
  onRemoveStep,
  onMoveStep,
  onSetCursor,
  onEditStep,
  onVaryStep,
}: SequenceScreenProps) {
  const t = useT();
  const countedSteps = usePlural();
  const byId = new Map(routines.map((r) => [r.id, r]));
  const steps = sequence.routineIds;
  /** The add-a-step sheet. */
  const [adding, setAdding] = useState(false);
  /*
   * "3 шага" — one phrase, used by the switch's value and by the list's kicker.
   * `few` is Russian's own third form, so it is the Russian word.
   */
  const stepCount = t('{count} {steps}', {
    count: steps.length,
    steps: countedSteps(steps.length, { one: t('step'), few: 'шага', many: t('steps') }),
  });
  /** How many steps point at each routine — what decides `Make it different`. */
  const uses = steps.reduce<Record<ID, number>>((count, id) => {
    count[id] = (count[id] ?? 0) + 1;
    return count;
  }, {});

  /* THE DRAG — `useDragReorder`, keyed by position (`lib/sequenceSteps.ts`). */
  const rowLayouts = useRef<Record<string, CardLayout>>({});
  const keys = useMemo(() => steps.map((_id, index) => stepKey(index)), [steps]);
  const move = useCallback(
    (key: string, toIndex: number) => {
      const swaps = swapsToMove(stepIndexOf(key), toIndex, keys.length);
      for (const swap of swaps) onMoveStep(swap.index, swap.direction);
    },
    [keys.length, onMoveStep],
  );
  const { lifted, dragY, targetIndex, panHandlers, lift, drop, shiftFor } = useDragReorder(
    keys,
    rowLayouts,
    move,
  );
  const liftedIndex = lifted ? stepIndexOf(lifted) : -1;
  const liftedName =
    liftedIndex >= 0 ? (byId.get(steps[liftedIndex])?.name ?? t('Deleted routine')) : '';
  /* Back while a row is in the air puts it down, as `Drop` does. */
  useLeaveGuard(lifted != null, drop);

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader
        kicker={lifted ? `${t('Moving')} · ${liftedName}` : t('Training sequence')}
        kickerTone={lifted ? 'green' : 'faint'}
        subtitle={
          lifted
            ? t('Slide to move it · position {at} of {of}', {
                at: targetIndex + 1,
                of: steps.length,
              })
            : steps.length === 0
              ? t('Off · no steps yet')
              : sequence.isActive
                ? `${t('On')} · ${stepCount}`
                : `${t('Off')} · ${stepCount}`
        }
        onBack={lifted ? undefined : onBack}
        action={lifted ? { label: t('Drop'), onPress: drop } : undefined}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: 24, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!lifted}
      >
        <ListCard className="mx-lg">
          <View className="h-row flex-row items-center px-lg">
            <View className="flex-1 pr-md">
              <Text className="text-body font-medium text-ink">{t('Use this sequence')}</Text>
              <Text className="mt-[2px] text-label text-ink-faint">
                {steps.length === 0
                  ? t('Add at least one step to turn it on')
                  : t('Suggests the next routine on the home screen')}
              </Text>
            </View>
            <Toggle
              value={sequence.isActive}
              onChange={(value) => {
                tap();
                onSetActive(value);
              }}
              accessibilityLabel={t('Use this sequence')}
            />
          </View>
        </ListCard>

        {routines.length > 0 || steps.length > 0 ? (
          <>
            {steps.length > 0 ? (
              <Kicker className="mx-lg mb-sm mt-xl">
                {t('The order')} · {stepCount}
              </Kicker>
            ) : null}
            {/* The drag surface, around the card rather than on it — `ListCard`
                drops props it does not know. It claims a touch only while a row
                is lifted. */}
            <View {...panHandlers} className={steps.length > 0 ? '' : 'mt-xl'}>
              <ListCard className="mx-lg" clip={!lifted}>
                {steps.map((routineId, index) => {
                  const routine = byId.get(routineId);
                  const key = stepKey(index);
                  return (
                    <ReorderRow
                      key={`${routineId}-${index}`}
                      lifted={lifted === key}
                      dragging={lifted != null}
                      dragY={dragY}
                      shift={shiftFor(key)}
                      onLayout={(e) => {
                        const { y, height } = e.nativeEvent.layout;
                        rowLayouts.current[key] = { y, height };
                      }}
                    >
                      {index > 0 ? <Separator inset={40} /> : null}
                      <StepRow
                        position={index + 1}
                        name={routine?.name ?? t('Deleted routine')}
                        detail={
                          routine
                            ? t('{exercises} exercises · {sets} sets', {
                                exercises: routine.items.length,
                                sets: routine.items.reduce((n, item) => n + item.targetSets, 0),
                              })
                            : undefined
                        }
                        isNext={index === sequence.cursor}
                        isLifted={lifted === key}
                        dimmed={lifted != null && lifted !== key}
                        /* Both need a routine that still exists: a step whose
                           routine was deleted has nothing to open or copy. */
                        onOpen={routine ? () => onEditStep(routineId) : undefined}
                        onVary={
                          routine && (uses[routineId] ?? 0) > 1
                            ? () => onVaryStep(index)
                            : undefined
                        }
                        /* One step has nowhere to go. */
                        onLift={steps.length > 1 ? () => lift(key) : undefined}
                        canMoveUp={index > 0}
                        canMoveDown={index < steps.length - 1}
                        onMoveOne={(direction) => {
                          commit();
                          onMoveStep(index, direction);
                        }}
                        onMakeNext={() => {
                          tap();
                          onSetCursor(index);
                        }}
                        onRemove={() => {
                          undo();
                          onRemoveStep(index);
                        }}
                      />
                    </ReorderRow>
                  );
                })}

                {lifted || routines.length === 0 ? null : (
                  <>
                    {steps.length > 0 ? <Separator inset={0} /> : null}
                    <AddRow label={t('Add a step')} onPress={() => setAdding(true)} />
                  </>
                )}
              </ListCard>
            </View>
          </>
        ) : null}

        {routines.length === 0 ? (
          <Text className="mx-lg mt-xl text-body text-ink-muted">
            {t(
              'There are no routines to put in a sequence yet. Make one in Routines, at the foot of the workout screen, first.',
            )}
          </Text>
        ) : null}

        {!lifted && steps.length > 1 && sequence.cursor > 0 ? (
          <View className="mx-lg mt-xl">
            <TextButton
              label={t('Start the sequence over')}
              onPress={() => {
                undo();
                onSetCursor(0);
              }}
            />
          </View>
        ) : null}
      </ScrollView>

      {adding ? (
        <Sheet title={t('Add a step')} onDismiss={() => setAdding(false)}>
          <ListCard>
            {routines.map((routine, index) => (
              <View key={routine.id}>
                {index > 0 ? <Separator inset={40} /> : null}
                <Pressable
                  onPress={() => {
                    commit();
                    onAddStep(routine.id);
                    setAdding(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('Add {name} to the sequence', { name: routine.name })}
                  style={pressedStyle}
                  className="h-row flex-row items-center px-lg"
                >
                  <Icon name="plus" size={14} color={palette.greenBright} />
                  <Text numberOfLines={1} className="ml-md flex-1 text-body font-medium text-ink">
                    {routine.name}
                  </Text>
                </Pressable>
              </View>
            ))}
          </ListCard>
          <SheetCancel label={t('Cancel')} onDismiss={() => setAdding(false)} />
        </Sheet>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */

/**
 * One step: grip, number, routine, then `NEXT` or `Make next`, then ✕.
 *
 * The row's body opens the routine; `Make next` is a target of its own, labelled,
 * because it is the one control here that changes the queue. `NEXT` is a tag in
 * the accent's soft tint — the same "this is the one to do" the accent means
 * everywhere — and not a button: it is already next.
 */
function StepRow({
  position,
  name,
  detail,
  isNext,
  isLifted,
  dimmed,
  onOpen,
  onVary,
  onLift,
  canMoveUp,
  canMoveDown,
  onMoveOne,
  onMakeNext,
  onRemove,
}: {
  position: number;
  name: string;
  /** "5 exercises · 15 sets". Absent when the routine is gone. */
  detail?: string;
  isNext: boolean;
  /** THIS row is in the air. */
  isLifted: boolean;
  /** Another row is in the air. */
  dimmed: boolean;
  /** Open this step's routine. Absent when the routine is gone. */
  onOpen?: () => void;
  /** Split this step off onto its own copy. Absent unless the routine repeats. */
  onVary?: () => void;
  /** Lift the row for a drag. Absent on a one-step list. */
  onLift?: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** One place up or down — the grip's screen-reader actions. */
  onMoveOne: (direction: -1 | 1) => void;
  onMakeNext: () => void;
  onRemove: () => void;
}) {
  const t = useT();
  const moveActions = [
    ...(canMoveUp ? [{ name: 'moveUp', label: t('Move {name} up', { name }) }] : []),
    ...(canMoveDown ? [{ name: 'moveDown', label: t('Move {name} down', { name }) }] : []),
  ];

  return (
    <View
      className={isLifted ? 'rounded-surface border border-green-dim bg-surface-alt' : ''}
      style={dimmed ? { opacity: 0.5 } : undefined}
    >
      <View className="min-h-[64px] flex-row items-center pr-xs">
        {/* THE GRIP: the visible twin of the row's hold. 44 wide, its own hit
            area, and it lifts sooner than the row does — a press on a grip has
            only one meaning. */}
        <Pressable
          onLongPress={onLift}
          delayLongPress={150}
          disabled={!onLift}
          accessibilityRole="adjustable"
          accessibilityLabel={t('Reorder {name}', { name })}
          accessibilityHint={onLift ? t('Long press, then slide to reorder') : undefined}
          accessibilityActions={moveActions}
          onAccessibilityAction={(event) =>
            onMoveOne(event.nativeEvent.actionName === 'moveUp' ? -1 : 1)
          }
          className="h-row-lg w-[44px] items-center justify-center"
        >
          <Icon
            name="grip"
            size={16}
            color={isLifted ? palette.greenBright : onLift ? palette.inkFaint : palette.hairline}
          />
        </Pressable>

        <Pressable
          onPress={
            onOpen
              ? () => {
                  tap();
                  onOpen();
                }
              : undefined
          }
          onLongPress={onLift}
          delayLongPress={280}
          disabled={!onOpen && !onLift}
          accessibilityRole="button"
          accessibilityLabel={[
            t('Step {position}', { position }),
            name,
            detail ?? '',
            isNext ? t('next') : '',
          ]
            .filter(Boolean)
            .join(', ')}
          accessibilityHint={onOpen ? t('Opens the routine') : undefined}
          style={pressedStyle}
          className="min-h-[64px] flex-1 flex-row items-center py-sm"
        >
          <View className="h-[28px] w-[28px] items-center justify-center rounded-pill border border-hairline">
            <Text className="text-label font-semibold tabular-nums text-ink-muted">{position}</Text>
          </View>
          <View className="ml-md flex-1" style={{ minWidth: 0 }}>
            <Text
              numberOfLines={1}
              className={[
                'text-body font-medium',
                isLifted ? 'text-green-bright' : 'text-ink',
              ].join(' ')}
            >
              {name}
            </Text>
            {detail ? (
              <Text numberOfLines={1} className="mt-[2px] text-label tabular-nums text-ink-faint">
                {detail}
              </Text>
            ) : null}
          </View>
        </Pressable>

        {isNext ? (
          <View
            className="ml-sm rounded-pill px-md py-xs"
            style={{ backgroundColor: tint(0.14) }}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {/* The catalogue's lower-case `next` (the old kicker's word), capitalised
                here: `Next` is already the questionnaire's "Далее". */}
            <Text className="text-label font-semibold capitalize text-green-bright">
              {t('next')}
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={onMakeNext}
            hitSlop={{ top: 4, bottom: 4 }}
            accessibilityRole="button"
            accessibilityLabel={t('Make {name} the next step', { name })}
            style={pressedStyle}
            className="ml-sm h-[36px] items-center justify-center rounded-pill border border-hairline bg-surface-alt px-md"
          >
            <Text className="text-label font-semibold text-ink">{t('Make next')}</Text>
          </Pressable>
        )}

        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={t('Remove {name} from the sequence', { name })}
          className="h-row-lg w-[44px] items-center justify-center"
        >
          <Icon name="x" size={15} color={palette.inkMuted} />
        </Pressable>
      </View>

      {/* `make it different` keeps its own line: a sixth target in the row above
          would leave the name a word and a half. Indented to the name's column
          so it reads as belonging to this step. */}
      {onVary && !dimmed && !isLifted ? (
        <View className="-mt-sm flex-row items-center pl-[76px]">
          <Pressable
            onPress={() => {
              commit();
              onVary();
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t(
              'Give this step its own copy of {name}, so it can hold different exercises',
              { name },
            )}
            className="h-hit justify-center"
          >
            <Text className="text-label font-medium text-green-bright">
              {t('make it different')}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
