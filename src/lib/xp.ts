/**
 * XP and levels (E2, Wave 3, behind the one switch in `lib/engagement.ts`).
 *
 *   LEVEL 6
 *   1,920  of 2,100 XP to level 7
 *   ██████████████████░░░
 *   Log a working set          +2
 *   Finish a workout          +40
 *   …
 *   XP only goes up. A missed day earns nothing and takes nothing.
 *
 * ── A SUM OVER THE LOGS, NOT A COUNTER ─────────────────────────────────────
 *
 * XP is worked out from the same dated facts the badges read
 * (`logFacts`, `lib/achievements.ts`) times ONE weights table below. Nothing is
 * stored, so it is deterministic — the same logs always give the same figure —
 * and retroactive: switching the layer on a year in shows a year of XP.
 *
 * Every weight is positive and every fact counts something that happened, so
 * XP has no way down: there is no penalty for a missed day, no decay for a
 * quiet month, no "lost XP" line anywhere. Rejected: Todoist-style karma that
 * drops for overdue tasks (it turns a habit list into a debt), and decay (a
 * holiday would cost levels). The one way the figure falls is the user
 * deleting what earned it — the log is the record — and nothing says so.
 *
 * ── THE WEIGHTS ────────────────────────────────────────────────────────────
 *
 * The design's table. A workout is worth its finish (+40) plus its working sets
 * (+2 each), so a 20-set session is 80 — about what a day of five ticked tasks
 * and a perfect-day bonus is (5 × 5 + 25 = 50), and a day of three recorded
 * amounts (9) is the small daily habit it is. A record (+60) is rare enough to
 * be worth more than a session. Excused days earn nothing: they are not done
 * days, and a perfect day needs something done.
 *
 * ── ONE LOG PER APP ────────────────────────────────────────────────────────
 *
 * Since 3.0.0 each app's level is earned in its own log only: the Workout app
 * counts sets, workouts and records, the Tasks app ticks and perfect days, the
 * Expenses app amounts. `xpBreakdown` takes the variant and keeps only that
 * log's rows, so the level sheet does not list "Tick a task +5" in an app with
 * no tasks in it, and the Workout app's level is not inflated by the 2.x tasks
 * it still stores but no longer shows. The weights are unchanged — they were
 * balanced against each other, and within one log the ratios still hold. The
 * cost, said plainly: an Expenses level climbs slowly at +3 an amount, which
 * is the small daily habit the table already called it.
 *
 * ── THE CURVE ──────────────────────────────────────────────────────────────
 *
 * Level L starts at 50·L·(L−1) XP: 0, 100, 300, 600, 1,000 … each level is 100
 * XP longer than the one before. Quadratic, so the first levels come within
 * days and the steps stay meaningful at a few thousand workouts' worth; a
 * flat step would turn into a level a day for a busy user, an exponential one
 * into a wall. Level 1 is where everybody starts, at 0.
 */

import type { BadgeDomain, LogFacts } from './achievements';
import type { AppVariant } from './appVariant';
import { t, type Language } from './i18n';
import { formatValue } from './money';
import { variantLog } from './variantScope';

export type XpSource = 'sets' | 'workouts' | 'tasksDone' | 'perfectDays' | 'amounts' | 'records';

/** THE weights table. Order is the level sheet's order; `domain` is the log it counts. */
export const XP_WEIGHTS: readonly {
  source: XpSource;
  xp: number;
  label: string;
  domain: BadgeDomain;
}[] = [
  { source: 'sets', xp: 2, label: 'Log a working set', domain: 'workout' },
  { source: 'workouts', xp: 40, label: 'Finish a workout', domain: 'workout' },
  { source: 'tasksDone', xp: 5, label: 'Tick a task', domain: 'tasks' },
  { source: 'perfectDays', xp: 25, label: 'A day with every task done', domain: 'tasks' },
  { source: 'amounts', xp: 3, label: 'Record an amount', domain: 'money' },
  { source: 'records', xp: 60, label: 'A personal record', domain: 'workout' },
];

/** The rows an app's level is made of: its own log's. Absent = every row (2.x). */
export function xpWeightsFor(variant?: AppVariant): typeof XP_WEIGHTS {
  if (variant === undefined) return XP_WEIGHTS;
  const domain = variantLog(variant);
  return XP_WEIGHTS.filter((row) => row.domain === domain);
}

/** How many of each source the logs hold — the working sets are summed, the rest counted. */
function countOf(facts: LogFacts, source: XpSource): number {
  const series = facts[source];
  if (source === 'sets') {
    return series.reduce((sum, point) => sum + Math.max(0, Math.floor(point.value) || 0), 0);
  }
  return series.length;
}

export interface XpLine {
  source: XpSource;
  label: string;
  /** Per event. */
  each: number;
  /** How many events. */
  count: number;
  /** each × count. */
  xp: number;
}

/** Per source, in the table's order, for `variant`'s log. Every figure ≥ 0. */
export function xpBreakdown(facts: LogFacts, variant?: AppVariant): XpLine[] {
  return xpWeightsFor(variant).map(({ source, xp, label }) => {
    const count = countOf(facts, source);
    return { source, label, each: xp, count, xp: count * xp };
  });
}

/** The total. Same facts in, same number out; never below 0. */
export function totalXp(facts: LogFacts, variant?: AppVariant): number {
  return xpBreakdown(facts, variant).reduce((sum, line) => sum + line.xp, 0);
}

/** XP at which level `level` starts: 50·L·(L−1). Level 1 at 0. */
export function levelStart(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return 50 * l * (l - 1);
}

/** The level an XP total reaches. Never below 1. */
export function levelOf(xp: number): number {
  const safe = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  // Inverse of 50·L·(L−1), then nudged so float error cannot land a boundary wrong.
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + safe / 12.5)) / 2));
  while (levelStart(level + 1) <= safe) level += 1;
  while (level > 1 && levelStart(level) > safe) level -= 1;
  return level;
}

export interface LevelProgress {
  level: number;
  xp: number;
  /** Where this level started, and where the next one starts. */
  from: number;
  to: number;
  /** 0 ≤ fraction < 1 — a full bar is the next level, never this one. */
  fraction: number;
}

export function levelProgress(xp: number): LevelProgress {
  const safe = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  const level = levelOf(safe);
  const from = levelStart(level);
  const to = levelStart(level + 1);
  return { level, xp: safe, from, to, fraction: (safe - from) / (to - from) };
}

/** `of 2,100 XP to level 8` — the figure the user is counting toward. */
export function describeNextLevel(progress: LevelProgress, lang: Language): string {
  return t('of {xp} XP to level {level}', lang, {
    xp: formatValue(progress.to),
    level: progress.level + 1,
  });
}
