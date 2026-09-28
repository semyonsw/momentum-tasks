import { describe, expect, it } from 'vitest';

import { quickCategoryId } from './quickCategory';

/** The round + in Finance opens on Food — and on something sensible without it. */

const row = (id: string, name: string, archivedAt: string | null = null) => ({
  id,
  name,
  archivedAt,
});

describe('quickCategoryId', () => {
  it('picks the food category wherever it sits', () => {
    expect(quickCategoryId([row('a', 'Transport'), row('b', '🍎 Food')])).toBe('b');
  });

  it('matches the Russian names, in any case', () => {
    expect(quickCategoryId([row('a', 'Транспорт'), row('b', 'Еда')])).toBe('b');
    expect(quickCategoryId([row('a', 'Дом'), row('b', 'Продукты')])).toBe('b');
  });

  it('skips an archived food category', () => {
    expect(quickCategoryId([row('a', 'Food', '2026-01-01'), row('b', 'Home')])).toBe('b');
  });

  it('falls back to the first live category', () => {
    expect(quickCategoryId([row('a', 'Old', '2026-01-01'), row('b', 'Home')])).toBe('b');
  });

  it('is null with nothing to pick', () => {
    expect(quickCategoryId([])).toBeNull();
    expect(quickCategoryId([row('a', 'Food', '2026-01-01')])).toBeNull();
  });
});
