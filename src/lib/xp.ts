/**
 * XP and levels (E2, behind the one switch in `lib/engagement.ts`).
 *
 *   LEVEL 6
 *   1,920  of 2,100 XP to level 7
 *   ██████████████████░░░
 *   Tick a task                       +5
 *   A day with every task done       +25
 *   XP only goes up. A missed day earns nothing and takes nothing.
 *
 * ── A SUM OVER THE LOG, NOT A COUNTER ──────────────────────────────────────
 *
 * XP is worked out from the same dated facts the badges read
 * (`logFacts`, `lib/achievements.ts`) times ONE weights table below. Nothing is
 * stored, so it is deterministic — the same log always gives the same figure —
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
 * Momentum's table, the task rows of it: +5 a ticked task and +25 for a day
 * with every task done, so a day of five ticks and the bonus is 50. Excused
 * days earn nothing: they are not done days, and a perfect day needs something
 * done.
 *
 * ── THE CURVE ──────────────────────────────────────────────────────────────
 *
 * Level L starts at 50·L·(L−1) XP: 0, 100, 300, 600, 1,000 … each level is 100
 * XP longer than the one before. Quadratic, so the first levels come within
 * days and the steps stay meaningful after years of ticks; a
 * flat step would turn into a level a day for a busy user, an exponential one
 * into a wall. Level 1 is where everybody starts, at 0.
 */

import type { LogFacts } from './achievements';
import { formatWhole } from './formatNumber';
import { t, type Language } from './i18n';

export type XpSource = 'tasksDone' | 'perfectDays';

/** THE weights table. Order is the level sheet's order. */
export const XP_WEIGHTS: readonly { source: XpSource; xp: number; label: string }[] = [
  { source: 'tasksDone', xp: 5, label: 'Tick a task' },
  { source: 'perfectDays', xp: 25, label: 'A day with every task done' },
];

/** How many of each source the log holds. */
function countOf(facts: LogFacts, source: XpSource): number {
  return facts[source].length;
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

/** Per source, in the table's order. Every figure ≥ 0. */
export function xpBreakdown(facts: LogFacts): XpLine[] {
  return XP_WEIGHTS.map(({ source, xp, label }) => {
    const count = countOf(facts, source);
    return { source, label, each: xp, count, xp: count * xp };
  });
}

/** The total. Same facts in, same number out; never below 0. */
export function totalXp(facts: LogFacts): number {
  return xpBreakdown(facts).reduce((sum, line) => sum + line.xp, 0);
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
    xp: formatWhole(progress.to),
    level: progress.level + 1,
  });
}
