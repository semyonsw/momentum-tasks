/**
 * The Gemini API, as data: the requests the app sends and what it makes of the
 * answers. Nothing in this file touches the network — `transport.ts` does the one
 * `fetch`, and everything here is a function a test can call.
 *
 *   buildListRequest   GET  /models?pageSize=…        the key test, steps 1–2
 *   buildHelloRequest  POST /models/{m}:generateContent  the key test, step 3
 *   buildChatRequest   POST /models/{m}:generateContent  a chat turn
 *   parseChatResponse  candidates[0] → the JSON the model wrote, or why not
 *   mapError           an HTTP status + body → one readable sentence
 *
 * ── STRAIGHT FROM THE PHONE, WITH THE KEY IN A HEADER ──────────────────────
 *
 * There is no server. The user's own Google AI key goes from this phone to
 * `generativelanguage.googleapis.com` and nowhere else, and it travels in
 * `x-goog-api-key` rather than in `?key=` — a query string is what ends up in a
 * proxy log, a crash report or a screenshot of an error, and a header is not.
 * A test pins that the key never appears in any URL built here.
 *
 * ── EVERY FAILURE IS A SENTENCE ────────────────────────────────────────────
 *
 * The person holding the phone did not write this request and cannot debug it.
 * So a 404 is "This key cannot use gemini-3.8-flash", a 429 is "over its quota",
 * and a 403 is Google's own message behind "Google said:", because Google's
 * sentence about a restricted key is better than any guess made here. The key
 * itself is never part of one.
 */

import { t, type Language } from '../i18n';
import { responseSchema } from './aiSchema';

export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** The default model id, kept in `aiStore` so it can be changed. */
export const DEFAULT_MODEL = 'gemini-3.8-flash';

/**
 * 90 s for a chat turn, 10 s for each step of the key test.
 *
 * 90 since the context became the WHOLE log rather than a 24,000-character
 * window of it: a year of sessions, amounts and task days is ~100k tokens, and a
 * thinking model reads that before its first token. A slow answer is still an
 * answer; a timeout is a question asked again, with the same wait again.
 *
 * Before that, 30:
 * A chat turn was 15 s, which a thinking model reading a 12,000-character
 * context can spend before its first token on a busy afternoon — and a turn cut
 * off at 15 s is a question the user has to ask again, which costs more than
 * waiting.
 */
export const CHAT_TIMEOUT_MS = 90_000;
export const TEST_TIMEOUT_MS = 10_000;

/* ------------------------------------------------------------------ */
/* When Google has a bad moment                                        */
/* ------------------------------------------------------------------ */

/**
 * The model tried when the chosen one keeps failing on Google's side.
 *
 * `gemini-flash-latest` is Google's own alias for its current Flash model, so it
 * is the one id that cannot go stale in a build nobody updates. It is only ever
 * a fallback for a 5xx: a 404, a refused key or a quota is about the KEY, and a
 * different model would not help.
 */
export const FALLBACK_MODEL = 'gemini-flash-latest';

/**
 * How long to wait before each retry of a chat turn: 1.2 s, then 3 s.
 *
 * ── WHY A 5xx IS RETRIED AND NOT SHOWN ─────────────────────────────────────
 *
 * `500 INTERNAL` and `503 UNAVAILABLE` ("the model is overloaded") are the two
 * errors Gemini returns most, they are Google's and not the request's — the same
 * body succeeds seconds later — and they came straight through to the chat as
 * "Google had a problem answering" on the first try. Two quiet retries with a
 * growing pause cover nearly all of them; the fallback model covers a model that
 * is having a bad hour; only then is the sentence shown.
 */
export const RETRY_DELAYS_MS = [1200, 3000] as const;

/** A failure worth asking again: Google's side, or a turn that ran out of time. */
export function isRetryable(result: { kind: string; status?: number }): boolean {
  if (result.kind === 'timeout') return true;
  if (result.kind !== 'response' || result.status == null) return false;
  return (
    result.status === 500 || result.status === 502 || result.status === 503 || result.status === 504
  );
}

/** A failure that another model might not have: a 5xx, not a timeout or the key. */
export function wantsFallback(result: { kind: string; status?: number }, model: string): boolean {
  if (result.kind !== 'response' || result.status == null || result.status < 500) return false;
  return model.trim().replace(/^models\//, '') !== FALLBACK_MODEL;
}

/** How many earlier messages of this section's chat travel with a new question. */
export const HISTORY_TURNS = 10;

export interface HttpRequest {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
}

function headers(key: string): Record<string, string> {
  return { 'x-goog-api-key': key, 'Content-Type': 'application/json' };
}

/** `models/gemini-x` or `gemini-x` → the path segment, with nothing a URL cannot hold. */
function modelPath(model: string): string {
  const id = model.trim().replace(/^models\//, '');
  return `models/${encodeURIComponent(id)}`;
}

/**
 * A Google AI key, before the network is asked about it.
 *
 * Google's keys start `AIza`. A string that does not is a half-copied key, a
 * key from a different service, or a password manager's other field, and there
 * is no reason to send it to Google to find that out.
 */
export function checkKeyShape(key: string, lang: Language): string | null {
  const trimmed = key.trim();
  if (trimmed === '') return t('Paste a Google AI key first.', lang);
  if (!trimmed.startsWith('AIza')) {
    return t('Google keys start with "AIza". Check that the whole key was copied.', lang);
  }
  return null;
}

/** `AIza••••••••••3kQ2` — enough to recognise, not enough to use. */
export function maskKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 10) return '•'.repeat(trimmed.length);
  return `${trimmed.slice(0, 4)}••••••••••${trimmed.slice(-4)}`;
}

/** Steps 1 and 2 of the key test, and the model picker's list. */
export function buildListRequest(key: string, pageSize = 1): HttpRequest {
  return {
    url: `${GEMINI_BASE}/models?pageSize=${pageSize}`,
    method: 'GET',
    headers: headers(key),
  };
}

/** Step 3: the smallest request that proves this key can use this model. */
export function buildHelloRequest(key: string, model: string): HttpRequest {
  return {
    url: `${GEMINI_BASE}/${modelPath(model)}:generateContent`,
    method: 'POST',
    headers: headers(key),
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK.' }] }],
      generationConfig: { maxOutputTokens: 8 },
    }),
  };
}

/** One earlier message of the chat, as Gemini wants it. Model turns are their raw JSON. */
export interface HistoryTurn {
  role: 'user' | 'model';
  text: string;
}

/**
 * The history as strictly alternating user/model pairs.
 *
 * Gemini refuses a conversation whose turns do not alternate, and a real chat
 * does not: a question that failed (no signal, a timeout) has no model turn
 * after it, so asking the next one puts two user turns side by side. The
 * unanswered question is dropped — it has no answer to be context for — and so
 * is a trailing question, because the new one is about to follow it.
 */
export function alternating(history: readonly HistoryTurn[]): HistoryTurn[] {
  const out: HistoryTurn[] = [];
  for (const turn of history) {
    if (out.length > 0 && out[out.length - 1].role === turn.role) out[out.length - 1] = turn;
    else out.push(turn);
  }
  while (out.length > 0 && out[out.length - 1].role === 'user') out.pop();
  return out;
}

/**
 * The priming exchange that carries the context.
 *
 * The CONTEXT goes in as the first USER turn rather than into the system
 * instruction, and a canned model reply acknowledges it. The system prompt is
 * the same for every question in a section; the context is rebuilt from the
 * stores on every turn — and keeping the two apart is what lets the history
 * that follows read as a conversation about data the model has already seen.
 */
const READY = JSON.stringify({ blocks: [{ type: 'text', text: 'Ready.' }] });

export function buildChatRequest(params: {
  key: string;
  model: string;
  systemPrompt: string;
  context: string;
  history: readonly HistoryTurn[];
  userText: string;
}): HttpRequest {
  const { key, model, systemPrompt, context, history, userText } = params;
  const turns = alternating(history).slice(-HISTORY_TURNS);
  // The window may have cut mid-exchange: it must open on a user turn, right
  // after the priming model turn.
  if (turns[0]?.role === 'model') turns.shift();

  return {
    url: `${GEMINI_BASE}/${modelPath(model)}:generateContent`,
    method: 'POST',
    headers: headers(key),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [
        { role: 'user', parts: [{ text: `CONTEXT (JSON):\n${context}` }] },
        { role: 'model', parts: [{ text: READY }] },
        ...turns.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
        { role: 'user', parts: [{ text: userText }] },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema,
        temperature: 0.4,
      },
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Reading what came back                                              */
/* ------------------------------------------------------------------ */

export type ChatParse =
  /** `json` is the parsed object; `raw` is the text, kept for the next turn's history. */
  { ok: true; json: unknown; raw: string } | { ok: false; reason: 'safety' | 'shape' | 'length' };

type Rec = Record<string, unknown>;
const rec = (value: unknown): Rec | null =>
  typeof value === 'object' && value !== null ? (value as Rec) : null;

/**
 * `candidates[0].content.parts[*].text`, joined and parsed as JSON.
 *
 * `SAFETY` (and the prompt-level block, which arrives as `promptFeedback`) is its
 * own reason, because "Gemini declined to answer that" is a different sentence
 * from "the answer came back in a shape I could not read" — the first one means
 * asking again will not help.
 */
export function parseChatResponse(body: unknown): ChatParse {
  const root = rec(body);
  if (!root) return { ok: false, reason: 'shape' };
  if (rec(root.promptFeedback)?.blockReason) return { ok: false, reason: 'safety' };

  const candidates = Array.isArray(root.candidates) ? root.candidates : [];
  const first = rec(candidates[0]);
  if (!first) return { ok: false, reason: 'shape' };
  const blocked = ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION'];
  if (blocked.includes(first.finishReason as string)) {
    return { ok: false, reason: 'safety' };
  }

  // A thinking model can return its reasoning as parts marked `thought: true`;
  // those are not the answer, and joined into it they break the JSON.
  const parts = rec(first.content)?.parts;
  const raw = (Array.isArray(parts) ? parts : [])
    .filter((part) => rec(part)?.thought !== true)
    .map((part) => (typeof rec(part)?.text === 'string' ? (rec(part)?.text as string) : ''))
    .join('')
    .trim();
  // Cut off mid-answer: the JSON is unterminated, and "a shape I could not read"
  // would send the user asking the same long question again.
  const truncated = first.finishReason === 'MAX_TOKENS';
  if (raw === '') return { ok: false, reason: truncated ? 'length' : 'shape' };

  // A model asked for JSON occasionally fences it anyway.
  const unfenced = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return { ok: true, json: JSON.parse(unfenced), raw: unfenced };
  } catch {
    // Cut off mid-answer: nothing below can make an unterminated object whole.
    if (truncated) return { ok: false, reason: 'length' };
  }

  // The JSON with a sentence either side of it ("Here you go: {...}").
  const embedded = embeddedJson(unfenced);
  if (embedded !== undefined) return { ok: true, json: embedded, raw: JSON.stringify(embedded) };

  // No JSON at all: the model answered in prose. That IS an answer, and
  // `validateBlocks` reads a bare string as one text block. Re-wrapped for the
  // history, so the next turn shows the model the shape it was meant to use.
  if (!/^[[{]/.test(unfenced)) {
    return {
      ok: true,
      json: unfenced,
      raw: JSON.stringify({ blocks: [{ type: 'text', text: unfenced }] }),
    };
  }
  return { ok: false, reason: 'shape' };
}

/** The outermost `{...}` or `[...]` inside some text that parses, if any. */
function embeddedJson(value: string): unknown {
  for (const [open, close] of [
    ['{', '}'],
    ['[', ']'],
  ] as const) {
    const start = value.indexOf(open);
    const end = value.lastIndexOf(close);
    if (start === -1 || end <= start) continue;
    try {
      return JSON.parse(value.slice(start, end + 1));
    } catch {
      // Try the other bracket.
    }
  }
  return undefined;
}

/** Ids from `GET /models` that can answer a chat, without the `models/` prefix. */
export function parseModelList(body: unknown): string[] {
  const models = rec(body)?.models;
  if (!Array.isArray(models)) return [];
  const out: string[] = [];
  for (const item of models) {
    const model = rec(item);
    if (!model || typeof model.name !== 'string') continue;
    const methods = Array.isArray(model.supportedGenerationMethods)
      ? model.supportedGenerationMethods
      : [];
    if (!methods.includes('generateContent')) continue;
    const id = model.name.replace(/^models\//, '');
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Failures                                                            */
/* ------------------------------------------------------------------ */

/** Google's own `error.message`, if the body carries one. */
function googleMessage(body: unknown): string | null {
  const message = rec(rec(body)?.error)?.message;
  if (typeof message !== 'string' || message.trim() === '') return null;
  // One sentence, not a stack: Google's messages can run to a paragraph of links.
  const trimmed = message.trim();
  return trimmed.length > 220 ? `${trimmed.slice(0, 219)}…` : trimmed;
}

/**
 * An HTTP failure as the sentence shown under the key field or in the chat.
 *
 * 400 / 401 / 403 are Google's words: an invalid key, a key restricted to other
 * APIs, a project with the API switched off — Google says which, precisely, and
 * this does not.
 */
export function mapError(status: number, body: unknown, model: string, lang: Language): string {
  if (status === 404) return t('This key cannot use {model}.', lang, { model });
  if (status === 429) return t('The key works but is over its quota right now.', lang);
  if (status === 400 || status === 401 || status === 403) {
    const said = googleMessage(body);
    return said
      ? t('Google said: {message}', lang, { message: said })
      : t('Google refused the key.', lang);
  }
  if (status === 503) {
    return t('Gemini is overloaded right now. Try again in a minute.', lang);
  }
  if (status >= 500) return t('Google had a problem answering. Try again in a minute.', lang);
  const said = googleMessage(body);
  return said
    ? t('Google said: {message}', lang, { message: said })
    : t('Google answered with error {status}.', lang, { status });
}

/** The two failures that never reached an HTTP status. */
export function mapTransportFailure(kind: 'timeout' | 'network', lang: Language): string {
  return kind === 'timeout'
    ? t('Google took too long to answer. Try again.', lang)
    : t('Could not reach Google. Check your connection.', lang);
}

/** The chat's three ways for a 200 to still be unusable. */
export function mapParseFailure(reason: 'safety' | 'shape' | 'length', lang: Language): string {
  if (reason === 'safety') return t('Gemini declined to answer that.', lang);
  if (reason === 'length') {
    return t('The answer ran out of room before it finished. Try a narrower question.', lang);
  }
  return t('The answer came back in a shape I could not read. Try asking again.', lang);
}
