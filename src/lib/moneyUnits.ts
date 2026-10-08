/**
 * Cents — a decimal key on the money keypad, without touching one stored amount
 * (U25).
 *
 *   USD, fresh log            AMD, or any log already written in whole units
 *   ┌────┬────┬────┐          ┌────┬────┬────┐
 *   │ 7  │ 8  │ 9  │          │ 7  │ 8  │ 9  │
 *   │ .  │ 0  │ ⌫  │          │000 │ 0  │ ⌫  │
 *   └────┴────┴────┘          └────┴────┴────┘
 *   12.50 → stored 1250       12,500 → stored 12500 (as it always was)
 *
 * ── WHAT WAS THERE ────────────────────────────────────────────────────────
 *
 * Every amount is a plain integer in WHOLE units, and the currency is a LABEL
 * (`settingsStore.currencyCode`): changing it converts nothing and repaints
 * three letters. There was no minor-unit concept anywhere — so "store minor
 * units" cannot simply be switched on: an existing `12` typed as twelve dollars
 * would read as twelve cents the moment the app believed USD meant hundredths.
 *
 * ── THE DECISION: THE SCALE BELONGS TO THE LOG, AND IS PINNED ONCE ────────
 *
 * `moneyStore.scale` says how many digits after the point EVERY stored integer
 * in this log carries: 0 → `12500` is 12,500; 2 → `1250` is 12.50. It is:
 *
 *   • ABSENT on every log written before this change, and in every backup made
 *     by 2.2.0 — and absent on a log that already holds money means 0. So every
 *     existing amount keeps its value AND its meaning; nothing is rewritten.
 *   • On an EMPTY log (no amounts, every opening 0), it follows the currency
 *     label through `MINOR_UNITS` — so a fresh install counting in USD gets the
 *     `.` key from its first amount.
 *   • PINNED by the first write (`pinScale`, called by the amount editor and the
 *     balance sheet just before they save), so changing the label afterwards
 *     cannot reinterpret what is stored. A USD log stays in cents if the label
 *     later says AMD; an AMD log stays whole if it later says USD — the settings
 *     screen says why that log has no `.` key.
 *
 * Amounts stay INTEGERS in storage, always: the keypad's string becomes minor
 * units at the edge (`entryToMinor`), every sum stays integer arithmetic, and
 * only the formatter (`formatValue(value, scale)`) puts a point back in.
 *
 * REJECTED:
 *   • Scale per currency code, no pin. Simplest, and it silently divides every
 *     amount by 100 for anyone whose label is, or later becomes, USD.
 *   • Multiplying the log by 100 on adoption. Correct arithmetic, but it rewrites
 *     every stored value — and every backup taken before it then means something
 *     else. Never.
 *   • A `cents` field beside each amount's whole `value`. Two numbers per amount,
 *     and every total, chart and balance would have to remember to add both.
 *
 * Two decimals at most: no currency this app is likely to count in uses three,
 * and the keypad caps the fraction at the scale.
 */

/**
 * Digits after the point that people actually TYPE, per code — sub-units in
 * circulation, not ISO 4217's exponent. AMD is 0 here although ISO says 2: luma
 * have not been in anyone's pocket for decades, which is why the app has always
 * counted whole drams. Anything not listed — including a label like `PTS` — is
 * whole units.
 */
export const MINOR_UNITS: Readonly<Record<string, number>> = {
  AMD: 0,
  JPY: 0,
  KRW: 0,
  USD: 2,
  EUR: 2,
  GBP: 2,
  RUB: 2,
  GEL: 2,
  UAH: 2,
  CHF: 2,
  CAD: 2,
  AUD: 2,
  CNY: 2,
  TRY: 2,
  PLN: 2,
};

/** The most digits a stored integer may carry after the point. */
export const MAX_SCALE = 2;

/** How many digits an amount may hold in all — the keypad's `MAX_DIGITS`. */
export const MAX_DIGITS = 12;

/** 0 for a currency without sub-units in use, or for a code the table does not know. */
export function minorUnitsOf(code: string): number {
  return MINOR_UNITS[code.trim().toUpperCase()] ?? 0;
}

/** A stored scale, or undefined for "never pinned" — junk is never pinned. */
export function sanitizeScale(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= MAX_SCALE
    ? raw
    : undefined;
}

/** Nothing written yet: no amount, and no opening balance set on any account. */
export function logIsEmpty(
  amounts: readonly unknown[],
  accounts: readonly { opening: number }[],
): boolean {
  return amounts.length === 0 && accounts.every((account) => account.opening === 0);
}

/**
 * The scale this log is read and written in — see the header. Pinned wins; an
 * empty log follows the label; a log with money in it and no pin is whole units.
 */
export function moneyScale(input: {
  pinned: number | undefined;
  empty: boolean;
  currency: string;
}): number {
  if (input.pinned !== undefined) return input.pinned;
  return input.empty ? minorUnitsOf(input.currency) : 0;
}

/**
 * How many decimals the keypad lets you type: the log's scale, but only while
 * the label is a currency with sub-units. 0 → `000` key; more → `.` key.
 */
export function keypadDecimals(scale: number, currency: string): number {
  return Math.min(scale, minorUnitsOf(currency));
}

/** The twelve keys, in reading order: `.` replaces `000` when there are decimals. */
export function keypadKeys(decimals: number): readonly string[] {
  return ['1', '2', '3', '4', '5', '6', '7', '8', '9', decimals > 0 ? '.' : '000', '0', 'back'];
}

/**
 * One key on the keypad's entry string — digits, at most one `.`, at most
 * `decimals` digits after it.
 *
 *   ''     + '.'  → '0.'        a bare point means "zero point"
 *   '12.'  + '.'  → '12.'       the second point is ignored
 *   '12.5' + '0'  → '12.50'
 *   '12.50'+ '1'  → '12.50'     two decimals, no more
 *   '12.5' + ⌫    → '12.'  → '12'  backspace walks back across the point
 *   '0'    + '5'  → '5'         a leading zero is never a digit anybody meant
 *
 * The whole part keeps the old cap: `MAX_DIGITS` in all, so cents cost two of
 * them. `000` after a point is ignored (it only exists on a keypad without one).
 */
export function keypadPress(entry: string, key: string, decimals: number): string {
  if (key === 'back') return entry.slice(0, -1);
  const point = entry.indexOf('.');
  if (key === '.') {
    if (decimals <= 0 || point !== -1) return entry;
    return `${entry === '' ? '0' : entry}.`;
  }
  if (!/^\d+$/.test(key)) return entry;
  if (point !== -1) {
    if (key.length > 1) return entry;
    return entry.length - point - 1 >= decimals ? entry : entry + key;
  }
  const next = (entry === '0' ? '' : entry) + key;
  return next.replace(/^0+(?=\d)/, '').slice(0, MAX_DIGITS - Math.max(0, decimals));
}

/** The entry as a stored integer: `12.5` at scale 2 → 1250. Empty → 0. */
export function entryToMinor(entry: string, scale: number): number {
  const [whole = '', fraction = ''] = entry.split('.');
  const unit = 10 ** scale;
  const cents = scale > 0 ? Number(fraction.padEnd(scale, '0').slice(0, scale)) : 0;
  return (Number(whole) || 0) * unit + (cents || 0);
}

/** A stored integer as the entry the keypad opens on: 1250 → `12.5`, 1205 → `12.05`. */
export function minorToEntry(value: number, scale: number): string {
  const abs = Math.round(Math.abs(value));
  if (scale <= 0) return String(abs);
  const unit = 10 ** scale;
  const fraction = abs % unit;
  const whole = String(Math.floor(abs / unit));
  if (fraction === 0) return whole;
  return `${whole}.${String(fraction).padStart(scale, '0').replace(/0+$/, '')}`;
}

/** The entry as the hero shows it while typing: `1234.5` → `1,234.5`, '' → `0`. */
export function formatEntry(entry: string): string {
  if (entry === '') return '0';
  const point = entry.indexOf('.');
  const whole = point === -1 ? entry : entry.slice(0, point);
  const grouped = (Number(whole) || 0).toLocaleString('en-US');
  return point === -1 ? grouped : `${grouped}${entry.slice(point)}`;
}

/**
 * A whole-unit figure typed into the balance field, in this log's integers.
 * The balance field types whole units; the cents already there survive a Save
 * that did not change the whole part (see `BalanceSheet`).
 */
export function majorToMinor(value: number, scale: number): number {
  return Math.round(value * 10 ** scale);
}

/**
 * What the finance settings say under the label, so the `.` key is never a
 * mystery: `cents` when the keypad has it, `wholeLog` when the label has cents
 * but this log was already written in whole units (and so stays in them), and
 * null when there is nothing to explain.
 */
export function centsNote(scale: number, currency: string): 'cents' | 'wholeLog' | null {
  if (keypadDecimals(scale, currency) > 0) return 'cents';
  if (minorUnitsOf(currency) > 0 && scale === 0) return 'wholeLog';
  return null;
}
