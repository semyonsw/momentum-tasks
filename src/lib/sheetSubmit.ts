/**
 * WHAT THE RETURN KEY MAY SAVE — the task editor's name and `NumberSheet`'s value.
 *
 * The keyboard's ✓ ("done") used to close the keyboard and nothing else, so a
 * sheet whose whole job was one field still needed a reach past the keyboard to
 * `Save` — and in `NumberSheet` the keyboard covered it. Now return saves, under
 * the SAME rule as the button: these functions are the one definition both read,
 * so the key can never save something the button would have refused.
 *
 * An invalid value on return does nothing and keeps the keyboard up (the field
 * does not blur), rather than closing it on a value that cannot be saved — the
 * hint under the field already says why.
 */

import type { Weekday } from './tasks';

/**
 * The number a `NumberSheet` field holds, or null when it is not one `Save`
 * accepts. Digits only — a workout number has no sign, no decimal point and no
 * spaces; with `decimal`, one decimal place with either separator ("62,5" from
 * a Russian keyboard).
 */
export function sheetNumber(
  text: string,
  { min = 1, decimal = false }: { min?: number; decimal?: boolean } = {},
): number | null {
  const cleaned = text.trim().replace(',', '.');
  const pattern = decimal ? /^\d+(\.\d?)?$/ : /^\d+$/;
  if (!pattern.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed >= min ? parsed : null;
}

/**
 * Whether the task editor may save. A task with no name is not a task, and one
 * that asks on no day never asks. `pickedDays` is null unless the chips are the
 * schedule (`Pick days`).
 */
export function taskSavable(name: string, pickedDays: readonly Weekday[] | null): boolean {
  return name.trim() !== '' && (pickedDays === null || pickedDays.length > 0);
}
