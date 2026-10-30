/**
 * The warm-up offer — "you ticked 60 under three 80s; was that a warm-up?"
 *
 * The bug this exists for: an unmarked warm-up's ✓ carried its weight down over
 * every working set, and the session (then the log, then the next prefill) said
 * 60 where the lifter did 80. The `it`s below pin when the question is asked —
 * and, just as much, when it must not be.
 */

import { describe, expect, it } from 'vitest';

import { carryWeightForward } from './weightCarry';
import { WARMUP_GAP, acceptWarmupOffer, warmupOfferFor, warmupToggleRows } from './warmupOffer';
import type { DraftSet } from './draft';

function set(localId: string, weightKg: number | null, extra: Partial<DraftSet> = {}): DraftSet {
  return {
    localId,
    weightKg,
    count: 8,
    isWarmup: false,
    isCompleted: false,
    completedAt: null,
    isPrefilled: true,
    ...extra,
  };
}

const done = { isCompleted: true, isPrefilled: false } as const;

describe('warmupOfferFor', () => {
  it('offers on a first set clearly lighter than the planned rows below', () => {
    const sets = [set('a', 60, done), set('b', 80), set('c', 80), set('d', 80)];
    const offer = warmupOfferFor(sets, 'e1', 'a');
    expect(offer).toMatchObject({ entryId: 'e1', setId: 'a', carriedKg: 60, keepKg: 80 });
    expect(offer?.restore.map((r) => r.setId)).toEqual(['b', 'c', 'd']);
  });

  it('keeps the heaviest planned weight as the one to keep', () => {
    const sets = [set('a', 40, done), set('b', 70), set('c', 80)];
    expect(warmupOfferFor(sets, 'e', 'a')?.keepKg).toBe(80);
  });

  it('does not offer when the gap is small — that is a lighter day', () => {
    const sets = [set('a', 75, done), set('b', 80), set('c', 80)];
    expect(warmupOfferFor(sets, 'e', 'a')).toBeNull();
  });

  it('offers exactly at the gap boundary', () => {
    const sets = [set('a', 100 * WARMUP_GAP, done), set('b', 100)];
    expect(warmupOfferFor(sets, 'e', 'a')).not.toBeNull();
  });

  it('does not offer once another working set has been logged', () => {
    const sets = [set('a', 80, done), set('b', 60, done), set('c', 80)];
    expect(warmupOfferFor(sets, 'e', 'b')).toBeNull();
  });

  it('still offers when the only logged set above is an already-marked warm-up', () => {
    const sets = [set('w', 40, { ...done, isWarmup: true }), set('a', 60, done), set('b', 100)];
    expect(warmupOfferFor(sets, 'e', 'a')?.keepKg).toBe(100);
  });

  it('never offers on a set already marked warm-up, drop, failure or AMRAP', () => {
    for (const extra of [
      { isWarmup: true },
      { setType: 'drop' as const },
      { setType: 'failure' as const },
      { setType: 'amrap' as const },
    ]) {
      const sets = [set('a', 60, { ...done, ...extra }), set('b', 80)];
      expect(warmupOfferFor(sets, 'e', 'a')).toBeNull();
    }
  });

  it('does not offer on the last row, with nothing planned below', () => {
    expect(warmupOfferFor([set('a', 60, done)], 'e', 'a')).toBeNull();
  });

  it('ignores warm-up and drop rows below when finding the plan', () => {
    const sets = [
      set('a', 60, done),
      set('w', 90, { isWarmup: true }),
      set('d', 120, { setType: 'drop' }),
      set('b', 62.5),
    ];
    expect(warmupOfferFor(sets, 'e', 'a')).toBeNull();
  });

  it('returns null for an empty weight, an unknown id or unweighted rows below', () => {
    expect(warmupOfferFor([set('a', null, done), set('b', 80)], 'e', 'a')).toBeNull();
    expect(warmupOfferFor([set('a', 60, done), set('b', 80)], 'e', 'zz')).toBeNull();
    expect(warmupOfferFor([set('a', 60, done), set('b', null)], 'e', 'a')).toBeNull();
  });
});

describe('acceptWarmupOffer', () => {
  /** The whole sequence the store runs: ✓, carry, offer, accept. */
  function tickThenAccept(sets: DraftSet[], id: string) {
    const logged = sets.map((s) => (s.localId === id ? { ...s, ...done } : s));
    const offer = warmupOfferFor(logged, 'e', id);
    const carried = carryWeightForward(logged, id);
    return { offer, carried, accepted: offer ? acceptWarmupOffer(carried, offer) : carried };
  }

  it('marks the set a warm-up and puts the planned weights back', () => {
    const { carried, accepted } = tickThenAccept(
      [set('a', 60), set('b', 80), set('c', 80), set('d', 85)],
      'a',
    );
    expect(carried.map((s) => s.weightKg)).toEqual([60, 60, 60, 60]);
    expect(accepted.map((s) => s.weightKg)).toEqual([60, 80, 80, 85]);
    expect(accepted[0].isWarmup).toBe(true);
    expect(accepted[0].isCompleted).toBe(true);
  });

  it('restores the ghost styling the rows had before the carry', () => {
    const { accepted } = tickThenAccept([set('a', 60), set('b', 80)], 'a');
    expect(accepted[1].isPrefilled).toBe(true);
  });

  it('leaves a row the user edited or logged since the carry alone', () => {
    const { offer, carried } = tickThenAccept([set('a', 60), set('b', 80), set('c', 80)], 'a');
    const later = carried.map((s) =>
      s.localId === 'b' ? { ...s, weightKg: 70 } : s.localId === 'c' ? { ...s, ...done } : s,
    );
    const accepted = acceptWarmupOffer(later, offer!);
    expect(accepted[1].weightKg).toBe(70);
    expect(accepted[2]).toBe(later[2]);
  });

  it('drops any drop/failure/AMRAP type when the set becomes a warm-up', () => {
    const offer = warmupOfferFor([set('a', 60, done), set('b', 80)], 'e', 'a')!;
    const accepted = acceptWarmupOffer([set('a', 60, { ...done, setType: 'failure' })], offer);
    expect(accepted[0].isWarmup).toBe(true);
    expect(accepted[0].setType).toBeUndefined();
  });
});

describe('warmupToggleRows', () => {
  it('offers the checkbox on every row of an exercise not yet started', () => {
    expect(warmupToggleRows([set('a', 60), set('b', 80), set('c', 80)])).toEqual([
      true,
      true,
      true,
    ]);
  });

  it('keeps it on an unlogged warm-up, so it can be unticked', () => {
    expect(warmupToggleRows([set('a', 60, { isWarmup: true }), set('b', 80)])).toEqual([
      true,
      true,
    ]);
  });

  it('hides it on logged rows, and below the first logged working set', () => {
    expect(
      warmupToggleRows([
        set('w', 40, { ...done, isWarmup: true }),
        set('a', 80, done),
        set('b', 80),
      ]),
    ).toEqual([false, false, false]);
  });

  it('a logged warm-up does not close the question for the rows below', () => {
    expect(warmupToggleRows([set('w', 40, { ...done, isWarmup: true }), set('b', 80)])).toEqual([
      false,
      true,
    ]);
  });

  it('never on a drop, failure or AMRAP row', () => {
    expect(
      warmupToggleRows([
        set('d', 60, { setType: 'drop' }),
        set('f', 60, { setType: 'failure' }),
        set('m', 60, { setType: 'amrap' }),
      ]),
    ).toEqual([false, false, false]);
  });
});
