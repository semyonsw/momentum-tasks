/**
 * Two logs as spreadsheets: one row per amount, one row per set.
 *
 *   date,account,type,category,amount,currency,note,whole_month
 *   2026-10-03,Cash,expense,"Food, takeaway",-12.50,USD,,false
 *
 *   date,workout,routine,exercise,set,weight,unit,count,count_unit,load_mode,warmup,rest_s
 *   2026-10-03,212,Push,Bench press,1,60,kg,8,reps,external,true,
 *
 * The JSON backup is readable, but a spreadsheet cannot read nested JSON — the
 * set rows live inside an array inside a workout inside an array, and getting
 * them into columns means writing the script the file was supposed to make
 * unnecessary. So this is the flat form, and it is deliberately NOT a second
 * backup format:
 *
 *  • NO CSV IMPORT. A table of rows carries no library, no routines, no
 *    categories with their glyphs and no settings; reading one back would make a
 *    log that refers to things that do not exist. There is one way back in, the
 *    JSON file, and that stays true (see `state/dataTransfer.ts`).
 *  • DERIVED, NEVER SUMMARISED. Every cell comes off one stored row or the record
 *    around it. Nothing is totalled, averaged or estimated; the only arithmetic is
 *    the two unit conversions a reader would otherwise have to do by hand — the
 *    money log's integer minor units to the figure on screen (`scale`, see
 *    `lib/moneyUnits.ts`), and kg to lb for somebody who lifts in pounds.
 *
 * ── THE DECISIONS A SPREADSHEET NOTICES ───────────────────────────────────
 *
 *  • AMOUNTS ARE SIGNED BY WHAT THEY DID TO THE ACCOUNT: an expense and the
 *    outgoing half of a transfer are negative, an income and the incoming half
 *    positive. Rejected: the log's own positive value with the direction in
 *    another column — exact, but then the first thing anybody does is write an
 *    IF() to put the sign back, and a SUM over one account no longer equals what
 *    that account moved. Transfers say `transfer` in `type`, so a filter on
 *    `expense` is spending only, which is the same rule every screen uses.
 *  • A WHOLE-MONTH AMOUNT IS DATED THE 1ST, with `whole_month` true. A blank date
 *    breaks every date filter, and `2026-10` is a format half the spreadsheets on
 *    earth read as text; the flag is what says it belongs to no particular day.
 *  • NUMBERS IN CELLS ARE PLAIN: a point for decimals, no thousands separator, a
 *    fixed number of decimals in a cents log (`12.50`, not `12.5`). A grouped
 *    `1,250` would be a quoted string in every tool that reads this.
 *  • HEADERS ARE ENGLISH, LOWERCASE, AND NEVER TRANSLATED. They are column names
 *    for formulas, not words for a reader, and a sheet that renamed its columns
 *    when the phone changed language would break every formula built on it. The
 *    DATA is the user's own words, in whatever script they typed them.
 *  • A UTF-8 BOM up front. Without it Excel opens a CSV in the machine's legacy
 *    code page and every Cyrillic category name arrives as mojibake; LibreOffice,
 *    Sheets and Numbers all skip it. It is three bytes and the price of `Еда`
 *    reading as `Еда`.
 *
 * ── RFC 4180 ───────────────────────────────────────────────────────────────
 *
 * Exercise names contain commas by nature ("Row, stomach"), a note can contain a
 * quote or a line break. The rule is the standard one: quote a field if it holds
 * a comma, a quote, a CR or an LF, and double any quote inside it. CRLF between
 * records, and after the last one, because that is what the RFC says and what
 * Excel expects.
 */

import { formatRir } from './effort';
import { setKindOf } from './setType';
import type { CompletedWorkout, WorkoutNumberAnchor } from './completedWorkout';
import { workoutNumbers } from './completedWorkout';
import { dayKey, pad } from './days';
import { isTransferCategory, type Amount, type MoneyAccount, type MoneyCategory } from './money';
import { kgToLb } from './units';
import type { UnitSystem } from '../types/models';

/** What makes Excel read the file as UTF-8. See the header. */
export const BOM = '﻿';

const CRLF = '\r\n';

export const AMOUNT_COLUMNS = [
  'date',
  'account',
  'type',
  'category',
  'amount',
  'currency',
  'note',
  'whole_month',
] as const;

export const SET_COLUMNS = [
  'date',
  'workout',
  'routine',
  'exercise',
  'set',
  'weight',
  'unit',
  'count',
  'count_unit',
  'load_mode',
  'warmup',
  'rest_s',
  // Appended, never inserted: a sheet built on the columns above keeps working.
  'rir',
  'set_type',
] as const;

/**
 * One field, quoted if it has to be.
 *
 * Only when it has to be, rather than always: an unquoted file is readable in a
 * terminal, and `diff`ing two exports is something somebody will want to do.
 */
export function csvField(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/** Header plus records, BOM first, CRLF after every record — the whole file. */
export function csvDocument(
  columns: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const lines = [columns, ...rows].map((row) => row.map(csvField).join(','));
  return `${BOM}${lines.join(CRLF)}${CRLF}`;
}

/**
 * A stored integer in the log's scale as a plain decimal: `-1250` at scale 2 is
 * `-12.50`, `9020` at scale 0 is `9020`. Integer arithmetic throughout, so no
 * float ever turns 0.29 into 0.28999.
 */
export function csvMoney(value: number, scale: number): string {
  const abs = Math.round(Math.abs(value));
  const sign = value < 0 && abs !== 0 ? '-' : '';
  if (scale <= 0) return `${sign}${abs}`;
  const unit = 10 ** scale;
  const fraction = String(abs % unit).padStart(scale, '0');
  return `${sign}${Math.floor(abs / unit)}.${fraction}`;
}

const bool = (value: boolean) => (value ? 'true' : 'false');

export interface AmountsCsvInput {
  amounts: readonly Amount[];
  accounts: readonly MoneyAccount[];
  categories: readonly MoneyCategory[];
  /** The money log's scale (`useMoneyScale`). */
  scale: number;
  /** The label the user counts in (`settings.currencyCode`). */
  currency: string;
}

/** A transfer half is either flagged with its pair or filed under Transfer. */
function amountType(amount: Amount): 'expense' | 'income' | 'transfer' {
  if (amount.transferId || isTransferCategory(amount.categoryId)) return 'transfer';
  return amount.direction;
}

function amountDate(amount: Amount): string {
  return amount.when.kind === 'day'
    ? amount.when.date
    : `${amount.when.year}-${pad(amount.when.month + 1)}-01`;
}

/**
 * Every amount, oldest day first; amounts on the same day in the order they were
 * logged. Archived accounts and categories are exported by name like any other —
 * archiving hides a thing from the grid, it does not unspend the money.
 *
 * An id that no longer resolves (a malformed row) exports as the id itself: an
 * amount that happened should reach the file with SOMETHING in the column rather
 * than be dropped.
 */
export function amountsToCsv(input: AmountsCsvInput): string {
  const accountName = new Map(input.accounts.map((a) => [a.id, a.name]));
  const categoryName = new Map(input.categories.map((c) => [c.id, c.name]));

  const ordered = input.amounts
    .map((amount, index) => ({ amount, index, date: amountDate(amount) }))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.amount.createdAt.localeCompare(b.amount.createdAt) ||
        a.index - b.index,
    );

  const rows = ordered.map(({ amount, date }) => [
    date,
    accountName.get(amount.accountId) ?? amount.accountId,
    amountType(amount),
    categoryName.get(amount.categoryId) ?? amount.categoryId,
    csvMoney(amount.direction === 'expense' ? -amount.value : amount.value, input.scale),
    input.currency,
    amount.note,
    bool(amount.when.kind === 'month'),
  ]);
  return csvDocument(AMOUNT_COLUMNS, rows);
}

export interface WorkoutsCsvOptions {
  /** The pinned workout number, as the history list uses it. */
  numbering?: WorkoutNumberAnchor | null;
  unitSystem?: UnitSystem;
}

/** A weight in the user's unit: stored kg exactly, or lb to two decimals. */
function csvWeight(kg: number, unitSystem: UnitSystem): string {
  if (unitSystem === 'metric') return String(kg);
  return String(Number(kgToLb(kg).toFixed(2)));
}

/**
 * Every set in the log, oldest workout first, each workout's sets grouped by
 * exercise in the workout's exercise order, and in set order within one.
 *
 * ── THE EXERCISE NAME COMES FROM THE WORKOUT, NOT THE LIBRARY ──────────────
 *
 * Each `CompletedWorkout` carries a snapshot of the name of every exercise in it,
 * precisely so a rename or a delete cannot rewrite the log. An exercise deleted
 * from the library since still exports under the name it had when it was trained.
 *
 * `workout` is the number the history list prints (`workoutNumbers`, with the
 * user's pin), blank where that number would be below 1 — the list leaves those
 * unnumbered too. `routine` is the workout's title, which is the routine it was
 * started from or the name it was given. `set` is `setIndex + 1`, counted
 * within the exercise as the workout screen counts it (Bench 1–3, then Squat
 * 1–2), warm-ups included; `warmup` says which ones count.
 * `rir` is the reps in reserve when the set was graded, blank when it was not
 * (RPE is `10 − rir`, a formula a spreadsheet can do). `set_type` is what the set
 * was — `working`, `warmup`, `drop`, `failure` or `amrap` — so a filter on it does
 * not need the `warmup` column, which stays for the sheets already built on it.
 * Weight is blank, not 0, for unweighted work: a spreadsheet summing the column
 * must not be told a push-up weighed nothing.
 */
export function workoutsToCsv(
  workouts: readonly CompletedWorkout[],
  options: WorkoutsCsvOptions = {},
): string {
  const unitSystem = options.unitSystem ?? 'metric';
  const unit = unitSystem === 'imperial' ? 'lb' : 'kg';
  // `workoutNumbers` wants the store's order, newest first.
  const newestFirst = [...workouts].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const numbers = workoutNumbers(newestFirst, options.numbering ?? null);

  const rows: string[][] = [];
  for (const workout of [...newestFirst].reverse()) {
    const nameById = new Map(workout.exercises.map((e) => [e.exerciseId, e.name]));
    const date = dayKey(workout.startedAt);
    const number = numbers[workout.id];
    // `setIndex` counts within ONE exercise (`draftToSetHistory`), so sorting on
    // it alone interleaves them — Bench 1, Squat 1, Bench 2. The workout's own
    // exercise order first, then the set; an exercise the snapshot does not
    // list goes last rather than being dropped.
    const position = new Map(workout.exercises.map((e, i) => [e.exerciseId, i]));
    const rank = (exerciseId: string) => position.get(exerciseId) ?? workout.exercises.length;
    const sets = [...workout.sets].sort(
      (a, b) => rank(a.exerciseId) - rank(b.exerciseId) || a.setIndex - b.setIndex,
    );

    for (const set of sets) {
      rows.push([
        date,
        number != null && number >= 1 ? String(number) : '',
        workout.title,
        nameById.get(set.exerciseId) ?? set.exerciseId,
        String(set.setIndex + 1),
        set.weightKg == null ? '' : csvWeight(set.weightKg, unitSystem),
        set.weightKg == null ? '' : unit,
        String(set.count),
        set.countUnit,
        set.loadMode,
        bool(set.isWarmup),
        set.restTakenSeconds == null ? '' : String(Math.round(set.restTakenSeconds)),
        set.rir == null ? '' : formatRir(set.rir),
        setKindOf(set),
      ]);
    }
  }
  return csvDocument(SET_COLUMNS, rows);
}

/**
 * `momentum-amounts-2026-10-09-0912` — sortable, and it says what it is.
 *
 * A different stem from the JSON backup's on purpose: a folder holding both must
 * not leave anybody guessing which one restores, and the backup's daily sweep
 * matches its own names exactly (`isBackupFileName` in `lib/autoBackup.ts`), so
 * it can never delete one of these. No extension: SAF appends `.csv` from the MIME type.
 */
export function csvBaseName(kind: 'amounts' | 'workouts', now: Date = new Date()): string {
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `momentum-${kind}-${dayKey(now)}-${time}`;
}
