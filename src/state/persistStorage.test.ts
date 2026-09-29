import { describe, expect, it, vi } from 'vitest';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { persistedStorage } from './persistStorage';

/**
 * The persisted stores' storage: a write that changes nothing persisted is not
 * made, and every write that changes something still is — at once, not later.
 */

describe('persistedStorage', () => {
  it('skips a write whose fields are the same references as the last one', async () => {
    const spy = vi.spyOn(AsyncStorage, 'setItem');
    spy.mockClear();
    const storage = persistedStorage<{ list: number[]; flag: boolean }>();
    const list = [1, 2, 3];

    await storage.setItem('k-same', { state: { list, flag: true }, version: 1 });
    await storage.setItem('k-same', { state: { list, flag: true }, version: 1 });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('writes when any field changed, even to an equal-looking copy', async () => {
    const spy = vi.spyOn(AsyncStorage, 'setItem');
    spy.mockClear();
    const storage = persistedStorage<{ list: number[] }>();

    await storage.setItem('k-changed', { state: { list: [1] }, version: 1 });
    await storage.setItem('k-changed', { state: { list: [1] }, version: 1 });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(await storage.getItem('k-changed')).toEqual({ state: { list: [1] }, version: 1 });
  });

  it('writes again after a version change, and after the key was removed', async () => {
    const spy = vi.spyOn(AsyncStorage, 'setItem');
    spy.mockClear();
    const storage = persistedStorage<{ n: number }>();

    await storage.setItem('k-version', { state: { n: 1 }, version: 1 });
    await storage.setItem('k-version', { state: { n: 1 }, version: 2 });
    await storage.removeItem('k-version');
    await storage.setItem('k-version', { state: { n: 1 }, version: 2 });
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('caches nothing for a value that could not be serialised', async () => {
    const spy = vi.spyOn(AsyncStorage, 'setItem');
    spy.mockClear();
    const storage = persistedStorage<{ n: bigint | number }>();
    const state = { n: 1n as bigint | number };

    expect(() => storage.setItem('k-throw', { state, version: 1 })).toThrow();
    state.n = 1;
    await storage.setItem('k-throw', { state, version: 1 });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('retries an identical write after one that failed', async () => {
    const spy = vi.spyOn(AsyncStorage, 'setItem');
    spy.mockClear();
    spy.mockRejectedValueOnce(new Error('disk full'));
    const storage = persistedStorage<{ n: number }>();
    const value = { state: { n: 1 }, version: 1 };

    await expect(storage.setItem('k-fail', value)).rejects.toThrow('disk full');
    await storage.setItem('k-fail', { state: { n: 1 }, version: 1 });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(await storage.getItem('k-fail')).toEqual(value);
  });
});
