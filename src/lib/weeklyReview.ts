/**
 * The weekly review (X3): last week, Monday to Sunday, across the three logs —
 * one figure and one plain sentence per log, on the landing.
 *
 *   LAST WEEK · 28 SEPTEMBER – 04 OCTOBER                    ✕
 *   Workouts          Tasks                  Spent
 *   3                 84%                    52,300
 *   One more than     Down 4 points. Steps   AMD. Food was 48%
 *   the week before.  slipped twice.         of it.
 *
 * ── HONEST SENTENCES, NOT TEMPLATES ───────────────────────────────────────
 *
 * Every clause is a fact the logs can stand behind, and a clause with nothing
 * behind it is DROPPED rather than filled (the house rule, as in `lib/home.ts`):
 *
 *  • A comparison needs a week before to compare with. For tasks that is a week
 *    that asked for something; for workouts it is a log that already existed
 *    then — a first week of training is not "3 more than the week before", it is
 *    the first week. Rejected: comparing with zero, which makes every new user's
 *    first review a triumph.
 *  • "Slipped" names the task left unanswered most often, and only at two or more:
 *    one unanswered day is a Tuesday, not a pattern worth a sentence. A day skipped
 *    on purpose is not a slip and is out of the percentage too — the same
 *    denominator `dayProgress` uses everywhere else, so the card cannot disagree
 *    with the Tasks screen.
 *  • Spent is expenses only, transfers out (the calendar's `isSpending`), on days
 *    of the week. A whole-month amount (rent) belongs to no week; counting it in
 *    the week of the 1st would make one week a month in four look ruinous.
 *  • A log with nothing in it last week has NO COLUMN, rather than a zero: a
 *    review that says "0 workouts" to somebody who only uses the money is a
 *    review about an app they did not ask for. All three empty → no card.
 *
 * ── WHEN IT IS SHOWN ──────────────────────────────────────────────────────
 *
 * From the Monday of a week until it is dismissed or the week ends — always about
 * the week before. Rejected: Monday only, which a person who opens the app on a
 * Tuesday never sees, and a week's card staying up until dismissed, which
 * outlives the week it is about. The dismissal is stored as the Monday of the
 * week it was dismissed in (`settings.weeklyReviewDismissed`), so it expires on
 * its own the next Monday and needs no clean-up.
 *
 * Days are local `YYYY-MM-DD` keys (`lib/days.ts`), so a week boundary is string
 * arithmetic on dates and a daylight-saving jump has nothing to move.
 */

import type { CompletedWorkout } from './completedWorkout';
import { dayKey, shiftDay, weekStart } from './days';
import { plural, t, type Language } from './i18n';
import { formatValue, formatWeek, type Amount, type MoneyCategory } from './money';
import { isSpending } from './moneyCalendar';
import { asksOn, dayProgress, entryOf, type Task, type TaskLog } from './tasks';

/** Monday to Sunday, inclusive. */
export interface ReviewWeek {
  from: string;
  to: string;
}

/** The week before the one `today` is in. */
export function reviewedWeek(today: string): ReviewWeek {
  const from = shiftDay(weekStart(today), -7);
  return { from, to: shiftDay(from, 6) };
}

const inWeek = (day: string, week: ReviewWeek) => day >= week.from && day <= week.to;

export interface WorkoutsReview {
  count: number;
  /** The week before's count, or null when the log did not exist yet. */
  previous: number | null;
}

export interface TasksReview {
  /** 0–100, done over asked (excused days out of both). */
  percent: number;
  /** The week before's percent, or null when it asked for nothing. */
  previous: number | null;
  /** The task left unanswered most often, at 2+ days; null otherwise. */
  slipped: { name: string; count: number } | null;
}

export interface SpentReview {
  /** In the money log's integers (see `lib/moneyUnits.ts`). */
  total: number;
  /** The dearest category and its share (0–1), or null if it can't be named. */
  top: { name: string; share: number } | null;
}

export interface WeeklyReview {
  week: ReviewWeek;
  workouts: WorkoutsReview | null;
  tasks: TasksReview | null;
  spent: SpentReview | null;
}

export interface WeeklyReviewInput {
  today: string;
  workouts: readonly CompletedWorkout[];
  tasks: readonly Task[];
  log: TaskLog;
  amounts: readonly Amount[];
  categories: readonly MoneyCategory[];
}

function workoutsIn(
  workouts: readonly CompletedWorkout[],
  week: ReviewWeek,
  before: ReviewWeek,
): WorkoutsReview | null {
  let count = 0;
  let previous = 0;
  let earliest: string | null = null;
  for (const workout of workouts) {
    const day = dayKey(workout.startedAt);
    if (day === '') continue;
    if (earliest === null || day < earliest) earliest = day;
    if (inWeek(day, week)) count += 1;
    else if (inWeek(day, before)) previous += 1;
  }
  // The log existed during the week before if anything predates the reviewed week.
  const hadLog = earliest !== null && earliest < week.from;
  if (count === 0 && (!hadLog || previous === 0)) return null;
  return { count, previous: hadLog ? previous : null };
}

function tasksIn(
  tasks: readonly Task[],
  log: TaskLog,
  week: ReviewWeek,
  before: ReviewWeek,
): TasksReview | null {
  const share = (range: ReviewWeek): number | null => {
    let done = 0;
    let asked = 0;
    for (let day = range.from; day <= range.to; day = shiftDay(day, 1)) {
      const progress = dayProgress(tasks, log, day);
      done += progress.done;
      asked += progress.total;
    }
    return asked === 0 ? null : Math.round((done / asked) * 100);
  };

  const percent = share(week);
  if (percent === null) return null;

  let slipped: TasksReview['slipped'] = null;
  const ordered = [...tasks].sort((a, b) => a.order - b.order);
  for (const task of ordered) {
    let count = 0;
    for (let day = week.from; day <= week.to; day = shiftDay(day, 1)) {
      if (asksOn(task, day) && entryOf(log, task.id, day).mark === null) count += 1;
    }
    // Strictly more, so a tie goes to the task higher in the list.
    if (count >= 2 && count > (slipped?.count ?? 0)) slipped = { name: task.name, count };
  }

  return { percent, previous: share(before), slipped };
}

function spentIn(
  amounts: readonly Amount[],
  categories: readonly MoneyCategory[],
  week: ReviewWeek,
): SpentReview | null {
  const byCategory = new Map<string, number>();
  let total = 0;
  for (const amount of amounts) {
    if (!isSpending(amount) || amount.when.kind !== 'day') continue;
    if (!inWeek(amount.when.date, week)) continue;
    total += amount.value;
    byCategory.set(amount.categoryId, (byCategory.get(amount.categoryId) ?? 0) + amount.value);
  }
  if (total <= 0) return null;

  let topId: string | null = null;
  let topValue = 0;
  for (const [id, value] of byCategory) {
    if (value > topValue) {
      topId = id;
      topValue = value;
    }
  }
  const name = categories.find((category) => category.id === topId)?.name;
  return { total, top: name ? { name, share: topValue / total } : null };
}

/** Last week across the three logs, or null when there is nothing to say at all. */
export function weeklyReview(input: WeeklyReviewInput): WeeklyReview | null {
  const week = reviewedWeek(input.today);
  const before = reviewedWeek(week.from);
  const review: WeeklyReview = {
    week,
    workouts: workoutsIn(input.workouts, week, before),
    tasks: tasksIn(input.tasks, input.log, week, before),
    spent: spentIn(input.amounts, input.categories, week),
  };
  return review.workouts || review.tasks || review.spent ? review : null;
}

/**
 * Is the card up today? From Monday until dismissed or the week ends: a
 * dismissal stamped with this week's Monday hides it; any other (last week's, or
 * none) does not.
 */
export function weeklyReviewShown(today: string, dismissed: string | undefined): boolean {
  return dismissed !== weekStart(today);
}

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

export interface ReviewColumn {
  key: 'workouts' | 'tasks' | 'spent';
  label: string;
  figure: string;
  /** The sentence under the figure; empty when every clause was dropped. */
  line: string;
}

function workoutsLine(review: WorkoutsReview, lang: Language): string {
  if (review.previous === null) return '';
  const diff = review.count - review.previous;
  if (diff === 0) return t('Same as the week before.', lang);
  if (diff === 1) return t('One more than the week before.', lang);
  if (diff === -1) return t('One fewer than the week before.', lang);
  return diff > 0
    ? t('{n} more than the week before.', lang, { n: diff })
    : t('{n} fewer than the week before.', lang, { n: -diff });
}

function tasksLine(review: TasksReview, lang: Language): string {
  const clauses: string[] = [];
  if (review.previous !== null) {
    const diff = review.percent - review.previous;
    const points = (n: number) =>
      plural(n, lang, {
        one: t('point', lang),
        few: 'пункта',
        many: t('points', lang),
      });
    if (diff === 0) clauses.push(t('Level with the week before.', lang));
    else if (diff > 0) clauses.push(t('Up {n} {points}.', lang, { n: diff, points: points(diff) }));
    else clauses.push(t('Down {n} {points}.', lang, { n: -diff, points: points(-diff) }));
  }
  if (review.slipped) {
    const { name, count } = review.slipped;
    clauses.push(
      count === 2
        ? t('{name} slipped twice.', lang, { name })
        : t('{name} slipped {n} {times}.', lang, {
            name,
            n: count,
            // Always 3+ here, so English is always `times`; Russian still has
            // раза (3, 4, 23…) and раз (5…20, 25…).
            times:
              lang === 'ru'
                ? plural(count, lang, { one: 'раз', few: 'раза', many: 'раз' })
                : 'times',
          }),
    );
  }
  return clauses.join(' ');
}

function spentLine(review: SpentReview, currency: string, lang: Language): string {
  const clauses = [`${currency}.`];
  if (review.top) {
    const percent = Math.round(review.top.share * 100);
    clauses.push(
      percent >= 100
        ? t('All of it on {category}.', lang, { category: review.top.name })
        : t('{category} was {percent}% of it.', lang, {
            category: review.top.name,
            percent,
          }),
    );
  }
  return clauses.join(' ');
}

/** The card's kicker: `Last week · 28 September – 04 October`. */
export function reviewKicker(review: WeeklyReview, lang: Language): string {
  return t('Last week · {range}', lang, { range: formatWeek(review.week.from, lang) });
}

/** The columns, in log order, with only the logs that had something. */
export function describeWeeklyReview(
  review: WeeklyReview,
  money: { currency: string; scale: number },
  lang: Language,
): ReviewColumn[] {
  const columns: ReviewColumn[] = [];
  if (review.workouts) {
    columns.push({
      key: 'workouts',
      label: t('Workouts', lang),
      figure: String(review.workouts.count),
      line: workoutsLine(review.workouts, lang),
    });
  }
  if (review.tasks) {
    columns.push({
      key: 'tasks',
      label: t('Tasks', lang),
      figure: `${review.tasks.percent}%`,
      line: tasksLine(review.tasks, lang),
    });
  }
  if (review.spent) {
    columns.push({
      key: 'spent',
      label: t('Spent', lang),
      figure: formatValue(review.spent.total, money.scale),
      line: spentLine(review.spent, money.currency, lang),
    });
  }
  return columns;
}
