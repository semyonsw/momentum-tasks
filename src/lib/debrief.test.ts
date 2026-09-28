import { describe, expect, it } from 'vitest';

import {
  DEBRIEF_CAP,
  answeredCount,
  createDebrief,
  debriefForAi,
  debriefQuestions,
  debriefToOffer,
  isAnswered,
  sanitizeDebriefs,
  toggleChoice,
  type WorkoutDebrief,
} from './debrief';
import type { CompletedWorkout } from './completedWorkout';

/**
 * The debrief. What matters: the questions fit the workout they are about, a
 * chip behaves the way a chip looks like it will, an unanswered question never
 * reaches the assistant as an answer, and a blob from disk or a backup comes
 * back as something the sheet can draw.
 */

const exercise = (id: string, name: string, setCount = 3) => ({
  exerciseId: id,
  name,
  countUnit: 'reps' as const,
  loadMode: 'external' as const,
  setCount,
  summary: '',
  totalCount: 0,
  topWeightKg: null,
});

const workout = (over: Partial<CompletedWorkout> = {}): CompletedWorkout => ({
  id: 'w1',
  title: 'Push',
  routineId: 'r_push',
  startedAt: '2026-09-27T18:00:00.000Z',
  endedAt: '2026-09-27T19:00:00.000Z',
  durationMinutes: 60,
  setCount: 9,
  totalVolumeKg: 0,
  volumeIsPartial: false,
  exercises: [exercise('ex_bench', 'Bench press'), exercise('ex_dips', 'Dips')],
  sets: [],
  ...over,
});

describe('the questions', () => {
  it('asks about the routine when there is one', () => {
    const ids = debriefQuestions(workout()).map((q) => q.id);
    expect(ids).toEqual(['load', 'energy', 'pain', 'hardest', 'plan', 'notes']);
  });

  it('asks whether to repeat a one-off session instead', () => {
    const ids = debriefQuestions(workout({ routineId: undefined })).map((q) => q.id);
    expect(ids).toContain('repeat');
    expect(ids).not.toContain('plan');
  });

  it('offers THIS workout’s exercises by their own names, and skips the question for one', () => {
    const hardest = debriefQuestions(workout()).find((q) => q.id === 'hardest')!;
    expect(hardest.options.map((o) => o.label)).toEqual(['Bench press', 'Dips', 'None stood out']);
    expect(hardest.options[0].literal).toBe(true);
    const single = workout({ exercises: [exercise('ex_bench', 'Bench press')] });
    expect(debriefQuestions(single).some((q) => q.id === 'hardest')).toBe(false);
  });

  it('leaves out an exercise with no working sets', () => {
    const hardest = debriefQuestions(
      workout({
        exercises: [
          exercise('ex_bench', 'Bench press'),
          exercise('ex_dips', 'Dips'),
          exercise('ex_fly', 'Fly', 0),
        ],
      }),
    ).find((q) => q.id === 'hardest')!;
    expect(hardest.options.some((o) => o.label === 'Fly')).toBe(false);
  });
});

describe('a chip', () => {
  const [load, , pain] = debriefQuestions(workout());

  it('is one-of in a single question, and a second tap clears it', () => {
    expect(toggleChoice(load, [], 'heavy')).toEqual(['heavy']);
    expect(toggleChoice(load, ['heavy'], 'right')).toEqual(['right']);
    expect(toggleChoice(load, ['heavy'], 'heavy')).toEqual([]);
  });

  it('toggles in a multi question, with None clearing the rest and the rest clearing None', () => {
    expect(toggleChoice(pain, ['knee'], 'shoulder')).toEqual(['knee', 'shoulder']);
    expect(toggleChoice(pain, ['knee', 'shoulder'], 'none')).toEqual(['none']);
    expect(toggleChoice(pain, ['none'], 'knee')).toEqual(['knee']);
    expect(toggleChoice(pain, ['knee', 'shoulder'], 'knee')).toEqual(['shoulder']);
  });
});

describe('what counts as an answer', () => {
  it('is a choice, or a note with words in it', () => {
    expect(isAnswered(undefined)).toBe(false);
    expect(isAnswered({ choices: [] })).toBe(false);
    expect(isAnswered({ choices: [], note: '   ' })).toBe(false);
    expect(isAnswered({ choices: [], note: 'slept 5h' })).toBe(true);
    expect(isAnswered({ choices: ['low'] })).toBe(true);
  });

  it('is counted per question', () => {
    const debrief = createDebrief(workout());
    debrief.answers = { load: { choices: ['heavy'] }, notes: { choices: [], note: ' ' } };
    expect(answeredCount(debrief)).toBe(1);
  });
});

describe('for the assistant', () => {
  it('spells answers out in English labels, with the note after them', () => {
    const debrief: WorkoutDebrief = {
      ...createDebrief(workout()),
      status: 'answered',
      answers: {
        load: { choices: ['too_heavy'] },
        pain: { choices: ['shoulder', 'elbow'], note: ' left side,\n on the press ' },
        hardest: { choices: ['ex:ex_bench'] },
        notes: { choices: [], note: 'Спал 5 часов' },
      },
    };
    expect(debriefForAi(debrief)).toEqual({
      date: '2026-09-27',
      routine: 'Push',
      routineId: 'r_push',
      answers: {
        'How did the weights feel?': 'Too heavy',
        'Any pain or discomfort?': 'Shoulder, Elbow — left side, on the press',
        'Which exercise was the hardest?': 'Bench press',
        'Anything else the coach should know?': 'Спал 5 часов',
      },
    });
  });

  it('says nothing for a debrief with nothing in it, or one put aside', () => {
    expect(debriefForAi(createDebrief(workout()))).toBeNull();
    const dismissed = {
      ...createDebrief(workout()),
      status: 'dismissed' as const,
      answers: { load: { choices: ['right'] } },
    };
    expect(debriefForAi(dismissed)).toBeNull();
  });

  it('includes what was answered before `Later`', () => {
    const halfway = { ...createDebrief(workout()), answers: { energy: { choices: ['low'] } } };
    expect(debriefForAi(halfway)?.answers).toEqual({ 'How was your energy?': 'Low' });
  });
});

describe('which one Home offers', () => {
  const now = new Date('2026-09-28T09:00:00.000Z');
  const at = (id: string, createdAt: string, status: WorkoutDebrief['status'] = 'pending') => ({
    ...createDebrief(workout({ id })),
    createdAt,
    status,
  });

  it('is the newest pending one from the last week', () => {
    expect(
      debriefToOffer(
        [
          at('a', '2026-09-26T19:00:00.000Z'),
          at('b', '2026-09-27T19:00:00.000Z'),
          at('c', '2026-09-28T08:00:00.000Z', 'answered'),
        ],
        now,
      )?.workoutId,
    ).toBe('b');
  });

  it('is nothing once it is a week old', () => {
    expect(debriefToOffer([at('a', '2026-09-19T19:00:00.000Z')], now)).toBeNull();
  });
});

describe('reading one back', () => {
  it('survives a round trip', () => {
    const debrief = {
      ...createDebrief(workout()),
      answers: { load: { choices: ['right'] }, notes: { choices: [], note: 'good day' } },
    };
    expect(sanitizeDebriefs(JSON.parse(JSON.stringify([debrief])))).toEqual([debrief]);
  });

  it('drops junk, unknown choices, a second answer to a single question, and duplicates', () => {
    const debrief = createDebrief(workout());
    const clean = sanitizeDebriefs([
      null,
      { workoutId: 'x' },
      {
        ...debrief,
        status: 'weird',
        answers: { load: { choices: ['right', 'heavy', 'bogus'] }, energy: { choices: ['nope'] } },
      },
      { ...debrief, title: 'duplicate' },
    ]);
    expect(clean).toHaveLength(1);
    expect(clean[0].status).toBe('pending');
    expect(clean[0].answers).toEqual({ load: { choices: ['right'] } });
  });

  it('keeps the newest, up to the cap', () => {
    const many = Array.from({ length: DEBRIEF_CAP + 5 }, (_, i) =>
      createDebrief(
        workout({
          id: `w${i}`,
          startedAt: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString(),
        }),
      ),
    );
    const clean = sanitizeDebriefs(many);
    expect(clean).toHaveLength(DEBRIEF_CAP);
    expect(clean[0].workoutId).toBe(`w${DEBRIEF_CAP + 4}`);
  });

  it('reads anything at all as a list', () => {
    expect(sanitizeDebriefs(undefined)).toEqual([]);
    expect(sanitizeDebriefs('nope')).toEqual([]);
    expect(sanitizeDebriefs({ debriefs: [createDebrief(workout())] })).toHaveLength(1);
  });
});
