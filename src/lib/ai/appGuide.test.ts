import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { APP_VARIANTS } from '../appVariant';
import { APP_GUIDE_RULES, appGuide } from './appGuide';
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
  const quoted = (guide: string) =>
    [...guide.matchAll(/"([^"\n]+)"/g)].map((m) => m[1]).filter(checkable);

  it('quotes a real number of labels', () => {
    expect(quoted(appGuide('workout')).length).toBeGreaterThan(150);
    expect(quoted(appGuide('tasks')).length).toBeGreaterThan(20);
    expect(quoted(appGuide('expenses')).length).toBeGreaterThan(30);
  });

  it.each(APP_VARIANTS)('quotes only labels that still exist in the source (%s)', (variant) => {
    const missing = [...new Set(quoted(appGuide(variant)))].filter(
      (label) => !SOURCE.includes(label),
    );
    expect(missing).toEqual([]);
  });

  it('goes with every section, after that section’s own rules, as that app’s map', () => {
    const app = { Workout: 'workout', Tasks: 'tasks', Expenses: 'expenses' } as const;
    for (const section of ['Workout', 'Tasks', 'Expenses'] as const) {
      const prompt = systemPrompt(section, 'en');
      expect(prompt).toContain(APP_GUIDE_RULES);
      expect(prompt.endsWith(appGuide(app[section]))).toBe(true);
    }
  });

  it('describes the warm-up toggle, the question the 2.8 fix was for', () => {
    expect(appGuide('workout')).toMatch(/W warm-up toggle/);
  });

  /*
   * THE SPLIT (3.0.0): each app's assistant describes that app and no other. A
   * path of taps into a section the APK does not have is a wrong answer.
   */
  it('describes only its own app', () => {
    const workout = appGuide('workout');
    const tasks = appGuide('tasks');
    const expenses = appGuide('expenses');

    expect(workout).toContain('### Live session screen');
    expect(workout).not.toContain('### Tasks screen');
    expect(workout).not.toContain('### Finance screen');

    expect(tasks).toContain('### Tasks screen');
    expect(tasks).not.toMatch(/routine|Finance|Health Connect/i);

    expect(expenses).toContain('### Finance screen');
    expect(expenses).not.toMatch(/routine|workout|### Tasks screen|Daily tasks settings/i);
  });

  it('has no Home landing and no nav item for another section', () => {
    for (const variant of APP_VARIANTS) {
      const guide = appGuide(variant);
      expect(guide).not.toMatch(/\bHome\b/);
      expect(guide).toContain('Two items:');
    }
    expect(appGuide('tasks')).toContain('Two items: "Tasks"');
    expect(appGuide('expenses')).toContain('Two items: "Finance"');
  });

  it('lists only what that app’s assistant can change', () => {
    expect(appGuide('tasks')).not.toMatch(/log an amount|body weight/);
    expect(appGuide('expenses')).not.toMatch(/tick|training loop/);
    expect(appGuide('workout')).not.toMatch(/log an amount|tick, excuse/);
  });

  it('offers the spreadsheet export only where there is a log for it', () => {
    expect(appGuide('tasks')).not.toContain('CSV');
    expect(appGuide('workout')).toContain('CSV');
    expect(appGuide('expenses')).toContain('CSV');
  });
});
