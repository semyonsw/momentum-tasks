import { describe, expect, it } from 'vitest';

import {
  GEMINI_BASE,
  alternating,
  HISTORY_TURNS,
  buildChatRequest,
  buildHelloRequest,
  buildListRequest,
  checkKeyShape,
  mapError,
  mapParseFailure,
  mapTransportFailure,
  maskKey,
  parseChatResponse,
  parseModelList,
} from './gemini';
import { responseSchema } from './aiSchema';

/**
 * The requests and what the app makes of the answers.
 *
 * The property this suite exists for is the one nobody would notice breaking:
 * the KEY never appears in a URL. A key in a query string is a key in every log
 * that ever recorded a URL, and the header is the whole defence.
 */

const KEY = 'AIzaSyTESTKEY-1234567890abcdef';

const chat = (overrides: Partial<Parameters<typeof buildChatRequest>[0]> = {}) =>
  buildChatRequest({
    key: KEY,
    model: 'gemini-3.8-flash',
    systemPrompt: 'SYSTEM',
    context: '{"today":"2026-09-27"}',
    history: [],
    userText: 'How is my bench going?',
    ...overrides,
  });

describe('the key travels in a header', () => {
  it('for every request the app builds', () => {
    for (const request of [buildListRequest(KEY), buildHelloRequest(KEY, 'gemini-x'), chat()]) {
      expect(request.headers['x-goog-api-key']).toBe(KEY);
      expect(request.url).not.toContain(KEY);
      expect(request.url).not.toContain('key=');
      expect(request.url.startsWith(GEMINI_BASE)).toBe(true);
    }
  });

  it('and never in the body either', () => {
    expect(chat().body).not.toContain(KEY);
    expect(buildHelloRequest(KEY, 'gemini-x').body).not.toContain(KEY);
  });
});

describe('the key test', () => {
  it('lists one model first, then asks the chosen one to say hello', () => {
    expect(buildListRequest(KEY)).toMatchObject({
      method: 'GET',
      url: `${GEMINI_BASE}/models?pageSize=1`,
    });
    const hello = buildHelloRequest(KEY, 'gemini-3.8-flash');
    expect(hello.method).toBe('POST');
    expect(hello.url).toBe(`${GEMINI_BASE}/models/gemini-3.8-flash:generateContent`);
    expect(JSON.parse(hello.body!)).toEqual({
      contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK.' }] }],
      generationConfig: { maxOutputTokens: 8 },
    });
  });

  it('accepts a model id with its `models/` prefix and escapes anything odd', () => {
    expect(buildHelloRequest(KEY, 'models/gemini-x').url).toContain('/models/gemini-x:');
    expect(buildHelloRequest(KEY, 'a/b').url).toContain('/models/a%2Fb:');
  });

  it('refuses a key that is not a Google key before any network', () => {
    expect(checkKeyShape('', 'en')).toBe('Paste a Google AI key first.');
    expect(checkKeyShape('sk-ant-123', 'en')).toContain('AIza');
    expect(checkKeyShape('  AIzaSyOK  ', 'en')).toBeNull();
  });

  it('masks a key down to its two ends', () => {
    expect(maskKey('AIzaSyABCDEFGH3kQ2')).toBe('AIza••••••••••3kQ2');
    expect(maskKey('short')).toBe('•••••');
  });
});

describe('a chat request', () => {
  it('has the system prompt, the context as the first turn, and the question last', () => {
    const body = JSON.parse(chat().body!);
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'SYSTEM' }] });
    expect(body.contents[0]).toEqual({
      role: 'user',
      parts: [{ text: 'CONTEXT (JSON):\n{"today":"2026-09-27"}' }],
    });
    expect(body.contents[1].role).toBe('model');
    expect(body.contents.at(-1)).toEqual({
      role: 'user',
      parts: [{ text: 'How is my bench going?' }],
    });
  });

  it('asks for JSON in the schema, at a low temperature', () => {
    const body = JSON.parse(chat().body!);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema).toEqual(
      JSON.parse(JSON.stringify(responseSchema)),
    );
    expect(body.generationConfig.temperature).toBe(0.4);
  });

  it('carries only the last turns, and never starts them on a model turn', () => {
    const history = Array.from({ length: 25 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'model') as 'user' | 'model',
      text: `turn ${i}`,
    }));
    const body = JSON.parse(chat({ history }).body!);
    // Priming pair + carried history + the question.
    const carried = body.contents.slice(2, -1);
    expect(carried.length).toBeLessThanOrEqual(HISTORY_TURNS);
    expect(carried[0].role).toBe('user');
    // The trailing question had no answer, so the new one replaces it.
    expect(carried.at(-1).parts[0].text).toBe('turn 23');
    // Roles alternate all the way through, which Gemini insists on.
    const roles = body.contents.map((c: { role: string }) => c.role);
    for (let i = 1; i < roles.length; i += 1) expect(roles[i]).not.toBe(roles[i - 1]);
  });
});

describe('a history with a question that failed', () => {
  it('drops the unanswered question, so the turns still alternate', () => {
    expect(
      alternating([
        { role: 'user', text: 'Q1' },
        { role: 'model', text: 'A1' },
        { role: 'user', text: 'Q2 (timed out)' },
        { role: 'user', text: 'Q3' },
        { role: 'model', text: 'A3' },
        { role: 'user', text: 'Q4 (no signal)' },
      ]),
    ).toEqual([
      { role: 'user', text: 'Q1' },
      { role: 'model', text: 'A1' },
      { role: 'user', text: 'Q3' },
      { role: 'model', text: 'A3' },
    ]);
  });
});

describe('reading an answer', () => {
  const answer = (text: string, finishReason = 'STOP') => ({
    candidates: [{ content: { parts: [{ text }] }, finishReason }],
  });

  it('parses the JSON the model wrote and keeps the raw text for history', () => {
    const raw = '{"blocks":[{"type":"text","text":"Hi"}]}';
    expect(parseChatResponse(answer(raw))).toEqual({
      ok: true,
      json: { blocks: [{ type: 'text', text: 'Hi' }] },
      raw,
    });
  });

  it('strips a code fence the model added anyway', () => {
    const result = parseChatResponse(answer('```json\n{"blocks":[]}\n```'));
    expect(result).toMatchObject({ ok: true, json: { blocks: [] } });
  });

  it('says SAFETY apart from a broken shape', () => {
    expect(parseChatResponse(answer('', 'SAFETY'))).toEqual({ ok: false, reason: 'safety' });
    expect(parseChatResponse({ promptFeedback: { blockReason: 'OTHER' } })).toEqual({
      ok: false,
      reason: 'safety',
    });
    expect(parseChatResponse(answer('not json'))).toEqual({ ok: false, reason: 'shape' });
    expect(parseChatResponse({})).toEqual({ ok: false, reason: 'shape' });
    expect(parseChatResponse(null)).toEqual({ ok: false, reason: 'shape' });
  });

  it('leaves a thinking model’s thought parts out of the answer', () => {
    const body = {
      candidates: [
        {
          content: {
            parts: [
              { text: 'Let me think about the bench…', thought: true },
              { text: '{"blocks":[]}' },
            ],
          },
          finishReason: 'STOP',
        },
      ],
    };
    expect(parseChatResponse(body)).toMatchObject({ ok: true, raw: '{"blocks":[]}' });
  });

  it('says an answer was cut off, rather than that it was the wrong shape', () => {
    expect(parseChatResponse(answer('{"blocks":[{"type":"te', 'MAX_TOKENS'))).toEqual({
      ok: false,
      reason: 'length',
    });
  });

  it('lists only the models that can chat', () => {
    expect(
      parseModelList({
        models: [
          { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/text-embedding', supportedGenerationMethods: ['embedContent'] },
          { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
        ],
      }),
    ).toEqual(['gemini-3.8-flash']);
    expect(parseModelList('nope')).toEqual([]);
  });
});

describe('failures are sentences', () => {
  const google = (message: string) => ({ error: { code: 400, message } });

  it('passes Google’s own words through for a bad or restricted key', () => {
    for (const status of [400, 401, 403]) {
      expect(mapError(status, google('API key not valid.'), 'm', 'en')).toBe(
        'Google said: API key not valid.',
      );
    }
    expect(mapError(403, null, 'm', 'en')).toBe('Google refused the key.');
  });

  it('names the model on a 404 and the quota on a 429', () => {
    expect(mapError(404, null, 'gemini-3.8-flash', 'en')).toBe(
      'This key cannot use gemini-3.8-flash.',
    );
    expect(mapError(429, google('Resource exhausted'), 'm', 'en')).toBe(
      'The key works but is over its quota right now.',
    );
  });

  it('covers a server failure, a timeout and no network', () => {
    expect(mapError(503, null, 'm', 'en')).toContain('Try again in a minute');
    expect(mapTransportFailure('timeout', 'en')).toBe('Google took too long to answer. Try again.');
    expect(mapTransportFailure('network', 'en')).toBe(
      'Could not reach Google. Check your connection.',
    );
  });

  it('speaks Russian on a Russian phone', () => {
    expect(mapTransportFailure('network', 'ru')).not.toBe(mapTransportFailure('network', 'en'));
    expect(mapError(404, null, 'gemini-x', 'ru')).toContain('gemini-x');
    expect(mapParseFailure('safety', 'ru')).not.toBe(mapParseFailure('safety', 'en'));
  });
});
