/**
 * `useSettingsHydrated()` — has the settings store finished reading from disk?
 *
 * Needed by exactly one thing, and it is the reason it exists: the first-launch
 * language picker. `persist` rehydrates ASYNCHRONOUSLY, so for the first frame
 * or two of every launch the store holds its initial values — which include
 * `languageChosen: false`. A picker that reads that flag without waiting would
 * flash in front of every existing user on every launch, asking a question they
 * answered months ago.
 *
 * Returns true immediately when hydration has already happened (a remount later
 * in the session), and subscribes otherwise. `onFinishHydration` fires once, and
 * the unsubscribe it returns is the cleanup.
 */

import { useEffect, useState } from 'react';

import {
  onSettingsHydrationFailed,
  settingsHydrationFailed,
  useSettings,
} from '../state/settingsStore';

/** Finished — or failed, which the root must treat as finished: see `settingsStore`. */
const settled = () => useSettings.persist.hasHydrated() || settingsHydrationFailed();

export function useSettingsHydrated(): boolean {
  const [hydrated, setHydrated] = useState(settled);

  useEffect(() => {
    if (hydrated) return;
    // Both, deliberately: the listeners catch a hydration still in flight, and
    // the re-check catches one that finished between render and effect.
    const done = useSettings.persist.onFinishHydration(() => setHydrated(true));
    const failed = onSettingsHydrationFailed(() => setHydrated(true));
    if (settled()) setHydrated(true);
    return () => {
      done();
      failed();
    };
  }, [hydrated]);

  return hydrated;
}
