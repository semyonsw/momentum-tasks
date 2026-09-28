import { describe, expect, it } from 'vitest';

import {
  BLOB_HALF,
  BLOB_STRETCH,
  EXIT_WINDOW_MS,
  SECTIONS,
  backAction,
  blobEdges,
  edgeBackCommits,
  isHorizontalSwipe,
  stepSection,
  swipeDecision,
  swipeFollow,
  usableRoute,
  type SectionTab,
} from './sectionNav';

/**
 * The swipe, as arithmetic.
 *
 * Four sections and one rule, and the rule is the one worth pinning: the ends
 * CLAMP. Wrapping would make `Workout` and `Settings` adjacent — the two screens
 * with the least to do with each other — so a flick past the first section would
 * land on the last, and the gesture would stop meaning "the next one along".
 */
describe('stepSection', () => {
  it('moves one along in each direction', () => {
    expect(stepSection('Workout', 1)).toBe('Tasks');
    expect(stepSection('Tasks', 1)).toBe('Expenses');
    expect(stepSection('Expenses', 1)).toBe('Settings');
    expect(stepSection('Settings', -1)).toBe('Expenses');
    expect(stepSection('Tasks', -1)).toBe('Workout');
  });

  it('stays put at either end rather than wrapping', () => {
    expect(stepSection('Workout', -1)).toBe('Workout');
    expect(stepSection('Settings', 1)).toBe('Settings');
  });

  it('answers with the first section for a tab this build does not have', () => {
    // A tab name persisted by an older build is a thing that happens.
    expect(stepSection('Money' as never, 1)).toBe('Workout');
  });

  it('walks the whole row and back', () => {
    let at: SectionTab = SECTIONS[0];
    for (let i = 1; i < SECTIONS.length; i += 1) at = stepSection(at, 1);
    expect(at).toBe(SECTIONS[SECTIONS.length - 1]);
    for (let i = 1; i < SECTIONS.length; i += 1) at = stepSection(at, -1);
    expect(at).toBe(SECTIONS[0]);
  });
});

describe('usableRoute', () => {
  it('keeps Home and the four sections, and lands anything else on Home', () => {
    expect(usableRoute('Home')).toBe('Home');
    expect(usableRoute('Tasks')).toBe('Tasks');
    expect(usableRoute('History')).toBe('Home');
    expect(usableRoute(undefined)).toBe('Home');
  });
});

describe('blobEdges', () => {
  it('rests at its own width on a slot', () => {
    expect(blobEdges(44, 110, 0)).toEqual({ left: 14, right: 74 });
    expect(blobEdges(44, 110, 1)).toEqual({ left: 80, right: 140 });
  });

  it('stretches by the full 16 half-way, and never goes negative', () => {
    const mid = blobEdges(44, 110, 0.5);
    expect(mid.right - mid.left).toBeCloseTo(2 * (BLOB_HALF + BLOB_STRETCH));
    expect(blobEdges(44, 110, -3)).toEqual(blobEdges(44, 110, 0));
  });
});

describe('the section swipe', () => {
  it('locks only on a clearly horizontal drag', () => {
    expect(isHorizontalSwipe(12, 2)).toBe(true);
    expect(isHorizontalSwipe(8, 0)).toBe(false);
    expect(isHorizontalSwipe(20, 18)).toBe(false);
  });

  it('follows at 0.55, and rubber-bands at 0.22 past either end', () => {
    expect(swipeFollow(-100, 'Tasks')).toBeCloseTo(-55);
    expect(swipeFollow(100, 'Workout')).toBeCloseTo(22);
    expect(swipeFollow(-100, 'Settings')).toBeCloseTo(-22);
    expect(swipeFollow(100, 'Settings')).toBeCloseTo(55);
  });

  it('commits past 90 dp or on a fast flick, and springs back otherwise', () => {
    expect(swipeDecision(-120, 0, 'Workout')).toBe(1);
    expect(swipeDecision(40, 0.8, 'Tasks')).toBe(-1);
    expect(swipeDecision(-60, 0.2, 'Tasks')).toBe(0);
  });

  it('does not step off either end', () => {
    expect(swipeDecision(200, 0, 'Workout')).toBe(0);
    expect(swipeDecision(-200, 0, 'Settings')).toBe(0);
  });
});

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
