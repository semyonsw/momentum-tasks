import { describe, expect, it } from 'vitest';

import { EXIT_WINDOW_MS, NAV_SLOTS, backAction, edgeBackCommits, slideDir } from './sectionNav';

describe('edgeBackCommits', () => {
  it('pops past 120 dp or on a flick', () => {
    expect(edgeBackCommits(130, 0)).toBe(true);
    expect(edgeBackCommits(40, 0.9)).toBe(true);
    expect(edgeBackCommits(100, 0.3)).toBe(false);
  });
});

describe('backAction', () => {
  const base = {
    sheetOpen: false,
    stackDepth: 0,
    route: 'Tasks' as const,
    exitArmedAt: null,
    now: 10_000,
  };

  it('closes a sheet before anything else', () => {
    expect(backAction({ ...base, sheetOpen: true, stackDepth: 2 })).toBe('closeSheet');
  });

  it('pops a pushed screen, then goes back to the tasks from Settings', () => {
    expect(backAction({ ...base, route: 'Settings', stackDepth: 1 })).toBe('pop');
    expect(backAction({ ...base, route: 'Settings' })).toBe('root');
  });

  it('arms the exit on the tasks, and exits on a second press inside two seconds', () => {
    expect(backAction(base)).toBe('armExit');
    expect(backAction({ ...base, exitArmedAt: 9_000 })).toBe('exit');
    expect(backAction({ ...base, exitArmedAt: 10_000 - EXIT_WINDOW_MS - 1 })).toBe('armExit');
  });
});

describe('NAV_SLOTS', () => {
  it('puts the two-item bar at the quarters, with no gap left for a Home button', () => {
    expect(NAV_SLOTS).toEqual({ Tasks: 0.25, Settings: 0.75 });
  });
});

describe('slideDir', () => {
  it('slides the way the blob goes on the bar', () => {
    expect(slideDir('Tasks', 'Settings')).toBe(1);
    expect(slideDir('Settings', 'Tasks')).toBe(-1);
  });
});
