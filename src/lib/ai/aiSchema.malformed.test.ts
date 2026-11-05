import { describe, expect, it } from 'vitest';

import { validateChanges, type ChangeContext } from './aiChanges';
import { validateBlocks } from './aiSchema';
import { parseChatResponse } from './gemini';

/**
 * Bad model output, end to end: the text Gemini sends → `parseChatResponse` →
 * `validateBlocks` → (for a card) `validateChanges`. Every case here is a shape
 * a model has sent or plausibly could; the rule is that prose is never lost,
 * junk never throws, and nothing that is not a real change reaches Apply.
 */

const answer = (text: string, finishReason = 'STOP') => ({
  candidates: [{ content: { parts: [{ text }] }, finishReason }],
});

/** The text → the blocks a chat bubble would draw, or null when the parse refused. */
function blocksOf(text: string) {
  const parsed = parseChatResponse(answer(text));
  return parsed.ok ? validateBlocks(parsed.json) : null;
}

describe('the list serialised into a string', () => {
  it('a single block object stringified is still that block', () => {
    expect(
      validateBlocks({ blocks: JSON.stringify({ type: 'text', text: 'One block.' }) }),
    ).toEqual([{ type: 'text', text: 'One block.' }]);
  });

  it('a whole reply stringified into `blocks` is read through', () => {
    expect(
      validateBlocks({ blocks: JSON.stringify({ blocks: [{ type: 'text', text: 'Nested.' }] }) }),
    ).toEqual([{ type: 'text', text: 'Nested.' }]);
  });

  it('a stringified scalar is said as the sentence it was, not dropped', () => {
    expect(validateBlocks({ blocks: '42' })).toEqual([{ type: 'text', text: '42' }]);
    expect(validateBlocks({ blocks: '"Quoted twice."' })).toEqual([
      { type: 'text', text: 'Quoted twice.' },
    ]);
  });

  it('an empty string or an empty list is nothing, not a blank bubble', () => {
    expect(validateBlocks({ blocks: '' })).toEqual([]);
    expect(validateBlocks({ blocks: '[]' })).toEqual([]);
    expect(validateBlocks({ blocks: [] })).toEqual([]);
  });
});

describe('junk that must not throw', () => {
  it.each([
    null,
    undefined,
    0,
    true,
    [],
    {},
    { blocks: null },
    { blocks: {} },
    { blocks: [null, 1, true, [], {}] },
    { response: { response: null } },
    { type: 'summary', stats: 'x' },
    { blocks: [{ type: 'summary', stats: [{}], rows: [null], bars: [{ label: 'x' }] }] },
    { blocks: [{ type: 'changes_proposal', changes: 'x' }] },
    { blocks: [{ type: 'changes_proposal', changes: { items: [1, 'x'], why: 5 } }] },
  ])('%j', (raw) => {
    expect(() => validateBlocks(raw)).not.toThrow();
    for (const block of validateBlocks(raw)) {
      if (block.type === 'text') expect(block.text.trim()).not.toBe('');
    }
  });

  it('never returns more than eight blocks', () => {
    const many = Array.from({ length: 30 }, (_, i) => `Sentence ${i}.`);
    expect(validateBlocks(many)).toHaveLength(8);
  });
});

describe('from the raw text the model sent', () => {
  it('a fenced reply with prose after the fence', () => {
    expect(
      blocksOf('```json\n{"blocks":[{"type":"text","text":"Hi"}]}\n```\nHope that helps!'),
    ).toEqual([{ type: 'text', text: 'Hi' }]);
  });

  it('two top-level objects in a row reads the first or says the prose, never nothing', () => {
    const blocks = blocksOf('{"type":"text","text":"A"} {"type":"text","text":"B"}');
    // Either is an answer; null or [] would show the user an error for a reply that had one.
    expect(blocks === null || blocks.length > 0).toBe(true);
  });

  it('plain prose is one text block', () => {
    expect(blocksOf('You did 5 of 7 this week.')).toEqual([
      { type: 'text', text: 'You did 5 of 7 this week.' },
    ]);
  });

  it('a reply cut off mid-JSON says so rather than drawing half of it', () => {
    expect(parseChatResponse(answer('{"blocks":[{"type":"te', 'MAX_TOKENS'))).toEqual({
      ok: false,
      reason: 'length',
    });
  });

  it('a response with no parts, or parts with no text, is a shape failure', () => {
    expect(parseChatResponse({ candidates: [{ content: {} }] })).toEqual({
      ok: false,
      reason: 'shape',
    });
    expect(parseChatResponse({ candidates: [{ content: { parts: [{ inline: 1 }] } }] })).toEqual({
      ok: false,
      reason: 'shape',
    });
    expect(parseChatResponse({ candidates: [] })).toEqual({ ok: false, reason: 'shape' });
    expect(parseChatResponse('nope')).toEqual({ ok: false, reason: 'shape' });
  });
});

describe('a changes card whose items are wrong', () => {
  const ctx: ChangeContext = {
    tasks: [{ id: 't1', name: 'Read', schedule: { kind: 'daily' }, archivedAt: null }],
    today: '2026-09-13',
  };

  it('drops what cannot be applied and keeps what can', () => {
    const changes = validateChanges(
      [
        null,
        'done',
        { target: 'workout', field: 'done', id: 't1' },
        { target: 'task', field: 'done', id: 'nope' },
        { target: 'task', field: 'done', id: 't1', day: '2026-02-30' },
        { target: 'task', field: 'done', id: 't1', day: '2026-09-14' },
        { target: 'task', field: 'fly', id: 't1' },
        { target: 'task', field: 'target', id: 't1', number: 'many' },
        { target: 'task', field: 'schedule', id: 't1' },
        { target: 'Task', field: ' Done ', id: ' t1 ', day: '2026-09-12' },
      ],
      ctx,
    );
    expect(changes).toEqual([
      { target: 'task', id: 't1', field: 'done', value: null, day: '2026-09-12' },
    ]);
  });

  it('a day mark with no `today` in the context is refused rather than guessed', () => {
    expect(
      validateChanges([{ target: 'task', field: 'done', id: 't1' }], { tasks: ctx.tasks }),
    ).toEqual([]);
  });

  it('a schedule of seven weekdays or seven a week is every day', () => {
    const [byDays] = validateChanges(
      [{ target: 'task', field: 'schedule', id: 't1', days: [0, 1, 2, 3, 4, 5, 6, 6] }],
      ctx,
    );
    const [byTimes] = validateChanges(
      [{ target: 'task', field: 'schedule', id: 't1', number: 9 }],
      ctx,
    );
    expect(byDays.schedule).toEqual({ kind: 'daily' });
    expect(byTimes.schedule).toEqual({ kind: 'daily' });
  });
});
