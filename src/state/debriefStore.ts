/**
 * The debriefs — what the user said about each workout after it was saved.
 *
 * Its own store rather than a column on the workout, for the reason the AI store
 * is its own: the history is SQLite and every column added there is a migration
 * the whole log goes through, while this is a few kilobytes of answers the app
 * works identically without. A workout deleted from the log leaves its debrief
 * behind harmlessly — the context builder only reads debriefs whose workout still
 * exists.
 *
 * `openId` — which debrief the sheet is showing — is session state and is not
 * persisted: a relaunch never reopens a popup the user walked away from. The
 * debrief itself stays `pending`, and Home offers it again.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistedStorage } from './persistStorage';

import type { CompletedWorkout } from '../lib/completedWorkout';
import {
  DEBRIEF_CAP,
  createDebrief,
  isAnswered,
  sanitizeDebriefs,
  type DebriefAnswer,
  type WorkoutDebrief,
} from '../lib/debrief';
import type { ID } from '../types/models';

interface DebriefState {
  /** Newest first. */
  debriefs: WorkoutDebrief[];
  openId: ID | null;
  /**
   * A question for the training chat, left by the sheet's `Ask the assistant`
   * for the shell to open — the sheet is drawn above the navigation, not inside
   * it, so this is how it asks for a route. Not persisted.
   */
  aiPrompt: string | null;
  askAi: (prompt: string) => void;
  clearAiPrompt: () => void;

  /**
   * The debrief filed and about to open (`offer` with a delay). Home's card
   * stays hidden meanwhile, so the same questions are not offered twice at once.
   */
  queuedId: ID | null;
  /**
   * A workout was just saved: file its debrief, and open the sheet on it — now
   * (`true`), after `open` milliseconds, or not at all (`false`).
   */
  offer: (workout: CompletedWorkout, open?: boolean | number) => void;
  open: (workoutId: ID) => void;
  close: () => void;
  /**
   * Write the answers so far. `finished` marks it answered (Done); otherwise it
   * stays pending — `Later` keeps what was typed and offers the rest again.
   */
  saveAnswers: (workoutId: ID, answers: Record<string, DebriefAnswer>, finished: boolean) => void;
  /** "Don't ask about this one". Kept, so it is not offered again. */
  dismiss: (workoutId: ID) => void;
  /** Replace everything from a backup. Returns how many landed. */
  importDebriefs: (raw: unknown) => number;
}

/** The pending delayed open, if any. One at a time: a newer save replaces it. */
let queued: ReturnType<typeof setTimeout> | null = null;

export const useDebriefs = create<DebriefState>()(
  persist(
    (set, get) => ({
      debriefs: [],
      openId: null,
      aiPrompt: null,
      askAi: (prompt) => set({ aiPrompt: prompt, openId: null }),
      clearAiPrompt: () => set({ aiPrompt: null }),

      queuedId: null,
      offer: (workout, open = true) => {
        const existing = get().debriefs.find((d) => d.workoutId === workout.id);
        if (!existing) {
          set({ debriefs: [createDebrief(workout), ...get().debriefs].slice(0, DEBRIEF_CAP) });
        }
        if (queued) clearTimeout(queued);
        queued = null;
        if (open === true) {
          set({ openId: workout.id, queuedId: null });
        } else if (typeof open === 'number') {
          set({ queuedId: workout.id });
          queued = setTimeout(() => {
            queued = null;
            if (get().queuedId !== workout.id) return;
            set({ queuedId: null });
            get().open(workout.id);
          }, open);
        }
      },
      open: (workoutId) => {
        // Only a debrief still waiting: one dismissed from Home's card in the
        // beat before the delayed open fired must stay dismissed.
        const debrief = get().debriefs.find((d) => d.workoutId === workoutId);
        if (debrief?.status === 'pending') set({ openId: workoutId });
      },
      close: () => set({ openId: null }),

      saveAnswers: (workoutId, answers, finished) =>
        set((state) => ({
          debriefs: state.debriefs.map((debrief) => {
            if (debrief.workoutId !== workoutId) return debrief;
            const kept: Record<string, DebriefAnswer> = {};
            for (const question of debrief.questions) {
              const answer = answers[question.id];
              if (isAnswered(answer)) kept[question.id] = answer;
            }
            return {
              ...debrief,
              answers: kept,
              ...(finished
                ? { status: 'answered' as const, answeredAt: new Date().toISOString() }
                : {}),
            };
          }),
        })),

      dismiss: (workoutId) =>
        set((state) => ({
          openId: state.openId === workoutId ? null : state.openId,
          queuedId: state.queuedId === workoutId ? null : state.queuedId,
          debriefs: state.debriefs.map((d) =>
            d.workoutId === workoutId && d.status === 'pending'
              ? { ...d, status: 'dismissed' as const }
              : d,
          ),
        })),

      importDebriefs: (raw) => {
        const debriefs = sanitizeDebriefs(raw);
        set({ debriefs, openId: null });
        return debriefs.length;
      },
    }),
    {
      name: 'debriefs',
      version: 1,
      storage: persistedStorage(),
      partialize: (state) => ({ debriefs: state.debriefs }),
      merge: (persisted, current) => ({
        ...current,
        debriefs: sanitizeDebriefs((persisted as { debriefs?: unknown } | null)?.debriefs),
      }),
    },
  ),
);
