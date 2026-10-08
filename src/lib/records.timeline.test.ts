import { describe, expect, it } from 'vitest';

import {
  describeE1rmTrend,
  e1rm,
  e1rmSeries,
  prTimeline,
  recordLabel,
  recordSet,
  recordValue,
} from './records';
import { lbToKg } from './units';
import type { SetHistory } from '../types/models';

/**
 * The e1RM line and the records timeline (T-02).
 *
 * The rules: ONE POINT PER SESSION, from that session's best set; warm-ups never
 * count; bodyweight lifts are estimated on the load the body moved; a record must
 * BEAT the best before it — a tie is not a record, and the first session only sets
 * the bar; everything is kept in kilograms and converted only when it is written.
 */

let seq = 0;
const set = (
  sessionId: string,
  day: string,
  weightKg: number | null,
  count: number,
  over: Partial<SetHistory> = {},
): SetHistory => ({
  id: `s${(seq += 1)}`,
  sessionId,
  exerciseId: 'bench',
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

describe('Epley', () => {
  it('is load × (1 + reps / 30)', () => {
    expect(e1rm(82.5, 5)).toBeCloseTo(96.25);
    expect(e1rm(60, 15)).toBe(90);
  });

  it('takes a single as itself, not as 3% more than was lifted', () => {
    expect(e1rm(100, 1)).toBe(100);
  });

  it('has nothing to say about no load or no reps', () => {
    expect(e1rm(0, 5)).toBe(0);
    expect(e1rm(80, 0)).toBe(0);
  });
});

describe('e1rmSeries', () => {
  it('is empty for an empty history', () => {
    expect(e1rmSeries([], 'bench')).toEqual([]);
  });

  it('is one point per session, from its best set, oldest first', () => {
    const history = [
      set('b', '2026-06-08', 85, 3),
      set('b', '2026-06-08', 80, 6), // 96.0 beats 85 × 3 = 93.5
      set('a', '2026-06-01', 80, 5),
      set('other', '2026-06-01', 200, 5, { exerciseId: 'squat' }),
    ];
    const series = e1rmSeries(history, 'bench');
    expect(series.map((p) => p.sessionId)).toEqual(['a', 'b']);
    expect(series.map((p) => p.value)).toEqual([93.33, 96]);
    expect(series[1]).toMatchObject({ weightKg: 80, count: 6 });
  });

  it('leaves warm-ups and unlogged sets out', () => {
    const history = [
      set('a', '2026-06-01', 120, 5, { isWarmup: true }),
      set('a', '2026-06-01', 130, 5, { isCompleted: false }),
      set('a', '2026-06-01', 80, 5),
    ];
    expect(e1rmSeries(history, 'bench').map((p) => p.value)).toEqual([93.33]);
  });

  it('leaves out a session made only of warm-ups rather than plotting a zero', () => {
    const history = [
      set('a', '2026-06-01', 80, 5),
      set('b', '2026-06-08', 60, 5, { isWarmup: true }),
    ];
    expect(e1rmSeries(history, 'bench')).toHaveLength(1);
  });

  it('estimates bodyweight lifts on the load the body moved that day', () => {
    const pullups = (sessionId: string, day: string) =>
      set(sessionId, day, 20, 6, { exerciseId: 'pullup', loadMode: 'added_bodyweight' });
    const history = [pullups('a', '2026-01-10'), pullups('b', '2026-08-10')];
    const series = e1rmSeries(history, 'pullup', (at) => (at.startsWith('2026-01') ? 78 : 82));
    // (78 + 20) × 1.2 and (82 + 20) × 1.2 — the same logged `+20 × 6`, two points.
    expect(series.map((p) => p.value)).toEqual([117.6, 122.4]);
    expect(series[0].weightKg).toBe(20);
  });

  it('subtracts the assistance on an assisted machine', () => {
    const history = [set('a', '2026-06-01', 30, 10, { exerciseId: 'dip', loadMode: 'assisted' })];
    expect(e1rmSeries(history, 'dip', () => 80)[0].value).toBeCloseTo(66.67);
  });

  it('stays silent on a bodyweight lift when no bodyweight is known', () => {
    const history = [set('a', '2026-06-01', 20, 6, { loadMode: 'added_bodyweight' })];
    expect(e1rmSeries(history, 'bench')).toEqual([]);
  });

  it('never estimates from a timed set', () => {
    const history = [set('a', '2026-06-01', 20, 90, { countUnit: 'seconds' })];
    expect(e1rmSeries(history, 'bench')).toEqual([]);
  });
});

describe('prTimeline', () => {
  it('is empty for an empty history', () => {
    expect(prTimeline([], 'bench')).toEqual([]);
  });

  it('gives the first session no entry: a record needs a best to beat', () => {
    const history = [set('a', '2026-06-01', 80, 5), set('a', '2026-06-01', 85, 3)];
    expect(prTimeline(history, 'bench')).toEqual([]);
  });

  it('records each best a later session moved, newest first, with the set that did it', () => {
    const history = [
      set('a', '2026-06-01', 80, 5),
      set('b', '2026-06-08', 85, 2), // heavier, but e1RM 90.7 < 93.3
      set('c', '2026-06-15', 60, 15), // most reps
      set('d', '2026-06-22', 82.5, 5), // e1RM 96.25
    ];
    const timeline = prTimeline(history, 'bench');
    expect(timeline.map((e) => [e.sessionId, e.kind, e.value])).toEqual([
      ['d', 'e1rm', 96.25],
      ['c', 'mostCount', 15],
      ['b', 'heaviest', 85],
    ]);
    expect(timeline[0]).toMatchObject({ weightKg: 82.5, count: 5, at: '2026-06-22T10:00:00.000Z' });
  });

  it('counts a session that climbs past the best once, at its top', () => {
    const history = [
      set('a', '2026-06-01', 100, 1),
      set('b', '2026-06-08', 102.5, 1),
      set('b', '2026-06-08', 105, 1),
    ];
    const heaviest = prTimeline(history, 'bench').filter((e) => e.kind === 'heaviest');
    expect(heaviest.map((e) => e.value)).toEqual([105]);
  });

  it('does not call a tie a record', () => {
    const history = [
      set('a', '2026-06-01', 100, 5),
      set('b', '2026-06-08', 100, 5),
      set('c', '2026-06-15', 100, 5),
    ];
    expect(prTimeline(history, 'bench')).toEqual([]);
  });

  it('keeps warm-ups out of the bar and out of the records', () => {
    const history = [
      set('a', '2026-06-01', 80, 5),
      // A heavy "warm-up" before the first session's work must not raise the bar…
      set('a', '2026-06-01', 140, 1, { isWarmup: true }),
      set('b', '2026-06-08', 90, 5),
      // …nor be a record of its own later.
      set('c', '2026-06-15', 150, 20, { isWarmup: true }),
    ];
    const timeline = prTimeline(history, 'bench');
    expect(timeline.every((e) => e.sessionId === 'b')).toBe(true);
    expect(timeline.find((e) => e.kind === 'heaviest')?.value).toBe(90);
  });

  it('compares bodyweight lifts on body load: the same `+20` is heavier at a heavier body', () => {
    const pullups = (sessionId: string, day: string) =>
      set(sessionId, day, 20, 5, { exerciseId: 'pullup', loadMode: 'added_bodyweight' });
    const history = [pullups('a', '2026-01-10'), pullups('b', '2026-08-10')];
    const timeline = prTimeline(history, 'pullup', (at) => (at.startsWith('2026-01') ? 78 : 82));
    expect(timeline.map((e) => [e.kind, e.value])).toEqual([
      ['e1rm', 119],
      ['heaviest', 102],
    ]);
    // And the set still reads as what was typed.
    expect(recordSet(timeline[1], 'metric')).toBe('+20 × 5');
  });

  it('keeps no heaviest for pure bodyweight work, where it would only track the scale', () => {
    const pushups = (sessionId: string, day: string, count: number) =>
      set(sessionId, day, null, count, { exerciseId: 'pushup', loadMode: 'none' });
    const history = [pushups('a', '2026-06-01', 20), pushups('b', '2026-06-08', 20)];
    const timeline = prTimeline(history, 'pushup', (at) => (at.startsWith('2026-06-01') ? 78 : 80));
    expect(timeline.map((e) => e.kind)).toEqual(['e1rm']);
  });

  it('records the longest hold on timed work', () => {
    const plank = (sessionId: string, day: string, seconds: number) =>
      set(sessionId, day, null, seconds, { loadMode: 'none', countUnit: 'seconds' });
    const timeline = prTimeline(
      [plank('a', '2026-06-01', 120), plank('b', '2026-06-08', 190)],
      'bench',
    );
    expect(timeline).toHaveLength(1);
    expect(recordLabel(timeline[0].kind, timeline[0].countUnit)).toBe('Longest');
    expect(recordValue(timeline[0], 'metric')).toBe('3:10');
  });

  it('compares a lifter who logs in pounds without float drift', () => {
    // 100 lb stored twice as kilograms is a tie, not a 0.0000001 kg record.
    const history = [
      set('a', '2026-06-01', lbToKg(100), 5),
      set('b', '2026-06-08', lbToKg(100), 5),
      set('c', '2026-06-15', lbToKg(105), 5),
    ];
    const timeline = prTimeline(history, 'bench');
    expect(timeline.map((e) => e.sessionId)).toEqual(['c', 'c']);
    expect(recordValue(timeline[1], 'imperial')).toBe('105 lb');
    expect(recordSet(timeline[1], 'imperial')).toBe('105 × 5');
  });
});

describe('the sentence above the chart', () => {
  const point = (day: string, value: number) => ({ at: `${day}T10:00:00.000Z`, value });

  it('says nothing under two sessions', () => {
    expect(describeE1rmTrend([], 'metric')).toBeNull();
    expect(describeE1rmTrend([point('2026-06-12', 90)], 'metric')).toBeNull();
  });

  it('states the climb from the first session to the latest', () => {
    const conclusion = describeE1rmTrend(
      [point('2026-06-12', 88.8), point('2026-07-01', 99), point('2026-09-28', 96.3)],
      'metric',
    );
    expect(conclusion).toEqual({ direction: 'up', text: 'Up 7.5 kg since 12 Jun, to 96.3 kg.' });
  });

  it('says down when it is down', () => {
    const conclusion = describeE1rmTrend(
      [point('2026-06-12', 100), point('2026-07-01', 95)],
      'metric',
    );
    expect(conclusion).toEqual({ direction: 'down', text: 'Down 5 kg since 12 Jun, to 95 kg.' });
  });

  it('calls a change too small to print level', () => {
    const conclusion = describeE1rmTrend(
      [point('2026-06-12', 100), point('2026-07-01', 100.02)],
      'metric',
    );
    expect(conclusion).toEqual({ direction: 'level', text: 'Level since 12 Jun, at 100 kg.' });
  });

  it('converts to pounds for an imperial lifter, from numbers stored in kilograms', () => {
    const conclusion = describeE1rmTrend(
      [point('2026-06-12', lbToKg(200)), point('2026-07-01', lbToKg(225))],
      'imperial',
    );
    expect(conclusion?.text).toBe('Up 25 lb since 12 Jun, to 225 lb.');
  });

  it('speaks Russian', () => {
    const conclusion = describeE1rmTrend(
      [point('2026-06-12', 90), point('2026-07-01', 95)],
      'metric',
      'ru',
    );
    expect(conclusion?.text).toBe('Плюс 5 кг с 12 июня, до 95 кг.');
  });
});
