/**
 * The money log, on disk.
 *
 * AsyncStorage, for the same reason as `tasksStore`: a few thousand amounts is a
 * small blob, every screen reads the whole thing to total it, and there is no
 * query here that an index would answer faster than a pass over an array.
 *
 * ── CATEGORIES ARE ARCHIVED, NEVER DELETED ────────────────────────────────
 *
 * An amount belongs to a category, and the month, the year and the balance are
 * sums over amounts. Deleting a category would either orphan its amounts or
 * quietly change every total that already included them — a log that rewrites
 * its own past is not a log. So `archivedAt` takes it out of the grid and out of
 * the chips on the editor, and leaves every figure it ever contributed to alone.
 * The category screen says so in as many words.
 *
 * ── AN ACCOUNT IS A SUBSECTION, AND IT IS ARCHIVED THE SAME WAY ───────────
 *
 * `Cash` and `Online` ship, more can be added, and the last live one cannot be
 * archived: every amount names an account, so a log with none of them has
 * nowhere to put the next one. An account also carries `opening` — the money
 * that was already there — which is the only figure in this store that nobody
 * logged. `setAccountBalance` is how it is edited, and it is the reason the
 * money screen never has to ask anybody to invent an income.
 *
 * ── EXPENSES AND INCOMES KEEP SEPARATE CATEGORIES ─────────────────────────
 *
 * Each category belongs to one tab (`direction`), so the two grids are two
 * independent lists. The eight seeds are expenses and the income list starts
 * empty: what somebody is paid by is not something the app can guess. Incomes
 * recorded before the split move into an income `Other` (`reconcileDirections`).
 *
 * ── A TRANSFER IS RECORDED, EDITED AND DELETED AS ONE ─────────────────────
 *
 * `addTransfer` writes both halves under one `transferId`, `updateTransfer`
 * rewrites both, and `deleteAmount` on either half takes the other with it. The
 * two `Transfer` categories are created by the first transfer — and brought back
 * if the user archived them — rather than seeded into every grid.
 *
 * ── THE SEED IS EIGHT EMPTY CATEGORIES ────────────────────────────────────
 *
 * No amounts ship, exactly as no training history ships. The categories do,
 * because an empty grid with a single dashed `+ Add` in it is a worse first
 * screen than eight named tiles reading `0 AMD` — and a zero here is a fact, in
 * `ink-faint` like every other zero in the app.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistedStorage } from './persistStorage';

import { dayKey } from '../lib/days';
import {
  TRANSFER_CATEGORY,
  TRANSFER_GLYPH,
  linkTransfers,
  openingFor,
  reconcileDirections,
  transferPair,
  type Amount,
  type AmountWhen,
  type Direction,
  type MoneyAccount,
  type MoneyCategory,
  type TransferDraft,
} from '../lib/money';
import { sanitizeScale } from '../lib/moneyUnits';
import { pruneFired, sanitizeBudgets, sanitizeFired, type Budget } from '../lib/budgets';
import { sanitizeGoals, type GoalDraft, type SavingsGoal } from '../lib/goals';
import {
  amountWhenFor,
  isOccurrence,
  occurrenceAmountId,
  periodOf,
  rescheduledStart,
  sanitizeRecurring,
  type RecurringDraft,
  type RecurringPayment,
} from '../lib/recurring';
import type { ID } from '../types/models';
import { tickTaskSource } from './tasksStore';

export interface MoneyValue {
  accounts: MoneyAccount[];
  categories: MoneyCategory[];
  amounts: Amount[];
  /**
   * Digits after the point every stored integer carries — 0 whole units, 2
   * hundredths. ABSENT until the first write pins it, and absent in every log
   * and backup from before cents existed, which therefore reads as whole units.
   * See `lib/moneyUnits.ts`; nothing ever rescales a stored amount.
   */
  scale?: number;
  /**
   * M1 — one monthly figure per expense category (`lib/budgets.ts`). Absent
   * until the first budget is set, and absent in every 2.2.0 log and backup.
   */
  budgets?: Budget[];
  /** The budget alerts already said this month (`food:2026-10:80`). See `lib/budgets.ts`. */
  budgetAlertsFired?: string[];
  /**
   * M2 — rent, subscriptions: what is due when, and every occurrence already
   * answered (`lib/recurring.ts`). Absent until the first one is added.
   */
  recurring?: RecurringPayment[];
  /** M5 — savings goals, each reading one subsection's balance (`lib/goals.ts`). */
  goals?: SavingsGoal[];
}

/**
 * The two places money is kept, and the reason there are exactly two of them.
 *
 * Cash is what is in a pocket and Online is what a banking app says — the two
 * numbers anybody actually knows off the top of their head. Both open at zero,
 * because the app cannot know what is in a pocket and a guessed balance is worse
 * than an empty one: the screen asks for it the first time the figure is tapped.
 */
export const seedAccounts: MoneyAccount[] = [
  ['cash', 'Cash', '💵'],
  ['online', 'Online', '💳'],
].map(([id, name, glyph], order) => ({ id, name, glyph, order, opening: 0, archivedAt: null }));

export const seedCategories: MoneyCategory[] = [
  ['food', 'Food', '🧊'],
  ['me', 'me', '💡'],
  ['entertainment', 'Entertainment', '🎬'],
  ['transport', 'Transport', '🚌'],
  ['health', 'Health', '🩺'],
  ['charity', 'Charity', '🙂'],
  ['family', 'Family', '👪'],
  ['clothes', 'Clothes', '👕'],
].map(([id, name, glyph], order) => ({
  id,
  name,
  glyph,
  direction: 'expense' as Direction,
  order,
  archivedAt: null,
}));

function sanitizeAccount(raw: unknown, index: number): MoneyAccount | null {
  const value = raw as Partial<MoneyAccount> | undefined;
  if (!value || typeof value.id !== 'string' || value.id === '') return null;
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (name === '') return null;
  // Signed and whole: an account can open below zero, and a NaN from a hand-edited
  // backup would otherwise poison every balance drawn from it.
  const opening = Math.round(Number(value.opening));
  return {
    id: value.id,
    name,
    glyph: typeof value.glyph === 'string' && value.glyph !== '' ? value.glyph : '•',
    order: Number.isFinite(value.order) ? Number(value.order) : index,
    opening: Number.isFinite(opening) ? opening : 0,
    archivedAt: typeof value.archivedAt === 'string' ? value.archivedAt : null,
  };
}

function sanitizeCategory(raw: unknown, index: number): MoneyCategory | null {
  const value = raw as Partial<MoneyCategory> | undefined;
  if (!value || typeof value.id !== 'string' || value.id === '') return null;
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (name === '') return null;
  return {
    id: value.id,
    name,
    glyph: typeof value.glyph === 'string' && value.glyph !== '' ? value.glyph : '•',
    // Every category written before the split was offered under Expenses first.
    direction: value.direction === 'income' ? 'income' : 'expense',
    order: Number.isFinite(value.order) ? Number(value.order) : index,
    archivedAt: typeof value.archivedAt === 'string' ? value.archivedAt : null,
  };
}

function sanitizeWhen(raw: unknown): AmountWhen | null {
  const value = raw as
    Partial<{ kind: string; date: string; year: number; month: number }> | undefined;
  if (value?.kind === 'month') {
    const { year, month } = value;
    if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
    if ((month as number) < 0 || (month as number) > 11) return null;
    return { kind: 'month', year: year as number, month: month as number };
  }
  if (typeof value?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.date)) {
    return { kind: 'day', date: value.date };
  }
  return null;
}

/**
 * `fallbackAccount` is what makes accounts a MIGRATION rather than a data loss.
 *
 * Every amount written before subsections existed names no account. Dropping
 * those would empty a ledger somebody has been keeping for months, so they land
 * in the first account — Cash — which is where money recorded by a person who
 * had only one place to put it actually was.
 */
function sanitizeAmount(
  raw: unknown,
  known: ReadonlySet<ID>,
  accounts: ReadonlySet<ID>,
  fallbackAccount: ID,
): Amount | null {
  const value = raw as Partial<Amount> | undefined;
  if (!value || typeof value.id !== 'string' || value.id === '') return null;
  if (typeof value.categoryId !== 'string' || !known.has(value.categoryId)) return null;
  const accountId =
    typeof value.accountId === 'string' && accounts.has(value.accountId)
      ? value.accountId
      : fallbackAccount;
  const when = sanitizeWhen(value.when);
  if (!when) return null;
  // An integer in the log's scale, always positive. `direction` carries the
  // sign, so a negative expense restored from a bad backup would otherwise read
  // as income.
  const amount = Math.round(Math.abs(Number(value.value)));
  if (!Number.isFinite(amount)) return null;
  const sanitized: Amount = {
    id: value.id,
    categoryId: value.categoryId,
    accountId,
    direction: (value.direction === 'income' ? 'income' : 'expense') as Direction,
    value: amount,
    when,
    note: typeof value.note === 'string' ? value.note : '',
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date(0).toISOString(),
  };
  if (typeof value.transferId === 'string' && value.transferId !== '') {
    sanitized.transferId = value.transferId;
  }
  return sanitized;
}

/** The one validator. Total: `unknown` in, a complete value out. */
export function sanitizeMoney(input: Partial<MoneyValue> | undefined | null): MoneyValue {
  const rawAccounts = Array.isArray(input?.accounts) ? input.accounts : [];
  const sanitized = rawAccounts
    .map(sanitizeAccount)
    .filter((account): account is MoneyAccount => account !== null)
    .sort((a, b) => a.order - b.order)
    .map((account, order) => ({ ...account, order }));
  // A value from before subsections existed, or one whose accounts were all junk.
  // There is no screen that can render zero accounts, so the seed is the floor.
  const accounts =
    sanitized.length > 0 ? sanitized : seedAccounts.map((account) => ({ ...account }));

  const rawCategories = Array.isArray(input?.categories) ? input.categories : [];
  const sortedCategories = rawCategories
    .map(sanitizeCategory)
    .filter((category): category is MoneyCategory => category !== null)
    .sort((a, b) => a.order - b.order)
    .map((category, order) => ({ ...category, order }));

  const known = new Set(sortedCategories.map((category) => category.id));
  const accountIds = new Set(accounts.map((account) => account.id));
  const fallback = accounts[0].id;
  const rawAmounts = Array.isArray(input?.amounts) ? input.amounts : [];
  const valid = rawAmounts
    .map((amount) => sanitizeAmount(amount, known, accountIds, fallback))
    .filter((amount): amount is Amount => amount !== null);
  // Every amount into a category of its own side, then only whole pairs linked.
  const reconciled = reconcileDirections(sortedCategories, valid);

  const scale = sanitizeScale(input?.scale);
  const categoryIds = new Set(reconciled.categories.map((category) => category.id));
  const budgets = sanitizeBudgets(input?.budgets, categoryIds);
  const fired = sanitizeFired(input?.budgetAlertsFired);
  const goals = sanitizeGoals(input?.goals, accountIds);
  const recurring = sanitizeRecurring(
    input?.recurring,
    new Map(reconciled.categories.map((category) => [category.id, category.direction])),
    accountIds,
    fallback,
  );
  return {
    accounts,
    categories: reconciled.categories,
    amounts: linkTransfers(reconciled.amounts),
    // Only when pinned, so a log that never was writes no key at all.
    ...(scale === undefined ? {} : { scale }),
    // The plans (Wave 2) likewise: a log without them stays the shape it was.
    ...(budgets.length > 0 ? { budgets } : {}),
    ...(fired.length > 0 ? { budgetAlertsFired: fired } : {}),
    ...(recurring.length > 0 ? { recurring } : {}),
    ...(goals.length > 0 ? { goals } : {}),
  };
}

export interface AmountDraft {
  categoryId: ID;
  accountId: ID;
  direction: Direction;
  value: number;
  when: AmountWhen;
  note: string;
}

/**
 * The two Transfer categories present and live, appended if they were never
 * made, un-archived if the user archived them. The same array back when there
 * was nothing to do.
 */
function withTransferCategories(categories: MoneyCategory[]): MoneyCategory[] {
  let next = categories;
  for (const direction of ['expense', 'income'] as const) {
    const id = TRANSFER_CATEGORY[direction];
    const existing = next.find((category) => category.id === id);
    if (existing && existing.archivedAt === null) continue;
    next = existing
      ? next.map((category) => (category.id === id ? { ...category, archivedAt: null } : category))
      : [
          ...next,
          {
            id,
            name: 'Transfer',
            glyph: TRANSFER_GLYPH,
            direction,
            order: next.length,
            archivedAt: null,
          },
        ];
  }
  return next;
}

interface MoneyState extends MoneyValue {
  addAmount: (draft: AmountDraft) => ID | null;
  updateAmount: (id: ID, draft: AmountDraft) => void;
  /** Deletes a transfer's other half too. */
  deleteAmount: (id: ID) => void;
  /** Both halves at once. Returns the shared `transferId`, or null when refused. */
  addTransfer: (draft: TransferDraft) => ID | null;
  updateTransfer: (transferId: ID, draft: TransferDraft) => void;
  addAccount: (name: string, glyph: string) => ID | null;
  updateAccount: (id: ID, patch: { name?: string; glyph?: string }) => void;
  /** The tap on the big figure: say what you HAVE, the opening absorbs the rest. */
  setAccountBalance: (id: ID, balance: number) => void;
  archiveAccount: (id: ID) => void;
  addCategory: (name: string, glyph: string, direction: Direction) => ID | null;
  updateCategory: (id: ID, patch: { name?: string; glyph?: string }) => void;
  archiveCategory: (id: ID) => void;
  importMoney: (raw: unknown) => void;
  /**
   * Fix the log's scale before its first write — a no-op once pinned. Called by
   * whatever is about to write money, with the scale it computed the value in.
   */
  pinScale: (scale: number) => void;
  /**
   * M1 — a category's monthly budget. Zero (or less) removes it; `alerts` is
   * the 80% / 100% notification, and leaving it out keeps what was there.
   */
  setBudget: (categoryId: ID, monthly: number, alerts?: boolean) => void;
  /** Remember alerts just said, dropping every key from an earlier month. */
  recordBudgetAlerts: (keys: readonly string[], year: number, month: number) => void;
  /** M2 — a new recurring payment, starting `today`. Null when refused. */
  addRecurring: (draft: RecurringDraft, today?: string) => ID | null;
  /** Edits the plan only: nothing it already recorded moves (`rescheduledStart`). */
  updateRecurring: (id: ID, draft: RecurringDraft) => void;
  /** The plan goes; what it recorded stays recorded. */
  deleteRecurring: (id: ID) => void;
  /**
   * `Confirm` on the due card: the amount, on the due date, once. Returns the
   * amount's id, or null when that occurrence was already answered (a double
   * tap) or is not one of the schedule's dates.
   */
  confirmRecurring: (id: ID, date: string) => ID | null;
  /** `Skip this month`: remembered, nothing recorded. */
  skipRecurring: (id: ID, date: string) => void;
  /** The toast's Undo: the answer forgotten, and the amount a confirm wrote removed. */
  undoRecurring: (id: ID, date: string) => void;
  /** M5 — a savings goal. Null when refused (no name, no target, unknown subsection). */
  addGoal: (draft: GoalDraft) => ID | null;
  updateGoal: (id: ID, draft: GoalDraft) => void;
  /** The goal only: the money stays where it is. */
  deleteGoal: (id: ID) => void;
}

/** A goal draft as stored, or null when it cannot be one. */
function cleanGoal(
  draft: GoalDraft,
  accounts: readonly MoneyAccount[],
): Omit<SavingsGoal, 'id' | 'createdAt'> | null {
  const name = draft.name.trim();
  const target = Math.round(Math.abs(draft.target));
  if (name === '' || !Number.isFinite(target) || target <= 0) return null;
  if (!accounts.some((account) => account.id === draft.accountId)) return null;
  return {
    name,
    glyph: draft.glyph.trim() || '🎯',
    target,
    ...(draft.by ? { by: draft.by } : {}),
    accountId: draft.accountId,
  };
}

/**
 * The day an amount answers the `Track expenses` task on: its own day, clamped
 * to today; a whole-month amount, the day it was recorded. See `addAmount`.
 */
function taskDayFor(when: AmountWhen): string {
  const today = dayKey(new Date());
  return when.kind === 'day' && when.date <= today ? when.date : today;
}

function cleanDraft(
  draft: RecurringDraft,
  categories: readonly MoneyCategory[],
): { value: number; direction: Direction } | null {
  const value = Math.round(Math.abs(draft.value));
  if (!Number.isFinite(value) || value <= 0) return null;
  const category = categories.find((row) => row.id === draft.categoryId);
  if (!category) return null;
  return { value, direction: category.direction };
}

export const useMoney = create<MoneyState>()(
  persist(
    (set) => ({
      accounts: seedAccounts,
      categories: seedCategories,
      amounts: [],

      addAmount: (draft) => {
        const value = Math.round(Math.abs(draft.value));
        if (!Number.isFinite(value) || value <= 0) return null;
        const id = `amt_${Date.now().toString(36)}`;
        set((state) => ({
          amounts: [
            ...state.amounts,
            { ...draft, id, value, note: draft.note.trim(), createdAt: new Date().toISOString() },
          ],
        }));
        /*
         * Recording an amount is what the `Track expenses` task is asking about,
         * so it answers itself — ON THE DAY THE AMOUNT IS FOR, not on the day it
         * was typed. Writing up yesterday's taxi at breakfast should tick
         * yesterday: the task asks whether the money got written down, and it did.
         *
         * A FUTURE day is clamped to today, because a task cannot be answered
         * before it has been asked, and a whole-month amount has no day at all
         * (see `lib/money.ts`) so it ticks the day you recorded it.
         */
        tickTaskSource('money', taskDayFor(draft.when));
        return id;
      },

      updateAmount: (id, draft) =>
        set((state) => ({
          amounts: state.amounts.map((amount) =>
            amount.id === id
              ? {
                  ...amount,
                  ...draft,
                  value: Math.round(Math.abs(draft.value)),
                  note: draft.note.trim(),
                }
              : amount,
          ),
        })),

      deleteAmount: (id) =>
        set((state) => {
          const target = state.amounts.find((amount) => amount.id === id);
          const pair = target?.transferId;
          return {
            amounts: state.amounts.filter(
              (amount) => amount.id !== id && !(pair && amount.transferId === pair),
            ),
          };
        }),

      addTransfer: (draft) => {
        const stamp = Date.now().toString(36);
        const transferId = `trf_${stamp}`;
        const pair = transferPair(
          draft,
          { transferId, outId: `amt_${stamp}_out`, inId: `amt_${stamp}_in` },
          new Date().toISOString(),
        );
        if (!pair) return null;
        set((state) => ({
          categories: withTransferCategories(state.categories),
          amounts: [...state.amounts, ...pair],
        }));
        return transferId;
      },

      /*
       * Rewritten in place: both halves keep their ids and `createdAt`, so a
       * corrected transfer stays where it was in the day list.
       */
      updateTransfer: (transferId, draft) =>
        set((state) => {
          const halves = state.amounts.filter((amount) => amount.transferId === transferId);
          const out = halves.find((amount) => amount.direction === 'expense');
          const into = halves.find((amount) => amount.direction === 'income');
          if (!out || !into) return {};
          const pair = transferPair(
            draft,
            { transferId, outId: out.id, inId: into.id },
            out.createdAt,
          );
          if (!pair) return {};
          const [nextOut, nextIn] = pair;
          return {
            categories: withTransferCategories(state.categories),
            amounts: state.amounts.map((amount) =>
              amount.id === out.id
                ? { ...nextOut, note: out.note }
                : amount.id === into.id
                  ? { ...nextIn, note: into.note, createdAt: into.createdAt }
                  : amount,
            ),
          };
        }),

      addAccount: (name, glyph) => {
        const trimmed = name.trim();
        if (trimmed === '') return null;
        const id = `acc_${Date.now().toString(36)}`;
        set((state) => ({
          accounts: [
            ...state.accounts,
            {
              id,
              name: trimmed,
              glyph: glyph || '•',
              order: state.accounts.length,
              opening: 0,
              archivedAt: null,
            },
          ],
        }));
        return id;
      },

      updateAccount: (id, patch) =>
        set((state) => ({
          accounts: state.accounts.map((account) => {
            if (account.id !== id) return account;
            const name = patch.name?.trim();
            return {
              ...account,
              name: name !== undefined && name !== '' ? name : account.name,
              glyph: patch.glyph !== undefined && patch.glyph !== '' ? patch.glyph : account.glyph,
            };
          }),
        })),

      /*
       * The user types the balance; `openingFor` works out the opening behind it.
       * Nothing already logged moves — the correction lands on the one field that
       * carries money nobody recorded, which is exactly what it is for.
       */
      setAccountBalance: (id, balance) =>
        set((state) => {
          const account = state.accounts.find((row) => row.id === id);
          if (!account || !Number.isFinite(balance)) return {};
          const opening = openingFor(account, state.amounts, balance);
          return {
            accounts: state.accounts.map((row) => (row.id === id ? { ...row, opening } : row)),
          };
        }),

      /*
       * Archived like a category and for the same reason — its amounts are in
       * every total they ever reached. The last live account cannot go: there
       * would be nowhere to record anything, and nothing to show.
       */
      archiveAccount: (id) =>
        set((state) => {
          const live = state.accounts.filter((account) => account.archivedAt === null);
          if (live.length <= 1) return {};
          return {
            accounts: state.accounts.map((account) =>
              account.id === id ? { ...account, archivedAt: new Date().toISOString() } : account,
            ),
          };
        }),

      addCategory: (name, glyph, direction) => {
        const trimmed = name.trim();
        if (trimmed === '') return null;
        const id = `cat_${Date.now().toString(36)}`;
        set((state) => ({
          categories: [
            ...state.categories,
            {
              id,
              name: trimmed,
              glyph: glyph || '•',
              direction,
              order: state.categories.length,
              archivedAt: null,
            },
          ],
        }));
        return id;
      },

      updateCategory: (id, patch) =>
        set((state) => ({
          categories: state.categories.map((category) => {
            if (category.id !== id) return category;
            const name = patch.name?.trim();
            return {
              ...category,
              name: name !== undefined && name !== '' ? name : category.name,
              glyph: patch.glyph !== undefined && patch.glyph !== '' ? patch.glyph : category.glyph,
            };
          }),
        })),

      archiveCategory: (id) =>
        set((state) => ({
          categories: state.categories.map((category) =>
            category.id === id ? { ...category, archivedAt: new Date().toISOString() } : category,
          ),
        })),

      // `scale: undefined` first: a backup from before cents carries no scale, and
      // its amounts must not be read in the scale of the log they replace.
      // The plans too: an import replaces the log, and a budget the file never
      // had must not survive into it.
      importMoney: (raw) =>
        set({
          scale: undefined,
          budgets: undefined,
          budgetAlertsFired: undefined,
          recurring: undefined,
          goals: undefined,
          ...sanitizeMoney(raw as Partial<MoneyValue> | undefined | null),
        }),

      setBudget: (categoryId, monthly, alerts) =>
        set((state) => {
          const current = state.budgets ?? [];
          const existing = current.find((budget) => budget.categoryId === categoryId);
          const rest = current.filter((budget) => budget.categoryId !== categoryId);
          const value = Math.round(monthly);
          if (!Number.isFinite(value) || value <= 0) {
            return { budgets: rest.length > 0 ? rest : undefined };
          }
          const on = alerts ?? existing?.alerts === true;
          const next: Budget = { categoryId, monthly: value, ...(on ? { alerts: true } : {}) };
          return {
            budgets: existing
              ? current.map((budget) => (budget.categoryId === categoryId ? next : budget))
              : [...current, next],
          };
        }),

      recordBudgetAlerts: (keys, year, month) =>
        set((state) => {
          if (keys.length === 0) return {};
          const kept = pruneFired(state.budgetAlertsFired ?? [], year, month);
          return { budgetAlertsFired: [...new Set([...kept, ...keys])] };
        }),

      addRecurring: (draft, today = dayKey(new Date())) => {
        const clean = cleanDraft(draft, useMoney.getState().categories);
        if (!clean) return null;
        const id = `rec_${Date.now().toString(36)}`;
        const item: RecurringPayment = {
          id,
          name: draft.name.trim(),
          categoryId: draft.categoryId,
          accountId: draft.accountId,
          direction: clean.direction,
          value: clean.value,
          schedule: draft.schedule,
          ...(draft.wholeMonth && draft.schedule.kind === 'monthly' ? { wholeMonth: true } : {}),
          startsOn: today,
          note: '',
          handled: {},
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ recurring: [...(state.recurring ?? []), item] }));
        return id;
      },

      updateRecurring: (id, draft) =>
        set((state) => {
          const clean = cleanDraft(draft, state.categories);
          if (!clean || !state.recurring) return {};
          return {
            recurring: state.recurring.map((item) => {
              if (item.id !== id) return item;
              const { wholeMonth: _was, ...rest } = item;
              return {
                ...rest,
                name: draft.name.trim(),
                categoryId: draft.categoryId,
                accountId: draft.accountId,
                direction: clean.direction,
                value: clean.value,
                schedule: draft.schedule,
                ...(draft.wholeMonth && draft.schedule.kind === 'monthly'
                  ? { wholeMonth: true as const }
                  : {}),
                startsOn: rescheduledStart(item, draft.schedule),
              };
            }),
          };
        }),

      deleteRecurring: (id) =>
        set((state) => {
          const rest = (state.recurring ?? []).filter((item) => item.id !== id);
          return { recurring: rest.length > 0 ? rest : undefined };
        }),

      /*
       * Idempotent by construction (`lib/recurring.ts`): the period's answer and
       * the amount's id are both derived from the occurrence, and both are
       * checked before anything is written — inside one `set`, so two taps in
       * the same frame cannot both pass.
       */
      confirmRecurring: (id, date) => {
        let written: ID | null = null;
        let tickOn: string | null = null;
        set((state) => {
          const item = state.recurring?.find((row) => row.id === id);
          if (!item || !isOccurrence(item.schedule, date)) return {};
          const period = periodOf(item.schedule, date);
          const amountId = occurrenceAmountId(item.id, period);
          if (period in item.handled) return {};
          if (state.amounts.some((amount) => amount.id === amountId)) return {};
          if (!state.categories.some((category) => category.id === item.categoryId)) return {};
          const when = amountWhenFor(item, date);
          written = amountId;
          tickOn = taskDayFor(when);
          return {
            amounts: [
              ...state.amounts,
              {
                id: amountId,
                categoryId: item.categoryId,
                accountId: item.accountId,
                direction: item.direction,
                value: item.value,
                when,
                note: item.name,
                createdAt: new Date().toISOString(),
              },
            ],
            recurring: (state.recurring ?? []).map((row) =>
              row.id === id
                ? {
                    ...row,
                    handled: { ...row.handled, [period]: { status: 'paid', date, amountId } },
                  }
                : row,
            ),
          };
        });
        // The same answer `addAmount` gives the `Track expenses` task.
        if (tickOn) tickTaskSource('money', tickOn);
        return written;
      },

      skipRecurring: (id, date) =>
        set((state) => {
          const item = state.recurring?.find((row) => row.id === id);
          if (!item || !isOccurrence(item.schedule, date)) return {};
          const period = periodOf(item.schedule, date);
          if (period in item.handled) return {};
          return {
            recurring: (state.recurring ?? []).map((row) =>
              row.id === id
                ? { ...row, handled: { ...row.handled, [period]: { status: 'skipped', date } } }
                : row,
            ),
          };
        }),

      undoRecurring: (id, date) =>
        set((state) => {
          const item = state.recurring?.find((row) => row.id === id);
          if (!item) return {};
          const period = periodOf(item.schedule, date);
          const answer = item.handled[period];
          if (!answer) return {};
          const { [period]: _gone, ...handled } = item.handled;
          return {
            amounts: answer.amountId
              ? state.amounts.filter((amount) => amount.id !== answer.amountId)
              : state.amounts,
            recurring: (state.recurring ?? []).map((row) =>
              row.id === id ? { ...row, handled } : row,
            ),
          };
        }),

      addGoal: (draft) => {
        const clean = cleanGoal(draft, useMoney.getState().accounts);
        if (!clean) return null;
        const id = `goal_${Date.now().toString(36)}`;
        set((state) => ({
          goals: [...(state.goals ?? []), { id, ...clean, createdAt: new Date().toISOString() }],
        }));
        return id;
      },

      updateGoal: (id, draft) =>
        set((state) => {
          const clean = cleanGoal(draft, state.accounts);
          if (!clean || !state.goals) return {};
          return {
            goals: state.goals.map((goal) =>
              goal.id === id ? { id, ...clean, createdAt: goal.createdAt } : goal,
            ),
          };
        }),

      deleteGoal: (id) =>
        set((state) => {
          const rest = (state.goals ?? []).filter((goal) => goal.id !== id);
          return { goals: rest.length > 0 ? rest : undefined };
        }),

      pinScale: (scale) =>
        set((state) => {
          const pinned = sanitizeScale(scale);
          return state.scale !== undefined || pinned === undefined ? {} : { scale: pinned };
        }),
    }),
    {
      name: 'money',
      /*
       * 2 — subsections. A stored value from 1 has no `accounts` and no
       * `accountId` anywhere; `sanitizeMoney` seeds the two and files every
       * existing amount under Cash, so the migration is the identity.
       *
       * It has to EXIST all the same. With a version bump and no `migrate`,
       * zustand does not hand the old blob to `merge` at all — it logs "couldn't
       * be migrated", merges `undefined`, and the next write saves an empty log
       * over the one on disk. Every future bump needs one too.
       *
       * 3 — a category has a side. `sanitizeMoney` reads a missing `direction` as
       * `expense` and moves every income into an income `Other`, so this one is
       * the identity as well.
       */
      version: 3,
      migrate: (persisted) => persisted,
      storage: persistedStorage(),
      partialize: (state) => ({
        accounts: state.accounts,
        categories: state.categories,
        amounts: state.amounts,
        ...(state.scale === undefined ? {} : { scale: state.scale }),
        ...(state.budgets === undefined ? {} : { budgets: state.budgets }),
        ...(state.budgetAlertsFired === undefined
          ? {}
          : { budgetAlertsFired: state.budgetAlertsFired }),
        ...(state.recurring === undefined ? {} : { recurring: state.recurring }),
        ...(state.goals === undefined ? {} : { goals: state.goals }),
      }),
      /*
       * NOTHING STORED IS NOT AN EMPTY LOG. zustand calls `merge` on a first
       * launch too, with `undefined`, and sanitising that produced no categories
       * — a fresh install opened on an empty grid instead of the seeds `current`
       * already holds.
       */
      merge: (persisted, current) =>
        persisted == null
          ? current
          : { ...current, ...sanitizeMoney(persisted as Partial<MoneyValue>) },
    },
  ),
);
