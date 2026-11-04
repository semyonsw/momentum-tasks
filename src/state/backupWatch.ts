/**
 * The three stores a backup carries — settings, tasks, the assistant — watched
 * for the changes that matter.
 *
 * `lib/backupWatch.ts` decides what counts as a change; this is the wiring that
 * applies it to the live stores, kept out of the hook so it can be tested against
 * the real stores (`backupWatch.test.ts`) — "a reply streaming in does not write,
 * recording the backup does not write, a ticked task does" are claims about
 * these stores, not about a fixture.
 */

import {
  BACKED_UP_FIELDS,
  WATCHED_STORES,
  pickFields,
  settingsSlice,
  sliceChanged,
  type BackupSlice,
  type WatchedStore,
} from '../lib/backupWatch';
import { useAi } from './aiStore';
import { useSettings } from './settingsStore';
import { useTasks } from './tasksStore';

interface Watchable {
  getState: () => object;
  subscribe: (listener: (state: object) => void) => () => void;
}

const WATCHABLE: Record<WatchedStore, { store: Watchable; slice: (state: object) => BackupSlice }> =
  {
    settings: { store: useSettings, slice: settingsSlice },
    tasks: { store: useTasks, slice: (s) => pickFields(s, BACKED_UP_FIELDS.tasks) },
    ai: { store: useAi, slice: (s) => pickFields(s, BACKED_UP_FIELDS.ai) },
  };

/**
 * Have the stores finished reading from disk?
 *
 * A backup written before hydration is a file of seeds and empties that then
 * OVERWRITES the good one — the worst possible file to keep. A settings read that
 * FAILED never hydrates, so it never writes either: a backup with the defaults in
 * place of the user's settings is not one to overwrite theirs with.
 */
export function storesHydrated(): boolean {
  return [useSettings, useTasks, useAi].every((store) => store.persist.hasHydrated());
}

/**
 * Call `onChange` whenever backed-up data changes. Returns the unsubscribe.
 *
 * Changes before every store has hydrated are absorbed into the baseline rather
 * than reported: hydration replaces each store wholesale, and that is the data
 * ARRIVING, not the user changing it.
 */
export function watchBackedUpStores(onChange: () => void): () => void {
  const stops = WATCHED_STORES.map((key) => {
    const { store, slice } = WATCHABLE[key];
    let previous = slice(store.getState());
    return store.subscribe((state) => {
      const next = slice(state);
      if (!sliceChanged(previous, next)) return;
      previous = next;
      if (storesHydrated()) onChange();
    });
  });
  return () => {
    for (const stop of stops) stop();
  };
}
