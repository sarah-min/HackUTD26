import { NimClient, type ChatRequest } from '@hack/agent';

/** NimClient whose HTTP layer returns scripted assistant contents, in order. */
export function scriptedNim(contents: (string | Error)[], seen: ChatRequest[] = []) {
  let i = 0;
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    seen.push(JSON.parse(String(init?.body ?? '{}')));
    const next = contents[Math.min(i++, contents.length - 1)];
    if (next instanceof Error) throw next;
    return new Response(JSON.stringify({ model: 'm', choices: [{ finish_reason: 'stop', message: { content: next } }] }), { status: 200 });
  }) as typeof fetch;
  const nim = new NimClient({ baseUrl: 'https://nim.test/v1', apiKey: 'k', visionModel: 'vl-model', agentModel: 'agent-model', fetchImpl });
  return { nim, calls: () => i };
}
