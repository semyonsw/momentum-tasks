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
  deleteFile,
  describeError,
  folderLabel,
  listFolder,
  pickFolder,
  pickJsonFile,
  readTextFile,
  saveCsvFile,
  saveJsonFile,
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

  it('writes nothing when the file cannot be created', async () => {
    native.saf.createFileAsync.mockRejectedValue(new Error('revoked'));
    await expect(writeToFolder(TREE, 'b', '{}')).rejects.toThrow('revoked');
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

describe('saveJsonFile / saveCsvFile', () => {
  it('saves into the picked folder and hands the grant back for the auto backup', async () => {
    await expect(saveJsonFile('momentum-backup', '{}')).resolves.toEqual({
      saved: true,
      name: 'momentum-backup.json',
      where: 'Download',
      folderUri: TREE,
      uri: FILE,
    });
  });

  it('is a cancel, not a failure, when the picker is dismissed', async () => {
    native.saf.requestDirectoryPermissionsAsync.mockResolvedValue({ granted: false });
    await expect(saveJsonFile('b', '{}')).resolves.toEqual({ saved: false, cancelled: true });
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
    const result = await saveJsonFile('b', '{}');
    expect(result).toMatchObject({ saved: true, name: 'b.json' });
  });

  it('throws a translated sentence when there is no writable app folder either', async () => {
    native.platform.OS = 'ios';
    native.fs.documentDirectory = null;
    await expect(saveJsonFile('b', '{}', 'ru')).rejects.toThrow(
      'На этом устройстве нет папки для записи.',
    );
  });

  it('propagates a real write error rather than reporting it as saved', async () => {
    native.fs.writeAsStringAsync.mockRejectedValue(new Error('disk full'));
    await expect(saveJsonFile('b', '{}')).rejects.toThrow('disk full');
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
