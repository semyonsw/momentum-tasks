/**
 * Insights (X2): what the three logs say about EACH OTHER — the one thing an app
 * with a training log, a task list and a money log in one place can answer that
 * none of them can alone.
 *
 *   On training days you finish more of your tasks: 82% vs 61% on rest days.
 *   Training days  ████████████████████░░░  82%
 *   Rest days      ██████████████░░░░░░░░░  61%
 *   based on 41 training days and 47 rest days
 *
 * ── THE FOUR COMPARISONS ───────────────────────────────────────────────────
 *
 *  1. Tasks done % on training days vs rest days.
 *  2. Spending per day on weekends vs weekdays.
 *  3. Tasks done % in weeks with 3+ workouts vs weeks with fewer.
 *  4. Spending per day on training days vs rest days.
 *
 * Rejected for now: the design's "bench sets after 20:00" (a per-exercise,
 * per-hour cut has samples of a dozen sets — below any honest threshold for most
 * people) and per-category spending (one category splits a small sample again).
 *
 * ── WHEN ONE IS SHOWN (the honesty rules) ──────────────────────────────────
 *
 *  • A MINIMUM SAMPLE in EACH group: 14 days for a day comparison, 4 weeks for a
 *    week comparison. Below that a difference is mostly which Tuesday it was.
 *  • A MINIMUM EFFECT: 10 percentage points for task completion; 20% relative
 *    for money (measured against the comparison group: weekends against
 *    weekdays, training days against rest days). Smaller gaps are true, but they
 *    are not worth a card.
 *  • ONLY WHILE BOTH LOGS EXISTED. A day before the first workout is not a "rest
 *    day", it is a day the training log did not exist; a day before the first
 *    amount is not a day of zero spending. Each comparison starts at the later
 *    of the two logs' first days.
 *  • THE WINDOW is the last 26 weeks (182 days) ending YESTERDAY — today is not
 *    over — and only whole Mon–Sun weeks inside it for the week comparison.
 *  • TASK DENOMINATORS are `dayProgress`'s: a day excused on purpose (or paused)
 *    is out of both done and asked, and a day that asked nothing is not a sample.
 *    Percentages are POOLED (all done ÷ all asked in the group), as the weekly
 *    review pools a week, so a day with one task does not weigh as much as a day
 *    with nine.
 *  • SPENDING is the money calendar's `isSpending` on day amounts: transfers,
 *    incomes and whole-month amounts (rent belongs to no single day) are out. A
 *    day with nothing spent is a real 0 while the money log exists.
 *  • NO DIVISION BY ZERO: a group with no days, no asked tasks, or a comparison
 *    group that spent nothing at all has no relative figure, so no card.
 *
 * Correlation, not cause — the screen says so above the cards, and every card
 * states its sample under its bars.
 */

import type { CompletedWorkout } from './completedWorkout';
import { dayKey, parseDay, shiftDay, weekdayIndex, weekStart } from './days';
import { plural, t, type Language } from './i18n';
import { formatMoney, type Amount } from './money';
import { isSpending } from './moneyCalendar';
import { dayProgress, type Task, type TaskLog } from './tasks';

export const INSIGHT_WINDOW_DAYS = 182;
export const MIN_DAYS_PER_GROUP = 14;
export const MIN_WEEKS_PER_GROUP = 4;
/** Task completion: percentage points between the two groups. */
export const MIN_POINTS = 10;
/** Money: relative difference against the comparison group. */
export const MIN_RELATIVE = 0.2;
/** A "busy" week for comparison 3. */
export const BUSY_WEEK_WORKOUTS = 3;

export type InsightId =
  'tasksOnTrainingDays' | 'spendOnWeekends' | 'tasksInBusyWeeks' | 'spendOnTrainingDays';

export interface InsightGroup {
  /** Tasks: 0–100 (pooled). Money: average per day, in the log's stored units. */
  value: number;
  /** Days, or weeks for `tasksInBusyWeeks`. */
  n: number;
}

export interface Insight {
  id: InsightId;
  kind: 'tasks' | 'money';
  /** The subject group: training days, weekends, busy weeks, training days. */
  a: InsightGroup;
  /** The comparison group. */
  b: InsightGroup;
  direction: 'more' | 'less';
  /** Tasks: whole percentage points. Money: whole percent of `b`. */
  effect: number;
}

export interface InsightsInput {
  today: string;
  workouts: readonly CompletedWorkout[];
  tasks: readonly Task[];
  log: TaskLog;
  amounts: readonly Amount[];
}

/* ------------------------------------------------------------------ */

interface Tally {
  done: number;
  asked: number;
  n: number;
}
const emptyTally = (): Tally => ({ done: 0, asked: 0, n: 0 });

/** Pooled %, or null for a group with nothing asked. */
const percentOf = (tally: Tally): number | null =>
  tally.asked > 0 ? (tally.done / tally.asked) * 100 : null;

interface SpendTally {
  total: number;
  n: number;
}

function tasksComparison(id: InsightId, a: Tally, b: Tally, minN: number): Insight | null {
  if (a.n < minN || b.n < minN) return null;
  const pa = percentOf(a);
  const pb = percentOf(b);
  if (pa === null || pb === null) return null;
  const ra = Math.round(pa);
  const rb = Math.round(pb);
  const effect = Math.abs(ra - rb);
  if (effect < MIN_POINTS) return null;
  return {
    id,
    kind: 'tasks',
    a: { value: ra, n: a.n },
    b: { value: rb, n: b.n },
    direction: ra > rb ? 'more' : 'less',
    effect,
  };
}

function moneyComparison(id: InsightId, a: SpendTally, b: SpendTally): Insight | null {
  if (a.n < MIN_DAYS_PER_GROUP || b.n < MIN_DAYS_PER_GROUP) return null;
  const avgA = a.total / a.n;
  const avgB = b.total / b.n;
  // The comparison group is the denominator: nothing spent there, no relative figure.
  if (!(avgB > 0)) return null;
  const relative = (avgA - avgB) / avgB;
  const effect = Math.round(Math.abs(relative) * 100);
  if (Math.abs(relative) < MIN_RELATIVE) return null;
  return {
    id,
    kind: 'money',
    a: { value: Math.round(avgA), n: a.n },
    b: { value: Math.round(avgB), n: b.n },
    direction: relative > 0 ? 'more' : 'less',
    effect,
  };
}

/**
 * The comparisons that pass both thresholds, in a fixed order (the two task
 * comparisons, then the two money ones). Empty when nothing does — the empty state.
 */
export function insights(input: InsightsInput): Insight[] {
  const last = shiftDay(input.today, -1);
  const windowStart = shiftDay(input.today, -INSIGHT_WINDOW_DAYS);

  // Training days, and when the training log began.
  const trained = new Map<string, number>();
  let firstWorkout: string | null = null;
  for (const workout of input.workouts) {
    const day = dayKey(workout.startedAt);
    if (day === '') continue;
    trained.set(day, (trained.get(day) ?? 0) + 1);
    if (firstWorkout === null || day < firstWorkout) firstWorkout = day;
  }

  // Spending per day, and when the money log began (any day amount at all).
  const spent = new Map<string, number>();
  let firstMoney: string | null = null;
  for (const amount of input.amounts) {
    if (amount.when.kind !== 'day' || !parseDay(amount.when.date)) continue;
    const day = amount.when.date;
    if (firstMoney === null || day < firstMoney) firstMoney = day;
    if (isSpending(amount)) spent.set(day, (spent.get(day) ?? 0) + amount.value);
  }

  const maxDay = (...days: (string | null)[]): string | null =>
    days.some((d) => d === null) ? null : (days as string[]).reduce((a, b) => (a > b ? a : b));

  const out: Insight[] = [];

  // 1 · tasks on training days vs rest days.
  const from1 = maxDay(windowStart, firstWorkout);
  if (from1 !== null) {
    const onTraining = emptyTally();
    const onRest = emptyTally();
    for (let day = from1; day <= last; day = shiftDay(day, 1)) {
      const progress = dayProgress(input.tasks, input.log, day);
      if (progress.total === 0) continue;
      const group = trained.has(day) ? onTraining : onRest;
      group.done += progress.done;
      group.asked += progress.total;
      group.n += 1;
    }
    const found = tasksComparison('tasksOnTrainingDays', onTraining, onRest, MIN_DAYS_PER_GROUP);
    if (found) out.push(found);
  }

  // 3 · tasks in weeks with 3+ workouts vs fewer: whole weeks inside the window.
  if (firstWorkout !== null) {
    const busy = emptyTally();
    const quiet = emptyTally();
    // The first WHOLE week inside the window during which the training log existed.
    const start = maxDay(windowStart, firstWorkout) as string;
    let monday = weekStart(start);
    if (monday < start) monday = shiftDay(monday, 7);
    for (; shiftDay(monday, 6) <= last; monday = shiftDay(monday, 7)) {
      const week = emptyTally();
      let workouts = 0;
      for (let i = 0; i < 7; i += 1) {
        const day = shiftDay(monday, i);
        workouts += trained.get(day) ?? 0;
        const progress = dayProgress(input.tasks, input.log, day);
        week.done += progress.done;
        week.asked += progress.total;
      }
      if (week.asked === 0) continue;
      const group = workouts >= BUSY_WEEK_WORKOUTS ? busy : quiet;
      group.done += week.done;
      group.asked += week.asked;
      group.n += 1;
    }
    const found = tasksComparison('tasksInBusyWeeks', busy, quiet, MIN_WEEKS_PER_GROUP);
    if (found) out.push(found);
  }

  // 4 · spending on training days vs rest days.
  const from4 = maxDay(windowStart, firstWorkout, firstMoney);
  if (from4 !== null) {
    const onTraining: SpendTally = { total: 0, n: 0 };
    const onRest: SpendTally = { total: 0, n: 0 };
    for (let day = from4; day <= last; day = shiftDay(day, 1)) {
      const group = trained.has(day) ? onTraining : onRest;
      group.total += spent.get(day) ?? 0;
      group.n += 1;
    }
    const found = moneyComparison('spendOnTrainingDays', onTraining, onRest);
    if (found) out.push(found);
  }

  // 2 · spending on weekends vs weekdays.
  const from2 = maxDay(windowStart, firstMoney);
  if (from2 !== null) {
    const weekend: SpendTally = { total: 0, n: 0 };
    const weekday: SpendTally = { total: 0, n: 0 };
    for (let day = from2; day <= last; day = shiftDay(day, 1)) {
      const date = parseDay(day);
      if (!date) continue;
      const group = weekdayIndex(date) >= 5 ? weekend : weekday;
      group.total += spent.get(day) ?? 0;
      group.n += 1;
    }
    const found = moneyComparison('spendOnWeekends', weekend, weekday);
    if (found) out.push(found);
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

export interface InsightCard {
  title: string;
  aLabel: string;
  bLabel: string;
  aText: string;
  bText: string;
  /** 0–1 bar widths: tasks against 100%, money against the larger of the two. */
  aBar: number;
  bBar: number;
  /** "based on 41 training days and 47 rest days" */
  sample: string;
}

/** A counted noun in both languages: "41 training days" / "41 тренировочный день". */
function counted(n: number, lang: Language, one: string, many: string, ruFew: string): string {
  return t(plural(n, lang, { one, few: ruFew, many }), lang, { n });
}

const trainingDays = (n: number, lang: Language) =>
  counted(n, lang, '{n} training day', '{n} training days', '{n} тренировочных дня');
const restDays = (n: number, lang: Language) =>
  counted(n, lang, '{n} rest day', '{n} rest days', '{n} дня отдыха');
const weekendDays = (n: number, lang: Language) =>
  counted(n, lang, '{n} weekend day', '{n} weekend days', '{n} выходных дня');
const weekdays = (n: number, lang: Language) =>
  counted(n, lang, '{n} weekday', '{n} weekdays', '{n} будних дня');
const weeks = (n: number, lang: Language) =>
  `${n} ${plural(n, lang, { one: t('week', lang), few: 'недели', many: t('weeks', lang) })}`;

export function describeInsight(
  insight: Insight,
  money: { currency: string; scale: number },
  lang: Language = 'en',
): InsightCard {
  const more = insight.direction === 'more';
  const pct = (v: number) => `${v}%`;
  const cash = (v: number) => formatMoney(v, money.currency, money.scale);
  const max = Math.max(insight.a.value, insight.b.value);
  const bars =
    insight.kind === 'tasks'
      ? { aBar: insight.a.value / 100, bBar: insight.b.value / 100 }
      : { aBar: max > 0 ? insight.a.value / max : 0, bBar: max > 0 ? insight.b.value / max : 0 };
  const vars = {
    a: insight.kind === 'tasks' ? pct(insight.a.value) : cash(insight.a.value),
    b: insight.kind === 'tasks' ? pct(insight.b.value) : cash(insight.b.value),
    effect: insight.effect,
  };

  switch (insight.id) {
    case 'tasksOnTrainingDays':
      return {
        title: more
          ? t(
              'On training days you finish more of your tasks: {a} vs {b} on rest days.',
              lang,
              vars,
            )
          : t(
              'On training days you finish fewer of your tasks: {a} vs {b} on rest days.',
              lang,
              vars,
            ),
        aLabel: t('Training days', lang),
        bLabel: t('Rest days', lang),
        aText: vars.a,
        bText: vars.b,
        ...bars,
        sample: t('based on {a} and {b}', lang, {
          a: trainingDays(insight.a.n, lang),
          b: restDays(insight.b.n, lang),
        }),
      };
    case 'tasksInBusyWeeks':
      return {
        title: more
          ? t(
              'In weeks with 3+ workouts you finish more of your tasks: {a} vs {b} in weeks with fewer.',
              lang,
              vars,
            )
          : t(
              'In weeks with 3+ workouts you finish fewer of your tasks: {a} vs {b} in weeks with fewer.',
              lang,
              vars,
            ),
        aLabel: t('3+ workouts', lang),
        bLabel: t('Fewer', lang),
        aText: vars.a,
        bText: vars.b,
        ...bars,
        sample: t('based on {a} with 3+ workouts and {b} with fewer', lang, {
          a: weeks(insight.a.n, lang),
          b: weeks(insight.b.n, lang),
        }),
      };
    case 'spendOnTrainingDays':
      return {
        title: more
          ? t('You spend {effect}% more a day on training days than on rest days.', lang, vars)
          : t('You spend {effect}% less a day on training days than on rest days.', lang, vars),
        aLabel: t('Training days', lang),
        bLabel: t('Rest days', lang),
        aText: t('{amount} a day', lang, { amount: vars.a }),
        bText: t('{amount} a day', lang, { amount: vars.b }),
        ...bars,
        sample: t('based on {a} and {b}', lang, {
          a: trainingDays(insight.a.n, lang),
          b: restDays(insight.b.n, lang),
        }),
      };
    case 'spendOnWeekends':
      return {
        title: more
          ? t('You spend {effect}% more a day on weekends than on weekdays.', lang, vars)
          : t('You spend {effect}% less a day on weekends than on weekdays.', lang, vars),
        aLabel: t('Weekends', lang),
        bLabel: t('Weekdays', lang),
        aText: t('{amount} a day', lang, { amount: vars.a }),
        bText: t('{amount} a day', lang, { amount: vars.b }),
        ...bars,
        sample: t('based on {a} and {b}', lang, {
          a: weekendDays(insight.a.n, lang),
          b: weekdays(insight.b.n, lang),
        }),
      };
  }
}
