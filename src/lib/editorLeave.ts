/**
 * THE TASK EDITOR'S EXIT.
 *
 * The editor holds a draft that is committed only by `Save task` and cancelled
 * by leaving, and BACK ASKS ONLY WHEN THERE IS SOMETHING TO LOSE: `dirty` comes
 * from the editor's own comparison (`lib/sheetDirty.ts`), and an untouched draft
 * leaves on one press. Written down here, once, instead of as an inline ternary
 * in the sheet, because moving the commit is exactly the change that can
 * quietly break the leave rule around it.
 */

/** What the editor's own ‹ does. */
export function editorBack(dirty: boolean): 'ask' | 'leave' {
  return dirty ? 'ask' : 'leave';
}
