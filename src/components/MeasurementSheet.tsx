/**
 * MeasurementSheet — add or correct one tape-measure reading (W9, design 16).
 *
 *   NEW READING
 *   ( Waist )( Hips )( Chest )( Arm )( Thigh )( Calf )( Neck )
 *   ( −0.5 )          82.5 cm          ( +0.5 )
 *   ( 1 )( 2 )( 3 ) … ( . )( 0 )( ⌫ )
 *   Date                      5 October   ( − )( + )
 *   [ Save waist ]
 *   Delete this reading…                    ← editing only
 *
 * ± CHIPS FOR THE COMMON CASE, A KEYPAD FOR THE EXACT ONE, and never the phone's
 * keyboard (see `Keypad`). The figure opens on the site's last reading, because
 * a waist measured last week is within a centimetre of this week's; the first key
 * pressed REPLACES it, the way a selected field would, and ± from a typed 82.3
 * lands on the half-unit grid (`stepMeasurement`).
 *
 * THE DATE STEPS BY DAY and stops at today: old notes can go in, a future
 * reading cannot. A day that already has a reading of this site gets REPLACED on
 * save (one per day, `lib/bodyMeasurements.ts`), and the hint says so before it
 * happens rather than after.
 *
 * Editing keeps the site fixed (the title names it): moving a reading to another
 * site is a delete and an add, and a chip row that silently re-files a number is
 * a way to lose one. Delete follows the destructive rule (U19); the confirm is
 * the screen's.
 */

import { useState } from 'react';
import { Text, View } from 'react-native';

import { Keypad } from './Keypad';
import { Sheet, SheetCancel } from './Sheet';
import { BubblePressable } from './bubbles';
import { pressedStyle } from './motion';
import { DangerFootAction, PrimaryButton, SelectChip, StepperRow } from './primitives';
import { useLanguage, useT } from '../hooks/useT';
import {
  cleanCm,
  displayToCm,
  formatLength,
  lengthUnitLabel,
  MEASUREMENT_LIMITS_CM,
  MEASUREMENT_START_CM,
  MEASUREMENT_STEP,
  MEASUREMENTS,
  measurementLabel,
  stepMeasurement,
  type MeasurementKey,
  type MeasurementLog,
} from '../lib/bodyMeasurements';
import { formatLongDay, formatShortDay, shiftDay } from '../lib/days';
import { keypadPress } from '../lib/moneyUnits';
import { glass, radius } from '../theme/tokens';
import type { UnitSystem } from '../types/models';

export interface MeasurementDraft {
  key: MeasurementKey;
  day: string;
  cm: number;
}

export function MeasurementSheet({
  initial,
  editing,
  log,
  unitSystem,
  today,
  onSave,
  onDelete,
  onDismiss,
}: {
  initial: MeasurementDraft;
  /** Correcting an existing reading: the site is fixed and Delete is offered. */
  editing: boolean;
  log: MeasurementLog | undefined;
  unitSystem: UnitSystem;
  today: string;
  onSave: (draft: MeasurementDraft) => void;
  onDelete?: () => void;
  onDismiss: () => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const [key, setKey] = useState<MeasurementKey>(initial.key);
  const [day, setDay] = useState(initial.day);
  const [entry, setEntry] = useState(() => formatLength(initial.cm, unitSystem));
  /** The next key REPLACES the figure: true on open, after ± and after a site change. */
  const [fresh, setFresh] = useState(true);

  const unit = lengthUnitLabel(unitSystem, lang);
  const cm = entry === '' ? undefined : cleanCm(displayToCm(Number(entry), unitSystem));
  const ready = cm != null;
  const taken =
    (!editing || day !== initial.day) && (log?.[key] ?? []).some((row) => row.day === day);

  const pickSite = (next: MeasurementKey) => {
    setKey(next);
    const last = log?.[next]?.[0]?.cm ?? MEASUREMENT_START_CM[next];
    setEntry(formatLength(last, unitSystem));
    setFresh(true);
  };
  const nudge = (direction: 1 | -1) => {
    const from = cm ?? MEASUREMENT_START_CM[key];
    setEntry(formatLength(stepMeasurement(from, direction, unitSystem), unitSystem));
    setFresh(true);
  };
  const press = (pressed: string) => {
    setEntry((current) =>
      fresh && pressed !== 'back' ? keypadPress('', pressed, 1) : keypadPress(current, pressed, 1),
    );
    setFresh(false);
  };
  const stepLabel = MEASUREMENT_STEP.toFixed(1);
  const sameYear = day.slice(0, 4) === today.slice(0, 4);

  return (
    <Sheet title={editing ? measurementLabel(key, lang) : t('New reading')} onDismiss={onDismiss}>
      {editing ? null : (
        <View className="flex-row flex-wrap">
          {MEASUREMENTS.map((site) => (
            <SelectChip
              key={site}
              label={measurementLabel(site, lang)}
              selected={site === key}
              onPress={() => pickSite(site)}
            />
          ))}
        </View>
      )}

      <View
        className="mt-sm flex-row items-center"
        style={{
          gap: 8,
          padding: 8,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: glass.raisedEdge,
          backgroundColor: glass.sunken,
        }}
      >
        <StepChip
          label={`−${stepLabel}`}
          accessibilityLabel={t('Less by {amount}', { amount: `${stepLabel} ${unit}` })}
          onPress={() => nudge(-1)}
        />
        <View
          className="flex-1 flex-row items-baseline justify-center"
          accessible
          accessibilityLabel={`${measurementLabel(key, lang)}: ${entry || '0'} ${unit}`}
        >
          <Text
            maxFontSizeMultiplier={1.3}
            style={{ fontSize: 30 }}
            className={`font-semibold tabular-nums ${fresh ? 'text-ink' : 'text-acc'}`}
          >
            {entry === '' ? '0' : entry}
          </Text>
          <Text maxFontSizeMultiplier={1.3} className="ml-xs text-label text-ink-muted">
            {unit}
          </Text>
        </View>
        <StepChip
          label={`+${stepLabel}`}
          accessibilityLabel={t('More by {amount}', { amount: `${stepLabel} ${unit}` })}
          onPress={() => nudge(1)}
        />
      </View>

      <View className="mt-md">
        <Keypad decimals={1} onPress={press} />
      </View>

      <View className="mt-md">
        <StepperRow
          label={t('Date')}
          hint={
            taken
              ? t('This day already has a reading; saving replaces it.')
              : t('Any past day, so older notes can go in too.')
          }
          value={sameYear ? formatShortDay(day, lang) : formatLongDay(day, lang)}
          onDecrease={() => setDay((current) => shiftDay(current, -1))}
          onIncrease={() => setDay((current) => (current < today ? shiftDay(current, 1) : current))}
        />
      </View>

      <View className="mt-lg">
        <PrimaryButton
          label={
            editing
              ? t('Save changes')
              : t('Save {name}', { name: measurementLabel(key, lang).toLowerCase() })
          }
          onPress={() => {
            if (cm != null) onSave({ key, day, cm });
          }}
        />
        {ready ? null : (
          <Text className="mt-sm text-center text-label text-ink-faint">
            {t('Between {min} and {max} {unit}.', {
              min: formatLength(MEASUREMENT_LIMITS_CM.min, unitSystem),
              max: formatLength(MEASUREMENT_LIMITS_CM.max, unitSystem),
              unit,
            })}
          </Text>
        )}
        <SheetCancel label={t('Cancel')} onDismiss={onDismiss} />
      </View>
      {onDelete ? (
        <DangerFootAction label={t('Delete this reading')} onPress={onDelete} className="mt-md" />
      ) : null}
    </Sheet>
  );
}

/** A 48 dp pill — the same geometry as `PlanFigure`'s. */
function StepChip({
  label,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <BubblePressable
      onPress={onPress}
      radius="pill"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={(state) => [
        pressedStyle(state),
        {
          height: 48,
          paddingHorizontal: 14,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: glass.ghostEdge,
          alignItems: 'center',
          justifyContent: 'center',
        },
      ]}
    >
      <Text
        maxFontSizeMultiplier={1.3}
        style={{ fontSize: 14.5 }}
        className="font-semibold tabular-nums text-ink"
      >
        {label}
      </Text>
    </BubblePressable>
  );
}
