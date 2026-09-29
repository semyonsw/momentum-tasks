/**
 * Which builds of the roots are mounted on the stage, and which one to build
 * next — the bookkeeping behind `navigation/ShellStage.tsx`'s pre-built sections.
 *
 * A BUILD is one mount of one root. It is either SEEN (it has been on screen:
 * the route, or one end of a transition) or a SPARE (built early, hidden, never
 * shown). The two rules that keep a spare indistinguishable from a mount at
 * arrival:
 *
 *   - a seen build that is no longer live is DROPPED, never parked — leaving a
 *     section throws it away, so coming back finds a fresh one, scrolled to the
 *     top with its panels closed, exactly as when it was mounted on arrival;
 *   - a spare that goes live KEEPS its id, which is the React key, so the mount
 *     that was paid for early is the one that shows.
 *
 * Only the four sections get spares. Home is not on the swipe row, and the one
 * way into it (a section closing into its tile) is not the hitch being fixed.
 */

import { SECTIONS, type SectionTab, type ShellRoute } from './sectionNav';

export interface Build {
  id: number;
  seen: boolean;
}

export interface StageBuilds {
  nextId: number;
  builds: Partial<Record<ShellRoute, Build>>;
}

export function initialBuilds(route: ShellRoute): StageBuilds {
  return { nextId: 1, builds: { [route]: { id: 0, seen: true } } };
}

/**
 * The builds once `live` is on stage: every live root has one (a spare's, or a
 * new one), and every seen root that is no longer live is gone. Returns the same
 * object when nothing changed, so a render can compare it by reference.
 */
export function reconcileBuilds(stage: StageBuilds, live: readonly ShellRoute[]): StageBuilds {
  let { nextId } = stage;
  const builds: Partial<Record<ShellRoute, Build>> = {};
  let changed = false;
  for (const [route, build] of Object.entries(stage.builds) as [ShellRoute, Build][]) {
    const isLive = live.includes(route);
    if (build.seen && !isLive) {
      changed = true;
      continue;
    }
    if (isLive && !build.seen) {
      builds[route] = { id: build.id, seen: true };
      changed = true;
    } else builds[route] = build;
  }
  for (const route of live) {
    if (builds[route]) continue;
    builds[route] = { id: nextId, seen: true };
    nextId += 1;
    changed = true;
  }
  return changed ? { nextId, builds } : stage;
}

/**
 * The section to build next, or null when all four are mounted: the nearest to
 * `route` first, since that is the one a swipe reaches. From Home, left to right.
 */
export function nextSpare(stage: StageBuilds, route: ShellRoute): SectionTab | null {
  const at = route === 'Home' ? 0 : SECTIONS.indexOf(route);
  const missing = SECTIONS.filter((section) => !stage.builds[section]);
  if (missing.length === 0) return null;
  return missing.reduce((best, section) =>
    Math.abs(SECTIONS.indexOf(section) - at) < Math.abs(SECTIONS.indexOf(best) - at)
      ? section
      : best,
  );
}

/** The stage with `section` built as a spare, unless it is already mounted. */
export function addSpare(stage: StageBuilds, section: SectionTab): StageBuilds {
  if (stage.builds[section]) return stage;
  return {
    nextId: stage.nextId + 1,
    builds: { ...stage.builds, [section]: { id: stage.nextId, seen: false } },
  };
}
