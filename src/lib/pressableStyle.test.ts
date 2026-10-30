import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A `style` CALLBACK on React Native's own `Pressable` never renders here: the
 * NativeWind wrapper drops a function style without a warning
 * (`components/Pressable.tsx` has the whole story). The 2.9 redesign shipped three
 * new controls that way — chips and buttons that would have drawn with no size,
 * border or fill on the phone, and passed every other check. This is the check.
 */

const SRC = join(__dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

/** True when the file takes `Pressable` from react-native AND gives one a function style. */
function dropsAStyle(source: string): boolean {
  const imported = source.match(/^import \{([^}]*)\} from 'react-native';/m);
  if (!imported || !/(^|[\s,])Pressable([\s,]|$)/.test(imported[1])) return false;
  for (const match of source.matchAll(/<Pressable\b/g)) {
    const tag = source.slice(match.index, source.indexOf('>\n', match.index) + 1);
    if (/style=\{\s*(\(|pressedStyle\b)/.test(tag)) return true;
  }
  return false;
}

describe('pressed styles', () => {
  it('no file gives React Native’s Pressable a style callback', () => {
    const offenders = sources(SRC)
      .filter((file) => !file.endsWith(join('components', 'Pressable.tsx')))
      .filter((file) => dropsAStyle(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file).split('\\').join('/'));
    expect(offenders).toEqual([]);
  });

  it('catches the shape it is meant to catch', () => {
    const bad = `import { Pressable, Text } from 'react-native';\n<Pressable\n  style={({ pressed }) => [{ opacity: 1 }]}\n>\n`;
    const good = `import { Text } from 'react-native';\nimport { Pressable } from './Pressable';\n<Pressable\n  style={({ pressed }) => [{ opacity: 1 }]}\n>\n`;
    expect(dropsAStyle(bad)).toBe(true);
    expect(dropsAStyle(good)).toBe(false);
  });
});
