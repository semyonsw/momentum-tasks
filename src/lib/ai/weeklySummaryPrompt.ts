/**
 * The coach's weekly summary (X4): what Gemini is told when the user asks the
 * weekly review card for a few sentences about last week.
 *
 *   LAST WEEK · 28 SEPTEMBER – 04 OCTOBER                    ✕
 *   3                 84%                    52,300
 *   …the three columns of X3…
 *   (✦ Ask the coach for a summary)
 *   Three sessions, one more than the week before. Tasks held at 84%…
 *
 * ── IT READS THE CARD, NOT THE LOG ────────────────────────────────────────
 *
 * The context is the `WeeklyReview` the card already drew — every figure, and
 * the very sentence printed under it — and nothing else. Rejected: the chat's
 * whole-log context (`aiContext.ts`), which is ~100k tokens for a year, a
 * minute of reading, and a summary that could quote a number the card above it
 * does not show. A summary that disagrees with the card it sits in is worse
 * than none. A log with no column on the card is absent here too, and the
 * prompt says so, so the model cannot fill the gap with "no workouts".
 *
 * ── THE TONE IS PART OF THE PROMPT ────────────────────────────────────────
 *
 * Honest, no guilt, no exclamation marks — the house tone (`aiPrompts.ts`:
 * "No motivation, no emoji"), said more firmly because a weekly verdict is
 * exactly where a model reaches for "Great job!" or "you missed…". At most one
 * suggestion, and only one the numbers point at.
 *
 * ── THE SAME PIPE AS THE CHAT ─────────────────────────────────────────────
 *
 * It goes out through `buildChatRequest` and comes back through
 * `parseChatResponse` + `validateBlocks`, so every near-miss the chat already
 * survives (fenced JSON, prose, a thinking model's thought parts) is survived
 * here too. The instructions are English and one word carries the language, as
 * in `systemPrompt`. `summaryText` turns the validated blocks into the
 * paragraph the card shows.
 */

import { t, type Language } from '../i18n';
import { formatValue, formatWeek } from '../money';
import { describeWeeklyReview, type WeeklyReview } from '../weeklyReview';
import { LANGUAGE_NAME } from './aiContext';
import type { AiBlock } from './aiSchema';

const SYSTEM = `You write a short summary of the user's last week inside a personal tracker app. You get a JSON CONTEXT with last week's figures from up to three logs (training, daily tasks, spending), each with the sentence the app already shows under it.
Use only CONTEXT. Never invent numbers, days, causes or feelings. A log that is not in CONTEXT had nothing last week: do not mention it.
Tone: honest and calm, like a friend who read the numbers. Say what happened. If the numbers show something that went well, name it plainly. At most ONE small, concrete suggestion for this week, and only if the numbers point at it.
No guilt and no blame: never "you missed", "you failed", "you should have". No praise the numbers do not support, no motivation slogans, no emoji, no exclamation marks.
Reply ONLY with JSON: {"blocks":[{"type":"text","text":"..."}]} — exactly one text block, 2–4 sentences, at most 70 words.
Write every string in {LANGUAGE}. Keep the currency label exactly as in CONTEXT.`;

export interface WeeklySummaryPrompt {
  systemPrompt: string;
  /** The JSON the request carries as CONTEXT. */
  context: string;
  /** The user turn. */
  question: string;
}

/** Build the request's three parts from the review the card is showing. */
export function weeklySummaryPrompt(
  review: WeeklyReview,
  money: { currency: string; scale: number },
  lang: Language,
): WeeklySummaryPrompt {
  // The card's own sentences, so the model starts from what the user just read.
  const lines = new Map(
    describeWeeklyReview(review, money, lang).map((column) => [column.key, column.line]),
  );
  const context: Record<string, unknown> = {
    week: { from: review.week.from, to: review.week.to, label: formatWeek(review.week.from, lang) },
  };
  if (review.workouts) {
    context.workouts = {
      count: review.workouts.count,
      // null: the log did not exist yet, so there is nothing to compare with.
      weekBefore: review.workouts.previous,
      shown: lines.get('workouts') ?? '',
    };
  }
  if (review.tasks) {
    context.tasks = {
      percentDone: review.tasks.percent,
      weekBeforePercent: review.tasks.previous,
      mostOftenUnanswered: review.tasks.slipped
        ? { task: review.tasks.slipped.name, days: review.tasks.slipped.count }
        : null,
      note: 'Days skipped on purpose are excused and not counted at all.',
      shown: lines.get('tasks') ?? '',
    };
  }
  if (review.spent) {
    context.spent = {
      total: formatValue(review.spent.total, money.scale),
      currency: money.currency,
      topCategory: review.spent.top
        ? {
            name: review.spent.top.name,
            percentOfTotal: Math.round(review.spent.top.share * 100),
          }
        : null,
      shown: lines.get('spent') ?? '',
    };
  }
  return {
    systemPrompt: SYSTEM.replace('{LANGUAGE}', LANGUAGE_NAME[lang]),
    context: JSON.stringify(context, null, 1),
    question: t('Summarize my last week in a few sentences.', lang),
  };
}

/**
 * Is the button on the card? Only with the engagement switch on AND a key that
 * passed its test. Anything less and the card is X3 exactly as it was — no
 * button that leads to Settings, because the card is not an advert for the AI.
 */
export function weeklySummaryOffered(params: {
  engagement: boolean;
  aiStatus: 'off' | 'testing' | 'ready' | 'error';
}): boolean {
  return params.engagement && params.aiStatus === 'ready';
}

/**
 * The paragraph the card shows: the text blocks, joined. A model that answered
 * with a summary block anyway still said something in its notes, so those are
 * read too rather than calling a usable answer unreadable.
 */
export function summaryText(blocks: readonly AiBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === 'text') parts.push(block.text);
    else if (block.type === 'summary') parts.push(...(block.notes ?? []));
  }
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
}
