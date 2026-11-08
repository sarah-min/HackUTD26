import { NimClient, type ChatRequest } from '@hack/agent';

export type Scripted = string | Error | { content?: string; finishReason?: string; status?: number; body?: string };

/** NimClient whose HTTP layer returns scripted assistant replies, in order. */
export function scriptedNim(contents: Scripted[], seen: ChatRequest[] = []) {
  let i = 0;
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    seen.push(JSON.parse(String(init?.body ?? '{}')));
    const next = contents[Math.min(i++, contents.length - 1)];
    if (next instanceof Error) throw next;
    const r = typeof next === 'string' ? { content: next } : next!;
    if (r.status && r.status >= 400) return new Response(r.body ?? 'error', { status: r.status });
    return new Response(
      JSON.stringify({ model: 'm', choices: [{ finish_reason: r.finishReason ?? 'stop', message: { content: r.content ?? '' } }] }),
      { status: 200 },
    );
  }) as typeof fetch;
  const nim = new NimClient({
    baseUrl: 'https://nim.test/v1', apiKey: 'k', visionModel: 'vl-model', agentModel: 'agent-model', fetchImpl, maxRetries: 0,
  });
  return { nim, calls: () => i };
}
