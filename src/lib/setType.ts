/**
 * Set types — warm-up as it always was, plus drop, to-failure and AMRAP.
 *
 *   W  warm-up      out of everything: volume, set count, shorthand, verdicts
 *   D  drop set     a working set, lighter, straight after a heavier one
 *   F  to failure   a working set taken until no rep was left
 *   A  AMRAP        a working set of as many reps as possible
 *
 * ── THE MODEL: `isWarmup` STAYS, `setType` IS ADDED BESIDE IT ─────────────
 *
 * `isWarmup: boolean` has been on every set since the first release, it is in
 * every row on every phone and in every backup, and a dozen readers filter on it
 * (the volume, the shorthand, the nudge, the records, the ladder, the AI context).
 * So it keeps its meaning exactly, and the three NEW kinds go in an optional
 * `setType` that is only ever one of them. A set's kind is read from both
 * (`setKindOf`), written to both (`withKind`), and the sanitizer drops a `setType`
 * that sits on a warm-up — the flag wins, so the warm-up is the thing that can
 * never be lost.
 *
 * WHAT THAT BUYS is the whole rule set for free and with no migration: drop,
 * failure and AMRAP sets are `isWarmup: false`, so they ARE working sets to every
 * existing reader — they count as volume, as sets per cluster, as records, as
 * ladder input — and a warm-up is excluded exactly as before. Old data is never
 * rewritten; it simply has no `setType`, which reads as a plain working set.
 *
 * REJECTED: one `setType: 'warmup' | 'working' | …` replacing the flag. Cleaner on
 * paper, and it would have meant migrating every stored row (or mapping both ways
 * on every read and write), with the failure mode being a warm-up that comes back
 * as a working set and drives a nudge — the bug `QuickAdjust`'s header remembers.
 *
 * ── WHAT EACH KIND CHANGES, AND WHY ────────────────────────────────────────
 *
 *  • SHORTHAND gets a mark per count: `8F` to failure, `8+` AMRAP (the 5/3/1
 *    notation lifters already write), `10D` a drop set. A plain working set and
 *    a warm-up keep exactly the strings they had.
 *  • THE NUDGE treats failure and AMRAP as AT THE LIMIT unless the set carries an
 *    RIR that says otherwise (`lib/effort.ts`): both are, by definition, sets with
 *    nothing left, and IMPLEMENTATION_DECISIONS (T-11) says a set at the limit is
 *    not evidence for more weight. An AMRAP of 12 at 80 kg says "12 was the most",
 *    not "8 is easy now". Grade it RIR 1 and it counts like any other set.
 *  • THE LADDER skips drop sets: a ladder's rungs are its prescribed sets, and a
 *    burn-out drop after them is extra work, not a rung — counting it would shift
 *    every target below it and could "miss" a session the user completed. Failure
 *    and AMRAP sets stay rungs (the ladder's top set IS an all-out set).
 *  • NOT PREFILLED. Like a grade, a type is a fact about a set that happened; a
 *    session built from last time gets its weights and reps, never its marks.
 */

import { t, type Language } from './i18n';

/** The three kinds stored in `setType`. A warm-up is `isWarmup`, never this. */
export type SetType = 'drop' | 'failure' | 'amrap';

/** What a set IS, read from both fields. */
export type SetKind = 'working' | 'warmup' | SetType;

/** In the order the picker offers them: the default first, the rare last. */
export const SET_KINDS: readonly SetKind[] = ['working', 'warmup', 'drop', 'failure', 'amrap'];

const SET_TYPES: readonly SetType[] = ['drop', 'failure', 'amrap'];

/** Anything carrying a set's two kind fields. */
export interface KindFields {
  isWarmup: boolean;
  setType?: SetType;
}

/**
 * A stored `setType`, or undefined — the ONE validator for the field.
 *
 * Unknown strings are dropped. So is any type on a WARM-UP: the flag is the older
 * fact and the one every reader trusts, so a row claiming both is a warm-up.
 */
export function cleanSetType(value: unknown, isWarmup: boolean): SetType | undefined {
  if (isWarmup) return undefined;
  return SET_TYPES.includes(value as SetType) ? (value as SetType) : undefined;
}

export function setKindOf(set: KindFields): SetKind {
  if (set.isWarmup) return 'warmup';
  return set.setType ?? 'working';
}

/** A set made into `kind`, both fields written together. Nothing else changes. */
export function withKind<T extends KindFields>(set: T, kind: SetKind): T {
  const { setType: _old, ...rest } = set;
  if (kind === 'warmup') return { ...rest, isWarmup: true } as T;
  if (kind === 'working') return { ...rest, isWarmup: false } as T;
  return { ...rest, isWarmup: false, setType: kind } as T;
}

/** The 26 dp badge's letter, or null for a plain working set (it shows its number). */
export function kindBadge(kind: SetKind): 'W' | 'D' | 'F' | 'A' | null {
  switch (kind) {
    case 'warmup':
      return 'W';
    case 'drop':
      return 'D';
    case 'failure':
      return 'F';
    case 'amrap':
      return 'A';
    default:
      return null;
  }
}

/** The kind's name — the design's `set.type.*` copy. */
export function kindName(kind: SetKind, lang: Language): string {
  switch (kind) {
    case 'warmup':
      return t('Warm-up', lang);
    case 'drop':
      return t('Drop set', lang);
    case 'failure':
      return t('To failure', lang);
    case 'amrap':
      return t('AMRAP', lang);
    default:
      return t('Working set', lang);
  }
}

/** The shorthand's mark after a count: `F`, `+`, `D`, or nothing. */
export function shorthandMark(set: KindFields): string {
  switch (setKindOf(set)) {
    case 'failure':
      return 'F';
    case 'amrap':
      return '+';
    case 'drop':
      return 'D';
    default:
      return '';
  }
}

/** Failure and AMRAP: sets that, unless graded otherwise, had nothing left. */
export function endsAtLimit(set: { setType?: SetType }): boolean {
  return set.setType === 'failure' || set.setType === 'amrap';
}

/** Does this set take a rung of a rep ladder? Warm-ups and drop sets do not. */
export function isLadderRung(set: KindFields): boolean {
  return !set.isWarmup && set.setType !== 'drop';
}
