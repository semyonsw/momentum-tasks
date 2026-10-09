/**
 * Body measurements (W9): a tape measure's log, beside the bodyweight one.
 *
 *   { waist: [ { day: 2026-10-05, cm: 82.5 },     ← newest first, one per day
 *              { day: 2026-09-28, cm: 83.0 } ],
 *     arm:   [ { day: 2026-10-05, cm: 37.0 } ] }
 *
 * `lib/bodyweightLog.ts` says nothing else about the body is tracked, and that
 * was true while the only number was the one `effectiveLoadKg` needed. This is
 * the other kind of body number — not load-bearing arithmetic, a record the user
 * asked for — so it lives in its own key and NOTHING in the training maths reads
 * it. Deleting every measurement changes no set, no volume and no nudge.
 *
 * ── DECISIONS ──────────────────────────────────────────────────────────────
 *
 *  • A FIXED LIST, no custom measurements. Seven sites cover what a tape is put
 *    round (waist, hips, chest, arm, thigh, calf, neck). Rejected: user-named
 *    sites — a name typed in one language is not translated in the other, two
 *    spellings of "bicep" split one series in two, and the key would have to be
 *    an id with its own editor. A site nobody measures simply has no row.
 *  • CANONICAL CENTIMETRES, shown in the unit system's length: cm for metric,
 *    inches for imperial (the app's `unitSystem` already decides kg/lb, and
 *    nobody measures in kg and inches). Stored to 0.01 cm so a value typed in
 *    inches comes back as the same inches — 15.3 in is 38.86 cm, which reads
 *    back as 15.3, where whole-millimetre storage would drift.
 *  • ONE READING PER SITE PER DAY, the bodyweight log's rule: a second reading on
 *    the same day replaces the first. A waist measured twice in a morning is a
 *    correction, not a series.
 *  • A DAY KEY, not an instant: the add sheet asks for a date (old notes go in
 *    too), and no time of day ever changes what a waist measurement means.
 *  • ABSENT WHEN EMPTY. The store key is optional, a 2.2.0 phone and its backups
 *    have none, and `sanitizeMeasurements` returns `undefined` rather than `{}`
 *    so an empty log writes nothing.
 */

import { formatLongDay, formatShortDay, parseDay } from './days';
import { plural, t, term, type Language } from './i18n';
import type { UnitSystem } from '../types/models';

/** The sites, in display order: the trunk first, then the limbs, then the neck. */
export const MEASUREMENTS = ['waist', 'hips', 'chest', 'arm', 'thigh', 'calf', 'neck'] as const;

export type MeasurementKey = (typeof MEASUREMENTS)[number];

export interface MeasurementEntry {
  /** `YYYY-MM-DD`, local. */
  day: string;
  /** Centimetres, to 0.01. */
  cm: number;
}

export type MeasurementLog = Partial<Record<MeasurementKey, MeasurementEntry[]>>;

/**
 * The believable range for a tape round any of these sites, in cm. A guard
 * against a typo and a corrupt blob — a 10 cm neck or a 250 cm waist is past any
 * adult — not an opinion about anybody's body.
 */
export const MEASUREMENT_LIMITS_CM = { min: 10, max: 250 } as const;

/** Per site, as `bodyweightLog`'s cap: years of weekly readings, and no more. */
export const MAX_MEASUREMENT_ENTRIES = 500;

export const CM_PER_INCH = 2.54;

/**
 * Where the add sheet's figure starts for a site with no reading yet: a visible
 * starting point for the ± chips (a typical adult's), never stored until Save.
 */
export const MEASUREMENT_START_CM: Record<MeasurementKey, number> = {
  waist: 80,
  hips: 95,
  chest: 95,
  arm: 32,
  thigh: 55,
  calf: 36,
  neck: 38,
};

/** The ± chip step in the user's unit: half a centimetre, or half an inch. */
export const MEASUREMENT_STEP = 0.5;

export function isMeasurementKey(value: unknown): value is MeasurementKey {
  return typeof value === 'string' && (MEASUREMENTS as readonly string[]).includes(value);
}

/** A centimetre value to 0.01, inside the limits, or undefined. */
export function cleanCm(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const { min, max } = MEASUREMENT_LIMITS_CM;
  if (value < min || value > max) return undefined;
  return Math.round(value * 100) / 100;
}

function usableEntry(value: unknown): MeasurementEntry | null {
  if (typeof value !== 'object' || value == null) return null;
  const raw = value as { day?: unknown; cm?: unknown };
  if (typeof raw.day !== 'string' || !parseDay(raw.day)) return null;
  const cm = cleanCm(raw.cm);
  return cm == null ? null : { day: raw.day, cm };
}

/** One site's readings from anything: newest first, one per day, capped. */
function sanitizeEntries(value: unknown): MeasurementEntry[] {
  if (!Array.isArray(value)) return [];
  const byDay = new Map<string, MeasurementEntry>();
  // The FIRST entry for a day wins: the store writes the new reading in front.
  for (const raw of value) {
    const entry = usableEntry(raw);
    if (entry && !byDay.has(entry.day)) byDay.set(entry.day, entry);
  }
  return [...byDay.values()]
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
    .slice(0, MAX_MEASUREMENT_ENTRIES);
}

/**
 * A usable log from anything at all, or `undefined` when nothing is in it.
 *
 * Total, like every sanitizer here: this comes off disk and out of restored
 * backups. An unknown site is dropped (a build that knew it is a NEWER build,
 * and this one cannot draw it); a row that cannot be read is dropped rather
 * than repaired — an invented date would put a measurement on a day nobody took.
 */
export function sanitizeMeasurements(value: unknown): MeasurementLog | undefined {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) return undefined;
  const out: MeasurementLog = {};
  for (const key of MEASUREMENTS) {
    const entries = sanitizeEntries((value as Record<string, unknown>)[key]);
    if (entries.length > 0) out[key] = entries;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Record a reading, replacing that site's reading on that day. Unusable → unchanged. */
export function recordMeasurement(
  log: MeasurementLog | undefined,
  key: MeasurementKey,
  day: string,
  cm: number,
): MeasurementLog | undefined {
  const entry = usableEntry({ day, cm });
  if (!entry || !isMeasurementKey(key)) return log;
  return sanitizeMeasurements({ ...log, [key]: [entry, ...(log?.[key] ?? [])] });
}

/** Remove one site's reading on one day. The log goes absent when it empties. */
export function removeMeasurement(
  log: MeasurementLog | undefined,
  key: MeasurementKey,
  day: string,
): MeasurementLog | undefined {
  if (!log?.[key]) return log;
  return sanitizeMeasurements({ ...log, [key]: log[key]?.filter((entry) => entry.day !== day) });
}

/* ------------------------------------------------------------------ */
/* Units                                                               */
/* ------------------------------------------------------------------ */

/** Centimetres as the user reads them: cm, or inches. Unrounded. */
export function cmToDisplay(cm: number, unitSystem: UnitSystem): number {
  return unitSystem === 'imperial' ? cm / CM_PER_INCH : cm;
}

/** A value in the user's unit back to canonical centimetres, to 0.01. */
export function displayToCm(value: number, unitSystem: UnitSystem): number {
  const cm = unitSystem === 'imperial' ? value * CM_PER_INCH : value;
  return Math.round(cm * 100) / 100;
}

/** One decimal, always — `82.5`, `37.0` — so a column of them lines up. */
export function formatLength(cm: number, unitSystem: UnitSystem): string {
  return (Math.round(cmToDisplay(cm, unitSystem) * 10) / 10).toFixed(1);
}

/** `cm` / `in`, and the Russian `см` / `дюйм`. */
export function lengthUnitLabel(unitSystem: UnitSystem, lang: Language = 'en'): string {
  return term('unit', unitSystem === 'imperial' ? 'in' : 'cm', lang);
}

/**
 * A ± chip step from a shown value: the next half-unit up or down, so a value
 * typed as 82.3 steps to 82.5 / 82.0 rather than to 82.8 / 81.8. Returns cm.
 */
export function stepMeasurement(cm: number, direction: 1 | -1, unitSystem: UnitSystem): number {
  const shown = Math.round(cmToDisplay(cm, unitSystem) * 10) / 10;
  const steps = shown / MEASUREMENT_STEP;
  const snapped = direction > 0 ? Math.floor(steps + 1e-9) + 1 : Math.ceil(steps - 1e-9) - 1;
  const next = displayToCm(snapped * MEASUREMENT_STEP, unitSystem);
  const { min, max } = MEASUREMENT_LIMITS_CM;
  return Math.min(max, Math.max(min, next));
}

/* ------------------------------------------------------------------ */
/* Reading a site                                                      */
/* ------------------------------------------------------------------ */

/** Oldest first, in the user's unit — what the row's mini chart draws. */
export function measurementSeries(
  entries: readonly MeasurementEntry[],
  unitSystem: UnitSystem,
): number[] {
  return [...entries].reverse().map((entry) => cmToDisplay(entry.cm, unitSystem));
}

export interface MeasurementSummary {
  latest: MeasurementEntry;
  first: MeasurementEntry;
  count: number;
  /** Latest minus first, in cm. 0 for a single reading. */
  changeCm: number;
}

export function summarizeMeasurement(
  entries: readonly MeasurementEntry[] | undefined,
): MeasurementSummary | null {
  if (!entries || entries.length === 0) return null;
  const latest = entries[0];
  const first = entries[entries.length - 1];
  return { latest, first, count: entries.length, changeCm: latest.cm - first.cm };
}

/**
 * `+2.0 cm since 10 Aug` / `−1.5 in since 3 Mar` / `±0.0 cm since …`, or the
 * single-reading line. The delta is rounded in the SHOWN unit, so a change of
 * 0.03 cm reads ±0.0 rather than as a direction nobody measured.
 */
export function describeMeasurementChange(
  summary: MeasurementSummary,
  unitSystem: UnitSystem,
  lang: Language = 'en',
): string {
  if (summary.count < 2) return t('One reading', lang);
  const delta = Math.round(cmToDisplay(summary.changeCm, unitSystem) * 10) / 10;
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±';
  return t('{change} since {date}', lang, {
    change: `${sign}${Math.abs(delta).toFixed(1)} ${lengthUnitLabel(unitSystem, lang)}`,
    // The year only when the series crosses one: "since 10 August" otherwise.
    date:
      summary.first.day.slice(0, 4) === summary.latest.day.slice(0, 4)
        ? formatShortDay(summary.first.day, lang)
        : formatLongDay(summary.first.day, lang),
  });
}

/** A reading's change from the one before it, for the open row's list. */
export function readingDelta(
  entries: readonly MeasurementEntry[],
  index: number,
  unitSystem: UnitSystem,
  lang: Language = 'en',
): string | null {
  const previous = entries[index + 1];
  if (!previous) return null;
  const delta = Math.round(cmToDisplay(entries[index].cm - previous.cm, unitSystem) * 10) / 10;
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±';
  return `${sign}${Math.abs(delta).toFixed(1)} ${lengthUnitLabel(unitSystem, lang)}`;
}

/** "Waist" / "Талия". */
export function measurementLabel(key: MeasurementKey, lang: Language = 'en'): string {
  return term('measure', key.charAt(0).toUpperCase() + key.slice(1), lang);
}

/** "8 readings" / "8 измерений". */
export function readingsCount(n: number, lang: Language = 'en'): string {
  return `${n} ${plural(n, lang, { one: t('reading', lang), few: 'измерения', many: t('readings', lang) })}`;
}
