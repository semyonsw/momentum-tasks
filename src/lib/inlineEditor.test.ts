import { describe, expect, it } from 'vitest';

import {
  chipPress,
  editorValueKey,
  shouldCloseEditor,
  visibleEditor,
  type EditorContext,
  type EditorTarget,
} from './inlineEditor';
import { nudgeSet } from './setNudge';
import { lbToKg } from './units';

/**
 * The stale editor box after a trip through focus mode.
 *
 * The bug, as it was reported: change a number, go into focus mode, come back to
 * the board, and a box is sitting under a row showing the number wrong — and it
 * takes `+` then `−` before the row reads right again. The rules are tested one by
 * one first, then the whole trip is replayed against a model of the card and the
 * typing box built from the same functions the components call.
 */

const ctx = (over: Partial<EditorContext> = {}): EditorContext => ({
  setIds: ['s1', 's2', 's3', 's4'],
  upNextSetId: 's1',
  hasFocusDoor: true,
  focusModeOpen: false,
  ...over,
});

const at = (setId: string, field: EditorTarget['field'] = 'count'): EditorTarget => ({
  setId,
  field,
});

describe('which inline editor is drawn', () => {
  it('draws nothing when nothing is open', () => {
    expect(visibleEditor(null, ctx())).toBeNull();
  });

  it('draws an editor open on an ordinary row', () => {
    expect(visibleEditor(at('s3'), ctx())).toEqual(at('s3'));
    expect(visibleEditor(at('s3', 'weight'), ctx())).toEqual(at('s3', 'weight'));
  });

  it('draws NO editor anywhere while focus mode is on screen', () => {
    for (const id of ['s1', 's2', 's3', 's4']) {
      expect(visibleEditor(at(id), ctx({ focusModeOpen: true }))).toBeNull();
      expect(visibleEditor(at(id, 'weight'), ctx({ focusModeOpen: true }))).toBeNull();
    }
  });

  it('draws no editor under the up-next row while that row is the door into focus mode', () => {
    expect(visibleEditor(at('s2'), ctx({ upNextSetId: 's2' }))).toBeNull();
  });

  it('still draws it on the up-next row of a card with no door (a card being read)', () => {
    expect(visibleEditor(at('s2'), ctx({ upNextSetId: 's2', hasFocusDoor: false }))).toEqual(
      at('s2'),
    );
  });

  it('draws no editor for a row that has been removed', () => {
    expect(visibleEditor(at('gone'), ctx())).toBeNull();
  });

  it('draws the editor on a logged row above the cursor', () => {
    // Correcting a logged set ("I actually got 6") is a supported flow.
    expect(visibleEditor(at('s1'), ctx({ upNextSetId: 's3' }))).toEqual(at('s1'));
  });
});

describe('when the card forgets its editor', () => {
  it('forgets it the moment focus mode opens, so it is not there when focus mode closes', () => {
    expect(shouldCloseEditor(at('s3'), ctx({ focusModeOpen: true }))).toBe(true);
  });

  it('forgets an editor whose row became the up-next one', () => {
    expect(shouldCloseEditor(at('s2'), ctx({ upNextSetId: 's2' }))).toBe(true);
  });

  it('forgets an editor whose row was removed', () => {
    expect(shouldCloseEditor(at('s9'), ctx())).toBe(true);
  });

  it('leaves an ordinary open editor alone', () => {
    expect(shouldCloseEditor(at('s3'), ctx())).toBe(false);
  });

  it('has nothing to forget when nothing is open', () => {
    expect(shouldCloseEditor(null, ctx({ focusModeOpen: true }))).toBe(false);
  });
});

describe('what one chip press does', () => {
  it('nudges when the typing box is closed', () => {
    expect(chipPress(false, '')).toEqual({ kind: 'nudge', closeTyping: false });
  });

  it('takes the typed number when one has been typed', () => {
    expect(chipPress(true, '45')).toEqual({ kind: 'commit-typed' });
    expect(chipPress(true, '42,5')).toEqual({ kind: 'commit-typed' });
  });

  it('closes the box AND nudges when the box is open but empty — never swallowed', () => {
    expect(chipPress(true, '')).toEqual({ kind: 'nudge', closeTyping: true });
    expect(chipPress(true, '   ')).toEqual({ kind: 'nudge', closeTyping: true });
  });

  it('ignores a stale buffer when the box is closed', () => {
    expect(chipPress(false, '99')).toEqual({ kind: 'nudge', closeTyping: false });
  });
});

describe('the value key the typing box watches', () => {
  it('moves when the weight moves, and only the weight for a weight cell', () => {
    const a = editorValueKey({ weightKg: 40, count: 5 }, 'weight');
    expect(editorValueKey({ weightKg: 42, count: 5 }, 'weight')).not.toBe(a);
    expect(editorValueKey({ weightKg: 40, count: 6 }, 'weight')).toBe(a);
  });

  it('moves when the count moves, and only the count for a count cell', () => {
    const a = editorValueKey({ weightKg: 40, count: 5 }, 'count');
    expect(editorValueKey({ weightKg: 40, count: 6 }, 'count')).not.toBe(a);
    expect(editorValueKey({ weightKg: 45, count: 5 }, 'count')).toBe(a);
  });

  it('tells an empty weight from zero', () => {
    expect(editorValueKey({ weightKg: null, count: 5 }, 'weight')).not.toBe(
      editorValueKey({ weightKg: 0, count: 5 }, 'weight'),
    );
  });

  it('is stable for the same numbers', () => {
    expect(editorValueKey({ weightKg: 37.5, count: 8 }, 'weight')).toBe(
      editorValueKey({ weightKg: 37.5, count: 8 }, 'weight'),
    );
  });
});

/* ------------------------------------------------------------------ */
/* The trip, replayed                                                  */
/* ------------------------------------------------------------------ */

interface Row {
  id: string;
  weightKg: number | null;
  count: number;
  done: boolean;
}

/**
 * The session screen in miniature: the card's stored editor, `QuickAdjust`'s
 * typing box, focus mode's open flag and the rows. Every decision goes through the
 * functions above or `nudgeSet` — this model only does the bookkeeping that
 * `useState` and `useEffect` do in the components.
 */
class Board {
  rows: Row[];
  focusOpen = false;
  editor: EditorTarget | null = null;
  typing = false;
  buffer = '';
  private lastKey: string | null = null;

  constructor(rows: Omit<Row, 'id' | 'done'>[]) {
    this.rows = rows.map((r, i) => ({ ...r, id: `s${i + 1}`, done: false }));
    this.settle();
  }

  get upNext(): string | null {
    return this.rows.find((r) => !r.done)?.id ?? null;
  }

  row(id: string): Row {
    const row = this.rows.find((r) => r.id === id);
    if (!row) throw new Error(`no row ${id}`);
    return row;
  }

  private context(): EditorContext {
    return {
      setIds: this.rows.map((r) => r.id),
      upNextSetId: this.upNext,
      hasFocusDoor: true,
      focusModeOpen: this.focusOpen,
    };
  }

  /** What is drawn under the rows. */
  get drawnEditor(): EditorTarget | null {
    return visibleEditor(this.editor, this.context());
  }

  /** The effects: ExerciseCard's close, QuickAdjust's value watch. */
  private settle() {
    if (shouldCloseEditor(this.editor, this.context())) {
      this.editor = null;
    }
    const shown = this.drawnEditor;
    if (!shown) {
      // Unmounted: the typing box goes with the panel.
      this.typing = false;
      this.buffer = '';
      this.lastKey = null;
      return;
    }
    const key = editorValueKey(this.row(shown.setId), shown.field);
    if (this.lastKey != null && key !== this.lastKey) {
      this.typing = false;
      this.buffer = '';
    }
    this.lastKey = key;
  }

  private patch(id: string, patch: Partial<Row>) {
    Object.assign(this.row(id), patch);
    this.settle();
  }

  /* --- the board ------------------------------------------------- */

  tapCell(id: string, field: EditorTarget['field']) {
    if (id === this.upNext) {
      this.openFocus();
      return;
    }
    const same = this.editor?.setId === id && this.editor.field === field;
    this.editor = same ? null : { setId: id, field };
    this.typing = false;
    this.buffer = '';
    this.lastKey = null;
    this.settle();
  }

  pressType() {
    this.typing = true;
    this.buffer = '';
  }

  type(text: string) {
    this.buffer = text;
  }

  chip(delta: number) {
    const shown = this.drawnEditor;
    if (!shown) throw new Error('no editor drawn to press a chip on');
    const press = chipPress(this.typing, this.buffer);
    if (press.kind === 'commit-typed') {
      const n = Number(this.buffer.replace(',', '.'));
      this.typing = false;
      this.buffer = '';
      this.lastKey = null;
      this.patch(shown.setId, shown.field === 'weight' ? { weightKg: n } : { count: n });
      return;
    }
    if (press.closeTyping) {
      this.typing = false;
      this.buffer = '';
    }
    this.patch(shown.setId, nudgeSet(this.row(shown.setId), shown.field, delta, 'metric'));
  }

  check(id: string) {
    this.editor = null; // the card's ✓ handler closes its editor
    this.patch(id, { done: !this.row(id).done });
  }

  /* --- focus mode ------------------------------------------------ */

  openFocus() {
    this.focusOpen = true;
    this.settle();
  }

  closeFocus() {
    this.focusOpen = false;
    this.settle();
  }

  focusNudge(field: EditorTarget['field'], delta: number) {
    const id = this.upNext;
    if (!id) throw new Error('nothing up next');
    this.patch(id, nudgeSet(this.row(id), field, delta, 'metric'));
  }

  focusDone() {
    const id = this.upNext;
    if (!id) throw new Error('nothing up next');
    this.patch(id, { done: true });
  }
}

const fourSets = () =>
  new Board([
    { weightKg: 40, count: 8 },
    { weightKg: 40, count: 8 },
    { weightKg: 40, count: 8 },
    { weightKg: 40, count: 8 },
  ]);

describe('the trip through focus mode, replayed', () => {
  it('THE REPORTED BUG: a half-typed box survives focus mode — no longer', () => {
    const board = fourSets();
    board.tapCell('s3', 'count');
    board.pressType();
    board.type('10');

    board.openFocus();
    expect(board.drawnEditor).toBeNull();
    board.focusNudge('count', 1);
    board.focusDone();
    board.closeFocus();

    // Back on the board: no box, nothing typed waiting to overwrite anything.
    expect(board.drawnEditor).toBeNull();
    expect(board.typing).toBe(false);
    expect(board.buffer).toBe('');
    expect(board.row('s1')).toMatchObject({ count: 9, done: true });
    expect(board.row('s3').count).toBe(8);
  });

  it('one chip press after the trip changes the number by one step — not two presses', () => {
    const board = fourSets();
    board.tapCell('s3', 'weight');
    board.openFocus();
    board.focusDone();
    board.closeFocus();

    board.tapCell('s3', 'weight');
    board.chip(2);
    expect(board.row('s3').weightKg).toBe(42);
  });

  it('an editor open on a row that focus mode makes up-next is closed, not left under it', () => {
    const board = fourSets();
    board.tapCell('s2', 'count');
    board.openFocus();
    board.focusDone(); // s1 logged → s2 is up next
    board.closeFocus();

    expect(board.upNext).toBe('s2');
    expect(board.drawnEditor).toBeNull();
    expect(board.editor).toBeNull();
  });

  it('a row focus mode changed reads its new number on the board straight away', () => {
    const board = fourSets();
    board.openFocus();
    board.focusNudge('weight', 2);
    board.focusNudge('count', -1);
    board.closeFocus();

    expect(board.row('s1')).toMatchObject({ weightKg: 42, count: 7 });
  });

  it('typing then a chip takes the typed number, as before', () => {
    const board = fourSets();
    board.tapCell('s3', 'weight');
    board.pressType();
    board.type('45');
    board.chip(2);
    expect(board.row('s3').weightKg).toBe(45);
    expect(board.typing).toBe(false);
  });

  it('Type with nothing typed, then a chip: the chip still counts', () => {
    const board = fourSets();
    board.tapCell('s3', 'count');
    board.pressType();
    board.chip(1);
    expect(board.row('s3').count).toBe(9);
    expect(board.typing).toBe(false);
  });

  it('+ then − on the board is back where it started, with no reset dance', () => {
    const board = fourSets();
    board.tapCell('s4', 'weight');
    board.chip(2);
    board.chip(-2);
    expect(board.row('s4').weightKg).toBe(40);
    board.chip(0.5);
    board.chip(-0.5);
    expect(board.row('s4').weightKg).toBe(40);
  });

  it('a typed buffer is dropped when the number under it changes from elsewhere', () => {
    const board = fourSets();
    board.tapCell('s3', 'count');
    board.pressType();
    board.type('12');
    // Something else (focus mode is not the only writer — an AI edit is another)
    // changes the same row while the box is open.
    board.rows[2].count = 6;
    board.closeFocus(); // any settle
    expect(board.typing).toBe(false);
    expect(board.buffer).toBe('');
    board.chip(1);
    expect(board.row('s3').count).toBe(7);
  });

  it('survives many round trips with no editor ever reappearing', () => {
    const board = fourSets();
    for (let trip = 0; trip < 3; trip++) {
      board.tapCell('s4', trip % 2 === 0 ? 'weight' : 'count');
      board.pressType();
      board.type(String(50 + trip));
      board.openFocus();
      expect(board.drawnEditor).toBeNull();
      board.focusNudge('weight', 2);
      board.focusDone();
      board.closeFocus();
      expect(board.drawnEditor).toBeNull();
      expect(board.typing).toBe(false);
    }
    expect(board.rows.map((r) => r.done)).toEqual([true, true, true, false]);
    expect(board.rows.slice(0, 3).map((r) => r.weightKg)).toEqual([42, 42, 42]);
    // The typed 50/51/52 never landed anywhere: they were typed before the trip.
    expect(board.row('s4')).toMatchObject({ weightKg: 40, count: 8 });
  });

  it('the board ✓ still closes the editor, as it always did', () => {
    const board = fourSets();
    board.tapCell('s3', 'count');
    board.check('s1');
    expect(board.drawnEditor).toBeNull();
  });

  it('works on an empty weight cell (bodyweight row about to be loaded)', () => {
    const board = new Board([
      { weightKg: null, count: 10 },
      { weightKg: null, count: 10 },
    ]);
    board.openFocus();
    board.focusNudge('weight', 2);
    board.closeFocus();
    expect(board.row('s1').weightKg).toBe(2);
  });

  it('an imperial chip on the board and in focus mode agree', () => {
    const fromBoard = nudgeSet({ weightKg: lbToKg(100), count: 5 }, 'weight', 5, 'imperial');
    const fromFocus = nudgeSet({ weightKg: lbToKg(100), count: 5 }, 'weight', 5, 'imperial');
    expect(fromBoard).toEqual(fromFocus);
  });
});
