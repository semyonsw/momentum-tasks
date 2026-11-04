/**
 * `useAiPrompts()` — the suggested questions, in the language in force.
 *
 * A hook because two places draw the same list — the AI card on the tasks
 * screen and the chat itself — and the chips must agree. The decision is
 * `lib/ai/aiPrompts.ts`; this is the subscription.
 */

import { useMemo } from 'react';

import { parseDay } from '../lib/days';
import { suggestedPrompts, type SuggestedPrompt } from '../lib/ai/aiPrompts';
import { useLanguage } from './useT';
import { useToday } from './useToday';

export function useAiPrompts(): SuggestedPrompt[] {
  const lang = useLanguage();
  // The month name in "How did {month} go?" moves at midnight on the 1st.
  const today = useToday();
  return useMemo(() => suggestedPrompts({}, lang, parseDay(today) ?? new Date()), [lang, today]);
}
