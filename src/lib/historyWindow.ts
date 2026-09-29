/**
 * HOW MUCH OF THE TRAINING LOG IS ON SCREEN — the history list grows as it is
 * read rather than mounting every workout ever logged.
 *
 * The list used to render the whole log inside one `ScrollView`: a year of
 * training is ~150 cards, each with its own animated chevron and a handful of
 * closures, all built before the first frame and all re-rendered when one row
 * opened. The cost grew with the one thing the app is meant to accumulate.
 *
 * Why not a `FlatList`/`SectionList`? The screen scrolls to a tapped workout by
 * adding up three measured offsets (month, card, row — see `HistoryScreen`), and
 * a virtualised list unmounts exactly the rows that measurement needs. So the
 * list stays a plain scroll, and what changes is how much of it exists: whole
 * months, until at least `budget` workouts are mounted, growing by a page as the
 * reader nears the bottom. A month is never split, so its card is never drawn
 * half-full. A workout somebody asked to open (`mustInclude`) is always mounted,
 * however far back it is.
 */

/** Workouts mounted on first open — two screens' worth, comfortably. */
export const HISTORY_PAGE = 24;

/** Start growing when the bottom of the content is this close, in dp. */
export const HISTORY_GROW_AHEAD = 1200;

/**
 * How many month groups to render, given each month's number of workouts.
 *
 * At least one month (when there are any), whole months until `budget` rows are
 * covered, and never fewer than reach month `mustInclude` (−1 for none).
 */
export function monthsToRender(
  monthSizes: readonly number[],
  budget: number,
  mustInclude = -1,
): number {
  if (monthSizes.length === 0) return 0;
  let rows = 0;
  let count = 0;
  while (count < monthSizes.length && (count === 0 || rows < budget)) {
    rows += monthSizes[count];
    count += 1;
  }
  return Math.min(monthSizes.length, Math.max(count, mustInclude + 1));
}

/** The number of workouts in the first `months` month groups. */
export function rowsIn(monthSizes: readonly number[], months: number): number {
  let rows = 0;
  for (let i = 0; i < Math.min(months, monthSizes.length); i += 1) rows += monthSizes[i];
  return rows;
}

/** Whether a scroll position is close enough to the end to mount the next page. */
export function nearEnd(offsetY: number, viewportHeight: number, contentHeight: number): boolean {
  if (![offsetY, viewportHeight, contentHeight].every(Number.isFinite)) return false;
  return offsetY + viewportHeight >= contentHeight - HISTORY_GROW_AHEAD;
}
