import { describe, expect, it } from 'vitest';

import { EXIT_WINDOW_MS, backAction, edgeBackCommits } from './sectionNav';

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
    route: 'Home' as const,
    exitArmedAt: null,
    now: 10_000,
  };

  it('closes a sheet before anything else', () => {
    expect(backAction({ ...base, sheetOpen: true, stackDepth: 2 })).toBe('closeSheet');
  });

  it('pops a pushed screen, then goes Home from a section', () => {
    expect(backAction({ ...base, route: 'Tasks', stackDepth: 1 })).toBe('pop');
    expect(backAction({ ...base, route: 'Tasks' })).toBe('home');
  });

  it('arms the exit on Home, and exits on a second press inside two seconds', () => {
    expect(backAction(base)).toBe('armExit');
    expect(backAction({ ...base, exitArmedAt: 9_000 })).toBe('exit');
    expect(backAction({ ...base, exitArmedAt: 10_000 - EXIT_WINDOW_MS - 1 })).toBe('armExit');
  });
});
