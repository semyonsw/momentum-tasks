import { describe, expect, it } from 'vitest';

import type { CompletedWorkout } from './completedWorkout';
import {
  AMOUNT_COLUMNS,
  BOM,
  SET_COLUMNS,
  amountsToCsv,
  csvBaseName,
  csvDocument,
  csvField,
  csvMoney,
  workoutsToCsv,
  type AmountsCsvInput,
} from './csv';
import type { Amount, MoneyAccount, MoneyCategory } from './money';
import type { SetHistory } from '../types/models';

/**
 * CSV export (M7). The interesting cases are the quoting (names contain commas
 * by nature, notes contain line breaks), Cyrillic surviving Excel through the
 * BOM, and the two unit rules — the money scale and kg/lb — because a number in
 * a cell must be the number on the screen.
 */

/** Records without the BOM, split on CRLF — a naive split, so only for unquoted rows. */
const records = (csv: string) => csv.slice(BOM.length).split('\r\n').slice(0, -1);

/* ------------------------------------------------------------------ */
/* Quoting                                                             */
/* ------------------------------------------------------------------ */

describe('csvField', () => {
  it('leaves a plain field alone', () => {
    expect(csvField('Bench press')).toBe('Bench press');
    expect(csvField('')).toBe('');
  });

  it('quotes commas, quotes, CR and LF, doubling inner quotes', () => {
    expect(csvField('Row, stomach')).toBe('"Row, stomach"');
    expect(csvField('The "good" bar')).toBe('"The ""good"" bar"');
    expect(csvField('line one\nline two')).toBe('"line one\nline two"');
    expect(csvField('a\rb')).toBe('"a\rb"');
  });

  it('a document is BOM + CRLF records with a trailing CRLF', () => {
    const doc = csvDocument(['a', 'b'], [['1', 'x,y']]);
    expect(doc).toBe(`${BOM}a,b\r\n1,"x,y"\r\n`);
    expect(doc.charCodeAt(0)).toBe(0xfeff);
  });
});

describe('csvMoney', () => {
  it('whole units stay whole, cents get a fixed point', () => {
    expect(csvMoney(9020, 0)).toBe('9020');
    expect(csvMoney(1250, 2)).toBe('12.50');
    expect(csvMoney(1205, 2)).toBe('12.05');
    expect(csvMoney(7, 2)).toBe('0.07');
    expect(csvMoney(-1250, 2)).toBe('-12.50');
    expect(csvMoney(-0, 2)).toBe('0.00');
    // No thousands separator — it would turn the cell into a quoted string.
    expect(csvMoney(123456789, 2)).toBe('1234567.89');
  });
});

/* ------------------------------------------------------------------ */
/* Amounts                                                             */
/* ------------------------------------------------------------------ */

const accounts: MoneyAccount[] = [
  { id: 'cash', name: 'Наличные', glyph: '💵', order: 0, opening: 0, archivedAt: null },
  { id: 'card', name: 'Card', glyph: '💳', order: 1, opening: 0, archivedAt: null },
];
const categories: MoneyCategory[] = [
  {
    id: 'food',
    name: 'Food, takeaway',
    glyph: '🍜',
    direction: 'expense',
    order: 0,
    archivedAt: null,
  },
  { id: 'rent', name: 'Аренда', glyph: '🏠', direction: 'expense', order: 1, archivedAt: null },
  { id: 'pay', name: 'Salary', glyph: '💼', direction: 'income', order: 0, archivedAt: null },
  {
    id: 'transfer_out',
    name: 'Transfer',
    glyph: '🔁',
    direction: 'expense',
    order: 2,
    archivedAt: null,
  },
  {
    id: 'transfer_in',
    name: 'Transfer',
    glyph: '🔁',
    direction: 'income',
    order: 1,
    archivedAt: null,
  },
];

let seq = 0;
function amount(over: Partial<Amount> = {}): Amount {
  seq += 1;
  return {
    id: `a${seq}`,
    categoryId: 'food',
    accountId: 'cash',
    direction: 'expense',
    value: 1000,
    when: { kind: 'day', date: '2026-10-03' },
    note: '',
    createdAt: `2026-10-03T10:00:${String(seq % 60).padStart(2, '0')}.000Z`,
    ...over,
  };
}

const input = (amounts: Amount[], over: Partial<AmountsCsvInput> = {}): AmountsCsvInput => ({
  amounts,
  accounts,
  categories,
  scale: 0,
  currency: 'AMD',
  ...over,
});

describe('amountsToCsv', () => {
  it('empty data gives the header only', () => {
    const csv = amountsToCsv(input([]));
    expect(csv).toBe(`${BOM}${AMOUNT_COLUMNS.join(',')}\r\n`);
  });

  it('starts with a UTF-8 BOM and keeps Cyrillic as typed', () => {
    const csv = amountsToCsv(input([amount({ categoryId: 'rent', note: 'за октябрь' })]));
    expect(csv.startsWith(BOM)).toBe(true);
    const bytes = new TextEncoder().encode(csv);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(records(csv)[1]).toBe('2026-10-03,Наличные,expense,Аренда,-1000,AMD,за октябрь,false');
  });

  it('quotes commas, quotes and newlines in names and notes', () => {
    const csv = amountsToCsv(input([amount({ note: 'Said "never again",\nthen went back' })]));
    expect(csv).toContain(
      '2026-10-03,Наличные,expense,"Food, takeaway",-1000,AMD,"Said ""never again"",\nthen went back",false\r\n',
    );
  });

  it('formats a cents log in major units (USD)', () => {
    const csv = amountsToCsv(
      input(
        [
          amount({ value: 1250 }),
          amount({ value: 300000, categoryId: 'pay', direction: 'income' }),
        ],
        {
          scale: 2,
          currency: 'USD',
        },
      ),
    );
    const rows = records(csv);
    expect(rows[1]).toContain(',-12.50,USD,');
    expect(rows[2]).toBe('2026-10-03,Наличные,income,Salary,3000.00,USD,,false');
  });

  it('signs by effect on the account; a transfer is typed transfer on both halves', () => {
    const csv = amountsToCsv(
      input([
        amount({ categoryId: 'transfer_out', transferId: 't1', value: 500 }),
        amount({
          categoryId: 'transfer_in',
          direction: 'income',
          accountId: 'card',
          transferId: 't1',
          value: 500,
        }),
      ]),
    );
    const rows = records(csv);
    expect(rows[1]).toBe('2026-10-03,Наличные,transfer,Transfer,-500,AMD,,false');
    expect(rows[2]).toBe('2026-10-03,Card,transfer,Transfer,500,AMD,,false');
  });

  it('a whole-month amount is dated the 1st and flagged', () => {
    const csv = amountsToCsv(
      input([amount({ categoryId: 'rent', when: { kind: 'month', year: 2026, month: 8 } })]),
    );
    expect(records(csv)[1]).toBe('2026-09-01,Наличные,expense,Аренда,-1000,AMD,,true');
  });

  it('dates are ISO days, oldest first, same-day amounts in logged order', () => {
    const late = amount({ when: { kind: 'day', date: '2026-10-05' }, note: 'late' });
    const early = amount({ when: { kind: 'day', date: '2025-12-31' }, note: 'early' });
    const first = amount({ note: 'first', createdAt: '2026-10-03T08:00:00.000Z' });
    const second = amount({ note: 'second', createdAt: '2026-10-03T09:00:00.000Z' });
    const notes = records(amountsToCsv(input([late, second, early, first])))
      .slice(1)
      .map((r) => r.split(',').at(-2));
    expect(notes).toEqual(['early', 'first', 'second', 'late']);
    for (const row of records(amountsToCsv(input([late, early]))).slice(1)) {
      expect(row).toMatch(/^\d{4}-\d{2}-\d{2},/);
    }
  });

  it('an unknown account or category exports its id rather than dropping the row', () => {
    const csv = amountsToCsv(input([amount({ accountId: 'gone', categoryId: 'lost' })]));
    expect(records(csv)[1]).toBe('2026-10-03,gone,expense,lost,-1000,AMD,,false');
  });
});

/* ------------------------------------------------------------------ */
/* Workouts                                                            */
/* ------------------------------------------------------------------ */

/** A local wall-clock time as ISO, so the date column is the same in every TZ. */
const at = (y: number, m: number, d: number, h = 18) => new Date(y, m - 1, d, h).toISOString();

function set(over: Partial<SetHistory> = {}, index = 0): SetHistory {
  return {
    id: `s${index}`,
    sessionId: 'w1',
    exerciseId: 'ex_a',
    performedAt: at(2026, 10, 3),
    setIndex: index,
    weightKg: 60,
    count: 8,
    countUnit: 'reps',
    loadMode: 'external',
    isWarmup: false,
    isCompleted: true,
    ...over,
  };
}

function workout(
  id: string,
  startedAt: string,
  title: string,
  sets: SetHistory[],
  exercises: { exerciseId: string; name: string }[] = [{ exerciseId: 'ex_a', name: 'Bench press' }],
): CompletedWorkout {
  return {
    id,
    title,
    startedAt,
    endedAt: startedAt,
    durationMinutes: 60,
    setCount: sets.length,
    totalVolumeKg: 0,
    volumeIsPartial: false,
    exercises: exercises.map((e) => ({
      ...e,
      countUnit: 'reps' as const,
      loadMode: 'external' as const,
      setCount: 1,
      summary: '',
      totalCount: 0,
      topWeightKg: null,
    })),
    sets,
  };
}

describe('workoutsToCsv', () => {
  it('empty data gives the header only', () => {
    expect(workoutsToCsv([])).toBe(`${BOM}${SET_COLUMNS.join(',')}\r\n`);
  });

  it('one row per set, warm-ups flagged, set numbers counting warm-ups', () => {
    const csv = workoutsToCsv([
      workout('w1', at(2026, 10, 3), 'Push', [
        set({ isWarmup: true, weightKg: 40, restTakenSeconds: 61.6 }, 0),
        set({}, 1),
      ]),
    ]);
    const rows = records(csv);
    expect(rows[0]).toBe(SET_COLUMNS.join(','));
    expect(rows[1]).toBe('2026-10-03,1,Push,Bench press,1,40,kg,8,reps,external,true,62');
    expect(rows[2]).toBe('2026-10-03,1,Push,Bench press,2,60,kg,8,reps,external,false,');
  });

  it('quotes commas, quotes and newlines in exercise and routine names; Cyrillic kept', () => {
    const csv = workoutsToCsv([
      workout(
        'w1',
        at(2026, 10, 3),
        'Тяга, "короткая"',
        [set()],
        [{ exerciseId: 'ex_a', name: 'Row,\nstomach' }],
      ),
    ]);
    expect(csv).toContain('2026-10-03,1,"Тяга, ""короткая""","Row,\nstomach",1,60,kg');
  });

  it('oldest workout first, numbered with the user pin, seconds and blank weight for holds', () => {
    const older = workout('w1', at(2026, 1, 1, 9), 'Core', [
      set({ weightKg: null, count: 90, countUnit: 'seconds', loadMode: 'none' }),
    ]);
    const newer = workout('w2', at(2026, 10, 3), 'Push', [set()]);
    const rows = records(
      workoutsToCsv([newer, older], { numbering: { workoutId: 'w2', number: 212 } }),
    );
    expect(rows[1]).toBe('2026-01-01,211,Core,Bench press,1,,,90,seconds,none,false,');
    expect(rows[2]).toMatch(/^2026-10-03,212,Push,/);
  });

  it('a number below 1 is left blank, as the list leaves it', () => {
    const rows = records(
      workoutsToCsv(
        [
          workout('w2', at(2026, 10, 3), 'B', [set()]),
          workout('w1', at(2026, 10, 1), 'A', [set()]),
        ],
        { numbering: { workoutId: 'w2', number: 1 } },
      ),
    );
    expect(rows[1]).toMatch(/^2026-10-01,,A,/);
  });

  it('weights in lb for an imperial lifter', () => {
    const rows = records(
      workoutsToCsv([workout('w1', at(2026, 10, 3), 'Push', [set({ weightKg: 100 })])], {
        unitSystem: 'imperial',
      }),
    );
    expect(rows[1]).toContain(',220.46,lb,');
  });

  it('a deleted exercise exports under its id rather than vanishing', () => {
    const rows = records(
      workoutsToCsv([workout('w1', at(2026, 10, 3), 'Push', [set({ exerciseId: 'ex_gone' })])]),
    );
    expect(rows[1]).toContain(',ex_gone,');
  });
});

describe('csvBaseName', () => {
  it('is dated, sortable and names what it holds', () => {
    const now = new Date(2026, 9, 9, 9, 5);
    expect(csvBaseName('amounts', now)).toBe('momentum-amounts-2026-10-09-0905');
    expect(csvBaseName('workouts', now)).toBe('momentum-workouts-2026-10-09-0905');
  });
});
