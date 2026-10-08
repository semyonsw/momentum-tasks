/**
 * SetRow — the most important 56 dp in the app.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │  W     +20 KG      ×    8 REPS           ( ✓ )│  ← a warm-up
 *   │  1     +40 KG      ×    4 REPS           ( ✓ )│
 *   │  2       2:00 MIN                    ( ▶ )( ✓ )│  ← a timed set
 *   │  3       65 KG     ×    5 REPS           ( ✓ )│
 *   │        20 + 2×10 + 2×2.5                      │  ← a barbell lift
 *   └──────────────────────────────────────────────┘
 *
 * Interaction contract:
 *   • THE SET THAT SHOULD HAPPEN NEXT IS LIT. One row in the whole session
 *     carries it — the PRIMED row — and it is the answer to "I pressed Start, now
 *     what". Since Momentum v3 it is a lit pill (c2 fill, c2 edge, glow) inside the
 *     exercise card rather than a ring drawn over a flat row. Every row carries a
 *     1 dp border — transparent on all but this one — so the numbers under a thumb
 *     do not shift sideways when the edge arrives, or back when the ✓ lands and
 *     the light moves to the row below.
 *   • AND THE LIGHT IS NOT THE ONLY THING THAT SAYS SO. The primed row is TALLER
 *     and its set number, its weight and its count go `acc`, 30 dp against the
 *     other rows' 21, with a glow behind
 *     them. A 2 dp outline is a detail you have to look for; the numbers you are
 *     about to do are the thing you read at arm's length, mid-set, through sweat,
 *     so they are the thing that grows. It costs 8 dp of layout on ONE row in the
 *     session, and the row above it gives exactly that back as the ✓ lands —
 *     which is why the numbers under the thumb still do not move sideways, only
 *     the row's own height does.
 *
 *     GREEN OUTRANKS THE GHOST, on this row only. A prefilled value renders
 *     `ink-faint` everywhere else and that is real information — "carried over,
 *     untouched" — but on the one row that means DO THIS NEXT, "do this next" is
 *     the louder fact, and the ghost state is still readable on every other row of
 *     the card. Green here is the same green the ring is drawn in and the same
 *     green the card's name goes: one accent, one meaning, three places.
 *   • The row arrives PRE-FILLED with last session's numbers, rendered faint
 *     ("ghost") on a lifted `surface-alt` background. That is the visual promise
 *     of "tap ✓ if nothing changed" — logging an identical set costs ONE tap.
 *   • A value goes full `ink` the moment it stops matching last session, or the
 *     moment the set is logged. Ink means "this is a fact now."
 *   • Tapping a number chips that cell up and opens the editor below the row —
 *     no keyboard, no modal, no scroll jump.
 *   • When `requiresWeight` is false the weight cell is ABSENT, not disabled,
 *     and the count cell widens into its place so rounds, minutes and reps all
 *     land under the same thumb position a weight would.
 *   • A TIMED set (a plank, a hang, a round) grows a ▶ to the LEFT of the ✓, and
 *     keeps the ✓. Two controls, because they answer two different questions:
 *     ▶ is "run the clock for me", ✓ is "I did this, take my word for it". The ✓
 *     never changes meaning anywhere in the app, so it does not get replaced —
 *     and a set held away from the phone can still be logged in one tap.
 *     While the clock is running the ▶ fills green and becomes stop-and-log.
 *   • A WARM-UP reads `W` where a working set reads its number, and the working
 *     sets number around it: W, 1, 2, 3. A warm-up is a set that does not
 *     count — it is out of the volume, out of the set count, out of the
 *     shorthand and out of every verdict — so it must not be numbered as though
 *     it did, and "set 2 of 5" must mean the second of five sets that counted.
 *     Same `ink-faint` as the numbers, because it is the same kind of landmark
 *     and not a warning; the toggle lives in `QuickAdjust`, beside `Remove set`.
 *   • THE RINGED ROW IS ALSO THE DOOR INTO FOCUS MODE. Tapping its numbers, or
 *     long-pressing it, opens the full-screen sheet instead of the inline editor —
 *     and ONLY on that row. `QuickAdjust` is unchanged on every other row of every
 *     card, and the long press stays off the card header, which is the reorder
 *     handle (`useDragReorder`). The trade is deliberate and it is stated here
 *     because it is a control that moved: the up-next row's `Type`, `Warm-up` and
 *     `Remove set` now live one screen away — focus mode's ± nudge covers the
 *     common edit, and the row's own editor is one ✓ or one tap on another row
 *     away. What that buys is the numbers you are about to lift at 56 dp instead
 *     of 30, on a screen with nothing else on it.
 *   • IN EDIT MODE EVERY ROW GROWS A `−` ON THE LEFT — a 28 dp coral ring that
 *     pops in and removes THAT row. It used to be one `Remove set` that always
 *     took the bottom row, which is the right answer for "three today, not four"
 *     and the wrong one for "that warm-up was a mistake". Coral is `danger`, the
 *     one non-green hue, and it only exists inside edit mode.
 *   • THE ✓ IS CAUGHT, AND THE ROW FLASHES. On the tap that logs it the fill pops
 *     in on the overshoot curve and the whole row washes green and fades — both
 *     only on the transition, never on a row that was already logged when the
 *     card opened, so opening a finished exercise is not a light show.
 *   • THE RING BREATHES. Its glow swells between 16 and 30 dp over 2.6 s, which is
 *     how the one row on a bench-height phone says "here" without being read.
 *   • A BARBELL LIFT gets what goes on the bar, under the weight cell:
 *     `20 + 2×10 + 2×2.5`. Only when the exercise declares a `barWeightKg`, so a
 *     machine, a dumbbell and a cable stack never show one — a plate breakdown for
 *     a pin position is a lie about the equipment. It INFORMS AND NEVER ROUNDS: an
 *     unreachable target renders no line at all rather than the nearest loadable
 *     weight, because `QuickAdjust`'s header is explicit that nothing here is
 *     snapped to a grid by a machine the app has never seen, and this is the most
 *     tempting place in the codebase to break that.
 */

import { memo, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View, type ViewStyle } from 'react-native';

import { commit, tap, undo } from '../lib/feedback';
import type { DraftSet } from '../lib/draft';
import type { Exercise, UnitSystem } from '../types/models';
import { describePlates, platesFor } from '../lib/plates';
import { maxLabel, showsMaxLabel } from '../lib/maxReps';
import { countUnitLabel, formatCount, formatWeight, unitLabel } from '../lib/units';
import { useLanguage, useT } from '../hooks/useT';
import { LinearGradient } from 'expo-linear-gradient';

import { danger, gradientFill, palette, tint } from '../theme/tokens';
import { SpecularEdge } from './glass';
import { Icon } from './Icon';
import { Flash, Pop, usePressScale } from './motion';

export type SetField = 'weight' | 'count';

interface SetRowProps {
  set: DraftSet;
  /**
   * What the leftmost column reads: the WORKING-set number (1-based), or null for
   * a warm-up, which reads `W` instead.
   *
   * Computed by the card rather than here, because it depends on the sets above
   * this one — `workingSetLabels` is the pure function that does it.
   */
  workingNumber: number | null;
  exercise: Exercise;
  unitSystem: UnitSystem;
  /**
   * THE next set of the whole session: the first unlogged row of the exercise the
   * cursor is on. Rings the row in green — see the file header.
   */
  isUpNext?: boolean;
  /**
   * Open focus mode. Present ONLY on the up-next row — see the file header.
   *
   * When it is present it REPLACES this row's inline editor: the numbers and a
   * long press both go to the sheet, whose ± nudge is the same chips at four
   * times the size.
   */
  onOpenFocus?: () => void;
  /** Which field (if any) is currently open in the inline editor. */
  focusedField: SetField | null;
  /** This exercise is clock-driven: render the ▶. */
  isTimed?: boolean;
  /** The clock is running for THIS set. */
  isTiming?: boolean;
  /**
   * The plates this gym has, from Settings. Only read for an exercise that
   * declares a bar weight, and a stable reference from the store — this component
   * is memoized.
   */
  availablePlatesKg?: readonly number[];
  onFocusField: (field: SetField) => void;
  onToggleComplete: () => void;
  /** Start the clock, or — while it runs — stop it and log what it read. */
  onPressTimer?: () => void;
  /**
   * Session edit mode: present = draw the `−` and remove THIS row with it.
   * Absent everywhere outside edit mode, which is what hides it.
   */
  onRemove?: () => void;
}

function SetRowComponent({
  set,
  workingNumber,
  exercise,
  unitSystem,
  isUpNext = false,
  onOpenFocus,
  focusedField,
  isTimed = false,
  isTiming = false,
  availablePlatesKg,
  onFocusField,
  onToggleComplete,
  onPressTimer,
  onRemove,
}: SetRowProps) {
  const t = useT();
  const lang = useLanguage();
  const done = set.isCompleted;
  /*
   * THE MOMENT A SET IS LOGGED, as opposed to the fact that it is. The pop and
   * the flash are keyed on the transition, so a row that mounts already logged —
   * a finished card opened to read it — renders at rest. See the file header.
   */
  const wasDone = useRef(done);
  const [loggedAt, setLoggedAt] = useState<number | null>(null);
  useEffect(() => {
    if (done && !wasDone.current) setLoggedAt(Date.now());
    if (!done) setLoggedAt(null);
    wasDone.current = done;
  }, [done]);
  /*
   * A logged set is not "up next" however the card labels it: the ring means DO
   * THIS, and the row it belongs on moves the instant the ✓ lands.
   */
  const ring = isUpNext && !done;
  // Ghost = a value carried over from last session that the user hasn't touched.
  const ghost = set.isPrefilled && !done;
  /** The count cell is standing in for a number nobody has yet. */
  const countsMax = showsMaxLabel(exercise, set);
  // Logged numbers step back to muted (Momentum v3): the log is history, and the
  // lit row below them is the one the eye should land on.
  const valueTone = ghost ? 'text-ink-faint' : done ? 'text-ink-muted' : 'text-ink';

  /*
   * What goes on the bar. Null — and therefore no line — for a machine (no
   * `barWeightKg`), for an empty weight cell, and for a target this plate set
   * cannot make. See the file header on why the third case is a missing line
   * rather than a rounded weight.
   */
  const plateLabel =
    exercise.barWeightKg != null && set.weightKg != null
      ? describePlates(
          exercise.barWeightKg,
          platesFor(set.weightKg, exercise.barWeightKg, availablePlatesKg),
        )
      : null;

  const handleComplete = () => {
    // Medium impact on completion, light on undo — the hand can tell them apart.
    if (done) undo();
    else commit();
    onToggleComplete();
  };

  // The get-ready count and the stop both have their own feedback (see
  // `useSetTimer`), so pressing ▶ only needs to acknowledge the tap itself.
  const handleTimer = () => {
    tap();
    onPressTimer?.();
  };

  /**
   * WHAT THE NUMBERS OPEN. The ringed row goes to focus mode; every other row
   * opens its own inline editor, exactly as it always has.
   */
  const openWeight = ring && onOpenFocus ? onOpenFocus : () => onFocusField('weight');
  const openCount = ring && onOpenFocus ? onOpenFocus : () => onFocusField('count');

  /*
   * MOMENTUM v3: the rows are pills inside the exercise card, 6 apart, and the
   * PRIMED row is the lit one — c2 @ 12 % fill, a c2 @ 32 % edge and a glow —
   * with 10 dp of padding where the others have 6. Every row carries a 1 dp
   * border, transparent on the rest, so the edge arriving on the primed row
   * does not move the numbers under the thumb sideways; only its height grows.
   * The first unlogged row of a card that is only being READ does not lift:
   * one lit row per session is the whole point of lighting it.
   */
  const rowStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: ring ? 10 : 6,
    borderRadius: ROW_RADIUS,
    borderWidth: 1,
    borderColor: ring ? tint(0.32) : 'transparent',
    backgroundColor: ring ? tint(0.12) : 'transparent',
  };

  /*
   * A LONG PRESS ON THE ROW ITSELF, and only the ringed one.
   *
   * The children are built ONCE and handed to whichever container this row needs,
   * rather than through a component declared in here: a component defined during
   * render is a new type on every render, and React would unmount and rebuild the
   * whole row — four Pressables and an inline editor — every time the clock ticked.
   *
   * `onLongPress` with no `onPress`: the cells and the ✓ inside keep their own
   * taps (a child Pressable wins the touch), and a short press on the row's empty
   * middle does nothing, which is what it did before. The card header keeps the
   * long press that lifts it for reordering — a row is not a reorder handle.
   */
  const rowChildren = (
    <>
      {/* The flash. First child so everything paints over it; it takes nothing. */}
      {loggedAt != null ? <Flash key={loggedAt} radius={ROW_RADIUS} /> : null}

      {/* EDIT MODE's own control, and the only thing in the row that moves the
          numbers: 38 dp in from the left, the row's content slides over by it. */}
      {onRemove ? <RemoveMark onPress={onRemove} /> : null}

      {/* Set index — never a tap target, purely a landmark. `W` for a warm-up:
          see the file header. It goes green and up a size on the ringed row with
          the numbers beside it: it is the label OF those numbers, and a micro
          `ink-faint` 3 next to a 30 dp green weight reads as a different row's. */}
      <Text
        maxFontSizeMultiplier={1.3}
        className={[
          'w-[22px] font-semibold uppercase tabular-nums',
          ring ? 'text-acc' : 'text-ink-faint',
        ].join(' ')}
        style={{ fontSize: 14 }}
      >
        {workingNumber == null ? 'W' : workingNumber}
      </Text>

      {exercise.requiresWeight ? (
        <>
          <View className="min-w-[96px]">
            <ValueCell
              width="w-full"
              value={formatWeight(set.weightKg, unitSystem, exercise.loadMode)}
              unit={unitLabel(unitSystem, lang)}
              tone={valueTone}
              emphasis={ring}
              focused={focusedField === 'weight'}
              onPress={openWeight}
              accessibilityLabel={t('Weight {weight} {unit}', {
                weight: formatWeight(set.weightKg, unitSystem, exercise.loadMode),
                unit: unitLabel(unitSystem, lang),
              })}
            />
            {/* Micro, ink-faint, under the number it describes: it is reference,
                not a control, and nothing about it is tappable. */}
            {plateLabel ? (
              <Text
                numberOfLines={1}
                className="mt-[1px] text-micro tabular-nums text-ink-faint"
                accessibilityLabel={t('On the bar: {plates} kilograms', { plates: plateLabel })}
              >
                {plateLabel}
              </Text>
            ) : null}
          </View>
          <Text style={{ fontSize: 16, marginHorizontal: 6 }} className="text-ink-faint">
            ×
          </Text>
        </>
      ) : null}

      {/* Count cell — reps / rounds / minutes / metres. Takes the weight cell's
          96 dp when there is no weight, so the thumb target never moves. */}
      <ValueCell
        width={exercise.requiresWeight ? 'min-w-[76px]' : 'min-w-[96px]'}
        /* `MAX` rather than a 0 until the first rep is counted — the word is what
           is being asked for, and the zero is only the counter. See
           `lib/maxReps.ts`. */
        value={
          countsMax ? maxLabel(lang).toUpperCase() : formatCount(set.count, exercise.countUnit)
        }
        unit={countsMax ? '' : countUnitLabel(exercise.countUnit, lang)}
        tone={valueTone}
        emphasis={ring}
        focused={focusedField === 'count'}
        onPress={openCount}
        accessibilityLabel={
          countsMax ? maxLabel(lang) : `${set.count} ${countUnitLabel(exercise.countUnit, lang)}`
        }
      />

      <View className="flex-1" />

      {/* Run the clock. Present only on timed work, and only until the set is
          logged — there is nothing to time about a set that already happened. */}
      {isTimed && !done ? (
        <Pressable
          onPress={handleTimer}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={
            isTiming
              ? t('Stop the timer and log this set')
              : t('Start the {count} timer', {
                  count: formatCount(set.count, exercise.countUnit),
                })
          }
          className={[
            'mr-sm h-hit w-hit items-center justify-center rounded-pill',
            isTiming ? 'bg-green' : 'border border-hairline',
          ].join(' ')}
        >
          <Icon name="play" size={16} color={isTiming ? palette.onAcc : palette.acc} />
        </Pressable>
      ) : null}

      {/* The commit target. Deliberately the largest element in the row. */}
      <Pressable
        onPress={handleComplete}
        hitSlop={12}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={done ? t('Undo set') : t('Complete set')}
        /*
          THE MARK, 46–50 dp. Logged: the theme's gradient with an `onAcc` ✓.
          Primed: a 2 dp `acc` ring at 50 with an `acc` ✓ and a glow — the one
          control on the screen the thumb is about to press. Anything else: an
          empty 46 dp ring, because a ✓ drawn on a set not yet done is a claim.
        */
        style={
          done
            ? { width: 46, height: 46 }
            : ring
              ? {
                  width: 50,
                  height: 50,
                  borderRadius: 9999,
                  borderWidth: 2,
                  borderColor: palette.acc,
                  alignItems: 'center',
                  justifyContent: 'center',
                }
              : {
                  width: 46,
                  height: 46,
                  borderRadius: 9999,
                  borderWidth: 1.5,
                  borderColor: '#2A3330',
                }
        }
      >
        {done ? (
          /* The fill, caught: it pops in on the overshoot curve when THIS tap
             logged it, and simply is there on a row that was logged already. */
          loggedAt != null ? (
            <Pop key={loggedAt} duration={360} style={DONE_FILL}>
              <DoneFill />
            </Pop>
          ) : (
            <View style={DONE_FILL}>
              <DoneFill />
            </View>
          )
        ) : ring ? (
          <Icon name="check" size={20} color={palette.acc} />
        ) : null}
      </Pressable>

      {/* The breath over the lit row's glow. Last child so it paints over the
          row, `pointerEvents="none"` so it takes nothing from the ✓ under it. */}
    </>
  );

  return ring && onOpenFocus ? (
    <Pressable
      onLongPress={onOpenFocus}
      delayLongPress={280}
      accessibilityHint={t('Long press for focus mode')}
      style={rowStyle}
    >
      {rowChildren}
    </Pressable>
  ) : (
    <View style={rowStyle}>{rowChildren}</View>
  );
}

/** A set row's corner — the design's 18, `radius.row`. */
const ROW_RADIUS = 18;

/** The logged mark: 46 dp, clipped round, the gradient painted inside. */
const DONE_FILL: ViewStyle = {
  width: 46,
  height: 46,
  borderRadius: 9999,
  overflow: 'hidden',
  alignItems: 'center',
  justifyContent: 'center',
};

/** The gradient and its `onAcc` ✓ — text on a gradient is never ink. */
function DoneFill() {
  return (
    <>
      <LinearGradient
        {...gradientFill()}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <SpecularEdge color="rgba(236,241,238,0.22)" radius={9999} />
      <Icon name="check" size={20} color={palette.onAcc} />
    </>
  );
}

/**
 * Edit mode's `−`: 28 dp, a 1.5 dp coral ring, coral minus, 10 of air before the
 * set number. It pops in when edit mode opens and sinks under the finger.
 */
function RemoveMark({ onPress }: { onPress: () => void }) {
  const t = useT();
  const press = usePressScale(0.85);
  return (
    <Pop duration={260} style={{ marginRight: 10 }}>
      <Pressable
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t('Remove this set')}
      >
        <Animated.View
          style={{
            width: 28,
            height: 28,
            borderRadius: 9999,
            borderWidth: 1.5,
            borderColor: danger,
            alignItems: 'center',
            justifyContent: 'center',
            transform: press.style.transform,
          }}
        >
          <Icon name="minus" size={12} color={danger} />
        </Animated.View>
      </Pressable>
    </Pop>
  );
}

const PRIMED_NUMERAL = { fontSize: 30, lineHeight: 34, letterSpacing: -0.8 } as const;
const ROW_NUMERAL = { fontSize: 21, lineHeight: 26, letterSpacing: -0.3 } as const;

/**
 * One number + its micro unit, baseline-aligned.
 *
 * Focused, it grows a `surface` chip behind itself with a −8 left margin, so
 * the chip appears *around* the value without the value sliding sideways. The
 * number under the thumb must not move when it is tapped.
 *
 * `emphasis` is the up-next row: GREEN, two sizes up the scale, bold, and glowing.
 * The glow is the app's ONE glow (`theme/tokens`), the same value the ring around
 * this row is drawn with — a second, stronger green would be a second meaning, and
 * there is only one thing being said here.
 *
 * The `tone` prop is IGNORED under emphasis, deliberately: see the file header on
 * why green outranks the prefill ghost on this one row.
 */
function ValueCell({
  width,
  value,
  unit,
  tone,
  emphasis = false,
  focused,
  onPress,
  accessibilityLabel,
}: {
  width: string;
  value: string;
  unit: string;
  tone: string;
  /** This is the set to do next: bigger, bolder, glowing. */
  emphasis?: boolean;
  focused: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={[
        width,
        'flex-row items-baseline',
        focused ? '-ml-sm rounded-surface bg-surface px-sm py-[2px]' : '',
      ].join(' ')}
    >
      {/* 30 / 34 on the primed row, 21 / 26 everywhere else — the design's two
          sizes, set in `style` so the release bundle cannot drop them. */}
      <Text
        allowFontScaling={false}
        className={['font-semibold tabular-nums', emphasis ? 'text-acc' : tone].join(' ')}
        style={emphasis ? PRIMED_NUMERAL : ROW_NUMERAL}
      >
        {value}
      </Text>
      <Text
        className={[
          'ml-xs font-semibold uppercase',
          // The unit rides with the number, one notch behind it in size and in
          // colour: `KG` at micro beside a 30 dp numeral reads as a different
          // row's label, and `KG` in full green would compete with the number it
          // belongs to.
          emphasis ? 'text-label text-acc' : 'text-micro text-ink-faint',
        ].join(' ')}
      >
        {unit}
      </Text>
    </Pressable>
  );
}

/**
 * Memoized: an 18-set session renders ~35 rows, and every tick of the rest
 * timer re-renders the screen. Rows must not repaint for someone else's state.
 */
export const SetRow = memo(SetRowComponent);
