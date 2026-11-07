// NVIDIA NIM client (OpenAI-compatible chat completions at NVIDIA_BASE_URL).
// Uses fetch directly (no SDK) so the request shape is explicit and stable.
// VERIFIED from NVIDIA docs (Nov 2026): images go in `image_url` content parts as data URIs;
// `nvidia/nemotron-nano-12b-v2-vl` and `nvidia/nemotron-3-super-120b-a12b` exist on the API catalog.
// Run scripts/smoke-nim.ts with a real key to confirm tool calling and limits.

export type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ContentPart[] }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ToolDefinition {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | 'required';
  temperature?: number;
  max_tokens?: number;
  /** Extra body fields, e.g. { chat_template_kwargs: { enable_thinking: false } }. */
  extraBody?: Record<string, unknown>;
}

export interface ChatResponse {
  content: string | null;
  reasoning: string | null;
  toolCalls: ToolCall[];
  finishReason: string | null;
  model: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export interface ChatOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export class NimHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`NIM HTTP ${status}: ${body.slice(0, 300)}`);
  }
}

export class FixtureModeError extends Error {
  constructor() {
    super('USE_FIXTURES=true: live model calls are disabled');
  }
}

export interface NimClientOptions {
  baseUrl: string;
  apiKey: string;
  visionModel: string;
  agentModel: string;
  useFixtures?: boolean;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

export class NimClient {
  readonly models: { vision: string; agent: string };
  readonly useFixtures: boolean;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: NimClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.apiKey = opts.apiKey;
    this.models = { vision: opts.visionModel, agent: opts.agentModel };
    this.useFixtures = opts.useFixtures ?? false;
    this.maxRetries = opts.maxRetries ?? 4;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): NimClient {
    const useFixtures = env.USE_FIXTURES === 'true';
    const need = (k: string) => {
      const v = env[k];
      if (!v && !useFixtures) throw new Error(`${k} is required (or set USE_FIXTURES=true)`);
      return v ?? '';
    };
    return new NimClient({
      baseUrl: env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
      apiKey: need('NVIDIA_API_KEY'),
      visionModel: env.NEMOTRON_VL_MODEL || 'nvidia/nemotron-nano-12b-v2-vl',
      agentModel: env.NEMOTRON_AGENT_MODEL || 'nvidia/nemotron-3-super-120b-a12b',
      useFixtures,
    });
  }

  async listModels(opts: ChatOptions = {}): Promise<string[]> {
    const res = await this.request('GET', '/models', undefined, opts);
    const json = (await res.json()) as { data?: { id: string }[] };
    return (json.data ?? []).map((m) => m.id);
  }

  async chat(req: ChatRequest, opts: ChatOptions = {}): Promise<ChatResponse> {
    if (this.useFixtures) throw new FixtureModeError();
    const { extraBody, ...rest } = req;
    const body = { ...rest, ...(extraBody ?? {}), stream: false };
    const res = await this.request('POST', '/chat/completions', body, opts);
    const json = (await res.json()) as {
      model?: string;
      usage?: ChatResponse['usage'];
      choices?: {
        finish_reason?: string | null;
        message?: { content?: string | null; reasoning_content?: string | null; tool_calls?: ToolCall[] };
      }[];
    };
    const choice = json.choices?.[0];
    const msg = choice?.message ?? {};
    return {
      content: msg.content ?? null,
      reasoning: msg.reasoning_content ?? null,
      toolCalls: (msg.tool_calls ?? []).map((c, i) => ({
        id: c.id || `call_${i}`,
        type: 'function',
        function: {
          name: c.function?.name ?? '',
          arguments:
            typeof c.function?.arguments === 'string' ? c.function.arguments : JSON.stringify(c.function?.arguments ?? {}),
        },
      })),
      finishReason: choice?.finish_reason ?? null,
      model: json.model ?? req.model,
      usage: json.usage,
    };
  }

  private async request(method: 'GET' | 'POST', path: string, body: unknown, opts: ChatOptions): Promise<Response> {
    let attempt = 0;
    for (;;) {
      const controller = new AbortController();
      const onAbort = () => controller.abort(opts.signal?.reason);
      opts.signal?.addEventListener('abort', onAbort, { once: true });
      const timer = setTimeout(() => controller.abort(new Error('NIM request timed out')), opts.timeoutMs ?? 60_000);
      try {
        if (opts.signal?.aborted) throw opts.signal.reason ?? new Error('aborted');
        const res = await this.fetchImpl(this.baseUrl + path, {
          method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            Accept: 'application/json',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
        if (res.ok) return res;
        const text = await res.text().catch(() => '');
        if (RETRY_STATUSES.has(res.status) && attempt < this.maxRetries) {
          await this.sleep(this.backoffMs(attempt, res.headers.get('retry-after')));
          attempt++;
          continue;
        }
        throw new NimHttpError(res.status, text);
      } finally {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onAbort);
      }
    }
  }

  private backoffMs(attempt: number, retryAfter: string | null): number {
    const header = retryAfter ? Number(retryAfter) : NaN;
    if (Number.isFinite(header) && header >= 0) return Math.min(30_000, header * 1000);
    return Math.min(15_000, 1000 * 2 ** attempt + Math.floor(Math.random() * 250));
  }
}
