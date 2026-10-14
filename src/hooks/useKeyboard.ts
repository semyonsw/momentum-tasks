/**
 * The soft keyboard as one shared fact: how much of the screen's foot it covers.
 *
 * The rules are `lib/keyboard.ts`; this is the plumbing. One pair of `Keyboard`
 * listeners for the whole app, attached on first use, and the root's height
 * reported by `App.tsx` — so every surface that holds a field reads the same
 * number at the same moment instead of each guessing from its own listener.
 *
 * Outside React for the same reason `components/overlay.ts` is: a sheet three
 * levels deep and the composer of another screen must agree, and neither is the
 * other's parent.
 */

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Animated, Easing, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { keyboardOverlap, type KeyboardFrame } from '../lib/keyboard';

/** How long a surface takes to follow the keyboard — about the IME's own slide. */
export const KEYBOARD_FOLLOW_MS = 220;

let frame: KeyboardFrame | null = null;
let rootHeight = 0;
let attached = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function attach() {
  if (attached) return;
  attached = true;
  // A keyboard already up before the first subscriber: RN kept its last frame.
  const open = Keyboard.isVisible() ? Keyboard.metrics() : undefined;
  if (open) frame = { top: open.screenY, height: open.height };
  Keyboard.addListener('keyboardDidShow', (event) => {
    const end = event?.endCoordinates;
    frame = end ? { top: end.screenY, height: end.height } : null;
    emit();
  });
  Keyboard.addListener('keyboardDidHide', () => {
    frame = null;
    emit();
  });
}

function subscribe(listener: () => void): () => void {
  attach();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The app's root `onLayout` — the height the keyboard's top is measured against. */
export function reportRootHeight(height: number): void {
  attach();
  if (height === rootHeight || !(height > 0)) return;
  rootHeight = height;
  emit();
}

/** The root's measured height, 0 before the first layout. */
export function useRootHeight(): number {
  return useSyncExternalStore(
    subscribe,
    () => rootHeight,
    () => rootHeight,
  );
}

/** dp of the root's foot under the keyboard; 0 while it is down. Subscribed. */
export function useKeyboardOverlap(): number {
  const insets = useSafeAreaInsets();
  const read = () => keyboardOverlap(rootHeight, frame, insets.bottom);
  return useSyncExternalStore(subscribe, read, read);
}

/**
 * `target` as an animated value that glides there in `KEYBOARD_FOLLOW_MS`, for a
 * transform — so a sheet rises with the keyboard instead of jumping a frame
 * after it.
 */
export function useFollow(target: number): Animated.Value {
  const value = useRef(new Animated.Value(target)).current;
  useEffect(() => {
    const animation = Animated.timing(value, {
      toValue: target,
      duration: KEYBOARD_FOLLOW_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [target, value]);
  return value;
}
