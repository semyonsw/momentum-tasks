import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { balanceOf, balanceOfAccount } from '../lib/money';
import { seedTasks, useTasks } from './tasksStore';
import {
  sanitizeMoney,
  seedAccounts,
  seedCategories,
  useMoney,
  type AmountDraft,
} from './moneyStore';

/**
 * The money store's everyday writes, and the round trip through storage.
 *
 * `moneyStore.test.ts` pins the validator and the plans; this file pins the edits a
 * person makes every day — correcting an amount, deleting one, moving money,
 * renaming and archiving — because each of them rewrites a figure that every total
 * below it is summed from, and a write that touches one row too many is a balance
 * that is quietly wrong from then on.
 *
 * The clock is stepped by hand. Every id here is `Date.now()` in base 36, so two
 * writes in one millisecond would share an id — something a thumb cannot do and a
 * test can, and the suite should not be about that by accident.
 */

let clock = Date.parse('2026-10-14T09:00:00.000Z');

beforeEach(() => {
  vi.spyOn(Date, 'now').mockImplementation(() => (clock += 1000));
});

afterEach(() => {
  vi.restoreAllMocks();
  useMoney
    .getState()
    .importMoney({ accounts: seedAccounts, categories: seedCategories, amounts: [] });
  useTasks.getState().importTasks({ tasks: seedTasks('2026-01-01'), log: {} });
});

const food: AmountDraft = {
  categoryId: 'food',
  accountId: 'cash',
  direction: 'expense',
  value: 2500,
  when: { kind: 'day', date: '2026-10-01' },
  note: '',
};

const add = (patch: Partial<AmountDraft> = {}) => {
  const id = useMoney.getState().addAmount({ ...food, ...patch });
  if (!id) throw new Error('refused');
  return id;
};

const byId = (id: string) => useMoney.getState().amounts.find((amount) => amount.id === id);

const balances = () => {
  const { accounts, amounts } = useMoney.getState();
  return Object.fromEntries(accounts.map((row) => [row.id, balanceOfAccount(row, amounts)]));
};

describe('an empty log', () => {
  it('opens on the two subsections and the eight expense tiles, with nothing in them', () => {
    const { accounts, categories, amounts } = useMoney.getState();
    expect(accounts.map((row) => row.id)).toEqual(['cash', 'online']);
    expect(categories).toHaveLength(8);
    expect(categories.every((row) => row.direction === 'expense')).toBe(true);
    expect(amounts).toEqual([]);
    expect(balances()).toEqual({ cash: 0, online: 0 });
  });

  it('sanitizes from nothing at all to a log that can still take an amount', () => {
    for (const raw of [undefined, null, {}, { accounts: 'x', amounts: 7 }]) {
      const value = sanitizeMoney(raw as never);
      expect(value.accounts.map((row) => row.id)).toEqual(['cash', 'online']);
      expect(value.amounts).toEqual([]);
    }
  });
});

describe('recording an amount', () => {
  it('refuses something that is not a number', () => {
    expect(useMoney.getState().addAmount({ ...food, value: Number.NaN })).toBeNull();
    expect(useMoney.getState().addAmount({ ...food, value: Infinity })).toBeNull();
    expect(useMoney.getState().amounts).toEqual([]);
  });

  it('stores a negative as its size — the direction says which way it went', () => {
    const id = add({ value: -700 });
    expect(byId(id)?.value).toBe(700);
    expect(balances().cash).toBe(-700);
  });

  it('gives every amount its own id, so a delete reaches exactly one', () => {
    const a = add();
    const b = add();
    expect(a).not.toBe(b);
    useMoney.getState().deleteAmount(a);
    expect(useMoney.getState().amounts.map((amount) => amount.id)).toEqual([b]);
  });
});

describe('correcting an amount', () => {
  it('rewrites the fields and keeps its id and when it was recorded', () => {
    const id = add();
    const before = byId(id);
    useMoney.getState().updateAmount(id, {
      ...food,
      categoryId: 'transport',
      accountId: 'online',
      value: -900.4,
      when: { kind: 'month', year: 2026, month: 9 },
      note: '  taxi  ',
    });
    expect(byId(id)).toEqual({
      ...before,
      categoryId: 'transport',
      accountId: 'online',
      value: 900,
      when: { kind: 'month', year: 2026, month: 9 },
      note: 'taxi',
    });
    expect(balances()).toEqual({ cash: 0, online: -900 });
  });

  it('touches no other amount', () => {
    const a = add();
    const b = add({ value: 4000 });
    const untouched = byId(b);
    useMoney.getState().updateAmount(a, { ...food, value: 10 });
    expect(byId(b)).toBe(untouched);
  });

  it('is a no-op for an id that is not there', () => {
    add();
    const before = useMoney.getState().amounts;
    useMoney.getState().updateAmount('amt_gone', { ...food, value: 1 });
    expect(useMoney.getState().amounts).toEqual(before);
  });

  it('can turn an expense into an income, and the balance swings by twice the value', () => {
    useMoney.getState().addCategory('Salary', '💼', 'income');
    const salary = useMoney.getState().categories.find((row) => row.name === 'Salary');
    const id = add({ value: 1000 });
    expect(balances().cash).toBe(-1000);
    useMoney.getState().updateAmount(id, {
      ...food,
      categoryId: salary?.id ?? '',
      direction: 'income',
      value: 1000,
    });
    expect(balances().cash).toBe(1000);
  });
});

describe('deleting an amount', () => {
  it('removes that one and leaves the rest of the day alone', () => {
    const a = add();
    const b = add({ value: 1200 });
    const c = add({ value: 300, accountId: 'online' });
    useMoney.getState().deleteAmount(b);
    expect(useMoney.getState().amounts.map((amount) => amount.id)).toEqual([a, c]);
    expect(balances()).toEqual({ cash: -2500, online: -300 });
  });

  it('is a no-op for an id that is not there — it does not take a transfer with it', () => {
    useMoney.getState().addTransfer({
      fromAccountId: 'cash',
      toAccountId: 'online',
      value: 500,
      date: '2026-10-01',
    });
    add();
    useMoney.getState().deleteAmount('amt_gone');
    expect(useMoney.getState().amounts).toHaveLength(3);
  });

  it('deleting an ordinary amount never reaches a transfer', () => {
    useMoney.getState().addTransfer({
      fromAccountId: 'cash',
      toAccountId: 'online',
      value: 500,
      date: '2026-10-01',
    });
    const id = add();
    useMoney.getState().deleteAmount(id);
    expect(
      useMoney
        .getState()
        .amounts.map((amount) => amount.direction)
        .sort(),
    ).toEqual(['expense', 'income']);
  });

  it('the undo of a delete is the same amount put back through an import', () => {
    const id = add({ note: 'lunch' });
    const snapshot = sanitizeMoney(useMoney.getState());
    useMoney.getState().deleteAmount(id);
    expect(useMoney.getState().amounts).toEqual([]);
    useMoney.getState().importMoney(snapshot);
    expect(byId(id)).toMatchObject({ value: 2500, note: 'lunch' });
  });
});

describe('transfers', () => {
  const draft = { fromAccountId: 'cash', toAccountId: 'online', value: 4000, date: '2026-10-01' };

  it('move money without changing the total — both halves always net to zero', () => {
    add({ value: 1000 });
    const before = balanceOf(useMoney.getState().amounts);
    useMoney.getState().addTransfer(draft);
    expect(balanceOf(useMoney.getState().amounts)).toBe(before);
    expect(balances()).toEqual({ cash: -5000, online: 4000 });
  });

  it('are refused for a value that is not a number', () => {
    expect(useMoney.getState().addTransfer({ ...draft, value: Number.NaN })).toBeNull();
    expect(useMoney.getState().amounts).toEqual([]);
    // and no Transfer category was created for a transfer that never happened
    expect(useMoney.getState().categories.some((row) => row.id === 'transfer_out')).toBe(false);
  });

  it('two transfers are two pairs, and deleting one leaves the other whole', () => {
    const first = useMoney.getState().addTransfer(draft);
    const second = useMoney.getState().addTransfer({ ...draft, value: 100 });
    expect(first).not.toBe(second);
    const half = useMoney.getState().amounts.find((row) => row.transferId === first);
    useMoney.getState().deleteAmount(half?.id ?? '');
    const left = useMoney.getState().amounts;
    expect(left).toHaveLength(2);
    expect(left.every((row) => row.transferId === second)).toBe(true);
  });

  it('an edit keeps both ids and both createdAt stamps', () => {
    const transferId = useMoney.getState().addTransfer(draft) ?? '';
    const before = useMoney.getState().amounts.map(({ id, createdAt }) => ({ id, createdAt }));
    useMoney.getState().updateTransfer(transferId, { ...draft, value: 10, date: '2026-10-09' });
    const after = useMoney.getState().amounts.map(({ id, createdAt }) => ({ id, createdAt }));
    expect(after).toEqual(before);
  });

  it('an edit that would be refused as a new transfer changes nothing', () => {
    const transferId = useMoney.getState().addTransfer(draft) ?? '';
    const before = useMoney.getState().amounts;
    useMoney.getState().updateTransfer(transferId, { ...draft, toAccountId: 'cash' });
    useMoney.getState().updateTransfer(transferId, { ...draft, value: 0 });
    expect(useMoney.getState().amounts).toBe(before);
  });

  it('an edit of a transfer that is not there changes nothing', () => {
    add();
    const before = useMoney.getState().amounts;
    useMoney.getState().updateTransfer('trf_gone', draft);
    expect(useMoney.getState().amounts).toBe(before);
  });

  it('an edit leaves every other amount where it was', () => {
    const plain = add();
    const untouched = byId(plain);
    const transferId = useMoney.getState().addTransfer(draft) ?? '';
    useMoney.getState().updateTransfer(transferId, { ...draft, value: 1 });
    expect(byId(plain)).toBe(untouched);
  });
});

describe('categories, one list per side', () => {
  it('a new category goes to the end of its own side and refuses a blank name', () => {
    expect(useMoney.getState().addCategory('   ', '•', 'income')).toBeNull();
    const id = useMoney.getState().addCategory('  Salary ', '', 'income');
    const row = useMoney.getState().categories.find((category) => category.id === id);
    expect(row).toMatchObject({
      name: 'Salary',
      glyph: '•',
      direction: 'income',
      archivedAt: null,
    });
    expect(
      useMoney
        .getState()
        .categories.filter((category) => category.direction === 'expense')
        .map((category) => category.id),
    ).toEqual(seedCategories.map((category) => category.id));
  });

  it('a rename keeps the old name for a blank one, and never moves a category to the other side', () => {
    useMoney.getState().updateCategory('food', { name: '  ' });
    expect(useMoney.getState().categories[0].name).toBe('Food');
    useMoney.getState().updateCategory('food', { name: ' Groceries ', glyph: '🛒' });
    expect(useMoney.getState().categories[0]).toMatchObject({
      name: 'Groceries',
      glyph: '🛒',
      direction: 'expense',
    });
  });

  it('a rename moves no amount out of it', () => {
    const id = add();
    useMoney.getState().updateCategory('food', { name: 'Groceries' });
    expect(byId(id)?.categoryId).toBe('food');
  });

  it('an archived category still carries its amounts through a relaunch', () => {
    add();
    useMoney.getState().archiveCategory('food');
    const value = sanitizeMoney(useMoney.getState());
    expect(value.categories.find((row) => row.id === 'food')?.archivedAt).not.toBeNull();
    expect(value.amounts).toHaveLength(1);
  });
});

describe('subsections', () => {
  it('a new one opens at zero, and a blank name is refused', () => {
    expect(useMoney.getState().addAccount('  ', '🏦')).toBeNull();
    const id = useMoney.getState().addAccount(' Savings ', '');
    expect(useMoney.getState().accounts.find((row) => row.id === id)).toMatchObject({
      name: 'Savings',
      glyph: '•',
      opening: 0,
      order: 2,
      archivedAt: null,
    });
  });

  it('a rename keeps the old name for a blank one', () => {
    useMoney.getState().updateAccount('cash', { name: '', glyph: '' });
    expect(useMoney.getState().accounts[0]).toMatchObject({ name: 'Cash', glyph: '💵' });
  });

  it('setting a balance refuses a value that is not a number, and an unknown subsection', () => {
    const before = useMoney.getState().accounts;
    useMoney.getState().setAccountBalance('cash', Number.NaN);
    useMoney.getState().setAccountBalance('gone', 100);
    expect(useMoney.getState().accounts).toBe(before);
  });

  it('a balance set below zero is a real balance', () => {
    add({ value: 1000 });
    useMoney.getState().setAccountBalance('cash', -300);
    expect(balances().cash).toBe(-300);
  });

  it('an archived subsection keeps its balance in the total', () => {
    add({ accountId: 'online', value: 800 });
    useMoney.getState().archiveAccount('online');
    expect(useMoney.getState().accounts[1].archivedAt).not.toBeNull();
    expect(balanceOf(useMoney.getState().amounts)).toBe(-800);
  });

  it('once one of two is archived, the other cannot be', () => {
    useMoney.getState().archiveAccount('online');
    useMoney.getState().archiveAccount('cash');
    expect(useMoney.getState().accounts.find((row) => row.id === 'cash')?.archivedAt).toBeNull();
  });
});

describe('budgets', () => {
  it('a figure that is not a number removes the budget rather than storing NaN', () => {
    useMoney.getState().setBudget('food', 5000);
    useMoney.getState().setBudget('food', Number.NaN);
    expect(useMoney.getState().budgets).toBeUndefined();
  });

  it('removing one budget leaves the others', () => {
    useMoney.getState().setBudget('food', 5000);
    useMoney.getState().setBudget('health', 2000);
    useMoney.getState().setBudget('food', -1);
    expect(useMoney.getState().budgets).toEqual([{ categoryId: 'health', monthly: 2000 }]);
  });

  it('the alert switch can be turned off again', () => {
    useMoney.getState().setBudget('food', 5000, true);
    useMoney.getState().setBudget('food', 5000, false);
    expect(useMoney.getState().budgets).toEqual([{ categoryId: 'food', monthly: 5000 }]);
  });

  it('recording no alerts writes nothing', () => {
    useMoney.getState().recordBudgetAlerts(['food:2026-10:80'], 2026, 9);
    const before = useMoney.getState().budgetAlertsFired;
    useMoney.getState().recordBudgetAlerts([], 2026, 10);
    expect(useMoney.getState().budgetAlertsFired).toBe(before);
  });
});

describe('the log survives a relaunch', () => {
  /*
   * The real path: the persist middleware's write lands in the storage stub, the
   * in-memory value is thrown away, and `rehydrate` reads the bytes back through
   * `merge` and `sanitizeMoney`. Anything the validator would rewrite or drop shows
   * up here as a difference.
   */
  async function relaunch() {
    const blob = await AsyncStorage.getItem('money');
    if (!blob) throw new Error('nothing was written');
    useMoney.setState({ amounts: [], accounts: seedAccounts, categories: seedCategories });
    await AsyncStorage.setItem('money', blob);
    await useMoney.persist.rehydrate();
  }

  it('reads back every amount, transfer, category, subsection and plan exactly', async () => {
    add({ note: 'lunch' });
    add({ when: { kind: 'month', year: 2026, month: 9 }, accountId: 'online', value: 9000 });
    useMoney.getState().addTransfer({
      fromAccountId: 'online',
      toAccountId: 'cash',
      value: 3000,
      date: '2026-10-02',
    });
    const salary = useMoney.getState().addCategory('Salary', '💼', 'income') ?? '';
    add({ categoryId: salary, direction: 'income', value: 50000 });
    useMoney.getState().addAccount('Savings', '🏦');
    useMoney.getState().setAccountBalance('cash', 12345);
    useMoney.getState().archiveCategory('clothes');
    useMoney.getState().setBudget('food', 80000, true);
    useMoney.getState().pinScale(0);

    const before = sanitizeMoney(useMoney.getState());
    const balancesBefore = balances();
    await relaunch();

    expect(sanitizeMoney(useMoney.getState())).toEqual(before);
    expect(balances()).toEqual(balancesBefore);
  });

  it('a deleted amount stays deleted after a relaunch', async () => {
    const a = add();
    const b = add({ value: 1 });
    useMoney.getState().deleteAmount(a);
    await relaunch();
    expect(useMoney.getState().amounts.map((amount) => amount.id)).toEqual([b]);
  });

  it('an emptied log stays empty — it is not mistaken for a first launch', async () => {
    add();
    useMoney.getState().archiveCategory('food');
    useMoney.getState().deleteAmount(useMoney.getState().amounts[0].id);
    await relaunch();
    expect(useMoney.getState().amounts).toEqual([]);
    expect(useMoney.getState().categories.find((row) => row.id === 'food')?.archivedAt).not.toBe(
      null,
    );
  });
});

describe('ids made in one millisecond', () => {
  afterEach(() => vi.restoreAllMocks());

  it('two amounts on the same clock tick get different ids', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    const a = useMoney.getState().addAmount(food);
    const b = useMoney.getState().addAmount({ ...food, value: 99 });
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a).not.toBe(b);
  });

  it('deleting one of them leaves the other', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    const a = useMoney.getState().addAmount(food)!;
    const b = useMoney.getState().addAmount({ ...food, value: 99 })!;
    useMoney.getState().deleteAmount(a);
    expect(useMoney.getState().amounts.map((amount) => amount.id)).toEqual([b]);
  });

  it('editing one of them leaves the other', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    const a = useMoney.getState().addAmount(food)!;
    useMoney.getState().addAmount({ ...food, value: 99 });
    useMoney.getState().updateAmount(a, { ...food, value: 5 });
    expect(
      useMoney
        .getState()
        .amounts.map((amount) => amount.value)
        .sort((x, y) => x - y),
    ).toEqual([5, 99]);
  });

  it('a clock that steps BACK still never repeats an id', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_500);
    const a = useMoney.getState().addAmount(food)!;
    now.mockReturnValue(1_800_000_000_000);
    const b = useMoney.getState().addAmount(food)!;
    expect(a).not.toBe(b);
  });

  it('ids keep the amt_ prefix and base-36 stamp', () => {
    const id = useMoney.getState().addAmount(food)!;
    expect(id).toMatch(/^amt_[0-9a-z]+$/);
  });
});

describe('updateAmount refuses what addAmount refuses', () => {
  it.each([0, NaN, Infinity, -Infinity])('a value of %s leaves the amount as it was', (value) => {
    const id = useMoney.getState().addAmount(food)!;
    const before = useMoney.getState().amounts.find((amount) => amount.id === id);
    useMoney.getState().updateAmount(id, { ...food, value });
    expect(useMoney.getState().amounts.find((amount) => amount.id === id)).toEqual(before);
  });

  it('a negative value is stored as its size, like addAmount', () => {
    const id = useMoney.getState().addAmount(food)!;
    useMoney.getState().updateAmount(id, { ...food, value: -250 });
    expect(useMoney.getState().amounts.find((amount) => amount.id === id)?.value).toBe(250);
  });
});
