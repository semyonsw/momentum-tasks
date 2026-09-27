/**
 * Reading the clipboard, for the one field in the app that is pasted rather than
 * typed: a 39-character API key copied out of Google AI Studio.
 *
 * Loaded lazily and defensively, like `lib/healthConnect.ts`: `expo-clipboard`
 * is a native module, and a build without it must still open the settings
 * screen — it simply has no `Paste` button, which is what `clipboardAvailable`
 * tells the screen. Nothing here throws.
 */

interface ClipboardModule {
  getStringAsync: () => Promise<string>;
}

let cached: ClipboardModule | null | undefined;

function moduleOrNull(): ClipboardModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require('expo-clipboard') as ClipboardModule;
    cached = typeof loaded?.getStringAsync === 'function' ? loaded : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function clipboardAvailable(): boolean {
  return moduleOrNull() != null;
}

/** The clipboard's text, trimmed, or null when there is none or it cannot be read. */
export async function readClipboard(): Promise<string | null> {
  const clipboard = moduleOrNull();
  if (!clipboard) return null;
  try {
    const text = (await clipboard.getStringAsync()).trim();
    return text === '' ? null : text;
  } catch {
    return null;
  }
}
