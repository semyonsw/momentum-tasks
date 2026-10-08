/**
 * TAKING A PAST CHAT OUT OF THE LIST, AND PUTTING IT BACK EXACTLY (U14).
 *
 * The ✕ on a row of `Past chats` deleted the chat on one tap, for good — the
 * only one-tap irreversible delete left in the app, on a row whose other half
 * opens the chat. It now deletes at once and the shell offers an Undo toast,
 * which needs the delete to leave behind everything the Undo puts back: the
 * chat itself (messages untouched), WHERE it was in the list (the list is
 * newest-first and the user reads it by position), and the suggestions only it
 * pointed at — `aiStore` prunes those with the chat, and a restored chat whose
 * `Review` card had lost its proposal would not be the chat that was deleted.
 *
 * REJECTED: a confirm. ROADMAP §8 prefers Undo to confirm wherever the thing
 * can be put back exactly, and here it can — a confirm would be a second tap on
 * every delete to protect against the rare wrong one. Also rejected: a
 * soft-delete flag on the chat. It would have to be honoured by the list, the
 * backup and the context builder, all to support a 4.5 s window.
 */

/** What a removal leaves for its Undo: the item and where it stood. */
export interface Removed<T> {
  item: T;
  index: number;
}

/** The list without `id`, and what was taken — or null when `id` is not there. */
export function removeById<T extends { id: string }>(
  list: readonly T[],
  id: string,
): { list: T[]; removed: Removed<T> } | null {
  const index = list.findIndex((entry) => entry.id === id);
  if (index === -1) return null;
  return {
    list: [...list.slice(0, index), ...list.slice(index + 1)],
    removed: { item: list[index], index },
  };
}

/**
 * Put a removed item back where it stood.
 *
 * The index is clamped, because the list may have shrunk in the 4.5 s the
 * toast is up (another row deleted below it). Already present → unchanged, so a
 * second Undo is a no-op. The cap is kept, the oldest going first as everywhere
 * else in the archive.
 */
export function restoreAt<T extends { id: string }>(
  list: readonly T[],
  removed: Removed<T>,
  cap: number = Number.POSITIVE_INFINITY,
): T[] {
  if (list.some((entry) => entry.id === removed.item.id)) return [...list];
  const at = Math.max(0, Math.min(removed.index, list.length));
  return [...list.slice(0, at), removed.item, ...list.slice(at)].slice(0, cap);
}

/**
 * The entries of `before` that are gone from `after` — the suggestions a delete
 * pruned, kept for its Undo.
 */
export function droppedEntries<V>(
  before: Readonly<Record<string, V>>,
  after: Readonly<Record<string, V>>,
): Record<string, V> {
  return Object.fromEntries(Object.entries(before).filter(([key]) => !(key in after)));
}
