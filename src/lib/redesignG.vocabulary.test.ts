import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { translatedKeys } from './i18n';

/**
 * The 2.9 redesign's vocabulary (§6): one name per thing, everywhere. The
 * assistant is the "AI coach" (Google Gemini is only the provider, named where
 * it is chosen), the money section is "Finance", and where the money sits is an
 * "account" — never a "subsection". A grep rather than a render, because the old
 * names came back the way they left: one `t('…')` at a time, in screens nobody
 * was looking at.
 *
 * `appGuide.ts` is skipped: it is the model's map of the app, refreshed in its
 * own pass, and quotes the labels it describes.
 */

const SKIP = [/[\\/]ai[\\/]appGuide\.ts$/];

/** Every .ts/.tsx under `src`, tests excluded. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out.filter((path) => !SKIP.some((skip) => skip.test(path)));
}

/** A `t('…')` whose string — on the call's line or the next — names a retired word. */
const RETIRED = [
  /t\(\s*'[^']*[Ss]ubsection[^']*'/,
  /t\(\s*'[^']*AI assistant[^']*'/,
  /t\(\s*'Coach[^']*'/,
  /t\(\s*'Gemini[^']*'/,
];

describe('2.9 redesign: vocabulary', () => {
  it('no visible string says subsection, AI assistant, Coach or Gemini', () => {
    const root = join(__dirname, '..');
    const found: string[] = [];
    for (const path of sourceFiles(root)) {
      const lines = readFileSync(path, 'utf8').split('\n');
      lines.forEach((line, index) => {
        /* A call broken by prettier keeps its string on the line after `t(`. */
        const call = `${line}${/t\(\s*$/.test(line) ? (lines[index + 1] ?? '') : ''}`;
        if (RETIRED.some((pattern) => pattern.test(call)))
          found.push(`${relative(root, path)}:${index + 1}`);
      });
    }
    expect(found).toEqual([]);
  });

  it('the renamed strings are in Russian, and the old keys are gone', () => {
    const keys = translatedKeys();
    for (const key of [
      'Account',
      'Edit account',
      'Move money between accounts',
      'Switch to this account',
      'Open the AI coach',
      'AI coach · Workout',
      'AI coach · Tasks',
      'AI coach · Finance',
      'The AI coach is overloaded right now. Try again in a minute.',
      'Ask the AI coach for a summary',
      'AI coach · from these figures only',
    ])
      expect(keys).toContain(key);
    for (const key of ['Subsection', 'AI assistant', 'Open the AI assistant', 'AI · Expenses'])
      expect(keys).not.toContain(key);
  });
});
