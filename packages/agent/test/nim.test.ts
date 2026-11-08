import { describe, expect, it } from 'vitest';
import { FixtureModeError, NimClient, NimHttpError } from '../src';

describe('NimClient', () => {
  it('backs off on 429 (Retry-After) then succeeds', async () => {
    const sleeps: number[] = [];
    let n = 0;
    const fetchImpl = (async () =>
      ++n < 3
        ? new Response('slow down', { status: 429, headers: { 'retry-after': '2' } })
        : new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 })) as typeof fetch;
    const nim = new NimClient({ baseUrl: 'https://x/v1', apiKey: 'k', visionModel: 'v', agentModel: 'a', fetchImpl, sleep: async (ms) => void sleeps.push(ms) });
    const r = await nim.chat({ model: 'a', messages: [{ role: 'user', content: 'hi' }] });
    expect(r.content).toBe('ok');
    expect(sleeps).toEqual([2000, 2000]);
  });
  it('does not retry 400', async () => {
    let n = 0;
    const fetchImpl = (async () => (n++, new Response('bad', { status: 400 }))) as typeof fetch;
    const nim = new NimClient({ baseUrl: 'https://x/v1', apiKey: 'k', visionModel: 'v', agentModel: 'a', fetchImpl, sleep: async () => {} });
    await expect(nim.chat({ model: 'a', messages: [] })).rejects.toBeInstanceOf(NimHttpError);
    expect(n).toBe(1);
  });
  it('blocks live calls in fixture mode', async () => {
    const nim = new NimClient({ baseUrl: 'https://x/v1', apiKey: '', visionModel: 'v', agentModel: 'a', useFixtures: true });
    await expect(nim.chat({ model: 'a', messages: [] })).rejects.toBeInstanceOf(FixtureModeError);
  });
  it('routes each role to its own server and omits auth when no key is set', async () => {
    const seen: { url: string; auth: string | null; body: any }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push({ url, auth: new Headers(init.headers).get('authorization'), body: init.body ? JSON.parse(String(init.body)) : null });
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const nim = new NimClient({
      baseUrl: 'http://unused/v1', apiKey: '', visionModel: 'vl', agentModel: 'agent', fetchImpl,
      endpoints: { vision: { baseUrl: 'http://10.0.0.5:8001/v1/', apiKey: '' }, agent: { baseUrl: 'http://10.0.0.5:8002/v1', apiKey: 'secret' } },
      agentExtraBody: { chat_template_kwargs: { enable_thinking: false } },
    });
    await nim.chat({ model: 'vl', messages: [] });
    await nim.chat({ model: 'agent', messages: [] });
    expect(seen[0]).toMatchObject({ url: 'http://10.0.0.5:8001/v1/chat/completions', auth: null });
    expect(seen[0]!.body.chat_template_kwargs).toBeUndefined();
    expect(seen[1]).toMatchObject({ url: 'http://10.0.0.5:8002/v1/chat/completions', auth: 'Bearer secret' });
    expect(seen[1]!.body.chat_template_kwargs).toEqual({ enable_thinking: false });
  });
  it('fromEnv requires the Vultr server URLs and never falls back to a hosted API', () => {
    expect(() => NimClient.fromEnv({ NVIDIA_API_KEY: 'k', NVIDIA_BASE_URL: 'https://integrate.api.nvidia.com/v1' } as any)).toThrow(/NEMOTRON_VL_BASE_URL and NEMOTRON_AGENT_BASE_URL/);
    const nim = NimClient.fromEnv({ NEMOTRON_VL_BASE_URL: 'http://10.0.0.5:8001/v1', NEMOTRON_AGENT_BASE_URL: 'http://10.0.0.5:8002/v1', NEMOTRON_API_KEY: 'k' } as any);
    expect(nim.endpoints.vision).toEqual({ baseUrl: 'http://10.0.0.5:8001/v1', apiKey: 'k' });
    expect(nim.endpoints.agent).toEqual({ baseUrl: 'http://10.0.0.5:8002/v1', apiKey: 'k' });
    expect(nim.models).toEqual({ vision: 'nvidia/NVIDIA-Nemotron-Nano-12B-v2-VL-FP8', agent: 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-FP8' });
    const shared = NimClient.fromEnv({ NEMOTRON_BASE_URL: 'https://gpu.example/v1' } as any);
    expect(shared.endpoints.agent.baseUrl).toBe('https://gpu.example/v1');
    expect(NimClient.fromEnv({ USE_FIXTURES: 'true' } as any).useFixtures).toBe(true);
  });
  it('checkModels reports which server is missing its model', async () => {
    const fetchImpl = (async (url: string) =>
      url.includes(':8001')
        ? new Response(JSON.stringify({ data: [{ id: 'vl' }] }), { status: 200 })
        : new Response('down', { status: 404 })) as unknown as typeof fetch;
    const nim = new NimClient({ baseUrl: 'x', apiKey: '', visionModel: 'vl', agentModel: 'agent', fetchImpl,
      endpoints: { vision: { baseUrl: 'http://h:8001/v1', apiKey: '' }, agent: { baseUrl: 'http://h:8002/v1', apiKey: '' } } });
    const r = await nim.checkModels();
    expect(r.vision.ok).toBe(true);
    expect(r.agent.ok).toBe(false);
    expect(r.agent.error).toMatch(/404/);
  });
});
