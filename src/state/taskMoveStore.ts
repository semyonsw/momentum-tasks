/**
 * `Move`, asked for on a task's own screen and carried out on the day list.
 *
 * The task detail shows the same five actions as the row's menu (redesign
 * #19), and four of them happen where they are tapped. `Move` cannot: a reorder
 * is the day list's drag, with its rows measured under the finger. So the
 * detail screen leaves a REQUEST here and goes back, and `TasksScreen` picks it
 * up — steps to the request's day if it is showing another — and lifts the row,
 * exactly as its own menu's `Move` does.
 *
 * A store rather than a prop through the shell, because the day list may or may
 * not be mounted while the detail is up, and a subscription answers both cases
 * with the same code. Not persisted: a move asked for and never reached is not
 * worth replaying after a restart.
 */

import { create } from 'zustand';

import type { ID } from '../types/models';

export interface TaskMoveRequest {
  taskId: ID;
  /** The day the move was asked for — the list steps there first. */
  day: string;
}

interface TaskMoveState {
  request: TaskMoveRequest | null;
  requestMove: (request: TaskMoveRequest) => void;
  clear: () => void;
}

export const useTaskMove = create<TaskMoveState>((set) => ({
  request: null,
  requestMove: (request) => set({ request }),
  clear: () => set({ request: null }),
}));
