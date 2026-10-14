/**
 * The pause sheet's calendar (T3): two taps pick a range, and which tasks it
 * covers.
 *
 * ── TWO TAPS, NOT TWO FIELDS ──────────────────────────────────────────────
 *
 * The first tap is the first day AND the last (a one-day pause is a real answer:
 * Saturday's wedding), and the second tap moves whichever end it lands beyond —
 * a tap before the first day becomes the new first day, a tap after it the last.
 * A third tap starts over. Rejected: a From and a To field each opening its own
 * date picker — four taps and two sheets for something the month grid shows in
 * one glance, and a To that can be set before its From.
 *
 * ── PAST DAYS CAN BE PICKED ───────────────────────────────────────────────
 *
 * The prototype greys out the days before today. Here they stay pickable, because
 * "I was away last week and never opened the app" is the same fact as a trip next
 * week, and the hold menu already lets you excuse a past day one at a time — a
 * pause over seven of them is that, in one action. It still never overwrites a
 * `done` (`excuseRange`). The window is a year either side of today, which is
 * where `PAUSE_MAX_DAYS` puts the ceiling anyway.
 *
 * ── "ALL TASKS" IS THE DEFAULT, AND IT MEANS THE LIVE ONES ─────────────────
 *
 * A vacation is from the list, not from one row — so the switch starts on, and
 * unticking it shows the rows to choose from. Archived tasks are never offered:
 * they ask on nothing from their archive day, so a pause has nothing to write.
 */

import { dayKey, formatShortDay, parseDay, shiftDay, weekdayIndex } from './days';
import { plural, t, type Language } from './i18n';
import { pauseLength, PAUSE_MAX_DAYS, type Task } from './tasks';
import type { ID } from '../types/models';

export interface PauseRange {
  from: string;
  to: string;
  /** The first tap has landed; the next one sets the other end. */
  open: boolean;
}

/** How far either side of today a pause can be picked. */
const PAUSE_WINDOW_DAYS = 365;

/** A tap on `day`. `null` = nothing picked yet. */
export function pickPauseDay(range: PauseRange | null, day: string): PauseRange {
  if (!range || !range.open) return { from: day, to: day, open: true };
  if (day < range.from) return { from: day, to: range.to, open: false };
  return { from: range.from, to: day, open: false };
}

/** Whether a day can be tapped at all: within a year of today. */
export function pausePickable(day: string, today: string): boolean {
  return day >= shiftDay(today, -PAUSE_WINDOW_DAYS) && day <= shiftDay(today, PAUSE_WINDOW_DAYS);
}

/** The number on the button: calendar days in the range, capped where `excuseRange` stops. */
export function pauseDays(range: PauseRange | null): number {
  if (!range) return 0;
  return Math.min(PAUSE_MAX_DAYS, pauseLength(range.from, range.to));
}

/** The live tasks a pause offers, in list order. */
export function pausableTasks(tasks: readonly Task[]): Task[] {
  return tasks.filter((task) => task.archivedAt === null).sort((a, b) => a.order - b.order);
}

/** What the CTA pauses: every live task, or the ticked ones that are still live. */
export function pauseTargets(tasks: readonly Task[], all: boolean, picked: readonly ID[]): ID[] {
  const live = pausableTasks(tasks);
  if (all) return live.map((task) => task.id);
  const chosen = new Set(picked);
  return live.filter((task) => chosen.has(task.id)).map((task) => task.id);
}

/** Can the CTA act: a range is picked and something is chosen. */
export function canPause(range: PauseRange | null, targets: readonly ID[]): boolean {
  return range !== null && targets.length > 0;
}

export interface PauseCell {
  day: number;
  date: string;
  /** Between the ends, ends included. */
  inRange: boolean;
  /** The first or last day: filled, the rest of the range tinted. */
  edge: boolean;
  pickable: boolean;
  isToday: boolean;
}

/** One month for the sheet, Monday first, padded at the start only (`null`s). */
export function pauseMonth(
  year: number,
  month: number,
  range: PauseRange | null,
  today: string,
): (PauseCell | null)[][] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lead = weekdayIndex(new Date(year, month, 1));
  const cells: (PauseCell | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = dayKey(new Date(year, month, day));
    const inRange = range !== null && date >= range.from && date <= range.to;
    cells.push({
      day,
      date,
      inRange,
      edge: range !== null && (date === range.from || date === range.to),
      pickable: pausePickable(date, today),
      isToday: date === today,
    });
  }
  const weeks: (PauseCell | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/**
 * The green line over the calendar: `12 – 18 October · 7 days`, the month said
 * once when both ends share it. `null` before the first tap.
 */
export function describePauseRange(range: PauseRange | null, lang: Language = 'en'): string | null {
  if (!range) return null;
  const n = pauseDays(range);
  const days = `${n} ${plural(n, lang, { one: t('day', lang), few: 'дня', many: t('days', lang) })}`;
  const from = parseDay(range.from);
  const to = parseDay(range.to);
  if (!from || !to) return null;
  if (range.from === range.to) return `${formatShortDay(range.to, lang)} · ${days}`;
  const sameMonth = from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth();
  const first = sameMonth ? String(from.getDate()) : formatShortDay(range.from, lang);
  return `${first} – ${formatShortDay(range.to, lang)} · ${days}`;
}
