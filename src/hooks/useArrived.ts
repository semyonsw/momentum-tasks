/**
 * Whether the screen this runs in has been SHOWN yet — the moment everything
 * that used to happen "on mount" is about.
 *
 * The sections are built ahead of time now, hidden, while the app is idle
 * (`navigation/ShellStage.tsx`), because building one at the moment it was asked
 * for was the hitch in every swipe and every tab tap: the slide waited on a
 * whole screen rendering from nothing. A section built early is still built
 * fresh — it is thrown away when you leave it, and a new one is built for next
 * time — so its state, its scroll and its closed panels are what a mount at
 * arrival would have given. What does NOT survive being early is anything that
 * plays or reads the clock on mount: the entrances would have run where nobody
 * could see them, and the celebration would have read a save from before it
 * happened. Those wait on this instead of on the mount.
 *
 * True everywhere outside a pre-built section, so a screen mounted any other way
 * (a pushed screen, a sheet, a section built at arrival) behaves exactly as it
 * did. Once true it stays true: a section is discarded when it is left, never
 * hidden again.
 */

import { createContext, useContext } from 'react';

export const Arrived = createContext(true);

export function useArrived(): boolean {
  return useContext(Arrived);
}
