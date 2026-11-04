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
 * ── ONE WAY OUT AND ONE WAY IN ─────────────────────────────────────────────
 *
 * An export carries the settings, the tasks and the chats. `applyBackup`
 * REPLACES all three with what the file says — that is what a restore is, and it
 * is the only one there is. A Momentum file carries more (the training, the
 * money); `parseBackup` has already cut it down to what this app reads, and
 * nothing else in it is looked at.
 *
 * There used to be more: a merge that added only what this phone did not have,
 * CSV readers, a per-section export and import. Rows of export and import are
 * worse than two, because the one that matters (the whole phone, out to a file
 * you can read) stops being obvious among them. One file holds everything;
 * putting it back puts everything back.
 */

import { countPayload, serializeBackup, type BackupCounts, type BackupPayload } from '../lib/backup';
import { t } from '../lib/i18n';
import { chatsForBackup, useAi } from './aiStore';
import { sanitizeSettings, useSettings } from './settingsStore';
import { sanitizeTasks, useTasks } from './tasksStore';

/** What this app's backup carries, straight out of the stores. */
export function currentSnapshot(): BackupPayload {
  return {
    // Sanitized rather than spread: the live stores carry their action functions
    // alongside their values, and a JSON file with `addTask: null` in it is a
    // file that says something untrue about the format.
    settings: sanitizeSettings(useSettings.getState()),
    tasks: sanitizeTasks(useTasks.getState()),
    aiChats: chatsForBackup(useAi.getState()),
  };
}

/** What a restore would replace, counted the way a file is — "this phone has…". */
export function restorableCounts(): BackupCounts {
  return countPayload(currentSnapshot());
}

/** The file's text, ready to write or share. */
export function exportBackupText(now?: Date): string {
  return serializeBackup(currentSnapshot(), now);
}

/** What a restore actually put on the phone — validated rows, not claimed ones. */
export interface AppliedCounts extends BackupCounts {
  settingsApplied: boolean;
}

/**
 * Write a parsed backup into the stores, replacing the settings, the tasks and —
 * when the file carries them — the chats.
 *
 * Throws, applying nothing, when the file carries no tasks — `parseBackup`
 * refuses such a file first, so this is the guard for a caller that skipped it,
 * and it runs before the settings so a file's settings cannot arrive alone.
 *
 * Returns what survived each store's own validation. The counts a file states in its
 * envelope are what the exporting phone had; these are what this phone now has, and
 * when the two differ the screen reports THESE — a restore that quietly drops
 * malformed rows and says "9 restored" is how a user learns not to trust the
 * feature.
 */
export function applyBackup(payload: BackupPayload): AppliedCounts {
  if (payload.tasks == null) {
    throw new Error(t('That file has no tasks in it.', useSettings.getState().language));
  }

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
     * permission for, and every auto-backup after the restore failed), and the
     * day's file and last-backup time describe this phone's own files.
     */
    const here = useSettings.getState();
    const local = {
      autoBackupEnabled: here.autoBackupEnabled,
      autoBackupFolderUri: here.autoBackupFolderUri,
      autoBackupFile: here.autoBackupFile,
      lastBackupAt: here.lastBackupAt,
    };
    useSettings.getState().importSettings({ ...fromFile, ...local });
  }

  const applied: AppliedCounts = { settingsApplied };

  useTasks.getState().importTasks(payload.tasks);
  applied.tasks = useTasks.getState().tasks.length;

  // ABSENT IS NOT EMPTY: a file without chats leaves this phone's alone.
  if (payload.aiChats != null) applied.chats = useAi.getState().importChats(payload.aiChats);

  return applied;
}
