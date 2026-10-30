/**
 * QuickAdjust — the inline set editor, opened in place under the tapped row.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ WEIGHT · KG              REPS                │
 *   │ (−2.5) [ 80 ] (+2.5)     (−1) [ 8 ] (+1)     │
 *   │ SET TYPE                                     │
 *   │ (Normal) (W Warm-up) (D Drop set)            │
 *   │ (F To failure) (A As many as possible)       │
 *   │ REPS LEFT (RIR)                              │
 *   │ ( 0 )( 1 )( 2 )( 3 )( 4+ )                   │
 *   │ (   Close   )  ( ✓ Log set )                 │
 *   └──────────────────────────────────────────────┘
 *
 * The 2.9 redesign (#2) made it the whole set, not one number of it:
 *
 *   • BOTH NUMBERS, SIDE BY SIDE. Tapping weight or reps opens the same editor
 *     (that well gets the outline on the row), because "80 for 8 instead of 82.5
 *     for 6" is one correction, not two trips. Each is a 48 dp field between two
 *     46 dp steps; the step is the INCREMENT (`stepperStep` has why), and the field
 *     itself is the way to type an exact number — no separate `Type` button.
 *   • TYPE AND REPS LEFT BEFORE THE ✓, not after. Saying "this one is a warm-up"
 *     or "to failure" is a decision made before the set — and a warm-up said
 *     after the ✓ has already carried its weight down the card (`warmupOffer`).
 *     Reps left is 0 1 2 3 4+, whole reps (`RIR_QUICK`); the full half-step scale
 *     is still the set well's sheet. Tapping the lit grade again takes it back.
 *   • `Log set` IS THE WAY OUT THAT FINISHES THE JOB. The ✓ on the row does the
 *     same; this is the same act at the bottom of the thing you were just using.
 *     On a set already logged it reads `Done` and only closes. `Close` leaves
 *     everything as it is now — edits apply live, so there is nothing to cancel.
 *
 * WHAT LEFT: `Remove set` (edit mode's `−` on every row is the place for it now)
 * and `Type` (the value field). Nothing is snapped to a grid: 16.5 kg stays 16.5.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Pressable } from './Pressable';

import { useRevealOnFocus } from './KeyboardAware';
import { commit, tap } from '../lib/feedback';
import type { DraftSet } from '../lib/draft';
import type { Exercise, UnitSystem } from '../types/models';
import { nudgeSet } from '../lib/setNudge';
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
import { describeRir, effortApplies } from '../lib/effort';
import { SET_KINDS, kindBadge, kindChipLabel, setKindOf, type SetKind } from '../lib/setType';
import { RIR_QUICK, rirQuickLabel, rirQuickSelected, stepperStep } from '../lib/setRowLayout';
import { useLanguage, useT } from '../hooks/useT';
import { glass, palette, tint } from '../theme/tokens';
import { GradientFill, Kicker } from './primitives';
import { Icon } from './Icon';

interface QuickAdjustProps {
  /** The well that was tapped — its stepper takes a typed value first. */
  field: SetField;
  set: DraftSet;
  exercise: Exercise;
  unitSystem: UnitSystem;
  onChange: (patch: Partial<DraftSet>) => void;
  onClose: () => void;
  /** Log the set (the row's ✓). Absent on a logged set is fine: it reads `Done`. */
  onLog: () => void;
  /** Change the set's type — through the store's `markSet`, warm-up offer and all. */
  onKind?: (kind: SetKind) => void;
  /** Grade it, or take the grade back (`null`). */
  onRir?: (rir: number | null) => void;
}

export function QuickAdjust({
  field,
  set,
  exercise,
  unitSystem,
  onChange,
  onClose,
  onLog,
  onKind,
  onRir,
}: QuickAdjustProps) {
  const t = useT();
  const lang = useLanguage();
  const kind = setKindOf(set);
  const [typing, setTyping] = useState<SetField | null>(null);
  const [buffer, setBuffer] = useState('');
  const inputRef = useRef<TextInput>(null);
  const reveal = useRevealOnFocus();
  const isTimeCount = exercise.countUnit === 'seconds' || exercise.countUnit === 'rounds';

  useEffect(() => {
    if (typing) inputRef.current?.focus();
  }, [typing]);

  /*
   * THE NUMBER MOVED UNDER THE BOX — focus mode, an AI edit, the other stepper's
   * carry. What was typed was typed against the old number, so the box goes.
   */
  const valueKey = typing ? editorValueKey(set, typing) : '';
  const watched = useRef<{ field: SetField | null; key: string }>({ field: typing, key: valueKey });
  useEffect(() => {
    const before = watched.current;
    watched.current = { field: typing, key: valueKey };
    // Only the SAME field's number moving counts; switching fields is not a change.
    if (before.field != null && before.field === typing && before.key !== valueKey) {
      setTyping(null);
      setBuffer('');
    }
  }, [typing, valueKey]);

  const commitTyped = () => {
    if (typing === 'weight') {
      const parsed = Number(buffer.replace(',', '.'));
      if (!Number.isNaN(parsed) && buffer.trim() !== '') {
        onChange({ weightKg: unitSystem === 'imperial' ? lbToKg(parsed) : parsed });
      }
    } else if (typing === 'count') {
      // In the unit the field shows — minutes on a timed one. See `parseCountInput`.
      const count = parseCountInput(buffer, exercise.countUnit);
      if (count != null) onChange({ count });
    }
    setTyping(null);
    setBuffer('');
  };

  /** One step. A step pressed mid-type takes what was typed first (`chipPress`). */
  const bump = (target: SetField, delta: number) => {
    tap();
    const press = chipPress(typing === target, typing === target ? buffer : '');
    if (press.kind === 'commit-typed') {
      commitTyped();
      return;
    }
    if (typing) commitTyped();
    onChange(nudgeSet(set, target, delta, unitSystem));
  };

  const countsMax = showsMaxLabel(exercise, set);
  const weightStep = stepperStep('weight', exercise, unitSystem);
  const countStepSize = stepperStep('count', exercise, unitSystem);
  const countLabel =
    exercise.countUnit === 'reps' ? t('Reps') : countUnitLabel(exercise.countUnit, lang);
  const rirSelected = rirQuickSelected(set.rir);

  const field48 = (target: SetField) => {
    const isWeight = target === 'weight';
    const shown = isWeight
      ? formatWeight(set.weightKg, unitSystem, exercise.loadMode)
      : countsMax
        ? maxLabel(lang).toUpperCase()
        : formatCount(set.count, exercise.countUnit);
    if (typing === target) {
      return (
        <TextInput
          ref={inputRef}
          value={buffer}
          onChangeText={setBuffer}
          onFocus={reveal}
          onBlur={commitTyped}
          onSubmitEditing={commitTyped}
          keyboardType={isWeight || isTimeCount ? 'decimal-pad' : 'number-pad'}
          selectTextOnFocus
          placeholder={shown}
          placeholderTextColor={palette.inkFaint}
          accessibilityLabel={t('Type an exact value')}
          style={[FIELD, { color: palette.ink, borderColor: tint(0.45) }]}
          className="text-center text-[19px] font-bold tabular-nums"
        />
      );
    }
    return (
      <Pressable
        onPress={() => {
          tap();
          if (typing) commitTyped();
          setBuffer('');
          setTyping(target);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${shown}. ${t('Type an exact value')}`}
        style={[FIELD, { borderColor: target === field ? tint(0.45) : palette.hairline }]}
      >
        <Text
          maxFontSizeMultiplier={1.2}
          numberOfLines={1}
          adjustsFontSizeToFit
          className="text-[19px] font-bold tabular-nums text-ink"
        >
          {shown}
        </Text>
      </Pressable>
    );
  };

  return (
    // A well inside the exercise card, under the row it edits.
    <View
      className="mt-[6px] p-md"
      style={{
        borderRadius: 18,
        backgroundColor: 'rgba(6,8,7,0.35)',
        borderWidth: 1,
        borderColor: 'rgba(236,241,238,0.06)',
      }}
    >
      {/* THE TWO STEPPERS, side by side. With no weight the count has the row. */}
      <View className="flex-row" style={{ gap: 10 }}>
        {exercise.requiresWeight ? (
          <Stepper
            label={`${t('Weight')} · ${unitLabel(unitSystem, lang)}`}
            step={weightStep}
            onStep={(d) => bump('weight', d)}
          >
            {field48('weight')}
          </Stepper>
        ) : null}
        <Stepper
          label={countLabel}
          step={countStepSize}
          timeBased={isTimeCount}
          onStep={(d) => bump('count', d)}
        >
          {field48('count')}
        </Stepper>
      </View>

      {onKind ? (
        <View className="mt-md">
          <Kicker>{t('Set type')}</Kicker>
          <View className="mt-sm flex-row flex-wrap" style={{ gap: 6 }}>
            {SET_KINDS.map((option) => {
              const selected = option === kind;
              const badge = kindBadge(option);
              const label = kindChipLabel(option, lang);
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    tap();
                    if (!selected) onKind(option);
                  }}
                  hitSlop={{ top: 2, bottom: 2 }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={label}
                  style={({ pressed }) => [
                    CHIP,
                    selected
                      ? { backgroundColor: tint(0.14), borderColor: tint(0.45) }
                      : { backgroundColor: glass.sunken, borderColor: palette.hairline },
                    pressed ? { opacity: 0.7 } : null,
                  ]}
                >
                  {badge ? (
                    <Text
                      maxFontSizeMultiplier={1.2}
                      style={{
                        fontSize: 13,
                        fontWeight: '800',
                        color: selected ? palette.acc : palette.inkMuted,
                      }}
                    >
                      {badge}
                    </Text>
                  ) : null}
                  <Text
                    maxFontSizeMultiplier={1.2}
                    className={[
                      'text-label',
                      selected ? 'font-semibold text-acc' : 'font-medium text-ink-muted',
                    ].join(' ')}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {onRir && effortApplies(exercise.countUnit) ? (
        <View className="mt-md">
          <Kicker>{t('Reps left (RIR)')}</Kicker>
          <View className="mt-sm flex-row" style={{ gap: 6 }}>
            {RIR_QUICK.map((value) => {
              const selected = rirSelected === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => {
                    tap();
                    onRir(selected ? null : value);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={describeRir(value, lang)}
                  style={({ pressed }) => [
                    RIR_CHIP,
                    selected
                      ? { backgroundColor: tint(0.14), borderColor: tint(0.45) }
                      : { backgroundColor: glass.sunken, borderColor: palette.hairline },
                    pressed ? { opacity: 0.7 } : null,
                  ]}
                >
                  <Text
                    maxFontSizeMultiplier={1.2}
                    className={[
                      'text-label font-semibold tabular-nums',
                      selected ? 'text-acc' : 'text-ink',
                    ].join(' ')}
                  >
                    {rirQuickLabel(value)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Close (ghost) and the one green thing here: Log set. */}
      <View className="mt-md flex-row" style={{ gap: 8 }}>
        <Pressable
          onPress={() => {
            // Commit BEFORE closing: closing unmounts the field, and an unmounted
            // input's blur — the only other commit — never runs.
            if (typing) commitTyped();
            onClose();
          }}
          accessibilityRole="button"
          accessibilityLabel={t('Close')}
          style={({ pressed }) => [
            BUTTON,
            { borderWidth: 1, borderColor: palette.hairline, backgroundColor: glass.sunken },
            pressed ? { opacity: 0.7 } : null,
          ]}
        >
          <Text maxFontSizeMultiplier={1.2} className="text-label font-semibold text-ink">
            {t('Close')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (typing) commitTyped();
            if (set.isCompleted) {
              tap();
              onClose();
              return;
            }
            commit();
            onLog();
          }}
          accessibilityRole="button"
          accessibilityLabel={set.isCompleted ? t('Done') : t('Log set')}
          style={({ pressed }) => [
            BUTTON,
            { overflow: 'hidden', flexDirection: 'row', gap: 6 },
            pressed ? { opacity: 0.85 } : null,
          ]}
        >
          <GradientFill />
          <Icon name="check" size={18} color={palette.onAcc} />
          <Text
            maxFontSizeMultiplier={1.2}
            numberOfLines={1}
            style={{ color: palette.onAcc, fontSize: 15, fontWeight: '700' }}
          >
            {set.isCompleted ? t('Done') : t('Log set')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** `LABEL` over `(−step) [field] (+step)`: 46 dp steps around the 48 dp field. */
function Stepper({
  label,
  step,
  timeBased = false,
  onStep,
  children,
}: {
  label: string;
  step: number;
  timeBased?: boolean;
  onStep: (delta: number) => void;
  children: ReactNode;
}) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Kicker>{label}</Kicker>
      <View className="mt-xs flex-row items-center" style={{ gap: 4 }}>
        <StepButton label={formatStep(-step, timeBased)} onPress={() => onStep(-step)} />
        <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
        <StepButton label={formatStep(step, timeBased)} onPress={() => onStep(step)} />
      </View>
    </View>
  );
}

function StepButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        {
          width: 46,
          height: 46,
          borderRadius: 23,
          borderWidth: 1,
          borderColor: palette.hairline,
          backgroundColor: glass.raised,
          alignItems: 'center',
          justifyContent: 'center',
        },
        pressed ? { opacity: 0.7 } : null,
      ]}
    >
      <Text
        maxFontSizeMultiplier={1.2}
        numberOfLines={1}
        adjustsFontSizeToFit
        // Never below the 12.5 px floor, however long the step label gets.
        minimumFontScale={12.5 / 13}
        className="text-[13px] font-semibold tabular-nums text-ink"
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * "+2.5" / "−1" — a real minus sign (U+2212), so it optically matches the plus.
 * A time step reads as seconds: "+15s".
 */
function formatStep(delta: number, timeBased: boolean): string {
  const rounded = Number(delta.toFixed(2));
  const body = `${Math.abs(rounded)}${timeBased ? 's' : ''}`;
  return rounded < 0 ? `−${body}` : `+${body}`;
}

const FIELD = {
  height: 48,
  borderRadius: 11,
  borderWidth: 1,
  backgroundColor: glass.sunken,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  paddingHorizontal: 4,
};

const CHIP = {
  height: 40,
  paddingHorizontal: 12,
  borderRadius: 9999,
  borderWidth: 1,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 6,
};

const RIR_CHIP = {
  flex: 1,
  height: 44,
  borderRadius: 12,
  borderWidth: 1,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};

const BUTTON = {
  flex: 1,
  height: 48,
  borderRadius: 9999,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};
