/**
 * Which store changes are worth a backup write.
 *
 * The automatic backup rewrites the file after every change (`lib/autoBackup.ts`),
 * and "every change" has to mean every change to what the FILE carries — not
 * every `set` on a store. Plenty of sets change nothing a backup holds: the AI
 * store flips `pending` and `status` around every question, the session timer
 * ticks, and the backup itself stamps `lastBackupAt` and the file's URI into
 * settings. Treating those as changes would write the file for nothing, and the
 * last one would be a loop: a write records itself, the record is a change, the
 * change asks for a write.
 *
 * So each store is reduced to the slice `state/dataTransfer.ts` puts in the file,
 * and a change is a slice whose fields are not the SAME REFERENCES as before.
 * Reference equality is exact here for the reason `state/persistStorage.ts` gives:
 * every store replaces what it edits rather than mutating it.
 *
 * The workout in progress is not watched at all: it is not in a backup (see
 * `state/dataTransfer.ts`), and finishing it lands in the history store, which is.
 */

/**
 * The fields each store contributes to a backup, mirroring `currentSnapshot`.
 *
 * Settings are the exception: listed by EXCLUSION, because every setting is in the
 * file and a setting added next month should be backed up without anybody
 * remembering this list. What is excluded is the backup's own bookkeeping — where
 * it writes and when it last did — which `applyBackup` keeps per-phone anyway.
 */
export const BACKED_UP_FIELDS = {
  library: ['exercises', 'routines', 'sequence'],
  workoutHistory: ['workouts', 'numbering'],
  tasks: ['tasks', 'log'],
  money: [
    'accounts',
    'categories',
    'amounts',
    'scale',
    'budgets',
    'budgetAlertsFired',
    'recurring',
    'goals',
  ],
  debriefs: ['debriefs'],
  ai: ['chats', 'archive', 'proposals'],
} as const;

/** Settings fields that describe the backup itself, not the user's data. */
export const SETTINGS_NOT_BACKED_UP: readonly string[] = [
  'autoBackupEnabled',
  'autoBackupFolderUri',
  'autoBackupFile',
  'lastBackupAt',
  // Retired fields an old blob may still carry; never a reason to write.
  'autoBackupIntervalDays',
  'autoBackupUris',
];

export type BackupSlice = Readonly<Record<string, unknown>>;

/** The named fields of a store's state. */
export function pickFields(state: object, fields: readonly string[]): BackupSlice {
  const source = state as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of fields) out[field] = source[field];
  return out;
}

/** Every value field of the settings store, minus the backup's bookkeeping. */
export function settingsSlice(state: object): BackupSlice {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    if (typeof value === 'function') continue;
    if (SETTINGS_NOT_BACKED_UP.includes(key)) continue;
    out[key] = value;
  }
  return out;
}

/** Did any field change, by reference? A field appearing or vanishing counts. */
export function sliceChanged(previous: BackupSlice, next: BackupSlice): boolean {
  const keys = Object.keys(previous);
  if (keys.length !== Object.keys(next).length) return true;
  return keys.some(
    (key) => !Object.prototype.hasOwnProperty.call(next, key) || previous[key] !== next[key],
  );
}
