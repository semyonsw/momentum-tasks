/**
 * SetRow — the most important 56 dp in the app.
 *
 *   ┌──── 80 ────┬─────────┬─────────┬ 48 ┐
 *   │ [W] [W ▾]  │  20 kg  │ 8 reps  │ (✓)│  ← a warm-up: toggle on, letter in the well
 *   │ ┆W┆ [1 ▾]  │  80 kg  │ 8 reps  │ (✓)│  ← up next: the lit row, the solid ✓
 *   │     [2 ▾]  │  80 kg  │ 8 RIR 2 │ (✓)│  ← logged and graded: the chip in the well
 *   │     [F ▾]  │  80 kg  │ 6 reps  │ (✓)│  ← a typed set: its letter, not its number
 *   │        20 + 2×20 + 2×10                │  ← a barbell lift: what goes on the bar
 *   └────────────┴─────────┴─────────┴────┘
 *   edit mode:  ⋮⋮ [1 ▾] │ 80 kg │ 8 reps │ (−)
 *
 * The grid is `lib/setRowLayout.ts` (80 | 1fr | 1fr | 48, gap 6), and the 2.9
 * redesign (#1) is the reason for every part of it:
 *
 *   • A NUMBER THAT DOES SOMETHING LOOKS LIKE IT. The set number, the weight and
 *     the reps are all WELLS (`ValueWell`) — a 40 dp sunken field with a hairline
 *     — where they used to be bare text, two of which were secretly buttons. The
 *     set well carries a ▾, because what it opens (the type and reps-left sheet)
 *     is the one thing on the row nobody would guess from a number.
 *   • TAPPING WEIGHT OR REPS ALWAYS OPENS THE INLINE EDITOR — on every row, the
 *     lit up-next one included. The up-next row used to open focus mode instead,
 *     and long-pressing it did too; the row you were about to lift was the one row
 *     whose numbers you could not nudge in place, and nothing on it said so.
 *     Focus mode keeps its two labelled doors (the dock's `Focus` and the card's
 *     `Focus` chip) and no hidden ones. `lib/inlineEditor.ts` holds the rule.
 *   • THE `W` TOGGLE IS ONLY WHERE THE ANSWER CAN STILL BE YES — un-logged, not
 *     typed otherwise, and no working set logged above (`warmupToggleRows`).
 *     Everywhere else the 30 dp slot is an empty spacer rather than nothing, so
 *     the weight well's left edge is the same on every row and never jumps
 *     sideways under the thumb when the toggle goes. Edit mode puts the ⋮⋮ grip
 *     in that same slot for the same reason.
 *   • ONE SOLID GREEN THING PER ROW, AT MOST: the up-next row's ✓. Its row is lit
 *     (`acc` at 7 % with an `acc` edge) so the set to do next is findable at arm's
 *     length; a logged ✓ goes soft (`acc` at 14 %) because the log is history and
 *     the lit row below is what the eye should land on next.
 *   • A WARM-UP READS ONE STEP SMALLER (17 against 19) — it is a set that does
 *     not count, out of the volume and the set count, and its numbers step back
 *     with it. Its well reads `W`, and the working sets number around it: W 1 2 3.
 *   • A GRADED SET CARRIES `RIR 2` IN THE REPS WELL, in place of the `reps` unit
 *     — the unit is implied by the chip and the well is 79 dp at 360. Only where a
 *     grade exists; the way to a first grade is the inline editor's `Reps left`.
 *   • THE ✓ IS CAUGHT, AND THE ROW FLASHES — on the transition only, so opening a
 *     finished card is not a light show.
 *   • A TIMED SET grows a ▶ left of the ✓ and keeps the ✓: ▶ is "run the clock",
 *     ✓ is "I did this", and a hold done away from the phone still logs in one tap.
 *   • A BARBELL LIFT gets what goes on the bar on a line under the row, aligned
 *     with the weight. Only for an exercise with a `barWeightKg`, and it INFORMS
 *     AND NEVER ROUNDS: a target the plates cannot make draws no line rather than
 *     the nearest loadable weight. The one thing that makes a row taller than 56.
 *
 * REJECTED: keeping the number-or-badge as bare text and adding a separate ⓘ for
 * the type. Two targets for one question, and the number is where people tap.
 */

import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';

import { commit, tap, undo } from '../lib/feedback';
import type { DraftSet } from '../lib/draft';
import type { Exercise, UnitSystem } from '../types/models';
import { describePlates, platesFor } from '../lib/plates';
import { maxLabel, showsMaxLabel } from '../lib/maxReps';
import { countUnitLabel, formatCount, formatWeight, unitLabel } from '../lib/units';
import { describeRir, effortApplies, rirChipLabel } from '../lib/effort';
import { kindBadge, kindName, setKindOf, setWellFace, type SetKind } from '../lib/setType';
import { SET_ROW, UNIT_FONT_SIZE, valueFontSize } from '../lib/setRowLayout';
import { useLanguage, useT } from '../hooks/useT';

import { glass, palette, tint } from '../theme/tokens';
import { Icon } from './Icon';
import { Flash, Pop } from './motion';
import { RemoveRowButton, ValueWell } from './primitives';

export type SetField = 'weight' | 'count';

interface SetRowProps {
  set: DraftSet;
  /**
   * The WORKING-set number (1-based), or null for a warm-up, which reads `W`.
   * Computed by the card (`workingSetLabels`): it depends on the rows above.
   */
  workingNumber: number | null;
  /** The row's place in the card, 1-based — "Mark set 3 as warm-up". */
  position: number;
  exercise: Exercise;
  unitSystem: UnitSystem;
  /** THE next set of the whole session. Lights the row — see the file header. */
  isUpNext?: boolean;
  /** Which field (if any) is open in the inline editor: its well gets the outline. */
  focusedField: SetField | null;
  /** This exercise is clock-driven: render the ▶. */
  isTimed?: boolean;
  /** The clock is running for THIS set. */
  isTiming?: boolean;
  /** The gym's plates, from Settings — a stable store reference (this is memoized). */
  availablePlatesKg?: readonly number[];
  onFocusField: (field: SetField) => void;
  onToggleComplete: () => void;
  /** Start the clock, or — while it runs — stop it and log what it read. */
  onPressTimer?: () => void;
  /**
   * EDIT MODE. Present = the row is drawn as `⋮⋮ | set | weight | reps | −`: the
   * grip takes the W toggle's slot, the `−` (`RemoveRowButton`) takes the ✓'s, and
   * the `−` removes THIS row. Absent everywhere outside edit mode.
   */
  onRemove?: () => void;
  /**
   * Edit mode's grip, when the card implements drag-to-reorder: a long press on
   * the ⋮⋮ calls this. Absent = the grip is drawn as a mark only. Ignored outside
   * edit mode.
   */
  onGripLongPress?: () => void;
  /**
   * Replaces the default ⋮⋮ entirely, for a card whose drag needs its own
   * responder on the handle (a PanResponder, a gesture-handler view). It is drawn
   * in the 30 dp slot as given. Ignored outside edit mode.
   */
  grip?: ReactNode;
  /** Open `SetMarksSheet` — the set well's tap. Absent = the well is a label. */
  onOpenMarks?: () => void;
  /**
   * Flip this row between warm-up and working — the `W` toggle. Present only where
   * the answer can still be yes (`warmupToggleRows`); absent draws the spacer.
   */
  onToggleWarmup?: () => void;
}

function SetRowComponent({
  set,
  workingNumber,
  position,
  exercise,
  unitSystem,
  isUpNext = false,
  focusedField,
  isTimed = false,
  isTiming = false,
  availablePlatesKg,
  onFocusField,
  onToggleComplete,
  onPressTimer,
  onRemove,
  onGripLongPress,
  grip,
  onOpenMarks,
  onToggleWarmup,
}: SetRowProps) {
  const t = useT();
  const lang = useLanguage();
  const done = set.isCompleted;
  const editing = onRemove != null;
  const kind = setKindOf(set);
  /*
   * THE MOMENT A SET IS LOGGED, as opposed to the fact that it is: the pop and the
   * flash are keyed on the transition, so a row that mounts logged renders at rest.
   */
  const wasDone = useRef(done);
  const [loggedAt, setLoggedAt] = useState<number | null>(null);
  useEffect(() => {
    if (done && !wasDone.current) setLoggedAt(Date.now());
    if (!done) setLoggedAt(null);
    wasDone.current = done;
  }, [done]);
  /* A logged set is not "up next" however the card labels it. */
  const lit = isUpNext && !done;
  const countsMax = showsMaxLabel(exercise, set);
  const chip =
    set.rir != null && effortApplies(exercise.countUnit) && !countsMax
      ? rirChipLabel(set.rir)
      : null;
  /*
   * The states table: logged and lit read full ink at 700; an un-logged row reads
   * muted at 600 — except a value the user has already changed from the carried
   * one, which is a fact now and reads ink (still 600, still not logged).
   */
  const strong = done || lit;
  const valueColor = strong || !set.isPrefilled ? palette.ink : palette.inkMuted;
  const valueStyle = {
    fontSize: valueFontSize(set.isWarmup),
    fontWeight: strong ? ('700' as const) : ('600' as const),
    color: valueColor,
  };

  /* Null — no line — for a machine, an empty weight, or a target the plates cannot make. */
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

  const weightText = formatWeight(set.weightKg, unitSystem, exercise.loadMode);
  const weightUnit = unitLabel(unitSystem, lang);
  const countText = countsMax
    ? maxLabel(lang).toUpperCase()
    : formatCount(set.count, exercise.countUnit);
  const countUnit = countsMax ? '' : countUnitLabel(exercise.countUnit, lang);

  const rowStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: SET_ROW.height,
    gap: SET_ROW.gap,
    borderRadius: ROW_RADIUS,
    borderWidth: 1,
    borderColor: lit ? tint(0.45) : 'transparent',
    backgroundColor: lit ? tint(0.07) : 'transparent',
  };

  return (
    <View>
      <View style={rowStyle}>
        {/* The flash. First child so everything paints over it; it takes nothing. */}
        {loggedAt != null ? <Flash key={loggedAt} radius={ROW_RADIUS} /> : null}

        {/* THE LEAD COLUMN, 80 dp whatever is in it: toggle / grip / spacer, 6, set well. */}
        <View style={{ width: SET_ROW.toggle, alignItems: 'center' }}>
          {editing ? (
            (grip ?? <Grip onLongPress={onGripLongPress} />)
          ) : onToggleWarmup ? (
            <WarmupToggle on={set.isWarmup} position={position} onPress={onToggleWarmup} />
          ) : null}
        </View>
        <SetWell kind={kind} workingNumber={workingNumber} lit={lit} onPress={onOpenMarks} />

        {exercise.requiresWeight ? (
          <ValueWell
            onPress={() => onFocusField('weight')}
            lit={focusedField === 'weight'}
            emphasis={lit}
            style={WELL_STYLE}
            accessibilityLabel={t('Weight {weight} {unit}', {
              weight: weightText,
              unit: weightUnit,
            })}
          >
            <WellValue value={weightText} style={valueStyle}>
              <Unit text={weightUnit} />
            </WellValue>
          </ValueWell>
        ) : null}

        {/* Reps / rounds / minutes / metres. With no weight it takes both columns. */}
        <ValueWell
          onPress={() => onFocusField('count')}
          lit={focusedField === 'count'}
          emphasis={lit}
          style={WELL_STYLE}
          accessibilityLabel={`${countsMax ? maxLabel(lang) : `${set.count} ${countUnit}`}${
            chip && set.rir != null ? `, ${describeRir(set.rir, lang)}` : ''
          }`}
        >
          <WellValue value={countText} style={valueStyle}>
            {chip ? <RirChip label={chip} /> : countUnit ? <Unit text={countUnit} /> : null}
          </WellValue>
        </ValueWell>

        {/* Run the clock: timed work only, until logged, and not while editing. */}
        {isTimed && !done && !editing ? (
          <Pressable
            onPress={() => {
              tap();
              onPressTimer?.();
            }}
            accessibilityRole="button"
            accessibilityLabel={
              isTiming
                ? t('Stop the timer and log this set')
                : t('Start the {count} timer', {
                    count: formatCount(set.count, exercise.countUnit),
                  })
            }
            style={{
              width: SET_ROW.logCircle,
              height: SET_ROW.logCircle,
              borderRadius: 9999,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: isTiming ? 0 : 1,
              borderColor: palette.hairline,
              backgroundColor: isTiming ? palette.acc : 'transparent',
            }}
          >
            <Icon name="play" size={16} color={isTiming ? palette.onAcc : palette.acc} />
          </Pressable>
        ) : null}

        {/* THE LOG COLUMN, 48: the ✓, or edit mode's `−` in its place. */}
        <View style={{ width: SET_ROW.log, alignItems: 'center' }}>
          {editing ? (
            <RemoveRowButton onPress={onRemove} accessibilityLabel={t('Remove this set')} />
          ) : (
            <Pressable
              onPress={handleComplete}
              hitSlop={4}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: done }}
              accessibilityLabel={done ? t('Undo set') : t('Complete set')}
              style={{
                width: SET_ROW.logCircle,
                height: SET_ROW.logCircle,
                borderRadius: 9999,
                alignItems: 'center',
                justifyContent: 'center',
                // Un-logged: a hairline ring. Lit and logged are fills, no ring.
                borderWidth: lit || done ? 0 : 1,
                borderColor: palette.hairline,
                backgroundColor: lit ? palette.acc : 'transparent',
              }}
            >
              {done ? (
                /* The soft fill, caught: it pops in when THIS tap logged it. */
                loggedAt != null ? (
                  <Pop key={loggedAt} duration={360} style={DONE_FILL}>
                    <Icon name="check" size={20} color={palette.acc} />
                  </Pop>
                ) : (
                  <View style={DONE_FILL}>
                    <Icon name="check" size={20} color={palette.acc} />
                  </View>
                )
              ) : (
                <Icon name="check" size={20} color={lit ? palette.onAcc : palette.inkMuted} />
              )}
            </Pressable>
          )}
        </View>
      </View>

      {/* Reference, not a control: under the weight well's left edge. */}
      {plateLabel && exercise.requiresWeight ? (
        <Text
          numberOfLines={1}
          className="text-[12.5px] tabular-nums text-ink-faint"
          style={{ marginLeft: 1 + SET_ROW.lead + SET_ROW.gap + SET_ROW.wellPadding }}
          accessibilityLabel={t('On the bar: {plates} kilograms', { plates: plateLabel })}
        >
          {plateLabel}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The set well: 44 × 40, the number (or the type's letter) and a ▾.
 *
 * Letters are muted for a warm-up (a set that does not count) and green for drop /
 * failure / AMRAP (working sets of a particular kind); a number is muted, and ink
 * on the lit row, where it is the label of the numbers about to be lifted.
 */
function SetWell({
  kind,
  workingNumber,
  lit,
  onPress,
}: {
  kind: SetKind;
  workingNumber: number | null;
  lit: boolean;
  onPress?: () => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const badge = kindBadge(kind);
  const label =
    workingNumber == null
      ? kindName(kind, lang)
      : kind === 'working'
        ? t('Set {n}', { n: workingNumber })
        : t('Set {n}, {kind}', { n: workingNumber, kind: kindName(kind, lang) });
  const color = badge && kind !== 'warmup' ? palette.acc : lit ? palette.ink : palette.inkMuted;
  return (
    <ValueWell
      width={SET_ROW.setWell}
      onPress={onPress}
      emphasis={lit}
      style={{ paddingHorizontal: 4 }}
      accessibilityLabel={label}
      accessibilityHint={onPress ? t('Opens the set type and reps in reserve') : undefined}
    >
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        className="tabular-nums"
        style={{ fontSize: 17, fontWeight: '700', color }}
      >
        {setWellFace(kind, workingNumber)}
      </Text>
      {onPress ? (
        <View style={{ marginLeft: 2 }}>
          <Icon name="chevron-down" size={10} color={palette.inkMuted} />
        </View>
      ) : null}
    </ValueWell>
  );
}

/**
 * The `W` toggle: a 30 dp rounded square. Off, a dashed muted outline and a muted
 * W — present, but plainly not on; on, solid `acc` with the W in ink-on-acc. The
 * hit area reaches 44 through `hitSlop`, so the slot stays 30 and the weight well
 * does not move.
 */
function WarmupToggle({
  on,
  position,
  onPress,
}: {
  on: boolean;
  position: number;
  onPress: () => void;
}) {
  const t = useT();
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      hitSlop={7}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={t('Mark set {n} as warm-up', { n: position })}
      style={{
        width: SET_ROW.toggle,
        height: SET_ROW.toggle,
        borderRadius: 9,
        borderWidth: on ? 0 : 1.5,
        borderStyle: on ? 'solid' : 'dashed',
        borderColor: palette.inkMuted,
        backgroundColor: on ? palette.acc : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        allowFontScaling={false}
        style={{ fontSize: 13, fontWeight: '800', color: on ? palette.onAcc : palette.inkMuted }}
      >
        W
      </Text>
    </Pressable>
  );
}

/**
 * Edit mode's ⋮⋮ — the visible twin of the drag (redesign §1). A mark only unless
 * the card wires `onGripLongPress`; 44 tall so it is a real target when it is one.
 */
function Grip({ onLongPress }: { onLongPress?: () => void }) {
  const t = useT();
  const glyph = <Icon name="grip" size={18} color={palette.inkMuted} />;
  if (!onLongPress) {
    return (
      <View
        accessible
        accessibilityLabel={t('Reorder this set')}
        style={{ height: 44, justifyContent: 'center' }}
      >
        {glyph}
      </View>
    );
  }
  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={200}
      hitSlop={{ left: 7, right: 7 }}
      accessibilityRole="button"
      accessibilityLabel={t('Reorder this set')}
      style={{ height: 44, justifyContent: 'center' }}
    >
      {glyph}
    </Pressable>
  );
}

/**
 * A value and whatever rides beside it (a unit, or the `RIR` chip). The numeral
 * shrinks to fit before anything is cropped — the last resort under the width
 * budget `lib/setRowLayout.ts` tests at 360 dp.
 */
function WellValue({
  value,
  style,
  children,
}: {
  value: string;
  style: { fontSize: number; fontWeight: '600' | '700'; color: string };
  children?: ReactNode;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minWidth: 0 }}>
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        className="tabular-nums"
        style={[style, { flexShrink: 1 }]}
      >
        {value}
      </Text>
      {children ? <View style={{ marginLeft: SET_ROW.unitGap }}>{children}</View> : null}
    </View>
  );
}

function Unit({ text }: { text: string }) {
  return (
    <Text
      maxFontSizeMultiplier={1.2}
      numberOfLines={1}
      style={{ fontSize: UNIT_FONT_SIZE, fontWeight: '600', color: palette.inkMuted }}
    >
      {text}
    </Text>
  );
}

/** `RIR 2`: 22 dp, inside the reps well in the unit's place. */
function RirChip({ label }: { label: string }) {
  return (
    <View
      style={{
        height: 22,
        paddingHorizontal: SET_ROW.chipPadding,
        borderRadius: 11,
        borderWidth: 1,
        borderColor: palette.hairline,
        backgroundColor: glass.raised,
        justifyContent: 'center',
      }}
    >
      <Text
        maxFontSizeMultiplier={1.2}
        numberOfLines={1}
        className="tabular-nums"
        style={{ fontSize: UNIT_FONT_SIZE, fontWeight: '600', color: palette.ink }}
      >
        {label}
      </Text>
    </View>
  );
}

/** A set row's corner — the design's 14 for the lit row. */
const ROW_RADIUS = 14;

/** The value wells' tighter padding — see `SET_ROW.wellPadding`. */
const WELL_STYLE = { paddingHorizontal: SET_ROW.wellPadding };

/** The logged mark: the whole circle, `acc`-soft. */
const DONE_FILL: ViewStyle = {
  width: SET_ROW.logCircle,
  height: SET_ROW.logCircle,
  borderRadius: 9999,
  backgroundColor: tint(0.14),
  alignItems: 'center',
  justifyContent: 'center',
};

/**
 * Memoized: an 18-set session renders ~35 rows, and every tick of the rest timer
 * re-renders the screen. Rows must not repaint for someone else's state.
 */
export const SetRow = memo(SetRowComponent);
