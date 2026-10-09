/**
 * The engagement layer's one switch (Wave 3): "Achievements and levels", in
 * Settings, OFF by default (IMPLEMENTATION_DECISIONS row 6).
 *
 * Everything Wave 3 adds — the badges, the level chip, the streak freezes, the
 * milestone card on the Finish sheet — is behind this one flag, and the flag is
 * read in ONE place: `engagementView` below says, for a given switch position,
 * which of those pieces may appear. A screen asks it rather than testing the
 * flag itself, so "with the switch off the app is exactly as it was" is one
 * function with one test, not a promise spread across five screens.
 *
 * ── WHY ONE SWITCH AND NOT FOUR ────────────────────────────────────────────
 *
 * The design philosophy is that nothing here keeps score of a person who did not
 * ask it to (ROADMAP §1). Four switches would make each piece a decision the user
 * has to understand before they know whether they want any of it; one switch is
 * one question — "do you want the game layer?" — and the answer covers all of it.
 * Rejected: on by default with an off switch (the app would start scoring people
 * who never asked), and a per-section switch (badges for training but not money
 * is a distinction nobody has asked for).
 *
 * ── WHAT IT STORES ─────────────────────────────────────────────────────────
 *
 * `settings.engagement`, an OPTIONAL `true`: absent is off, which is what a 2.2.0
 * phone and its backups say without knowing the key exists. Nothing the layer
 * shows is stored — badges and XP are worked out from the logs every time
 * (`lib/achievements.ts`, `lib/xp.ts`) — so switching it off and on again loses
 * nothing, and switching it on for the first time a year in shows a year of
 * badges.
 */

/** Off. A 2.2.0 phone, a fresh install, and a reset all read this. */
export const ENGAGEMENT_DEFAULT = false;

/** The stored flag, read: only a literal `true` is on. */
export function engagementOn(settings: { engagement?: true }): boolean {
  return settings.engagement === true;
}

/** The persisted form: `true`, or absent — never a stored `false`. */
export function usableEngagement(value: unknown): true | undefined {
  return value === true ? true : undefined;
}

/** Which of Wave 3's pieces may appear. All false with the switch off. */
export interface EngagementView {
  /** The `Badges` door in Settings and the achievements gallery (E1). */
  badges: boolean;
}

export function engagementView(on: boolean): EngagementView {
  return { badges: on };
}
