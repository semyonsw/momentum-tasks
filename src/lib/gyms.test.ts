import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GYM_ID,
  MAX_GYMS,
  activeGymPlates,
  addGym,
  gymsFromLegacyPlates,
  removeGym,
  resolveActiveGymId,
  sanitizeGyms,
  toggleGymPlate,
  updateGym,
  type Gym,
} from './gyms';
import { DEFAULT_PLATES_KG } from './plates';

/**
 * The gym list, as pure functions. `settingsStore.test.ts` covers the store's
 * wiring and `clampPlates`; this pins the list operations themselves, whose
 * failure mode is the plate label under every barbell weight going blank or
 * quietly describing the wrong building.
 */

const home: Gym = { id: 'home', name: 'Home rack', platesKg: [20, 10, 5, 2.5] };
const hotel: Gym = { id: 'hotel', name: 'Hotel', platesKg: [10, 5] };
const DEFAULTS = [...DEFAULT_PLATES_KG];
/** Not exported by `gyms.ts`; pinned here as the literal a migrated device shows. */
const DEFAULT_GYM_NAME = 'My gym';

function gyms(n: number): Gym[] {
  return Array.from({ length: n }, (_, i) => ({ id: `g${i}`, name: `G${i}`, platesKg: [20] }));
}

describe('gym names', () => {
  it('trims and caps at 40 characters', () => {
    expect(sanitizeGyms([{ id: 'a', name: '  Garage  ' }])[0].name).toBe('Garage');
    expect(sanitizeGyms([{ id: 'a', name: 'x'.repeat(60) }])[0].name).toHaveLength(40);
  });

  it('falls back to the generic name for empty, blank and non-string names', () => {
    for (const name of ['', '   ', 42, null]) {
      expect(sanitizeGyms([{ id: 'a', name }])[0].name).toBe(DEFAULT_GYM_NAME);
    }
  });
});

describe('gymsFromLegacyPlates', () => {
  it('turns the one legacy list into one default gym, losing nothing', () => {
    expect(gymsFromLegacyPlates([5, 20, 10])).toEqual([
      { id: DEFAULT_GYM_ID, name: DEFAULT_GYM_NAME, platesKg: [20, 10, 5] },
    ]);
  });

  it('gives the default plates for a missing or unusable legacy list', () => {
    expect(gymsFromLegacyPlates(undefined)[0].platesKg).toEqual(DEFAULTS);
    expect(gymsFromLegacyPlates([])[0].platesKg).toEqual(DEFAULTS);
  });
});

describe('sanitizeGyms', () => {
  it('is never empty', () => {
    for (const bad of [undefined, null, 'gyms', 3, {}, [], [null, 1, 'x']]) {
      const result = sanitizeGyms(bad);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(DEFAULT_GYM_ID);
      expect(result[0].platesKg).toEqual(DEFAULTS);
    }
  });

  it('keeps a valid list as it was', () => {
    expect(sanitizeGyms([home, hotel])).toEqual([home, hotel]);
  });

  it('drops rows without an id rather than inventing one', () => {
    const result = sanitizeGyms([{ name: 'No id', platesKg: [20] }, { id: '  ' }, home]);
    expect(result).toEqual([home]);
  });

  it('keeps the first of two rows sharing an id', () => {
    const result = sanitizeGyms([home, { ...home, name: 'Duplicate' }]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Home rack');
  });

  it('repairs a row with a bad name or plate list instead of dropping it', () => {
    expect(sanitizeGyms([{ id: 'x', name: '', platesKg: 'heavy' }])).toEqual([
      { id: 'x', name: DEFAULT_GYM_NAME, platesKg: DEFAULTS },
    ]);
  });

  it('sorts and dedupes each gym’s plates', () => {
    expect(sanitizeGyms([{ id: 'x', name: 'X', platesKg: [5, 20, 5, -1] }])[0].platesKg).toEqual([
      20, 5,
    ]);
  });

  it('caps the list at MAX_GYMS', () => {
    expect(sanitizeGyms(gyms(MAX_GYMS + 5))).toHaveLength(MAX_GYMS);
  });
});

describe('resolveActiveGymId', () => {
  it('returns the requested id when it exists', () => {
    expect(resolveActiveGymId([home, hotel], 'hotel')).toBe('hotel');
  });

  it('resolves a dangling or garbage pointer to the first gym', () => {
    expect(resolveActiveGymId([home, hotel], 'deleted')).toBe('home');
    expect(resolveActiveGymId([home, hotel], undefined)).toBe('home');
    expect(resolveActiveGymId([home, hotel], 7)).toBe('home');
  });

  it('falls back to the default id for an empty list', () => {
    expect(resolveActiveGymId([], 'home')).toBe(DEFAULT_GYM_ID);
  });
});

describe('activeGymPlates', () => {
  it('reads the active gym’s plates', () => {
    expect(activeGymPlates([home, hotel], 'hotel')).toEqual([10, 5]);
  });

  it('reads the first gym when the pointer dangles', () => {
    expect(activeGymPlates([home, hotel], 'gone')).toEqual(home.platesKg);
  });

  it('never returns an empty list, even for no gyms', () => {
    expect(activeGymPlates([], 'x')).toEqual(DEFAULTS);
  });
});

describe('addGym', () => {
  it('seeds the new gym from the ACTIVE gym’s plates', () => {
    const next = addGym([home, hotel], 'Garage', 'hotel', 'garage');
    expect(next).toHaveLength(3);
    expect(next[2]).toEqual({ id: 'garage', name: 'Garage', platesKg: [10, 5] });
  });

  it('names a nameless gym by its position, in the caller’s language', () => {
    expect(addGym([home], '  ', 'home', 'g2')[1].name).toBe('Gym 2');
    expect(addGym([home, hotel], '', 'home', 'g3', 'ru')[2].name).toBe('Зал 3');
  });

  it('does not mutate the input', () => {
    const list = [home];
    addGym(list, 'X', 'home', 'x');
    expect(list).toEqual([home]);
  });

  it('refuses at the cap', () => {
    const full = gyms(MAX_GYMS);
    const next = addGym(full, 'One more', 'g0', 'extra');
    expect(next).toHaveLength(MAX_GYMS);
    expect(next).not.toBe(full);
  });
});

describe('removeGym', () => {
  it('removes the named gym', () => {
    expect(removeGym([home, hotel], 'home')).toEqual([hotel]);
  });

  it('never removes the last gym', () => {
    expect(removeGym([home], 'home')).toEqual([home]);
  });

  it('is a no-op copy for an unknown id', () => {
    const list = [home, hotel];
    const next = removeGym(list, 'nope');
    expect(next).toEqual(list);
    expect(next).not.toBe(list);
  });
});

describe('updateGym', () => {
  it('renames one gym and leaves the others alone', () => {
    const next = updateGym([home, hotel], 'hotel', { name: ' Airbnb ' });
    expect(next[1].name).toBe('Airbnb');
    expect(next[0]).toBe(home);
  });

  it('keeps the old name when the new one is blank', () => {
    expect(updateGym([home], 'home', { name: '   ' })[0].name).toBe('Home rack');
  });

  it('sanitizes a new plate list', () => {
    expect(updateGym([home], 'home', { platesKg: [5, 25, 5] })[0].platesKg).toEqual([25, 5]);
  });

  it('ignores a patch for an unknown id', () => {
    expect(updateGym([home], 'nope', { name: 'X' })).toEqual([home]);
  });
});

describe('toggleGymPlate', () => {
  it('removes a plate the gym has', () => {
    expect(toggleGymPlate([home], 'home', 5)[0].platesKg).toEqual([20, 10, 2.5]);
  });

  it('adds a plate the gym lacks, in heaviest-first order', () => {
    expect(toggleGymPlate([hotel], 'hotel', 25)[0].platesKg).toEqual([25, 10, 5]);
    expect(toggleGymPlate([hotel], 'hotel', 1.25)[0].platesKg).toEqual([10, 5, 1.25]);
  });

  it('refuses to remove the last plate (which would read as "restored all of them")', () => {
    const solo: Gym = { id: 's', name: 'S', platesKg: [20] };
    expect(toggleGymPlate([solo], 's', 20)[0].platesKg).toEqual([20]);
  });

  it('touches only the named gym', () => {
    const next = toggleGymPlate([home, hotel], 'hotel', 2.5);
    expect(next[0]).toEqual(home);
    expect(next[1].platesKg).toEqual([10, 5, 2.5]);
  });

  it('is a no-op for an unknown gym', () => {
    expect(toggleGymPlate([home], 'nope', 5)).toEqual([home]);
  });

  it('round-trips: toggling twice restores the list', () => {
    expect(toggleGymPlate(toggleGymPlate([home], 'home', 15), 'home', 15)).toEqual([home]);
  });
});
