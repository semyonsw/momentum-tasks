import { afterEach, describe, expect, it } from 'vitest';

import { balanceOf, balanceOfAccount } from '../lib/money';
import { seedTasks, useTasks } from './tasksStore';
import { sanitizeMoney, seedAccounts, seedCategories, useMoney } from './moneyStore';

/**
 * The money store.
 *
 * The suite exists for three things a restore from a bad backup can do to a
 * ledger: a negative expense (which would read as income and move the balance
 * the wrong way), an amount pointing at a category that is gone (which would be
 * counted in the totals and appear in no tile), and a `when` that is neither a
 * day nor a month. All three are dropped or corrected on the way in, because
 * every screen below this point treats the value as already true.
 */

afterEach(() => {
  useMoney
    .getState()
    .importMoney({ accounts: seedAccounts, categories: seedCategories, amounts: [] });
  useTasks.getState().importTasks({ tasks: seedTasks('2026-01-01'), log: {} });
});

describe('sanitizing', () => {
  it('takes the sign off the value and leaves the direction to say it', () => {
    const [amount] = sanitizeMoney({
      categories: seedCategories,
      amounts: [
        {
          id: 'a',
          categoryId: 'food',
          direction: 'expense',
          value: -400,
          when: { kind: 'day', date: '2026-09-12' },
        },
      ] as never,
    }).amounts;
    expect(amount.value).toBe(400);
    expect(balanceOf([amount])).toBe(-400);
  });

  it('drops an amount whose category no longer exists', () => {
    const value = sanitizeMoney({
      categories: seedCategories,
      amounts: [
        {
          id: 'a',
          categoryId: 'food',
          direction: 'expense',
          value: 400,
          when: { kind: 'day', date: '2026-09-12' },
        },
        {
          id: 'b',
          categoryId: 'gone',
          direction: 'expense',
          value: 900,
          when: { kind: 'day', date: '2026-09-12' },
        },
      ] as never,
    });
    expect(value.amounts.map((amount) => amount.id)).toEqual(['a']);
  });

  it('drops an amount that is on neither a day nor a month', () => {
    const value = sanitizeMoney({
      categories: seedCategories,
      amounts: [
        {
          id: 'a',
          categoryId: 'food',
          direction: 'expense',
          value: 400,
          when: { kind: 'day', date: 'soon' },
        },
        {
          id: 'b',
          categoryId: 'food',
          direction: 'expense',
          value: 400,
          when: { kind: 'month', year: 2026, month: 12 },
        },
      ] as never,
    });
    expect(value.amounts).toEqual([]);
  });

  it('keeps a whole-month amount as a whole-month amount', () => {
    const [amount] = sanitizeMoney({
      categories: seedCategories,
      amounts: [
        {
          id: 'a',
          categoryId: 'transport',
          direction: 'expense',
          value: 6000,
          when: { kind: 'month', year: 2026, month: 8 },
        },
      ] as never,
    }).amounts;
    expect(amount.when).toEqual({ kind: 'month', year: 2026, month: 8 });
  });
});

describe('recording an amount', () => {
  const draft = {
    categoryId: 'transport',
    accountId: 'cash',
    direction: 'expense' as const,
    value: 400,
    when: { kind: 'day' as const, date: '2026-09-12' },
    note: '  taxi to the gym  ',
  };

  it('refuses a zero — a nothing is not a record of anything', () => {
    expect(useMoney.getState().addAmount({ ...draft, value: 0 })).toBeNull();
    expect(useMoney.getState().amounts).toEqual([]);
  });

  it('trims the note and rounds to whole AMD', () => {
    useMoney.getState().addAmount({ ...draft, value: 400.6 });
    const [amount] = useMoney.getState().amounts;
    expect(amount.note).toBe('taxi to the gym');
    expect(amount.value).toBe(401);
  });

  it('answers the Track expenses task by itself', () => {
    const money = useTasks.getState().tasks.find((task) => task.auto === 'money');
    if (!money) throw new Error('the seed no longer ships an auto-ticked money task');

    useMoney.getState().addAmount(draft);
    const today = Object.keys(useTasks.getState().log[money.id] ?? {});
    expect(today).toHaveLength(1);
  });
});

describe('archiving a category', () => {
  it('leaves its amounts in the totals — that is the whole point of archiving', () => {
    useMoney.getState().addAmount({
      categoryId: 'transport',
      accountId: 'cash',
      direction: 'expense',
      value: 6000,
      when: { kind: 'month', year: 2026, month: 8 },
      note: 'metro pass',
    });
    useMoney.getState().archiveCategory('transport');

    expect(useMoney.getState().amounts).toHaveLength(1);
    expect(balanceOf(useMoney.getState().amounts)).toBe(-6000);
    expect(useMoney.getState().categories.find((c) => c.id === 'transport')?.archivedAt).toBeTypeOf(
      'string',
    );
  });
});

/**
 * The subsections, in the store.
 *
 * The migration is the one that matters: a ledger written before accounts
 * existed names none, and dropping those amounts would empty a log somebody has
 * been keeping for months.
 */
describe('subsections', () => {
  it('seeds Cash and Online when a stored value has none', () => {
    const value = sanitizeMoney({ categories: seedCategories, amounts: [] });
    expect(value.accounts.map((account) => account.id)).toEqual(['cash', 'online']);
  });

  it('files an amount from before subsections existed under the first one', () => {
    const value = sanitizeMoney({
      categories: seedCategories,
      amounts: [
        {
          id: 'a',
          categoryId: 'food',
          direction: 'expense',
          value: 400,
          when: { kind: 'day', date: '2026-09-12' },
        },
      ] as never,
    });
    expect(value.amounts).toHaveLength(1);
    expect(value.amounts[0].accountId).toBe('cash');
  });

  it('sends an amount pointing at a subsection that is gone to the first one too', () => {
    const value = sanitizeMoney({
      accounts: seedAccounts,
      categories: seedCategories,
      amounts: [
        {
          id: 'a',
          categoryId: 'food',
          accountId: 'wallet-that-left',
          direction: 'expense',
          value: 400,
          when: { kind: 'day', date: '2026-09-12' },
        },
      ] as never,
    });
    expect(value.amounts[0].accountId).toBe('cash');
  });

  it('moves the opening and nothing else when a balance is set', () => {
    useMoney.getState().addAmount({
      categoryId: 'food',
      accountId: 'cash',
      direction: 'expense',
      value: 1000,
      when: { kind: 'day', date: '2026-09-12' },
      note: '',
    });
    useMoney.getState().setAccountBalance('cash', 40000);

    const account = useMoney.getState().accounts.find((row) => row.id === 'cash');
    if (!account) throw new Error('the seed no longer ships a cash account');
    expect(account.opening).toBe(41000);
    expect(balanceOfAccount(account, useMoney.getState().amounts)).toBe(40000);
    // The expense is untouched, and it is still an expense.
    expect(useMoney.getState().amounts).toHaveLength(1);
    expect(useMoney.getState().amounts[0].value).toBe(1000);
  });

  it('refuses to archive the last live subsection — nothing could be recorded', () => {
    useMoney.getState().archiveAccount('online');
    useMoney.getState().archiveAccount('cash');
    const live = useMoney.getState().accounts.filter((row) => row.archivedAt === null);
    expect(live.map((row) => row.id)).toEqual(['cash']);
  });
});

describe('expenses and incomes keep separate categories', () => {
  it('reads a category from before the split as an expense one', () => {
    const value = sanitizeMoney({
      categories: [{ id: 'food', name: 'Food', glyph: '🧊', order: 0, archivedAt: null }] as never,
    });
    expect(value.categories[0].direction).toBe('expense');
  });

  it('moves an income recorded under an expense category into an income Other', () => {
    const value = sanitizeMoney({
      categories: seedCategories,
      amounts: [
        {
          id: 'a',
          categoryId: 'food',
          direction: 'expense',
          value: 400,
          when: { kind: 'day', date: '2026-09-12' },
        },
        {
          id: 'b',
          categoryId: 'family',
          direction: 'income',
          value: 50000,
          when: { kind: 'day', date: '2026-09-12' },
        },
      ] as never,
    });
    const other = value.categories.find((category) => category.id === 'other_income');
    expect(other?.direction).toBe('income');
    expect(other?.name).toBe('Other');
    expect(value.amounts.find((amount) => amount.id === 'a')?.categoryId).toBe('food');
    expect(value.amounts.find((amount) => amount.id === 'b')?.categoryId).toBe('other_income');
    // Nothing moved in the balance: only the category changed.
    expect(balanceOf(value.amounts)).toBe(49600);
  });

  it('creates no Other when every amount already agrees with its category', () => {
    const value = sanitizeMoney({ categories: seedCategories, amounts: [] });
    expect(value.categories.map((category) => category.id)).toEqual(
      seedCategories.map((category) => category.id),
    );
  });

  it('is the identity on a log that has already been reconciled', () => {
    const once = sanitizeMoney({
      categories: seedCategories,
      amounts: [
        {
          id: 'b',
          categoryId: 'family',
          direction: 'income',
          value: 500,
          when: { kind: 'day', date: '2026-09-12' },
        },
      ] as never,
    });
    expect(sanitizeMoney(once)).toEqual(once);
  });

  it('adds a category to the side it was added from, and only that side', () => {
    const id = useMoney.getState().addCategory('Salary', '💼', 'income');
    const salary = useMoney.getState().categories.find((category) => category.id === id);
    expect(salary?.direction).toBe('income');
  });
});

describe('moving money between subsections', () => {
  const draft = { fromAccountId: 'online', toAccountId: 'cash', value: 10000, date: '2026-09-12' };
  const balances = () => {
    const { accounts, amounts } = useMoney.getState();
    return Object.fromEntries(accounts.map((row) => [row.id, balanceOfAccount(row, amounts)]));
  };

  it('writes an expense from one and an income into the other, linked', () => {
    const transferId = useMoney.getState().addTransfer(draft);
    const { amounts, categories } = useMoney.getState();
    expect(amounts).toHaveLength(2);
    expect(amounts.every((amount) => amount.transferId === transferId)).toBe(true);
    const out = amounts.find((amount) => amount.direction === 'expense');
    const into = amounts.find((amount) => amount.direction === 'income');
    expect(out?.accountId).toBe('online');
    expect(into?.accountId).toBe('cash');
    expect(balances()).toEqual({ cash: 10000, online: -10000 });
    // Both Transfer categories now exist, one per side.
    expect(categories.find((c) => c.id === 'transfer_out')?.direction).toBe('expense');
    expect(categories.find((c) => c.id === 'transfer_in')?.direction).toBe('income');
  });

  it('refuses a transfer to the same subsection, or of nothing', () => {
    expect(useMoney.getState().addTransfer({ ...draft, toAccountId: 'online' })).toBeNull();
    expect(useMoney.getState().addTransfer({ ...draft, value: 0 })).toBeNull();
    expect(useMoney.getState().amounts).toEqual([]);
  });

  it('edits both halves at once', () => {
    const transferId = useMoney.getState().addTransfer(draft);
    if (!transferId) throw new Error('refused');
    useMoney.getState().updateTransfer(transferId, {
      fromAccountId: 'cash',
      toAccountId: 'online',
      value: 2500,
      date: '2026-09-13',
    });
    const { amounts } = useMoney.getState();
    expect(amounts).toHaveLength(2);
    expect(amounts.every((amount) => amount.value === 2500)).toBe(true);
    expect(
      amounts.every((amount) => amount.when.kind === 'day' && amount.when.date === '2026-09-13'),
    ).toBe(true);
    expect(balances()).toEqual({ cash: -2500, online: 2500 });
  });

  it('deletes both halves when either one is deleted', () => {
    useMoney.getState().addTransfer(draft);
    useMoney.getState().addAmount({
      categoryId: 'food',
      accountId: 'cash',
      direction: 'expense',
      value: 300,
      when: { kind: 'day', date: '2026-09-12' },
      note: '',
    });
    const into = useMoney.getState().amounts.find((amount) => amount.direction === 'income');
    if (!into) throw new Error('no income half');
    useMoney.getState().deleteAmount(into.id);
    const left = useMoney.getState().amounts;
    expect(left).toHaveLength(1);
    expect(left[0].categoryId).toBe('food');
  });

  it('brings an archived Transfer category back on the next transfer', () => {
    useMoney.getState().addTransfer(draft);
    useMoney.getState().archiveCategory('transfer_out');
    useMoney.getState().addTransfer(draft);
    const out = useMoney.getState().categories.filter((c) => c.id === 'transfer_out');
    expect(out).toHaveLength(1);
    expect(out[0].archivedAt).toBeNull();
  });

  it('unlinks half a pair that lost its partner, so a delete reaches no further', () => {
    const value = sanitizeMoney({
      categories: seedCategories,
      amounts: [
        {
          id: 'a',
          categoryId: 'food',
          direction: 'expense',
          value: 400,
          when: { kind: 'day', date: '2026-09-12' },
          transferId: 'trf_lonely',
        },
      ] as never,
    });
    expect(value.amounts[0].transferId).toBeUndefined();
  });
});

describe('the scale — cents without rescaling anything (U25)', () => {
  const amount = (value: number) => ({
    id: `a${value}`,
    categoryId: 'food',
    accountId: 'cash',
    direction: 'expense' as const,
    value,
    when: { kind: 'day' as const, date: '2026-09-12' },
    note: '',
    createdAt: '2026-09-12T10:00:00.000Z',
  });

  it('is absent on a log that never pinned one, and on a 2.2.0 log', () => {
    expect(useMoney.getState().scale).toBeUndefined();
    const v220 = sanitizeMoney({ categories: seedCategories, amounts: [amount(12500)] as never });
    expect('scale' in v220).toBe(false);
    expect(v220.amounts[0].value).toBe(12500);
  });

  it('is pinned once by the first write, and never moved after', () => {
    useMoney.getState().pinScale(2);
    expect(useMoney.getState().scale).toBe(2);
    useMoney.getState().pinScale(0);
    expect(useMoney.getState().scale).toBe(2);
  });

  it('refuses a junk scale', () => {
    useMoney.getState().pinScale(7);
    expect(useMoney.getState().scale).toBeUndefined();
  });

  it('keeps amounts integers in minor units: 12.50 is stored as 1250', () => {
    useMoney.getState().pinScale(2);
    useMoney.getState().addAmount({
      categoryId: 'food',
      accountId: 'cash',
      direction: 'expense',
      value: 1250,
      when: { kind: 'day', date: '2026-09-12' },
      note: '',
    });
    const [stored] = useMoney.getState().amounts;
    expect(stored.value).toBe(1250);
    expect(Number.isInteger(stored.value)).toBe(true);
  });

  it('leaves existing AMD amounts exactly as they were — pinned or not', () => {
    useMoney.getState().importMoney({
      accounts: seedAccounts,
      categories: seedCategories,
      amounts: [amount(12500), amount(2600)],
    });
    expect(useMoney.getState().amounts.map((a) => a.value)).toEqual([12500, 2600]);
    useMoney.getState().pinScale(0);
    expect(useMoney.getState().amounts.map((a) => a.value)).toEqual([12500, 2600]);
  });

  it('travels with the amounts it describes, and an import without one clears it', () => {
    useMoney.getState().pinScale(2);
    const exported = sanitizeMoney(useMoney.getState());
    expect(exported.scale).toBe(2);

    // A backup from before cents: its amounts are whole units, whatever was here.
    useMoney.getState().importMoney({ categories: seedCategories, amounts: [amount(500)] });
    expect(useMoney.getState().scale).toBeUndefined();
    expect(useMoney.getState().amounts[0].value).toBe(500);

    useMoney.getState().importMoney(exported);
    expect(useMoney.getState().scale).toBe(2);
  });
});

describe('budgets (M1)', () => {
  it('are absent on a 2.2.0 log, and set, changed and removed per category', () => {
    expect(useMoney.getState().budgets).toBeUndefined();
    expect('budgets' in sanitizeMoney({ categories: seedCategories, amounts: [] })).toBe(false);

    useMoney.getState().setBudget('food', 80000);
    expect(useMoney.getState().budgets).toEqual([{ categoryId: 'food', monthly: 80000 }]);
    useMoney.getState().setBudget('food', 85000, true);
    useMoney.getState().setBudget('transport', 12000);
    expect(useMoney.getState().budgets).toEqual([
      { categoryId: 'food', monthly: 85000, alerts: true },
      { categoryId: 'transport', monthly: 12000 },
    ]);
    // Changing the figure alone keeps the alert switch where it was.
    useMoney.getState().setBudget('food', 90000);
    expect(useMoney.getState().budgets?.[0]).toEqual({
      categoryId: 'food',
      monthly: 90000,
      alerts: true,
    });
    useMoney.getState().setBudget('food', 0);
    useMoney.getState().setBudget('transport', 0);
    expect(useMoney.getState().budgets).toBeUndefined();
  });

  it('touch no amount', () => {
    useMoney.getState().addAmount({
      categoryId: 'food',
      accountId: 'cash',
      direction: 'expense',
      value: 5000,
      when: { kind: 'day', date: '2026-10-02' },
      note: '',
    });
    const before = useMoney.getState().amounts;
    useMoney.getState().setBudget('food', 1000);
    expect(useMoney.getState().amounts).toBe(before);
  });

  it('survive their category being archived, and go with a category that is gone', () => {
    useMoney.getState().setBudget('food', 80000);
    useMoney.getState().archiveCategory('food');
    expect(sanitizeMoney(useMoney.getState()).budgets).toEqual([
      { categoryId: 'food', monthly: 80000 },
    ]);
    const without = sanitizeMoney({
      categories: seedCategories.filter((c) => c.id !== 'food'),
      amounts: [],
      budgets: [{ categoryId: 'food', monthly: 80000 }],
    });
    expect(without.budgets).toBeUndefined();
  });

  it('remember fired alerts for this month only', () => {
    useMoney.getState().recordBudgetAlerts(['food:2026-09:80'], 2026, 8);
    useMoney.getState().recordBudgetAlerts(['food:2026-10:80'], 2026, 9);
    useMoney.getState().recordBudgetAlerts(['food:2026-10:80'], 2026, 9);
    expect(useMoney.getState().budgetAlertsFired).toEqual(['food:2026-10:80']);
  });

  it('are replaced by an import, never merged into it', () => {
    useMoney.getState().setBudget('food', 80000);
    useMoney.getState().recordBudgetAlerts(['food:2026-10:80'], 2026, 9);
    useMoney.getState().importMoney({ categories: seedCategories, amounts: [] });
    expect(useMoney.getState().budgets).toBeUndefined();
    expect(useMoney.getState().budgetAlertsFired).toBeUndefined();
  });
});

describe('recurring payments (M2)', () => {
  const rentDraft = {
    name: 'Rent',
    categoryId: 'family',
    accountId: 'cash',
    value: 150000,
    schedule: { kind: 'monthly' as const, day: 5 },
    wholeMonth: false,
  };

  it('are absent on a 2.2.0 log, and added with today as their start', () => {
    expect(useMoney.getState().recurring).toBeUndefined();
    const id = useMoney.getState().addRecurring(rentDraft, '2026-10-01');
    expect(id).not.toBeNull();
    expect(useMoney.getState().recurring?.[0]).toMatchObject({
      name: 'Rent',
      direction: 'expense',
      startsOn: '2026-10-01',
      handled: {},
    });
    expect(useMoney.getState().amounts).toEqual([]);
  });

  it('refuse a payment of nothing, or into a category that does not exist', () => {
    expect(useMoney.getState().addRecurring({ ...rentDraft, value: 0 }, '2026-10-01')).toBeNull();
    expect(
      useMoney.getState().addRecurring({ ...rentDraft, categoryId: 'gone' }, '2026-10-01'),
    ).toBeNull();
  });

  it('confirm writes the amount on the due date, once — a double tap writes one', () => {
    const id = useMoney.getState().addRecurring(rentDraft, '2026-09-01') ?? '';
    const first = useMoney.getState().confirmRecurring(id, '2026-10-05');
    const second = useMoney.getState().confirmRecurring(id, '2026-10-05');
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    const { amounts, recurring } = useMoney.getState();
    expect(amounts).toHaveLength(1);
    expect(amounts[0]).toMatchObject({
      id: first,
      categoryId: 'family',
      accountId: 'cash',
      direction: 'expense',
      value: 150000,
      when: { kind: 'day', date: '2026-10-05' },
    });
    expect(recurring?.[0].handled['M:2026-10']).toEqual({
      status: 'paid',
      date: '2026-10-05',
      amountId: first,
    });
  });

  it('refuses a date that is not one of the schedule’s', () => {
    const id = useMoney.getState().addRecurring(rentDraft, '2026-09-01') ?? '';
    expect(useMoney.getState().confirmRecurring(id, '2026-10-06')).toBeNull();
    expect(useMoney.getState().amounts).toEqual([]);
  });

  it('no duplicates on a double launch: the store read back answers the same', () => {
    const id = useMoney.getState().addRecurring(rentDraft, '2026-09-01') ?? '';
    useMoney.getState().confirmRecurring(id, '2026-10-05');
    // A relaunch: the value goes through the validator and comes back.
    useMoney.getState().importMoney(sanitizeMoney(useMoney.getState()));
    expect(useMoney.getState().confirmRecurring(id, '2026-10-05')).toBeNull();
    expect(useMoney.getState().amounts).toHaveLength(1);
  });

  it('a whole-month payment writes an amount for the month', () => {
    const id =
      useMoney.getState().addRecurring({ ...rentDraft, wholeMonth: true }, '2026-09-01') ?? '';
    useMoney.getState().confirmRecurring(id, '2026-10-05');
    expect(useMoney.getState().amounts[0].when).toEqual({ kind: 'month', year: 2026, month: 9 });
  });

  it('skip records the skip and writes nothing', () => {
    const id = useMoney.getState().addRecurring(rentDraft, '2026-09-01') ?? '';
    useMoney.getState().skipRecurring(id, '2026-10-05');
    expect(useMoney.getState().amounts).toEqual([]);
    expect(useMoney.getState().recurring?.[0].handled['M:2026-10']).toEqual({
      status: 'skipped',
      date: '2026-10-05',
    });
    // Skipped is answered: a confirm after it writes nothing.
    expect(useMoney.getState().confirmRecurring(id, '2026-10-05')).toBeNull();
  });

  it('undo takes the answer back, and the amount a confirm wrote', () => {
    const id = useMoney.getState().addRecurring(rentDraft, '2026-09-01') ?? '';
    useMoney.getState().confirmRecurring(id, '2026-10-05');
    useMoney.getState().undoRecurring(id, '2026-10-05');
    expect(useMoney.getState().amounts).toEqual([]);
    expect(useMoney.getState().recurring?.[0].handled).toEqual({});
  });

  it('editing the schedule leaves past confirmations alone and asks nothing twice', () => {
    const id = useMoney.getState().addRecurring(rentDraft, '2026-09-01') ?? '';
    useMoney.getState().confirmRecurring(id, '2026-10-05');
    useMoney.getState().updateRecurring(id, {
      ...rentDraft,
      value: 160000,
      schedule: { kind: 'monthly', day: 20 },
    });
    const [item] = useMoney.getState().recurring ?? [];
    expect(item.value).toBe(160000);
    expect(item.handled['M:2026-10']?.status).toBe('paid');
    // October's answer stands on the new day too.
    expect(useMoney.getState().confirmRecurring(id, '2026-10-20')).toBeNull();
    // The amount it recorded is untouched by the new figure.
    expect(useMoney.getState().amounts.map((a) => a.value)).toEqual([150000]);
  });

  it('deleting the plan keeps what it recorded', () => {
    const id = useMoney.getState().addRecurring(rentDraft, '2026-09-01') ?? '';
    useMoney.getState().confirmRecurring(id, '2026-10-05');
    useMoney.getState().deleteRecurring(id);
    expect(useMoney.getState().recurring).toBeUndefined();
    expect(useMoney.getState().amounts).toHaveLength(1);
  });

  it('are replaced by an import', () => {
    useMoney.getState().addRecurring(rentDraft, '2026-09-01');
    useMoney.getState().importMoney({ categories: seedCategories, amounts: [] });
    expect(useMoney.getState().recurring).toBeUndefined();
  });
});
