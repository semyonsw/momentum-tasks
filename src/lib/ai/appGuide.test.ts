import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { APP_GUIDE, APP_GUIDE_RULES } from './appGuide';
import { systemPrompt } from './aiPrompts';

/**
 * The app guide is only worth sending if it is TRUE. Every label it quotes must
 * still be a string somewhere in the app's source: rename or remove a button and
 * this names the guide line that now describes something that is not there.
 */

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) && name !== 'appGuide.ts' ? [path] : [];
  });
}

const SOURCE = sources(join(__dirname, '..', '..'))
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');

/** A quoted label worth checking: no placeholders, ellipses or invented numbers. */
function checkable(label: string): boolean {
  return (
    label.length >= 3 &&
    !/[<>…]/.test(label) &&
    !/\b[NM]\b/.test(label) &&
    !/m:ss|mm:ss/.test(label)
  );
}

describe('the app guide', () => {
  const quoted = [...APP_GUIDE.matchAll(/"([^"\n]+)"/g)].map((m) => m[1]).filter(checkable);

  it('quotes a real number of labels', () => {
    expect(quoted.length).toBeGreaterThan(20);
  });

  it('quotes only labels that still exist in the source', () => {
    const missing = [...new Set(quoted)].filter((label) => !SOURCE.includes(label));
    expect(missing).toEqual([]);
  });

  it('goes with the chat, after the tasks’ own rules', () => {
    const prompt = systemPrompt('en');
    expect(prompt).toContain(APP_GUIDE_RULES);
    expect(prompt.endsWith(APP_GUIDE)).toBe(true);
  });

  /* A path of taps into a screen the app does not have is a wrong answer. */
  it('describes only this app', () => {
    expect(APP_GUIDE).toContain('### Tasks screen');
    expect(APP_GUIDE).not.toMatch(/routine|workout|Finance|Health Connect|CSV/i);
    expect(APP_GUIDE).not.toMatch(/\bHome\b/);
    expect(APP_GUIDE).toContain('Two items: "Tasks"');
  });
});
