import { describe, expect, it } from 'vitest';

import { APP_VARIANTS, backupPrefix } from './appVariant';
import {
  LEGACY_BACKUP_FILE_PREFIX,
  backupFileBaseName,
  backupFilesToRetire,
  classifyBackupError,
  daysSince,
  describeBackupAge,
  failureNeedsFolder,
  isBackupFileName,
  padToCover,
  planBackupWrite,
  uriFileName,
  usableBackupFile,
  utf8ByteLength,
  type BackupFailure,
} from './autoBackup';

/**
 * The backup file's decisions: which file a write goes to, what is deleted after
 * it, and that an overwrite can never leave a file that does not parse.
 *
 * The groups that matter most are the sweep — whatever it matches is DELETED, so
 * it must match this mechanism's files and nothing else, least of all the
 * `workout-tracker-*` files older builds left — and the padding, which is the
 * difference between a backup and a file of JSON with garbage after it.
 */

const NOW = new Date('2026-09-02T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

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

  it('reads a clock that went backwards as today, not as a negative age', () => {
    expect(daysSince(new Date(NOW.getTime() + 3 * 86_400_000).toISOString(), NOW)).toBe(0);
    expect(daysSince('yesterday-ish', NOW)).toBeNull();
  });

  it('says it in words, because the row only answers "recent enough"', () => {
    expect(describeBackupAge(undefined, NOW)).toBe('Never');
    expect(describeBackupAge(daysAgo(0), NOW)).toBe('Today');
    expect(describeBackupAge(daysAgo(1), NOW)).toBe('Yesterday');
    expect(describeBackupAge(daysAgo(12), NOW)).toBe('12 days ago');
  });
});

describe('the file name', () => {
  it('is the app’s own prefix and the LOCAL date', () => {
    expect(backupFileBaseName(new Date(2026, 8, 2, 23, 59))).toBe(
      'momentum-workout-backup-2026-09-02',
    );
    expect(backupFileBaseName(new Date(2026, 0, 5, 0, 1), 'tasks')).toBe(
      'momentum-tasks-backup-2026-01-05',
    );
    expect(backupFileBaseName(new Date(2026, 0, 5), 'expenses')).toBe(
      'momentum-expenses-backup-2026-01-05',
    );
  });

  it('is never 2.x’s combined name, in any app', () => {
    // The combined file is what Tasks and Expenses import from: no app may write
    // over it, or match it in a sweep.
    for (const variant of APP_VARIANTS) {
      expect(
        backupFileBaseName(new Date(2026, 10, 3), variant).startsWith(LEGACY_BACKUP_FILE_PREFIX),
      ).toBe(false);
      expect(isBackupFileName('momentum-backup-2026-11-03.json', variant)).toBe(false);
    }
  });

  it('recognises exactly what SAF makes of it', () => {
    for (const variant of APP_VARIANTS) {
      const base = backupFileBaseName(new Date(2026, 9, 15), variant);
      expect(isBackupFileName(`${base}.json`, variant)).toBe(true);
      // SAF's answer to a same-named create.
      expect(isBackupFileName(`${base} (1).json`, variant)).toBe(true);
      // No extension is not a file SAF wrote.
      expect(isBackupFileName(base, variant)).toBe(false);
    }
  });

  it('recognises only this app’s files, never another app’s', () => {
    for (const mine of APP_VARIANTS) {
      for (const theirs of APP_VARIANTS) {
        const name = `${backupFileBaseName(new Date(2026, 9, 15), theirs)}.json`;
        expect(isBackupFileName(name, mine)).toBe(mine === theirs);
      }
    }
  });

  it('reads the name off a SAF document URI', () => {
    expect(
      uriFileName(
        'content://com.android.externalstorage.documents/tree/primary%3ADownload/document/primary%3ADownload%2Fmomentum-backup-2026-11-03.json',
      ),
    ).toBe('momentum-backup-2026-11-03.json');
  });
});

describe('overwrite or create', () => {
  const today = '2026-10-15';
  const own = (day: string) =>
    `content://tree/Download/document/Download%2F${backupPrefix('workout')}${day}.json`;

  it('overwrites today’s file in place', () => {
    expect(planBackupWrite({ uri: 'content://a', day: today }, today)).toEqual({
      kind: 'overwrite',
      uri: 'content://a',
    });
    expect(planBackupWrite({ uri: own(today), day: today }, today, 'workout')).toEqual({
      kind: 'overwrite',
      uri: own(today),
    });
  });

  it('creates a new file on a new day, replacing yesterday’s', () => {
    // Rewriting yesterday's file with today's data would make its name lie.
    expect(planBackupWrite({ uri: 'content://a', day: '2026-10-14' }, today)).toEqual({
      kind: 'create',
      replaces: 'content://a',
    });
  });

  it('creates one when there is no file yet', () => {
    expect(planBackupWrite(undefined, today)).toEqual({ kind: 'create' });
  });

  it('never overwrites or deletes 2.x’s combined file it inherited the record of', () => {
    // The Workout app's first write after 3.0.0 updates the 2.x install, whose
    // settings remember `momentum-backup-<day>.json`.
    const legacy = 'content://tree/Download/document/Download%2Fmomentum-backup-2026-10-15.json';
    expect(planBackupWrite({ uri: legacy, day: today }, today, 'workout')).toEqual({
      kind: 'create',
    });
    expect(planBackupWrite({ uri: legacy, day: '2026-10-14' }, today, 'workout')).toEqual({
      kind: 'create',
    });
  });

  it('never touches a remembered file that is another app’s', () => {
    const tasks = `content://tree/Download/document/Download%2F${backupPrefix('tasks')}${today}.json`;
    expect(planBackupWrite({ uri: tasks, day: today }, today, 'expenses')).toEqual({
      kind: 'create',
    });
  });
});

describe('retiring the old files once the new one exists', () => {
  const file = (name: string) => ({ uri: `content://tree/Download/${name}`, name });

  it('deletes the replaced file and every other copy of its own, keeping the new one', () => {
    const newest = file('momentum-workout-backup-2026-10-15.json');
    const files = [
      file('momentum-workout-backup-2026-10-14.json'),
      file('momentum-workout-backup-2026-10-15 (1).json'),
      newest,
    ];
    expect(backupFilesToRetire(files, newest.uri, files[0].uri)).toEqual([
      files[0].uri,
      files[1].uri,
    ]);
  });

  it('deletes the replaced file even when the listing could not be read', () => {
    // `listFolder` is empty on failure; the stored URI still goes.
    expect(backupFilesToRetire([], 'content://new', 'content://old')).toEqual(['content://old']);
  });

  it('never deletes the file just written, even if it was the one "replaced"', () => {
    expect(backupFilesToRetire([], 'content://same', 'content://same')).toEqual([]);
  });

  it('leaves older builds’ files and anything the user named alone', () => {
    const newest = file('momentum-workout-backup-2026-10-15.json');
    const files = [
      file('workout-tracker-auto-2026-10-01.json'),
      file('workout-tracker-backup-2026-10-01-0900.json'),
      file('momentum-amounts-2026-10-01-0900.csv'),
      file('momentum-workouts-2026-10-01-0900.csv'),
      file('momentum-workout-backup-mine.json'),
      file('momentum-workout-backup-2026-10-01.json.bak'),
      file('photo.jpg'),
      newest,
    ];
    expect(backupFilesToRetire(files, newest.uri)).toEqual([]);
  });

  it('isolates the three apps sharing one folder, and spares the combined 2.x file', () => {
    // One folder, granted to all three apps, holding every kind of backup.
    const folder = [
      file('momentum-backup-2026-11-03.json'),
      file('momentum-backup-2026-11-02.json'),
      ...APP_VARIANTS.flatMap((variant) => [
        file(`${backupPrefix(variant)}2026-11-03.json`),
        file(`${backupPrefix(variant)}2026-11-04.json`),
      ]),
    ];
    for (const variant of APP_VARIANTS) {
      const justWritten = `content://tree/Download/${backupPrefix(variant)}2026-11-04.json`;
      expect(backupFilesToRetire(folder, justWritten, undefined, variant)).toEqual([
        `content://tree/Download/${backupPrefix(variant)}2026-11-03.json`,
      ]);
    }
  });
});

describe('the stored file record', () => {
  it('keeps a usable one', () => {
    expect(usableBackupFile({ uri: 'content://a', day: '2026-10-15' })).toEqual({
      uri: 'content://a',
      day: '2026-10-15',
    });
  });

  it('drops anything else rather than overwriting the wrong file', () => {
    for (const bad of [
      undefined,
      null,
      'content://a',
      ['content://a'],
      { uri: '', day: '2026-10-15' },
      { uri: 'content://a' },
      { uri: 'content://a', day: 'yesterday' },
      { uri: 42, day: '2026-10-15' },
    ]) {
      expect(usableBackupFile(bad)).toBeUndefined();
    }
  });
});

describe('overwriting without truncation', () => {
  it('counts UTF-8 bytes, not UTF-16 units', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    // Cyrillic is two bytes a letter: most of this user's data.
    expect(utf8ByteLength('Жим')).toBe(6);
    expect(utf8ByteLength('—')).toBe(3);
    // A surrogate pair is one four-byte character.
    expect(utf8ByteLength('💪')).toBe(4);
    expect(utf8ByteLength('')).toBe(0);
  });

  it('pads a shorter backup to cover every byte of the old one', () => {
    const padded = padToCover('{"a":1}\n', 20);
    expect(utf8ByteLength(padded)).toBe(20);
    expect(padded.startsWith('{"a":1}\n')).toBe(true);
  });

  it('leaves a backup that is already long enough alone', () => {
    expect(padToCover('{"a":1}\n', 3)).toBe('{"a":1}\n');
    expect(padToCover('{"a":1}\n', 8)).toBe('{"a":1}\n');
  });

  it('still parses, whatever was underneath — the property the padding is for', () => {
    const old = JSON.stringify({ chats: ['Жим лёжа — 5×5'.repeat(20)] }, null, 2) + '\n';
    const next = JSON.stringify({ chats: [] }, null, 2) + '\n';
    const written = padToCover(next, utf8ByteLength(old));

    // What a provider that does NOT truncate leaves on disk: the new bytes over
    // the old ones, and the old ones' tail after them.
    const disk = Buffer.from(old, 'utf8');
    Buffer.from(written, 'utf8').copy(disk, 0);
    expect(JSON.parse(disk.toString('utf8'))).toEqual({ chats: [] });

    // Without the padding the same disk would not parse.
    const unpadded = Buffer.from(old, 'utf8');
    Buffer.from(next, 'utf8').copy(unpadded, 0);
    expect(() => JSON.parse(unpadded.toString('utf8'))).toThrow();
  });
});

describe('why a write did not happen', () => {
  it('asks for a folder only when a folder would fix it', () => {
    const all: BackupFailure[] = [
      'no-folder',
      'access',
      'off',
      'not-ready',
      'unreadable-log',
      'write',
    ];
    expect(all.filter(failureNeedsFolder)).toEqual(['no-folder', 'access']);
  });

  it('tells a lost folder from an unreadable log from everything else', () => {
    const named = (name: string) => Object.assign(new Error('x'), { name });
    expect(classifyBackupError(named('FolderAccessError'))).toBe('access');
    expect(classifyBackupError(named('UnreadableLogError'))).toBe('unreadable-log');
    expect(classifyBackupError(new Error('disk full'))).toBe('write');
    expect(classifyBackupError('a string')).toBe('write');
  });
});
