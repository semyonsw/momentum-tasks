/**
 * When to write a backup nobody asked for.
 *
 *   last backup 8 days ago  ·  interval 7  ─────►  write one, now
 *   last backup 2 days ago  ·  interval 7  ─────►  nothing
 *   never backed up         ·  any         ─────►  write one, now
 *
 * `lib/backup.ts` opens with the reason this exists: everything the user owns lives
 * in three AsyncStorage keys on one phone, and "a backup is the only thing standing
 * between a year of training and a factory reset". It then made that backup a
 * BUTTON — which means the protection is only ever as good as the user's memory of
 * a screen they have no other reason to open. A log worth a year is not defended by
 * a menu item.
 *
 * So the write is automatic, and this file is the decision: nothing here touches the
 * file system, the store or the clock. It takes the last time a backup landed and
 * says whether another one is due, which makes "is the backup stale" a testable
 * question rather than a side effect.
 *
 * ── WHY IT IS A FOLDER THE USER PICKS, AND WHY THAT IS NOT OPTIONAL ────────
 *
 * Android gives an app two places to write: its own sandbox, and a folder the user
 * grants through the Storage Access Framework. The sandbox is useless for THIS job —
 * it is deleted with the app, which is one of the exact events a backup exists to
 * survive — so the only destination that means anything is the granted folder. That
 * grant is persistable, so it is asked for once and remembered
 * (`Settings.autoBackupFolderUri`).
 *
 * Which means automatic backup CANNOT be silently on by default: without a folder
 * there is nowhere to write, and an app claiming to back up into a directory that
 * dies with it is worse than one that admits it is not backing up. The setting is
 * therefore two facts — enabled, and where — and the screen states the second one.
 *
 * ── ROTATION ───────────────────────────────────────────────────────────────
 *
 * SAF cannot overwrite: `createFileAsync` appends ` (1)` rather than replacing, so
 * an unattended weekly write would leave fifty files a year in somebody's Download
 * folder. `KEEP` newest copies (one) are kept and the rest are deleted by URI, so the
 * folder holds the latest copy instead of a pile. Copies the URI list does not know
 * about — written before a folder change, or by a build that kept four — are found
 * by name (`staleAutoBackups`) and go too.
 */

import { dayKey, daysBetween } from './days';
import { plural, t, type Language } from './i18n';

/** ISO-8601 instants, as everywhere else in the app. */
export type ISOInstant = string;

/**
 * How many automatic copies to keep in the folder: one.
 *
 * It was four — a month of history at the weekly default — and the folder read as
 * a pile to the person who owns it, next to a manual export that already keeps
 * only one (`staleExports` in `lib/backup.ts`). One file that is always the newest
 * is what was asked for. The new copy is written BEFORE the old one is deleted, so
 * the folder never holds zero.
 */
export const AUTO_BACKUP_KEEP = 1;

/** The cadence range. */
export const AUTO_BACKUP_INTERVAL_LIMITS = { min: 1, max: 30, step: 1 } as const;

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
 * It used to floor elapsed 24-hour periods, which is a different question: a
 * backup from 23:00 read `Today` at 08:00 the next morning, and a one-day
 * interval stamped at 20:00 was not due on a morning launch — so the app opened
 * every training day and wrote nothing until the evening.
 */
export function daysSince(
  at: ISOInstant | null | undefined,
  now: Date = new Date(),
): number | null {
  const then = instant(at);
  if (then == null) return null;
  return Math.max(0, daysBetween(dayKey(new Date(then)), dayKey(now)));
}

export interface AutoBackupState {
  enabled: boolean;
  /** The granted folder. Absent = nowhere to write, so nothing can happen. */
  folderUri?: string;
  /** When the last automatic OR manual backup landed. */
  lastAt?: ISOInstant;
  intervalDays: number;
}

/**
 * Is a backup due?
 *
 * A never-backed-up log is due immediately — that is the case with the most to lose
 * and the least excuse. Clock skew (a `lastAt` in the future, which a timezone
 * change or a hand-edited blob can produce) reads as zero days and therefore as not
 * due, rather than as a negative interval that would write on every launch.
 */
export function shouldBackUpNow(state: AutoBackupState, now: Date = new Date()): boolean {
  if (!state.enabled) return false;
  if (!state.folderUri) return false;
  const days = daysSince(state.lastAt, now);
  if (days == null) return true;
  return days >= Math.max(AUTO_BACKUP_INTERVAL_LIMITS.min, Math.round(state.intervalDays));
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

/**
 * The URIs to keep and the URIs to delete, newest first.
 *
 * Pure so the rotation is testable without a file system: the caller writes the new
 * file, prepends its URI, and deletes whatever comes back in `drop`. A delete that
 * fails is not an error worth surfacing — the copy stays, and the next rotation
 * tries again — so this returns a plan rather than performing one.
 */
export function rotateBackups(
  existing: readonly string[],
  newest: string,
  keep = AUTO_BACKUP_KEEP,
): { keep: string[]; drop: string[] } {
  // Deduplicated because SAF hands back a fresh URI per file, but a retried write
  // after a partial failure can produce the same one twice.
  const all = [newest, ...existing.filter((uri) => uri !== newest)];
  return { keep: all.slice(0, Math.max(1, keep)), drop: all.slice(Math.max(1, keep)) };
}

/**
 * An automatic copy's file name as SAF wrote it: `.json` appended, and ` (1)` when
 * a second write landed on the same day. Exact, because whatever matches is deleted.
 */
const AUTO_BACKUP_NAME = /^workout-tracker-auto-\d{4}-\d{2}-\d{2}( \(\d+\))?\.json$/;

export function isAutoBackupName(name: string): boolean {
  return AUTO_BACKUP_NAME.test(name.trim());
}

/**
 * Every automatic copy in the folder except the one just written — the sweep that
 * makes "one file" true even for copies the URI list never saw.
 */
export function staleAutoBackups(
  files: readonly { uri: string; name: string }[],
  justWritten: string,
): string[] {
  return files
    .filter((file) => file.uri !== justWritten && isAutoBackupName(file.name))
    .map((file) => file.uri);
}

/** The file name for an automatic copy: dated, sortable, and obviously automatic. */
export function autoBackupBaseName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `workout-tracker-auto-${stamp}`;
}
