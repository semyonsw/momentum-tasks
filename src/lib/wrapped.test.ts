import { describe, expect, it } from 'vitest';

import type { CompletedWorkout } from './completedWorkout';
import type { Amount, MoneyCategory } from './money';
import type { Task, TaskLog } from './tasks';
import type { SetHistory } from '../types/models';
import {
  CAR_KG,
  carsLine,
  lastMonth,
  monthlyWrappedOffer,
  periodRange,
  previousPeriod,
  shortTonnage,
  wrappedCards,
  wrappedEntry,
  wrappedStats,
  wrappedSummary,
  yearlyWrappedOffer,
  type WrappedInput,
  type WrappedWords,
} from './wrapped';

/**
 * Wrapped (X1). What matters: every figure is a fact on a fixture you can count
 * by hand; a log with nothing in the period has NO card; both languages have
 * every word; and it is offered exactly in the windows IMPLEMENTATION_DECISIONS
 * names.
 */

const SEPT = { kind: 'month', year: 2026, month: 8 } as const;
const TODAY = '2026-10-05';

/** A local wall-clock time as ISO, so `dayKey` lands on the same day in every TZ. */
const at = (day: string, hour = 18) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, hour).toISOString();
};

let seq = 0;
const set = (
  sessionId: string,
  day: string,
  exerciseId: string,
  weightKg: number | null,
  count: number,
  over: Partial<SetHistory> = {},
): SetHistory => ({
  id: `s${(seq += 1)}`,
  sessionId,
  exerciseId,
  performedAt: at(day),
  setIndex: seq,
  weightKg,
  count,
  countUnit: 'reps',
  loadMode: 'external',
  isWarmup: false,
  isCompleted: true,
  ...over,
});

function workout(
  id: string,
  day: string,
  volume: number,
  sets: SetHistory[] = [],
  over: Partial<CompletedWorkout> = {},
): CompletedWorkout {
  return {
    id,
    title: 'Push',
    startedAt: at(day),
    endedAt: at(day, 19),
    durationMinutes: 60,
    setCount: sets.length,
    totalVolumeKg: volume,
    volumeIsPartial: false,
    exercises: [...new Set(sets.map((s) => s.exerciseId))].map((exerciseId) => ({
      exerciseId,
      name: exerciseId === 'bench' ? 'Bench press' : exerciseId,
      countUnit: 'reps',
      loadMode: 'external',
      setCount: 0,
      summary: '',
      totalCount: 0,
      topWeightKg: null,
    })),
    sets: sets.map((s) => ({ ...s, sessionId: id })),
    ...over,
  };
}

function task(id: string, name: string, order: number, over: Partial<Task> = {}): Task {
  return {
    id,
    name,
    schedule: { kind: 'daily' },
    auto: null,
    startedOn: '2026-08-01',
    reminder: null,
    archivedAt: null,
    order,
    ...over,
  };
}

const mark = (log: TaskLog, taskId: string, days: string[], value: 'done' | 'missed' = 'done') => {
  log[taskId] = { ...(log[taskId] ?? {}) };
  for (const day of days) log[taskId][day] = { mark: value, note: '' };
};

const septDays = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `2026-09-${String(from + i).padStart(2, '0')}`);

let amountSeq = 0;
function amount(over: Partial<Amount> & Pick<Amount, 'categoryId' | 'value' | 'when'>): Amount {
  amountSeq += 1;
  return {
    id: `a${amountSeq}`,
    accountId: 'cash',
    direction: 'expense',
    note: '',
    createdAt: '2026-09-01T00:00:00.000Z',
    ...over,
  };
}

const categories: MoneyCategory[] = [
  { id: 'food', name: 'Food', glyph: '🛒', direction: 'expense', order: 0, archivedAt: null },
  { id: 'cafe', name: 'Cafe', glyph: '☕', direction: 'expense', order: 1, archivedAt: null },
  { id: 'home', name: 'Home', glyph: '🏠', direction: 'expense', order: 2, archivedAt: null },
];

/** The fixture: an August to compare with, and a September with a bit of everything. */
function fixture(): WrappedInput {
  const workouts = [
    // August: the bar.
    workout('w1', '2026-08-10', 3000, [set('', '2026-08-10', 'bench', 80, 5)]),
    workout('w2', '2026-08-20', 3200, [set('', '2026-08-20', 'bench', 80, 5)]),
    // September: three, two of them on Mondays (7th, 14th) and one Wednesday.
    workout('w3', '2026-09-07', 20000, [
      set('', '2026-09-07', 'bench', 100, 1, { isWarmup: true }),
      set('', '2026-09-07', 'bench', 82.5, 5),
      set('', '2026-09-07', 'squat', 120, 5),
    ]),
    workout('w4', '2026-09-14', 21480, [set('', '2026-09-14', 'bench', 80, 6)]),
    workout('w5', '2026-09-16', 20000, [set('', '2026-09-16', 'row', 60, 10)]),
    // October: not September's.
    workout('w6', '2026-10-02', 9999, [set('', '2026-10-02', 'bench', 90, 5)]),
  ];
  const tasks = [task('read', 'Reading', 0), task('walk', 'Walk', 1)];
  const log: TaskLog = {};
  mark(log, 'read', septDays(1, 12)); // 12 in a row
  mark(log, 'read', ['2026-09-13'], 'missed'); // excused: steps over
  mark(log, 'read', septDays(14, 20)); // …19 in a row through the 20th
  mark(log, 'walk', septDays(1, 25));
  const amounts = [
    amount({ categoryId: 'food', value: 30000, when: { kind: 'day', date: '2026-09-03' } }),
    amount({ categoryId: 'cafe', value: 10000, when: { kind: 'day', date: '2026-09-04' } }),
    amount({ categoryId: 'home', value: 60000, when: { kind: 'month', year: 2026, month: 8 } }),
    // Out: a transfer, an income, another month, another month's rent.
    amount({
      categoryId: 'transfer_out',
      value: 99999,
      when: { kind: 'day', date: '2026-09-05' },
      transferId: 'x',
    }),
    amount({
      categoryId: 'food',
      value: 5000,
      direction: 'income',
      when: { kind: 'day', date: '2026-09-06' },
    }),
    amount({ categoryId: 'food', value: 7777, when: { kind: 'day', date: '2026-10-01' } }),
    amount({ categoryId: 'home', value: 60000, when: { kind: 'month', year: 2026, month: 9 } }),
  ];
  return {
    period: SEPT,
    today: TODAY,
    workouts: [...workouts].reverse(),
    numbers: { w1: 86, w2: 87, w3: 88, w4: 89, w5: 90, w6: 91 },
    tasks,
    log,
    amounts,
    categories,
  };
}

const EN: WrappedWords = { unitSystem: 'metric', currency: 'AMD', scale: 0, lang: 'en' };
const RU: WrappedWords = { ...EN, lang: 'ru' };

describe('periods and offers', () => {
  it('spans the whole month, leap Februaries included, and the whole year', () => {
    expect(periodRange(SEPT)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(periodRange({ kind: 'month', year: 2028, month: 1 }).to).toBe('2028-02-29');
    expect(periodRange({ kind: 'year', year: 2026 })).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
    });
  });

  it('steps back across the year seam', () => {
    expect(previousPeriod({ kind: 'month', year: 2027, month: 0 })).toEqual({
      kind: 'month',
      year: 2026,
      month: 11,
    });
    expect(lastMonth('2027-01-20')).toEqual({ kind: 'month', year: 2026, month: 11 });
  });

  it('offers last month on the landing during the first seven days only', () => {
    expect(monthlyWrappedOffer('2026-10-01')).toEqual(SEPT);
    expect(monthlyWrappedOffer('2026-10-07')).toEqual(SEPT);
    expect(monthlyWrappedOffer('2026-10-08')).toBeNull();
    expect(monthlyWrappedOffer('2026-09-30')).toBeNull();
    expect(monthlyWrappedOffer('2027-01-03')).toEqual({ kind: 'month', year: 2026, month: 11 });
  });

  it('offers the year from 1 December to 31 January', () => {
    expect(yearlyWrappedOffer('2026-11-30')).toBeNull();
    expect(yearlyWrappedOffer('2026-12-01')).toEqual({ kind: 'year', year: 2026 });
    expect(yearlyWrappedOffer('2026-12-31')).toEqual({ kind: 'year', year: 2026 });
    expect(yearlyWrappedOffer('2027-01-01')).toEqual({ kind: 'year', year: 2026 });
    expect(yearlyWrappedOffer('2027-01-31')).toEqual({ kind: 'year', year: 2026 });
    expect(yearlyWrappedOffer('2027-02-01')).toBeNull();
  });
});

describe('wrappedStats on the fixture', () => {
  const stats = wrappedStats(fixture())!;

  it('adds up the stored working-set volume of the month’s workouts only', () => {
    expect(stats.tonnage).toEqual({ kg: 61480, partial: false });
  });

  it('flags a tonnage that a workout saved without a bodyweight undercounts', () => {
    const input = fixture();
    input.workouts = input.workouts.map((w) =>
      w.id === 'w5' ? { ...w, volumeIsPartial: true } : w,
    );
    expect(wrappedStats(input)!.tonnage?.partial).toBe(true);
  });

  it('counts the workouts against the month before, with the ordinals they span', () => {
    expect(stats.workouts).toEqual({ count: 3, previous: 2, first: 88, last: 90 });
  });

  it('makes no comparison in the month the log began', () => {
    const input = fixture();
    input.workouts = input.workouts.filter((w) => w.startedAt >= at('2026-09-01', 0));
    expect(wrappedStats(input)!.workouts?.previous).toBeNull();
  });

  it('names the best record against everything before the month, warm-ups out', () => {
    // 82.5 × 5 = e1RM 96.25 beats August's 93.33; the 100 kg warm-up single does not
    // count; squat and row were first done this month and so set no record.
    expect(stats.record?.name).toBe('Bench press');
    expect(stats.record?.record).toMatchObject({ kind: 'e1rm', value: 96.25, weightKg: 82.5 });
  });

  it('takes the longest run of any task, excused days stepped over', () => {
    expect(stats.streak).toMatchObject({
      taskName: 'Walk',
      days: 25,
      from: '2026-09-01',
      to: '2026-09-25',
    });
    const input = fixture();
    mark(input.log, 'read', septDays(21, 30));
    // Reading: 1–12, (13 excused), 14–30 = 29 days, now the longer one.
    expect(wrappedStats(input)!.streak).toMatchObject({ taskName: 'Reading', days: 29 });
  });

  it('shares tasks done over asked, excused days out of both', () => {
    // Asked: 30 + 30 − 1 excused = 59. Done: 19 + 25 = 44.
    expect(stats.tasks).toEqual({ done: 44, asked: 59, percent: 75 });
  });

  it('finds the top category, with rent counted in its month and transfers out', () => {
    expect(stats.spending).toEqual({
      total: 100000,
      count: 3,
      wholeMonth: true,
      top: { name: 'Home', glyph: '🏠', value: 60000, share: 0.6 },
    });
  });

  it('reads the busiest weekday off the workouts', () => {
    expect(stats.weekday).toMatchObject({ weekday: 0, workouts: 2 });
  });

  it('reads it off the tasks when there are too few workouts', () => {
    const input = fixture();
    input.workouts = [];
    const log: TaskLog = {};
    // Every Tuesday done, everything else half done.
    for (const day of septDays(1, 30)) {
      const tuesday = new Date(`${day}T12:00:00`).getDay() === 2;
      log.read = { ...(log.read ?? {}), [day]: { mark: 'done', note: '' } };
      if (tuesday) log.walk = { ...(log.walk ?? {}), [day]: { mark: 'done', note: '' } };
    }
    input.log = log;
    const weekday = wrappedStats(input)!.weekday!;
    expect(weekday.weekday).toBe(1);
    expect(weekday.tasksPercent).toBe(100);
    expect(weekday.quietest?.percent).toBe(50);
  });

  it('covers a year as one period', () => {
    const year = wrappedStats({ ...fixture(), period: { kind: 'year', year: 2026 } })!;
    expect(year.workouts?.count).toBe(6);
    expect(year.workouts?.previous).toBeNull();
    expect(year.spending?.total).toBe(100000 + 7777 + 60000);
  });
});

describe('empty domains', () => {
  it('is null when the period has nothing in any log', () => {
    expect(
      wrappedStats({ ...fixture(), period: { kind: 'month', year: 2025, month: 0 } }),
    ).toBeNull();
  });

  it('draws no card for a log with nothing in the period', () => {
    const input = fixture();
    input.workouts = [];
    input.tasks = [];
    const keys = wrappedCards(wrappedStats(input)!, EN).map((c) => c.key);
    expect(keys).toEqual(['title', 'category', 'summary']);
    const summary = wrappedSummary(wrappedStats(input)!, EN);
    expect(summary.cells.map((c) => c.key)).toEqual(['spent']);
    expect(summary.record).toBeNull();
  });

  it('draws every card when every log had something', () => {
    expect(wrappedCards(wrappedStats(fixture())!, EN).map((c) => c.key)).toEqual([
      'title',
      'tonnage',
      'workouts',
      'record',
      'streak',
      'category',
      'weekday',
      'summary',
    ]);
  });

  it('drops a streak of a single day', () => {
    const input = fixture();
    input.log = {};
    mark(input.log, 'read', ['2026-09-03', '2026-09-05']);
    expect(wrappedStats(input)!.streak).toBeNull();
  });
});

describe('the words', () => {
  const stats = wrappedStats(fixture())!;

  it('writes the design’s cards in English', () => {
    const cards = Object.fromEntries(wrappedCards(stats, EN).map((c) => [c.key, c]));
    expect(cards.title).toMatchObject({
      kicker: 'September 2026',
      big: 'Your month',
      line: '3 workouts, 44 tasks done and 3 amounts.',
    });
    expect(cards.tonnage).toMatchObject({
      big: '61,480',
      unit: 'kg',
      line: 'About as heavy as 41 cars.',
      sub: 'Every working set. Warm-ups are left out.',
    });
    expect(cards.workouts).toMatchObject({
      big: '3',
      line: '1 more than the month before.',
      sub: 'Workout 88 to workout 90.',
    });
    expect(cards.record).toMatchObject({
      big: '96.3',
      unit: 'kg e1RM',
      line: 'Bench press · 82.5 × 5 on 7 September.',
      sub: 'e1RM is an estimate (Epley).',
    });
    expect(cards.streak).toMatchObject({ big: '25', unit: 'days' });
    expect(cards.category).toMatchObject({
      big: '60,000',
      unit: 'AMD',
      line: '🏠 Home · 60% of everything that went out.',
    });
    expect(cards.weekday).toMatchObject({
      big: 'Monday',
      line: '2 workouts and 63% of tasks done.',
    });
  });

  it('compares the tonnage with cars honestly: rounded, "about", nothing under half a car', () => {
    expect(CAR_KG).toBe(1500);
    expect(carsLine(700, 'en')).toBe('');
    expect(carsLine(1400, 'en')).toBe('About as heavy as a car.');
    expect(carsLine(3100, 'en')).toBe('About as heavy as 2 cars.');
    expect(carsLine(3100, 'ru')).toBe('Это примерно вес 2 машин.');
    expect(carsLine(31500, 'ru')).toBe('Это примерно вес 21 машины.');
  });

  it('shortens the tonnage for the summary, in the lifter’s unit', () => {
    expect(shortTonnage(61480, 'metric', 'en')).toBe('61.5 t');
    expect(shortTonnage(820, 'metric', 'en')).toBe('820 kg');
    expect(shortTonnage(61480, 'metric', 'ru')).toBe('61.5 т');
    expect(shortTonnage(61480, 'imperial', 'en')).toBe('135.5k lb');
  });

  it('lays out the summary with the best record in one line', () => {
    const summary = wrappedSummary(stats, EN);
    expect(summary.title).toBe('My month in numbers');
    expect(summary.cells.map((c) => [c.label, c.value])).toEqual([
      ['Workouts', '3'],
      ['Tonnage', '61.5 t'],
      ['Tasks done', '75%'],
      ['Longest streak', '25 d'],
      ['Spent', '100k AMD'],
    ]);
    expect(summary.record).toBe('Bench press · 82.5 × 5 · e1RM 96.3 kg');
  });

  it('labels the entry with the card count, in both languages', () => {
    expect(wrappedEntry(SEPT, 8, 'en')).toEqual({
      title: 'September, wrapped',
      detail: '8 cards · your month in numbers',
    });
    expect(wrappedEntry(SEPT, 8, 'ru')).toEqual({
      title: 'Сентябрь в итогах',
      detail: '8 карточек · ваш месяц в цифрах',
    });
    expect(wrappedEntry({ kind: 'year', year: 2026 }, 3, 'ru').detail).toBe(
      '3 карточки · ваш год в цифрах',
    );
  });

  it('has every word of every card in Russian', () => {
    // The user's own names (exercise, task, category) and `e1RM` stay as written.
    const own = ['Bench press', 'Reading', 'Walk', 'Home', 'e1RM', 'AMD'];
    // …and so do the compact money suffixes, Latin in both languages (T-06).
    const latin = (text: string) =>
      own.reduce((rest, word) => rest.split(word).join(''), text).replace(/\d[kM]\b/g, '');
    const ru = wrappedCards(stats, RU);
    for (const card of ru) {
      for (const field of [card.kicker, card.big, card.unit, card.line, card.sub]) {
        expect(latin(field), `${card.key}: ${field}`).not.toMatch(/[A-Za-z]/);
      }
    }
    const summary = wrappedSummary(stats, RU);
    for (const text of [
      summary.kicker,
      summary.title,
      ...summary.cells.flatMap((c) => [c.label, c.value]),
    ]) {
      expect(latin(text), text).not.toMatch(/[A-Za-z]/);
    }
    // And the English is not the Russian.
    const en = wrappedCards(stats, EN);
    en.forEach((card, i) => {
      if (card.line) expect(card.line).not.toBe(ru[i].line);
    });
  });

  it('speaks Russian plurals', () => {
    const cards = Object.fromEntries(wrappedCards(stats, RU).map((c) => [c.key, c]));
    expect(cards.title.line).toBe('3 тренировки, 44 выполненные задачи и 3 суммы.');
    expect(cards.streak.unit).toBe('дней');
    expect(cards.workouts.line).toBe('На 1 больше, чем месяцем раньше.');
  });
});
