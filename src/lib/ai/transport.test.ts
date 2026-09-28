import { describe, expect, it } from 'vitest';

import { send } from './transport';

/**
 * The one `fetch`, and the promise that it cannot throw: every way it can fail
 * comes back as a value the chat can turn into a sentence.
 */

const request = { url: 'https://example.test', method: 'GET' as const, headers: {} };

const reply = (status: number, text: string) => async () => ({ status, text: async () => text });

describe('send', () => {
  it('returns the status and the parsed body', async () => {
    expect(await send(request, 1000, reply(200, '{"ok":true}'))).toEqual({
      kind: 'response',
      status: 200,
      body: { ok: true },
    });
  });

  it('reads a non-JSON error page as a status with no body', async () => {
    expect(await send(request, 1000, reply(502, '<html>Bad gateway</html>'))).toEqual({
      kind: 'response',
      status: 502,
      body: null,
    });
  });

  it('says `network` when the request never left', async () => {
    const offline = async () => {
      throw new TypeError('Network request failed');
    };
    expect(await send(request, 1000, offline)).toEqual({ kind: 'network' });
  });

  it('says `timeout` when nothing came back in time, and aborts the request', async () => {
    let aborted = false;
    const slow = (_url: string, init: { signal?: AbortSignal }) =>
      new Promise<never>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('aborted'));
        });
      });
    expect(await send(request, 20, slow)).toEqual({ kind: 'timeout' });
    expect(aborted).toBe(true);
  });

  it('says `timeout` when the deadline lands while the body is still being read', async () => {
    const slowBody = (_url: string, init: { signal?: AbortSignal }) =>
      Promise.resolve({
        status: 200,
        text: () =>
          new Promise<string>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      });
    expect(await send(request, 20, slowBody)).toEqual({ kind: 'timeout' });
  });
});
