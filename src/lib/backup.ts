/**
 * The backup file: what goes in it, and what it takes to trust one coming back.
 *
 *   {
 *     "format": "workout-tracker-backup",
 *     "version": 2,
 *     "exportedAt": "2026-08-19T09:12:44.001Z",
 *     "counts": { "tasks": 9, "chats": 2 },
 *     "settings": { ... },
 *     "tasks":    { "tasks": [ ... ], "log": { ... } },
 *     "aiChats":  { "chats": { "Tasks": [ ... ] }, "archive": { "Tasks": [ ... ] } }
 *   }
 *
 * ── MOMENTUM'S FORMAT, AND WHY IT IS STILL CALLED THAT ─────────────────────
 *
 * This app was split out of Momentum at 3.0.0. Momentum's file carried three
 * logs — training, the daily tasks and the money — and the first thing a fresh
 * install of this app does is open one of those. So the envelope is Momentum's,
 * field for field: the same `format`, the same version, the tasks under the same
 * key and the chats filed under the same section name. A combined Momentum 2.x
 * backup opens here (its tasks are taken, the rest is not read), a file Momentum
 * 3.0.0's Tasks app wrote opens here, and a file this app writes opens there.
 *
 * WHY THIS EXISTS. Everything the user owns lives in a handful of AsyncStorage keys
 * on one phone. An uninstall, a wiped device, a new phone, or a debug build
 * installed over a release one takes all of it — and the app's whole value is a
 * log that goes back far enough to show a habit forming. A backup is the only thing
 * standing between a year of answered days and a factory reset.
 *
 * ── THREE RULES ─────────────────────────────────────────────────────────────
 *
 *  1. THE FILE IS THE FORMAT, AND IT IS READABLE. Pretty-printed JSON with the same
 *     field names the app's own types use. Not because a human should have to edit
 *     it, but because a backup you cannot read is a backup you cannot check, and
 *     one you cannot check is a promise rather than a file.
 *
 *  2. EXPORT WRITES THE ROWS AS THEY ARE STORED. No reshaping, no summarising, no
 *     dropping of fields that "look derived": the log of every answered day is the
 *     thing every streak, month grid and trend line is recomputed from.
 *
 *  3. IMPORT TRUSTS NOTHING. This module only opens the ENVELOPE — is it JSON, is it
 *     ours, is it from a version we understand, does it carry tasks — and hands the
 *     collections on as `unknown`. Every row inside is validated by the store that
 *     owns it, by the same guards that already run on every rehydration from disk
 *     (`tasksStore`, `settingsStore`, `aiStore`). There is exactly one validator per
 *     shape in this app, and a file off a user's SD card is not the place to add a
 *     second one that can disagree with it.
 */

import { plural, t, type Language, type PluralForms } from './i18n';

/**
 * The `format` field. A file without it is not ours; a file with it might be.
 * Still `workout-tracker-backup`, the name Momentum gave it: it names the FORMAT,
 * and a second name would be a file Momentum refuses and that refuses Momentum's.
 */
export const BACKUP_FORMAT = 'workout-tracker-backup';

/**
 * The envelope version, NOT the app version.
 *
 * Bumped only when the shape around the collections changes. A file from a FUTURE
 * version is refused rather than half-read: the one thing worse than not restoring
 * a backup is restoring three quarters of it and reporting success.
 *
 * 2 — Momentum's daily tasks joined the file. A version-1 file is training only,
 * so it has nothing for this app and is refused in words.
 *
 * NOT bumped when the tasks became an app of their own. This app's file is a
 * version-2 envelope with the training ABSENT, which every Momentum reader
 * already handles: a 2.x build refuses it ("no exercises, routines or workouts")
 * rather than restoring it as an empty training log. Writing empty training
 * arrays instead would have made it a file a 2.x build restores — over the
 * training it had.
 */
export const BACKUP_VERSION = 2;

/** Human-readable row counts. Written for the reader; never trusted on the way in. */
export interface BackupCounts {
  tasks?: number;
  /** AI conversations (the open one, if it has anything in it, plus past ones). */
  chats?: number;
}

/**
 * What export writes. Typed loosely on purpose — see rule 3: this module's job is
 * the envelope, and the stores own the rows.
 */
export interface BackupPayload {
  settings: unknown;
  /** The task list and its log, whole: `{ tasks, log }` as the store holds them. */
  tasks?: unknown;
  /**
   * The AI conversations: `{ chats, archive }`, filed under `Tasks`. Optional and
   * absent-means-absent: a file without them leaves this phone's chats alone.
   * Never the key, which lives in the keystore.
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
/* Write                                                               */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * How many tasks the log holds.
 *
 * TOTAL over `unknown`, because the same function counts a file somebody found on
 * an SD card and the store on this phone — and a count that only works on
 * well-formed input is a count that throws at the one moment it is needed.
 */
function countTasks(section: unknown): number {
  return isRecord(section) ? asArray(section.tasks).length : 0;
}

/**
 * The open chat if it has anything in it, plus the past chats — total over
 * `unknown`. Only the `Tasks` lists: a Momentum file files the other sections'
 * chats beside them, and those are not what this app restores.
 */
function countAiChats(section: unknown): number {
  if (!isRecord(section)) return 0;
  const open = isRecord(section.chats) ? asArray(section.chats.Tasks) : [];
  const past = isRecord(section.archive) ? asArray(section.archive.Tasks) : [];
  return (open.length > 0 ? 1 : 0) + past.length;
}

/** Count what a payload actually holds, rather than what it claims to. */
export function countPayload(payload: BackupPayload): BackupCounts {
  const counts: BackupCounts = {};
  if (payload.tasks != null) counts.tasks = countTasks(payload.tasks);
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

/** The file's text. Two-space indented — see rule 1. */
export function serializeBackup(payload: BackupPayload, now?: Date): string {
  return `${JSON.stringify(buildBackupEnvelope(payload, now), null, 2)}\n`;
}

/*
 * The FILE NAME is not decided here. There is one backup file per day, written
 * after every change and by both buttons, and `lib/autoBackup.ts` names it
 * (`momentum-tasks-backup-<day>.json`). Older files in the same folder — the
 * combined `momentum-backup-<day>.json` Momentum 2.x wrote, and the other two
 * Momentum apps' — are left where they are: this module never deletes a file it
 * does not name.
 */

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

/**
 * Open the envelope, or say why it can't be opened.
 *
 * Refuses in four cases and repairs everything else:
 *
 *   • not JSON at all — the usual cause is a half-copied paste
 *   • from a NEWER envelope version, which may mean fields this build would drop
 *   • a backup with nothing in it at all
 *   • no tasks: a Momentum training-only or expenses-only file, or a JSON file
 *     that is simply something else. Said in words rather than "restored" as zero
 *     rows, which would read as success
 *
 * What comes back is the file CUT TO WHAT THIS APP READS — the settings, the
 * tasks and the chats — and so are its counts: the confirmation sheet states what
 * will be restored, not what a combined file happens to hold for the training.
 */
export function parseBackup(text: string, lang: Language = 'en'): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: t('That is not valid JSON — the file or the paste is incomplete.', lang),
    };
  }

  if (!isRecord(raw)) {
    return { ok: false, error: t('That file holds something other than a backup.', lang) };
  }

  const version = typeof raw.version === 'number' && Number.isFinite(raw.version) ? raw.version : 1;
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

  if (raw.tasks == null) {
    // A file of ours that carries none of Momentum's logs is an empty backup;
    // anything else — a training file, an expenses file, a stranger — has no tasks.
    const carriesAnyLog =
      Array.isArray(raw.exercises) ||
      Array.isArray(raw.routines) ||
      Array.isArray(raw.workouts) ||
      raw.money != null;
    return {
      ok: false,
      error:
        raw.format === BACKUP_FORMAT && !carriesAnyLog
          ? t('That backup is empty — there is nothing in it to restore.', lang)
          : t('That file has no tasks in it.', lang),
    };
  }

  const payload: BackupPayload = {
    settings: raw.settings ?? null,
    tasks: raw.tasks,
    // `?? undefined` rather than `?? null`, because absent has to stay absent:
    // `applyBackup` reads the difference to decide whether to touch the chats.
    aiChats: raw.aiChats ?? undefined,
  };
  const counts = countPayload(payload);

  return {
    ok: true,
    counts,
    envelope: {
      format: BACKUP_FORMAT,
      version,
      exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
      counts,
      ...payload,
    },
  };
}

/** "9 tasks · 2 AI chats" — one line for a sheet. */
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
  if (counts.tasks != null) {
    parts.push(
      counted(counts.tasks, { one: t('task', lang), few: 'задачи', many: t('tasks', lang) }),
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
