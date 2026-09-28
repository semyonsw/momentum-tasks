import { beforeEach, describe, expect, it } from 'vitest';

import { useDebriefs } from './debriefStore';
import type { CompletedWorkout } from '../lib/completedWorkout';

/**
 * The debrief store: a workout files one debrief however often it is offered,
 * `Later` keeps what was said, `Done` marks it answered, and a restore replaces
 * the lot with what survived validation.
 */

const workout = (id = 'w1'): CompletedWorkout => ({
  id,
  title: 'Push',
  routineId: 'r_push',
  startedAt: '2026-09-27T18:00:00.000Z',
  endedAt: '2026-09-27T19:00:00.000Z',
  durationMinutes: 60,
  setCount: 3,
  totalVolumeKg: 0,
  volumeIsPartial: false,
  exercises: [],
  sets: [],
});

beforeEach(() => {
  useDebriefs.setState({ debriefs: [], openId: null, aiPrompt: null });
});

describe('offering', () => {
  it('files one debrief per workout, and opens it', () => {
    useDebriefs.getState().offer(workout());
    useDebriefs.getState().offer(workout());
    expect(useDebriefs.getState().debriefs).toHaveLength(1);
    expect(useDebriefs.getState().openId).toBe('w1');
  });

  it('can file without opening, for the sheet to open a beat later', () => {
    useDebriefs.getState().offer(workout(), false);
    expect(useDebriefs.getState().openId).toBeNull();
    useDebriefs.getState().open('w1');
    expect(useDebriefs.getState().openId).toBe('w1');
  });

  it('will not open a debrief that does not exist', () => {
    useDebriefs.getState().open('nope');
    expect(useDebriefs.getState().openId).toBeNull();
  });
});

describe('answering', () => {
  it('keeps what was said on Later, and marks it answered on Done', () => {
    const store = useDebriefs.getState();
    store.offer(workout());
    store.saveAnswers('w1', { load: { choices: ['heavy'] }, energy: { choices: [] } }, false);
    let [debrief] = useDebriefs.getState().debriefs;
    expect(debrief.status).toBe('pending');
    expect(debrief.answers).toEqual({ load: { choices: ['heavy'] } });

    store.saveAnswers('w1', { load: { choices: ['right'] } }, true);
    [debrief] = useDebriefs.getState().debriefs;
    expect(debrief.status).toBe('answered');
    expect(debrief.answeredAt).toBeTruthy();
  });

  it('dismisses a pending one and closes it', () => {
    useDebriefs.getState().offer(workout());
    useDebriefs.getState().dismiss('w1');
    expect(useDebriefs.getState().debriefs[0].status).toBe('dismissed');
    expect(useDebriefs.getState().openId).toBeNull();
  });

  it('hands the chat question over and closes the sheet', () => {
    useDebriefs.getState().offer(workout());
    useDebriefs.getState().askAi('How did Push go?');
    expect(useDebriefs.getState().aiPrompt).toBe('How did Push go?');
    expect(useDebriefs.getState().openId).toBeNull();
  });
});

describe('restoring', () => {
  it('replaces everything with what survived validation', () => {
    useDebriefs.getState().offer(workout('local'));
    const backup = JSON.parse(JSON.stringify(useDebriefs.getState().debriefs));
    backup[0].workoutId = 'from-file';
    const count = useDebriefs.getState().importDebriefs([...backup, { junk: true }]);
    expect(count).toBe(1);
    expect(useDebriefs.getState().debriefs.map((d) => d.workoutId)).toEqual(['from-file']);
  });
});
