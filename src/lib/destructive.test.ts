import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
  DANGER_HUE_ALLOWED,
  confirmSheetUses,
  confirmsMissingDanger,
  importsDangerHue,
  isDestructiveLabel,
} from './destructive';

const SRC = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

describe('isDestructiveLabel', () => {
  it('knows the answers that lose something', () => {
    for (const label of [
      "t('Delete it')",
      "t('Archive it')",
      "t('Discard changes')",
      "t('Reset settings')",
      "t('Throw it away')",
      "t('Import it')",
      "t('Restart it')",
      "t('Disconnect')",
      "t('Remove it')",
      "t('Delete everything')",
    ]) {
      expect(isDestructiveLabel(label), label).toBe(true);
    }
  });

  it('leaves the answers that lose nothing alone', () => {
    for (const label of ["t('Save')", "t('Keep it')", "t('Start')", "t('Apply')"]) {
      expect(isDestructiveLabel(label), label).toBe(false);
    }
  });
});

describe('confirmSheetUses', () => {
  const source = [
    'const a = 1;',
    '<ConfirmSheet',
    '  tone="danger"',
    "  title={t('Delete?')}",
    "  confirmLabel={t('Delete it')}",
    '  onConfirm={go}',
    '/>',
    '<ConfirmSheet',
    "  title={t('Archive?')}",
    "  confirmLabel={t('Archive it')}",
    '/>',
    '<ConfirmSheet tone={x} confirmLabel={t("Remove it")} />',
  ].join('\n');

  it('reads each confirm with its label, tone and line', () => {
    expect(confirmSheetUses(source)).toEqual([
      { line: 2, confirmLabel: "t('Delete it')", tone: 'danger' },
      { line: 8, confirmLabel: "t('Archive it')", tone: 'primary' },
      { line: 12, confirmLabel: 't("Remove it")', tone: 'primary' },
    ]);
  });

  it('flags a destructive confirm without the danger tone — a computed tone too', () => {
    expect(confirmsMissingDanger(source).map((use) => use.line)).toEqual([8, 12]);
  });
});

describe('importsDangerHue', () => {
  it('sees `danger` in a tokens import and nothing else', () => {
    expect(importsDangerHue("import { danger, palette } from '../theme/tokens';")).toBe(true);
    expect(importsDangerHue("import {\n  curve,\n  danger,\n} from '../theme/tokens';")).toBe(true);
    expect(importsDangerHue("import { dangerTint, palette } from '../theme/tokens';")).toBe(false);
    expect(importsDangerHue("import { danger } from './somewhere';")).toBe(false);
  });
});

/**
 * THE RULE, OVER THE WHOLE APP (U19). Every destructive confirm asks in coral,
 * and the coral appears nowhere else — not on the controls that open those
 * confirms, which are muted text at the foot of their screens.
 */
describe('the one destructive rule, across src', () => {
  const files = sourceFiles(SRC);

  it('finds the confirms it is meant to check', () => {
    const count = files.reduce(
      (sum, file) => sum + confirmSheetUses(readFileSync(file, 'utf8')).length,
      0,
    );
    expect(count).toBeGreaterThanOrEqual(15);
  });

  it('gives every destructive confirm tone="danger"', () => {
    const offenders = files.flatMap((file) =>
      confirmsMissingDanger(readFileSync(file, 'utf8')).map(
        (use) => `${relative(SRC, file)}:${use.line} ${use.confirmLabel}`,
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('keeps the danger hue off every control', () => {
    const offenders = files
      .filter((file) => importsDangerHue(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file).split('\\').join('/'))
      .filter((file) => !DANGER_HUE_ALLOWED.includes(file));
    expect(offenders).toEqual([]);
  });
});
