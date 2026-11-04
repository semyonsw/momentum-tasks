/**
 * The engagement layer, read off the stores — the switch, and the facts the
 * badges are worked out from.
 *
 * ONE place that gathers the log, so the gallery, the count on the Settings
 * row and anything later built on the same facts cannot disagree. With the
 * switch off it computes nothing: the walk over the log is paid only by
 * somebody who asked for what it feeds.
 */

import { useMemo } from 'react';

import { achievements, logFacts, type Badge, type LogFacts } from '../lib/achievements';
import { engagementOn, engagementView, type EngagementView } from '../lib/engagement';
import { levelProgress, xpBreakdown, type LevelProgress, type XpLine } from '../lib/xp';
import { useSettings } from '../state/settingsStore';
import { useTasks } from '../state/tasksStore';
import { useToday } from './useToday';

/** Which pieces of the layer may appear, from the one switch. */
export function useEngagementView(): EngagementView {
  const on = useSettings((s) => engagementOn(s));
  return useMemo(() => engagementView(on), [on]);
}

/** Every series the badges read, or null while the switch is off. */
function useLogFacts(): LogFacts | null {
  const on = useSettings((s) => engagementOn(s));
  const today = useToday();
  const tasks = useTasks((s) => s.tasks);
  const log = useTasks((s) => s.log);
  return useMemo(() => (on ? logFacts({ today, tasks, log }) : null), [on, today, tasks, log]);
}

/** The badges, or an empty list while the switch is off. */
export function useBadges(): Badge[] {
  const facts = useLogFacts();
  return useMemo(() => (facts ? achievements(facts) : []), [facts]);
}

/** The level and its table, or null while the switch is off (E2). */
export function useLevel(): { progress: LevelProgress; lines: XpLine[] } | null {
  const facts = useLogFacts();
  return useMemo(() => {
    if (!facts) return null;
    const lines = xpBreakdown(facts);
    return { progress: levelProgress(lines.reduce((sum, line) => sum + line.xp, 0)), lines };
  }, [facts]);
}
