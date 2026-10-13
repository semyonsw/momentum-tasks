import { beforeEach, describe, expect, it } from 'vitest';

import { sanitizeAi, useAi, type AiMessage } from './aiStore';
import { startDebriefChat } from './debriefChat';
import { useDebriefs } from './debriefStore';
import { useLibrary } from './libraryStore';
import { useSettings } from './settingsStore';
import { useWorkoutHistory } from './workoutHistoryStore';
import type { CompletedWorkout } from '../lib/completedWorkout';

/**
 * `Ask the assistant about it`: the old training chat goes to the archive, the
 * new one opens on a message quoting the answers — and nothing is filed away
 * while an answer is still on its way into the old one.
 */

const workout: CompletedWorkout = {
  id: 'w1',
  title: 'Push',
  routineId: 'r_gone',
  startedAt: '2026-09-27T18:00:00.000Z',
  endedAt: '2026-09-27T19:00:00.000Z',
  durationMinutes: 60,
  setCount: 3,
  totalVolumeKg: 0,
  volumeIsPartial: false,
  exercises: [
    {
      exerciseId: 'ex_bench',
      name: 'Bench press',
      countUnit: 'reps',
      loadMode: 'external',
      setCount: 3,
      summary: '60 kg · 8 8 6',
      totalCount: 22,
      topWeightKg: 60,
    },
  ],
  sets: [],
};

const old: AiMessage = { id: 'm1', role: 'user', text: 'Old question', at: '2026-09-20' };

beforeEach(() => {
  useAi.setState(sanitizeAi({}));
  useAi.getState().appendMessage('Workout', old);
  useDebriefs.setState({ debriefs: [], openId: null, aiPrompt: null, queuedId: null });
  useDebriefs.getState().offer(workout);
  useWorkoutHistory.setState({ workouts: [workout] });
  useLibrary.setState({ routines: [] });
  useSettings.setState({ language: 'en' });
});

describe('starting a chat from the debrief', () => {
  it('files the old chat and asks with every answer spelled out', () => {
    useDebriefs.getState().saveAnswers('w1', { load: { choices: ['heavy'] } }, true);
    startDebriefChat('w1');

    const ai = useAi.getState();
    expect(ai.chats.Workout).toEqual([]);
    expect(ai.archive.Workout).toHaveLength(1);
    expect(ai.archive.Workout[0].messages.map((m) => m.id)).toEqual(['m1']);

    const { aiPrompt, openId } = useDebriefs.getState();
    expect(openId).toBeNull();
    expect(aiPrompt).toContain('- How did the weights feel? A bit heavy');
    expect(aiPrompt).toContain('- Bench press: 60 kg · 8 8 6');
    // Its routine is gone from the library, so there is no plan to quote.
    expect(aiPrompt).not.toContain('The plan in the routine');
  });

  it('still starts a new chat when nothing was answered, with the short question', () => {
    startDebriefChat('w1');
    expect(useAi.getState().chats.Workout).toEqual([]);
    expect(useDebriefs.getState().aiPrompt).toBe(
      'How did my Push workout go, and should I change anything?',
    );
  });

  it('leaves the chat alone while an answer is on its way into it', () => {
    useDebriefs.getState().saveAnswers('w1', { load: { choices: ['heavy'] } }, true);
    useAi.getState().setPending('Workout', true);
    startDebriefChat('w1');
    expect(useAi.getState().chats.Workout.map((m) => m.id)).toEqual(['m1']);
    expect(useAi.getState().archive.Workout).toHaveLength(0);
    expect(useDebriefs.getState().aiPrompt).toContain('A bit heavy');
  });

  it('asks in the language the app speaks', () => {
    useSettings.setState({ language: 'ru' });
    useDebriefs.getState().saveAnswers('w1', { load: { choices: ['heavy'] } }, true);
    startDebriefChat('w1');
    expect(useDebriefs.getState().aiPrompt).toContain('- Как ощущались веса? Тяжеловато');
  });

  it('does nothing for a debrief that does not exist', () => {
    startDebriefChat('nope');
    expect(useAi.getState().chats.Workout).toHaveLength(1);
    expect(useDebriefs.getState().aiPrompt).toBeNull();
  });
});
