import { describe, expect, it } from 'vitest';

import type { CompletedWorkout } from './completedWorkout';
import {
  describeMilestone,
  isMilestone,
  milestoneAfterSave,
  milestoneCard,
  milestoneDue,
  usableMilestone,
} from './milestones';

/**
 * Milestones (E4): which numbers, and SHOWN EXACTLY ONCE — across re-opening
 * the sheet, an edited history that reaches the number again, and the switch.
 */

const workout = (day: string, setCount: number): CompletedWorkout => ({
  id: `w${day}`,
  title: 'Push',
  startedAt: `${day}T10:00:00.000Z`,
  endedAt: `${day}T11:00:00.000Z`,
  durationMinutes: 60,
  setCount,
  totalVolumeKg: 1000,
  volumeIsPartial: false,
  exercises: [],
  sets: [],
});

describe('which workouts are milestones', () => {
  it('50, 100, 250, 500, then every 500', () => {
    const hits = Array.from({ length: 3000 }, (_, i) => i + 1).filter(isMilestone);
    expect(hits).toEqual([50, 100, 250, 500, 1000, 1500, 2000, 2500, 3000]);
  });

  it('49, 99, 101 and junk are not', () => {
    for (const n of [0, 1, 49, 51, 99, 101, 249, 499, 750, -100, 100.5, NaN]) {
      expect(isMilestone(n), String(n)).toBe(false);
    }
  });
});

describe('shown exactly once', () => {
  it('the 100th finish shows "Workout 100"', () => {
    expect(milestoneDue({ on: true, workoutNumber: 100, shown: 50 })).toBe(100);
    expect(milestoneDue({ on: true, workoutNumber: 99, shown: 50 })).toBeNull();
  });

  it('re-opening the sheet before saving shows the same card — it is still that finish', () => {
    const input = { on: true, workoutNumber: 100, shown: 50 };
    expect(milestoneDue(input)).toBe(100);
    expect(milestoneDue(input)).toBe(100);
  });

  it('after the save it never shows again — not on re-opening, not on the next workout', () => {
    const shown = milestoneAfterSave(100, 50);
    expect(shown).toBe(100);
    expect(milestoneDue({ on: true, workoutNumber: 100, shown })).toBeNull();
    expect(milestoneDue({ on: true, workoutNumber: 101, shown })).toBeNull();
  });

  it('an edited history that brings the count back to 100 does not celebrate it twice', () => {
    // Saved #100 (stamped), then deleted a session: the next finish is #100 again.
    expect(milestoneDue({ on: true, workoutNumber: 100, shown: 100 })).toBeNull();
    // …and a re-pinned count that jumps back below does not either.
    expect(milestoneDue({ on: true, workoutNumber: 50, shown: 100 })).toBeNull();
    // The next one up still comes.
    expect(milestoneDue({ on: true, workoutNumber: 250, shown: 100 })).toBe(250);
  });

  it('the stamp never goes down, and a finish with no card leaves it alone', () => {
    expect(milestoneAfterSave(null, 250)).toBe(250);
    expect(milestoneAfterSave(null, undefined)).toBeUndefined();
    expect(milestoneAfterSave(100, 250)).toBe(250);
  });

  it('switch off: never, and nothing is stamped', () => {
    expect(milestoneDue({ on: false, workoutNumber: 100, shown: undefined })).toBeNull();
    expect(
      milestoneAfterSave(
        milestoneDue({ on: false, workoutNumber: 100, shown: undefined }),
        undefined,
      ),
    ).toBeUndefined();
  });

  it('switched on at 340, the past milestones are not celebrated in a lump: the next is 500', () => {
    expect(milestoneDue({ on: true, workoutNumber: 341, shown: undefined })).toBeNull();
    expect(milestoneDue({ on: true, workoutNumber: 500, shown: undefined })).toBe(500);
  });

  it('no count, no card', () => {
    expect(milestoneDue({ on: true, workoutNumber: null, shown: undefined })).toBeNull();
  });

  it('only a real milestone is ever stored', () => {
    expect(usableMilestone(100)).toBe(100);
    for (const junk of [99, '100', -50, null, undefined, 100.5]) {
      expect(usableMilestone(junk)).toBeUndefined();
    }
  });
});

describe('the card', () => {
  it('since the first saved workout, with every set including this session', () => {
    const card = milestoneCard(100, [workout('2026-09-01', 12), workout('2025-02-14', 10)], {
      startedAt: '2026-10-09T10:00:00.000Z',
      loggedSets: 18,
    });
    expect(card).toEqual({ n: 100, since: '2025-02-14', sets: 40 });
    expect(describeMilestone({ n: 100, since: '2025-02-14', sets: 2014 }, 'en')).toEqual({
      title: 'Workout 100',
      line: 'Since 14 February 2025. 2,014 sets.',
    });
    expect(describeMilestone({ n: 100, since: '2025-02-14', sets: 2014 }, 'ru').title).toBe(
      'Тренировка 100',
    );
  });

  it('a first-ever workout is its own since', () => {
    const card = milestoneCard(50, [], { startedAt: '2026-10-09T10:00:00.000Z', loggedSets: 5 });
    expect(card.since).toBe('2026-10-09');
  });
});
