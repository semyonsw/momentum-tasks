import { describe, expect, it } from 'vitest';

import { droppedEntries, removeById, restoreAt } from './chatArchive';

const rows = ['a', 'b', 'c', 'd'].map((id) => ({ id, title: id.toUpperCase() }));

describe('removeById', () => {
  it('takes the row out and says where it stood', () => {
    const taken = removeById(rows, 'c');
    expect(taken?.list.map((r) => r.id)).toEqual(['a', 'b', 'd']);
    expect(taken?.removed).toEqual({ item: rows[2], index: 2 });
  });

  it('is null for a row that is not there, and never mutates', () => {
    expect(removeById(rows, 'zz')).toBeNull();
    removeById(rows, 'a');
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('restoreAt', () => {
  it('puts a row back exactly where it was — first, middle and last', () => {
    for (const id of ['a', 'b', 'd']) {
      const taken = removeById(rows, id)!;
      expect(restoreAt(taken.list, taken.removed)).toEqual(rows);
    }
  });

  it('clamps when the list got shorter in between', () => {
    const taken = removeById(rows, 'd')!;
    const shorter = removeById(taken.list, 'c')!.list;
    expect(restoreAt(shorter, taken.removed).map((r) => r.id)).toEqual(['a', 'b', 'd']);
  });

  it('is a no-op the second time', () => {
    const taken = removeById(rows, 'b')!;
    const once = restoreAt(taken.list, taken.removed);
    expect(restoreAt(once, taken.removed)).toEqual(rows);
  });

  it('keeps the cap, dropping the oldest', () => {
    const taken = removeById(rows, 'a')!;
    const full = [...taken.list, { id: 'e', title: 'E' }];
    expect(restoreAt(full, taken.removed, 4).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('droppedEntries', () => {
  it('returns what the second record lost', () => {
    expect(droppedEntries({ p1: 1, p2: 2, p3: 3 }, { p1: 1, p3: 3 })).toEqual({ p2: 2 });
    expect(droppedEntries({ p1: 1 }, { p1: 1 })).toEqual({});
  });
});
