/**
 * The money log's scale, as state — 0 for whole units, 2 for a log in cents.
 *
 * The one place that joins the two stores the rule needs: the pin and the
 * emptiness live with the amounts (`moneyStore`), the label in the settings.
 * The rule itself is `lib/moneyUnits.ts`'s `moneyScale`; every screen that
 * prints or types money reads it through here, so none of them can disagree
 * about what `1250` means.
 */

import { logIsEmpty, moneyScale } from '../lib/moneyUnits';
import { useMoney } from '../state/moneyStore';
import { useSettings } from '../state/settingsStore';

export function useMoneyScale(): number {
  const currency = useSettings((s) => s.currencyCode);
  const pinned = useMoney((s) => s.scale);
  const empty = useMoney((s) => logIsEmpty(s.amounts, s.accounts));
  return moneyScale({ pinned, empty, currency });
}
