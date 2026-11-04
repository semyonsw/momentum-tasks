/**
 * The one `fetch` the assistant makes, wrapped so it cannot throw.
 *
 * It sits beside `lib/notify.ts` for the same reason that exists: a side effect that can fail in half a dozen ordinary ways — no
 * signal, a captive portal, Google slow to answer — must come back as a VALUE the
 * caller can turn into a sentence, never as an exception that reaches a render.
 *
 *   { kind: 'response', status, body }   anything with an HTTP status, 200 or not
 *   { kind: 'timeout' }                  nothing within `timeoutMs`
 *   { kind: 'network' }                  it never left the phone
 *
 * The timeout is an `AbortController`, so a slow request is actually cancelled
 * rather than left running with its answer thrown away. `fetchImpl` is a
 * parameter so the suite can drive every branch without a network.
 */

import type { HttpRequest } from './gemini';

export type TransportResult =
  { kind: 'response'; status: number; body: unknown } | { kind: 'timeout' } | { kind: 'network' };

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ status: number; text: () => Promise<string> }>;

export async function send(
  request: HttpRequest,
  timeoutMs: number,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<TransportResult> {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const deadline = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller?.abort();
      resolve('timeout');
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([
      fetchImpl(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: controller?.signal,
      }),
      deadline,
    ]);
    if (response === 'timeout') return { kind: 'timeout' };

    // The body is read as text and parsed here, so a proxy's HTML error page is a
    // status with no JSON rather than a parse error thrown out of `.json()`.
    let body: unknown = null;
    try {
      const raw = await response.text();
      body = raw ? JSON.parse(raw) : null;
    } catch {
      // The deadline also covers reading the body: a timeout that aborts the read
      // is a timeout, not an answer of a shape nobody could parse.
      if (timedOut) return { kind: 'timeout' };
      body = null;
    }
    return { kind: 'response', status: response.status, body };
  } catch {
    return timedOut ? { kind: 'timeout' } : { kind: 'network' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
