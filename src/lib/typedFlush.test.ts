import { describe, expect, it } from 'vitest';

import { flushThen, typedPatch } from './typedFlush';
import { kgToLb } from './units';

describe('typedPatch', () => {
  it('reads a typed weight in the user units, comma or point', () => {
    expect(typedPatch('weight', '85', 'metric', 'reps')).toEqual({ weightKg: 85 });
    expect(typedPatch('weight', '82,5', 'metric', 'reps')).toEqual({ weightKg: 82.5 });
    const lb = typedPatch('weight', '185', 'imperial', 'reps');
    expect(kgToLb(lb!.weightKg!)).toBeCloseTo(185);
  });

  it('reads a typed count in the unit the field shows', () => {
    expect(typedPatch('count', '8', 'metric', 'reps')).toEqual({ count: 8 });
    expect(typedPatch('count', '1:30', 'metric', 'seconds')).toEqual({ count: 90 });
  });

  it('makes no patch for nothing typed, a non-number, or no field', () => {
    expect(typedPatch('weight', '', 'metric', 'reps')).toBeNull();
    expect(typedPatch('weight', 'abc', 'metric', 'reps')).toBeNull();
    expect(typedPatch('count', '', 'metric', 'reps')).toBeNull();
    expect(typedPatch(null, '85', 'metric', 'reps')).toBeNull();
  });
});

describe('flushThen', () => {
  // Regression: typing 85 then tapping the row's ✓ logged the set at the old 80
  // (and carried 80 forward), because the editor closed before it committed.
  it('logs the typed weight when the row ✓ is tapped mid-type', () => {
    const store = { weightKg: 80, logged: null as number | null };
    const buffer = '85';
    const flush = () => {
      const patch = typedPatch('weight', buffer, 'metric', 'reps');
      if (patch?.weightKg != null) store.weightKg = patch.weightKg;
    };
    flushThen(flush, () => {
      store.logged = store.weightKg;
    });
    expect(store.logged).toBe(85);
  });

  it('commits before acting, every time', () => {
    const order: string[] = [];
    flushThen(
      () => order.push('flush'),
      () => order.push('act'),
    );
    expect(order).toEqual(['flush', 'act']);
  });

  it('acts with no editor open', () => {
    let acted = false;
    flushThen(null, () => {
      acted = true;
    });
    expect(acted).toBe(true);
  });
});
