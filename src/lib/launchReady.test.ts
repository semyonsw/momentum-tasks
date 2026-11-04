import { describe, expect, it } from 'vitest';

import { APP_VARIANTS } from './appVariant';
import {
  LAUNCH_CEILING_MS,
  LAUNCH_FLOOR_MS,
  launchBrand,
  launchReady,
  launchStores,
  launchTicks,
} from './launchReady';

/**
 * The launch screen's two decisions: which chips are ticked, and whether it may
 * leave. A splash that leaves too early is a flash of a half-built screen; one
 * that never leaves is an app that does not open.
 */

const none = { history: null, tasks: null, money: null };
const all = ['history', 'tasks', 'money'] as const;

describe('the stage', () => {
  it('counts the stores that are ready', () => {
    const state = launchReady({
      stores: all,
      ready: { history: true, tasks: false, money: true },
      elapsedMs: 100,
    });
    expect(state.stage).toBe(2);
    expect(state.fraction).toBeCloseTo(2 / 3);
  });

  it('counts only the stores this app waits on', () => {
    const state = launchReady({
      stores: ['tasks'],
      ready: { history: true, money: true },
      elapsedMs: 100,
    });
    expect(state.stage).toBe(0);
    expect(state.fraction).toBe(0);
  });
});

describe('the stores each app waits on', () => {
  it('is its own log, and only that', () => {
    expect(launchStores('workout')).toEqual(['history']);
    expect(launchStores('tasks')).toEqual(['tasks']);
    expect(launchStores('expenses')).toEqual(['money']);
  });

  it('leaves the Tasks app at the floor without the workout log ever loading', () => {
    expect(
      launchReady({
        stores: launchStores('tasks'),
        ready: { tasks: true, history: false },
        elapsedMs: LAUNCH_FLOOR_MS,
      }).exit,
    ).toBe(true);
  });
});

describe('the floor', () => {
  it('does not leave before 2.3 s even when everything is ready', () => {
    expect(
      launchReady({
        stores: all,
        ready: { history: true, tasks: true, money: true },
        elapsedMs: 2299,
      }).exit,
    ).toBe(false);
  });

  it('leaves at 2.3 s once everything is ready', () => {
    expect(
      launchReady({
        stores: all,
        ready: { history: true, tasks: true, money: true },
        elapsedMs: LAUNCH_FLOOR_MS,
      }).exit,
    ).toBe(true);
  });

  it('waits past the floor for a store that is still loading', () => {
    expect(
      launchReady({
        stores: all,
        ready: { history: true, tasks: false, money: true },
        elapsedMs: 4000,
      }).exit,
    ).toBe(false);
  });
});

describe('the ceiling', () => {
  it('leaves at 6 s whatever the stores say', () => {
    expect(launchReady({ stores: all, ready: {}, elapsedMs: LAUNCH_CEILING_MS }).exit).toBe(true);
  });
});

describe('the ticks', () => {
  it('ticks nothing before a store is ready', () => {
    expect(launchTicks(none, 5000)).toEqual({ history: false, tasks: false, money: false });
  });

  it('paces stores that finish at once into the three slots, in chip order', () => {
    const at = { history: 5, tasks: 5, money: 5 };
    expect(launchTicks(at, 699)).toEqual({ history: false, tasks: false, money: false });
    expect(launchTicks(at, 700)).toEqual({ history: true, tasks: false, money: false });
    expect(launchTicks(at, 1150)).toEqual({ history: true, tasks: true, money: false });
    expect(launchTicks(at, 1600)).toEqual({ history: true, tasks: true, money: true });
  });

  it('ticks in the order the stores actually finished', () => {
    const at = { history: 40, tasks: 900, money: 10 };
    // money finished first, so it takes the first slot.
    expect(launchTicks(at, 700)).toEqual({ history: false, tasks: false, money: true });
    expect(launchTicks(at, 1150)).toEqual({ history: true, tasks: false, money: true });
    expect(launchTicks(at, 1600)).toEqual({ history: true, tasks: true, money: true });
  });

  it('ticks a late store the moment it finishes, not at its slot', () => {
    const at = { history: 5, tasks: 5, money: 3000 };
    expect(launchTicks(at, 2999).money).toBe(false);
    expect(launchTicks(at, 3000).money).toBe(true);
  });

  it('gives a one-store app the first slot, not the slot its chip had among three', () => {
    const at = { history: 5, tasks: 5, money: 5 };
    expect(launchTicks(at, 700, ['money'])).toEqual({
      history: false,
      tasks: false,
      money: true,
    });
  });
});

describe('the brand', () => {
  it('names each app as its launcher does', () => {
    expect(APP_VARIANTS.map((v) => launchBrand(v).wordmark)).toEqual([
      'Workout',
      'Tasks',
      'Expenses',
    ]);
  });
});
