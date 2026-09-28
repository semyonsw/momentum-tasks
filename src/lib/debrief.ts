/**
 * The debrief — a few questions after a workout, and what the assistant reads
 * back out of the answers.
 *
 *   ╭──────────────────────────────────────────╮
 *   │ ▓▓▓▓▓▓▓░░░░░░░░  2 of 6        Later     │
 *   │ How did the weights feel?                │
 *   │ ( Too light ) ( A bit light ) (▓Right▓)  │
 *   │ ( A bit heavy ) ( Too heavy )            │
 *   │ ╭ Add a note ──────────────────────╮     │
 *   │ ╰──────────────────────────────────╯     │
 *   │  Back                  Skip   ( Next )   │
 *   ╰──────────────────────────────────────────╯
 *
 * ── WHY THIS EXISTS WHEN THE LOG ALREADY HAS EVERY NUMBER ──────────────────
 *
 * The log knows that the bench went 60 × 8, 8, 6. It does not know that the
 * third set was short because a shoulder twinged, or because the user slept four
 * hours, or because 60 is simply too heavy for eight — and those three call for
 * three different next sessions. An assistant asked to "improve my Push" from
 * the numbers alone has to guess which one it was, and a confident guess is the
 * worst thing an assistant can offer about somebody's joints.
 *
 * So after a workout the app asks, and the answers travel with the workout
 * context (`aiContext.buildWorkoutContext` → `debriefs`). The model is told to
 * weigh them: "too heavy" and a sore lower back mean do not add load, "keep it as
 * is" means do not propose an edit the data does not force.
 *
 * ── NEVER IN THE WAY ────────────────────────────────────────────────────────
 *
 * Every question can be skipped, the whole thing can be put off (`Later` keeps
 * it waiting on Home), and a debrief nobody answers is simply absent — never a
 * nag, never a second popup. Options first, because a tap is what somebody with
 * chalk on their hands can manage; a note under every question, because the
 * detail that matters ("left knee, only on the way down") never fits an option.
 *
 * ── THE QUESTIONS ARE STORED WITH THE ANSWERS ──────────────────────────────
 *
 * `debriefQuestions` builds the list from the workout itself — the exercise
 * question offers THIS session's exercises — and the list is kept on the record.
 * A debrief answered in March must still read correctly in May, after the
 * routine has been rewritten and the wording of a question has changed.
 *
 * Everything here is pure: the store persists it and the sheet draws it.
 */

import type { CompletedWorkout } from './completedWorkout';
import type { ID } from '../types/models';

export type QuestionKind = 'single' | 'multi' | 'text';

export interface DebriefOption {
  id: string;
  /** English — translated at render unless `literal` (an exercise's own name). */
  label: string;
  literal?: boolean;
  /** Choosing it clears the others in a `multi` question ("None"). */
  exclusive?: boolean;
}

export interface DebriefQuestion {
  id: string;
  /** English, translated at render. */
  prompt: string;
  kind: QuestionKind;
  options: DebriefOption[];
  /** Whether the note field shows under the options. Always true for `text`. */
  allowNote: boolean;
}

export interface DebriefAnswer {
  /** Option ids, in the order they were picked. Empty for a text-only answer. */
  choices: string[];
  note?: string;
}

export type DebriefStatus = 'pending' | 'answered' | 'dismissed';

export interface WorkoutDebrief {
  workoutId: ID;
  routineId?: ID;
  /** The workout's title when it was saved — "Push". */
  title: string;
  /** The workout's `startedAt`, for the date the assistant quotes. */
  startedAt: string;
  createdAt: string;
  answeredAt?: string;
  status: DebriefStatus;
  questions: DebriefQuestion[];
  answers: Record<string, DebriefAnswer>;
}

/** How many debriefs the store keeps. A year of three-a-week is plenty. */
export const DEBRIEF_CAP = 160;
/** A pending debrief older than this stops being offered on Home. */
export const DEBRIEF_OFFER_DAYS = 7;
/** A note is a sentence or two, not an essay. */
export const DEBRIEF_NOTE_MAX = 400;

const opt = (id: string, label: string, extra?: Partial<DebriefOption>): DebriefOption => ({
  id,
  label,
  ...extra,
});

/**
 * The questions for one workout.
 *
 * Six at most, and each one exists because its answer changes what the next
 * session should be:
 *
 *   load     the weights were pitched right, or not — the direct input to
 *            "add 2.5 kg or not"
 *   energy   a bad day, or a bad plan — the same short set reads differently
 *   pain     where something hurt — the one answer that overrides all the others
 *   hardest  which exercise was the wall (only with two or more exercises)
 *   plan     what the user wants done with the routine, or whether a one-off
 *            session is worth repeating
 *   notes    anything else, in their own words
 */
export function debriefQuestions(
  workout: Pick<CompletedWorkout, 'exercises' | 'routineId'>,
): DebriefQuestion[] {
  const questions: DebriefQuestion[] = [
    {
      id: 'load',
      prompt: 'How did the weights feel?',
      kind: 'single',
      allowNote: true,
      options: [
        opt('too_light', 'Too light'),
        opt('light', 'A bit light'),
        opt('right', 'Just right'),
        opt('heavy', 'A bit heavy'),
        opt('too_heavy', 'Too heavy'),
      ],
    },
    {
      id: 'energy',
      prompt: 'How was your energy?',
      kind: 'single',
      allowNote: true,
      options: [opt('low', 'Low'), opt('normal', 'Normal'), opt('high', 'High')],
    },
    {
      id: 'pain',
      prompt: 'Any pain or discomfort?',
      kind: 'multi',
      allowNote: true,
      options: [
        opt('none', 'None', { exclusive: true }),
        opt('shoulder', 'Shoulder'),
        opt('elbow', 'Elbow'),
        opt('wrist', 'Wrist'),
        opt('neck', 'Neck'),
        opt('lower_back', 'Lower back'),
        opt('hip', 'Hip'),
        opt('knee', 'Knee'),
        opt('other', 'Somewhere else'),
      ],
    },
  ];

  const trained = workout.exercises.filter((e) => e.setCount > 0);
  if (trained.length >= 2) {
    questions.push({
      id: 'hardest',
      prompt: 'Which exercise was the hardest?',
      kind: 'single',
      allowNote: true,
      options: [
        ...trained.slice(0, 8).map((e) => opt(`ex:${e.exerciseId}`, e.name, { literal: true })),
        opt('none', 'None stood out'),
      ],
    });
  }

  questions.push(
    workout.routineId
      ? {
          id: 'plan',
          prompt: 'What should happen to this routine next time?',
          kind: 'single',
          allowNote: true,
          options: [
            opt('keep', 'Keep it as is'),
            opt('harder', 'Make it harder'),
            opt('easier', 'Make it easier'),
            opt('swap', 'Swap some exercises'),
            opt('shorter', 'Make it shorter'),
          ],
        }
      : {
          id: 'repeat',
          prompt: 'Would you do this workout again?',
          kind: 'single',
          allowNote: true,
          options: [opt('yes', 'Yes'), opt('maybe', 'Maybe'), opt('no', 'No')],
        },
    {
      id: 'notes',
      prompt: 'Anything else the coach should know?',
      kind: 'text',
      allowNote: true,
      options: [],
    },
  );
  return questions;
}

/** A fresh, unanswered debrief for a workout that was just saved. */
export function createDebrief(workout: CompletedWorkout, now: Date = new Date()): WorkoutDebrief {
  return {
    workoutId: workout.id,
    ...(workout.routineId ? { routineId: workout.routineId } : {}),
    title: workout.title,
    startedAt: workout.startedAt,
    createdAt: now.toISOString(),
    status: 'pending',
    questions: debriefQuestions(workout),
    answers: {},
  };
}

/**
 * Pick or unpick one option — the chip rule, in one place.
 *
 *   single  the tapped option, or nothing if it was already the one
 *   multi   toggled; an `exclusive` option ("None") clears the rest, and any
 *           other option clears the exclusive one
 */
export function toggleChoice(
  question: DebriefQuestion,
  current: readonly string[],
  optionId: string,
): string[] {
  if (question.kind === 'single') return current[0] === optionId ? [] : [optionId];
  if (current.includes(optionId)) return current.filter((id) => id !== optionId);
  const option = question.options.find((o) => o.id === optionId);
  if (option?.exclusive) return [optionId];
  const exclusive = new Set(question.options.filter((o) => o.exclusive).map((o) => o.id));
  return [...current.filter((id) => !exclusive.has(id)), optionId];
}

/** Whether an answer says anything — a choice, or a note with words in it. */
export function isAnswered(answer: DebriefAnswer | undefined): boolean {
  if (!answer) return false;
  return answer.choices.length > 0 || (answer.note ?? '').trim() !== '';
}

/** How many of a debrief's questions have an answer. */
export function answeredCount(debrief: WorkoutDebrief): number {
  return debrief.questions.filter((q) => isAnswered(debrief.answers[q.id])).length;
}

/** The pending debrief Home should offer, if any: the newest, still recent. */
export function debriefToOffer(
  debriefs: readonly WorkoutDebrief[],
  now: Date = new Date(),
): WorkoutDebrief | null {
  const cutoff = now.getTime() - DEBRIEF_OFFER_DAYS * 86_400_000;
  let best: WorkoutDebrief | null = null;
  for (const debrief of debriefs) {
    if (debrief.status !== 'pending') continue;
    if (new Date(debrief.createdAt).getTime() < cutoff) continue;
    if (!best || debrief.createdAt > best.createdAt) best = debrief;
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* For the assistant                                                   */
/* ------------------------------------------------------------------ */

/**
 * One debrief as the model reads it: `{ date, routine, answers }`, with every
 * answer spelled out in ENGLISH option labels (the system prompt is English) and
 * the user's notes verbatim, in whatever language they wrote them.
 *
 *   { "date": "2026-09-27", "routine": "Push", "routineId": "r2",
 *     "answers": { "How did the weights feel?": "A bit heavy",
 *                  "Any pain or discomfort?": "Shoulder — left, on the press" } }
 *
 * Null for a debrief with nothing in it: an empty row would read to the model as
 * "asked and answered nothing", which is not what happened.
 */
export function debriefForAi(debrief: WorkoutDebrief): Record<string, unknown> | null {
  if (debrief.status === 'dismissed') return null;
  const answers: Record<string, string> = {};
  for (const question of debrief.questions) {
    const answer = debrief.answers[question.id];
    if (!answer || !isAnswered(answer)) continue;
    const labels = answer.choices
      .map((id) => question.options.find((o) => o.id === id)?.label)
      .filter((label): label is string => label != null);
    const note = (answer.note ?? '').trim().replace(/\s+/g, ' ');
    answers[question.prompt] = [labels.join(', '), note].filter((part) => part !== '').join(' — ');
  }
  if (Object.keys(answers).length === 0) return null;
  return {
    date: debrief.startedAt.slice(0, 10),
    routine: debrief.title,
    ...(debrief.routineId ? { routineId: debrief.routineId } : {}),
    answers,
  };
}

/* ------------------------------------------------------------------ */
/* Rehydration guards                                                  */
/* ------------------------------------------------------------------ */

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function sanitizeQuestion(raw: unknown): DebriefQuestion | null {
  if (!isRec(raw)) return null;
  const id = str(raw.id);
  const prompt = str(raw.prompt);
  const kind =
    raw.kind === 'single' || raw.kind === 'multi' || raw.kind === 'text' ? raw.kind : null;
  if (!id || !prompt || !kind) return null;
  const options: DebriefOption[] = [];
  if (Array.isArray(raw.options)) {
    for (const o of raw.options) {
      if (!isRec(o) || !str(o.id) || !str(o.label)) continue;
      options.push({
        id: o.id as string,
        label: o.label as string,
        ...(o.literal === true ? { literal: true } : {}),
        ...(o.exclusive === true ? { exclusive: true } : {}),
      });
    }
  }
  if (kind !== 'text' && options.length === 0) return null;
  return { id, prompt, kind, options, allowNote: kind === 'text' || raw.allowNote !== false };
}

function sanitizeAnswer(raw: unknown, question: DebriefQuestion): DebriefAnswer | null {
  if (!isRec(raw)) return null;
  const known = new Set(question.options.map((o) => o.id));
  const choices = Array.isArray(raw.choices)
    ? raw.choices.filter((c): c is string => typeof c === 'string' && known.has(c))
    : [];
  const note = str(raw.note)?.slice(0, DEBRIEF_NOTE_MAX);
  const answer: DebriefAnswer = {
    choices: question.kind === 'single' ? choices.slice(0, 1) : [...new Set(choices)],
    ...(note ? { note } : {}),
  };
  return isAnswered(answer) ? answer : null;
}

function sanitizeDebrief(raw: unknown): WorkoutDebrief | null {
  if (!isRec(raw)) return null;
  const workoutId = str(raw.workoutId);
  const startedAt = str(raw.startedAt);
  if (!workoutId || !startedAt) return null;
  const questions = Array.isArray(raw.questions)
    ? raw.questions.map(sanitizeQuestion).filter((q): q is DebriefQuestion => q != null)
    : [];
  if (questions.length === 0) return null;
  const answers: Record<string, DebriefAnswer> = {};
  const rawAnswers = isRec(raw.answers) ? raw.answers : {};
  for (const question of questions) {
    const answer = sanitizeAnswer(rawAnswers[question.id], question);
    if (answer) answers[question.id] = answer;
  }
  const status: DebriefStatus =
    raw.status === 'answered' || raw.status === 'dismissed' ? raw.status : 'pending';
  const routineId = str(raw.routineId);
  const answeredAt = str(raw.answeredAt);
  return {
    workoutId,
    ...(routineId ? { routineId } : {}),
    title: str(raw.title) ?? '',
    startedAt,
    createdAt: str(raw.createdAt) ?? startedAt,
    ...(answeredAt ? { answeredAt } : {}),
    status,
    questions,
    answers,
  };
}

/** A clean list out of anything at all — the store's rehydration and a backup's. */
export function sanitizeDebriefs(input: unknown): WorkoutDebrief[] {
  const list = Array.isArray(input)
    ? input
    : isRec(input) && Array.isArray(input.debriefs)
      ? input.debriefs
      : [];
  const seen = new Set<string>();
  const out: WorkoutDebrief[] = [];
  for (const raw of list) {
    const clean = sanitizeDebrief(raw);
    if (!clean || seen.has(clean.workoutId)) continue;
    seen.add(clean.workoutId);
    out.push(clean);
  }
  return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, DEBRIEF_CAP);
}
