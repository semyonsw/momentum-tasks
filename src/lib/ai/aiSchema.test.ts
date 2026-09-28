import { describe, expect, it } from 'vitest';

import { clampWeight, validateBlocks, type ValidateContext } from './aiSchema';

/**
 * The validator. The model's output is untrusted, so each of these is a shape
 * it could actually send — and the rule is always the same: keep what is
 * drawable, drop the rest, never throw.
 */

const workout: ValidateContext = { section: 'Workout', routineIds: new Set(['r_push']) };
const tasks: ValidateContext = { section: 'Tasks', routineIds: new Set() };

const proposal = (over: Record<string, unknown> = {}) => ({
  type: 'routine_proposal',
  proposal: {
    kind: 'new',
    name: 'Legs + Core',
    why: 'Legs had 8 sets in four weeks.',
    exercises: [{ name: 'Back squat', sets: 4, reps: 6, weightKg: 80 }],
    ...over,
  },
});

describe('a valid reply', () => {
  it('passes through whole', () => {
    const reply = {
      blocks: [
        { type: 'text', text: 'Here is your month.' },
        {
          type: 'summary',
          title: 'September',
          stats: [{ label: 'Done', value: '81%' }],
          rows: [{ label: 'Reading', value: '22 of 27', delta: '81%', trend: 'flat' }],
          bars: [{ label: 'Sep', value: 187 }],
          notes: ['Weekends slip.'],
        },
        proposal(),
      ],
    };
    const blocks = validateBlocks(reply, workout);
    expect(blocks.map((b) => b.type)).toEqual(['text', 'summary', 'routine_proposal']);
    expect(blocks[1]).toEqual(reply.blocks[1]);
  });

  it('reads a bare array of blocks too', () => {
    expect(validateBlocks([{ type: 'text', text: 'Hi' }], tasks)).toEqual([
      { type: 'text', text: 'Hi' },
    ]);
  });
});

describe('malformed shapes are dropped', () => {
  it('unknown types, missing fields and non-objects', () => {
    const blocks = validateBlocks(
      {
        blocks: [
          { type: 'image', url: 'x' },
          { type: 'text' },
          { type: 'text', text: '   ' },
          { type: 'summary', title: 'Only a title' },
          null,
          { type: 'text', text: 'kept' },
        ],
      },
      tasks,
    );
    expect(blocks).toEqual([{ type: 'text', text: 'kept' }]);
  });

  it('anything that is not a reply at all', () => {
    for (const raw of [null, undefined, 42, '   ', {}, { blocks: [] }]) {
      expect(validateBlocks(raw, tasks)).toEqual([]);
    }
  });
});

/*
 * THE "SHAPE I COULD NOT READ" BUG. A model answering a plain question
 * ("do you see my routines loop?") sent something close to the schema and not
 * on it — a number where a string goes, a summary with no title, a sentence in
 * the list instead of a block — and the strict validator threw every block
 * away, so the chat said it could not read an answer that was right there.
 * Each case below is one of those, and each must now come through as what it
 * plainly meant.
 */
describe('near-misses are read as what they meant', () => {
  it('a bare sentence in the list, or as the whole reply', () => {
    expect(validateBlocks({ blocks: ['Yes, I see it.'] }, tasks)).toEqual([
      { type: 'text', text: 'Yes, I see it.' },
    ]);
    expect(validateBlocks('Yes.', tasks)).toEqual([{ type: 'text', text: 'Yes.' }]);
  });

  it('a list serialised into a string', () => {
    expect(
      validateBlocks({ blocks: JSON.stringify([{ type: 'text', text: 'Inside.' }]) }, tasks),
    ).toEqual([{ type: 'text', text: 'Inside.' }]);
  });

  it('one block with no wrapper, or under another key', () => {
    expect(validateBlocks({ type: 'text', text: 'Solo.' }, tasks)).toHaveLength(1);
    expect(validateBlocks({ answer: { blocks: [{ type: 'text', text: 'A.' }] } }, tasks)).toEqual([
      { type: 'text', text: 'A.' },
    ]);
  });

  it('numbers where strings go', () => {
    const [summary] = validateBlocks(
      { blocks: [{ type: 'summary', title: 'Week', stats: [{ label: 'Sets', value: 42 }] }] },
      tasks,
    );
    expect(summary).toEqual({
      type: 'summary',
      title: 'Week',
      stats: [{ label: 'Sets', value: '42' }],
    });
  });

  it('a summary with its numbers and no title', () => {
    expect(
      validateBlocks({ blocks: [{ type: 'summary', stats: [{ label: 'a', value: 'b' }] }] }, tasks),
    ).toEqual([{ type: 'summary', title: '', stats: [{ label: 'a', value: 'b' }] }]);
  });

  it('prose under an unknown type or another field name', () => {
    expect(validateBlocks({ blocks: [{ type: 'paragraph', content: 'Words.' }] }, tasks)).toEqual([
      { type: 'text', text: 'Words.' },
    ]);
  });
});

describe('malformed parts of a good block are dropped', () => {
  it('rows and stats missing their label or value, and negative bars', () => {
    const [summary] = validateBlocks(
      {
        blocks: [
          {
            type: 'summary',
            title: 'T',
            stats: [{ label: 'a' }, { label: 'b', value: '2' }],
            rows: [{ value: 'x' }, { label: 'r', value: 'v', trend: 'sideways' }],
            bars: [
              { label: 'Jan', value: -3 },
              { label: 'Feb', value: 'NaN' },
            ],
          },
        ],
      },
      tasks,
    );
    expect(summary).toEqual({
      type: 'summary',
      title: 'T',
      stats: [{ label: 'b', value: '2' }],
      rows: [{ label: 'r', value: 'v' }],
    });
  });
});

describe('caps and clamps', () => {
  it('cuts arrays to what the card was designed for and trims strings', () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ label: `l${i}`, value: 'v' }));
    const [summary] = validateBlocks(
      {
        blocks: [
          {
            type: 'summary',
            title: '  padded  ',
            stats: many(9),
            rows: many(20),
            notes: ['a', 'b', 'c', 'd', 'e'],
          },
        ],
      },
      tasks,
    );
    expect(summary).toMatchObject({ title: 'padded' });
    if (summary.type !== 'summary') throw new Error('expected a summary');
    expect(summary.stats).toHaveLength(3);
    expect(summary.rows).toHaveLength(8);
    expect(summary.notes).toHaveLength(4);
  });

  it('holds sets, reps, weight and rest to a real routine', () => {
    const [block] = validateBlocks(
      [
        proposal({
          exercises: [
            { name: 'Squat', sets: 40, reps: 0, weightKg: 1234.3, restSeconds: 9000 },
            { name: 'Curl', sets: 0.2, reps: 99, weightKg: -5 },
            { name: 'Press', sets: 3, reps: 8, weightKg: 61.3 },
          ],
        }),
      ],
      workout,
    );
    if (block.type !== 'routine_proposal') throw new Error('expected a proposal');
    expect(block.proposal.exercises).toEqual([
      { name: 'Squat', sets: 10, reps: 1, weightKg: 500, restSeconds: 600 },
      { name: 'Curl', sets: 1, reps: 50, weightKg: 0 },
      { name: 'Press', sets: 3, reps: 8, weightKg: 61.5 },
    ]);
  });

  it('snaps weight to half kilograms', () => {
    expect(clampWeight(22.26)).toBe(22.5);
    expect(clampWeight(22.24)).toBe(22);
  });

  it('keeps a known muscle and drops an invented one', () => {
    const [block] = validateBlocks(
      [
        proposal({
          exercises: [
            { name: 'Hip thrust', sets: 3, reps: 10, weightKg: 60, muscle: 'glutes' },
            { name: 'Tongue curl', sets: 3, reps: 10, weightKg: 0, muscle: 'tongue' },
          ],
        }),
      ],
      workout,
    );
    if (block.type !== 'routine_proposal') throw new Error('expected a proposal');
    expect(block.proposal.exercises[0].muscle).toBe('glutes');
    expect(block.proposal.exercises[1].muscle).toBeUndefined();
  });
});

describe('proposals', () => {
  it('are never proposals outside the Workout section — only their reason, as text', () => {
    for (const ctx of [tasks, { ...tasks, section: 'Expenses' as const }]) {
      const blocks = validateBlocks({ blocks: [proposal()] }, ctx);
      expect(blocks.every((b) => b.type === 'text')).toBe(true);
    }
  });

  it('are dropped when an edit targets a routine the context did not name', () => {
    const gone = validateBlocks(
      { blocks: [proposal({ kind: 'edit', targetRoutineId: 'r_gone' })] },
      workout,
    );
    expect(gone.some((b) => b.type === 'routine_proposal')).toBe(false);
    expect(
      validateBlocks({ blocks: [proposal({ kind: 'edit' })] }, workout).some(
        (b) => b.type === 'routine_proposal',
      ),
    ).toBe(false);
    expect(
      validateBlocks({ blocks: [proposal({ kind: 'edit', targetRoutineId: 'r_push' })] }, workout),
    ).toHaveLength(1);
  });

  it('are dropped with no exercises, no name or no why', () => {
    for (const over of [{ exercises: [] }, { name: '' }, { why: undefined }, { kind: 'delete' }]) {
      const blocks = validateBlocks({ blocks: [proposal(over)] }, workout);
      expect(blocks.some((b) => b.type === 'routine_proposal')).toBe(false);
    }
  });

  it('come at most one per reply', () => {
    const blocks = validateBlocks({ blocks: [proposal(), proposal({ name: 'Second' })] }, workout);
    expect(blocks).toHaveLength(1);
  });
});

describe('a suggested training loop', () => {
  const loopCtx: ValidateContext = {
    section: 'Workout',
    routineIds: new Set(['r_push', 'r_pull']),
  };
  const loop = (sequence: unknown) => ({ type: 'sequence_proposal', sequence });

  it('keeps the whole loop in order, repeats and all', () => {
    expect(
      validateBlocks(
        {
          blocks: [
            loop({ routineIds: ['r_push', 'r_pull', 'r_push'], next: 2, why: 'Push twice.' }),
          ],
        },
        loopCtx,
      ),
    ).toEqual([
      {
        type: 'sequence_proposal',
        sequence: { routineIds: ['r_push', 'r_pull', 'r_push'], next: 2, why: 'Push twice.' },
      },
    ]);
  });

  it('drops steps naming a routine the phone never described, and clamps next', () => {
    const [block] = validateBlocks(
      { blocks: [loop({ routineIds: ['r_push', 'Push', 'r_gone'], next: 9, why: 'W.' })] },
      loopCtx,
    );
    expect(block).toEqual({
      type: 'sequence_proposal',
      sequence: { routineIds: ['r_push'], next: 0, why: 'W.' },
    });
  });

  it('is never a loop outside the Workout chat, nor with no valid step — only its reason', () => {
    expect(
      validateBlocks({ blocks: [loop({ routineIds: ['r_push'], why: 'W.' })] }, tasks),
    ).toEqual([{ type: 'text', text: 'W.' }]);
    expect(
      validateBlocks({ blocks: [loop({ routineIds: ['nope'], why: 'W.' })] }, loopCtx),
    ).toEqual([{ type: 'text', text: 'W.' }]);
  });
});
