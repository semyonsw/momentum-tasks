/**
 * The coach's weekly summary (X4), as a side effect: one tap on the weekly
 * review card → one Gemini request → a paragraph, or a sentence saying why not.
 *
 * ── THE ANSWER LIVES IN THE CARD, NOT IN A CHAT ───────────────────────────
 *
 * The other integration on the table was opening a section's chat with the
 * summary prompt pre-sent. Rejected: the chats are per section (Workout, Tasks,
 * Expenses) and this is about all three, so it would have had to pick one and
 * carry the other two as briefs; the long prompt would sit in the chat as a
 * "user" message the user never typed; and it would be filed into that chat's
 * history and backup forever. In the card it is one request, one paragraph
 * under the figures it is about, and nothing persisted — so this file writes no
 * store, and the screen keeps the reply for as long as it is on the page.
 *
 * ── NOTHING GOES OUT WITHOUT THE TAP, THE SWITCH AND THE KEY ──────────────
 *
 * The screen only draws the button when `weeklySummaryOffered` says so, and
 * this function checks the same two things again before it reads the key —
 * the switch is passed in by the one caller that reads it, the key status and
 * the key itself are read here. A refusal makes no request at all.
 *
 * NOTHING HERE THROWS, as in `aiActions.ts`: every path is a value the card
 * can draw.
 */

import {
  CHAT_TIMEOUT_MS,
  RETRY_DELAYS_MS,
  buildChatRequest,
  isRetryable,
  mapError,
  mapParseFailure,
  mapTransportFailure,
  parseChatResponse,
} from '../lib/ai/gemini';
import { validateBlocks } from '../lib/ai/aiSchema';
import { getKey } from '../lib/ai/secureKey';
import { send } from '../lib/ai/transport';
import {
  summaryText,
  weeklySummaryOffered,
  weeklySummaryPrompt,
} from '../lib/ai/weeklySummaryPrompt';
import { t } from '../lib/i18n';
import type { WeeklyReview } from '../lib/weeklyReview';
import { useAi } from './aiStore';
import { engagementOn } from '../lib/engagement';
import { useSettings } from './settingsStore';

export type WeeklySummaryResult =
  | { kind: 'answer'; text: string }
  /** A sentence for the card, with Try again under it. */
  | { kind: 'error'; text: string }
  /** Not offered (switch off, or no tested key): nothing was sent. */
  | { kind: 'refused' };

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function askWeeklySummary(params: {
  review: WeeklyReview;
  money: { currency: string; scale: number };
  engagement: boolean;
}): Promise<WeeklySummaryResult> {
  const { review, money, engagement } = params;
  const settings = useSettings.getState();
  const language = settings.language;
  // The caller's flag AND the store's: "no network without the switch" must not
  // rest on one screen having re-rendered.
  const on = engagement && engagementOn(settings);
  if (!weeklySummaryOffered({ engagement: on, aiStatus: useAi.getState().status })) {
    return { kind: 'refused' };
  }
  try {
    const key = await getKey();
    if (!key) {
      return { kind: 'error', text: t('Connect a Google AI key in Settings first.', language) };
    }
    const prompt = weeklySummaryPrompt(review, money, language);
    const model = useAi.getState().model;
    const request = buildChatRequest({
      key,
      model,
      systemPrompt: prompt.systemPrompt,
      context: prompt.context,
      history: [],
      userText: prompt.question,
    });

    // One quiet retry for Google's bad moment; the chat's longer ladder is for
    // a conversation, and this is a paragraph the user can ask for again.
    let result = await send(request, CHAT_TIMEOUT_MS);
    if (isRetryable(result) && result.kind !== 'timeout') {
      await wait(RETRY_DELAYS_MS[0]);
      result = await send(request, CHAT_TIMEOUT_MS);
    }
    if (result.kind !== 'response') {
      return { kind: 'error', text: mapTransportFailure(result.kind, language) };
    }
    if (result.status !== 200) {
      return { kind: 'error', text: mapError(result.status, result.body, model, language) };
    }
    const parsed = parseChatResponse(result.body);
    if (!parsed.ok) return { kind: 'error', text: mapParseFailure(parsed.reason, language) };
    // 'Tasks' only for the validator's rules: text and summary blocks, no proposals.
    const text = summaryText(
      validateBlocks(parsed.json, { section: 'Tasks', routineIds: new Set() }),
    );
    if (text === '') return { kind: 'error', text: mapParseFailure('shape', language) };
    return { kind: 'answer', text };
  } catch {
    return { kind: 'error', text: mapTransportFailure('network', language) };
  }
}
