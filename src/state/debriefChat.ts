/**
 * `Ask the assistant about it`, from the debrief's last screen: a NEW training
 * chat whose first message is this workout, spelled out.
 *
 * WHY A NEW CHAT. The Workout chat is one running conversation, and the debrief
 * question used to land at the bottom of whatever was there — under last week's
 * routine argument, travelling with that history to the model. A workout review
 * is its own conversation, so the current one is filed to the archive first
 * (`clearChat` archives, it does not delete — the old chat is one tap away in
 * history) and the review starts clean.
 *
 * EXCEPT WHILE AN ANSWER IS ON ITS WAY. Clearing then would orphan it: the reply
 * would arrive into a chat that no longer holds its question. So with
 * `pending.Workout` set the chat is left alone and the shell opens it as before;
 * `sendMessage` refuses a second question while one is pending, so the message
 * is not sent — the same outcome the old flow had in that state, and the user
 * is looking at the chat, mid-answer, rather than at an error.
 *
 * Not a component, so it can be tested against the real stores; the sheet is
 * one call to this.
 */

import { useAi } from './aiStore';
import { useDebriefs } from './debriefStore';
import { useLibrary } from './libraryStore';
import { useSettings } from './settingsStore';
import { useWorkoutHistory } from './workoutHistoryStore';
import { debriefChatMessage, debriefShortPrompt } from '../lib/debrief';
import type { ID } from '../types/models';

export function startDebriefChat(workoutId: ID): void {
  const debrief = useDebriefs.getState().debriefs.find((d) => d.workoutId === workoutId);
  if (!debrief) return;
  const lang = useSettings.getState().language;
  const workout = useWorkoutHistory.getState().workouts.find((w) => w.id === workoutId);
  const { routines, exercises } = useLibrary.getState();
  // Nothing answered still starts a fresh chat — with the short question.
  const message =
    debriefChatMessage(debrief, workout, { routines, exercises }, lang) ??
    debriefShortPrompt(debrief, lang);

  const ai = useAi.getState();
  if (!ai.pending.Workout) ai.clearChat('Workout');
  // Closes the sheet too (`openId: null`); the shell opens the chat on it.
  useDebriefs.getState().askAi(message);
}
