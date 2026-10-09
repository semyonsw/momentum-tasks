/**
 * QuickAdjust — the inline value editor, opened directly under the tapped row.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │  −2   −0.5      42.5 KG      +0.5   +2       │
 *   │  Type    Warm-up    Remove set       Done    │
 *   └──────────────────────────────────────────────┘
 *
 * This is where the tap-count promise is proven. One tap logs an unchanged set
 * (the ✓). THREE taps log 2 kg heavier: the weight cell, `+2`, the ✓.
 *
 * Why not a keyboard? Because the gym case is "same as last time, plus one
 * plate". Four chips beat eleven keys, work with sweaty thumbs, and never cover
 * the row being edited. `Type` is still there for the case where a number
 * changes wholesale — the only path to a keyboard inside a session.
 *
 * WEIGHT STEPS BY ±0.5 AND ±2, EVERYWHERE (see `weightSteps`). Not by the
 * exercise's own increment, which is a progression plan rather than a thumb
 * gesture: reading the chips off a 2.5 kg increment offered ±5 where nobody
 * wanted it and made every half-kilo — the small disc on a dumbbell, the change
 * plate on a bar — unreachable. Nothing is snapped to a grid either, so 16.5 kg
 * stays 16.5 rather than being rounded to something "loadable" by a machine the
 * app has never seen. There is no Cancel: edits are applied live, and `Done`
 * only closes the panel.
 *
 * WARM-UP LIVES HERE, as a chip beside `Remove set`, because this panel already IS
 * the set-row editor and a flag on a set does not earn a surface of its own.
 * `isWarmup` has been on both `DraftSet` and `SetHistory` since the first release,
 * with two consumers filtering on it — the overload engine and the shorthand — and
 * nothing anywhere able to set it. That is worse than a missing feature: a light
 * warm-up rendered as a drop-set group in the history line, and a heavy warm-up
 * single was read as the session's TOP WORKING WEIGHT and drove a nudge off a set
 * the user never worked at.
 *
 * The label says what tapping it will do, not what the set currently is:
 * `Warm-up` on a working set, `Working set` on a warm-up. It is green-bright in the
 * second case because green means "this is on" everywhere else in the app.
 *
 * EFFORT (RIR) has a row of its own under them, on a logged rep set only: the
 * door to `SetMarksSheet`, labelled with the grade when there is one. It is the
 * one way to a FIRST grade — the set row draws its chip only once one exists.
 */

import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { tap } from '../lib/feedback';
import type { DraftSet } from '../lib/draft';
import type { Exercise, UnitSystem } from '../types/models';
import { nudgeSet, nudgeSteps } from '../lib/setNudge';
import { chipPress, editorValueKey } from '../lib/inlineEditor';
import { maxLabel, showsMaxLabel } from '../lib/maxReps';
import {
  countUnitLabel,
  formatCount,
  formatWeight,
  lbToKg,
  parseCountInput,
  unitLabel,
} from '../lib/units';
import type { SetField } from './SetRow';
import { describeRir, effortApplies, rirChipLabel } from '../lib/effort';
import { useLanguage, useT } from '../hooks/useT';
import { palette } from '../theme/tokens';

interface QuickAdjustProps {
  field: SetField;
  set: DraftSet;
  exercise: Exercise;
  unitSystem: UnitSystem;
  onChange: (patch: Partial<DraftSet>) => void;
  onClose: () => void;
  onRemoveSet: () => void;
  /** Open `SetMarksSheet` — the `RIR` door below. Absent = no door. */
  onOpenMarks?: () => void;
}

export function QuickAdjust({
  field,
  set,
  exercise,
  unitSystem,
  onChange,
  onClose,
  onRemoveSet,
  onOpenMarks,
}: QuickAdjustProps) {
  const t = useT();
  const lang = useLanguage();
  const [typing, setTyping] = useState(false);
  const [buffer, setBuffer] = useState('');
  const inputRef = useRef<TextInput>(null);

  const isWeight = field === 'weight';
  /** A clock cell: typed as minutes, so it needs the decimal point. */
  const isTimeCount = exercise.countUnit === 'seconds' || exercise.countUnit === 'rounds';
  /*
   * Chips are expressed in the user's own units; kg is the storage unit only.
   * Weight has its own pair of steps (±0.5 / ±2); a count keeps the doubling
   * pattern off its unit's natural step — one rep and two, fifteen seconds and
   * thirty.
   */
  const { fine, coarse } = nudgeSteps(field, exercise.countUnit, unitSystem);
  const chips = [-coarse, -fine, fine, coarse];

  /* `MAX` while the counter is still at zero, here as on the row this panel
     opened under: the two must not disagree about the same cell. */
  const countsMax = !isWeight && showsMaxLabel(exercise, set);
  const displayValue = isWeight
    ? formatWeight(set.weightKg, unitSystem, exercise.loadMode)
    : countsMax
      ? maxLabel(lang).toUpperCase()
      : formatCount(set.count, exercise.countUnit);
  const displayUnit = isWeight
    ? unitLabel(unitSystem, lang)
    : countsMax
      ? ''
      : countUnitLabel(exercise.countUnit, lang);

  useEffect(() => {
    if (typing) inputRef.current?.focus();
  }, [typing]);

  /*
   * THE NUMBER MOVED UNDER THE BOX — focus mode's ±, its DONE, an AI edit. What
   * was typed was typed against the old number, so the box goes rather than
   * standing there with a stale value in it. See `lib/inlineEditor.ts`.
   */
  const valueKey = editorValueKey(set, field);
  const lastValueKey = useRef(valueKey);
  useEffect(() => {
    if (lastValueKey.current === valueKey) return;
    lastValueKey.current = valueKey;
    setTyping(false);
    setBuffer('');
  }, [valueKey]);

  /**
   * Apply a relative nudge — the arithmetic lives in `lib/setNudge.ts`.
   *
   * Extracted when focus mode grew the same chips at four times the size: which
   * steps, whose units, what is clamped and what is deliberately NOT snapped are
   * four decisions, and two screens holding their own copy of them is two screens
   * that will eventually disagree about a half-kilo.
   */
  const bump = (delta: number) => {
    tap();
    // A chip tapped mid-type takes what was typed first. The session list keeps
    // the keyboard up across taps, so the field's blur never ran and the typed
    // number was thrown away under a nudge of the old one. With NOTHING typed the
    // chip still nudges: swallowing it is the "press + then −" bug.
    const press = chipPress(typing, buffer);
    if (press.kind === 'commit-typed') {
      commitTyped();
      return;
    }
    if (press.closeTyping) {
      setTyping(false);
      setBuffer('');
    }
    onChange(nudgeSet(set, field, delta, unitSystem));
  };

  const commitTyped = () => {
    if (isWeight) {
      const parsed = Number(buffer.replace(',', '.'));
      if (!Number.isNaN(parsed) && buffer.trim() !== '') {
        onChange({ weightKg: unitSystem === 'imperial' ? lbToKg(parsed) : parsed });
      }
    } else {
      // In the unit the cell shows — minutes on a timed one. See `parseCountInput`.
      const count = parseCountInput(buffer, exercise.countUnit);
      if (count != null) onChange({ count });
    }
    setTyping(false);
    setBuffer('');
  };

  return (
    // A WELL inside the exercise card (Momentum v3): the rows are pills now,
    // so the editor under one is a rounded inset rather than a full-bleed band.
    <View
      className="mt-[6px] p-md"
      style={{
        borderRadius: 18,
        backgroundColor: 'rgba(6,8,7,0.35)',
        borderWidth: 1,
        borderColor: 'rgba(236,241,238,0.06)',
      }}
    >
      <View className="flex-row items-center justify-between">
        {/* subtract chips */}
        <View className="flex-row">
          {chips
            .filter((c) => c < 0)
            .map((delta, i) => (
              <Chip
                key={delta}
                label={formatDelta(delta, exercise, isWeight)}
                first={i === 0}
                onPress={() => bump(delta)}
              />
            ))}
        </View>

        {/* the live value — Display size, because it is the thing being changed */}
        {typing ? (
          <TextInput
            ref={inputRef}
            value={buffer}
            onChangeText={setBuffer}
            onBlur={commitTyped}
            onSubmitEditing={commitTyped}
            keyboardType={isWeight || isTimeCount ? 'decimal-pad' : 'number-pad'}
            selectTextOnFocus
            placeholder={displayValue}
            placeholderTextColor={palette.inkFaint}
            className="mx-xs min-w-[110px] text-center text-display font-semibold tabular-nums text-ink"
          />
        ) : (
          <View className="mx-xs flex-row items-baseline">
            <Text className="text-display font-semibold tabular-nums text-ink">{displayValue}</Text>
            <Text className="ml-xs text-micro font-semibold uppercase text-ink-faint">
              {displayUnit}
            </Text>
          </View>
        )}

        {/* add chips */}
        <View className="flex-row">
          {chips
            .filter((c) => c > 0)
            .map((delta, i) => (
              <Chip
                key={delta}
                label={formatDelta(delta, exercise, isWeight)}
                first={i === 0}
                onPress={() => bump(delta)}
              />
            ))}
        </View>
      </View>

      {/* Secondary actions, spread apart so no two are one mis-tap from each
          other. `Done` is the only green thing here — it is the way out. */}
      <View className="mt-md flex-row items-center justify-between">
        <Pressable
          onPress={() => setTyping(true)}
          hitSlop={8}
          className="h-hit justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('Type an exact value')}
        >
          <Text className="text-label font-medium text-ink-muted">{t('Type')}</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            tap();
            onChange({ isWarmup: !set.isWarmup });
          }}
          hitSlop={8}
          className="h-hit justify-center"
          accessibilityRole="switch"
          accessibilityState={{ checked: set.isWarmup }}
          accessibilityLabel={
            set.isWarmup ? t('Make this a working set') : t('Mark this set as a warm-up')
          }
        >
          <Text
            className={[
              'text-label font-medium',
              set.isWarmup ? 'text-acc' : 'text-ink-muted',
            ].join(' ')}
          >
            {set.isWarmup ? t('Working set') : t('Warm-up')}
          </Text>
        </Pressable>

        <Pressable
          onPress={onRemoveSet}
          hitSlop={8}
          className="h-hit justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('Remove set')}
        >
          <Text className="text-label font-medium text-ink-muted">{t('Remove set')}</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            // Commit BEFORE closing: closing unmounts the field, and its blur —
            // the only other commit — does not run for an unmounted input, so
            // `82.5`, `Done` used to keep the old weight.
            if (typing) commitTyped();
            onClose();
          }}
          hitSlop={8}
          className="h-hit justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('Done editing')}
        >
          <Text className="text-label font-semibold text-acc">{t('Done')}</Text>
        </Pressable>
      </View>

      {/* EFFORT, on a set that happened and counts reps — the way to a FIRST grade,
          since the row only draws its chip once one exists. A row of its own
          rather than a fifth word in the line above, which is full in Russian. */}
      {onOpenMarks && set.isCompleted && effortApplies(exercise.countUnit) ? (
        <View className="mt-sm flex-row items-center justify-between">
          <Text maxFontSizeMultiplier={1.3} className="text-label text-ink-muted">
            {t('Reps in reserve')}
          </Text>
          <Pressable
            onPress={() => {
              tap();
              onOpenMarks();
            }}
            accessibilityRole="button"
            accessibilityLabel={
              set.rir != null ? describeRir(set.rir, lang) : t('Add reps in reserve')
            }
            className="h-[48px] min-w-[72px] items-center justify-center rounded-pill border border-hairline bg-ink/5 px-md"
          >
            <Text
              maxFontSizeMultiplier={1.3}
              className={[
                'text-label font-semibold tabular-nums',
                set.rir != null ? 'text-ink' : 'text-acc',
              ].join(' ')}
            >
              {set.rir != null ? rirChipLabel(set.rir) : '+ RIR'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/** 44 high, 46 wide minimum — a thumb target, not a decoration. */
function Chip({ label, first, onPress }: { label: string; first: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={[
        'h-hit min-w-[46px] items-center justify-center rounded-pill border border-hairline bg-ink/5 px-sm',
        first ? '' : 'ml-sm',
      ].join(' ')}
    >
      <Text className="text-label font-medium tabular-nums text-ink">{label}</Text>
    </Pressable>
  );
}

/**
 * "+2.5" / "−5" — a real minus sign (U+2212), not a hyphen, so it optically
 * matches the plus at the same size. Time steps read as seconds: "+15s".
 */
function formatDelta(delta: number, exercise: Exercise, isWeight: boolean): string {
  const rounded = Number(delta.toFixed(2));
  const timeBased =
    !isWeight && (exercise.countUnit === 'seconds' || exercise.countUnit === 'rounds');
  const body = `${Math.abs(rounded)}${timeBased ? 's' : ''}`;
  return rounded < 0 ? `−${body}` : `+${body}`;
}
