/**
 * The unattended backup's decisions: which file, overwrite or create, what to
 * delete afterwards, and how old the last copy is.
 *
 *   a change lands ──► same day as the file?  ── yes ──► overwrite it in place
 *                                             └─ no ───► create today's file,
 *                                                        then delete yesterday's
 *
 * `lib/backup.ts` opens with the reason this exists: everything the user owns lives
 * on one phone, and "a backup is the only thing standing between a year of
 * training and a factory reset". It then made that backup a BUTTON — which means
 * the protection is only ever as good as the user's memory of a screen they have
 * no other reason to open. A log worth a year is not defended by a menu item.
 *
 * ── WHY AFTER EVERY CHANGE, AND NOT WEEKLY ON LAUNCH ──────────────────────
 *
 * It used to be "on launch, if the last copy is N days old". That meant the copy
 * was, by design, up to a week behind — a phone dropped on Sunday lost the week's
 * training, the expenses and every chat since Monday. The folder is granted once
 * and writing one JSON file costs milliseconds, so there is no reason for the copy
 * to be behind the phone at all: every persisted change rewrites it, debounced so
 * a burst is one write (`lib/backupScheduler.ts`), and `hooks/useAutoBackup.ts`
 * watches the stores (`lib/backupWatch.ts` says which changes count).
 *
 * Nothing here touches the file system, the store or the clock, which makes "which
 * file does this write go to" a testable question rather than a side effect.
 *
 * ── WHY IT IS A FOLDER THE USER PICKS, AND WHY THAT IS NOT OPTIONAL ────────
 *
 * Android gives an app two places to write: its own sandbox, and a folder the user
 * grants through the Storage Access Framework. The sandbox is useless for THIS job —
 * it is deleted with the app, which is one of the exact events a backup exists to
 * survive — so the only destination that means anything is the granted folder. That
 * grant is persistable, so it is asked for once and remembered
 * (`Settings.autoBackupFolderUri`), and asked for again only when Android says the
 * access is actually gone.
 *
 * ── ONE FILE PER APP, NAMED BY THE DAY ─────────────────────────────────────
 *
 * `momentum-workout-backup-2026-10-15.json` (and `momentum-tasks-backup-…`,
 * `momentum-expenses-backup-…` — `backupPrefix` in `lib/appVariant.ts`). ONE such
 * file per app in the folder: within a day it is overwritten in place (its URI is
 * remembered, because SAF finds files by URI, not by name), and the first write
 * of a new day creates the new day's file and then deletes the old one — create
 * first, so the folder never holds zero. The date in the name is what lets
 * somebody looking at the folder see, without opening anything, that the copy is
 * current.
 *
 * THE PREFIX IS PER APP because all three apps are usually granted the SAME
 * folder, and every sweep deletes by name: one shared prefix would have each app
 * deleting the other two's backups every morning. Each app matches only its own.
 *
 * The files earlier builds wrote — `workout-tracker-auto-…`, the manual
 * `workout-tracker-backup-…` exports, and 2.x's combined `momentum-backup-…` —
 * are left alone by all three. Those names belong to a mechanism that no longer
 * runs, and a cleanup that deletes a user's files on the strength of a naming
 * convention they may have been relying on is not one this app gets to make. The
 * combined one matters most: it is what Tasks and Expenses are filled from.
 */

import { APP_VARIANT, backupPrefix, type AppVariant } from './appVariant';
import { dayKey, daysBetween } from './days';
import { plural, t, type Language } from './i18n';

/** ISO-8601 instants, as everywhere else in the app. */
export type ISOInstant = string;

/** A finite, positive instant, or null. */
function instant(at: ISOInstant | null | undefined): number | null {
  if (typeof at !== 'string' || at.trim() === '') return null;
  const ms = Date.parse(at);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * CALENDAR days between two instants, on the phone's own clock. Negative clock
 * skew reads as 0.
 *
 * Calendar days rather than elapsed 24-hour periods: a backup from 23:00 should
 * read `Yesterday` at 08:00 the next morning, not `Today`.
 */
export function daysSince(
  at: ISOInstant | null | undefined,
  now: Date = new Date(),
): number | null {
  const then = instant(at);
  if (then == null) return null;
  return Math.max(0, daysBetween(dayKey(new Date(then)), dayKey(now)));
}

/**
 * "Today" / "8 days ago" / "Never" — the age of the last backup, for a settings row.
 *
 * Words rather than a date, because the only question this row answers is "is it
 * recent enough", and a reader has to do the arithmetic on a date to find out.
 */
export function describeBackupAge(
  at: ISOInstant | null | undefined,
  now: Date = new Date(),
  lang: Language = 'en',
): string {
  const days = daysSince(at, now);
  if (days == null) return t('Never', lang);
  if (days === 0) return t('Today', lang);
  if (days === 1) return t('Yesterday', lang);
  return t('{days} {daysWord} ago', lang, {
    days,
    daysWord: plural(days, lang, { one: t('day', lang), few: 'дня', many: t('days', lang) }),
  });
}

/* ------------------------------------------------------------------ */
/* The file                                                            */
/* ------------------------------------------------------------------ */

/**
 * The prefix 2.x wrote its combined backups under. Never written and never
 * deleted any more — see the header — but named, because it is the one old
 * name the user is told to import from.
 */
export const LEGACY_BACKUP_FILE_PREFIX = 'momentum-backup-';

/** `momentum-workout-backup-2026-10-15` — the LOCAL date, because that is the user's day. */
export function backupFileBaseName(
  now: Date = new Date(),
  variant: AppVariant = APP_VARIANT,
): string {
  return `${backupPrefix(variant)}${dayKey(now)}`;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A file name `backupFileBaseName` produced FOR THIS APP, as SAF wrote it:
 * `.json` appended, and ` (1)` when the create landed beside a same-named file
 * (the overwrite fallback below). Exact, because whatever matches is DELETED —
 * so another app's prefix, or 2.x's `momentum-backup-`, never matches.
 */
export function isBackupFileName(name: string, variant: AppVariant = APP_VARIANT): boolean {
  const pattern = new RegExp(
    `^${escapeRegExp(backupPrefix(variant))}\\d{4}-\\d{2}-\\d{2}( \\(\\d+\\))?\\.json$`,
  );
  return pattern.test(name.trim());
}

/**
 * The name a SAF URI ends in, decoded: `...%2FDownload%2Fbackup.json` →
 * `backup.json`. Here rather than in `lib/backupFile.ts` because `planBackupWrite`
 * needs it to tell this app's remembered file from one it must not touch.
 */
export function uriFileName(uri: string): string {
  let decoded = uri;
  try {
    decoded = decodeURIComponent(uri);
  } catch {
    // A URI that isn't valid percent-encoding is still a string worth reading.
  }
  return decoded.split('/').pop() ?? decoded;
}

/**
 * The file the backup currently lives in: its SAF URI, and the local day it
 * belongs to. Stored in settings (`Settings.autoBackupFile`) because SAF can only
 * reach a file by URI, so "overwrite today's file" needs the URI kept somewhere.
 */
export interface BackupFileRecord {
  uri: string;
  /** `YYYY-MM-DD`, local. */
  day: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A usable record, or undefined — from a persisted blob, so anything can arrive. */
export function usableBackupFile(value: unknown): BackupFileRecord | undefined {
  if (typeof value !== 'object' || value == null) return undefined;
  const { uri, day } = value as Record<string, unknown>;
  if (typeof uri !== 'string' || uri.trim() === '') return undefined;
  if (typeof day !== 'string' || !DAY.test(day)) return undefined;
  return { uri, day };
}

export type BackupWritePlan =
  /** Same day: rewrite the remembered file, keeping its name. */
  | { kind: 'overwrite'; uri: string }
  /** A new day, or no file yet: create one. `replaces` is deleted once it exists. */
  | { kind: 'create'; replaces?: string };

/**
 * Overwrite or create.
 *
 * Overwrite only when the remembered file is TODAY's — the name carries the date,
 * so rewriting yesterday's file with today's data would make the name lie. Any
 * other remembered file is the one this write replaces.
 *
 * A remembered file whose name is NOT this app's is neither overwritten nor
 * replaced: it is forgotten. That is the Workout app's first write after 3.0.0,
 * which updates the 2.x install in place and so inherits the record of 2.x's
 * combined `momentum-backup-<day>.json` — the file Tasks and Expenses import
 * from. Overwriting it would put a Workout-only backup under the combined name;
 * replacing it would delete it. A URI with no readable name (a provider that
 * does not end its URIs in the file name) is trusted as before, because the
 * record was written by this app and the alternative is a new file every write.
 */
export function planBackupWrite(
  current: BackupFileRecord | undefined,
  today: string,
  variant: AppVariant = APP_VARIANT,
): BackupWritePlan {
  if (current && !rememberedIsOwn(current.uri, variant)) return { kind: 'create' };
  if (current && current.day === today) return { kind: 'overwrite', uri: current.uri };
  return current ? { kind: 'create', replaces: current.uri } : { kind: 'create' };
}

/** Is a remembered URI this app's file? Unreadable names count as yes — see above. */
function rememberedIsOwn(uri: string, variant: AppVariant): boolean {
  const name = uriFileName(uri);
  if (!name.toLowerCase().endsWith('.json')) return true;
  return isBackupFileName(name, variant);
}

/**
 * What to delete once a new file exists: the file it replaces, plus every other
 * file in the folder with THIS APP's name — the sweep that makes "one file" true
 * even for copies the stored URI never saw (a crash between create and delete, a
 * settings restore, the overwrite fallback's ` (1)`).
 *
 * Only this app's names. The other two apps' backups, 2.x's combined
 * `momentum-backup-*`, `workout-tracker-auto-*` and `workout-tracker-backup-*`
 * are not touched. `replaces` comes from `planBackupWrite`, which has already
 * refused to name a file that is not this app's.
 */
export function backupFilesToRetire(
  files: readonly { uri: string; name: string }[],
  justWritten: string,
  replaces?: string,
  variant: AppVariant = APP_VARIANT,
): string[] {
  const out = new Set<string>();
  if (replaces && replaces !== justWritten) out.add(replaces);
  for (const file of files) {
    if (file.uri !== justWritten && isBackupFileName(file.name, variant)) out.add(file.uri);
  }
  return [...out];
}

/* ------------------------------------------------------------------ */
/* Overwriting through SAF                                             */
/* ------------------------------------------------------------------ */

/**
 * UTF-8 byte length, which is what is on disk. `string.length` counts UTF-16 code
 * units and undercounts every Cyrillic letter by half — and the user's data is
 * mostly Cyrillic.
 */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i += 1;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

/**
 * The text to write over a file that is `previousBytes` long, padded with
 * trailing spaces so it covers every old byte.
 *
 * ── WHY THE PADDING ────────────────────────────────────────────────────────
 *
 * `expo-file-system/legacy`'s `writeAsStringAsync` opens a SAF file with
 * `contentResolver.openOutputStream(uri)`, which is mode `"w"`, and on Android 10+
 * the external-storage provider does not reliably TRUNCATE in `"w"` — the
 * truncating mode is `"wt"`, and the legacy API offers no way to ask for it. So
 * writing a backup that is shorter than the one already in the file (a deleted
 * chat, a removed expense) would leave the old file's tail after the new JSON:
 * a file that does not parse, which is the one thing a backup must never be.
 *
 * Trailing whitespace is valid JSON. Padding to the old length means every old
 * byte is overwritten whether or not the provider truncates, and the result
 * parses either way. The file can only grow within a day; each day starts a fresh
 * file, so the padding never outlives the day it was written.
 */
export function padToCover(text: string, previousBytes: number): string {
  const missing = previousBytes - utf8ByteLength(text);
  return missing > 0 ? text + ' '.repeat(missing) : text;
}

/* ------------------------------------------------------------------ */
/* Why a write did not happen                                          */
/* ------------------------------------------------------------------ */

/**
 * Every reason a backup run can end without a file, kept apart because they call
 * for different things:
 *
 *   no-folder       nothing granted yet           → the picker
 *   access          Android says the grant is gone → the picker, again
 *   off             automatic and switched off     → nothing (a manual run ignores it)
 *   not-ready       a store is still loading       → try again in a moment
 *   unreadable-log  the history could not be read  → NOT a backup: restart the app
 *   write           anything else on the way out   → say what it was
 *
 * `Back up now` used to open the picker on ANY failure, so a launch that had not
 * finished loading asked the user for a folder the app already had.
 */
export type BackupFailure =
  'no-folder' | 'access' | 'off' | 'not-ready' | 'unreadable-log' | 'write';

/** Only these two are fixed by picking a folder; nothing else is. */
export function failureNeedsFolder(reason: BackupFailure): boolean {
  return reason === 'no-folder' || reason === 'access';
}

/**
 * A thrown error, as a reason. By `name` rather than `instanceof` so this file
 * stays free of the modules that define them (`FolderAccessError` in
 * `lib/backupFile.ts`, `UnreadableLogError` in `state/dataTransfer.ts`).
 */
export function classifyBackupError(error: unknown): BackupFailure {
  const name = error instanceof Error ? error.name : '';
  if (name === 'FolderAccessError') return 'access';
  if (name === 'UnreadableLogError') return 'unreadable-log';
  return 'write';
}
