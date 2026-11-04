/**
 * Trends — the window a chart is read through, and the point it plots.
 *
 * The charts that render the task log own no arithmetic; the series are built
 * in `lib/tasks.ts`, and this file holds the one control they share: how far
 * back to look, and whether that is drawn day by day or month by month.
 */

/** One point of a plotted series. */
export interface TrendPoint {
  /** ISO instant or day of the point, for the axis label. */
  at: string;
  value: number;
}

/* ------------------------------------------------------------------ */
/* The window a chart is read through                                  */
/* ------------------------------------------------------------------ */

/**
 * HOW FAR BACK A CHART LOOKS.
 *
 * The task log is per DAY — it has an entry for every day whether or not
 * anything happened — and "how am I doing" about it is genuinely a question
 * with a range on it: this week is a different question from this year, and
 * both are worth asking.
 *
 * Five steps rather than a date pair, because a from/to picker is a form, and
 * nobody opens a chart to fill in a form.
 */
export type TrendRange = 'week' | 'month' | 'quarter' | 'year' | 'all';

export const TREND_RANGES: readonly TrendRange[] = ['week', 'month', 'quarter', 'year', 'all'];

export const TREND_RANGE_LABELS: Record<TrendRange, string> = {
  week: 'Week',
  month: 'Month',
  quarter: '3 months',
  year: 'Year',
  all: 'All time',
};

/**
 * Days in a range, or null for `all` — which is bounded by the DATA instead, so
 * "all time" starts on the day the log did rather than at an arbitrary floor.
 */
export function rangeLength(range: TrendRange): number | null {
  switch (range) {
    case 'week':
      return 7;
    case 'month':
      return 30;
    case 'quarter':
      return 90;
    case 'year':
      return 365;
    case 'all':
      return null;
  }
}

/**
 * Whether a range is plotted DAY by day or MONTH by month.
 *
 * A year of daily points is 365 dots in a 342-pixel box — a smear, not a shape —
 * and the shape is the entire reason the chart exists. Past a quarter the honest
 * granularity is the month.
 */
export function bucketOf(range: TrendRange): 'day' | 'month' {
  return range === 'week' || range === 'month' || range === 'quarter' ? 'day' : 'month';
}
