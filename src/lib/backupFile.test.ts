import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Getting a backup off the phone and back on.
 *
 * Every native module this file touches is mocked IN THE SUITE — `Platform` for
 * the one bit of `react-native` it reads, the legacy file system and the document
 * picker — because what is worth pinning is not the pickers but the decisions
 * around them: a cancelled picker is "nothing happened", a failed write leaves no
 * empty file behind to be mistaken for the newest backup, and the platform with no
 * folder picker still gets a file.
 */

const native = vi.hoisted(() => {
  const saf = {
    requestDirectoryPermissionsAsync: vi.fn(),
    createFileAsync: vi.fn(),
    deleteAsync: vi.fn(),
    readDirectoryAsync: vi.fn(),
  };
  return {
    platform: { OS: 'android' as string },
    fs: {
      StorageAccessFramework: saf as typeof saf | undefined,
      documentDirectory: 'file:///data/user/0/app/files/' as string | null,
      writeAsStringAsync: vi.fn(),
      deleteAsync: vi.fn(),
      readAsStringAsync: vi.fn(),
    },
    saf,
    picker: { getDocumentAsync: vi.fn() },
  };
});

vi.mock('react-native', () => ({ Platform: native.platform }));
vi.mock('expo-file-system/legacy', () => native.fs);
vi.mock('expo-document-picker', () => native.picker);

import {
  FolderAccessError,
  deleteFile,
  describeError,
  folderLabel,
  listFolder,
  overwriteFile,
  pickFolder,
  pickJsonFile,
  readTextFile,
  saveCsvFile,
  writeDailyBackup,
  writeToFolder,
} from './backupFile';

const TREE = 'content://com.android.externalstorage.documents/tree/primary%3ADownload';
const FILE = `${TREE}/document/primary%3ADownload%2Fmomentum-backup.json`;

beforeEach(() => {
  vi.clearAllMocks();
  native.platform.OS = 'android';
  native.fs.StorageAccessFramework = native.saf;
  native.fs.documentDirectory = 'file:///data/user/0/app/files/';
  native.saf.createFileAsync.mockResolvedValue(FILE);
  native.saf.requestDirectoryPermissionsAsync.mockResolvedValue({
    granted: true,
    directoryUri: TREE,
  });
  native.fs.writeAsStringAsync.mockResolvedValue(undefined);
  native.saf.deleteAsync.mockResolvedValue(undefined);
});

describe('folderLabel', () => {
  it('names a SAF tree in words, without the volume prefix', () => {
    expect(folderLabel(TREE)).toBe('Download');
  });

  it('joins nested folders with a spaced slash', () => {
    expect(folderLabel(`${TREE}%2Fbackups%2Fmomentum`)).toBe('Download / backups / momentum');
  });

  it('keeps a colon that is part of the folder name', () => {
    expect(folderLabel('content://x/tree/1234-ABCD%3Aa%3Ab')).toBe('a:b');
  });

  it('says "the folder you picked" when nothing is left to show', () => {
    expect(folderLabel('content://x/tree/primary%3A')).toBe('the folder you picked');
    expect(folderLabel('content://x/tree/primary%3A', 'ru')).toBe('выбранная папка');
  });

  it('survives a URI that is not valid percent-encoding', () => {
    expect(folderLabel('content://x/tree/primary:Down%E0load')).toBe('Down%E0load');
  });
});

describe('describeError', () => {
  it('passes an Error message through', () => {
    expect(describeError(new Error('Permission revoked'))).toBe('Permission revoked');
  });

  it('stringifies a non-Error', () => {
    expect(describeError('nope')).toBe('nope');
    expect(describeError(404)).toBe('404');
  });

  it('never returns an empty sentence', () => {
    expect(describeError(new Error('  '))).toBe('Something went wrong reaching the file system.');
    expect(describeError('')).not.toBe('');
  });
});

describe('pickFolder', () => {
  it('returns the granted folder', async () => {
    await expect(pickFolder()).resolves.toBe(TREE);
  });

  it('is null when the user backs out', async () => {
    native.saf.requestDirectoryPermissionsAsync.mockResolvedValue({ granted: false });
    await expect(pickFolder()).resolves.toBeNull();
  });

  it('is null, not a throw, when the picker itself fails', async () => {
    native.saf.requestDirectoryPermissionsAsync.mockRejectedValue(new Error('boom'));
    await expect(pickFolder()).resolves.toBeNull();
  });

  it('is null on a platform with no folder picker', async () => {
    native.platform.OS = 'ios';
    await expect(pickFolder()).resolves.toBeNull();
    expect(native.saf.requestDirectoryPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe('writeToFolder', () => {
  it('creates the file with the MIME type and returns its decoded name and URI', async () => {
    const result = await writeToFolder(TREE, 'momentum-backup', '{"v":1}');
    expect(native.saf.createFileAsync).toHaveBeenCalledWith(
      TREE,
      'momentum-backup',
      'application/json',
    );
    expect(native.fs.writeAsStringAsync).toHaveBeenCalledWith(FILE, '{"v":1}');
    expect(result).toEqual({ name: 'momentum-backup.json', uri: FILE });
  });

  it('deletes the empty file it created when the write fails, then rethrows', async () => {
    const failure = new Error('disk full');
    native.fs.writeAsStringAsync.mockRejectedValue(failure);
    await expect(writeToFolder(TREE, 'momentum-backup', '{}')).rejects.toBe(failure);
    expect(native.saf.deleteAsync).toHaveBeenCalledWith(FILE);
  });

  it('still rethrows the WRITE error when the cleanup delete fails too', async () => {
    const failure = new Error('disk full');
    native.fs.writeAsStringAsync.mockRejectedValue(failure);
    native.saf.deleteAsync.mockRejectedValue(new Error('also broken'));
    await expect(writeToFolder(TREE, 'b', '{}')).rejects.toBe(failure);
  });

  it('writes nothing when the file cannot be created, and calls it lost access', async () => {
    native.saf.createFileAsync.mockRejectedValue(new Error('revoked'));
    const attempt = writeToFolder(TREE, 'b', '{}');
    await expect(attempt).rejects.toThrow('revoked');
    await expect(attempt).rejects.toBeInstanceOf(FolderAccessError);
    expect(native.fs.writeAsStringAsync).not.toHaveBeenCalled();
  });
});

describe('deleteFile', () => {
  it('deletes through SAF on Android', async () => {
    await expect(deleteFile(FILE)).resolves.toBe(true);
    expect(native.saf.deleteAsync).toHaveBeenCalledWith(FILE);
  });

  it('deletes through the plain file system elsewhere, idempotently', async () => {
    native.platform.OS = 'ios';
    await expect(deleteFile('file:///x.json')).resolves.toBe(true);
    expect(native.fs.deleteAsync).toHaveBeenCalledWith('file:///x.json', { idempotent: true });
  });

  it('reports false rather than throwing', async () => {
    native.saf.deleteAsync.mockRejectedValue(new Error('gone'));
    await expect(deleteFile(FILE)).resolves.toBe(false);
  });
});

describe('saveCsvFile', () => {
  it('saves into the picked folder', async () => {
    native.saf.createFileAsync.mockResolvedValue(`${TREE}/document/primary%3ADownload%2Fmoney.csv`);
    await expect(saveCsvFile('money', 'a,b\n')).resolves.toEqual({
      saved: true,
      name: 'money.csv',
      where: 'Download',
      folderUri: TREE,
      uri: `${TREE}/document/primary%3ADownload%2Fmoney.csv`,
    });
  });

  it('is a cancel, not a failure, when the picker is dismissed', async () => {
    native.saf.requestDirectoryPermissionsAsync.mockResolvedValue({ granted: false });
    await expect(saveCsvFile('b', 'a')).resolves.toEqual({ saved: false, cancelled: true });
    expect(native.saf.createFileAsync).not.toHaveBeenCalled();
  });

  it('asks SAF for a CSV so the file gets the right extension', async () => {
    await saveCsvFile('money', 'a,b\n');
    expect(native.saf.createFileAsync).toHaveBeenCalledWith(TREE, 'money', 'text/csv');
  });

  it('falls back to the app folder with no picker, and returns a path', async () => {
    native.platform.OS = 'ios';
    const result = await saveCsvFile('money', 'a,b\n');
    expect(native.fs.writeAsStringAsync).toHaveBeenCalledWith(
      'file:///data/user/0/app/files/money.csv',
      'a,b\n',
    );
    expect(result).toEqual({
      saved: true,
      name: 'money.csv',
      where: '/data/user/0/app/files/money.csv',
    });
  });

  it('falls back when Android has no SAF module', async () => {
    native.fs.StorageAccessFramework = undefined;
    const result = await saveCsvFile('b', 'a');
    expect(result).toMatchObject({ saved: true, name: 'b.csv' });
  });

  it('throws a translated sentence when there is no writable app folder either', async () => {
    native.platform.OS = 'ios';
    native.fs.documentDirectory = null;
    await expect(saveCsvFile('b', 'a', 'ru')).rejects.toThrow(
      'На этом устройстве нет папки для записи.',
    );
  });

  it('propagates a real write error rather than reporting it as saved', async () => {
    native.fs.writeAsStringAsync.mockRejectedValue(new Error('disk full'));
    await expect(saveCsvFile('b', 'a')).rejects.toThrow('disk full');
  });
});

/**
 * A SAF provider as Android's external storage behaves in mode `"w"`: a write
 * lands over the file's bytes from the start and does NOT truncate, so a shorter
 * write leaves the old tail behind. Every overwrite test runs against this,
 * because it is the provider the padding exists for.
 */
function nonTruncatingDisk(files: Record<string, string>) {
  const disk = new Map(Object.entries(files).map(([uri, text]) => [uri, Buffer.from(text)]));
  native.fs.readAsStringAsync.mockImplementation(async (uri: string) => {
    const bytes = disk.get(uri);
    if (!bytes) throw new Error(`Location '${uri}' isn't readable.`);
    return bytes.toString('utf8');
  });
  native.fs.writeAsStringAsync.mockImplementation(async (uri: string, text: string) => {
    const incoming = Buffer.from(text, 'utf8');
    const old = disk.get(uri) ?? Buffer.alloc(0);
    const next = Buffer.alloc(Math.max(old.length, incoming.length));
    old.copy(next, 0);
    incoming.copy(next, 0);
    disk.set(uri, next);
  });
  native.saf.createFileAsync.mockImplementation(async (_folder: string, name: string) => {
    let uri = `${TREE}/document/primary%3ADownload%2F${name}.json`;
    for (let n = 1; disk.has(uri); n += 1) {
      uri = `${TREE}/document/primary%3ADownload%2F${name}%20(${n}).json`;
    }
    disk.set(uri, Buffer.alloc(0));
    return uri;
  });
  native.saf.deleteAsync.mockImplementation(async (uri: string) => {
    disk.delete(uri);
  });
  native.saf.readDirectoryAsync.mockImplementation(async () => [...disk.keys()]);
  return disk;
}

const big = `${JSON.stringify({ chats: ['Жим лёжа — 5×5'.repeat(40)] }, null, 2)}\n`;
const small = `${JSON.stringify({ chats: [] }, null, 2)}\n`;
const TODAY = new Date(2026, 9, 15, 18, 30);
const fileUri = (name: string) => `${TREE}/document/primary%3ADownload%2F${name}`;

describe('overwriteFile', () => {
  it('leaves valid JSON when the new backup is SHORTER, on a provider that does not truncate', async () => {
    const uri = fileUri('momentum-backup-2026-10-15.json');
    const disk = nonTruncatingDisk({ [uri]: big });

    await overwriteFile(uri, small);

    const text = disk.get(uri)!.toString('utf8');
    expect(JSON.parse(text)).toEqual({ chats: [] });
    // Padded with whitespace, which is all that is after the JSON.
    expect(text.trimEnd()).toBe(small.trimEnd());
  });

  it('writes a longer backup as it is', async () => {
    const uri = fileUri('momentum-backup-2026-10-15.json');
    const disk = nonTruncatingDisk({ [uri]: small });
    await overwriteFile(uri, big);
    expect(disk.get(uri)!.toString('utf8')).toBe(big);
  });

  it('throws when the file is gone, so the caller can create one', async () => {
    nonTruncatingDisk({});
    await expect(overwriteFile(fileUri('gone.json'), small)).rejects.toThrow("isn't readable");
  });

  it('throws when what is on disk afterwards is not what was written', async () => {
    const uri = fileUri('momentum-backup-2026-10-15.json');
    nonTruncatingDisk({ [uri]: big });
    native.fs.writeAsStringAsync.mockResolvedValue(undefined); // a write that silently did nothing
    await expect(overwriteFile(uri, small)).rejects.toThrow('did not read back');
  });
});

describe('writeDailyBackup', () => {
  it('creates today’s file when there is none', async () => {
    const disk = nonTruncatingDisk({});
    const result = await writeDailyBackup(TREE, undefined, small, TODAY);
    const uri = fileUri('momentum-workout-backup-2026-10-15.json');
    expect(result).toEqual({
      name: 'momentum-workout-backup-2026-10-15.json',
      file: { uri, day: '2026-10-15' },
    });
    expect(disk.get(uri)!.toString('utf8')).toBe(small);
  });

  it('overwrites today’s file in place: same URI, still one file', async () => {
    const uri = fileUri('momentum-workout-backup-2026-10-15.json');
    const disk = nonTruncatingDisk({ [uri]: big });

    const result = await writeDailyBackup(TREE, { uri, day: '2026-10-15' }, small, TODAY);

    expect(result.file).toEqual({ uri, day: '2026-10-15' });
    expect(native.saf.createFileAsync).not.toHaveBeenCalled();
    expect([...disk.keys()]).toEqual([uri]);
    expect(JSON.parse(disk.get(uri)!.toString('utf8'))).toEqual({ chats: [] });
  });

  it('on a new day creates the new file, then deletes the old one and strays — never older builds’ files', async () => {
    const yesterday = fileUri('momentum-workout-backup-2026-10-14.json');
    const stray = fileUri('momentum-workout-backup-2026-10-13 (1).json');
    const oldAuto = fileUri('workout-tracker-auto-2026-10-01.json');
    const oldExport = fileUri('workout-tracker-backup-2026-10-01-0900.json');
    // 2.x's combined backup and the other two apps' files share the folder.
    const combined = fileUri('momentum-backup-2026-10-14.json');
    const tasks = fileUri('momentum-tasks-backup-2026-10-14.json');
    const expenses = fileUri('momentum-expenses-backup-2026-10-14.json');
    const disk = nonTruncatingDisk({
      [yesterday]: big,
      [stray]: big,
      [oldAuto]: big,
      [oldExport]: big,
      [combined]: big,
      [tasks]: big,
      [expenses]: big,
    });

    const result = await writeDailyBackup(
      TREE,
      { uri: yesterday, day: '2026-10-14' },
      small,
      TODAY,
    );

    const today = fileUri('momentum-workout-backup-2026-10-15.json');
    expect(result.file).toEqual({ uri: today, day: '2026-10-15' });
    expect([...disk.keys()].sort()).toEqual(
      [oldAuto, oldExport, combined, tasks, expenses, today].sort(),
    );
  });

  it('writes under the app’s own name, and sweeps only its own files', async () => {
    const mine = fileUri('momentum-tasks-backup-2026-10-14.json');
    const workout = fileUri('momentum-workout-backup-2026-10-14.json');
    const combined = fileUri('momentum-backup-2026-10-14.json');
    const disk = nonTruncatingDisk({ [mine]: big, [workout]: big, [combined]: big });

    const result = await writeDailyBackup(TREE, undefined, small, TODAY, 'tasks');

    const today = fileUri('momentum-tasks-backup-2026-10-15.json');
    expect(result.name).toBe('momentum-tasks-backup-2026-10-15.json');
    expect([...disk.keys()].sort()).toEqual([combined, today, workout].sort());
  });

  it('leaves the inherited record of 2.x’s combined file alone: a new file, nothing deleted', async () => {
    // The Workout app's first backup after the update: its settings still point
    // at today's combined file, which Tasks and Expenses are about to import.
    const combined = fileUri('momentum-backup-2026-10-15.json');
    const disk = nonTruncatingDisk({ [combined]: big });

    const result = await writeDailyBackup(TREE, { uri: combined, day: '2026-10-15' }, small, TODAY);

    const today = fileUri('momentum-workout-backup-2026-10-15.json');
    expect(result.file).toEqual({ uri: today, day: '2026-10-15' });
    expect(disk.get(combined)!.toString('utf8')).toBe(big);
    expect([...disk.keys()].sort()).toEqual([combined, today].sort());
  });

  it('creates a new file when the stored one was deleted by the user', async () => {
    const gone = fileUri('momentum-workout-backup-2026-10-15.json');
    const disk = nonTruncatingDisk({});

    const result = await writeDailyBackup(TREE, { uri: gone, day: '2026-10-15' }, small, TODAY);

    expect(native.saf.createFileAsync).toHaveBeenCalledTimes(1);
    expect(result.file.uri).toBe(gone); // the name was free again
    expect(disk.get(gone)!.toString('utf8')).toBe(small);
  });

  it('replaces a file whose overwrite did not verify, leaving one good file', async () => {
    const uri = fileUri('momentum-workout-backup-2026-10-15.json');
    const disk = nonTruncatingDisk({ [uri]: big });
    const realWrite = native.fs.writeAsStringAsync.getMockImplementation()!;
    // The overwrite "succeeds" without writing; the fresh file's write is real.
    native.fs.writeAsStringAsync.mockImplementationOnce(async () => undefined);
    native.fs.writeAsStringAsync.mockImplementation(realWrite);

    const result = await writeDailyBackup(TREE, { uri, day: '2026-10-15' }, small, TODAY);

    const twin = fileUri('momentum-workout-backup-2026-10-15%20(1).json');
    expect(result.file.uri).toBe(twin);
    expect([...disk.keys()]).toEqual([twin]);
    expect(disk.get(twin)!.toString('utf8')).toBe(small);
  });

  it('reports a folder it cannot create in as lost access, and deletes nothing', async () => {
    const uri = fileUri('momentum-backup-2026-10-14.json');
    const disk = nonTruncatingDisk({ [uri]: big });
    native.saf.createFileAsync.mockRejectedValue(new Error("Location isn't writable."));

    await expect(
      writeDailyBackup(TREE, { uri, day: '2026-10-14' }, small, TODAY),
    ).rejects.toBeInstanceOf(FolderAccessError);
    expect(disk.has(uri)).toBe(true);
  });
});

describe('listFolder', () => {
  it('lists URIs with their decoded names', async () => {
    native.saf.readDirectoryAsync.mockResolvedValue([FILE]);
    await expect(listFolder(TREE)).resolves.toEqual([{ uri: FILE, name: 'momentum-backup.json' }]);
  });

  it('is empty on failure or without a picker', async () => {
    native.saf.readDirectoryAsync.mockRejectedValue(new Error('revoked'));
    await expect(listFolder(TREE)).resolves.toEqual([]);
    native.platform.OS = 'ios';
    await expect(listFolder(TREE)).resolves.toEqual([]);
  });
});

describe('pickJsonFile', () => {
  it('opens the browser for ANY type, copied to cache', async () => {
    native.picker.getDocumentAsync.mockResolvedValue({ canceled: true });
    await pickJsonFile();
    expect(native.picker.getDocumentAsync).toHaveBeenCalledWith({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
  });

  it('is null when cancelled or when no asset came back', async () => {
    native.picker.getDocumentAsync.mockResolvedValue({ canceled: true });
    await expect(pickJsonFile()).resolves.toBeNull();
    native.picker.getDocumentAsync.mockResolvedValue({ canceled: false, assets: [] });
    await expect(pickJsonFile()).resolves.toBeNull();
  });

  it('uses the provider name, or the URI tail when the provider gives none', async () => {
    native.picker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/abc.json', name: 'backup.json' }],
    });
    await expect(pickJsonFile()).resolves.toEqual({
      uri: 'file:///cache/abc.json',
      name: 'backup.json',
    });
    native.picker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/My%20backup.json', name: '' }],
    });
    await expect(pickJsonFile()).resolves.toMatchObject({ name: 'My backup.json' });
  });
});

describe('readTextFile', () => {
  it('reads through the file system', async () => {
    native.fs.readAsStringAsync.mockResolvedValue('{"v":1}');
    await expect(readTextFile('file:///x')).resolves.toBe('{"v":1}');
  });
});
