/**
 * Set timer tests.
 *
 * The clock is pure and takes `now` as an argument, so every case here is an
 * instant rather than a wait: a two-minute plank suspended for five minutes
 * mid-hold is one function call.
 *
 * What these pin down is the promise in `lib/setTimer.ts`: THE NUMBER LOGGED IS
 * THE NUMBER THE USER SAW. Everything else about a timer is cosmetic; that part
 * is history, and history is the thing this app cannot get wrong.
 *
 * Run: npx vitest run src/lib/setTimer.test.ts
 */

import { describe, expect, it } from 'vitest';

import {
  MIN_WORK_SECONDS,
  SHELL_COMMIT_GRACE_MS,
  UNOBSERVED_GO,
  goCue,
  readSetTimer,
  shellShouldCommit,
  resolveTimerMode,
  withPrepareSkipped,
  withWorkAdjusted,
  workEndsAt,
  type GoLatch,
  type SetTimerSpec,
} from './setTimer';

const T0 = 1_800_000_000_000; // a fixed epoch — the value is irrelevant, the deltas aren't

/** A 2:00 plank with a 5 s get-ready count. */
const plank: SetTimerSpec = {
  mode: 'countdown',
  startedAt: T0,
  prepareSeconds: 5,
  workSeconds: 120,
};

/** A dead hang: 5 s to get on the bar, then open-ended. */
const hang: SetTimerSpec = {
  mode: 'countup',
  startedAt: T0,
  prepareSeconds: 5,
  workSeconds: 0,
};

/** Seconds after start, as epoch ms. */
const at = (seconds: number) => T0 + seconds * 1000;

describe('the get-ready count', () => {
  it('counts whole seconds down to 1, then hands over to the work clock', () => {
    expect(readSetTimer(plank, at(0)).display).toBe(5);
    expect(readSetTimer(plank, at(0.4)).display).toBe(5);
    expect(readSetTimer(plank, at(4.2)).display).toBe(1);
    expect(readSetTimer(plank, at(4.9)).phase).toBe('prepare');
    expect(readSetTimer(plank, at(5)).phase).toBe('work');
  });

  it('logs nothing if it is stopped before work starts', () => {
    // The store turns a zero into a cancel: a set that never started is not a set.
    expect(readSetTimer(plank, at(3)).workedSeconds).toBe(0);
  });

  it('is skipped entirely when the exercise asks for none', () => {
    const round: SetTimerSpec = { ...plank, prepareSeconds: 0, workSeconds: 180 };
    expect(readSetTimer(round, at(0)).phase).toBe('work');
    expect(readSetTimer(round, at(0)).display).toBe(180);
  });

  it('can be spent early without moving the work clock', () => {
    const skipped = withPrepareSkipped(plank, at(2));
    expect(readSetTimer(skipped, at(2)).phase).toBe('work');
    // Full 2:00 still to run — skipping the count-in does not eat into the hold.
    expect(readSetTimer(skipped, at(2)).display).toBe(120);
  });
});

describe('a prescribed hold (countdown)', () => {
  it('shows the target for the whole first second, the way a bell timer does', () => {
    expect(readSetTimer(plank, at(5)).display).toBe(120);
    expect(readSetTimer(plank, at(5.9)).display).toBe(120);
    expect(readSetTimer(plank, at(6)).display).toBe(119);
  });

  it('logs what was actually held when it is stopped early', () => {
    // 36 s into a 2:00 plank: the clock reads 1:24, and 36 is what happened.
    const reading = readSetTimer(plank, at(5 + 36.4));
    expect(reading.display).toBe(84);
    expect(reading.workedSeconds).toBe(36);
    // The two can never disagree — worked is defined as target minus displayed.
    expect(reading.workedSeconds + reading.display).toBe(plank.workSeconds);
  });

  it('logs the target once the bell rings, and stays there', () => {
    expect(readSetTimer(plank, at(125)).phase).toBe('over');
    expect(readSetTimer(plank, at(125)).workedSeconds).toBe(120);
    // Suspended for five minutes past the bell: still 2:00, never 7:00.
    const late = readSetTimer(plank, at(425));
    expect(late.phase).toBe('over');
    expect(late.display).toBe(0);
    expect(late.workedSeconds).toBe(120);
  });

  it('drains from full to empty across the hold', () => {
    expect(readSetTimer(plank, at(5)).remainingFraction).toBe(1);
    expect(readSetTimer(plank, at(65)).remainingFraction).toBeCloseTo(0.5, 5);
    expect(readSetTimer(plank, at(200)).remainingFraction).toBe(0);
  });

  it('extends the target on +15, rather than pushing the end time', () => {
    const longer = withWorkAdjusted(plank, 15);
    expect(longer.workSeconds).toBe(135);
    // 36 s in, the drain still measures against a real target.
    expect(readSetTimer(longer, at(5 + 36)).display).toBe(99);
    expect(readSetTimer(longer, at(5 + 36)).remainingFraction).toBeCloseTo(99 / 135, 5);
  });

  it('never lets an adjustment leave a hold too short to perform', () => {
    expect(withWorkAdjusted(plank, -500).workSeconds).toBe(MIN_WORK_SECONDS);
  });

  it('knows when the bell is, so a notification can be scheduled for it', () => {
    expect(workEndsAt(plank)).toBe(at(125));
  });
});

describe('an open hold (count up)', () => {
  it('counts whole seconds up from zero, the way a stopwatch does', () => {
    expect(readSetTimer(hang, at(5)).display).toBe(0);
    expect(readSetTimer(hang, at(5.9)).display).toBe(0);
    expect(readSetTimer(hang, at(6)).display).toBe(1);
  });

  it('logs exactly the time on the clock when stopped', () => {
    const reading = readSetTimer(hang, at(5 + 47.8));
    expect(reading.display).toBe(47);
    expect(reading.workedSeconds).toBe(47);
  });

  it('never ends on its own', () => {
    expect(readSetTimer(hang, at(3600)).phase).toBe('work');
  });

  it('has nothing to drain and no bell to schedule', () => {
    expect(readSetTimer(hang, at(20)).remainingFraction).toBeNull();
    expect(workEndsAt(hang)).toBeNull();
    // There is no target to extend, so +15 is a no-op rather than a lie.
    expect(withWorkAdjusted(hang, 15)).toEqual(hang);
  });
});

describe('resolveTimerMode', () => {
  it('honours the exercise for time-counted work', () => {
    expect(resolveTimerMode({ countUnit: 'seconds', timerMode: 'countdown' })).toBe('countdown');
    expect(resolveTimerMode({ countUnit: 'rounds', timerMode: 'countdown' })).toBe('countdown');
    expect(resolveTimerMode({ countUnit: 'seconds', timerMode: 'countup' })).toBe('countup');
  });

  it('refuses to run a clock over reps or metres, whatever the row says', () => {
    // A 12-second set of twelve reps is the nonsense this guard exists to stop.
    expect(resolveTimerMode({ countUnit: 'reps', timerMode: 'countdown' })).toBe('manual');
    expect(resolveTimerMode({ countUnit: 'meters', timerMode: 'countup' })).toBe('manual');
  });

  it('defaults to manual — a timer is opt-in per exercise', () => {
    expect(resolveTimerMode({ countUnit: 'seconds' })).toBe('manual');
  });
});

/**
 * The shell's backstop commit. It used to fire on the same tick the screen's hook
 * first read `over`, and whichever of the two 4 Hz intervals looked first won —
 * when the shell won, the timer was cleared before the screen rendered the zero
 * its bell hangs on, and a plank ended in silence.
 */
describe('shellShouldCommit', () => {
  it('leaves the bell to the screen: not on the tick the clock reads over', () => {
    expect(readSetTimer(plank, at(125)).phase).toBe('over');
    expect(shellShouldCommit(plank, at(125))).toBe(false);
    expect(shellShouldCommit(plank, at(125) + SHELL_COMMIT_GRACE_MS - 1)).toBe(false);
  });

  it('logs it a beat later, when nothing on screen did', () => {
    expect(shellShouldCommit(plank, at(125) + SHELL_COMMIT_GRACE_MS)).toBe(true);
    // A hold that ended in a pocket ten minutes ago is still committed.
    expect(shellShouldCommit(plank, at(725))).toBe(true);
  });

  it('never commits a count-up — it has no bell', () => {
    expect(shellShouldCommit(hang, at(3600))).toBe(false);
  });
});

/**
 * "Go", once per hold — not once per instance of the hook. Focus mode and the pill
 * each mount their own `useSetTimer`, so opening focus mode mid-plank is a new
 * instance meeting a clock that is already in `work`.
 */
describe('goCue', () => {
  /** Feed a sequence of readings through one instance; collect what fired. */
  function run(readings: [SetTimerSpec | null, number][], latch: GoLatch = UNOBSERVED_GO) {
    const fired: number[] = [];
    for (const [spec, now] of readings) {
      const next = goCue(latch, spec, now);
      latch = next.latch;
      if (next.fire) fired.push(now);
    }
    return fired;
  }

  it('stays silent when an instance mounts on a hold already under way', () => {
    // Opening focus mode forty seconds into the plank.
    expect(
      run([
        [plank, at(45)],
        [plank, at(46)],
        [plank, at(60)],
      ]),
    ).toEqual([]);
  });

  it('sounds once for a get-ready this instance watched run out', () => {
    expect(
      run([
        [plank, at(3)],
        [plank, at(4.9)],
        [plank, at(5.1)],
        [plank, at(6)],
      ]),
    ).toEqual([at(5.1)]);
  });

  it('sounds for a timer started while the instance was mounted', () => {
    const noLeadIn = { ...plank, prepareSeconds: 0 };
    expect(
      run([
        [null, at(0)],
        [noLeadIn, at(0.1)],
        [noLeadIn, at(1)],
      ]),
    ).toEqual([at(0.1)]);
  });

  it('sounds when the instance mounts WITH a hold that has only just begun', () => {
    // The pill mounts only once a timer exists, so a chained round with no lead-in
    // is first seen already in `work` — and that is its start.
    const round = { ...plank, prepareSeconds: 0 };
    expect(
      run([
        [round, at(0.25)],
        [round, at(1)],
      ]),
    ).toEqual([at(0.25)]);
  });

  it('sounds again for "Start now", which is a new startedAt', () => {
    const skipped = withPrepareSkipped(plank, at(2));
    expect(
      run([
        [plank, at(1)],
        [skipped, at(2)],
        [skipped, at(3)],
      ]),
    ).toEqual([at(2)]);
  });

  it('says nothing at the bell, or for a hold first seen already over', () => {
    expect(run([[plank, at(200)]])).toEqual([]);
  });
});
