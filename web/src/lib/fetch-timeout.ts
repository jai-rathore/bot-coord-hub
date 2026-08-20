/**
 * fetch with a deadline.
 *
 * Node's fetch has no default timeout, so a hung connection holds the request
 * open indefinitely — and because every handler holds one of the ten Postgres
 * pool connections around it, a handful of stuck outbound calls could starve
 * the whole instance. Only two of the eleven server-side fetch sites set a
 * timeout of their own; this is for the rest.
 */

/** Deliberately shorter than any human's patience for a page that is loading. */
export const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

export async function fetchWithTimeout(
  input: string | URL | Request,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const deadline = AbortSignal.timeout(timeoutMs);
  // A caller's own signal (a client disconnecting, say) still wins.
  const signal = init.signal
    ? AbortSignal.any([init.signal, deadline])
    : deadline;
  return fetch(input, { ...init, signal });
}
