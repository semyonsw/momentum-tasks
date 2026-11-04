import { describe, expect, it } from 'vitest';

import {
  LAUNCH_BRAND,
  LAUNCH_CEILING_MS,
  LAUNCH_FLOOR_MS,
  LAUNCH_STORES,
  launchReady,
  launchTicks,
} from './launchReady';

/**
 * The launch screen's two decisions: whether the chip is ticked, and whether it
 * may leave. A splash that leaves too early is a flash of a half-built screen;
 * one that never leaves is an app that does not open.
 */

const stores = LAUNCH_STORES;

describe('the stage', () => {
  it('counts the stores that are ready', () => {
    expect(launchReady({ stores, ready: { tasks: false }, elapsedMs: 100 })).toMatchObject({
      stage: 0,
      fraction: 0,
    });
    expect(launchReady({ stores, ready: { tasks: true }, elapsedMs: 100 })).toMatchObject({
      stage: 1,
      fraction: 1,
    });
  });

  it('waits on the tasks, and only on them', () => {
    expect(stores).toEqual(['tasks']);
  });
});

describe('the floor', () => {
  it('does not leave before 2.3 s even when everything is ready', () => {
    expect(launchReady({ stores, ready: { tasks: true }, elapsedMs: 2299 }).exit).toBe(false);
  });

  it('leaves at 2.3 s once everything is ready', () => {
    expect(launchReady({ stores, ready: { tasks: true }, elapsedMs: LAUNCH_FLOOR_MS }).exit).toBe(
      true,
    );
  });

  it('waits past the floor for a store that is still loading', () => {
    expect(launchReady({ stores, ready: { tasks: false }, elapsedMs: 4000 }).exit).toBe(false);
  });
});

describe('the ceiling', () => {
  it('leaves at 6 s whatever the stores say', () => {
    expect(launchReady({ stores, ready: {}, elapsedMs: LAUNCH_CEILING_MS }).exit).toBe(true);
  });
});

describe('the ticks', () => {
  it('ticks nothing before the store is ready', () => {
    expect(launchTicks({ tasks: null }, 5000)).toEqual({ tasks: false });
  });

  it('paces a store that finished at once into the first slot', () => {
    expect(launchTicks({ tasks: 5 }, 699)).toEqual({ tasks: false });
    expect(launchTicks({ tasks: 5 }, 700)).toEqual({ tasks: true });
  });

  it('ticks a late store the moment it finishes, not at its slot', () => {
    expect(launchTicks({ tasks: 3000 }, 2999).tasks).toBe(false);
    expect(launchTicks({ tasks: 3000 }, 3000).tasks).toBe(true);
  });
});

describe('the brand', () => {
  it('names the app as its launcher does', () => {
    expect(LAUNCH_BRAND.wordmark).toBe('Tasks');
  });
});
