/**
 * The storage every persisted store writes through: `createJSONStorage` over
 * AsyncStorage, minus the writes that would store what is already stored.
 *
 * zustand's `persist` writes on EVERY `set`, whatever it changed. The write is a
 * synchronous `JSON.stringify` of the store's whole persisted slice on the JS
 * thread, in the same frame as the render the `set` caused — and plenty of sets
 * change nothing that is persisted: `setPending` on every AI message (which
 * re-serialised every chat and the whole archive, twice per question), a no-op
 * `markRoutineSeen` on every routine opened, an unstarted session's edits (whose
 * persisted `session` is null throughout), the rounds chain arming. Each of those
 * cost a stringify that grows with the data, to write the same bytes again.
 *
 * So a write whose partialized fields are all the SAME REFERENCES as the last
 * write's is skipped. That is exactly "nothing persisted changed", because every
 * store here replaces what it edits rather than mutating it — the same contract
 * their selectors already depend on. A store whose `partialize` builds fresh
 * values (`settingsStore` sanitises on the way out) would simply never match and
 * write as before, which is why it is not handed this.
 *
 * Not a debounce: every write that changes something still happens at once, so a
 * force-quit a second after a ✓ keeps the ✓. Coalescing would buy more, and cost
 * exactly that.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage, type PersistStorage, type StorageValue } from 'zustand/middleware';

function sameFields(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(b, key) &&
      (a as Record<string, unknown>)[key] === (b as Record<string, unknown>)[key],
  );
}

export function persistedStorage<S>(): PersistStorage<S> {
  // `createJSONStorage` only returns undefined when the getter throws, and
  // AsyncStorage is a static import.
  const base = createJSONStorage<S>(() => AsyncStorage) as PersistStorage<S>;
  /* Per key, because a store may be renamed or two may share this module. */
  const lastWritten = new Map<string, StorageValue<S>>();
  return {
    getItem: (name) => base.getItem(name),
    setItem: (name, value) => {
      const previous = lastWritten.get(name);
      if (
        previous &&
        previous.version === value.version &&
        sameFields(previous.state, value.state)
      ) {
        return;
      }
      let written: unknown;
      try {
        // `createJSONStorage` stringifies synchronously, so a value it cannot
        // serialise throws here, before anything was cached.
        written = base.setItem(name, value);
      } catch (error) {
        lastWritten.delete(name);
        throw error;
      }
      lastWritten.set(name, value);
      return Promise.resolve(written).catch((error: unknown) => {
        /* A write that failed wrote nothing: the next identical one must try again. */
        if (lastWritten.get(name) === value) lastWritten.delete(name);
        throw error;
      });
    },
    removeItem: (name) => {
      lastWritten.delete(name);
      return base.removeItem(name);
    },
  };
}
