/**
 * BodyScreen — the tape measure beside the scale (W9, design 16).
 *
 *   ‹ BODY MEASUREMENTS
 *   ┌──────────────────────────────────────────────┐
 *   │ Weight                  ╲_╱╲_                │   ← the bodyweight log
 *   │ −7.3 kg since 12 January 2025                │
 *   │ ( − )  ╭      77.2 kg  ✎      ╮  ( + )       │   ← the well: tap to type
 *   │ ╭──────────── Log weight ─────────────╮      │
 *   ├──────────────────────────────────────────────┤
 *   │ Waist                   ╲___       82.5 cm › │   ← tap: opens in place
 *   │ −2.0 cm since 10 August · 8 readings         │
 *   │   5 October       −0.3 cm          82.5      │   ← a reading: tap to correct
 *   │   28 September    −0.2 cm          82.8      │
 *   └──────────────────────────────────────────────┘
 *   ( + Add a reading )
 *
 * ONE ROW PER SITE THAT HAS A READING, each with its own mini line (`Sparkline`,
 * fitted to the site's own range padded by half a unit, so a centimetre reads as
 * a centimetre and not as a cliff). A site nobody measures has no row: the add
 * sheet's chips are where all seven live.
 *
 * A ROW OPENS IN PLACE, the history screen's rule: what you want from a series
 * is one line ("what was it in August"), and a detail route would turn a glance
 * into navigation. Rejected: the design's separate detail screen with a range
 * switch and a full chart — the Graphs view already charts bodyweight, and eight
 * weekly tape readings do not need an axis to read.
 *
 * WEIGHT IS WRITTEN HERE TOO (redesign #14). It used to be read-only here and
 * set only by a coarse `±` in Workout settings → Body — twenty taps to put in a
 * scale reading. Now the value is a large well (with a small pencil) that opens
 * the keypad, `±` nudge it by the fine step, and `Log weight` records it. Every
 * write is `setBodyweightKg`, the same one the settings row uses, which updates
 * the number volume reads AND the dated log together — so it is still one value
 * with one history, now with a door where people look for it. The decisions
 * (where it starts, the step, the clamp) are `lib/weighIn.ts`.
 *
 * Deleting a reading goes through the sheet's `Delete this reading…` and a
 * danger confirm (U19). Nothing here notifies, targets or judges a number.
 */

import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { ConfirmSheet } from '../components/ConfirmSheet';
import { Icon } from '../components/Icon';
import { MeasurementSheet, type MeasurementDraft } from '../components/MeasurementSheet';
import { ScreenHeader } from '../components/ScreenHeader';
import { Sparkline } from '../components/Sparkline';
import { BubblePressable } from '../components/bubbles';
import { pressedStyle } from '../components/motion';
import { NumberSheet } from '../components/NumberSheet';
import { DashedAdd, PrimaryButton, ValueWell } from '../components/primitives';
import { useToday } from '../hooks/useToday';
import { useLanguage, useT } from '../hooks/useT';
import {
  describeMeasurementChange,
  formatLength,
  lengthUnitLabel,
  MEASUREMENT_START_CM,
  MEASUREMENTS,
  measurementLabel,
  measurementSeries,
  readingDelta,
  readingsCount,
  summarizeMeasurement,
  type MeasurementEntry,
  type MeasurementKey,
} from '../lib/bodyMeasurements';
import { dayKey, formatLongDay, formatShortDay } from '../lib/days';
import { tap } from '../lib/feedback';
import { formatWeight, kgToLb, unitLabel } from '../lib/units';
import type { BodyweightEntry } from '../lib/bodyweightLog';
import { useSettings } from '../state/settingsStore';
import { nudgeWeighIn, weighInDisplay, weighInFromDisplay, weighInStart } from '../lib/weighIn';
import type { UnitSystem } from '../types/models';
import { glass, palette, radius } from '../theme/tokens';

export function BodyScreen({ onBack }: { onBack: () => void }) {
  const t = useT();
  const lang = useLanguage();
  const today = useToday();
  const unitSystem = useSettings((s) => s.unitSystem);
  const log = useSettings((s) => s.bodyMeasurements);
  const bodyweightLog = useSettings((s) => s.bodyweightLog);
  const record = useSettings((s) => s.recordMeasurement);
  const remove = useSettings((s) => s.removeMeasurement);

  const [open, setOpen] = useState<MeasurementKey | null>(null);
  const [sheet, setSheet] = useState<{ draft: MeasurementDraft; editing: boolean } | null>(null);
  const [deleting, setDeleting] = useState<{ key: MeasurementKey; day: string } | null>(null);
  const bodyweightKg = useSettings((s) => s.bodyweightKg);
  const setBodyweightKg = useSettings((s) => s.setBodyweightKg);
  /** The weight well's value — a draft until `Log weight`. See `WeightCard`. */
  const [weightDraft, setWeightDraft] = useState(() => weighInStart(bodyweightLog, bodyweightKg));
  const [typingWeight, setTypingWeight] = useState(false);
  const logWeight = (kg: number) => {
    tap();
    setWeightDraft(kg);
    setBodyweightKg(kg);
  };
  /** The site the last reading went to — the add sheet opens on it. */
  const [lastSite, setLastSite] = useState<MeasurementKey>('waist');

  const sites = useMemo(() => MEASUREMENTS.filter((key) => (log?.[key]?.length ?? 0) > 0), [log]);
  const unit = lengthUnitLabel(unitSystem, lang);
  const readings = (n: number) => readingsCount(n, lang);

  const openAdd = () => {
    const key = lastSite;
    const cm = log?.[key]?.[0]?.cm ?? MEASUREMENT_START_CM[key];
    setSheet({ draft: { key, day: today, cm }, editing: false });
  };

  const save = (draft: MeasurementDraft) => {
    const before = sheet;
    setSheet(null);
    if (before?.editing && before.draft.day !== draft.day) remove(draft.key, before.draft.day);
    record(draft.key, draft.day, draft.cm);
    setLastSite(draft.key);
    setOpen(draft.key);
  };

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />
      <ScreenHeader kicker={t('Body measurements')} onBack={onBack} />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text maxFontSizeMultiplier={1.3} className="mx-lg mb-md mt-md text-body text-ink-muted">
          {sites.length > 0
            ? t('Tap a measurement for its readings, and a reading to correct it.')
            : t(
                'Nothing measured yet. Add a reading — waist, chest, arm… — on any date, so older notes can go in too.',
              )}
        </Text>

        <View className="mx-lg" style={{ gap: 8 }}>
          <WeightCard
            log={bodyweightLog}
            unitSystem={unitSystem}
            draft={weightDraft}
            onDraft={setWeightDraft}
            onType={() => setTypingWeight(true)}
            onLog={logWeight}
          />
          {sites.map((key) => {
            const entries = log?.[key] ?? [];
            const summary = summarizeMeasurement(entries);
            if (!summary) return null;
            const isOpen = open === key;
            const values = measurementSeries(entries.slice(0, 12), unitSystem);
            return (
              <View
                key={key}
                style={{
                  borderRadius: radius.row,
                  borderWidth: 1,
                  borderColor: glass.raisedEdge,
                  backgroundColor: glass.raised,
                  overflow: 'hidden',
                }}
              >
                <BubblePressable
                  onPress={() => {
                    tap();
                    setOpen(isOpen ? null : key);
                  }}
                  radius={radius.row}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                  accessibilityLabel={`${measurementLabel(key, lang)}, ${formatLength(summary.latest.cm, unitSystem)} ${unit}. ${describeMeasurementChange(summary, unitSystem, lang)}. ${readings(summary.count)}`}
                  style={(state) => [
                    pressedStyle(state),
                    { minHeight: 72, flexDirection: 'row', alignItems: 'center', padding: 14 },
                  ]}
                >
                  <SeriesRow
                    name={measurementLabel(key, lang)}
                    change={describeMeasurementChange(summary, unitSystem, lang)}
                    count={readings(summary.count)}
                    values={values}
                    value={formatLength(summary.latest.cm, unitSystem)}
                    unit={unit}
                  />
                  <View style={{ transform: [{ rotate: isOpen ? '90deg' : '0deg' }] }}>
                    <Icon name="chevron-right" size={16} color={palette.inkFaint} />
                  </View>
                </BubblePressable>
                {isOpen ? (
                  <ReadingList
                    entries={entries}
                    unit={unit}
                    unitSystem={unitSystem}
                    today={today}
                    onEdit={(entry) =>
                      setSheet({ draft: { key, day: entry.day, cm: entry.cm }, editing: true })
                    }
                  />
                ) : null}
              </View>
            );
          })}
          <DashedAdd label={t('Add a reading')} onPress={openAdd} />
        </View>
      </ScrollView>

      {typingWeight ? (
        <NumberSheet
          title={t('Weight')}
          initial={weighInDisplay(weightDraft, unitSystem)}
          decimal
          confirmLabel={t('Log weight')}
          onConfirm={(value) => {
            setTypingWeight(false);
            logWeight(weighInFromDisplay(value, unitSystem));
          }}
          onCancel={() => setTypingWeight(false)}
        />
      ) : null}

      {sheet ? (
        <MeasurementSheet
          initial={sheet.draft}
          editing={sheet.editing}
          log={log}
          unitSystem={unitSystem}
          today={today}
          onSave={save}
          onDelete={
            sheet.editing
              ? () => {
                  const held = { key: sheet.draft.key, day: sheet.draft.day };
                  setSheet(null);
                  setDeleting(held);
                }
              : undefined
          }
          onDismiss={() => setSheet(null)}
        />
      ) : null}

      {deleting ? (
        <ConfirmSheet
          tone="danger"
          title={t('Delete the {name} reading from {date}?', {
            name: measurementLabel(deleting.key, lang).toLowerCase(),
            date: formatLongDay(deleting.day, lang),
          })}
          body={t('Only this reading goes. The others stay as they are.')}
          confirmLabel={t('Delete it')}
          cancelLabel={t('Keep it')}
          onConfirm={() => {
            const held = deleting;
            setDeleting(null);
            remove(held.key, held.day);
          }}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </View>
  );
}

/**
 * The bodyweight: its line and change, the value as a well, `±`, `Log weight`.
 *
 * The well holds a DRAFT until `Log weight` — nudging past 81.5 on the way to
 * 80.5 should not record 81 and 81.5 as weigh-ins. The keypad is the exception:
 * a typed number is a reading somebody just read off a scale, so its sheet's
 * button is `Log weight` itself rather than a Save that then needs a second tap.
 */
function WeightCard({
  log: bodyweightLog,
  unitSystem,
  draft,
  onDraft,
  onType,
  onLog,
}: {
  log: readonly BodyweightEntry[];
  unitSystem: UnitSystem;
  draft: number;
  onDraft: (update: (kg: number) => number) => void;
  /** The well: open the keypad (the sheet is the screen's, drawn over everything). */
  onType: () => void;
  onLog: (kg: number) => void;
}) {
  const t = useT();
  const lang = useLanguage();

  const toUnit = (kg: number) => (unitSystem === 'imperial' ? kgToLb(kg) : kg);
  const weightUnit = unitLabel(unitSystem, lang);
  const latest = bodyweightLog[0];
  const first = bodyweightLog[bodyweightLog.length - 1];
  let change = t('Nothing logged yet');
  if (latest && first) {
    const delta = Math.round((toUnit(latest.kg) - toUnit(first.kg)) * 10) / 10;
    const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±';
    const firstDay = dayKey(first.at);
    change =
      bodyweightLog.length < 2
        ? t('One reading')
        : t('{change} since {date}', {
            change: `${sign}${Math.abs(delta).toFixed(1)} ${weightUnit}`,
            date:
              firstDay.slice(0, 4) === dayKey(latest.at).slice(0, 4)
                ? formatShortDay(firstDay, lang)
                : formatLongDay(firstDay, lang),
          });
  }
  const values = [...bodyweightLog.slice(0, 12)].reverse().map((entry) => toUnit(entry.kg));
  const lo = Math.min(...values);
  const hi = Math.max(...values);

  return (
    <View
      style={{
        padding: 14,
        borderRadius: radius.row,
        borderWidth: 1,
        borderColor: glass.raisedEdge,
        backgroundColor: glass.raised,
      }}
    >
      <View className="flex-row items-center">
        <View className="flex-1 pr-sm" style={{ minWidth: 0 }}>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
            style={{ fontSize: 16.5, lineHeight: 22 }}
            className="text-ink"
          >
            {t('Weight')}
          </Text>
          <Text maxFontSizeMultiplier={1.3} className="text-label tabular-nums text-ink-muted">
            {change}
          </Text>
        </View>
        {values.length > 1 ? (
          <View style={{ width: 72 }}>
            <Sparkline
              values={values}
              height={26}
              min={Math.floor(lo - 0.5)}
              max={Math.ceil(hi + 0.5)}
            />
          </View>
        ) : null}
      </View>

      <View className="mt-md flex-row items-center" style={{ gap: 8 }}>
        <NudgeButton
          icon="minus"
          label={t('Decrease {label}', { label: t('Weight') })}
          onPress={() => onDraft((kg) => nudgeWeighIn(kg, -1, unitSystem))}
        />
        <ValueWell
          onPress={onType}
          accessibilityLabel={`${t('Weight')}, ${formatWeight(draft, unitSystem)} ${weightUnit}`}
          accessibilityHint={t('Opens the keypad')}
          style={{ height: 56 }}
        >
          <Text
            maxFontSizeMultiplier={1.3}
            style={{ fontSize: 24 }}
            className="font-semibold tabular-nums text-ink"
          >
            {formatWeight(draft, unitSystem)}
          </Text>
          <Text maxFontSizeMultiplier={1.3} className="ml-[3px] text-label text-ink-muted">
            {weightUnit}
          </Text>
          <View style={{ marginLeft: 8 }}>
            <Icon name="edit" size={14} color={palette.inkFaint} />
          </View>
        </ValueWell>
        <NudgeButton
          icon="plus"
          label={t('Increase {label}', { label: t('Weight') })}
          onPress={() => onDraft((kg) => nudgeWeighIn(kg, 1, unitSystem))}
        />
      </View>

      <View className="mt-md">
        <PrimaryButton label={t('Log weight')} onPress={() => onLog(draft)} />
      </View>
    </View>
  );
}

/** A 44 dp `−` / `+` beside the weight well, for nudges. */
function NudgeButton({
  icon,
  label,
  onPress,
}: {
  icon: 'plus' | 'minus';
  label: string;
  onPress: () => void;
}) {
  return (
    <BubblePressable
      onPress={() => {
        tap();
        onPress();
      }}
      radius="pill"
      accessibilityRole="button"
      accessibilityLabel={label}
      style={pressedStyle}
      className="h-hit w-[44px] items-center justify-center rounded-pill border border-hairline bg-surface-alt"
    >
      <Icon name={icon} size={16} color={palette.ink} />
    </BubblePressable>
  );
}

/** Name, change and count on the left; the mini line; the latest value. */
function SeriesRow({
  name,
  change,
  count,
  values,
  value,
  unit,
}: {
  name: string;
  change: string;
  count: string;
  values: number[];
  value: string;
  unit: string;
}) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return (
    <>
      <View className="flex-1 pr-sm" style={{ minWidth: 0 }}>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          style={{ fontSize: 16.5, lineHeight: 22 }}
          className="text-ink"
        >
          {name}
        </Text>
        <Text maxFontSizeMultiplier={1.3} className="text-label tabular-nums text-ink-muted">
          {change}
        </Text>
        <Text maxFontSizeMultiplier={1.3} className="text-micro text-ink-faint">
          {count}
        </Text>
      </View>
      {values.length > 1 ? (
        <View style={{ width: 72, marginRight: 10 }}>
          <Sparkline
            values={values}
            height={26}
            min={Math.floor(lo - 0.5)}
            max={Math.ceil(hi + 0.5)}
          />
        </View>
      ) : null}
      <View className="flex-row items-baseline" style={{ marginRight: 6 }}>
        <Text
          maxFontSizeMultiplier={1.3}
          style={{ fontSize: 20 }}
          className="font-semibold tabular-nums text-ink"
        >
          {value}
        </Text>
        <Text maxFontSizeMultiplier={1.3} className="ml-[2px] text-micro text-ink-muted">
          {unit}
        </Text>
      </View>
    </>
  );
}

/** The open row: every reading, newest first, each one a door to correcting it. */
function ReadingList({
  entries,
  unit,
  unitSystem,
  today,
  onEdit,
}: {
  entries: readonly MeasurementEntry[];
  unit: string;
  unitSystem: UnitSystem;
  today: string;
  onEdit: (entry: MeasurementEntry) => void;
}) {
  const t = useT();
  const lang = useLanguage();
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: glass.raisedEdge }}>
      {entries.map((entry, index) => {
        const delta = readingDelta(entries, index, unitSystem, lang);
        const date =
          entry.day.slice(0, 4) === today.slice(0, 4)
            ? formatShortDay(entry.day, lang)
            : formatLongDay(entry.day, lang);
        return (
          <BubblePressable
            key={entry.day}
            onPress={() => onEdit(entry)}
            accessibilityRole="button"
            accessibilityLabel={`${date}, ${formatLength(entry.cm, unitSystem)} ${unit}${delta ? `, ${delta}` : ''}`}
            accessibilityHint={t('Opens the reading')}
            style={(state) => [
              pressedStyle(state),
              {
                minHeight: 48,
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 14,
              },
            ]}
          >
            <Text maxFontSizeMultiplier={1.3} className="flex-1 text-label text-ink-muted">
              {date}
            </Text>
            <Text
              maxFontSizeMultiplier={1.3}
              className="mr-md text-label tabular-nums text-ink-faint"
            >
              {delta ?? t('First reading')}
            </Text>
            <Text
              maxFontSizeMultiplier={1.3}
              style={{ minWidth: 52, textAlign: 'right' }}
              className="text-body font-semibold tabular-nums text-ink"
            >
              {formatLength(entry.cm, unitSystem)}
            </Text>
          </BubblePressable>
        );
      })}
    </View>
  );
}
