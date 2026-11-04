/**
 * The two directions a backup moves, and the only place every store is read and
 * written together.
 *
 *   stores ──currentSnapshot──► payload ──serializeBackup──► the file
 *   the file ──parseBackup──► envelope ──applyBackup──► stores
 *
 * It lives in `state/` rather than in `lib/` because it touches every store, and
 * outside React on purpose: an export is triggered by a button and a restore
 * replaces the state the buttons are rendered from, so neither belongs to a
 * component's lifecycle. `lib/backup.ts` stays pure and knows nothing about zustand.
 *
 * WHAT IS NOT IN A BACKUP: the workout in progress. It is persisted (that is what
 * makes a mid-set crash cost nothing), but it is a live thing with a running clock
 * and a rest deadline in epoch milliseconds — restoring one onto another phone,
 * hours later, would drop the user into a session with a two-hour rest timer and a
 * plank that "ended" while the file was on an SD card. Finish the workout, then back
 * up; the screen says so.
 *
 * ORDER MATTERS ON THE WAY IN. Settings first (they are what every duration is read
 * from), then the library, then the log — so that if anything throws, what is left
 * on the phone is a prefix of a valid restore rather than a log referring to
 * exercises that were never written.
 *
 * ── ONE WAY OUT AND ONE WAY IN, PER APP ────────────────────────────────────
 *
 * Since 3.0.0 this tree builds three apps (`lib/appVariant.ts`), and both
 * directions go through the variant's SLICES (`lib/backup.ts`): an export
 * carries what this app owns — plus, in Workout, the tasks and money its store
 * still holds from before the split — and `applyBackup` REPLACES this app's own
 * slice and the settings with what the file says, and touches nothing else. In
 * the Workout app that means a combined 2.x file restores the training and
 * leaves the hidden tasks and money exactly where they are: they are never
 * deleted, and a restore of the app you can see is not the place to swap out
 * data you cannot. That is what a restore is, and it is the only one there is.
 *
 * The variant is a parameter defaulting to `APP_VARIANT` so the tests can play
 * all three apps against the same stores.
 *
 * There used to be four more: a merge that added only the workouts this phone did
 * not have, a CSV reader for training that predated the app, and a per-section
 * export and import for each of the three logs. Eight rows, seven of which were
 * answering a question nobody was asking twice — and eight rows of export and
 * import are worse than two, because the one that matters (the whole phone, out
 * to a file you can read) stops being obvious among them. One file holds
 * everything; putting it back puts everything back.
 */

import { APP_VARIANT, type AppVariant } from '../lib/appVariant';
import {
  backupSlices,
  carriedSlices,
  countPayload,
  holdsLegacy,
  mergeAiChats,
  nothingForThisApp,
  ownSlice,
  serializeBackup,
  slicePayload,
  type BackupCounts,
  type BackupPayload,
  type LegacyHeld,
} from '../lib/backup';
import { amountsToCsv, workoutsToCsv, type CsvKind } from '../lib/csv';
import { logIsEmpty, moneyScale } from '../lib/moneyUnits';
import { t } from '../lib/i18n';
import { chatsForBackup, useAi } from './aiStore';
import { useDebriefs } from './debriefStore';
import { useLibrary } from './libraryStore';
import { sanitizeMoney, seedAccounts, useMoney } from './moneyStore';
import { sanitizeSettings, useSettings } from './settingsStore';
import { sanitizeTasks, seedTasks, useTasks } from './tasksStore';
import { useWorkoutHistory } from './workoutHistoryStore';

/** Every store a backup can carry, straight out of the stores, before slicing. */
function wholeSnapshot(): BackupPayload {
  const library = useLibrary.getState();
  return {
    // Sanitized rather than spread: the live store carries its action functions
    // alongside its values, and a JSON file with `setNumber: undefined` in it is a
    // file that says something untrue about the format.
    settings: sanitizeSettings(useSettings.getState()),
    exercises: library.exercises,
    routines: library.routines,
    sequence: library.sequence,
    workouts: useWorkoutHistory.getState().workouts,
    numbering: useWorkoutHistory.getState().numbering,
    // Sanitized for the same reason `settings` is: the live stores carry their
    // action functions beside their values, and a backup with `addTask: null` in
    // it says something untrue about the format.
    tasks: sanitizeTasks(useTasks.getState()),
    money: sanitizeMoney(useMoney.getState()),
    debriefs: useDebriefs.getState().debriefs,
    aiChats: chatsForBackup(useAi.getState()),
  };
}

/**
 * Does this phone still hold tasks or money beyond the seed? Only ever true in
 * practice in the Workout app — the old install — and what keeps those logs in
 * its backups until they have been moved (`backupSlices`).
 */
export function legacyHeld(snapshot: BackupPayload = wholeSnapshot()): LegacyHeld {
  return holdsLegacy(snapshot, {
    taskIds: seedTasks().map((task) => task.id),
    accountIds: seedAccounts.map((account) => account.id),
  });
}

/** What this app's backup carries, straight out of the stores. */
export function currentSnapshot(variant: AppVariant = APP_VARIANT): BackupPayload {
  const whole = wholeSnapshot();
  return slicePayload(whole, backupSlices(variant, legacyHeld(whole)));
}

/**
 * What a restore in this app would replace, counted the way a file is: this
 * app's own slice and nothing else. The confirmation sheet's "this phone has…"
 * — in the Workout app that is the training, not the hidden tasks and money a
 * restore leaves alone.
 */
export function restorableCounts(variant: AppVariant = APP_VARIANT): BackupCounts {
  return countPayload(slicePayload(wholeSnapshot(), [ownSlice(variant)]));
}

/* ------------------------------------------------------------------ */
/* One section at a time                                               */
/* ------------------------------------------------------------------ */

/**
 * Thrown by `exportBackupText` rather than writing a backup that is missing the
 * log. Carried as a class so the screen can tell it from a file-system error and
 * say something true about it.
 */
export class UnreadableLogError extends Error {
  constructor() {
    /*
     * Reaches the user verbatim through `describeError`, so it is written as the
     * sentence they need: what happened, that nothing is lost, and the one thing
     * that fixes it.
     */
    super(
      t(
        'The log could not be read, so a backup would be missing it. Nothing is lost — close the app and open it again.',
        useSettings.getState().language,
      ),
    );
    this.name = 'UnreadableLogError';
  }
}

/**
 * The file's text, ready to write or share.
 *
 * ── IT REFUSES TO WRITE A BACKUP WITH THE LOG MISSING ──────────────────────
 *
 * `currentSnapshot` reads the stores, and the history store's array is empty in two
 * very different situations: nothing has been logged, and the log could not be READ
 * (see `workoutHistoryStore.loadFailed`). Exporting is what a careful person does
 * FIRST when the app looks wrong, and in the second case that would hand them a
 * file with `"workouts": []` in it — which `Replace everything from a file` will
 * then faithfully restore over a database that was fine.
 *
 * That is the one path in this app that can turn a failed read into permanent loss,
 * so it is closed here rather than warned about: a backup nobody can trust is worse
 * than no backup, because the whole point of one is being trusted later.
 */
export function exportBackupText(now?: Date, variant: AppVariant = APP_VARIANT): string {
  // Only where the training is IN the file: a Tasks backup is not missing a log
  // it never carried, and refusing it would leave the tasks unprotected.
  const carriesTraining = backupSlices(variant).includes('workout');
  if (carriesTraining && useWorkoutHistory.getState().loadFailed) throw new UnreadableLogError();
  return serializeBackup(currentSnapshot(variant), now);
}

/**
 * One log as a spreadsheet (`lib/csv.ts`), straight out of the stores.
 *
 * The workouts refuse on an unreadable log for the reason the backup does: an
 * export taken while the app looks wrong would be a header and nothing else, and
 * "I exported it, it was empty" is a belief worth not creating. The money scale is
 * the same rule `useMoneyScale` applies, read once rather than subscribed to.
 */
export function exportCsvText(kind: CsvKind): string {
  const settings = useSettings.getState();
  if (kind === 'workouts') {
    const history = useWorkoutHistory.getState();
    if (history.loadFailed) throw new UnreadableLogError();
    return workoutsToCsv(history.workouts, {
      numbering: history.numbering,
      unitSystem: settings.unitSystem,
    });
  }
  const money = useMoney.getState();
  return amountsToCsv({
    amounts: money.amounts,
    accounts: money.accounts,
    categories: money.categories,
    scale: moneyScale({
      pinned: money.scale,
      empty: logIsEmpty(money.amounts, money.accounts),
      currency: settings.currencyCode,
    }),
    currency: settings.currencyCode,
  });
}

/** What a restore actually put on the phone — validated rows, not claimed ones. */
export interface AppliedCounts extends BackupCounts {
  settingsApplied: boolean;
}

/**
 * Write a parsed backup into the stores, replacing THIS APP'S SLICE and the
 * settings, and nothing else.
 *
 * Throws, applying nothing, when the file carries nothing for this app —
 * `parseBackup` refuses such a file first, so this is the guard for a caller that
 * skipped it, and it runs before the settings so another app's settings cannot
 * arrive alone.
 *
 * Returns what survived each store's own validation. The counts a file states in its
 * envelope are what the exporting phone had; these are what this phone now has, and
 * when the two differ the screen reports THESE — a restore that quietly drops eleven
 * malformed workouts and says "42 restored" is how a user learns not to trust the
 * feature.
 */
export function applyBackup(
  payload: BackupPayload,
  variant: AppVariant = APP_VARIANT,
): AppliedCounts {
  const own = ownSlice(variant);
  if (!carriedSlices(payload).includes(own)) {
    throw new Error(nothingForThisApp(variant, useSettings.getState().language));
  }
  const slices = [own];
  const training = own === 'workout';

  /*
   * THE LOG FIRST. It is the one step that can realistically throw (a SQLite
   * write), and it is transactional — so a failure here leaves the phone exactly
   * as it was. Last, it used to throw after the file's settings and library had
   * already replaced this phone's, leaving a mix of the two.
   */
  const workouts = training
    ? useWorkoutHistory.getState().importWorkouts(payload.workouts ?? [], payload.numbering)
    : undefined;

  /*
   * Only a settings object WITH something in it counts: `importSettings({})` is a
   * reset to defaults, and a file that says nothing about the settings — no
   * block, an empty one, or something that is not an object at all — must not
   * clobber them with nothing.
   */
  const fromFile =
    typeof payload.settings === 'object' &&
    payload.settings !== null &&
    !Array.isArray(payload.settings)
      ? (payload.settings as Record<string, unknown>)
      : {};
  const settingsApplied = Object.keys(fromFile).length > 0;
  if (settingsApplied) {
    /*
     * The file's settings, except what belongs to THIS PHONE: the backup folder
     * is a grant this phone holds (another phone's URI is a folder it has no
     * permission for, and every auto-backup after the restore failed), the
     * day's file and last-backup time describe this phone's own files, and
     * Health Connect is a permission granted here or not at all.
     */
    const here = useSettings.getState();
    const local = {
      autoBackupEnabled: here.autoBackupEnabled,
      autoBackupFolderUri: here.autoBackupFolderUri,
      autoBackupFile: here.autoBackupFile,
      lastBackupAt: here.lastBackupAt,
      shareToHealthConnect: here.shareToHealthConnect,
    };
    useSettings.getState().importSettings({ ...fromFile, ...local });
  }

  const applied: AppliedCounts = { settingsApplied };

  if (training) {
    const library = useLibrary.getState().importLibrary({
      exercises: payload.exercises ?? [],
      routines: payload.routines ?? [],
      sequence: payload.sequence,
    });
    if (payload.debriefs != null) useDebriefs.getState().importDebriefs(payload.debriefs);
    let sets = 0;
    for (const workout of useWorkoutHistory.getState().workouts) sets += workout.sets.length;
    applied.exercises = library.exercises;
    applied.routines = library.routines;
    applied.workouts = workouts;
    applied.sets = sets;
  }

  /*
   * ABSENT IS NOT EMPTY, and NOT MINE IS NOT MINE. Only this app's own log is
   * replaced: a Workout restore of a combined file leaves the tasks and the
   * amounts exactly where they are, as a version-1 file always did — replacing
   * them would turn "restore my training" into swapping out a log the user cannot
   * even see from here, silently, in the same tap.
   */
  if (own === 'tasks') {
    useTasks.getState().importTasks(payload.tasks);
    applied.tasks = useTasks.getState().tasks.length;
  }
  if (own === 'money') {
    useMoney.getState().importMoney(payload.money);
    applied.amounts = useMoney.getState().amounts.length;
  }

  // This app's conversations from the file; every other section's stay put.
  const chats = mergeAiChats(chatsForBackup(useAi.getState()), payload.aiChats, slices);
  if (chats !== undefined) {
    useAi.getState().importChats(chats);
    applied.chats = countPayload(
      slicePayload({ settings: null, aiChats: chatsForBackup(useAi.getState()) }, slices),
    ).chats;
  }

  return applied;
}
