/**
 * The roots — Home and the four sections — FROZEN while a pushed screen fully
 * covers them. They are `display: none` then, so nothing they would draw is
 * seen; but they were still RE-RENDERED on every shell render, and during a
 * workout that is every set logged: each ✓ and each ± rebuilt Home (its hero,
 * its recent list, its number over the whole log) behind a screen that hid it.
 *
 * While frozen the element passed in is ignored and React keeps what it last
 * rendered; the moment the roots can show again — a pop, an edge drag — the
 * latest element renders once, before the frame that reveals them. Their own
 * store subscriptions still update them, so nothing they own goes stale.
 */

import { memo, type ReactNode } from 'react';

export const Hold = memo(
  function Hold({ children }: { frozen: boolean; children: ReactNode }) {
    return <>{children}</>;
  },
  (_previous, next) => next.frozen,
);
