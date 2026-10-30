/**
 * The weigh-in on Body measurements (redesign #14).
 *
 * Bodyweight used to be set in one place only — a `−`/`+` stepper in Workout
 * settings, nudging by the coarse step — and Body measurements showed the log
 * read-only. Typing 81.4 there was twenty taps. The Body screen now writes it
 * too: the value is a well that opens the keypad, `±` nudge it, and `Log weight`
 * records it. Every write still goes through `setBodyweightKg`, which updates
 * the scalar AND the dated log together, so there is still one number with one
 * history, just two doors to it.
 *
 * The nudge is the FINE step (0.5 kg / 1 lb), not the settings row's coarse
 * one: that row seeds a number volume maths needs to the nearest couple of
 * kilos; this one is a scale reading, and a scale reads in halves.
 */

import { BODYWEIGHT_LIMITS, clampBodyweightKg, type BodyweightEntry } from './bodyweightLog';
import { kgToLb, lbToKg, weightSteps } from './units';
import type { UnitSystem } from '../types/models';

/** Where the well starts with nothing logged — Workout settings' own seed. */
export const WEIGH_IN_START_KG = 70;

/** The value the well opens on: the last reading, else the setting, else the seed. */
export function weighInStart(log: readonly BodyweightEntry[], bodyweightKg?: number): number {
  return log[0]?.kg ?? bodyweightKg ?? WEIGH_IN_START_KG;
}

/** Kilograms → the number the user reads, to one decimal. */
export function weighInDisplay(kg: number, unitSystem: UnitSystem): number {
  return Number((unitSystem === 'imperial' ? kgToLb(kg) : kg).toFixed(1));
}

/** A typed number in the user's units → kilograms inside the believable range. */
export function weighInFromDisplay(value: number, unitSystem: UnitSystem): number {
  const kg = unitSystem === 'imperial' ? lbToKg(value) : value;
  return clampBodyweightKg(kg) ?? BODYWEIGHT_LIMITS.min;
}

/** One fine step up or down, in the user's units, clamped. */
export function nudgeWeighIn(kg: number, direction: 1 | -1, unitSystem: UnitSystem): number {
  const { fine } = weightSteps(unitSystem);
  return weighInFromDisplay(weighInDisplay(kg, unitSystem) + fine * direction, unitSystem);
}
