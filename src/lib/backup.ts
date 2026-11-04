/**
 * The backup file: what goes in it, and what it takes to trust one coming back.
 *
 *   {
 *     "format": "workout-tracker-backup",
 *     "version": 2,
 *     "exportedAt": "2026-08-19T09:12:44.001Z",
 *     "counts": { "exercises": 88, "routines": 6, "workouts": 42, "sets": 512 },
 *     "settings": { ... },
 *     "exercises": [ ... ],
 *     "routines":  [ ... ],
 *     "workouts":  [ ... ],
 *     "sequence":  { "isActive": false, "routineIds": [], "cursor": 0 },
 *     "numbering": { "workoutId": "d_session_x", "number": 91 },
 *     "tasks":     { "tasks": [ ... ], "log": { ... } },
 *     "money":     { "accounts": [ ... ], "categories": [ ... ], "amounts": [ ... ] }
 *   }
 *
 * ONE FORMAT, THREE APPS. Until 3.0.0 this was one app, and its file carried all
 * three logs — training, the daily tasks and the money. Momentum is now three
 * apps (`lib/appVariant.ts`), and each writes the SAME envelope holding only what
 * it owns: Workout writes the training, Tasks the tasks, Expenses the money, and
 * all three the settings. One format rather than three, so a file any of them
 * wrote opens in the other two, and the last combined 2.x backup — which is what
 * Tasks and Expenses are first filled from — opens in all three.
 *
 * ── SLICES ──────────────────────────────────────────────────────────────────
 *
 * Which collections a file carries is a SLICE decision (`backupSlices`), made
 * here as a pure function of the variant so every app's answer is testable from
 * one test run. Two rules shape it:
 *
 *  • NEVER SILENTLY DROP DATA. The Workout app is the old install, and its store
 *    still holds the tasks and the money from before the split. It no longer
 *    shows them, but its backup keeps carrying them for as long as they are there
 *    — a file that quietly stopped containing a year of expenses on the day the
 *    app was split would be discovered on the day it was needed.
 *
 *  • AN APP RESTORES ONLY ITS OWN SLICE (`parseBackup`, `applyBackup` in
 *    `state/dataTransfer.ts`), from any file: a combined 2.x backup restores the
 *    training into Workout and leaves its hidden tasks and money alone; the same
 *    file restores only the tasks into Tasks. A file with nothing for this app is
 *    refused in words, rather than "restored" as zero rows — and refused BEFORE
 *    its settings are applied, so another app's settings never ride in on a file
 *    that had nothing else to give.
 *
 * WHY THIS EXISTS. Everything the user owns lives in a handful of AsyncStorage keys on one
 * phone. An uninstall, a wiped device, a new phone, or a debug build installed over
 * a release one takes all of it — and the app's whole value is a log that goes back
 * far enough to show a plateau. A backup is the only thing standing between a year
 * of training and a factory reset.
 *
 * ── THREE RULES ─────────────────────────────────────────────────────────────
 *
 *  1. THE FILE IS THE FORMAT, AND IT IS READABLE. Pretty-printed JSON with the same
 *     field names the app's own types use. Not because a human should have to edit
 *     it, but because a backup you cannot read is a backup you cannot check, and
 *     one you cannot check is a promise rather than a file. It also means a broken
 *     import can be diagnosed by opening the file, and that anything else — a
 *     script, a spreadsheet, a future version of this app — can read the log out.
 *
 *  2. EXPORT WRITES THE ROWS AS THEY ARE STORED. No reshaping, no summarising, no
 *     dropping of fields that "look derived". `CompletedWorkout` carries both its
 *     rendered summary lines and the raw `SetHistory` rows, and the second of those
 *     is what every prefill and every overload verdict reads — a backup that kept
 *     only the pretty version would restore a history that looks right and teaches
 *     the app nothing.
 *
 *  3. IMPORT TRUSTS NOTHING. This module only opens the ENVELOPE — is it JSON, is it
 *     ours, is it from a version we understand — and hands the collections on
 *     as `unknown`. Every row inside is validated by the store that owns it, by the
 *     same guards that already run on every rehydration from disk (`libraryStore`,
 *     `workoutHistoryStore`, `settingsStore`). There is exactly one validator per
 *     shape in this app, and a file off a user's SD card is not the place to add a
 *     second one that can disagree with it.
 */

import { APP_VARIANT, variantSection, type AppVariant } from './appVariant';
import { plural, t, type Language, type PluralForms } from './i18n';

/**
 * The `format` field. A file without it is not ours; a file with it might be.
 * Still `workout-tracker-backup` in all three apps: it names the FORMAT, and a
 * second name would be a file the 2.x builds and the other two apps refuse.
 */
export const BACKUP_FORMAT = 'workout-tracker-backup';

/**
 * The envelope version, NOT the app version.
 *
 * Bumped only when the shape around the collections changes. A file from a FUTURE
 * version is refused rather than half-read: the one thing worse than not restoring
 * a backup is restoring three quarters of it and reporting success.
 *
 * 2 — the daily tasks and the money joined the file. Both are OPTIONAL on the way
 * in, so every version-1 file still restores; what it restores is a phone with its
 * training replaced and its tasks and amounts left exactly where they were, which
 * is the honest reading of a file that never carried them.
 *
 * NOT bumped for the split into three apps. A Tasks or Expenses file is a
 * version-2 envelope with the training collections ABSENT, which every reader
 * already handles: a 2.x build refuses it ("no exercises, routines or workouts")
 * rather than restoring it as an empty training log, and the three apps read it
 * by slice. Writing empty training arrays instead would have made it a file a 2.x
 * build restores — over the training it had.
 */
export const BACKUP_VERSION = 2;

/** Human-readable row counts. Written for the reader; never trusted on the way in. */
export interface BackupCounts {
  /**
   * The training, ABSENT when the file does not carry it — a Tasks or Expenses
   * file, or anything counted for the Tasks or Expenses app. Present as a group
   * of four: a file carries the training whole or not at all.
   */
  exercises?: number;
  routines?: number;
  workouts?: number;
  sets?: number;
  /**
   * The other two logs, ABSENT rather than zero when the file does not carry them.
   *
   * That distinction is the whole reason they are optional: a version-1 file has
   * no tasks in it, and `0 tasks` in the confirmation sheet would read as "this
   * restore will empty your task list" — which is precisely what it will not do.
   */
  tasks?: number;
  amounts?: number;
  /** AI conversations (open + past), when the file carries them. */
  chats?: number;
}

/**
 * What export writes. The three collections are typed loosely on purpose — see
 * rule 3: this module's job is the envelope, and the stores own the rows.
 */
export interface BackupPayload {
  settings: unknown;
  /**
   * The training slice. Optional since the split: a file from the Tasks or
   * Expenses app does not carry it, and absent means absent — `applyBackup`
   * never reads a missing array as "replace the training with nothing".
   */
  exercises?: unknown[];
  routines?: unknown[];
  workouts?: unknown[];
  /**
   * The training sequence, if this phone has one. Optional because it arrived
   * after the format did: a file written by an older build simply has no sequence,
   * which restores as "off and empty" — the same thing a fresh install has.
   */
  sequence?: unknown;
  /**
   * The pinned workout number ("this session was number 91"), if one is set. Also
   * optional, for the same reason — and worth carrying, because it is the one
   * fact in the app that cannot be recomputed from the sessions themselves.
   */
  numbering?: unknown;
  /**
   * The daily-task log and the money log, whole: `{ tasks, log }` and
   * `{ categories, amounts }` exactly as their stores hold them.
   *
   * Optional, and absent means ABSENT. A backup written before version 2 carries
   * neither, and `applyBackup` leaves both logs alone in that case rather than
   * replacing them with nothing — see `state/dataTransfer.ts`.
   */
  tasks?: unknown;
  money?: unknown;
  /**
   * What the user answered after each workout (`lib/debrief.ts`). Optional and
   * absent-means-absent, like the two logs above: a file from before debriefs
   * existed leaves this phone's answers exactly where they are.
   */
  debriefs?: unknown;
  /**
   * The AI conversations: `{ chats, archive, proposals }`. Optional and
   * absent-means-absent; never the key, which lives in the keystore.
   */
  aiChats?: unknown;
}

export interface BackupEnvelope extends BackupPayload {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  counts: BackupCounts;
}

export type ParseResult =
  | { ok: true; envelope: BackupEnvelope; counts: BackupCounts }
  /** `error` is shown to the user verbatim, so it is written as a sentence. */
  | { ok: false; error: string };

/* ------------------------------------------------------------------ */
/* Slices: which app carries what                                      */
/* ------------------------------------------------------------------ */

/**
 * The three logs, one per app. Settings are not a slice: every app carries them,
 * because the language, the theme and the currency are the user's in all three.
 *
 *   workout  exercises, routines, workouts, sequence, numbering, debriefs,
 *            and the Workout chats
 *   tasks    the task list and its log, and the Tasks chats
 *   money    the money log whole, and the Expenses chats
 */
export type PayloadSlice = 'workout' | 'tasks' | 'money';

const SLICE_OF: Record<AppVariant, PayloadSlice> = {
  workout: 'workout',
  tasks: 'tasks',
  expenses: 'money',
};

const VARIANT_OF: Record<PayloadSlice, AppVariant> = {
  workout: 'workout',
  tasks: 'tasks',
  money: 'expenses',
};

/** The slice this app shows, and the only one it restores. */
export function ownSlice(variant: AppVariant): PayloadSlice {
  return SLICE_OF[variant];
}

/** The assistant's section for a slice: `Workout`, `Tasks`, `Expenses`. */
function aiSectionOf(slice: PayloadSlice): string {
  return variantSection(VARIANT_OF[slice]);
}

/**
 * Whether this store still holds tasks or money from before the split. Only the
 * Workout app can: it is the old install. See `holdsLegacy`.
 */
export interface LegacyHeld {
  tasks: boolean;
  money: boolean;
}

export const NO_LEGACY: LegacyHeld = { tasks: false, money: false };

/**
 * The slices this app's backup carries, in file order.
 *
 * Tasks and Expenses: their own. Workout: the training, AND the tasks and the
 * money for as long as the store still holds any (`held`) — see the header's
 * "never silently drop data". Once a log has been moved to its own app and is
 * nothing but the seed here, it stops being written; until then it is the one
 * copy that exists.
 */
export function backupSlices(
  variant: AppVariant,
  held: LegacyHeld = NO_LEGACY,
): readonly PayloadSlice[] {
  if (variant !== 'workout') return [ownSlice(variant)];
  const out: PayloadSlice[] = ['workout'];
  if (held.tasks) out.push('tasks');
  if (held.money) out.push('money');
  return out;
}

/** Does the payload carry the training? Any one of its three arrays says so. */
function carriesTraining(payload: BackupPayload): boolean {
  return (
    Array.isArray(payload.exercises) ||
    Array.isArray(payload.routines) ||
    Array.isArray(payload.workouts)
  );
}

/** The slices a payload (a file, or this phone) actually carries. */
export function carriedSlices(payload: BackupPayload): PayloadSlice[] {
  const out: PayloadSlice[] = [];
  if (carriesTraining(payload)) out.push('workout');
  if (payload.tasks != null) out.push('tasks');
  if (payload.money != null) out.push('money');
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The assistant's blob with only the named sections' chats in it.
 *
 * Chats are kept per section (`state/aiStore.ts`), so they split along the same
 * seam as everything else. Proposals are keyed by id rather than by section and
 * travel whole: they are small, a message points at its proposal by id, and a
 * proposal nothing points at is harmless where a missing one is a broken card.
 */
function sliceAiChats(aiChats: unknown, sections: readonly string[]): unknown {
  if (!isRecord(aiChats)) return aiChats;
  const pick = (group: unknown) => {
    const out: Record<string, unknown> = {};
    const source = isRecord(group) ? group : {};
    for (const section of sections) out[section] = asArray(source[section]);
    return out;
  };
  return { ...aiChats, chats: pick(aiChats.chats), archive: pick(aiChats.archive) };
}

/**
 * A payload cut down to `slices` (plus the settings). A collection the source
 * does not carry stays absent — slicing never invents an empty log.
 */
export function slicePayload(
  payload: BackupPayload,
  slices: readonly PayloadSlice[],
): BackupPayload {
  const out: BackupPayload = { settings: payload.settings };
  if (slices.includes('workout') && carriesTraining(payload)) {
    out.exercises = asArray(payload.exercises);
    out.routines = asArray(payload.routines);
    out.workouts = asArray(payload.workouts);
    if (payload.sequence !== undefined) out.sequence = payload.sequence;
    if (payload.numbering !== undefined) out.numbering = payload.numbering;
    if (payload.debriefs !== undefined) out.debriefs = payload.debriefs;
  }
  if (slices.includes('tasks') && payload.tasks != null) out.tasks = payload.tasks;
  if (slices.includes('money') && payload.money != null) out.money = payload.money;
  if (payload.aiChats != null) {
    out.aiChats = sliceAiChats(payload.aiChats, slices.map(aiSectionOf));
  }
  return out;
}

/**
 * The assistant blob a restore writes: the file's chats for this app's sections,
 * this phone's for every other. `undefined` when the file carries no chats, which
 * `applyBackup` reads as "leave them alone".
 *
 * A merge rather than a replace because the store holds all three sections, and
 * in the Workout app the other two are the legacy conversations nobody can see
 * any more but nobody has moved yet either.
 */
export function mergeAiChats(
  here: unknown,
  fromFile: unknown,
  slices: readonly PayloadSlice[],
): unknown {
  if (fromFile == null) return undefined;
  const own = new Set(slices.map(aiSectionOf));
  const mine = isRecord(here) ? here : {};
  const theirs = isRecord(fromFile) ? fromFile : {};
  const merge = (key: 'chats' | 'archive') => {
    const out: Record<string, unknown> = { ...(isRecord(mine[key]) ? mine[key] : {}) };
    const source = isRecord(theirs[key]) ? theirs[key] : {};
    for (const section of own) out[section] = asArray(source[section]);
    return out;
  };
  return {
    chats: merge('chats'),
    archive: merge('archive'),
    proposals: {
      ...(isRecord(mine.proposals) ? mine.proposals : {}),
      ...(isRecord(theirs.proposals) ? theirs.proposals : {}),
    },
  };
}

/** Is any of the named sections' open chats or past chats non-empty? */
function hasChats(aiChats: unknown, section: string): boolean {
  if (!isRecord(aiChats)) return false;
  return (['chats', 'archive'] as const).some((key) => {
    const group = aiChats[key];
    return isRecord(group) && asArray(group[section]).length > 0;
  });
}

function sameIds(rows: readonly unknown[], seedIds: readonly string[]): boolean {
  const ids = rows.map((row) => (isRecord(row) ? row.id : undefined));
  return ids.length === seedIds.length && ids.every((id, i) => id === seedIds[i]);
}

/**
 * Does this snapshot hold tasks or money worth carrying — anything beyond the
 * seed a fresh install opens with?
 *
 * Generous on purpose: a false yes costs a Workout backup some bytes of seed
 * rows; a false no is a backup that stopped carrying somebody's log. Tasks: any
 * answered day, any task list other than the nine seeded rows, or a Tasks chat.
 * Money: any amount, a pinned scale, any opening balance, any account other than
 * the two seeded, any budget, recurring payment or goal, or an Expenses chat. Categories alone
 * do not count — the store edits them itself (`withTransferCategories`).
 */
export function holdsLegacy(
  snapshot: Pick<BackupPayload, 'tasks' | 'money' | 'aiChats'>,
  seed: { taskIds: readonly string[]; accountIds: readonly string[] },
): LegacyHeld {
  const tasks = isRecord(snapshot.tasks) ? snapshot.tasks : {};
  const log = isRecord(tasks.log) ? tasks.log : {};
  const anyAnswer = Object.values(log).some(
    (days) => isRecord(days) && Object.keys(days).length > 0,
  );
  const tasksHeld =
    anyAnswer ||
    !sameIds(asArray(tasks.tasks), seed.taskIds) ||
    hasChats(snapshot.aiChats, 'Tasks');

  const money = isRecord(snapshot.money) ? snapshot.money : {};
  const accounts = asArray(money.accounts);
  const moneyHeld =
    asArray(money.amounts).length > 0 ||
    money.scale != null ||
    accounts.some(
      (account) => isRecord(account) && account.opening !== 0 && account.opening != null,
    ) ||
    !sameIds(accounts, seed.accountIds) ||
    asArray(money.budgets).length > 0 ||
    asArray(money.recurring).length > 0 ||
    asArray(money.goals).length > 0 ||
    hasChats(snapshot.aiChats, 'Expenses');

  return { tasks: tasksHeld, money: moneyHeld };
}

/* ------------------------------------------------------------------ */
/* Write                                                               */
/* ------------------------------------------------------------------ */

/**
 * How many rows one of the optional logs holds.
 *
 * TOTAL over `unknown`, because the same function counts a file somebody found on
 * an SD card and the stores on this phone — and a count that only works on
 * well-formed input is a count that throws at the one moment it is needed.
 */
function countList(section: unknown, key: string): number {
  if (typeof section !== 'object' || section === null) return 0;
  const rows = (section as Record<string, unknown>)[key];
  return Array.isArray(rows) ? rows.length : 0;
}

/** Open chats with anything in them, plus past chats — total over `unknown`. */
function countAiChats(section: unknown): number {
  if (typeof section !== 'object' || section === null) return 0;
  const { chats, archive } = section as { chats?: unknown; archive?: unknown };
  let count = 0;
  for (const group of [chats, archive]) {
    if (typeof group !== 'object' || group === null) continue;
    for (const list of Object.values(group as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue;
      count += group === chats ? (list.length > 0 ? 1 : 0) : list.length;
    }
  }
  return count;
}

/** Count what a payload actually holds, rather than what it claims to. */
export function countPayload(payload: BackupPayload): BackupCounts {
  const counts: BackupCounts = {};
  if (carriesTraining(payload)) {
    const workouts = asArray(payload.workouts);
    let sets = 0;
    for (const workout of workouts) {
      const rows = (workout as { sets?: unknown } | null)?.sets;
      if (Array.isArray(rows)) sets += rows.length;
    }
    counts.exercises = asArray(payload.exercises).length;
    counts.routines = asArray(payload.routines).length;
    counts.workouts = workouts.length;
    counts.sets = sets;
  }
  /*
   * The two logs that arrived later are OPTIONAL in the envelope, and absent is not
   * empty — a version-1 file carries neither, and a count of `0 tasks` on such a
   * file would be a sentence about somebody's habits that the file does not make.
   * So each is counted only when it is there, and `describeCounts` omits the key.
   */
  if (payload.tasks != null) counts.tasks = countList(payload.tasks, 'tasks');
  if (payload.money != null) counts.amounts = countList(payload.money, 'amounts');
  if (payload.aiChats != null) counts.chats = countAiChats(payload.aiChats);
  return counts;
}

function buildBackupEnvelope(payload: BackupPayload, now: Date = new Date()): BackupEnvelope {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    counts: countPayload(payload),
    ...payload,
  };
}

/**
 * The file's text. Two-space indented — see rule 1.
 *
 * A year of training is a few hundred kilobytes either way, and the cost of
 * indentation is bytes on a disk that has gigabytes of them.
 */
export function serializeBackup(payload: BackupPayload, now?: Date): string {
  return `${JSON.stringify(buildBackupEnvelope(payload, now), null, 2)}\n`;
}

/*
 * The FILE NAME is not decided here any more. Exports used to be
 * `workout-tracker-backup-<day>-<minute>.json`, one per tap, with the earlier
 * ones deleted by name; now there is one backup file per day per app, written
 * after every change and by both buttons, and `lib/autoBackup.ts` names it
 * (`momentum-workout-backup-<day>.json`, and the tasks and expenses twins). The
 * old files — those exports, and 2.x's combined `momentum-backup-<day>.json` —
 * are left where they are: this module never deletes a file it no longer names.
 */

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Why a readable backup has nothing for THIS app, in the app's own words.
 *
 * Workout's is the sentence 2.x already said about a file with no training in
 * it; the other two name their own log, because "no exercises" is not what is
 * missing from a file the Tasks app was handed.
 */
export function nothingForThisApp(variant: AppVariant, lang: Language): string {
  if (variant === 'tasks') return t('That file has no tasks in it.', lang);
  if (variant === 'expenses') return t('That file has no expenses in it.', lang);
  return t('That file has no exercises, routines or workouts in it.', lang);
}

/**
 * Open the envelope for THIS app, or say why it can't be opened.
 *
 * Refuses in four cases and repairs everything else:
 *
 *   • not JSON at all — the usual cause is a half-copied paste
 *   • from a NEWER envelope version, which may mean fields this build would drop
 *   • no recognisable collections in it, which is how a JSON file that is simply
 *     something else announces itself
 *   • nothing for this app: a perfectly good Tasks file handed to Expenses. Said
 *     in words rather than "restored" as zero rows, which would read as success
 *
 * What comes back is the file CUT TO THIS APP'S SLICE (`slicePayload`), and so
 * are its counts: the confirmation sheet states what this app will restore, not
 * what the file happens to hold for the other two. `variant` is a parameter so
 * the tests can read one file as all three apps; the screen leaves it to default.
 *
 * A missing `format` on a file that does carry collections is accepted: a backup
 * hand-edited into a file with the arrays intact is still a backup, and the rows
 * themselves are validated downstream either way.
 */
export function parseBackup(
  text: string,
  lang: Language = 'en',
  variant: AppVariant = APP_VARIANT,
): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: t('That is not valid JSON — the file or the paste is incomplete.', lang),
    };
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: t('That file holds something other than a backup.', lang) };
  }

  const source = raw as Record<string, unknown>;
  const version =
    typeof source.version === 'number' && Number.isFinite(source.version) ? source.version : 1;
  if (version > BACKUP_VERSION) {
    return {
      ok: false,
      error: t(
        'That backup was written by a newer version of the app (format {version}). Update the app first.',
        lang,
        { version },
      ),
    };
  }

  const hasTraining =
    Array.isArray(source.exercises) ||
    Array.isArray(source.routines) ||
    Array.isArray(source.workouts);
  const whole: BackupPayload = {
    settings: source.settings ?? null,
    // The training whole or not at all: a file with any of the three arrays has
    // the others repaired to empty, as it always was; a file with none of them
    // (a Tasks or Expenses file) has no training, which is not the same thing.
    ...(hasTraining
      ? {
          exercises: asArray(source.exercises),
          routines: asArray(source.routines),
          workouts: asArray(source.workouts),
          // Passed through untouched — the stores own what these may be, and a
          // file from before either existed simply has neither.
          sequence: source.sequence ?? null,
          numbering: source.numbering ?? null,
        }
      : {}),
    // `?? undefined` rather than `?? null`, because absent has to stay absent:
    // `applyBackup` reads the difference to decide whether to touch these logs.
    tasks: source.tasks ?? undefined,
    money: source.money ?? undefined,
    debriefs: source.debriefs ?? undefined,
    aiChats: source.aiChats ?? undefined,
  };

  const carried = carriedSlices(whole);
  if (carried.length === 0) {
    return {
      ok: false,
      error:
        source.format === BACKUP_FORMAT
          ? t('That backup is empty — there is nothing in it to restore.', lang)
          : nothingForThisApp(variant, lang),
    };
  }
  if (!carried.includes(ownSlice(variant))) {
    return { ok: false, error: nothingForThisApp(variant, lang) };
  }

  const payload = slicePayload(whole, [ownSlice(variant)]);
  const counts = countPayload(payload);

  return {
    ok: true,
    counts,
    envelope: {
      format: BACKUP_FORMAT,
      version,
      exportedAt: typeof source.exportedAt === 'string' ? source.exportedAt : '',
      counts,
      ...payload,
    },
  };
}

/** "42 workouts · 512 sets · 88 exercises · 6 routines" — one line for a sheet. */
export function describeCounts(counts: BackupCounts, lang: Language = 'en'): string {
  /*
   * The counted noun goes through `plural`, not through an appended `s`: Russian
   * has three forms of every one of these words and none of them is the singular
   * with a letter on the end. `few` is the Russian-only form, so it is the
   * Russian word.
   */
  const counted = (n: number, forms: PluralForms) =>
    t('{count} {noun}', lang, { count: n, noun: plural(n, lang, forms) });

  const parts: string[] = [];
  // The training as its group of four, and only when it is there — a Tasks
  // file's sheet that opened with "0 workouts" would be a sentence about the
  // wrong app.
  if (counts.workouts != null) {
    parts.push(
      counted(counts.workouts, {
        one: t('workout', lang),
        few: 'тренировки',
        many: t('workouts', lang),
      }),
      counted(counts.sets ?? 0, { one: t('set', lang), few: 'подхода', many: t('sets', lang) }),
      counted(counts.exercises ?? 0, {
        one: t('exercise', lang),
        few: 'упражнения',
        many: t('exercises', lang),
      }),
      counted(counts.routines ?? 0, {
        one: t('routine', lang),
        few: 'программы',
        many: t('routines', lang),
      }),
    );
  }
  // Only when the file actually carries them — see `BackupCounts`.
  if (counts.tasks != null) {
    parts.push(
      counted(counts.tasks, { one: t('task', lang), few: 'задачи', many: t('tasks', lang) }),
    );
  }
  if (counts.amounts != null) {
    parts.push(
      counted(counts.amounts, { one: t('amount', lang), few: 'суммы', many: t('amounts', lang) }),
    );
  }
  if (counts.chats != null && counts.chats > 0) {
    parts.push(
      counted(counts.chats, {
        one: t('AI chat', lang),
        few: 'чата с ИИ',
        many: t('AI chats', lang),
      }),
    );
  }
  return parts.join(' · ');
}
