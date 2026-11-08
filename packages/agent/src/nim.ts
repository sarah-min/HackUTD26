// Nemotron client for our own model server on the NVIDIA Brev GPU instance (vLLM, OpenAI-compatible /v1).
// Two endpoints, one per role: the vision model (Nemotron Nano 12B v2 VL) and the agent model
// (Nemotron 3 Nano 30B-A3B, native tool calling). See apps/worker/brev/README.md.
// Uses fetch directly (no SDK) so the request shape is explicit and stable.
// Images go in `image_url` content parts as data URIs (vLLM's OpenAI-compatible format).
// Run scripts/smoke-nim.ts against the server to confirm models, tool calling and image input.

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

export type ModelRole = 'vision' | 'agent';

export interface ModelEndpoint {
  /** OpenAI-compatible base URL including /v1, e.g. http://10.1.96.5:8001/v1 */
  baseUrl: string;
  /** Bearer key the server was started with (vLLM --api-key). Empty = no Authorization header. */
  apiKey: string;
}

export interface NimClientOptions {
  /** Default endpoint for both roles. */
  baseUrl: string;
  apiKey: string;
  /** Per-role overrides (e.g. two vLLM servers on one GPU box). */
  endpoints?: Partial<Record<ModelRole, ModelEndpoint>>;
  visionModel: string;
  agentModel: string;
  /** Merged into every agent-role request body, e.g. { chat_template_kwargs: { enable_thinking: false } }. */
  agentExtraBody?: Record<string, unknown>;
  useFixtures?: boolean;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

export const DEFAULT_VISION_MODEL = 'nvidia/NVIDIA-Nemotron-Nano-12B-v2-VL-FP8';
export const DEFAULT_AGENT_MODEL = 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-FP8';

export class NimClient {
  readonly models: { vision: string; agent: string };
  readonly endpoints: Record<ModelRole, ModelEndpoint>;
  readonly useFixtures: boolean;
  private readonly agentExtraBody: Record<string, unknown>;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: NimClientOptions) {
    const norm = (e: ModelEndpoint): ModelEndpoint => ({ baseUrl: e.baseUrl.replace(/\/+$/, ''), apiKey: e.apiKey });
    const fallback = { baseUrl: opts.baseUrl, apiKey: opts.apiKey };
    this.endpoints = {
      vision: norm(opts.endpoints?.vision ?? fallback),
      agent: norm(opts.endpoints?.agent ?? fallback),
    };
    this.agentExtraBody = opts.agentExtraBody ?? {};
    this.models = { vision: opts.visionModel, agent: opts.agentModel };
    this.useFixtures = opts.useFixtures ?? false;
    this.maxRetries = opts.maxRetries ?? 4;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /**
   * Env (worker / scripts):
   *   NEMOTRON_VL_BASE_URL     vision server on the Brev GPU box, e.g. http://nemotron-vl:8001/v1
   *   NEMOTRON_AGENT_BASE_URL  agent server on the Brev GPU box, e.g. http://nemotron-agent:8002/v1
   *   NEMOTRON_BASE_URL        one URL for both roles (only if a single gateway serves both models)
   *   NEMOTRON_API_KEY         the key the servers were started with (vLLM --api-key); per role: NEMOTRON_VL_API_KEY / NEMOTRON_AGENT_API_KEY
   *   NEMOTRON_VL_MODEL, NEMOTRON_AGENT_MODEL   served model names (defaults match apps/worker/brev/compose.gpu.yaml)
   *   NEMOTRON_AGENT_THINKING  "on" to let the agent model reason before answering (slower); default off
   * There is deliberately no hosted-API fallback: a missing URL is an error, not a silent switch to another provider.
   */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): NimClient {
    const useFixtures = env.USE_FIXTURES === 'true';
    const shared = env.NEMOTRON_BASE_URL ?? '';
    const vlUrl = env.NEMOTRON_VL_BASE_URL || shared;
    const agentUrl = env.NEMOTRON_AGENT_BASE_URL || shared;
    if (!useFixtures) {
      const missing = [!vlUrl && 'NEMOTRON_VL_BASE_URL', !agentUrl && 'NEMOTRON_AGENT_BASE_URL'].filter(Boolean);
      if (missing.length)
        throw new Error(
          `${missing.join(' and ')} required: the OpenAI-compatible URL of the Nemotron server on the Brev GPU instance ` +
            `(e.g. http://nemotron-vl:8001/v1), or NEMOTRON_BASE_URL for both. Set USE_FIXTURES=true to run without it.`,
        );
      for (const u of [vlUrl, agentUrl])
        if (!/^https?:\/\/[^/]+/.test(u)) throw new Error(`Invalid Nemotron server URL: ${u}`);
    }
    const key = env.NEMOTRON_API_KEY ?? '';
    return new NimClient({
      baseUrl: vlUrl,
      apiKey: key,
      endpoints: {
        vision: { baseUrl: vlUrl, apiKey: env.NEMOTRON_VL_API_KEY ?? key },
        agent: { baseUrl: agentUrl, apiKey: env.NEMOTRON_AGENT_API_KEY ?? key },
      },
      visionModel: env.NEMOTRON_VL_MODEL || DEFAULT_VISION_MODEL,
      agentModel: env.NEMOTRON_AGENT_MODEL || DEFAULT_AGENT_MODEL,
      agentExtraBody: { chat_template_kwargs: { enable_thinking: env.NEMOTRON_AGENT_THINKING === 'on' } },
      useFixtures,
    });
  }

  /** Which server a request goes to: vision when the request names the vision model, otherwise agent. */
  roleFor(model: string): ModelRole {
    return model === this.models.vision && model !== this.models.agent ? 'vision' : 'agent';
  }

  /** Confirms each server is up and serves the configured model. Never throws. */
  async checkModels(opts: ChatOptions = {}): Promise<Record<ModelRole, { ok: boolean; url: string; served?: string[]; error?: string }>> {
    const out = {} as Record<ModelRole, { ok: boolean; url: string; served?: string[]; error?: string }>;
    for (const role of ['vision', 'agent'] as const) {
      const url = this.endpoints[role].baseUrl;
      try {
        const served = await this.listModels(role, { timeoutMs: 10_000, ...opts });
        out[role] = { ok: served.includes(this.models[role]), url, served };
      } catch (e) {
        out[role] = { ok: false, url, error: (e as Error).message };
      }
    }
    return out;
  }

  async listModels(role: ModelRole = 'agent', opts: ChatOptions = {}): Promise<string[]> {
    if (this.useFixtures) throw new FixtureModeError();
    const res = await this.request(role, 'GET', '/models', undefined, opts);
    const json = (await res.json()) as { data?: { id: string }[] };
    return (json.data ?? []).map((m) => m.id);
  }

  async chat(req: ChatRequest, opts: ChatOptions = {}): Promise<ChatResponse> {
    if (this.useFixtures) throw new FixtureModeError();
    const { extraBody, ...rest } = req;
    const role = this.roleFor(req.model);
    const roleDefaults = role === 'agent' ? this.agentExtraBody : {};
    const body = { ...rest, ...roleDefaults, ...(extraBody ?? {}), stream: false };
    const res = await this.request(role, 'POST', '/chat/completions', body, opts);
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

  private async request(role: ModelRole, method: 'GET' | 'POST', path: string, body: unknown, opts: ChatOptions): Promise<Response> {
    const { baseUrl, apiKey } = this.endpoints[role];
    let attempt = 0;
    for (;;) {
      const controller = new AbortController();
      const onAbort = () => controller.abort(opts.signal?.reason);
      opts.signal?.addEventListener('abort', onAbort, { once: true });
      const timer = setTimeout(() => controller.abort(new Error('NIM request timed out')), opts.timeoutMs ?? 60_000);
      try {
        if (opts.signal?.aborted) throw opts.signal.reason ?? new Error('aborted');
        const res = await this.fetchImpl(baseUrl + path, {
          method,
          headers: {
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
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
