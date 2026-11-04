/**
 * The user's Google AI key, in the phone's keystore — and nowhere else.
 *
 * ── WHY NOT THE STORE ──────────────────────────────────────────────────────
 *
 * Every other setting lives in AsyncStorage through a zustand store, and every
 * one of those stores is read by `state/dataTransfer.ts` into the backup file:
 * a readable JSON file the user saves to a folder, copies to a laptop, and sends
 * to themselves. A key in that file is a key on every device the backup ever
 * touched. So it is not a setting. `aiStore` holds the STATUS (off, ready, the
 * last error) and this file holds the one secret, in `expo-secure-store` —
 * Android's Keystore-encrypted preferences, which that module's config plugin
 * also excludes from Android's own cloud backup.
 *
 * ── IT NEVER THROWS ────────────────────────────────────────────────────────
 *
 * The module is `require`d lazily inside a `try`, the way `lib/clipboard.ts`
 * loads its native module: a native module missing from the binary throws at
 * import time, and a throw at module scope is a launch crash with no screen to
 * report it on. Every call resolves — `null` for "no key", `false` for "could
 * not store it" — and the screens turn those into sentences.
 *
 * The key is never logged, never put in an error message, and never held in any
 * store. The settings screen keeps what is being typed in its own component
 * state until the test passes, and the chat reads it from here per request.
 */

const KEY = 'ai.google.apiKey';

interface SecureStoreModule {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
}

let cached: SecureStoreModule | null | undefined;

function moduleOrNull(): SecureStoreModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require('expo-secure-store') as SecureStoreModule;
    cached = typeof loaded?.getItemAsync === 'function' ? loaded : null;
  } catch {
    cached = null;
  }
  return cached;
}

/** The stored key, or null when there is none or the keystore cannot be read. */
export async function getKey(): Promise<string | null> {
  const store = moduleOrNull();
  if (!store) return null;
  try {
    const value = await store.getItemAsync(KEY);
    return value && value.trim() !== '' ? value : null;
  } catch {
    return null;
  }
}

/** True when the key is now on the phone. */
export async function setKey(value: string): Promise<boolean> {
  const store = moduleOrNull();
  if (!store) return false;
  try {
    await store.setItemAsync(KEY, value.trim());
    return true;
  } catch {
    return false;
  }
}

export async function clearKey(): Promise<void> {
  const store = moduleOrNull();
  if (!store) return;
  try {
    await store.deleteItemAsync(KEY);
  } catch {
    // Nothing more to do here: `Disconnect` also sets the status to `off`, and
    // nothing sends a request while the status is anything but `ready`.
  }
}
