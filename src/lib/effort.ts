/**
 * Effort per set — reps in reserve, and the RPE it is the same fact as.
 *
 *   RIR 2   "two more were in there"         RPE 8
 *   RIR 0   "nothing left, that was it"      RPE 10
 *   RIR 1.5                                  RPE 8.5
 *
 * ── ONE STORED NUMBER: RIR ─────────────────────────────────────────────────
 *
 * RIR and RPE are one scale read from opposite ends (RPE = 10 − RIR, half steps
 * allowed), so the set carries ONE number and derives the other. RIR is the one
 * kept because it is the one a lifter can actually answer standing up — "how many
 * more could you have done" is a count, "rate your exertion" is a feeling — and
 * because the decision this app takes from it (the overload nudge holds off at the
 * limit) is a question about reps left, not about a rating.
 *
 * REJECTED: storing whichever the user entered, with a flag saying which. The
 * prototype draws `RIR 2` beside `@8`, but two encodings of one fact is two
 * sanitizers, two branches in every reader and a log in which "the same effort"
 * has two spellings. The picker shows both readings on every choice instead, so an
 * RPE lifter picks `@8` and gets exactly what an RIR lifter gets picking `2`.
 *
 * REJECTED: RPE 1–10. Below RPE 5 (five or more reps left) the number stops being
 * an estimate anybody can make, and a scale with ten choices invites a precision
 * the answer does not have — the same argument `SessionEffort` makes. 0–5 in half
 * steps is eleven choices and every one of them is a real answer.
 *
 * ── OPTIONAL, ABSENT MEANS "NOT SAID" ──────────────────────────────────────
 *
 * `SetHistory.rir` used to be declared as `rpe` and deleted because nothing could
 * write it (see `models.ts`). It comes back because a control writes it now and
 * three things read it: the set row's chip, the AI context and the nudge. It is
 * never defaulted: a set nobody graded is not a set at RIR 2, and every log written
 * before this field existed must read exactly as it did.
 *
 * NOT CARRIED BY THE PREFILLS. A row prefilled from last session gets last
 * session's weight and count, never its RIR: effort is a fact about a set that
 * happened, and a ghost `RIR 2` on a set not yet lifted would be the app answering
 * the question for you. (Weight carry-down rewrites `weightKg` only, so it cannot
 * carry one either.)
 */

import { t, type Language } from './i18n';
import type { CountUnit } from '../types/models';
import { endsAtLimit, type SetType } from './setType';

/** The scale's ends, and its step. */
const RIR_MIN = 0;
const RIR_MAX = 5;
const RIR_STEP = 0.5;

/**
 * AT THE LIMIT: RIR ≤ 0.5, i.e. RPE ≥ 9.5.
 *
 * IMPLEMENTATION_DECISIONS (T-11): such a set is not used as evidence to raise the
 * weight, because it was at the limit — "you did 8 at 80" means something
 * different when the 8th rep was the last one you had.
 */
export const RIR_LIMIT = 0.5;

/**
 * A stored RIR, or undefined — the ONE validator for the field.
 *
 * Off-scale values (RIR 37, −1, NaN, a string) are dropped rather than clamped:
 * clamping 37 to 5 would invent an answer. An in-range value that is not on a half
 * step can only come from a hand-edited file, and it is snapped to the nearest half
 * so the chip and the picker can show it.
 */
export function cleanRir(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (value < RIR_MIN || value > RIR_MAX) return undefined;
  return Math.round(value / RIR_STEP) * RIR_STEP;
}

/** RPE for an RIR: the same scale read from the other end. */
export function rpeOf(rir: number): number {
  return 10 - rir;
}

/** Every choice the picker offers, hardest first: 0, 0.5 … 5. */
export function rirChoices(): number[] {
  const out: number[] = [];
  for (let v = RIR_MIN; v <= RIR_MAX; v += RIR_STEP) out.push(v);
  return out;
}

/** `2`, `1.5` — never `2.0`. */
export function formatRir(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** The row's chip: `RIR 2`. The letters are the same in both languages. */
export function rirChipLabel(rir: number): string {
  return `RIR ${formatRir(rir)}`;
}

/** The picker's second line under a choice: `@8`, `@9.5`. */
export function rpeLabel(rir: number): string {
  return `@${formatRir(rpeOf(rir))}`;
}

/** Spoken and written in full: "2 reps in reserve, RPE 8". */
export function describeRir(rir: number, lang: Language): string {
  return t('{rir} in reserve · RPE {rpe}', lang, {
    rir: formatRir(rir),
    rpe: formatRir(rpeOf(rir)),
  });
}

/**
 * Does effort mean anything for this kind of count?
 *
 * Reps only. "Reps in reserve" on a plank, a swim or a boxing round is a question
 * with no answer, and the chip is not offered there — a value that arrived anyway
 * (a hand-edited backup) is kept, just not drawn.
 */
export function effortApplies(countUnit: CountUnit): boolean {
  return countUnit === 'reps';
}

/**
 * A set that was at the limit — see `RIR_LIMIT`.
 *
 * A grade decides when there is one. Without one, a set typed to-failure or AMRAP
 * is at the limit by its own definition (`lib/setType.ts`), and anything else is
 * unknown — and unknown effort is never assumed to be maximal.
 */
export function atLimit(set: { rir?: number; setType?: SetType }): boolean {
  if (set.rir != null) return set.rir <= RIR_LIMIT;
  return endsAtLimit(set);
}

/**
 * One exercise's effort for the assistant: `2 1 - 0`, one entry per working set
 * in order, `-` where nothing was said. Null when no set says anything, so a log
 * that never used the field costs the context nothing.
 */
export function effortLine(sets: readonly { rir?: number }[]): string | null {
  if (!sets.some((s) => s.rir != null)) return null;
  return sets.map((s) => (s.rir == null ? '-' : formatRir(s.rir))).join(' ');
}

/**
 * A set with its effort said, changed, or taken back (`null`). A value off the
 * scale changes nothing — the picker cannot produce one, so one arriving here is a
 * bug, and the set it would have landed on is a record.
 *
 * Generic over the row, so the live session (`DraftSet`) and a correction to the
 * log (`SetHistory`) go through the same rule.
 */
export function withRir<T extends { rir?: number }>(set: T, rir: number | null): T {
  if (rir === null) {
    const { rir: _cleared, ...rest } = set;
    return rest as T;
  }
  const clean = cleanRir(rir);
  return clean == null ? set : { ...set, rir: clean };
}
