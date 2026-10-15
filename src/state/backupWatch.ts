/**
 * The seven stores a backup carries, watched for the changes that matter.
 *
 * `lib/backupWatch.ts` decides what counts as a change; this is the wiring that
 * applies it to the live stores, kept out of the hook so it can be tested against
 * the real stores (`backupWatch.test.ts`) — "a reply streaming in does not write,
 * recording the backup does not write, a rest-time change does" are claims about
 * these stores, not about a fixture.
 *
 * Not watched: the workout in progress (not in a backup; finishing it lands in
 * the history store, which is).
 */

import {
  BACKED_UP_FIELDS,
  pickFields,
  settingsSlice,
  sliceChanged,
  type BackupSlice,
} from '../lib/backupWatch';
import { useAi } from './aiStore';
import { useDebriefs } from './debriefStore';
import { useLibrary } from './libraryStore';
import { useMoney } from './moneyStore';
import { useSettings } from './settingsStore';
import { useTasks } from './tasksStore';
import { useWorkoutHistory } from './workoutHistoryStore';

interface Watchable {
  getState: () => object;
  subscribe: (listener: (state: object) => void) => () => void;
}

const WATCHED: readonly { store: Watchable; slice: (state: object) => BackupSlice }[] = [
  { store: useSettings, slice: settingsSlice },
  { store: useLibrary, slice: (s) => pickFields(s, BACKED_UP_FIELDS.library) },
  { store: useWorkoutHistory, slice: (s) => pickFields(s, BACKED_UP_FIELDS.workoutHistory) },
  { store: useTasks, slice: (s) => pickFields(s, BACKED_UP_FIELDS.tasks) },
  { store: useMoney, slice: (s) => pickFields(s, BACKED_UP_FIELDS.money) },
  { store: useDebriefs, slice: (s) => pickFields(s, BACKED_UP_FIELDS.debriefs) },
  { store: useAi, slice: (s) => pickFields(s, BACKED_UP_FIELDS.ai) },
];

/**
 * Have the AsyncStorage stores finished reading from disk?
 *
 * A backup written before hydration is a file of seeds and empties that then
 * OVERWRITES the good one — the worst possible file to keep. History is not in
 * the list: it is read synchronously from SQLite before the first render, and its
 * failure mode (`loadFailed`) is refused by `exportBackupText` instead. A settings
 * read that FAILED never hydrates, so it never writes either: a backup with the
 * defaults in place of the user's settings is not one to overwrite theirs with.
 */
export function storesHydrated(): boolean {
  return [useSettings, useLibrary, useTasks, useMoney, useAi, useDebriefs].every((store) =>
    store.persist.hasHydrated(),
  );
}

/**
 * Call `onChange` whenever backed-up data changes. Returns the unsubscribe.
 *
 * Changes before every store has hydrated are absorbed into the baseline rather
 * than reported: hydration replaces each store wholesale, and that is the data
 * ARRIVING, not the user changing it.
 */
export function watchBackedUpStores(onChange: () => void): () => void {
  const stops = WATCHED.map(({ store, slice }) => {
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
