/**
 * What Settings offers in each of the three apps.
 *
 * Settings is the one screen all three APKs share (`lib/appVariant.ts`), and
 * until 3.0.0 it was a map of three logs: a row per section, a CSV for the
 * amounts and one for the workouts, a reset that spoke for "all three
 * sections". Each app now has one log, so each Settings is that log's — its
 * section row, its spreadsheet, its sentences — plus what every app has: the
 * look, the language, the backup and the AI key.
 *
 * ── HIDDEN IS NOT DELETED ─────────────────────────────────────────────────
 *
 * The Workout app's store still holds the 2.x tasks and money, and the settings
 * that went with them (the currency, the task trend range). Nothing here removes
 * them; they are simply not offered. That is also why the reset in a split app
 * keeps every OTHER section's settings (`settingsStore.resetToDefaults(variant)`):
 * the currency label is how the hidden amounts are printed when a backup carries
 * them to the Expenses app, and a reset pressed in the Workout app to fix a rest
 * timer has no business changing it.
 *
 * Every decision takes the variant, so the tests walk all three apps. The
 * strings returned are `t()` keys, in English; the screen translates them.
 */

import { hasSection, variantSection, type AppVariant } from './appVariant';
import { csvKinds, type CsvKind } from './csv';

/** The spreadsheet exports a log can offer (`lib/csv.ts`). */
export type { CsvKind };

/**
 * The CSV exports this app offers. A spreadsheet is a way to READ a log; the
 * Workout app's hidden amounts are not its log, and the Tasks app has no CSV at
 * all (there never was a task export), so its Settings shows no row for one.
 */
export function csvExports(variant: AppVariant): readonly CsvKind[] {
  // One decision, kept with the export it governs (`csv.csvKinds`).
  return csvKinds(variant);
}

/**
 * Whether `Let the app tick what it knows` is offered. The tick comes from
 * ANOTHER log — a finished workout, a recorded amount — so it means something
 * only in an app that has the Tasks section and one of those. Since the split
 * none does: in the Tasks app nothing is ever finished or recorded that could
 * tick a row, and a switch that changes nothing is a question with no answer.
 */
export function autoTickOffered(variant: AppVariant): boolean {
  return (
    hasSection(variant, 'Tasks') &&
    (hasSection(variant, 'Workout') || hasSection(variant, 'Expenses'))
  );
}

/** The kicker over the section row, and the row's second line — the section's own words. */
export function sectionRowCopy(variant: AppVariant): { kicker: string; hint: string } {
  switch (variantSection(variant)) {
    case 'Workout':
      return { kicker: 'Workout', hint: 'Rest, plates, weekly targets' };
    case 'Tasks':
      return {
        kicker: 'Tasks',
        hint: autoTickOffered(variant) ? 'The automatic tick' : 'Vacation pause, history range',
      };
    case 'Expenses':
      return { kicker: 'Finance', hint: 'What amounts are counted in' };
  }
}

/**
 * What a backup holds, said under the backup rows. The Workout app's backup
 * still carries the 2.x tasks and money (`lib/appVariant.ts`), and says so,
 * because "where did my tasks go" is answered by that sentence.
 */
export function backupHoldsNote(variant: AppVariant): string {
  switch (variantSection(variant)) {
    case 'Workout':
      return 'A backup is plain JSON, so you can read it, keep it anywhere, and move it to another phone. It holds your training and every setting, and still carries the daily tasks and finance this app kept before they became apps of their own — so the Tasks and Expenses apps can be filled from it.';
    case 'Tasks':
      return 'A backup is plain JSON, so you can read it, keep it anywhere, and move it to another phone. It holds your daily tasks and every setting.';
    case 'Expenses':
      return 'A backup is plain JSON, so you can read it, keep it anywhere, and move it to another phone. It holds your finance and every setting.';
  }
}

/** The sentence after `Replace everything`. */
export function replaceNote(variant: AppVariant): string {
  return variant === 'workout'
    ? 'makes this phone look like the file, so export first if there is anything here you would miss. A backup written by an older version carries no tasks and no amounts, and restoring one leaves both of those exactly where they are rather than emptying them. A workout in progress is not part of a backup: it carries a running clock.'
    : 'makes this app look like the file, so export first if there is anything here you would miss. A backup from the Workout app or from Momentum 2.x carries every section; this app reads its own part of it.';
}

/** The sentence after `Reset every setting`, under the backup rows. */
export function resetNote(variant: AppVariant): string {
  switch (variantSection(variant)) {
    case 'Workout':
      return 'puts this app’s settings back to their defaults at once. It does not touch a single thing you have logged — not an exercise, not a routine, not a workout.';
    case 'Tasks':
      return 'puts this app’s settings back to their defaults at once. It does not touch a single thing you have logged — not a task, not an answered day.';
    case 'Expenses':
      return 'puts this app’s settings back to their defaults at once. It does not touch a single thing you have logged — not an account, not an amount.';
  }
}

/**
 * The reset's confirmation. It used to promise the bodyweight was cleared; the
 * store has always kept it (`settingsStore.resetToDefaults`), so the sentence
 * now says what happens.
 */
export function resetConfirmBody(variant: AppVariant): string {
  switch (variantSection(variant)) {
    case 'Workout':
      return 'Every duration, switch, target and default in this app goes back to how it shipped. Your exercises, routines, history, gyms and bodyweight are untouched.';
    case 'Tasks':
      return 'Every switch and default in this app goes back to how it shipped. Your tasks and every answered day are untouched.';
    case 'Expenses':
      return 'Every default in this app goes back to how it shipped, the currency label included. Your accounts and amounts are untouched.';
  }
}

/**
 * The app's name on the first-launch language screen — the only screen that
 * names the app, and one that cannot go through `t()` (it is asked before the
 * language is known). The launcher label `app.config.js` gives the APK, so the
 * word is the one under the icon that was just tapped.
 */
export function launchName(variant: AppVariant): string {
  switch (variantSection(variant)) {
    case 'Workout':
      return 'Workout';
    case 'Tasks':
      return 'Tasks';
    case 'Expenses':
      return 'Expenses';
  }
}

/**
 * The every-string test hook: each sentence this module can hand a screen, so
 * the catalogue test can check every one of them has its Russian.
 */
export function settingsScopeKeys(variant: AppVariant): string[] {
  const row = sectionRowCopy(variant);
  return [
    row.kicker,
    row.hint,
    backupHoldsNote(variant),
    replaceNote(variant),
    resetNote(variant),
    resetConfirmBody(variant),
  ];
}
