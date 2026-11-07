import { decodeRows, type SqlStatementResult } from './sats';

// SpacetimeDB HTTP API (https://spacetimedb.com/docs/http/database): reducer calls and SQL as the service
// identity. The worker polls instead of holding a WebSocket subscription, so it has no dependency on the
// generated bindings. The service token must be able to read the private tables (database owner, or views).

export class StdbError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly where: string,
  ) {
    super(`SpacetimeDB ${where} failed (${status}): ${body.slice(0, 300)}`);
  }
}

export interface StdbHttpOptions {
  uri: string; // wss://… or https://…
  module: string;
  token: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class StdbHttp {
  readonly baseUrl: string;
  private readonly module: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: StdbHttpOptions) {
    this.baseUrl = opts.uri.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/+$/, '');
    this.module = encodeURIComponent(opts.module);
    this.token = opts.token;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
  }

  private async send(path: string, init: RequestInit, where: string): Promise<Response> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/database/${this.module}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new StdbError(res.status, await res.text().catch(() => ''), where);
    return res;
  }

  async sql(query: string): Promise<Record<string, unknown>[]> {
    const res = await this.send('/sql', { method: 'POST', body: query, headers: { 'Content-Type': 'text/plain' } }, 'sql');
    const results = (await res.json()) as SqlStatementResult[];
    return results[0] ? decodeRows(results[0]) : [];
  }

  async call(reducer: string, args: unknown[]): Promise<void> {
    if (!/^[a-z_][a-z0-9_]*$/i.test(reducer)) throw new Error(`invalid reducer name ${reducer}`);
    await this.send(`/call/${reducer}`, { method: 'POST', body: JSON.stringify(args), headers: { 'Content-Type': 'application/json' } }, reducer);
  }

  /** The caller identity, echoed in the `spacetime-identity` header of the schema endpoint. */
  async identityHex(): Promise<string> {
    const res = await this.send('/schema?version=9', { method: 'GET' }, 'schema');
    const id = res.headers.get('spacetime-identity');
    if (!id) throw new Error('SpacetimeDB did not return spacetime-identity; check STDB_SERVICE_TOKEN');
    return id.replace(/^0x/i, '').toLowerCase();
  }
}
