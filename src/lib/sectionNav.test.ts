import { describe, expect, it } from 'vitest';

import { APP_VARIANTS, variantSections } from './appVariant';
import {
  EXIT_WINDOW_MS,
  backAction,
  edgeBackCommits,
  navSlots,
  shellRoot,
  slideDir,
} from './sectionNav';

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
    route: 'Workout' as const,
    root: 'Workout' as const,
    exitArmedAt: null,
    now: 10_000,
  };

  it('closes a sheet before anything else', () => {
    expect(backAction({ ...base, sheetOpen: true, stackDepth: 2 })).toBe('closeSheet');
  });

  it('pops a pushed screen, then goes back to the app’s own section from Settings', () => {
    expect(backAction({ ...base, route: 'Settings', stackDepth: 1 })).toBe('pop');
    expect(backAction({ ...base, route: 'Settings' })).toBe('root');
  });

  it('arms the exit on the root, and exits on a second press inside two seconds', () => {
    expect(backAction(base)).toBe('armExit');
    expect(backAction({ ...base, exitArmedAt: 9_000 })).toBe('exit');
    expect(backAction({ ...base, exitArmedAt: 10_000 - EXIT_WINDOW_MS - 1 })).toBe('armExit');
  });

  it('arms the exit on each app’s own section, never on Settings', () => {
    for (const variant of APP_VARIANTS) {
      const root = shellRoot(variant);
      expect(backAction({ ...base, route: root, root })).toBe('armExit');
      expect(backAction({ ...base, route: 'Settings', root })).toBe('root');
    }
  });
});

describe('shellRoot', () => {
  it('opens each app on its own section', () => {
    expect(shellRoot('workout')).toBe('Workout');
    expect(shellRoot('tasks')).toBe('Tasks');
    expect(shellRoot('expenses')).toBe('Expenses');
  });
});

describe('navSlots', () => {
  it('puts a two-item bar at the quarters, with no gap left for a Home button', () => {
    expect(navSlots(['Tasks', 'Settings'])).toEqual({ Tasks: 0.25, Settings: 0.75 });
  });

  it('places only the sections it is given', () => {
    for (const variant of APP_VARIANTS) {
      expect(Object.keys(navSlots(variantSections(variant)))).toEqual([
        shellRoot(variant),
        'Settings',
      ]);
    }
  });
});

describe('slideDir', () => {
  it('slides the way the blob goes on the bar the app draws', () => {
    const bar = variantSections('expenses');
    expect(slideDir(bar, 'Expenses', 'Settings')).toBe(1);
    expect(slideDir(bar, 'Settings', 'Expenses')).toBe(-1);
  });
});
