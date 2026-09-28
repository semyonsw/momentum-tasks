/**
 * WHICH CATEGORY THE FINANCE SECTION'S ROUND + OPENS THE KEYPAD ON.
 *
 * A category tile knows its own category; the floating action has none under
 * it, so it guesses. The guess that is right most often is the thing bought
 * every day — food — matched by name in either language the app speaks
 * (`food`, `еда`, `продукты`), because categories are the user's own rows and
 * carry no kind to match on.
 *
 * No match falls back to the first live category rather than to nothing: an
 * editor that opens on SOME category is one Save from done, and one that opens
 * on none makes the first tap a correction. Null only when there are no
 * categories at all, which the editor already handles.
 *
 * Pure, so the fallback order is pinned by a test rather than by a phone.
 */

const FOOD = /food|еда|продукт/i;

export function quickCategoryId(
  categories: readonly { id: string; name: string; archivedAt: string | null }[],
): string | null {
  const live = categories.filter((category) => category.archivedAt === null);
  return (live.find((category) => FOOD.test(category.name)) ?? live[0])?.id ?? null;
}
