/**
 * The engagement layer's one switch: "Achievements and levels", in Settings,
 * OFF by default.
 *
 * Everything the layer adds — the badges, the level, the streak freezes — is
 * behind this one flag, and the flag is
 * read in ONE place: `engagementView` below says, for a given switch position,
 * which of those pieces may appear. A screen asks it rather than testing the
 * flag itself, so "with the switch off the app is exactly as it was" is one
 * function with one test, not a promise spread across several screens.
 *
 * ── WHY ONE SWITCH AND NOT THREE ───────────────────────────────────────────
 *
 * The design philosophy is that nothing here keeps score of a person who did not
 * ask it to. Three switches would make each piece a decision the user
 * has to understand before they know whether they want any of it; one switch is
 * one question — "do you want the game layer?" — and the answer covers all of it.
 * Rejected: on by default with an off switch (the app would start scoring people
 * who never asked).
 *
 * ── WHAT IT STORES ─────────────────────────────────────────────────────────
 *
 * `settings.engagement`, an OPTIONAL `true`: absent is off, which is what an old
 * blob or backup says without knowing the key exists. Nothing the layer shows
 * is stored — badges and XP are worked out from the log every time
 * (`lib/achievements.ts`, `lib/xp.ts`) — so switching it off and on again loses
 * nothing, and switching it on for the first time a year in shows a year of
 * badges.
 */

/** Off. An old blob, a fresh install, and a reset all read this. */
export const ENGAGEMENT_DEFAULT = false;

/** The stored flag, read: only a literal `true` is on. */
export function engagementOn(settings: { engagement?: true }): boolean {
  return settings.engagement === true;
}

/** The persisted form: `true`, or absent — never a stored `false`. */
export function usableEngagement(value: unknown): true | undefined {
  return value === true ? true : undefined;
}

/** Which of the layer's pieces may appear. All false with the switch off. */
export interface EngagementView {
  /** The `Badges` door in Settings and the achievements gallery (E1). */
  badges: boolean;
  /** The level row in Settings and its sheet (E2). */
  level: boolean;
  /** Streak freezes: the overlay on the streak, the ❄ on the flame, its sheet (E3). */
  freezes: boolean;
}

export function engagementView(on: boolean): EngagementView {
  return { badges: on, level: on, freezes: on };
}
