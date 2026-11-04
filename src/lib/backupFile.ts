/**
 * Getting a backup off the phone, and back on again.
 *
 *   EXPORT  → the system folder picker, ONCE → the folder is remembered, and the
 *             day's backup file is written (and rewritten) there, where a file
 *             manager can see it and a cable or an upload can move it. The
 *             picker comes back only if Android says the access is gone.
 *   IMPORT  → the system FILE browser → the user finds that JSON and picks it.
 *
 * Two different Android pickers, because they are two different intents:
 * `expo-file-system`'s Storage Access Framework grants write access to a FOLDER
 * (there is no "save as" dialog in it), and `expo-document-picker` opens the
 * browse-and-select UI for reading ONE file. Anything less than the second one is
 * not what "find the file I exported" means: a list the app assembles itself can
 * only show the folders the app has already been granted, which is exactly the
 * folder the user is trying to remember.
 *
 * A file written to the app's own documents directory would survive an app update
 * and die with an uninstall — i.e. exactly the case a backup exists for — so that
 * path is only the fallback for a platform with no folder picker.
 *
 * Everything here reports failure as a value where failure is ORDINARY: a cancelled
 * picker is "nothing happened", not an error. Real errors (an unreadable file, a
 * revoked permission) throw, and the caller turns them into one sentence with
 * `describeError`.
 */

import { Platform } from 'react-native';
/*
 * The legacy entry point on purpose: the modern `File`/`Directory` API has no SAF
 * equivalent, and SAF is the only way to reach a folder the user can find again.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import {
  backupFileBaseName,
  backupFilesToRetire,
  padToCover,
  planBackupWrite,
  utf8ByteLength,
  uriFileName,
  type BackupFileRecord,
} from './autoBackup';
import { APP_VARIANT, type AppVariant } from './appVariant';
import { dayKey } from './days';
import { t, type Language } from './i18n';

/**
 * The backup's type.
 *
 * `saveTextFile` takes the type as a parameter rather than closing over it, because
 * the MIME type is what SAF derives the EXTENSION from — a file written under the
 * wrong one arrives with the wrong suffix holding the right bytes, and every tool
 * that opens it is then wrong about what it is. The CSV exports are the second
 * caller.
 */
const JSON_MIME = 'application/json';

/** The spreadsheet exports (`lib/csv.ts`). SAF appends `.csv` from this. */
const CSV_MIME = 'text/csv';

/** Can this platform show a folder picker at all? SAF is Android-only. */
function canPickFolder(): boolean {
  return Platform.OS === 'android' && FileSystem.StorageAccessFramework != null;
}

/**
 * The app's own documents directory, as a fallback destination.
 *
 * Reachable by the app and nobody else, which makes it a weak backup — it dies with
 * an uninstall. It exists so that "export" still produces a file on a platform with
 * no picker, and so the path can be shown to a user who wants to pull it off with
 * `adb` or a desktop file browser.
 */
function appFolderUri(): string | null {
  return FileSystem.documentDirectory ?? null;
}

/** The name a SAF URI ends in, decoded: `...%2FDownload%2Fbackup.json` → `backup.json`. */
function displayName(uri: string): string {
  return uriFileName(uri);
}

/** The folder a SAF tree URI points at, in words: "Download", "SD card / backups". */
export function folderLabel(folderUri: string, lang: Language = 'en'): string {
  const decoded = safeDecode(folderUri);
  const afterTree = decoded.split('tree/').pop() ?? decoded;
  // `primary:Download` — the volume prefix is noise to everyone but Android.
  const withoutVolume = afterTree.includes(':')
    ? afterTree.split(':').slice(1).join(':')
    : afterTree;
  const cleaned = withoutVolume.replace(/^\/+|\/+$/g, '').replace(/\//g, ' / ');
  return cleaned === '' ? t('the folder you picked', lang) : cleaned;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // A URI that isn't valid percent-encoding is still a string worth showing.
    return value;
  }
}

/**
 * Ask for a folder. `null` means the user backed out, or the platform has no picker
 * — both of which are "nothing happened", not an error to report.
 */
export async function pickFolder(): Promise<string | null> {
  if (!canPickFolder()) return null;
  try {
    const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    return result.granted ? result.directoryUri : null;
  } catch {
    return null;
  }
}

/**
 * The folder could not be reached: the grant is gone, or the folder is.
 *
 * Its own class because it is the ONE failure the user can fix, and only by
 * picking the folder again — so it is the only failure that may open the picker.
 * Everything else (a full disk, a provider hiccup) would come back the same after
 * a re-pick, and asking for a folder the app already has is the app not paying
 * attention. Raised where the FOLDER is touched (creating a file in it); a single
 * file that has gone missing is not this — it is recreated.
 */
export class FolderAccessError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'FolderAccessError';
  }
}

/**
 * Write a new file into a folder the user picked. Returns its name and URI.
 *
 * SAF creates the file from a base name and a MIME type — it appends the extension
 * itself, and it never overwrites: a second file with the same name becomes
 * `name (1).json`. Overwriting is `overwriteFile`, by URI.
 */
export async function writeToFolder(
  folderUri: string,
  baseName: string,
  contents: string,
  mimeType: string = JSON_MIME,
): Promise<{ name: string; uri: string }> {
  let fileUri: string;
  try {
    fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
      folderUri,
      baseName,
      mimeType,
    );
  } catch (error) {
    // The folder refused a new file: the grant was revoked or the folder is gone.
    throw new FolderAccessError(error);
  }
  try {
    await FileSystem.writeAsStringAsync(fileUri, contents);
  } catch (error) {
    // The file exists by now and is empty. Left behind, it sorts as the newest
    // backup — the one somebody in trouble reaches for.
    await deleteFile(fileUri);
    throw error;
  }
  return { name: displayName(fileUri), uri: fileUri };
}

/**
 * Rewrite an existing SAF file in place, and prove it took.
 *
 * Throws when the file cannot be read (deleted by the user, access gone) or when
 * what is on disk afterwards is not exactly what was written — the caller then
 * creates a fresh file instead, so a write that went wrong is never left as the
 * backup.
 *
 * The padding is the reason this is safe at all: the legacy module opens SAF
 * files in mode `"w"`, which Android's external-storage provider does not
 * reliably truncate, so a shorter backup over a longer one would leave the old
 * tail behind. `padToCover` (in `lib/autoBackup.ts`, with the full argument) makes
 * the new text at least as long as the old in bytes, with trailing spaces, which
 * JSON ignores. The read-back then checks byte-for-byte that nothing survived.
 */
export async function overwriteFile(uri: string, contents: string): Promise<void> {
  const before = await FileSystem.readAsStringAsync(uri);
  const text = padToCover(contents, utf8ByteLength(before));
  await FileSystem.writeAsStringAsync(uri, text);
  const after = await FileSystem.readAsStringAsync(uri);
  if (after !== text) throw new Error('The backup file did not read back as written.');
}

/**
 * Write the day's backup into the granted folder: overwrite today's file, or
 * create today's and retire the old one. Decisions in `lib/autoBackup.ts`, made
 * for `variant` — this app's name, and only this app's files retired, because
 * the other two apps are usually writing into the same folder.
 *
 *   overwrite ok                 → done, same URI
 *   overwrite fails (file gone,  → create a new file, then delete the old URI
 *     or it did not verify)
 *   create fails                 → FolderAccessError: the folder itself is gone
 *
 * Deleting is best-effort and AFTER the new file exists, so a failure anywhere
 * leaves two files, never zero.
 */
export async function writeDailyBackup(
  folderUri: string,
  current: BackupFileRecord | undefined,
  contents: string,
  now: Date = new Date(),
  variant: AppVariant = APP_VARIANT,
): Promise<{ name: string; file: BackupFileRecord }> {
  const today = dayKey(now);
  const plan = planBackupWrite(current, today, variant);
  if (plan.kind === 'overwrite') {
    try {
      await overwriteFile(plan.uri, contents);
      return { name: displayName(plan.uri), file: { uri: plan.uri, day: today } };
    } catch {
      // Fall through: a new file, and the one that failed is retired below.
    }
  }
  const replaces = plan.kind === 'overwrite' ? plan.uri : plan.replaces;
  const { name, uri } = await writeToFolder(folderUri, backupFileBaseName(now, variant), contents);
  for (const old of backupFilesToRetire(await listFolder(folderUri), uri, replaces, variant)) {
    await deleteFile(old);
  }
  return { name, file: { uri, day: today } };
}

/**
 * Delete one file by URI. Best-effort: a `false` is not worth reporting.
 *
 * Used only by the backup's daily replacement, and only on files with this
 * app's own backup name (`momentum-<app>-backup-*`), which it wrote itself. A delete that fails leaves one extra copy in a
 * folder, which is the mildest possible failure — so it is swallowed rather than
 * surfaced, and the next day's sweep will try the same file again.
 */
export async function deleteFile(uri: string): Promise<boolean> {
  try {
    if (canPickFolder()) {
      await FileSystem.StorageAccessFramework.deleteAsync(uri);
      return true;
    }
    await FileSystem.deleteAsync(uri, { idempotent: true });
    return true;
  } catch {
    return false;
  }
}

/** Write into the app's own documents directory. Returns the full path. */
async function writeToAppFolder(
  baseName: string,
  contents: string,
  extension = 'json',
  lang: Language = 'en',
): Promise<string> {
  const folder = appFolderUri();
  // In the caller's language: this message reaches the screen via `describeError`.
  if (!folder) throw new Error(t('This device has no writable app folder.', lang));
  const fileUri = `${folder}${baseName}.${extension}`;
  await FileSystem.writeAsStringAsync(fileUri, contents);
  return fileUri.replace('file://', '');
}

/**
 * What `saveCsvFile` did. `cancelled` is a user decision, not a failure.
 *
 * `folderUri` is present only when the file went into a folder the user granted —
 * i.e. not on the sandbox fallback.
 */
export type SaveOutcome =
  | { saved: true; name: string; where: string; folderUri?: string; uri?: string }
  | { saved: false; cancelled: true };

/**
 * A spreadsheet, somewhere the user picked and can find again: the folder picker,
 * else (no picker on this platform) the app's own documents directory, stated as
 * a path so it is at least reachable over a cable.
 *
 * Always the picker, unlike the backup: a CSV is a snapshot somebody takes to a
 * spreadsheet, not the phone's one restorable copy, so where it goes is asked
 * each time and nothing is rotated — two of them in a folder is two files the
 * user asked for.
 */
export async function saveCsvFile(
  baseName: string,
  contents: string,
  lang: Language = 'en',
): Promise<SaveOutcome> {
  return saveTextFile(baseName, contents, CSV_MIME, 'csv', lang);
}

async function saveTextFile(
  baseName: string,
  contents: string,
  mimeType: string,
  extension: string,
  lang: Language,
): Promise<SaveOutcome> {
  if (!canPickFolder()) {
    const path = await writeToAppFolder(baseName, contents, extension, lang);
    return { saved: true, name: `${baseName}.${extension}`, where: path };
  }

  const folder = await pickFolder();
  if (!folder) return { saved: false, cancelled: true };

  const { name, uri } = await writeToFolder(folder, baseName, contents, mimeType);
  return { saved: true, name, where: folderLabel(folder, lang), folderUri: folder, uri };
}

/**
 * The files in a granted folder, by URI and name. Empty on any failure.
 *
 * Exists so a new day's backup can retire the old ones by name
 * (`backupFilesToRetire` in `lib/autoBackup.ts`). Failing quietly is right here —
 * a listing that cannot be read just means the old copy stays a day longer.
 */
export async function listFolder(folderUri: string): Promise<{ uri: string; name: string }[]> {
  if (!canPickFolder()) return [];
  try {
    const uris = await FileSystem.StorageAccessFramework.readDirectoryAsync(folderUri);
    return uris.map((uri) => ({ uri, name: displayName(uri) }));
  } catch {
    return [];
  }
}

export interface PickedFile {
  uri: string;
  name: string;
}

/**
 * Open the phone's file browser and hand back the file the user picked.
 * `null` means they backed out.
 *
 * `type: '*&#47;*'` deliberately: filtering to `application/json` hides the very file
 * this is for whenever the provider reports it as `octet-stream` or as nothing at
 * all, which is common for a file that arrived over a cable or a chat. A wrong pick
 * is caught a moment later by `parseBackup`, which says what was wrong with it —
 * that is a better failure than a picker that shows an empty folder.
 *
 * `copyToCacheDirectory` so the returned URI is one the file system can read: a raw
 * `content://` URI from another app's provider is not.
 */
export async function pickJsonFile(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;

  const asset = result.assets?.[0];
  if (!asset) return null;
  return { uri: asset.uri, name: asset.name || displayName(asset.uri) };
}

export async function readTextFile(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri);
}

/** Every unreadable file, every denied permission, in one sentence for the screen. */
export function describeError(error: unknown, lang: Language = 'en'): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.trim() === ''
    ? t('Something went wrong reaching the file system.', lang)
    : message;
}
