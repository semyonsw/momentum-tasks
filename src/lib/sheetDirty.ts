/**
 * WHEN CLOSING A SHEET WOULD LOSE SOMETHING — the task editor's draft.
 *
 * Every way out of a sheet (scrim, handle, hardware back, `Cancel`) used to be
 * the non-committal answer and nothing more, which was right for a confirm and
 * wrong for the task editor: a name typed, three days picked and a reminder set
 * went with one stray tap on the dimmed edge. So the editor now asks
 * "Discard changes?" first — but ONLY when there is something to lose. An
 * untouched sheet still leaves on one tap, because a question in front of every
 * close teaches people to tap through questions.
 *
 * "Something to lose" is judged on what SAVE WOULD WRITE, not on whether a
 * control was touched: picking `Once` and going back to `Every day`, or typing a
 * trailing space, changes nothing the store would see, so it asks nothing. The
 * prototype's `edDirty` flag (set on any touch) was the rejected alternative —
 * it asks about edits that have already been undone by hand.
 *
 * The answer itself is `editorBack` (`lib/editorLeave.ts`), the same rule the
 * routine and exercise editors leave by: ask when dirty, leave otherwise.
 */

import type { TaskReminder, TaskSchedule, TaskTarget } from './tasks';

/** What the task editor opened with, or would save now. */
export interface TaskDraftShape {
  name: string;
  schedule: TaskSchedule;
  startedOn: string;
  reminder: TaskReminder | null;
  /** A target counted in parts (T1); absent and null are the same answer. */
  target?: TaskTarget | null;
}

/** The draft as the store would receive it: trimmed, days in order, no empty `every`. */
function canonical(draft: TaskDraftShape): string {
  const schedule =
    draft.schedule.kind === 'weekdays'
      ? { kind: 'weekdays', days: [...new Set(draft.schedule.days)].sort((a, b) => a - b) }
      : draft.schedule;
  const reminder = draft.reminder
    ? {
        hour: draft.reminder.hour,
        minute: draft.reminder.minute,
        every: draft.reminder.every ?? null,
      }
    : null;
  return JSON.stringify({
    name: draft.name.trim(),
    schedule,
    // A one-day task's start IS its day; the editor sends it that way.
    startedOn: draft.schedule.kind === 'once' ? draft.schedule.day : draft.startedOn,
    reminder,
    target: draft.target ? { count: draft.target.count, unit: draft.target.unit.trim() } : null,
  });
}

/** True when saving now would write something different from what was opened. */
export function taskDraftChanged(opened: TaskDraftShape, current: TaskDraftShape): boolean {
  return canonical(opened) !== canonical(current);
}
