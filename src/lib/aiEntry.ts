/**
 * Whether a section shows the assistant's entry card (U2).
 *
 * The card is how somebody finds out the assistant exists; the ✦ in the top bar
 * is how somebody who knows goes back. Once they know — they closed the card,
 * or they have had a chat in that section — the card is a second copy of the
 * orb, 60 dp under it, pushing the section's own content down. So it shows
 * until either happens, per section, and then never again.
 *
 * Per SECTION rather than once for the app: the three chats are different
 * questions, and having asked about money says nothing about knowing that the
 * habits have an assistant too.
 *
 * Rejected: hiding it after N views (a card that leaves on a counter nobody can
 * see reads as a bug), and deriving it from the chats alone (deleting the last
 * past chat would bring a card back that the user had already read). The chat
 * having happened is recorded into the same persisted list as the ✕, by the
 * card, the first time it sees one.
 */

import type { AiSection } from './ai/aiSchema';

export function aiCardShown(
  section: AiSection,
  dismissed: readonly AiSection[] | undefined,
  chatted: boolean,
): boolean {
  return !chatted && !(dismissed ?? []).includes(section);
}
