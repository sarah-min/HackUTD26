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
});
