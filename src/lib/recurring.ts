/**
 * Recurring payments (M2): rent, a gym membership, a phone plan — money that
 * leaves on a schedule, and the app asking about it on the day instead of the
 * user having to remember.
 *
 *   ┌ DUE TODAY ─────────────────────────────────────────┐
 *   │ 🏠 Rent · 150,000 AMD                               │
 *   │ Cash · monthly on the 5th · counts for October      │
 *   │ [ Confirm ]  ( Skip this month )                    │
 *   └─────────────────────────────────────────────────────┘
 *
 * ── CONFIRM, NEVER AUTO-CREATE ────────────────────────────────────────────
 *
 * A payment that records itself is a payment the user did not make being
 * written into their log: the rent that was late, the subscription cancelled
 * last week. So nothing here writes an amount on its own. On the due day a card
 * asks; `Confirm` records the amount ON THE DUE DATE, on the payment's account
 * and category; `Skip` records that this one was skipped. Either answer is
 * remembered and the card goes.
 *
 * REJECTED: auto-create with an undo. It is what a bank does, and a bank knows
 * the money moved. This app only knows a date.
 *
 * ── CATCH-UP: EVERY MISSED ONE, OLDEST FIRST ──────────────────────────────
 *
 * Open the app after three weeks away and each occurrence that came and went
 * unanswered is listed as due, oldest first — still a question, never filled in
 * silently. How far back that goes is capped (`CATCH_UP_DAYS`, a little over a
 * year), so a schedule left alone for years cannot bury the screen.
 *
 * ── ONE ANSWER PER PERIOD: THE OCCURRENCE KEY ─────────────────────────────
 *
 * An occurrence is identified by its PERIOD, not its date: `M:2026-10` for a
 * monthly payment, `W:2026-10-05` (the ISO week's Monday) for a weekly one,
 * `Y:2026` for a yearly one. The answer is stored under that key and the amount
 * a confirm writes is named after it (`amt_rec_<id>_<period>`), so:
 *   • a double tap, or the card rendered twice by a double launch, writes ONE
 *     amount — the second confirm finds the period answered and does nothing;
 *   • moving rent from the 5th to the 10th after confirming October's does not
 *     ask about October again — October is answered, whichever day it fell on.
 * Changing the KIND of schedule (monthly → weekly) changes the keys, so an edit
 * also moves the start past the last answered occurrence (`rescheduledStart`):
 * nothing already confirmed can come back as due under the new rule.
 *
 * ── THE 31ST ──────────────────────────────────────────────────────────────
 *
 * "Monthly on the 31st" falls on the LAST day of a shorter month — 28 or 29
 * February, 30 April — rather than skipping it or rolling into the next. Rent
 * due at the end of the month is due at the end of February too. A yearly
 * payment on 29 February falls on the 28th in other years, by the same rule.
 *
 * ── A WHOLE-MONTH AMOUNT ──────────────────────────────────────────────────
 *
 * Rent is FOR a month more than it is ON a day, and the app already has the
 * shape for that (`lib/money.ts`). A monthly payment may say so (`wholeMonth`),
 * and its confirm then writes a whole-month amount for the occurrence's month;
 * otherwise it writes a day amount on the due date. Weekly and yearly payments
 * have no month to be for, so they are always on their day.
 */

import {
  daysBetween,
  formatMonth,
  formatShortDay,
  parseDay,
  shiftDay,
  weekStart,
  weekdayIndex,
  weekdayNames,
} from './days';
import { t, type Language } from './i18n';
import { formatMoney, type AmountWhen, type Direction } from './money';
import type { ID } from '../types/models';

export type RecurringSchedule =
  /** On day `day` (1–31) of every month — the last day of a shorter one. */
  | { kind: 'monthly'; day: number }
  /** Every week on `weekday`, Monday = 0 … Sunday = 6 (`weekdayIndex`). */
  | { kind: 'weekly'; weekday: number }
  /** Every year on `day` of `month` (0-based, as `Date` uses it). */
  | { kind: 'yearly'; month: number; day: number };

export type ScheduleKind = RecurringSchedule['kind'];

export type OccurrenceStatus = 'paid' | 'skipped';

/** An answered occurrence, stored under its period key. */
export interface HandledOccurrence {
  status: OccurrenceStatus;
  /** The due date it was answered for. */
  date: string;
  /** The amount a confirm wrote — what an Undo takes back out. */
  amountId?: ID;
}

export interface RecurringPayment {
  id: ID;
  /** What the user calls it. Empty falls back to the category's name. */
  name: string;
  categoryId: ID;
  accountId: ID;
  /** The category's side: a recurring income (a salary) is allowed too. */
  direction: Direction;
  /** In the log's units, always positive. */
  value: number;
  schedule: RecurringSchedule;
  /** Monthly only: a confirm writes a whole-month amount (see the header). */
  wholeMonth?: true;
  /** The first day an occurrence can fall on. */
  startsOn: string;
  note: string;
  /** Period key → the answer. See the header. */
  handled: Record<string, HandledOccurrence>;
  createdAt: string;
}

/** What the editor hands the store; the rest is the store's to fill in. */
export interface RecurringDraft {
  name: string;
  categoryId: ID;
  accountId: ID;
  value: number;
  schedule: RecurringSchedule;
  wholeMonth: boolean;
}

/** How far back a missed occurrence is still asked about. */
export const CATCH_UP_DAYS = 400;

/** How far ahead `nextOccurrence` looks — a yearly payment and then some. */
const LOOK_AHEAD_DAYS = 800;

export function daysIn(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function dateOf(year: number, month: number, day: number): string {
  const clamped = Math.min(day, daysIn(year, month));
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`;
}

/** The occurrence's key — what is answered, once (see the header). */
export function periodOf(schedule: RecurringSchedule, date: string): string {
  if (schedule.kind === 'weekly') return `W:${weekStart(date)}`;
  if (schedule.kind === 'yearly') return `Y:${date.slice(0, 4)}`;
  return `M:${date.slice(0, 7)}`;
}

/** The amount a confirm writes, named for its occurrence so it can only exist once. */
export function occurrenceAmountId(itemId: ID, period: string): ID {
  return `amt_rec_${itemId}_${period.replace(/[^\w-]/g, '')}`;
}

/** Every date the schedule falls on in `[from, to]`, oldest first. */
export function occurrencesBetween(
  schedule: RecurringSchedule,
  from: string,
  to: string,
): string[] {
  const start = parseDay(from);
  const end = parseDay(to);
  if (!start || !end || from > to) return [];
  const out: string[] = [];
  if (schedule.kind === 'weekly') {
    const lead = (schedule.weekday - weekdayIndex(start) + 7) % 7;
    for (let day = shiftDay(from, lead); day <= to; day = shiftDay(day, 7)) out.push(day);
    return out;
  }
  if (schedule.kind === 'yearly') {
    for (let year = start.getFullYear(); year <= end.getFullYear(); year += 1) {
      const date = dateOf(year, schedule.month, schedule.day);
      if (date >= from && date <= to) out.push(date);
    }
    return out;
  }
  let year = start.getFullYear();
  let month = start.getMonth();
  while (year < end.getFullYear() || (year === end.getFullYear() && month <= end.getMonth())) {
    const date = dateOf(year, month, schedule.day);
    if (date >= from && date <= to) out.push(date);
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return out;
}

/** Is `date` a day this schedule falls on? */
export function isOccurrence(schedule: RecurringSchedule, date: string): boolean {
  return occurrencesBetween(schedule, date, date).length === 1;
}

export interface DueOccurrence {
  item: RecurringPayment;
  date: string;
  period: string;
}

/**
 * The occurrences of one payment that are due and unanswered — today's, and
 * every one missed since it started (capped at `CATCH_UP_DAYS`), oldest first.
 */
export function dueOccurrences(item: RecurringPayment, today: string): DueOccurrence[] {
  const floor = shiftDay(today, -CATCH_UP_DAYS);
  const from = item.startsOn > floor ? item.startsOn : floor;
  return occurrencesBetween(item.schedule, from, today)
    .map((date) => ({ item, date, period: periodOf(item.schedule, date) }))
    .filter((occurrence) => !(occurrence.period in item.handled));
}

/** Every payment's due occurrences, oldest first; one day's ties in list order. */
export function dueList(items: readonly RecurringPayment[], today: string): DueOccurrence[] {
  return items
    .flatMap((item, index) => dueOccurrences(item, today).map((due) => ({ due, index })))
    .sort((a, b) =>
      a.due.date === b.due.date ? a.index - b.index : a.due.date < b.due.date ? -1 : 1,
    )
    .map(({ due }) => due);
}

/**
 * The date a payment's row shows: the oldest unanswered one if any is due,
 * otherwise the next one after today that has not been answered ahead.
 */
export function nextOccurrence(item: RecurringPayment, today: string): string | null {
  const due = dueOccurrences(item, today);
  if (due.length > 0) return due[0].date;
  const from = item.startsOn > today ? item.startsOn : shiftDay(today, 1);
  for (const date of occurrencesBetween(item.schedule, from, shiftDay(today, LOOK_AHEAD_DAYS))) {
    if (!(periodOf(item.schedule, date) in item.handled)) return date;
  }
  return null;
}

/**
 * Unanswered occurrences in `[item.startsOn, to]` — what is still to come out
 * (or in) by `to`, overdue ones included. The forecast's "planned" (M3).
 */
export function unansweredThrough(item: RecurringPayment, today: string, to: string): string[] {
  const overdue = dueOccurrences(item, today).map((due) => due.date);
  const ahead = occurrencesBetween(item.schedule, shiftDay(today, 1), to).filter(
    (date) => date >= item.startsOn && !(periodOf(item.schedule, date) in item.handled),
  );
  return [...overdue, ...ahead];
}

/** The `when` a confirm writes (see the header). */
export function amountWhenFor(item: RecurringPayment, date: string): AmountWhen {
  if (item.wholeMonth && item.schedule.kind === 'monthly') {
    return { kind: 'month', year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) - 1 };
  }
  return { kind: 'day', date };
}

function sameSchedule(a: RecurringSchedule, b: RecurringSchedule): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Where an EDITED payment starts. Unchanged schedule: where it did. A changed
 * one: no earlier than the day after the last answered occurrence, so the new
 * rule can never re-ask about money already confirmed or skipped under the old.
 */
export function rescheduledStart(item: RecurringPayment, schedule: RecurringSchedule): string {
  if (sameSchedule(item.schedule, schedule)) return item.startsOn;
  const last = Object.values(item.handled)
    .map((entry) => entry.date)
    .sort()
    .pop();
  if (!last) return item.startsOn;
  const after = shiftDay(last, 1);
  return after > item.startsOn ? after : item.startsOn;
}

/** A schedule as the editor clamps it: whole numbers in range. */
export function cleanSchedule(raw: unknown): RecurringSchedule | null {
  const value = raw as Partial<{ kind: string; day: number; weekday: number; month: number }>;
  if (!value || typeof value !== 'object') return null;
  const whole = (n: unknown, lo: number, hi: number) =>
    typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi;
  if (value.kind === 'monthly' && whole(value.day, 1, 31)) {
    return { kind: 'monthly', day: value.day as number };
  }
  if (value.kind === 'weekly' && whole(value.weekday, 0, 6)) {
    return { kind: 'weekly', weekday: value.weekday as number };
  }
  if (value.kind === 'yearly' && whole(value.month, 0, 11) && whole(value.day, 1, 31)) {
    return { kind: 'yearly', month: value.month as number, day: value.day as number };
  }
  return null;
}

/** A sensible schedule of a new kind, starting from a date (the editor's switch). */
export function scheduleOfKind(kind: ScheduleKind, from: string): RecurringSchedule {
  const date = parseDay(from) ?? new Date();
  if (kind === 'weekly') return { kind, weekday: weekdayIndex(date) };
  if (kind === 'yearly') return { kind, month: date.getMonth(), day: date.getDate() };
  return { kind: 'monthly', day: date.getDate() };
}

/* ------------------------------------------------------------------ */
/* The store's validator                                               */
/* ------------------------------------------------------------------ */

function sanitizeHandled(raw: unknown): Record<string, HandledOccurrence> {
  const out: Record<string, HandledOccurrence> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [period, entry] of Object.entries(raw as Record<string, unknown>)) {
    const value = entry as Partial<HandledOccurrence> | undefined;
    if (!/^[MWY]:\d{4}(-\d{2}(-\d{2})?)?$/.test(period) || !value) continue;
    if (value.status !== 'paid' && value.status !== 'skipped') continue;
    if (typeof value.date !== 'string' || !parseDay(value.date)) continue;
    out[period] = {
      status: value.status,
      date: value.date,
      ...(typeof value.amountId === 'string' && value.amountId !== ''
        ? { amountId: value.amountId }
        : {}),
    };
  }
  return out;
}

/**
 * Total over whatever a backup holds. A payment needs a known category (it
 * takes the category's side), a positive whole value, a schedule and a real
 * start; an unknown account falls back like an amount's does.
 */
export function sanitizeRecurring(
  raw: unknown,
  directions: ReadonlyMap<ID, Direction>,
  accounts: ReadonlySet<ID>,
  fallbackAccount: ID,
): RecurringPayment[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<ID>();
  const out: RecurringPayment[] = [];
  for (const entry of raw) {
    const value = entry as Partial<RecurringPayment> | undefined;
    if (!value || typeof value.id !== 'string' || value.id === '' || seen.has(value.id)) continue;
    if (typeof value.categoryId !== 'string') continue;
    const direction = directions.get(value.categoryId);
    if (!direction) continue;
    const amount = Math.round(Math.abs(Number(value.value)));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const schedule = cleanSchedule(value.schedule);
    if (!schedule) continue;
    if (typeof value.startsOn !== 'string' || !parseDay(value.startsOn)) continue;
    seen.add(value.id);
    out.push({
      id: value.id,
      name: typeof value.name === 'string' ? value.name.trim() : '',
      categoryId: value.categoryId,
      accountId:
        typeof value.accountId === 'string' && accounts.has(value.accountId)
          ? value.accountId
          : fallbackAccount,
      direction,
      value: amount,
      schedule,
      ...(value.wholeMonth === true && schedule.kind === 'monthly'
        ? { wholeMonth: true as const }
        : {}),
      startsOn: value.startsOn,
      note: typeof value.note === 'string' ? value.note : '',
      handled: sanitizeHandled(value.handled),
      createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date(0).toISOString(),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

/** `1st`, `2nd`, `3rd`, `11th`, `22nd` — English only; Russian says `5-го`. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

/** `Monthly on the 5th` · `Weekly on Monday` · `Yearly on 3 March`. */
export function describeSchedule(schedule: RecurringSchedule, lang: Language = 'en'): string {
  if (schedule.kind === 'weekly') {
    const name = weekdayNames(lang)[schedule.weekday];
    return t('Weekly on {weekday}', lang, { weekday: lang === 'ru' ? name.toLowerCase() : name });
  }
  if (schedule.kind === 'yearly') {
    // A leap-year date, so 29 February can be named; it falls on the 28th otherwise.
    const date = formatShortDay(
      `2028-${String(schedule.month + 1).padStart(2, '0')}-${String(schedule.day).padStart(2, '0')}`,
      lang,
    );
    return t('Yearly on {date}', lang, { date });
  }
  return lang === 'ru'
    ? t('Monthly on the {day}', lang, { day: `${schedule.day}-го` })
    : t('Monthly on the {day}', lang, { day: ordinal(schedule.day) });
}

/** The skip button: `Skip this month` / `Skip this week` / `Skip this year`. */
export function skipLabel(schedule: RecurringSchedule, lang: Language = 'en'): string {
  if (schedule.kind === 'weekly') return t('Skip this week', lang);
  if (schedule.kind === 'yearly') return t('Skip this year', lang);
  return t('Skip this month', lang);
}

/** `counts for October` — said only for a whole-month payment. */
export function countsFor(
  item: RecurringPayment,
  date: string,
  lang: Language = 'en',
): string | null {
  if (!(item.wholeMonth && item.schedule.kind === 'monthly')) return null;
  const month = formatMonth(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, lang).replace(
    / \d+$/,
    '',
  );
  return t('counts for {month}', lang, { month: lang === 'ru' ? month.toLowerCase() : month });
}

/** `Due today`, or `Due 5 Oct` for one the user is catching up on. */
export function dueWord(date: string, today: string, lang: Language = 'en'): string {
  if (date === today) return t('Due today', lang);
  return t('Due {date}', lang, { date: formatShortDay(date, lang) });
}

/** The row's right-hand date: `Due today`, `Due 5 October`, or plainly `1 November`. */
export function nextWord(date: string | null, today: string, lang: Language = 'en'): string {
  if (date === null) return '';
  if (date <= today) return dueWord(date, today, lang);
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return sameYear
    ? formatShortDay(date, lang)
    : `${formatShortDay(date, lang)} ${date.slice(0, 4)}`;
}

/**
 * What the list adds up to, per period — `246,900 AMD a month, plus 64,000 AMD a
 * year`. Outgoing payments only; each kind stated as itself, never converted
 * (a weekly payment times 4.33 is a guessed number).
 */
export function describeTotals(
  items: readonly RecurringPayment[],
  currency: string,
  scale: number,
  lang: Language = 'en',
): string {
  const sums = { monthly: 0, weekly: 0, yearly: 0 };
  for (const item of items) {
    if (item.direction !== 'expense') continue;
    sums[item.schedule.kind] += item.value;
  }
  const parts: string[] = [];
  if (sums.monthly > 0)
    parts.push(t('{amount} a month', lang, { amount: formatMoney(sums.monthly, currency, scale) }));
  if (sums.weekly > 0)
    parts.push(t('{amount} a week', lang, { amount: formatMoney(sums.weekly, currency, scale) }));
  if (sums.yearly > 0)
    parts.push(t('{amount} a year', lang, { amount: formatMoney(sums.yearly, currency, scale) }));
  return parts.join(' · ');
}

/** Days from today to a date — the forecast and the row both lean on it. */
export function daysUntil(today: string, date: string): number {
  return daysBetween(today, date);
}
