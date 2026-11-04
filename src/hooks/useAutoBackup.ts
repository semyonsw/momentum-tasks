/**
 * The unattended backup: the one side effect behind `lib/autoBackup.ts`.
 *
 *   a backed-up store changes ──► 2 s quiet ──► write the day's file ──► stamp
 *   the app leaves the screen  ──► write now, if a write was waiting
 *
 * ── WHY AFTER EVERY CHANGE ─────────────────────────────────────────────────
 *
 * It used to run once, on launch, if the last copy was a week old — so the copy
 * was by design up to a week behind the phone. The folder is granted once and
 * writing the file is cheap, so now every PERSISTED change rewrites it:
 * `state/backupWatch.ts` watches the stores this app's backup carries and
 * reports a change only when a field the file holds moved (`lib/backupWatch.ts`), and
 * `lib/backupScheduler.ts` turns a burst into one write and never runs two at
 * once. When the app goes to the background a waiting write is flushed straight
 * away, because Android may kill a background process at any moment and the
 * change the user just made is the one they would miss.
 *
 * ── AND WHY IT NEVER BLOCKS AND NEVER SPEAKS ──────────────────────────────
 *
 * Every failure of an AUTOMATIC write is swallowed: a revoked folder permission,
 * a full disk, a provider that has gone away. A backup that cannot write must not
 * become a modal in front of a user who came here to train, and the visible
 * consequence is already correct without any error handling at all:
 * `lastBackupAt` does not move, and the Settings hero keeps saying how old the
 * last copy is. The next change tries again. `Back up now` and `Export
 * everything` run the same path and DO report — with the reason kept apart, so
 * only a genuinely lost folder asks for the folder again.
 */

import { useEffect } from 'react';
import { AppState } from 'react-native';

import { classifyBackupError, type BackupFailure } from '../lib/autoBackup';
import { writeDailyBackup } from '../lib/backupFile';
import { BackupScheduler, serialized } from '../lib/backupScheduler';
import { storesHydrated, watchBackedUpStores } from '../state/backupWatch';
import { exportBackupText } from '../state/dataTransfer';
import { useSettings } from '../state/settingsStore';

export type BackupRun =
  | { ok: true; name: string; folderUri: string }
  | { ok: false; reason: BackupFailure; error?: unknown };

/**
 * Write the day's backup file now. Returns what happened; never throws.
 *
 * `manual` is a tap (`Back up now`, `Export everything`): it writes even with the
 * automatic switch off. Exported so the Settings screen runs the SAME path — a
 * second implementation of "overwrite or create, retire, stamp" is a second thing
 * that can be wrong about which file to delete.
 *
 * Serialized: an automatic write and a tap can never be writing the same file at
 * once.
 */
export const runBackupNow = serialized(async (manual = false): Promise<BackupRun> => {
  const settings = useSettings.getState();
  const folderUri = settings.autoBackupFolderUri;
  if (!folderUri) return { ok: false, reason: 'no-folder' };
  if (!manual && !settings.autoBackupEnabled) return { ok: false, reason: 'off' };
  if (!storesHydrated()) return { ok: false, reason: 'not-ready' };

  try {
    const now = new Date();
    const text = exportBackupText(now);
    const { name, file } = await writeDailyBackup(folderUri, settings.autoBackupFile, text, now);
    /*
     * Stamped only after the write resolved. And only if the folder is still the
     * one written into: a re-pick while this write was in flight makes `file` a
     * URI in the OLD folder, which the next write must not try to overwrite.
     */
    if (useSettings.getState().autoBackupFolderUri === folderUri) {
      useSettings.getState().recordBackup(now.toISOString(), file);
    }
    return { ok: true, name, folderUri };
  } catch (error) {
    return { ok: false, reason: classifyBackupError(error), error };
  }
});

/** One per JS process: a remount must not double the subscriptions. */
const scheduler = new BackupScheduler(() => runBackupNow());

/**
 * Ask for an automatic write soon — the toggle being switched on uses this, so the
 * file exists from that moment rather than from the next change.
 */
export function requestBackup(): void {
  scheduler.request();
}

/**
 * Mount once, high in the tree.
 */
export function useAutoBackup(): void {
  useEffect(() => {
    const stopWatching = watchBackedUpStores(() => {
      // Cheap gate: with nowhere to write, or switched off, a change asks nothing.
      const { autoBackupEnabled, autoBackupFolderUri } = useSettings.getState();
      if (autoBackupEnabled && autoBackupFolderUri) scheduler.request();
    });
    const sub = AppState.addEventListener('change', (next) => {
      if ((next === 'background' || next === 'inactive') && scheduler.pending) {
        void scheduler.flush();
      }
    });
    return () => {
      stopWatching();
      sub.remove();
      // Unmounting is not the user leaving: whatever was waiting goes now.
      void scheduler.flush();
    };
  }, []);
}
