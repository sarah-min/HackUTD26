import type { AgentStep } from '@hack/contracts/agent';
import { NimClient, type JobContext, type ServiceConnection } from '../src';

type Reply = { content?: string | null; tool_calls?: { name: string; arguments: unknown }[] } | { status: number };

/** A NimClient whose chat completions are scripted per call. */
export function scriptedAgentNim(replies: Reply[], seen: any[] = []) {
  let i = 0;
  const fetchImpl = (async (_u: string, init?: RequestInit) => {
    seen.push(JSON.parse(String(init?.body ?? '{}')));
    const r = replies[Math.min(i++, replies.length - 1)]!;
    if ('status' in r) return new Response('{"error":"tools unsupported"}', { status: r.status });
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: r.content ?? null, tool_calls: (r.tool_calls ?? []).map((c, k) => ({ id: `c${i}_${k}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.arguments) } })) } }],
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  return new NimClient({ baseUrl: 'https://nim.test/v1', apiKey: 'k', visionModel: 'vl', agentModel: 'agent', fetchImpl, sleep: async () => {} });
}

export function fakeCtx(nim: NimClient, stdb: Partial<ServiceConnection> = {}) {
  const steps: Omit<AgentStep, 'reportId' | 'seq' | 'at'>[] = [];
  const ctx: JobContext = {
    job: { id: '1', kind: 'analyze', reportId: '7', payload: {} },
    stdb: stdb as ServiceConnection,
    storage: {} as JobContext['storage'],
    nim,
    log: { debug() {}, info() {}, warn() {}, error() {}, child() { return this; } },
    scratch: new Map(),
    step: async (s) => void steps.push(s),
  };
  return { ctx, steps };
}
