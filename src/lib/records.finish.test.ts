import { describe, expect, it } from 'vitest';

import { describeSessionRecord, prTimeline, recordMoments, recordsBrokenIn } from './records';
import type { SetHistory } from '../types/models';

/**
 * Records broken in the session being finished (T-09).
 *
 * The rules: a record needs a previous best to beat, so an exercise's first-ever
 * session sets the bar and shows nothing; warm-ups never count on either side;
 * equalling a best is not beating it; one row per exercise, naming the best kind
 * it set; at most three rows, the estimate before the two facts and the bigger
 * jump first.
 */

let seq = 0;
const row = (
  sessionId: string,
  day: string,
  exerciseId: string,
  weightKg: number | null,
  count: number,
  over: Partial<SetHistory> = {},
): SetHistory => ({
  id: `s${(seq += 1)}`,
  sessionId,
  exerciseId,
  performedAt: `${day}T10:00:00.000Z`,
  setIndex: seq,
  weightKg,
  count,
  countUnit: 'reps',
  loadMode: 'external',
  isWarmup: false,
  isCompleted: true,
  ...over,
});

const TODAY = '2026-10-09';
const now = (exerciseId: string, weightKg: number | null, count: number, over = {}) =>
  row('live', TODAY, exerciseId, weightKg, count, over);

describe('recordsBrokenIn', () => {
  it('is empty with nothing logged', () => {
    expect(recordsBrokenIn([], [row('a', '2026-09-01', 'bench', 80, 5)])).toEqual([]);
  });

  it('does not make a first-ever session "all records"', () => {
    const session = [now('bench', 80, 5), now('squat', 100, 5), now('row', 60, 10)];
    expect(recordsBrokenIn(session, [])).toEqual([]);
    // History of OTHER movements does not give this one a bar either.
    expect(
      recordsBrokenIn([now('bench', 80, 5)], [row('a', '2026-09-01', 'squat', 90, 5)]),
    ).toEqual([]);
  });

  it('names the new best e1RM, with the set that did it and the bar it beat', () => {
    const history = [row('a', '2026-09-28', 'bench', 80, 5)];
    const [record, ...rest] = recordsBrokenIn(
      [now('bench', 80, 4), now('bench', 82.5, 5)],
      history,
    );
    expect(rest).toEqual([]);
    expect(record).toMatchObject({
      exerciseId: 'bench',
      kind: 'e1rm',
      value: 96.25,
      previous: 93.33,
      weightKg: 82.5,
      count: 5,
    });
  });

  it('ignores warm-ups in the session: a heavy warm-up single is not a record', () => {
    const history = [row('a', '2026-09-28', 'bench', 80, 5)];
    const session = [now('bench', 100, 1, { isWarmup: true }), now('bench', 80, 5)];
    expect(recordsBrokenIn(session, history)).toEqual([]);
  });

  it('ignores warm-ups in the history: they set no bar', () => {
    const history = [
      row('a', '2026-09-28', 'bench', 120, 1, { isWarmup: true }),
      row('a', '2026-09-28', 'bench', 80, 5),
    ];
    expect(recordsBrokenIn([now('bench', 85, 5)], history)[0]?.kind).toBe('e1rm');
  });

  it('a history of warm-ups only is still a first session', () => {
    const history = [row('a', '2026-09-28', 'bench', 40, 10, { isWarmup: true })];
    expect(recordsBrokenIn([now('bench', 80, 5)], history)).toEqual([]);
  });

  it('does not call a tie a record', () => {
    const history = [row('a', '2026-09-28', 'bench', 80, 5)];
    expect(recordsBrokenIn([now('bench', 80, 5)], history)).toEqual([]);
  });

  it('compares with the best of ALL earlier sessions, not just the last one', () => {
    const history = [
      row('a', '2026-08-01', 'bench', 90, 5),
      row('b', '2026-09-28', 'bench', 80, 5),
    ];
    expect(recordsBrokenIn([now('bench', 85, 5)], history)).toEqual([]);
  });

  it('falls back to the heaviest when the estimate did not move', () => {
    // 100 × 3 = e1RM 110; today 102.5 × 1 = 102.5 — heavier, lower estimate.
    const history = [row('a', '2026-09-28', 'bench', 100, 3)];
    const [record] = recordsBrokenIn([now('bench', 102.5, 1)], history);
    expect(record).toMatchObject({ kind: 'heaviest', value: 102.5, previous: 100 });
  });

  it('falls back to most reps, and to the longest hold on timed work', () => {
    const history = [
      row('a', '2026-09-28', 'curl', 20, 12),
      row('a', '2026-09-28', 'plank', null, 120, { countUnit: 'seconds', loadMode: 'none' }),
    ];
    const records = recordsBrokenIn(
      [now('curl', 15, 15), now('plank', null, 160, { countUnit: 'seconds', loadMode: 'none' })],
      history,
    );
    expect(records.map((r) => [r.exerciseId, r.kind])).toEqual([
      ['plank', 'mostCount'],
      ['curl', 'mostCount'],
    ]);
  });

  it('weighs a bodyweight lift on the load the body moved that day', () => {
    const history = [row('a', '2026-09-01', 'dip', 20, 5, { loadMode: 'added_bodyweight' })];
    const bodyweight = (at: string) => (at.startsWith(TODAY) ? 82 : 78);
    // The same +20 × 5, four kilograms heavier on the body.
    const [record] = recordsBrokenIn(
      [now('dip', 20, 5, { loadMode: 'added_bodyweight' })],
      history,
      bodyweight,
    );
    expect(record).toMatchObject({ kind: 'e1rm', weightKg: 20, loadMode: 'added_bodyweight' });
  });

  it('gives pure bodyweight work a reps record, never an estimate that tracks the scale', () => {
    const history = [row('a', '2026-09-01', 'pushup', null, 20, { loadMode: 'none' })];
    const bodyweight = (at: string) => (at.startsWith(TODAY) ? 82 : 78);
    // Heavier body, same reps: nothing. More reps: a reps record.
    expect(
      recordsBrokenIn([now('pushup', null, 20, { loadMode: 'none' })], history, bodyweight),
    ).toEqual([]);
    const [record] = recordsBrokenIn(
      [now('pushup', null, 25, { loadMode: 'none' })],
      history,
      bodyweight,
    );
    expect(record).toMatchObject({ kind: 'mostCount', value: 25, previous: 20 });
  });

  it('with no bodyweight known, a bodyweight lift can still set a reps record', () => {
    const history = [row('a', '2026-09-01', 'dip', 20, 5, { loadMode: 'added_bodyweight' })];
    const [record] = recordsBrokenIn(
      [now('dip', 20, 6, { loadMode: 'added_bodyweight' })],
      history,
    );
    expect(record).toMatchObject({ kind: 'mostCount', value: 6 });
  });

  it('leaves the session out of the history if it was already saved', () => {
    const live = [now('bench', 85, 5)];
    const history = [row('a', '2026-09-28', 'bench', 80, 5), ...live];
    expect(recordsBrokenIn(live, history)).toHaveLength(1);
  });

  it('orders the estimate before the facts, then the bigger jump first, and stops at three', () => {
    const history = [
      row('a', '2026-09-01', 'bench', 80, 5), //  e1RM 93.33
      row('a', '2026-09-01', 'squat', 100, 5), // e1RM 116.67
      row('a', '2026-09-01', 'press', 50, 5), //  e1RM 58.33
      row('a', '2026-09-01', 'curl', 20, 12),
      row('a', '2026-09-01', 'deadlift', 140, 3), // e1RM 154
    ];
    const session = [
      now('curl', 15, 14), //       reps only (+17%)
      now('bench', 82.5, 5), //     e1RM +3.1%
      now('squat', 110, 5), //      e1RM +10%
      now('press', 52.5, 5), //     e1RM +5%
      now('deadlift', 145, 1), //   heaviest only
    ];
    expect(recordsBrokenIn(session, history).map((r) => r.exerciseId)).toEqual([
      'squat',
      'press',
      'bench',
    ]);
    expect(recordsBrokenIn(session, history, undefined, 10).map((r) => r.exerciseId)).toEqual([
      'squat',
      'press',
      'bench',
      'deadlift',
      'curl',
    ]);
  });

  it('agrees with the timeline the exercise screen will show once the session is saved', () => {
    const history = [
      row('a', '2026-09-01', 'bench', 80, 5),
      row('b', '2026-09-14', 'bench', 85, 2),
    ];
    const session = [now('bench', 82.5, 5)];
    const [record] = recordsBrokenIn(session, history);
    const [newest] = prTimeline([...history, ...session], 'bench');
    expect(newest).toMatchObject({ kind: record.kind, value: record.value, sessionId: 'live' });
  });
});

describe('describeSessionRecord', () => {
  const base = {
    exerciseId: 'bench',
    previous: 93.33,
    at: '2026-10-09T10:00:00.000Z',
    sessionId: 'live',
    countUnit: 'reps' as const,
    loadMode: 'external' as const,
  };

  it('writes the design line: the set, then the record', () => {
    const line = describeSessionRecord(
      { ...base, kind: 'e1rm', value: 96.25, weightKg: 82.5, count: 5 },
      'Bench press',
      'metric',
      'en',
    );
    expect(line).toEqual({ lead: 'Bench press · 82.5 × 5', record: 'new best e1RM, 96.3 kg' });
  });

  it('names the heaviest and the most reps', () => {
    expect(
      describeSessionRecord(
        { ...base, kind: 'heaviest', value: 102.5, weightKg: 102.5, count: 1 },
        'Bench press',
        'metric',
        'en',
      ).record,
    ).toBe('heaviest yet, 102.5 kg');
    expect(
      describeSessionRecord(
        { ...base, kind: 'mostCount', value: 25, weightKg: null, count: 25, loadMode: 'none' },
        'Push-ups',
        'metric',
        'en',
      ),
    ).toEqual({ lead: 'Push-ups · 25', record: 'most reps yet, 25' });
  });

  it('speaks Russian and converts for an imperial lifter', () => {
    const ru = describeSessionRecord(
      { ...base, kind: 'e1rm', value: 96.25, weightKg: 82.5, count: 5 },
      'Жим лёжа',
      'metric',
      'ru',
    );
    expect(ru.record).toBe('новый лучший e1RM, 96.3 кг');
    const lb = describeSessionRecord(
      { ...base, kind: 'heaviest', value: 102.5, weightKg: 102.5, count: 1 },
      'Bench press',
      'imperial',
      'en',
    );
    expect(lb.record).toMatch(/^heaviest yet, 22\d(\.\d)? lb$/);
  });
});

describe('recordMoments (what E1 badges and E2 XP count)', () => {
  it('is, session by session, exactly what the Finish sheet said at the time', () => {
    const history = [
      row('a', '2026-09-01', 'bench', 80, 5),
      row('a', '2026-09-01', 'squat', 100, 5),
      row('b', '2026-09-03', 'bench', 80, 5), // equalled: no record
      row('b', '2026-09-03', 'squat', 105, 5), // a record
      row('c', '2026-09-05', 'bench', 82.5, 5), // a record
      row('c', '2026-09-05', 'bench', 85, 6), // same session, same exercise: one moment
      row('c', '2026-09-05', 'row', 60, 10), // first ever: none
      row('d', '2026-09-07', 'bench', 90, 5, { isWarmup: true }), // a warm-up never counts
    ];
    const sessions = ['a', 'b', 'c', 'd'];
    const expected = sessions.flatMap((id, i) => {
      const live = history.filter((r) => r.sessionId === id);
      const before = history.filter((r) => sessions.indexOf(r.sessionId) < i);
      return recordsBrokenIn(live, before, undefined, 99).map((r) => `${id}:${r.exerciseId}`);
    });
    const moments = recordMoments(history).map((m) => `${m.sessionId}:${m.exerciseId}`);
    expect(moments.sort()).toEqual(expected.sort());
    expect(moments.sort()).toEqual(['b:squat', 'c:bench']);
  });

  it('is empty with nothing logged, and oldest first otherwise', () => {
    expect(recordMoments([])).toEqual([]);
    const history = [
      row('x', '2026-08-01', 'bench', 80, 5),
      row('y', '2026-08-10', 'bench', 85, 5),
      row('x', '2026-08-01', 'squat', 80, 5),
      row('z', '2026-08-05', 'squat', 85, 5),
    ];
    expect(recordMoments(history).map((m) => m.sessionId)).toEqual(['z', 'y']);
  });
});
