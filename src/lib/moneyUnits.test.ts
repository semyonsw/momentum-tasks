import { describe, expect, it } from 'vitest';

import { formatMoney, formatValue } from './money';
import {
  MAX_DIGITS,
  centsNote,
  entryToMinor,
  formatEntry,
  keypadDecimals,
  keypadKeys,
  keypadPress,
  logIsEmpty,
  majorToMinor,
  minorToEntry,
  minorUnitsOf,
  moneyScale,
  sanitizeScale,
  typedToMinor,
} from './moneyUnits';

/** Every key in turn, from an empty entry. */
function type(keys: string[], decimals: number, from = ''): string {
  return keys.reduce((entry, key) => keypadPress(entry, key, decimals), from);
}

describe('minorUnitsOf', () => {
  it('knows the currencies with cents in use, and AMD has none', () => {
    expect(minorUnitsOf('USD')).toBe(2);
    expect(minorUnitsOf('EUR')).toBe(2);
    expect(minorUnitsOf('usd ')).toBe(2);
    expect(minorUnitsOf('AMD')).toBe(0);
    expect(minorUnitsOf('JPY')).toBe(0);
  });

  it('reads an unknown label — points, tokens — as whole units', () => {
    expect(minorUnitsOf('PTS')).toBe(0);
    expect(minorUnitsOf('')).toBe(0);
  });
});

describe('the decimal key appears only for currencies with minor units', () => {
  it('USD and EUR on a fresh log get `.` in place of `000`', () => {
    for (const currency of ['USD', 'EUR']) {
      const scale = moneyScale({ pinned: undefined, empty: true, currency });
      expect(scale).toBe(2);
      const decimals = keypadDecimals(scale, currency);
      expect(decimals).toBe(2);
      expect(keypadKeys(decimals)[9]).toBe('.');
      expect(keypadKeys(decimals)).not.toContain('000');
    }
  });

  it('AMD keeps `000`, fresh or not', () => {
    for (const empty of [true, false]) {
      const scale = moneyScale({ pinned: undefined, empty, currency: 'AMD' });
      expect(scale).toBe(0);
      expect(keypadKeys(keypadDecimals(scale, 'AMD'))[9]).toBe('000');
    }
  });

  it('a log already written in whole units stays whole, even labelled USD', () => {
    expect(moneyScale({ pinned: undefined, empty: false, currency: 'USD' })).toBe(0);
    expect(moneyScale({ pinned: 0, empty: true, currency: 'USD' })).toBe(0);
    expect(keypadDecimals(0, 'USD')).toBe(0);
    expect(centsNote(0, 'USD')).toBe('wholeLog');
  });

  it('a log pinned in cents stays in cents, and offers `.` only while the label has cents', () => {
    expect(moneyScale({ pinned: 2, empty: false, currency: 'AMD' })).toBe(2);
    expect(keypadDecimals(2, 'AMD')).toBe(0);
    expect(keypadDecimals(2, 'EUR')).toBe(2);
    expect(centsNote(2, 'EUR')).toBe('cents');
    expect(centsNote(0, 'AMD')).toBeNull();
  });

  it('twelve keys either way, with ⌫ last', () => {
    expect(keypadKeys(0)).toHaveLength(12);
    expect(keypadKeys(2)).toHaveLength(12);
    expect(keypadKeys(2)[11]).toBe('back');
  });
});

describe('keypadPress — the entry reducer', () => {
  it('types digits, dropping a leading zero', () => {
    expect(type(['1', '2', '5'], 2)).toBe('125');
    expect(type(['0', '5'], 2)).toBe('5');
    expect(type(['0', '0'], 0)).toBe('0');
  });

  it('a point starts the fraction; a bare point is "0."', () => {
    expect(type(['1', '2', '.', '5'], 2)).toBe('12.5');
    expect(type(['.', '5'], 2)).toBe('0.5');
  });

  it('ignores a second point', () => {
    expect(type(['1', '.', '.', '5'], 2)).toBe('1.5');
    expect(type(['1', '.', '5', '.', '0'], 2)).toBe('1.50');
  });

  it('caps the fraction at two decimals', () => {
    expect(type(['9', '.', '9', '9', '9', '9'], 2)).toBe('9.99');
  });

  it('ignores the point where there are no decimals', () => {
    expect(type(['1', '.', '5'], 0)).toBe('15');
  });

  it('backspaces across the point, one character at a time', () => {
    const entry = type(['1', '2', '.', '3', '4'], 2);
    expect(entry).toBe('12.34');
    const steps = [];
    let current = entry;
    for (let i = 0; i < 6; i += 1) {
      current = keypadPress(current, 'back', 2);
      steps.push(current);
    }
    expect(steps).toEqual(['12.3', '12.', '12', '1', '', '']);
    // And typing again after the point is gone starts the whole part again.
    expect(keypadPress('12', '5', 2)).toBe('125');
  });

  it('keeps `000` exactly as it was without decimals', () => {
    expect(type(['5', '000'], 0)).toBe('5000');
    expect(type(['000'], 0)).toBe('0');
    expect(type(['1', '.', '000'], 2)).toBe('1.');
  });

  it('holds the whole part to the cap, two digits fewer with cents', () => {
    const many = Array.from({ length: 20 }, () => '9');
    expect(type(many, 0)).toHaveLength(MAX_DIGITS);
    expect(type(many, 2)).toHaveLength(MAX_DIGITS - 2);
    expect(type([...many, '.', '9', '9'], 2)).toBe(`${'9'.repeat(MAX_DIGITS - 2)}.99`);
  });
});

describe('amounts stay integers in minor units', () => {
  it('converts the entry at the edge', () => {
    expect(entryToMinor('12.5', 2)).toBe(1250);
    expect(entryToMinor('12.05', 2)).toBe(1205);
    expect(entryToMinor('12.', 2)).toBe(1200);
    expect(entryToMinor('0.5', 2)).toBe(50);
    expect(entryToMinor('', 2)).toBe(0);
    for (const entry of ['12.5', '0.01', '999.99', `${'9'.repeat(10)}.99`]) {
      expect(Number.isInteger(entryToMinor(entry, 2)), entry).toBe(true);
    }
  });

  it('never meets a float on the way: 0.1 + 0.2 is 30 cents exactly', () => {
    expect(entryToMinor('0.1', 2) + entryToMinor('0.2', 2)).toBe(entryToMinor('0.3', 2));
  });

  it('leaves AMD amounts exactly as typed — a whole number is the stored number', () => {
    expect(entryToMinor('12500', 0)).toBe(12500);
    expect(minorToEntry(12500, 0)).toBe('12500');
    expect(formatValue(12500)).toBe('12,500');
    expect(formatValue(12500, 0)).toBe('12,500');
    expect(formatMoney(12500, 'AMD')).toBe('12,500 AMD');
  });

  it('opens an existing amount on the entry that produces it again', () => {
    for (const value of [1250, 1205, 1200, 1, 0, 999999]) {
      expect(entryToMinor(minorToEntry(value, 2), 2), String(value)).toBe(value);
    }
    expect(minorToEntry(1250, 2)).toBe('12.5');
    expect(minorToEntry(1205, 2)).toBe('12.05');
    expect(minorToEntry(1200, 2)).toBe('12');
  });

  it('prints a cents log with its point, and only when there are cents', () => {
    expect(formatValue(1250, 2)).toBe('12.50');
    expect(formatValue(1205, 2)).toBe('12.05');
    expect(formatValue(123456789, 2)).toBe('1,234,567.89');
    expect(formatValue(1200, 2)).toBe('12');
    expect(formatValue(-1250, 2)).toBe('-12.50');
    expect(formatMoney(1250, 'USD', 2)).toBe('12.50 USD');
  });

  it('shows the entry as it is typed', () => {
    expect(formatEntry('')).toBe('0');
    expect(formatEntry('1234')).toBe('1,234');
    expect(formatEntry('1234.')).toBe('1,234.');
    expect(formatEntry('1234.5')).toBe('1,234.5');
  });

  it('types the balance in whole units', () => {
    expect(majorToMinor(40000, 0)).toBe(40000);
    expect(majorToMinor(400, 2)).toBe(40000);
    expect(majorToMinor(-12, 2)).toBe(-1200);
  });
});

describe('the scale on disk', () => {
  it('is 0–2 or never pinned', () => {
    expect(sanitizeScale(0)).toBe(0);
    expect(sanitizeScale(2)).toBe(2);
    for (const junk of [undefined, null, -1, 3, 1.5, '2', NaN]) {
      expect(sanitizeScale(junk), String(junk)).toBeUndefined();
    }
  });

  it('a log is empty with no amounts and no opening balance', () => {
    expect(logIsEmpty([], [{ opening: 0 }, { opening: 0 }])).toBe(true);
    expect(logIsEmpty([{}], [{ opening: 0 }])).toBe(false);
    expect(logIsEmpty([], [{ opening: 500 }])).toBe(false);
  });
});

describe('typedToMinor — a plan figure typed on the phone keyboard', () => {
  it('reads whole units with or without thousands formatting', () => {
    expect(typedToMinor('80000', 0)).toBe(80000);
    expect(typedToMinor('80 000', 0)).toBe(80000);
    expect(typedToMinor('80,000', 0)).toBe(80000);
  });

  it('keeps a fraction in a log in cents, and drops it in a whole-unit log', () => {
    expect(typedToMinor('12.50', 2)).toBe(1250);
    expect(typedToMinor('12,5', 2)).toBe(1250);
    expect(typedToMinor('1,250.75', 2)).toBe(125075);
    expect(typedToMinor('1234.50', 0)).toBe(1234);
  });

  it('is null for nothing, or for something that is not a number', () => {
    expect(typedToMinor('', 0)).toBeNull();
    expect(typedToMinor('  ', 2)).toBeNull();
    expect(typedToMinor('12a', 0)).toBeNull();
    expect(typedToMinor('-5', 0)).toBeNull();
  });
});
