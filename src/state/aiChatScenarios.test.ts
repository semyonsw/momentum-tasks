import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * THE CHAT THAT WENT WRONG, REPLAYED — and the shapes of answer Gemini actually
 * gives, each held to what the card must then show.
 *
 * `fetch` is a queue of scripted Gemini replies; everything else is the real
 * path — the context, the request, the validator, `normalizeProposal`, the
 * stores, Apply and Undo, and the next session's prefill. A live model cannot
 * be asserted on, so these are the guarantees the APP makes about whatever it
 * says: written to match what it did say in the user's screenshots (an edit that
 * leaves the dropped exercise out instead of marking it removed, names in place
 * of ids, reps as "8-10"), and to check that each still draws the right card.
 *
 * The routine is the user's own: Push (Tension on Shoulders), eight exercises,
 * Side Delts logged at 7.5 kg last session.
 */
let storedKey: string | null = null;
vi.mock('../lib/ai/secureKey', () => ({
  getKey: async () => storedKey,
  setKey: async () => true,
  clearKey: async () => {
    storedKey = null;
  },
}));

import { applyProposal, discardProposal, sendMessage } from './aiActions';
import { sanitizeAi, useAi, type StoredProposal } from './aiStore';
import { useLibrary } from './libraryStore';
import { useSettings } from './settingsStore';
import { useWorkoutHistory } from './workoutHistoryStore';
import { proposalTotals, rowStatus, type ProposalRow } from '../lib/ai/aiProposal';
import { recomputeWorkout, type CompletedWorkout } from '../lib/completedWorkout';
import { buildDraftEntry } from '../lib/draft';
import { DEFAULT_OVERLOAD_POLICY } from '../lib/progressiveOverload';
import type { Exercise, Routine, SetHistory } from '../types/models';

/* ------------------------------------------------------------------ */
/* The user's library                                                  */
/* ------------------------------------------------------------------ */

const CREATED = '2026-06-01T00:00:00.000Z';

function exercise(id: string, name: string, weightKg: number | null): Exercise {
  return {
    id,
    ownerId: 'u1',
    name,
    muscleGroups: ['shoulders'],
    requiresWeight: weightKg != null,
    countUnit: 'reps',
    loadMode: weightKg != null ? 'external' : 'none',
    isUnilateral: false,
    ...(weightKg != null ? { defaultWeightKg: weightKg } : {}),
    isArchived: false,
    createdAt: CREATED,
  };
}

const EXERCISES: Exercise[] = [
  exercise('ex_wdips', 'Weighted Dips', 30),
  exercise('ex_dips', 'Dips', null),
  exercise('ex_arnold', 'Arnold Press', 12.5),
  exercise('ex_side', 'Side Delts (Lateral raise)', 7.5),
  exercise('ex_rear', 'Rear Delts (Reversed fly)', 20),
  exercise('ex_traps', 'Traps Raises (with Dumbells)', 20),
  exercise('ex_hlr', 'Hanging leg raises', null),
  exercise('ex_aus', 'Wide Australian Pull-Ups', null),
];

/** [exercise, sets, reps] in routine order. */
const PUSH_ITEMS: [string, number, number][] = [
  ['ex_wdips', 4, 12],
  ['ex_dips', 5, 20],
  ['ex_arnold', 4, 7],
  ['ex_side', 4, 14],
  ['ex_rear', 4, 6],
  ['ex_traps', 4, 20],
  ['ex_hlr', 4, 12],
];

const PUSH: Routine = {
  id: 'r_push_shoulders',
  ownerId: 'u1',
  name: 'Push (Tension on Shoulders)',
  createdAt: CREATED,
  updatedAt: CREATED,
  items: PUSH_ITEMS.map(([exerciseId, targetSets, targetRepsMax], order) => ({
    id: `pi_${order}`,
    exerciseId,
    order,
    targetSets,
    targetRepsMax,
  })),
};

const LAST_SESSION_AT = '2026-09-28T17:00:00.000Z';

/** One finished Push session, so every weighted exercise has history. */
function lastSession(): CompletedWorkout {
  const weights: Record<string, number> = {
    ex_wdips: 30,
    ex_arnold: 12.5,
    ex_side: 7.5,
    ex_rear: 20,
    ex_traps: 20,
  };
  const sets: SetHistory[] = PUSH_ITEMS.flatMap(([exerciseId, count, reps]) =>
    Array.from({ length: count }, (_, setIndex) => ({
      id: `sh_${exerciseId}_${setIndex}`,
      sessionId: 'w1',
      exerciseId,
      performedAt: LAST_SESSION_AT,
      setIndex,
      weightKg: weights[exerciseId] ?? null,
      count: reps,
      countUnit: 'reps' as const,
      loadMode: weights[exerciseId] != null ? ('external' as const) : ('none' as const),
      isWarmup: false,
      isCompleted: true,
    })),
  );
  return recomputeWorkout(
    {
      id: 'w1',
      title: PUSH.name,
      routineId: PUSH.id,
      startedAt: LAST_SESSION_AT,
      endedAt: '2026-09-28T18:10:00.000Z',
      durationMinutes: 70,
      setCount: 0,
      totalVolumeKg: 0,
      volumeIsPartial: false,
      exercises: PUSH_ITEMS.map(([exerciseId]) => {
        const e = EXERCISES.find((x) => x.id === exerciseId)!;
        return {
          exerciseId,
          name: e.name,
          countUnit: e.countUnit,
          loadMode: e.loadMode,
          setCount: 0,
          summary: '',
          totalCount: 0,
          topWeightKg: null,
        };
      }),
      sets,
    },
    null,
    'en',
  );
}

/* ------------------------------------------------------------------ */
/* Scripted Gemini                                                     */
/* ------------------------------------------------------------------ */

type Answer = { status: number; body: unknown };
let answers: Answer[] = [];
const sent: string[] = [];

function gemini(blocks: unknown[]): Answer {
  return {
    status: 200,
    body: { candidates: [{ content: { parts: [{ text: JSON.stringify({ blocks }) }] } }] },
  };
}

type Row = {
  exerciseId?: string;
  name: string;
  sets: unknown;
  reps: unknown;
  weightKg?: unknown;
  change?: string;
};
const row = (
  exerciseId: string,
  sets: number,
  reps: number,
  weightKg: number,
  change = 'same',
): Row => ({
  exerciseId,
  name: EXERCISES.find((e) => e.id === exerciseId)!.name,
  sets,
  reps,
  weightKg,
  change,
});

/** An edit of Push, preceded by its text block, as the prompt asks. */
function editReply(text: string, exercises: Row[], extra: Record<string, unknown> = {}) {
  return gemini([
    { type: 'text', text },
    {
      type: 'routine_proposal',
      proposal: {
        kind: 'edit',
        targetRoutineId: PUSH.id,
        name: PUSH.name,
        why: 'Side delts stalled at 7.5 kg for 4×14.',
        exercises,
        ...extra,
      },
    },
  ]);
}

/* ------------------------------------------------------------------ */
/* Reading what the user sees                                          */
/* ------------------------------------------------------------------ */

function cards(): StoredProposal[] {
  const { chats, proposals } = useAi.getState();
  return chats.Workout.flatMap((m) =>
    m.role === 'model'
      ? m.blocks.flatMap((b) => (b.type === 'proposal' ? [proposals[b.proposalId]] : []))
      : [],
  );
}
const lastCard = () => cards().at(-1)!;
const cardIds = () =>
  useAi
    .getState()
    .chats.Workout.flatMap((m) =>
      m.role === 'model'
        ? m.blocks.flatMap((b) => (b.type === 'proposal' ? [b.proposalId] : []))
        : [],
    );

/** `{ exerciseId: status }` for every row of a card. */
function statuses(card: StoredProposal): Record<string, string> {
  return Object.fromEntries(
    card.proposal.rows.map((r: ProposalRow) => [r.exerciseId ?? r.name, rowStatus(r)]),
  );
}
const rowOf = (card: StoredProposal, id: string) =>
  card.proposal.rows.find((r) => r.exerciseId === id)!;

/** The user turn of the last request: the app note plus the question. */
function lastUserTurn(): string {
  const body = JSON.parse(sent.at(-1)!);
  return body.contents.at(-1).parts[0].text as string;
}

const push = () => useLibrary.getState().routines.find((r) => r.id === PUSH.id)!;

beforeEach(() => {
  storedKey = 'AIzaSyTESTKEY-1234567890abcdef';
  answers = [];
  sent.length = 0;
  useAi.setState({
    ...sanitizeAi({}),
    pending: { Workout: false, Tasks: false, Expenses: false },
    retrying: { Workout: false, Tasks: false, Expenses: false },
  });
  useAi.getState().markReady(500);
  useSettings.getState().resetToDefaults();
  useSettings.getState().setLanguage('en');
  useLibrary.getState().replaceLibrary({ exercises: EXERCISES, routines: [PUSH] });
  useWorkoutHistory.setState({ workouts: [lastSession()] });
  vi.stubGlobal('fetch', async (_url: string, init: { body?: string }) => {
    sent.push(init.body ?? '');
    const next = answers.shift();
    if (!next) throw new TypeError('Network request failed');
    return { status: next.status, text: async () => JSON.stringify(next.body) };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ------------------------------------------------------------------ */
/* The screenshot, turn by turn                                        */
/* ------------------------------------------------------------------ */

/** Turn 1: swap rear delts for pull-ups, side delts down to 5 kg — marked properly. */
const TURN_1 = editReply('Here is Push with the swap.', [
  row('ex_wdips', 4, 12, 30),
  row('ex_dips', 5, 20, 0),
  row('ex_arnold', 4, 7, 12.5),
  row('ex_side', 4, 14, 5, 'changed'),
  row('ex_rear', 4, 6, 20, 'removed'),
  row('ex_aus', 4, 20, 0, 'new'),
  row('ex_traps', 4, 20, 20),
  row('ex_hlr', 4, 12, 0),
]);

/**
 * Turn 2, as Gemini really wrote it: dips to 4 sets, the rest of its earlier
 * suggestion carried — and Rear Delts simply LEFT OUT rather than `removed`.
 */
const TURN_2_OMITS_REAR = editReply('Here is the updated Push with Dips changed to 4 sets.', [
  row('ex_wdips', 4, 12, 30),
  row('ex_dips', 4, 20, 0, 'changed'),
  row('ex_arnold', 4, 7, 12.5),
  row('ex_side', 4, 14, 5, 'changed'),
  row('ex_aus', 4, 20, 0, 'new'),
  row('ex_traps', 4, 20, 20),
  row('ex_hlr', 4, 12, 0),
]);

describe('the chat from the screenshots', () => {
  it('turn 1: the swap draws one card with every change on it', async () => {
    answers = [TURN_1];
    await sendMessage('Workout', 'swap rear delts for wide australian pull-ups');
    const card = lastCard();
    expect(statuses(card)).toEqual({
      ex_wdips: 'same',
      ex_dips: 'same',
      ex_arnold: 'same',
      ex_side: 'changed',
      ex_rear: 'removed',
      ex_aus: 'new',
      ex_traps: 'same',
      ex_hlr: 'same',
    });
    expect(proposalTotals(card.proposal)).toEqual({ exercises: 7, sets: 29, changes: 3 });
    expect(rowOf(card, 'ex_side').was?.weightKg).toBe(7.5);
    // Nothing was written: the card waits for Apply.
    expect(push().items.map((i) => i.exerciseId)).toContain('ex_rear');
  });

  it('turn 2: a removal Gemini leaves out stays removed on the next card', async () => {
    answers = [TURN_1, TURN_2_OMITS_REAR];
    await sendMessage('Workout', 'swap rear delts for wide australian pull-ups');
    await sendMessage('Workout', 'make dips 4 sets instead of 5');
    const card = lastCard();
    expect(statuses(card)).toMatchObject({
      ex_dips: 'changed',
      ex_side: 'changed',
      ex_rear: 'removed', // The bug: this read `same`, and Rear Delts came back.
      ex_aus: 'new',
    });
    expect(proposalTotals(card.proposal)).toEqual({ exercises: 7, sets: 28, changes: 4 });
    // And Gemini was told the first card was never applied.
    expect(lastUserTurn()).toContain('NOT applied');
    expect(lastUserTurn()).toContain('make dips 4 sets instead of 5');
  });

  it('turn 2 applied: the saved routine is exactly what the card showed', async () => {
    answers = [TURN_1, TURN_2_OMITS_REAR];
    await sendMessage('Workout', 'swap rear delts for wide australian pull-ups');
    await sendMessage('Workout', 'make dips 4 sets instead of 5');
    expect(applyProposal(cardIds()[1])).not.toBeNull();
    expect(push().items.map((i) => [i.exerciseId, i.targetSets])).toEqual([
      ['ex_wdips', 4],
      ['ex_dips', 4],
      ['ex_arnold', 4],
      ['ex_side', 4],
      ['ex_aus', 4],
      ['ex_traps', 4],
      ['ex_hlr', 4],
    ]);
    // The superseded first card is still pending, and the next turn says so.
    expect(cards()[0].status).toBe('pending');
    expect(cards()[1].status).toBe('accepted');
  });

  it('after Apply, the next workout really starts Side Delts at 5 kg', async () => {
    answers = [TURN_1];
    await sendMessage('Workout', 'swap rear delts for wide australian pull-ups');
    applyProposal(cardIds()[0]);
    const side = useLibrary.getState().exercises.find((e) => e.id === 'ex_side')!;
    const history = lastSession().sets.filter((s) => s.exerciseId === 'ex_side');
    const entry = buildDraftEntry({
      exercise: side,
      history,
      policy: DEFAULT_OVERLOAD_POLICY,
      unitSystem: 'metric',
      restSeconds: 90,
      transitionRestSeconds: 120,
      targetSets: 4,
      targetRepsMax: 14,
    });
    // Was 7.5: history beat the applied weight, so Apply did nothing.
    expect(entry.sets.map((s) => s.weightKg)).toEqual([5, 5, 5, 5]);
  });

  it('after Apply, "show me my routine" is a card with no changes left on it', async () => {
    answers = [
      TURN_1,
      editReply('Here is your Push routine.', [
        row('ex_wdips', 4, 12, 30),
        row('ex_dips', 5, 20, 0),
        row('ex_arnold', 4, 7, 12.5),
        row('ex_side', 4, 14, 5),
        row('ex_aus', 4, 20, 0),
        row('ex_traps', 4, 20, 20),
        row('ex_hlr', 4, 12, 0),
      ]),
    ];
    await sendMessage('Workout', 'swap rear delts for wide australian pull-ups');
    applyProposal(cardIds()[0]);
    await sendMessage('Workout', 'show me my push routine');
    const card = lastCard();
    // The bug: Side Delts read "7.5 → 5 kg CHANGED" on every card after Apply.
    expect(proposalTotals(card.proposal)).toEqual({ exercises: 7, sets: 29, changes: 0 });
    expect(rowOf(card, 'ex_side').was?.weightKg).toBe(5);
    expect(lastUserTurn()).toContain('APPLIED');
    // And the context Gemini read already has the applied weight.
    const context = JSON.parse(sent.at(-1)!).contents[0].parts[0].text as string;
    const routines = JSON.parse(context.replace('CONTEXT (JSON):\n', '')).routines;
    const sideRow = routines[0].exercises.find((e: { exerciseId: string }) => {
      return e.exerciseId === 'ex_side';
    });
    expect(sideRow.weightKg).toBe(5);
  });

  it('"remove the reversed fly" by itself removes exactly that', async () => {
    answers = [
      editReply('Removed Rear Delts.', [
        row('ex_wdips', 4, 12, 30),
        row('ex_dips', 5, 20, 0),
        row('ex_arnold', 4, 7, 12.5),
        row('ex_side', 4, 14, 7.5),
        row('ex_rear', 4, 6, 20, 'removed'),
        row('ex_traps', 4, 20, 20),
        row('ex_hlr', 4, 12, 0),
      ]),
    ];
    await sendMessage('Workout', 'remove the reversed fly from the routine');
    expect(proposalTotals(lastCard().proposal)).toEqual({ exercises: 6, sets: 25, changes: 1 });
    applyProposal(cardIds()[0]);
    expect(push().items.map((i) => i.exerciseId)).not.toContain('ex_rear');
  });
});

/* ------------------------------------------------------------------ */
/* Other shapes Gemini answers in                                      */
/* ------------------------------------------------------------------ */

describe('a sloppy answer still draws the right card', () => {
  it('names instead of ids, the routine by name, reps as a range, weights as text', async () => {
    answers = [
      gemini([
        { type: 'text', text: 'Edited.' },
        {
          type: 'routine_proposal',
          proposal: {
            kind: 'edit',
            targetRoutineId: 'Push (Tension on Shoulders)',
            name: 'Push (Tension on Shoulders)',
            why: 'Lighter side delts.',
            exercises: [
              {
                name: 'Weighted Dips',
                sets: '4',
                reps: '10-12',
                weightKg: '30 kg',
                change: 'same',
              },
              { name: 'Dips', sets: 5, reps: 20, change: 'same' },
              { name: 'Arnold Press', sets: 4, reps: 7, weightKg: 12.5, change: 'same' },
              { name: 'side delts (lateral raise)', sets: 4, reps: 14, weightKg: 5 },
              { name: 'Rear Delts (Reversed fly)', change: 'removed' },
              { name: 'Traps Raises (with Dumbells)', sets: 4, reps: 20, weightKg: 20 },
              { name: 'Hanging leg raises', sets: 4, reps: 12, weightKg: 0 },
            ],
          },
        },
      ]),
    ];
    await sendMessage('Workout', 'lighter side delts and drop the rear delts');
    const card = lastCard();
    expect(card.proposal).toMatchObject({ kind: 'edit', targetRoutineId: PUSH.id });
    expect(statuses(card)).toMatchObject({
      ex_wdips: 'same',
      ex_side: 'changed',
      ex_rear: 'removed',
    });
    expect(rowOf(card, 'ex_side').weightKg).toBe(5);
  });

  it('a partial edit naming one exercise leaves the rest of the routine alone', async () => {
    answers = [editReply('Dips to 4 sets.', [row('ex_dips', 4, 20, 0, 'changed')])];
    await sendMessage('Workout', 'make dips 4 sets');
    const card = lastCard();
    expect(card.proposal.rows.filter((r) => r.removed)).toEqual([]);
    expect(proposalTotals(card.proposal)).toEqual({ exercises: 7, sets: 28, changes: 1 });
  });

  it('a routine id Gemini made up still gives a card, as a new routine', async () => {
    answers = [
      editReply('Here it is.', [row('ex_wdips', 4, 12, 30), row('ex_dips', 4, 20, 0)], {
        targetRoutineId: 'r_does_not_exist',
        name: 'Something else entirely',
      }),
    ];
    await sendMessage('Workout', 'make me a short push');
    expect(lastCard().proposal.kind).toBe('new');
    expect(lastCard().proposal.rows).toHaveLength(2);
  });

  it('a plain text answer is shown as text, and nothing is proposed', async () => {
    answers = [gemini([{ type: 'text', text: 'Rear delts are trained twice a week.' }])];
    await sendMessage('Workout', 'how often do I train rear delts?');
    expect(cards()).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* What Gemini is told about earlier cards                             */
/* ------------------------------------------------------------------ */

describe('the note on earlier cards', () => {
  it('is absent on the first question', async () => {
    answers = [TURN_1];
    await sendMessage('Workout', 'swap rear delts');
    expect(lastUserTurn()).toBe('swap rear delts');
  });

  it('follows each card through applied, undone and discarded', async () => {
    answers = [TURN_1, gemini([{ type: 'text', text: 'ok' }]), TURN_2_OMITS_REAR];
    await sendMessage('Workout', 'swap rear delts');
    const applied = applyProposal(cardIds()[0])!;
    applied.undo();
    await sendMessage('Workout', 'did that save?');
    expect(lastUserTurn()).toContain('1. routine "Push (Tension on Shoulders)": NOT applied');

    discardProposal(cardIds()[0]);
    await sendMessage('Workout', 'try again');
    expect(lastUserTurn()).toContain('1. routine "Push (Tension on Shoulders)": DISCARDED');
  });

  it('is not saved into the chat as if the user had typed it', async () => {
    answers = [TURN_1, TURN_2_OMITS_REAR];
    await sendMessage('Workout', 'swap rear delts');
    await sendMessage('Workout', 'make dips 4 sets');
    const userTexts = useAi
      .getState()
      .chats.Workout.flatMap((m) => (m.role === 'user' ? [m.text] : []));
    expect(userTexts).toEqual(['swap rear delts', 'make dips 4 sets']);
  });
});

/* ------------------------------------------------------------------ */
/* Undo and the weight plan                                            */
/* ------------------------------------------------------------------ */

describe('an applied weight', () => {
  it('is taken back whole by Undo', async () => {
    answers = [TURN_1];
    await sendMessage('Workout', 'swap rear delts');
    applyProposal(cardIds()[0])!.undo();
    const side = useLibrary.getState().exercises.find((e) => e.id === 'ex_side')!;
    expect(side.defaultWeightKg).toBe(7.5);
    expect(side.startWeightSetAt).toBeUndefined();
    expect(push()).toEqual(PUSH);
  });

  it('gives way to a set logged at another weight', async () => {
    answers = [TURN_1];
    await sendMessage('Workout', 'swap rear delts');
    applyProposal(cardIds()[0]);
    useLibrary.getState().setExerciseDefaultWeight('ex_side', 6);
    const side = useLibrary.getState().exercises.find((e) => e.id === 'ex_side')!;
    expect(side).toMatchObject({ defaultWeightKg: 6 });
    expect(side.startWeightSetAt).toBeUndefined();
  });
});
