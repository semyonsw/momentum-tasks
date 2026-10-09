/**
 * The budget alerts (M1), wired to the money log.
 *
 * Watches the amounts and the budgets; whenever either changes, asks
 * `budgetAlertsDue` what this month has crossed that has not been said yet,
 * REMEMBERS it first and only then says it. In that order on purpose: a
 * notification that fails to arrive is a lost message, and one that arrives
 * twice — the store written after a second launch already raised it — is a
 * nag, which is the thing this app promises not to be.
 *
 * Nothing here can notify unless a budget's own switch is on (`alerts`), and
 * every budget is created with it off.
 */

import { useEffect } from 'react';

import { budgetAlertsDue, describeBudgetAlert } from '../lib/budgets';
import { parseDay } from '../lib/days';
import { presentBudgetAlert } from '../lib/notify';
import { useMoney } from '../state/moneyStore';
import { useSettings } from '../state/settingsStore';
import { useMoneyScale } from './useMoneyScale';
import { useToday } from './useToday';

export function useBudgetAlerts(): void {
  const amounts = useMoney((s) => s.amounts);
  const budgets = useMoney((s) => s.budgets);
  const categories = useMoney((s) => s.categories);
  const language = useSettings((s) => s.language);
  const currency = useSettings((s) => s.currencyCode);
  const scale = useMoneyScale();
  const today = useToday();

  useEffect(() => {
    if (!budgets?.some((budget) => budget.alerts)) return;
    const date = parseDay(today);
    if (!date) return;
    const year = date.getFullYear();
    const month = date.getMonth();
    const { fire, record } = budgetAlertsDue({
      budgets,
      categories,
      amounts,
      year,
      month,
      // Read at the moment of asking, not subscribed: recording below changes
      // it, and a subscription would run this again for nothing.
      fired: useMoney.getState().budgetAlertsFired ?? [],
    });
    if (record.length === 0) return;
    useMoney.getState().recordBudgetAlerts(record, year, month);
    for (const alert of fire) {
      const name = categories.find((category) => category.id === alert.categoryId)?.name ?? '';
      const words = describeBudgetAlert(alert, name, currency, scale, language);
      void presentBudgetAlert(words.title, words.body, language);
    }
  }, [amounts, budgets, categories, currency, language, scale, today]);
}
