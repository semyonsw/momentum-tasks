/**
 * What the assistant is told, and what the user is offered to ask.
 *
 * ── THE SYSTEM PROMPT IS IN ENGLISH; THE ANSWER IS NOT ─────────────────────
 *
 * The instructions are the handoff's, verbatim, in English — that is the
 * language they were written and tested in, and a translated instruction is a
 * second prompt to keep in step. What changes with the setting is one word:
 * `Write every string in Russian`. The app ships in Russian, and an assistant
 * that answers a Russian phone in English is a feature that does not work.
 *
 * ── THE SUGGESTIONS ARE NAMED FROM THE USER'S OWN LOG ──────────────────────
 *
 * "How is my bench press going?" is a question about somebody else's training
 * if the user does not bench. So the lift is the one they train most, the
 * routine is the one they did last, and the month is the one that just ended —
 * each handed in by the context builder that already knows. Where a fact is
 * missing the prompt falls back to a generic one rather than to a blank.
 */

import { monthNames } from '../days';
import { t, type Language } from '../i18n';
import { LANGUAGE_NAME } from './aiContext';
import type { AiSection } from './aiSchema';

const PREAMBLE = `You are the assistant inside a personal, offline-first tracker app. You get a JSON CONTEXT with the user's own data and a question.
Answer only from CONTEXT. If CONTEXT does not contain what is needed, say so in one sentence. Never invent numbers.
Reply ONLY with JSON matching the response schema: {"blocks":[...]}.
Use "summary" blocks for anything with numbers (at most 3 stats, 8 rows, 4 notes), "text" blocks for short explanations (≤ 80 words each).
Plain, factual tone. No motivation, no emoji, no exclamation marks.
Write every string in {LANGUAGE}. Dates as "12 Sep". Keep the user's units and currency label exactly as in CONTEXT.`;

const WORKOUT = `You can suggest workout routines.
When the user asks for a new routine, or when a clear improvement follows from the data, add ONE block of type "routine_proposal".
- kind "new": a complete routine of 4–7 exercises. Prefer exercises from CONTEXT.library and set exerciseId when you do. For an exercise not in the library, set "muscle" to its primary muscle group.
- kind "edit": targetRoutineId must be one of CONTEXT.routines. List EVERY exercise of that routine in order, each with change = same | changed | removed, plus any additions with change = new.
Weights must be realistic for THIS user: base them on their logged top sets. Progress in small steps (2.5 kg upper body, 5 kg lower body, or +1–2 reps).
Do not change an exercise that runs a rep ladder (ladder present in CONTEXT) — the app already progresses it.
"why" cites the user's own numbers in 1–3 sentences.
Precede the proposal with one short "text" block. Never claim the change is saved: the user must press Add or Apply.`;

const TASKS = `You answer questions about daily tasks and habits. "excused" means the user chose not to do it on purpose; it is not a failure and must not be counted as a miss.
You may suggest schedule changes in text; you cannot change tasks yourself.`;

const EXPENSES = `You answer questions about expenses and income. Whole-month amounts (like rent) belong to their month, never to a single day.
Use "bars" for month-by-month totals. When suggesting savings, name the category and the monthly amount involved.`;

const ADDENDUM: Record<AiSection, string> = { Workout: WORKOUT, Tasks: TASKS, Expenses: EXPENSES };

export function systemPrompt(section: AiSection, lang: Language): string {
  return `${PREAMBLE.replace('{LANGUAGE}', LANGUAGE_NAME[lang])}\n\n${ADDENDUM[section]}`;
}

/* ------------------------------------------------------------------ */
/* Suggested prompts                                                   */
/* ------------------------------------------------------------------ */

export interface SuggestedPrompt {
  key: string;
  /** What is sent, and what the empty chat lists. */
  label: string;
  /** The short form, for a 32 dp chip. */
  chip: string;
  /** The one word right-aligned in the empty chat's rows. */
  hint: string;
}

/** The facts the prompts are named from. Each is optional. */
export interface PromptFacts {
  topLift?: string | null;
  lastRoutine?: string | null;
  /** 0-based month for "How did {month} go?". Defaults to this one. */
  thisMonth?: number;
  /** 0-based month for "Where did {month} go?". Defaults to the previous one. */
  lastMonth?: number;
}

/** A month name as it sits mid-sentence: lower case in Russian, capitalised in English. */
function monthWord(month: number, lang: Language): string {
  const name = monthNames(lang)[((month % 12) + 12) % 12];
  return lang === 'ru' ? name.toLowerCase() : name;
}

export function suggestedPrompts(
  section: AiSection,
  facts: PromptFacts,
  lang: Language,
  now: Date = new Date(),
): SuggestedPrompt[] {
  const tr = (key: string, vars?: Record<string, string | number>) => t(key, lang, vars);
  if (section === 'Workout') {
    const prompts: SuggestedPrompt[] = [
      {
        key: 'w-sum',
        label: tr('Summarize my last 4 weeks'),
        chip: tr('Last 4 weeks'),
        hint: tr('summary'),
      },
    ];
    if (facts.topLift) {
      prompts.push({
        key: 'w-lift',
        label: tr('How is my {lift} going?', { lift: facts.topLift }),
        chip: tr('{lift} trend', { lift: facts.topLift }),
        hint: tr('trend'),
      });
    }
    prompts.push({
      key: 'w-new',
      label: tr('Suggest a new routine'),
      chip: tr('Suggest a routine'),
      hint: tr('new'),
    });
    if (facts.lastRoutine) {
      prompts.push({
        key: 'w-edit',
        label: tr('Improve my {routine} routine', { routine: facts.lastRoutine }),
        chip: tr('Improve {routine}', { routine: facts.lastRoutine }),
        hint: tr('edit'),
      });
    }
    return prompts;
  }

  if (section === 'Tasks') {
    const month = facts.thisMonth ?? now.getMonth();
    return [
      {
        key: 't-month',
        label: tr('How did {month} go?', { month: monthWord(month, lang) }),
        chip: tr('This month'),
        hint: tr('summary'),
      },
      {
        key: 't-miss',
        label: tr('Which habit slips most?'),
        chip: tr('What slips most?'),
        hint: tr('insight'),
      },
      {
        key: 't-plan',
        label: tr('Suggest a better schedule'),
        chip: tr('Better schedule'),
        hint: tr('plan'),
      },
    ];
  }

  const last = facts.lastMonth ?? now.getMonth() - 1;
  const lastLabel = tr('Where did {month} go?', { month: monthWord(last, lang) });
  return [
    {
      key: 'e-5m',
      label: tr('Summarize the last 5 months'),
      chip: tr('Last 5 months'),
      hint: tr('summary'),
    },
    { key: 'e-last', label: lastLabel, chip: lastLabel, hint: tr('breakdown') },
    {
      key: 'e-cut',
      label: tr('Where can I cut back?'),
      chip: tr('Where to cut back'),
      hint: tr('insight'),
    },
  ];
}
