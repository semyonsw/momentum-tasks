/**
 * The streak flame's temperature — which of its three steps a run is drawn at.
 *
 *   cold   a run, not yet a habit
 *   warm   a week — the first threshold
 *   hot    three weeks — a habit
 *
 * Pure, and out of `components/StreakFlame.tsx`, because the badge is drawn
 * for two kinds of run and the thresholds have to be right for both.
 *
 * ── THE THRESHOLDS ARE TIME, NOT COUNT ────────────────────────────────────
 *
 * The day thresholds (7 and 21) are a week and three weeks. A weekly task
 * (T-14, "3 times a week") counts its run in WEEKS, and fed through the same
 * numbers a six-week run was drawn as cold as a six-day one — the longest
 * runs on the list looking like the newest. So the week thresholds are the
 * same spans of time: 7 / 7 = 1 and 21 / 7 = 3. Both divide exactly, so there
 * is no rounding to argue about; the floor of 1 is what any rounding would
 * have to respect, since a zero threshold would make a run of nothing warm.
 *
 * The consequence, kept on purpose: a weekly run is never drawn cold. Its
 * first counted week is a met week — seven days that already contain what the
 * warm step waits seven days to see. Rejected: thresholds counted in periods
 * (7 and 21 WEEKS), which would leave a weekly task cold for almost two months
 * and make "hot" a five-month wait; and 2 / 3 weeks, a cold step invented for
 * weekly tasks that the day thresholds do not imply.
 *
 * Unit absent means days — every daily task — and the day answer is exactly
 * what the badge drew before this file existed.
 */

export type StreakUnit = 'day' | 'week';
export type StreakTemperature = 'cold' | 'warm' | 'hot';

export const STREAK_THRESHOLDS: Record<StreakUnit, { warm: number; hot: number }> = {
  day: { warm: 7, hot: 21 },
  week: { warm: 1, hot: 3 },
};

export function streakTemperature(count: number, unit: StreakUnit = 'day'): StreakTemperature {
  const { warm, hot } = STREAK_THRESHOLDS[unit];
  if (count >= hot) return 'hot';
  if (count >= warm) return 'warm';
  return 'cold';
}
