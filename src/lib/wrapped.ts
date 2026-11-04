/**
 * Wrapped (X1): a month or a year of the task log, told as a short run of story
 * cards — one fact a card, then a summary laid out to be kept.
 *
 *   SEPTEMBER 2026        LONGEST STREAK        BUSIEST WEEKDAY       SUMMARY
 *   Your month            21 days               Tuesday               ╭ 9:16 ──────╮
 *   240 tasks done.       Morning reading,      92% of tasks done.    │ TASKS  86% │
 *                         3 Sep – 23 Sep.                             │ STREAK 21 d│
 *                                                                     ╰────────────╯
 *
 * ── WHAT EACH CARD IS ALLOWED TO SAY ──────────────────────────────────────
 *
 * Every figure is something the log can stand behind, and a card with nothing
 * behind it is NOT DRAWN — a month in which nothing was asked has no Wrapped,
 * not three cards of zeros. The rules, one card at a time:
 *
 *  • LONGEST STREAK is `longestRunIn` (lib/tasks.ts) over every task, archived
 *    ones included for the days they asked. Two days at least: one done day is a
 *    day, not a streak.
 *  • BUSIEST WEEKDAY is the weekday with the best done share, once the period
 *    has a whole week of weekdays to compare. Ties go to the weekday with more
 *    tasks done, then to the earlier one in a Monday-first week.
 *
 * Rejected: any "you beat 87% of users": there are no other users, and nothing
 * leaves the phone.
 *
 * ── WHEN IT IS OFFERED ────────────────────────────────────────────────────
 *
 * Last month's is reachable from the task history at any time; the year's is
 * offered 1 December – 31 January (the current year in December, the year just
 * gone in January). `yearlyWrappedOffer` is that window and nothing else — no
 * dismissal to store, the entry simply stops being offered when it closes.
 *
 * Pure: the stores are read by `hooks/useWrapped.ts` and handed in.
 */

import { formatMonth, formatShortDay, pad, parseDay, shiftDay, weekdayIndex, weekdayNames } from './days';
import { formatWhole } from './formatNumber';
import { plural, t, type Language } from './i18n';
import { asksOn, entryOf, isWeekly, longestRunIn, type Task, type TaskLog } from './tasks';

/** Fewest days in a row a streak card names. */
const STREAK_MIN = 2;

/* ------------------------------------------------------------------ */
/* Periods and when they are offered                                   */
/* ------------------------------------------------------------------ */

/** `month` is 0-based, as `Date` uses it (and `AmountWhen`). */
export type WrappedPeriod =
  { kind: 'month'; year: number; month: number } | { kind: 'year'; year: number };

export interface DayRange {
  from: string;
  to: string;
}

/** First and last day of the period, as local `YYYY-MM-DD` keys. */
export function periodRange(period: WrappedPeriod): DayRange {
  if (period.kind === 'year') return { from: `${period.year}-01-01`, to: `${period.year}-12-31` };
  const days = new Date(period.year, period.month + 1, 0).getDate();
  const prefix = `${period.year}-${pad(period.month + 1)}`;
  return { from: `${prefix}-01`, to: `${prefix}-${pad(days)}` };
}

/** The month or year before. */
export function previousPeriod(period: WrappedPeriod): WrappedPeriod {
  if (period.kind === 'year') return { kind: 'year', year: period.year - 1 };
  return period.month === 0
    ? { kind: 'month', year: period.year - 1, month: 11 }
    : { kind: 'month', year: period.year, month: period.month - 1 };
}

/** The month before the one `today` is in — what the history offers. */
export function lastMonth(today: string): WrappedPeriod {
  const date = parseDay(today) ?? new Date();
  return previousPeriod({ kind: 'month', year: date.getFullYear(), month: date.getMonth() });
}

/** The year's Wrapped: this year all December, the year just gone all January. */
export function yearlyWrappedOffer(today: string): WrappedPeriod | null {
  const date = parseDay(today);
  if (!date) return null;
  if (date.getMonth() === 11) return { kind: 'year', year: date.getFullYear() };
  if (date.getMonth() === 0) return { kind: 'year', year: date.getFullYear() - 1 };
  return null;
}

/* ------------------------------------------------------------------ */
/* The stats                                                           */
/* ------------------------------------------------------------------ */

export interface WrappedInput {
  period: WrappedPeriod;
  today: string;
  tasks: readonly Task[];
  log: TaskLog;
}

export interface WrappedStats {
  period: WrappedPeriod;
  streak: { taskName: string; daily: boolean; days: number; from: string; to: string } | null;
  tasks: { done: number; asked: number; percent: number } | null;
  weekday: {
    /** Monday-first index. */
    weekday: number;
    /** That weekday's tasks done share, 0–100. */
    tasksPercent: number | null;
    /** The weekday with the lowest tasks share, when it is another day. */
    quietest: { weekday: number; percent: number } | null;
  } | null;
}

/** The days of the range that have been lived and judged: up to yesterday. */
function judgedDays(range: DayRange, today: string): string[] {
  const days: string[] = [];
  const last = range.to < today ? range.to : shiftDay(today, -1);
  for (let day = range.from; day <= last; day = shiftDay(day, 1)) days.push(day);
  return days;
}

function tasksDone(tasks: readonly Task[], log: TaskLog, days: readonly string[]) {
  let done = 0;
  let asked = 0;
  for (const day of days) {
    for (const task of tasks) {
      if (!asksOn(task, day)) continue;
      const { mark } = entryOf(log, task.id, day);
      // Excused on purpose: out of both, as `dayProgress` keeps it everywhere.
      if (mark === 'missed') continue;
      // A weekly task (T2) counts on a day only once done — `dayProgress`'s rule.
      if (mark === null && isWeekly(task)) continue;
      asked += 1;
      if (mark === 'done') done += 1;
    }
  }
  return { done, asked };
}

const percentOf = (done: number, asked: number) => Math.round((done / asked) * 100);

function longestStreak(input: WrappedInput, range: DayRange): WrappedStats['streak'] {
  let best: WrappedStats['streak'] = null;
  const ordered = [...input.tasks].sort((a, b) => a.order - b.order);
  for (const task of ordered) {
    const run = longestRunIn(task, input.log, range.from, range.to, input.today);
    if (!run || run.days < STREAK_MIN) continue;
    // Strictly longer, so a tie goes to the task higher in the list.
    if (best == null || run.days > best.days) {
      best = { taskName: task.name, daily: task.schedule.kind === 'daily', ...run };
    }
  }
  return best;
}

function busiestWeekday(input: WrappedInput, days: readonly string[]): WrappedStats['weekday'] {
  const done = [0, 0, 0, 0, 0, 0, 0];
  const asked = [0, 0, 0, 0, 0, 0, 0];
  for (const day of days) {
    const date = parseDay(day);
    if (!date) continue;
    const share = tasksDone(input.tasks, input.log, [day]);
    done[weekdayIndex(date)] += share.done;
    asked[weekdayIndex(date)] += share.asked;
  }
  const percent = (i: number) => (asked[i] > 0 ? percentOf(done[i], asked[i]) : null);

  // A week's worth of weekdays to compare, or there is no busiest one.
  if (asked.filter((n) => n > 0).length < 7) return null;

  let best = 0;
  for (let i = 1; i < 7; i += 1) {
    const lead = (percent(i) ?? -1) - (percent(best) ?? -1);
    // Strictly ahead, or level and more tasks done; an exact tie keeps the earlier day.
    if (lead > 0 || (lead === 0 && done[i] > done[best])) best = i;
  }

  let quietest: { weekday: number; percent: number } | null = null;
  for (let i = 0; i < 7; i += 1) {
    const p = percent(i);
    if (p == null || i === best) continue;
    if (quietest == null || p < quietest.percent) quietest = { weekday: i, percent: p };
  }
  const bestPercent = percent(best);
  if (quietest && bestPercent != null && quietest.percent >= bestPercent) quietest = null;

  return { weekday: best, tasksPercent: bestPercent, quietest };
}

/** The period in the log, or null when there is nothing to tell. */
export function wrappedStats(input: WrappedInput): WrappedStats | null {
  const range = periodRange(input.period);
  const days = judgedDays(range, input.today);
  const share = tasksDone(input.tasks, input.log, days);
  const tasks = share.asked > 0 ? { ...share, percent: percentOf(share.done, share.asked) } : null;

  const stats: WrappedStats = {
    period: input.period,
    streak: longestStreak(input, range),
    tasks,
    weekday: busiestWeekday(input, days),
  };
  return stats.streak || stats.tasks || stats.weekday ? stats : null;
}

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

export type WrappedCardKey = 'title' | 'streak' | 'weekday' | 'summary';

/** One story card. Empty strings are lines the card does not have. */
export interface WrappedCard {
  key: WrappedCardKey;
  kicker: string;
  big: string;
  unit: string;
  line: string;
  sub: string;
}

/** "September 2026" / "2026". */
function periodLabel(period: WrappedPeriod, lang: Language): string {
  return period.kind === 'year'
    ? String(period.year)
    : formatMonth(period.year, period.month, lang);
}

function titleLine(stats: WrappedStats, lang: Language): string {
  if (!stats.tasks || stats.tasks.done === 0) return '';
  const n = stats.tasks.done;
  return `${formatWhole(n)} ${plural(n, lang, {
    one: t('task done', lang),
    few: 'выполненные задачи',
    many: t('tasks done', lang),
  })}.`;
}

/** The story cards, title first and summary last, with only the ones that had something. */
export function wrappedCards(stats: WrappedStats, lang: Language): WrappedCard[] {
  const yearly = stats.period.kind === 'year';
  const cards: WrappedCard[] = [];

  cards.push({
    key: 'title',
    kicker: periodLabel(stats.period, lang),
    big: t(yearly ? 'Your year' : 'Your month', lang),
    unit: '',
    line: titleLine(stats, lang),
    sub: t('Tap the right side to step through.', lang),
  });

  if (stats.streak) {
    const { taskName, daily, days, from, to } = stats.streak;
    cards.push({
      key: 'streak',
      kicker: t('Longest streak', lang),
      big: String(days),
      unit: daily
        ? plural(days, lang, { one: t('day', lang), few: 'дня', many: t('days', lang) })
        : plural(days, lang, {
            one: lang === 'ru' ? 'раз' : 'time',
            few: 'раза',
            many: t('times', lang),
          }),
      // The same in both languages: a name and two dates.
      line: `${taskName}, ${formatShortDay(from, lang)} – ${formatShortDay(to, lang)}.`,
      sub: daily ? '' : t('Counted on the days it was asked for.', lang),
    });
  }

  if (stats.weekday) {
    const names = weekdayNames(lang);
    const { weekday, tasksPercent, quietest } = stats.weekday;
    cards.push({
      key: 'weekday',
      kicker: t('Busiest weekday', lang),
      big: names[weekday],
      unit: '',
      line:
        tasksPercent != null
          ? `${t('{percent}% of tasks done', lang, { percent: tasksPercent })}.`
          : '',
      sub: quietest
        ? t('Quietest for tasks: {weekday}, {percent}%.', lang, {
            weekday: names[quietest.weekday],
            percent: quietest.percent,
          })
        : '',
    });
  }

  cards.push({ key: 'summary', kicker: t('Summary', lang), big: '', unit: '', line: '', sub: '' });
  return cards;
}

/** The summary card: a title and its figures. */
export interface WrappedSummary {
  kicker: string;
  title: string;
  cells: { key: string; label: string; value: string }[];
}

export function wrappedSummary(stats: WrappedStats, lang: Language): WrappedSummary {
  const cells: WrappedSummary['cells'] = [];
  if (stats.tasks) {
    cells.push({ key: 'tasks', label: t('Tasks done', lang), value: `${stats.tasks.percent}%` });
  }
  if (stats.streak) {
    cells.push({
      key: 'streak',
      label: t('Longest streak', lang),
      value: `${stats.streak.days} ${stats.streak.daily ? t('d', lang) : '×'}`,
    });
  }
  return {
    kicker: periodLabel(stats.period, lang),
    title: t(stats.period.kind === 'year' ? 'My year in numbers' : 'My month in numbers', lang),
    cells,
  };
}

/** The entry row: "September, wrapped" and "8 cards · your month in numbers". */
export function wrappedEntry(
  period: WrappedPeriod,
  cardCount: number,
  lang: Language,
): { title: string; detail: string } {
  const name =
    period.kind === 'year'
      ? String(period.year)
      : formatMonth(period.year, period.month, lang).split(' ')[0];
  const cards = `${cardCount} ${plural(cardCount, lang, {
    one: t('card', lang),
    few: 'карточки',
    many: t('cards', lang),
  })}`;
  return {
    title: t('{period}, wrapped', lang, { period: name }),
    detail: t(
      period.kind === 'year' ? '{cards} · your year in numbers' : '{cards} · your month in numbers',
      lang,
      {
        cards,
      },
    ),
  };
}
