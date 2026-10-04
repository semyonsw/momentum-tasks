import { describe, expect, it } from 'vitest';

import {
  AUTO_BACKUP_KEEP,
  autoBackupBaseName,
  daysSince,
  describeBackupAge,
  isAutoBackupName,
  rotateBackups,
  shouldBackUpNow,
  staleAutoBackups,
  type AutoBackupState,
} from './autoBackup';

/**
 * When to write a backup nobody asked for.
 *
 * `lib/backup.ts` calls a backup "the only thing standing between a year of training
 * and a factory reset" and then made it a button. These are the rules that make it
 * happen on its own instead — and the one that matters most is the last group: a
 * clock that has gone backwards must not turn the app into something that writes a
 * file on every launch.
 */

const NOW = new Date('2026-09-02T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const state = (over: Partial<AutoBackupState> = {}): AutoBackupState => ({
  enabled: true,
  folderUri: 'content://tree/primary%3ADownload',
  lastAt: daysAgo(3),
  intervalDays: 7,
  ...over,
});

describe('whether a backup is due', () => {
  it('is due once the interval has passed', () => {
    expect(shouldBackUpNow(state({ lastAt: daysAgo(6) }), NOW)).toBe(false);
    expect(shouldBackUpNow(state({ lastAt: daysAgo(7) }), NOW)).toBe(true);
    expect(shouldBackUpNow(state({ lastAt: daysAgo(40) }), NOW)).toBe(true);
  });

  it('is due immediately when nothing has ever been backed up', () => {
    // The case with the most to lose and the least excuse.
    expect(shouldBackUpNow(state({ lastAt: undefined }), NOW)).toBe(true);
  });

  it('is never due while switched off', () => {
    expect(shouldBackUpNow(state({ enabled: false, lastAt: undefined }), NOW)).toBe(false);
  });

  it('is never due with nowhere to write', () => {
    /*
     * Android's only durable destination is a folder the user granted; the app's own
     * sandbox dies with the app, which is one of the events a backup exists to
     * survive. So no folder means the feature is inert, however keen the setting is.
     */
    expect(shouldBackUpNow(state({ folderUri: undefined, lastAt: undefined }), NOW)).toBe(false);
  });

  it('treats a stamp from the future as not due, rather than as overdue', () => {
    // A timezone change or a hand-edited blob can produce one. A negative interval
    // would otherwise write a file on every launch, forever.
    const future = new Date(NOW.getTime() + 5 * 86_400_000).toISOString();
    expect(shouldBackUpNow(state({ lastAt: future }), NOW)).toBe(false);
  });

  it('refuses an interval below one day, however it reached the settings', () => {
    expect(shouldBackUpNow(state({ intervalDays: 0, lastAt: daysAgo(0) }), NOW)).toBe(false);
    expect(shouldBackUpNow(state({ intervalDays: -5, lastAt: daysAgo(0) }), NOW)).toBe(false);
  });

  it('ignores an unparseable stamp by treating it as never', () => {
    expect(shouldBackUpNow(state({ lastAt: 'yesterday-ish' }), NOW)).toBe(true);
  });
});

describe('the age of the last backup', () => {
  it('counts calendar days, not 24-hour periods', () => {
    // Local times, so the answer does not depend on the machine's time zone.
    const morning = new Date(2026, 8, 2, 8, 0);
    expect(daysSince(new Date(2026, 8, 2, 7, 0).toISOString(), morning)).toBe(0);
    // Nine hours ago, but yesterday — which is what the row has to say.
    expect(daysSince(new Date(2026, 8, 1, 23, 0).toISOString(), morning)).toBe(1);
    expect(daysSince(new Date(2026, 7, 31, 1, 0).toISOString(), morning)).toBe(2);
    expect(daysSince(undefined, NOW)).toBeNull();
  });

  it('makes a one-day interval due the next morning', () => {
    const evening = new Date(2026, 8, 1, 20, 0).toISOString();
    const morning = new Date(2026, 8, 2, 8, 0);
    expect(shouldBackUpNow(state({ lastAt: evening, intervalDays: 1 }), morning)).toBe(true);
  });

  it('says it in words, because the row only answers "recent enough"', () => {
    expect(describeBackupAge(undefined, NOW)).toBe('Never');
    expect(describeBackupAge(daysAgo(0), NOW)).toBe('Today');
    expect(describeBackupAge(daysAgo(1), NOW)).toBe('Yesterday');
    expect(describeBackupAge(daysAgo(12), NOW)).toBe('12 days ago');
  });
});

describe('rotation', () => {
  it('keeps the newest few and hands back the rest to delete', () => {
    const { keep, drop } = rotateBackups(['c', 'b', 'a'], 'd', 3);
    expect(keep).toEqual(['d', 'c', 'b']);
    expect(drop).toEqual(['a']);
  });

  it('keeps exactly one copy by default, the newest', () => {
    const existing = Array.from({ length: 10 }, (_, i) => `uri-${i}`);
    const { keep, drop } = rotateBackups(existing, 'new');
    expect(AUTO_BACKUP_KEEP).toBe(1);
    expect(keep).toEqual(['new']);
    expect(drop).toEqual(existing);
  });

  it('drops nothing on the very first write', () => {
    expect(rotateBackups([], 'first')).toEqual({ keep: ['first'], drop: [] });
  });

  it('does not list the same URI twice after a retried write', () => {
    const { keep, drop } = rotateBackups(['b', 'a'], 'a', 3);
    expect(keep).toEqual(['a', 'b']);
    expect(drop).toEqual([]);
  });

  it('always keeps at least one, however small the cap gets', () => {
    expect(rotateBackups(['a'], 'b', 0).keep).toEqual(['b']);
  });
});

describe('sweeping the folder down to one automatic copy', () => {
  const file = (name: string) => ({ uri: `content://tree/Download/${name}`, name });

  it('finds every older automatic copy by name, the URI list notwithstanding', () => {
    const newest = file('workout-tracker-auto-2026-10-04.json');
    const files = [
      file('workout-tracker-auto-2026-09-27.json'),
      file('workout-tracker-auto-2026-09-20.json'),
      file('workout-tracker-auto-2026-10-04 (1).json'),
      newest,
    ];
    expect(staleAutoBackups(files, newest.uri)).toEqual([files[0].uri, files[1].uri, files[2].uri]);
  });

  it('never touches manual exports or files the user named', () => {
    const newest = file('workout-tracker-auto-2026-10-04.json');
    const files = [
      file('workout-tracker-backup-2026-10-01-0900.json'),
      file('workout-tracker-auto-mine.json'),
      file('workout-tracker-auto-2026-09-27.json.bak'),
      file('photo.jpg'),
      newest,
    ];
    expect(staleAutoBackups(files, newest.uri)).toEqual([]);
  });

  it('recognises exactly the names autoBackupBaseName writes', () => {
    expect(isAutoBackupName(`${autoBackupBaseName(new Date(2026, 9, 4))}.json`)).toBe(true);
    expect(isAutoBackupName(autoBackupBaseName(new Date(2026, 9, 4)))).toBe(false);
  });
});

describe('the file name', () => {
  it('is dated, sortable, and obviously automatic', () => {
    expect(autoBackupBaseName(new Date(2026, 8, 2))).toBe('workout-tracker-auto-2026-09-02');
    expect(autoBackupBaseName(new Date(2026, 0, 5))).toBe('workout-tracker-auto-2026-01-05');
  });
});
