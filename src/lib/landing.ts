/**
 * What the landing acts on (U9, U10): the account its Finance tile reads, the
 * task its quick-action chip offers, and which chips are in the row at all.
 *
 * ── THE FINANCE TILE READS THE ACCOUNT THE MONEY SECTION WOULD OPEN ON ─────
 *
 * The tile used to read `accounts[0]` — the first account ever made, even after
 * it was archived, so the landing could show a balance the money section no
 * longer lists. It reads the same account `MoneyScreen` resolves now: the one
 * last chosen inside the section (the shell's money window remembers it for the
 * session), else the first live one. Rejected: the first live account alone
 * (the tile and the section disagree the moment a second account is picked),
 * and persisting the choice (a new stored field for a convenience the section
 * itself does not persist). An archived account is never the answer, not even
 * as a fallback: a landing with no live account says "No accounts yet".
 *
 * ── THE NEXT TASK IS THE FIRST ONE THE TASKS SCREEN STILL WAITS ON ─────────
 *
 * The chip offers ONE task, and the one is the first row of today's list (the
 * Tasks screen's own order, `tasksOn`) that has no answer yet. `done` and
 * `missed` on purpose are both answers, so neither is offered. A task the app
 * ticks itself (`auto`, while `Let the app tick what it knows` is on) is
 * skipped as well, as the design draws it: its answer is coming from a Finish or
 * a saved amount, and a landing that suggests ticking `Gym` by hand is asking
 * the user to do the app's job. With the switch off an `auto` row is an ordinary
 * row, so it is offered like one. Rejected: the task with a reminder soonest
 * (most tasks have none, so the order would be arbitrary for most people), and
 * the longest streak at risk (a streak argument on a screen that has no room to
 * make it).
 *
 * ── WHICH CHIPS SHOW ──────────────────────────────────────────────────────
 *
 * `+ Expense` whenever there is a live account to write it into — which the
 * money store guarantees, so in practice always: it is the landing's one action
 * that never runs out.
 * The task only while one is waiting today. `Resume workout` only while a
 * STARTED session exists — the same rule as the workout section's resume card;
 * an unstarted session is a routine somebody opened to read.
 */

import { entryOf, isCounted, tasksOn, type Task, type TaskLog } from './tasks';

/** The account the Finance tile reads. See the header. */
export function landingAccount<A extends { id: string; archivedAt: string | null }>(
  accounts: readonly A[],
  selectedId: string | null,
): A | null {
  const live = accounts.filter((account) => account.archivedAt === null);
  return live.find((account) => account.id === selectedId) ?? live[0] ?? null;
}

/** The task the chip offers today, or null when nothing is waiting. */
export function nextUnansweredTask(
  tasks: readonly Task[],
  log: TaskLog,
  day: string,
  options: { autoTick: boolean },
): Task | null {
  for (const task of tasksOn(tasks, day)) {
    if (options.autoTick && task.auto !== null) continue;
    // A counted row (T1) is never the chip's: one tap there is one glass, and a
    // ✓ that drank one glass of eight would read as the task done.
    if (isCounted(task)) continue;
    if (entryOf(log, task.id, day).mark === null) return task;
  }
  return null;
}

export type QuickAction = 'expense' | 'task' | 'resume';

/** The chips in the row, in the row's order. */
export function quickActions(input: {
  hasAccount: boolean;
  hasNextTask: boolean;
  sessionLive: boolean;
}): QuickAction[] {
  const row: QuickAction[] = [];
  if (input.hasAccount) row.push('expense');
  if (input.hasNextTask) row.push('task');
  if (input.sessionLive) row.push('resume');
  return row;
}
