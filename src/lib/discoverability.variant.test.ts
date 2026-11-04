import { describe, expect, it } from 'vitest';

import { APP_VARIANTS } from './appVariant';
import { HOLD_SURFACES, holdSurfaces, settingsRoutes } from './discoverability';

/** Since 3.0.0 each app finds its own section's doors and no other's. */

describe('the doors each app has', () => {
  it('leads Settings with the app’s own section row only', () => {
    expect(settingsRoutes('workout')).toEqual(['workoutSettings']);
    expect(settingsRoutes('tasks')).toEqual(['taskSettings']);
    expect(settingsRoutes('expenses')).toEqual(['moneySettings']);
  });

  it('draws only its own section’s hold surfaces', () => {
    expect(holdSurfaces('workout')).toEqual(['exerciseCard', 'routineDie']);
    expect(holdSurfaces('tasks')).toEqual(['taskRow']);
    expect(holdSurfaces('expenses')).toEqual(['moneyAccount', 'moneyCategory']);
  });

  it('between the three apps, still finds every surface exactly once', () => {
    const all = APP_VARIANTS.flatMap((variant) => holdSurfaces(variant));
    expect([...all].sort()).toEqual([...HOLD_SURFACES].sort());
  });
});
