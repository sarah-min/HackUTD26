export class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`HTTP ${status} from ${new URL(url).host}`);
  }
}

export const USER_AGENT = `ProjectAftermath/0.1 (+${process.env.APP_BASE_URL || 'https://github.com/sarah-min/HackUTD26'})`;

/** GET JSON with a timeout and a descriptive User-Agent (NWS requires one). */
export async function fetchJson<T = unknown>(
  url: string,
  opts: { signal?: AbortSignal; timeoutMs?: number; headers?: Record<string, string>; fetchImpl?: typeof fetch } = {},
): Promise<T> {
  const controller = new AbortController();
  const onAbort = () => controller.abort(opts.signal?.reason);
  opts.signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('request timed out')), opts.timeoutMs ?? 9_000);
  try {
    const res = await (opts.fetchImpl ?? fetch)(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...opts.headers },
      signal: controller.signal,
    });
    if (!res.ok) throw new HttpStatusError(res.status, url);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}
