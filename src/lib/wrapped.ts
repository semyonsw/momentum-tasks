/**
 * Wrapped (X1): a month or a year across the three logs, told as a short run of
 * story cards — one fact a card, then a summary laid out to be kept.
 *
 *   SEPTEMBER 2026        TONNAGE              BEST RECORD           SUMMARY
 *   Your month            61,480 kg            96.3 kg e1RM          ╭ 9:16 ──────╮
 *   13 workouts, 240      About as heavy as    Bench press ·         │ WORKOUTS 13│
 *   tasks done and 96     41 cars.             82.5 × 5 on 28 Sep.   │ TONNAGE …  │
 *   amounts.                                                         ╰────────────╯
 *
 * ── WHAT EACH CARD IS ALLOWED TO SAY ──────────────────────────────────────
 *
 * The same house rule as the weekly review (`lib/weeklyReview.ts`): every figure
 * is something the logs can stand behind, and a card with nothing behind it is
 * NOT DRAWN — a Wrapped for somebody who only logs money is a Wrapped about
 * money, not three cards of zeros. The rules, one card at a time:
 *
 *  • TONNAGE is each workout's stored volume added up: working sets only (the
 *    warm-ups were never in it, see `sessionVolume`), on the load the body moved.
 *    A workout saved without a bodyweight for its bodyweight sets says so, and so
 *    does the card. The comparison is a car of `CAR_KG`, rounded and said with
 *    "about"; under half a car there is no comparison rather than "0 cars".
 *  • WORKOUTS compares with the period before only when the log already existed
 *    then — a first month is not "13 more than August".
 *  • BEST RECORD is `recordsBrokenIn` asked of the whole period at once against
 *    everything before it: the T-09 rules (a bar must exist, ties are not records,
 *    the estimate ranks first, then the biggest jump). An exercise first done this
 *    month has no record in it.
 *  • LONGEST STREAK is `longestRunIn` (lib/tasks.ts) over every task, archived
 *    ones included for the days they asked. Two days at least: one done day is a
 *    day, not a streak.
 *  • TOP CATEGORY is expenses only, transfers out (`isSpending`), and here a
 *    whole-month amount (rent) DOES count — it belongs to its month, so a month's
 *    Wrapped that left it out would understate the month. The card says so.
 *  • BUSIEST WEEKDAY is read off the workouts when there are three or more of
 *    them, otherwise off the tasks (the weekday with the best done share); a
 *    period with neither has no card. Ties go to the weekday with more tasks
 *    done, then to the earlier one in a Monday-first week.
 *
 * Rejected: a streak for training (IMPLEMENTATION_DECISIONS row 5 — none), and
 * any "you beat 87% of users": there are no other users, and nothing leaves the
 * phone.
 *
 * ── WHEN IT IS OFFERED ────────────────────────────────────────────────────
 *
 * IMPLEMENTATION_DECISIONS, T-10: last month's is reachable from the histories at
 * any time, and from a Landing card during the first seven days of a month; the
 * year's is offered 1 December – 31 January (the current year in December, the
 * year just gone in January). `monthlyWrappedOffer` and `yearlyWrappedOffer` are
 * those two windows and nothing else — no dismissal to store, the card simply
 * stops being offered when its window closes.
 *
 * Pure: the stores are read by `hooks/useWrapped.ts` and handed in.
 */

import type { CompletedWorkout } from './completedWorkout';
import {
  dayKey,
  formatMonth,
  formatShortDay,
  pad,
  parseDay,
  shiftDay,
  weekdayIndex,
  weekdayNames,
} from './days';
import { plural, t, type Language } from './i18n';
import { formatValue, type Amount, type MoneyCategory } from './money';
import { compactMoney, isSpending } from './moneyCalendar';
import {
  recordSet,
  recordValue,
  recordsBrokenIn,
  type BodyweightLookup,
  type SessionRecord,
} from './records';
import { asksOn, entryOf, isWeekly, longestRunIn, type Task, type TaskLog } from './tasks';
import { formatClock, formatWeight, kgToLb, unitLabel } from './units';
import type { ID, UnitSystem } from '../types/models';

/**
 * The reference car, for "about as heavy as N cars": 1,500 kg, the round figure
 * for a passenger car's kerb weight (new cars sold in the EU average roughly
 * 1.4–1.6 t in the ICCT's European Vehicle Market Statistics pocketbooks). A
 * comparison is only ever "about", so a round figure is the honest one.
 */
export const CAR_KG = 1500;

/** Fewest workouts in a period before the busiest weekday is read off them. */
const WEEKDAY_FROM_WORKOUTS = 3;
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

/** The month before the one `today` is in — what the histories open. */
export function lastMonth(today: string): WrappedPeriod {
  const date = parseDay(today) ?? new Date();
  return previousPeriod({ kind: 'month', year: date.getFullYear(), month: date.getMonth() });
}

/** Last month's Wrapped, during the first seven days of a month; otherwise null. */
export function monthlyWrappedOffer(today: string): WrappedPeriod | null {
  const date = parseDay(today);
  if (!date || date.getDate() > 7) return null;
  return lastMonth(today);
}

/** The year's Wrapped: this year all December, the year just gone all January. */
export function yearlyWrappedOffer(today: string): WrappedPeriod | null {
  const date = parseDay(today);
  if (!date) return null;
  if (date.getMonth() === 11) return { kind: 'year', year: date.getFullYear() };
  if (date.getMonth() === 0) return { kind: 'year', year: date.getFullYear() - 1 };
  return null;
}

/** Same period? For route keys and the Landing. */
export function samePeriod(a: WrappedPeriod, b: WrappedPeriod): boolean {
  if (a.kind === 'year' || b.kind === 'year') return a.kind === b.kind && a.year === b.year;
  return a.year === b.year && a.month === b.month;
}

/* ------------------------------------------------------------------ */
/* The stats                                                           */
/* ------------------------------------------------------------------ */

export interface WrappedInput {
  period: WrappedPeriod;
  today: string;
  workouts: readonly CompletedWorkout[];
  /** Workout ordinals by id (`workoutNumbers`), for "Workout 88 to workout 100". */
  numbers?: Readonly<Record<ID, number>>;
  tasks: readonly Task[];
  log: TaskLog;
  amounts: readonly Amount[];
  categories: readonly MoneyCategory[];
  bodyweightAtDate?: BodyweightLookup;
}

export interface WrappedStats {
  period: WrappedPeriod;
  tonnage: { kg: number; partial: boolean } | null;
  workouts: {
    count: number;
    /** The period before's count, or null when the log did not exist yet. */
    previous: number | null;
    /** First and last ordinal in the period, when known. */
    first: number | null;
    last: number | null;
  } | null;
  record: { record: SessionRecord; name: string } | null;
  streak: { taskName: string; daily: boolean; days: number; from: string; to: string } | null;
  tasks: { done: number; asked: number; percent: number } | null;
  spending: {
    /** In the money log's integers. */
    total: number;
    count: number;
    top: { name: string; glyph: string; value: number; share: number } | null;
    /** A whole-month amount is in the total. */
    wholeMonth: boolean;
  } | null;
  weekday: {
    /** Monday-first index. */
    weekday: number;
    workouts: number;
    /** That weekday's tasks done share, 0–100, or null when it asked nothing. */
    tasksPercent: number | null;
    /** The weekday with the lowest tasks share, when it is another day. */
    quietest: { weekday: number; percent: number } | null;
  } | null;
}

const within = (day: string, range: DayRange) => day >= range.from && day <= range.to;

function workoutsIn(workouts: readonly CompletedWorkout[], range: DayRange) {
  return workouts.filter((workout) => within(dayKey(workout.startedAt), range));
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

function bestRecord(input: WrappedInput, range: DayRange, inPeriod: readonly CompletedWorkout[]) {
  const before = input.workouts
    .filter((workout) => dayKey(workout.startedAt) < range.from)
    .flatMap((workout) => workout.sets);
  const [record] = recordsBrokenIn(
    inPeriod.flatMap((workout) => workout.sets),
    before,
    input.bodyweightAtDate,
    1,
  );
  if (!record) return null;
  // The name as that workout wrote it down — the snapshot history keeps.
  const workout = inPeriod.find((w) => w.id === record.sessionId);
  const name =
    workout?.exercises.find((e) => e.exerciseId === record.exerciseId)?.name ??
    inPeriod.flatMap((w) => w.exercises).find((e) => e.exerciseId === record.exerciseId)?.name ??
    '';
  return { record, name };
}

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

function amountInPeriod(amount: Amount, period: WrappedPeriod, range: DayRange): boolean {
  if (amount.when.kind === 'day') return within(amount.when.date, range);
  if (amount.when.year !== period.year) return false;
  return period.kind === 'year' || amount.when.month === period.month;
}

function spendingIn(input: WrappedInput, range: DayRange): WrappedStats['spending'] {
  const byCategory = new Map<string, number>();
  let total = 0;
  let count = 0;
  let wholeMonth = false;
  for (const amount of input.amounts) {
    if (!isSpending(amount) || !amountInPeriod(amount, input.period, range)) continue;
    total += amount.value;
    count += 1;
    if (amount.when.kind === 'month') wholeMonth = true;
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
  const category = input.categories.find((c) => c.id === topId);
  return {
    total,
    count,
    wholeMonth,
    top: category
      ? { name: category.name, glyph: category.glyph, value: topValue, share: topValue / total }
      : null,
  };
}

function busiestWeekday(
  input: WrappedInput,
  inPeriod: readonly CompletedWorkout[],
  days: readonly string[],
): WrappedStats['weekday'] {
  const workouts = [0, 0, 0, 0, 0, 0, 0];
  for (const workout of inPeriod) {
    const date = parseDay(dayKey(workout.startedAt));
    if (date) workouts[weekdayIndex(date)] += 1;
  }
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

  const totalWorkouts = inPeriod.length;
  const askedDays = asked.filter((n) => n > 0).length;
  const byWorkouts = totalWorkouts >= WEEKDAY_FROM_WORKOUTS;
  // Tasks alone need a week's worth of weekdays to compare.
  if (!byWorkouts && askedDays < 7) return null;

  let best = -1;
  for (let i = 0; i < 7; i += 1) {
    if (best === -1) {
      best = i;
      continue;
    }
    const lead = byWorkouts
      ? workouts[i] - workouts[best]
      : (percent(i) ?? -1) - (percent(best) ?? -1);
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

  return {
    weekday: best,
    workouts: workouts[best],
    tasksPercent: bestPercent,
    quietest,
  };
}

/** The period across the three logs, or null when there is nothing to tell. */
export function wrappedStats(input: WrappedInput): WrappedStats | null {
  const range = periodRange(input.period);
  const before = periodRange(previousPeriod(input.period));
  const inPeriod = workoutsIn(input.workouts, range);

  const kg = inPeriod.reduce((sum, workout) => sum + (workout.totalVolumeKg || 0), 0);
  const tonnage =
    kg > 0 ? { kg: Math.round(kg), partial: inPeriod.some((w) => w.volumeIsPartial) } : null;

  let workouts: WrappedStats['workouts'] = null;
  if (inPeriod.length > 0) {
    const hadLog = input.workouts.some((w) => dayKey(w.startedAt) < range.from);
    const ordinals = inPeriod
      .map((w) => input.numbers?.[w.id])
      .filter((n): n is number => typeof n === 'number' && n >= 1);
    workouts = {
      count: inPeriod.length,
      previous: hadLog ? workoutsIn(input.workouts, before).length : null,
      first: ordinals.length > 0 ? Math.min(...ordinals) : null,
      last: ordinals.length > 0 ? Math.max(...ordinals) : null,
    };
  }

  const days = judgedDays(range, input.today);
  const share = tasksDone(input.tasks, input.log, days);
  const tasks = share.asked > 0 ? { ...share, percent: percentOf(share.done, share.asked) } : null;

  const stats: WrappedStats = {
    period: input.period,
    tonnage,
    workouts,
    record: bestRecord(input, range, inPeriod),
    streak: longestStreak(input, range),
    tasks,
    spending: spendingIn(input, range),
    weekday: busiestWeekday(input, inPeriod, days),
  };
  const anything =
    stats.tonnage ||
    stats.workouts ||
    stats.record ||
    stats.streak ||
    stats.tasks ||
    stats.spending ||
    stats.weekday;
  return anything ? stats : null;
}

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

export type WrappedCardKey =
  'title' | 'tonnage' | 'workouts' | 'record' | 'streak' | 'category' | 'weekday' | 'summary';

/** One story card. Empty strings are lines the card does not have. */
export interface WrappedCard {
  key: WrappedCardKey;
  kicker: string;
  big: string;
  unit: string;
  line: string;
  sub: string;
}

export interface WrappedWords {
  unitSystem: UnitSystem;
  currency: string;
  /** The money log's decimal scale (`lib/moneyUnits.ts`). */
  scale: number;
  lang: Language;
}

/** "September 2026" / "2026". */
export function periodLabel(period: WrappedPeriod, lang: Language): string {
  return period.kind === 'year'
    ? String(period.year)
    : formatMonth(period.year, period.month, lang);
}

/** "the month before" / "the year before" — Russian needs no case for it. */
function before(period: WrappedPeriod, lang: Language): string {
  return t(period.kind === 'year' ? 'the year before' : 'the month before', lang);
}

/** "A, B and C" in either language. */
function listOf(parts: readonly string[], lang: Language): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} ${t('and', lang)} ${parts[parts.length - 1]}`;
}

function tonnageFigure(kg: number, unitSystem: UnitSystem): number {
  return Math.round(unitSystem === 'imperial' ? kgToLb(kg) : kg);
}

/** "61.5 t" / "820 kg" / "135.5k lb" — the summary's short form. */
export function shortTonnage(kg: number, unitSystem: UnitSystem, lang: Language): string {
  if (unitSystem === 'imperial') {
    const lb = tonnageFigure(kg, unitSystem);
    return lb >= 1000
      ? `${Number((lb / 1000).toFixed(1))}k ${unitLabel(unitSystem, lang)}`
      : `${lb} ${unitLabel(unitSystem, lang)}`;
  }
  return kg >= 1000
    ? `${Number((kg / 1000).toFixed(1))} ${t('t', lang)}`
    : `${Math.round(kg)} ${unitLabel(unitSystem, lang)}`;
}

/** "About as heavy as 41 cars." — or nothing under half a car. */
export function carsLine(kg: number, lang: Language): string {
  const cars = Math.round(kg / CAR_KG);
  if (cars < 1) return '';
  if (cars === 1) return t('About as heavy as a car.', lang);
  return t('About as heavy as {n} {cars}.', lang, {
    n: formatValue(cars),
    cars: plural(cars, lang, { one: t('car', lang), few: 'машин', many: t('cars', lang) }),
  });
}

function comparisonLine(
  count: number,
  previous: number | null,
  period: WrappedPeriod,
  lang: Language,
) {
  if (previous === null) return '';
  const diff = count - previous;
  const than = before(period, lang);
  if (diff === 0) return t('Same as {before}.', lang, { before: than });
  return diff > 0
    ? t('{n} more than {before}.', lang, { n: diff, before: than })
    : t('{n} fewer than {before}.', lang, { n: -diff, before: than });
}

function titleLine(stats: WrappedStats, lang: Language): string {
  const parts: string[] = [];
  if (stats.workouts) {
    const n = stats.workouts.count;
    parts.push(
      `${n} ${plural(n, lang, { one: t('workout', lang), few: 'тренировки', many: t('workouts', lang) })}`,
    );
  }
  if (stats.tasks && stats.tasks.done > 0) {
    const n = stats.tasks.done;
    parts.push(
      `${formatValue(n)} ${plural(n, lang, {
        one: t('task done', lang),
        few: 'выполненные задачи',
        many: t('tasks done', lang),
      })}`,
    );
  }
  if (stats.spending) {
    const n = stats.spending.count;
    parts.push(
      `${formatValue(n)} ${plural(n, lang, { one: t('amount', lang), few: 'суммы', many: t('amounts', lang) })}`,
    );
  }
  return parts.length > 0 ? `${listOf(parts, lang)}.` : '';
}

function recordFigure(record: SessionRecord, words: WrappedWords): { big: string; unit: string } {
  const { unitSystem, lang } = words;
  if (record.kind === 'e1rm') {
    return {
      big: formatWeight(record.value, unitSystem),
      unit: `${unitLabel(unitSystem, lang)} e1RM`,
    };
  }
  if (record.kind === 'heaviest') {
    return { big: formatWeight(record.value, unitSystem), unit: unitLabel(unitSystem, lang) };
  }
  if (record.countUnit === 'seconds' || record.countUnit === 'rounds') {
    return { big: formatClock(record.value), unit: '' };
  }
  const shown = recordValue(record, unitSystem, lang);
  const space = shown.indexOf(' ');
  return space > 0
    ? { big: shown.slice(0, space), unit: shown.slice(space + 1) }
    : { big: shown, unit: '' };
}

/** The story cards, title first and summary last, with only the logs that had something. */
export function wrappedCards(stats: WrappedStats, words: WrappedWords): WrappedCard[] {
  const { lang, unitSystem } = words;
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

  if (stats.tonnage) {
    cards.push({
      key: 'tonnage',
      kicker: t('Tonnage', lang),
      big: formatValue(tonnageFigure(stats.tonnage.kg, unitSystem)),
      unit: unitLabel(unitSystem, lang),
      line: carsLine(stats.tonnage.kg, lang),
      sub: stats.tonnage.partial
        ? t('Working sets with a known load. Warm-ups are left out.', lang)
        : t('Every working set. Warm-ups are left out.', lang),
    });
  }

  if (stats.workouts) {
    const { count, previous, first, last } = stats.workouts;
    cards.push({
      key: 'workouts',
      kicker: t('Workouts', lang),
      big: String(count),
      unit: '',
      line: comparisonLine(count, previous, stats.period, lang),
      sub:
        first != null && last != null && last > first
          ? t('Workout {first} to workout {last}.', lang, { first, last })
          : '',
    });
  }

  if (stats.record) {
    const { record, name } = stats.record;
    const figure = recordFigure(record, words);
    cards.push({
      key: 'record',
      kicker: t('Best record', lang),
      ...figure,
      line: t('{name} · {set} on {date}.', lang, {
        name,
        set: recordSet(record, unitSystem),
        date: formatShortDay(dayKey(record.at), lang),
      }),
      sub: record.kind === 'e1rm' ? t('e1RM is an estimate (Epley).', lang) : '',
    });
  }

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

  if (stats.spending?.top) {
    const { top, wholeMonth } = stats.spending;
    const percent = Math.round(top.share * 100);
    cards.push({
      key: 'category',
      kicker: t('Top category', lang),
      big: formatValue(top.value, words.scale),
      unit: words.currency,
      line:
        percent >= 100
          ? t('{category} · all of it.', lang, { category: `${top.glyph} ${top.name}`.trim() })
          : t('{category} · {percent}% of everything that went out.', lang, {
              category: `${top.glyph} ${top.name}`.trim(),
              percent,
            }),
      sub: wholeMonth
        ? t('Whole-month amounts are counted in their month.', lang)
        : t('Expenses only. Transfers between accounts are not spending.', lang),
    });
  }

  if (stats.weekday) {
    const names = weekdayNames(lang);
    const { weekday, workouts, tasksPercent, quietest } = stats.weekday;
    const clauses: string[] = [];
    if (workouts > 0) {
      clauses.push(
        `${workouts} ${plural(workouts, lang, {
          one: t('workout', lang),
          few: 'тренировки',
          many: t('workouts', lang),
        })}`,
      );
    }
    if (tasksPercent != null) {
      clauses.push(t('{percent}% of tasks done', lang, { percent: tasksPercent }));
    }
    cards.push({
      key: 'weekday',
      kicker: t('Busiest weekday', lang),
      big: names[weekday],
      unit: '',
      line: clauses.length > 0 ? `${listOf(clauses, lang)}.` : '',
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

/** The summary card: a title, up to five figures, and the best record in a line. */
export interface WrappedSummary {
  kicker: string;
  title: string;
  cells: { key: string; label: string; value: string }[];
  record: string | null;
}

export function wrappedSummary(stats: WrappedStats, words: WrappedWords): WrappedSummary {
  const { lang, unitSystem } = words;
  const cells: WrappedSummary['cells'] = [];
  if (stats.workouts) {
    cells.push({
      key: 'workouts',
      label: t('Workouts', lang),
      value: String(stats.workouts.count),
    });
  }
  if (stats.tonnage) {
    cells.push({
      key: 'tonnage',
      label: t('Tonnage', lang),
      value: shortTonnage(stats.tonnage.kg, unitSystem, lang),
    });
  }
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
  if (stats.spending) {
    cells.push({
      key: 'spent',
      label: t('Spent', lang),
      value: `${compactMoney(stats.spending.total, words.scale)} ${words.currency}`,
    });
  }
  let record: string | null = null;
  if (stats.record) {
    const { record: r, name } = stats.record;
    const figure = recordFigure(r, words);
    record = `${name} · ${recordSet(r, unitSystem)} · ${
      r.kind === 'e1rm'
        ? `e1RM ${figure.big} ${unitLabel(unitSystem, lang)}`
        : `${figure.big} ${figure.unit}`.trim()
    }`;
  }
  return {
    kicker: periodLabel(stats.period, lang),
    title: t(stats.period.kind === 'year' ? 'My year in numbers' : 'My month in numbers', lang),
    cells,
    record,
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
