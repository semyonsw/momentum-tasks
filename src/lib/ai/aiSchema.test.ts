import { describe, expect, it } from 'vitest';

import { validateBlocks } from './aiSchema';

/**
 * The validator. The model's output is untrusted, so each of these is a shape
 * it could actually send — and the rule is always the same: keep what is
 * drawable, drop the rest, never throw.
 */

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
        { type: 'changes_proposal', changes: { items: [{ target: 'task' }], why: 'Because.' } },
      ],
    };
    const blocks = validateBlocks(reply);
    expect(blocks.map((b) => b.type)).toEqual(['text', 'summary', 'changes_proposal']);
    expect(blocks[1]).toEqual(reply.blocks[1]);
  });

  it('reads a bare array of blocks too', () => {
    expect(validateBlocks([{ type: 'text', text: 'Hi' }])).toEqual([{ type: 'text', text: 'Hi' }]);
  });
});

describe('malformed shapes are dropped', () => {
  it('unknown types, missing fields and non-objects', () => {
    const blocks = validateBlocks({
      blocks: [
        { type: 'image', url: 'x' },
        { type: 'text' },
        { type: 'text', text: '   ' },
        { type: 'summary', title: 'Only a title' },
        null,
        { type: 'text', text: 'kept' },
      ],
    });
    expect(blocks).toEqual([{ type: 'text', text: 'kept' }]);
  });

  it('anything that is not a reply at all', () => {
    for (const raw of [null, undefined, 42, '   ', {}, { blocks: [] }]) {
      expect(validateBlocks(raw)).toEqual([]);
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
    expect(validateBlocks({ blocks: ['Yes, I see it.'] })).toEqual([
      { type: 'text', text: 'Yes, I see it.' },
    ]);
    expect(validateBlocks('Yes.')).toEqual([{ type: 'text', text: 'Yes.' }]);
  });

  it('a list serialised into a string', () => {
    expect(validateBlocks({ blocks: JSON.stringify([{ type: 'text', text: 'Inside.' }]) })).toEqual(
      [{ type: 'text', text: 'Inside.' }],
    );
  });

  it('one block with no wrapper, or under another key', () => {
    expect(validateBlocks({ type: 'text', text: 'Solo.' })).toHaveLength(1);
    expect(validateBlocks({ answer: { blocks: [{ type: 'text', text: 'A.' }] } })).toEqual([
      { type: 'text', text: 'A.' },
    ]);
  });

  it('numbers where strings go', () => {
    const [summary] = validateBlocks({
      blocks: [{ type: 'summary', title: 'Week', stats: [{ label: 'Sets', value: 42 }] }],
    });
    expect(summary).toEqual({
      type: 'summary',
      title: 'Week',
      stats: [{ label: 'Sets', value: '42' }],
    });
  });

  it('a summary with its numbers and no title', () => {
    expect(
      validateBlocks({ blocks: [{ type: 'summary', stats: [{ label: 'a', value: 'b' }] }] }),
    ).toEqual([{ type: 'summary', title: '', stats: [{ label: 'a', value: 'b' }] }]);
  });

  it('prose under an unknown type or another field name', () => {
    expect(validateBlocks({ blocks: [{ type: 'paragraph', content: 'Words.' }] })).toEqual([
      { type: 'text', text: 'Words.' },
    ]);
  });
});

describe('malformed parts of a good block are dropped', () => {
  it('rows and stats missing their label or value, and negative bars', () => {
    const [summary] = validateBlocks({
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
    });
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
    const [summary] = validateBlocks({
      blocks: [
        {
          type: 'summary',
          title: '  padded  ',
          stats: many(9),
          rows: many(20),
          notes: ['a', 'b', 'c', 'd', 'e'],
        },
      ],
    });
    expect(summary).toMatchObject({ title: 'padded' });
    if (summary.type !== 'summary') throw new Error('expected a summary');
    expect(summary.stats).toHaveLength(3);
    expect(summary.rows).toHaveLength(8);
    expect(summary.notes).toHaveLength(4);
  });
});

/* ------------------------------------------------------------------ */
/* Rep ranges and supersets on a proposed row                          */

/* ------------------------------------------------------------------ */
/* A settings-changes card                                             */
/* ------------------------------------------------------------------ */

describe('a changes_proposal block', () => {
  const item = { target: 'exercise', id: 'ex_bench', field: 'rest', number: 90 };

  it('keeps the items raw and the reason', () => {
    expect(
      validateBlocks([{ type: 'changes_proposal', changes: { items: [item], why: 'Faster.' } }]),
    ).toEqual([{ type: 'changes_proposal', changes: { items: [item], why: 'Faster.' } }]);
  });

  it('is recognised without a type, and reads a bare array as the items', () => {
    expect(validateBlocks([{ changes: { items: [item], why: 'x' } }])[0]?.type).toBe(
      'changes_proposal',
    );
    expect(validateBlocks([{ type: 'changes_proposal', changes: [item] }])).toEqual([
      { type: 'changes_proposal', changes: { items: [item], why: '' } },
    ]);
  });

  it('drops non-object items and caps the list', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ ...item, number: i }));
    const [block] = validateBlocks([
      { type: 'changes_proposal', changes: { items: ['x', null, 3, ...many], why: 'y' } },
    ]);
    expect(block.type === 'changes_proposal' && block.changes.items).toHaveLength(12);
    expect(block.type === 'changes_proposal' && block.changes.items[0]).toEqual({
      ...item,
      number: 0,
    });
  });

  it('a bad shape still says its reason; nothing at all says nothing', () => {
    expect(
      validateBlocks([{ type: 'changes_proposal', changes: { items: [], why: 'Rest less.' } }]),
    ).toEqual([{ type: 'text', text: 'Rest less.' }]);
    expect(
      validateBlocks([{ type: 'changes_proposal', changes: { items: 'rest', why: 'Rest less.' } }]),
    ).toEqual([{ type: 'text', text: 'Rest less.' }]);
    expect(validateBlocks([{ type: 'changes_proposal' }])).toEqual([]);
  });

  it('one per reply: a second is said as its reason', () => {
    const blocks = validateBlocks([
      { type: 'changes_proposal', changes: { items: [item], why: 'First.' } },
      { type: 'changes_proposal', changes: { items: [item], why: 'Second.' } },
    ]);
    expect(blocks.map((b) => b.type)).toEqual(['changes_proposal', 'text']);
  });
});
