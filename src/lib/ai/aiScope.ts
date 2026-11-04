/**
 * Which section the assistant serves in which app — and so what it may read,
 * describe and change.
 *
 * Until 3.0.0 one app held all three logs, and the assistant was told about the
 * other two in a brief (`withBriefs`) so "what does the gym cost me?" could be
 * answered from the training chat. Since the split (`lib/appVariant.ts`) each
 * APK is ONE log, and the assistant inside it is that log's assistant and
 * nothing else:
 *
 *   • it reads only its own section — no `otherSections` brief, even in the
 *     Workout app, whose store still holds the tasks and the money from 2.x.
 *     That data is kept for the backup to carry, not shown; an assistant that
 *     quoted it back would be the one place the app still showed it, and a
 *     question about it would have no screen to send the user to;
 *   • it describes only its own app (`appGuide(variant)`): a path of taps into a
 *     section this APK does not have is a wrong answer, not a helpful one;
 *   • it changes only its own section's data. The validator already files every
 *     change under one section (`aiChanges.ts`, `SECTION_OF`) and drops the
 *     rest; `aiServes` is the second wall, at the store writes in
 *     `state/aiActions.ts`, for a chat this app should never have opened — the
 *     Workout app's persisted Tasks and Expenses chats from 2.x, whose pending
 *     cards are still on disk.
 *
 * Every decision takes the variant as a parameter: `APP_VARIANT` is `workout`
 * under vitest, and a test that wants the Tasks app passes `'tasks'` rather than
 * rebuilding the module under an env var.
 */

import { APP_VARIANTS, variantSection, type AppVariant } from '../appVariant';
import type { AiSection } from './aiSchema';

/** The one section this app's assistant serves. */
export function aiSection(variant: AppVariant): AiSection {
  return variantSection(variant);
}

/**
 * The sections this app's assistant has a chat for, in order. One, in every app
 * since the split — a list so the store's per-section maps and this agree on
 * the vocabulary, and so a screen that loops over "the chats" loops over this.
 */
export function aiSections(variant: AppVariant): readonly AiSection[] {
  return [aiSection(variant)];
}

/** Whether this app's assistant may answer in — or write from — `section`'s chat. */
export function aiServes(variant: AppVariant, section: AiSection): boolean {
  return aiSection(variant) === section;
}

/**
 * The app a section's chat lives in. A chat is only ever opened in its own app
 * (`aiServes`), so the section alone says which app's guide and preamble go
 * with it — `systemPrompt` needs no second argument to get it right.
 */
export function sectionVariant(section: AiSection): AppVariant {
  return APP_VARIANTS.find((variant) => aiSection(variant) === section) ?? 'workout';
}

/**
 * Which other sections' briefs ride along with a question. None: see the file
 * header. Kept as a decision rather than deleted with the call, because "should
 * the training chat see the spending?" is a question that will be asked again,
 * and this is where its answer — and its test — lives.
 */
// Both parameters are the question's shape, even though the answer is "none".
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function briefedSections(variant: AppVariant, section: AiSection): readonly AiSection[] {
  return [];
}

/**
 * `What it reads`, on AI settings — this app's log, named, because "only the
 * section you ask from" stopped being a choice when there was one section.
 * A `t()` key; the screen translates it.
 */
export function aiReadsNote(variant: AppVariant): string {
  switch (aiSection(variant)) {
    case 'Workout':
      return 'Only your training — workouts, routines, exercises and the answers after a workout — summarised on the phone first. Nothing is changed until you press Add or Apply.';
    case 'Tasks':
      return 'Only your daily tasks, the days you answered and your notes, summarised on the phone first. Nothing is changed until you press Apply.';
    case 'Expenses':
      return 'Only your amounts, categories, accounts and budgets, summarised on the phone first. Nothing is changed until you press Apply.';
  }
}
