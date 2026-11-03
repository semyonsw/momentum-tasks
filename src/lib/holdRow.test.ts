/**
 * The hold row's settle window. A double-tap on Start used to land its second tap
 * on Stop, ending a hold at 0 s that the user had just started.
 */

import { describe, expect, it } from 'vitest';

import { HOLD_ROW_SETTLE_MS, acceptsHoldRowPress, holdRowPhase } from './holdRow';

const T0 = 1_800_000_000_000;

describe('acceptsHoldRowPress', () => {
  it('ignores the second tap of a double-tap that lands on the new row', () => {
    // Start → [+15][Stop][✕]; the bounce 120 ms later would have hit Stop.
    expect(acceptsHoldRowPress(T0, T0 + 120)).toBe(false);
    expect(acceptsHoldRowPress(T0, T0 + HOLD_ROW_SETTLE_MS - 1)).toBe(false);
  });

  it('takes a deliberate press once the row has settled', () => {
    expect(acceptsHoldRowPress(T0, T0 + HOLD_ROW_SETTLE_MS)).toBe(true);
    expect(acceptsHoldRowPress(T0, T0 + 5_000)).toBe(true);
  });

  it('takes the first press on a row that has not changed since it appeared', () => {
    expect(acceptsHoldRowPress(null, T0)).toBe(true);
  });
});

describe('holdRowPhase', () => {
  it('names the three rows the controls switch between', () => {
    expect(holdRowPhase(null)).toBe('idle');
    expect(holdRowPhase(undefined)).toBe('idle');
    expect(holdRowPhase('prepare')).toBe('prepare');
    expect(holdRowPhase('work')).toBe('running');
  });

  it('treats the bell as the running row, so it is not a change of its own', () => {
    expect(holdRowPhase('over')).toBe('running');
  });
});
