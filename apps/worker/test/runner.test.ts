import { describe, expect, it } from 'vitest';
import { NimClient } from '@hack/agent';
import { Runner } from '../src/runner';
import { fakeStdb, fakeStorage, job, silentLog } from './fakes';

describe('Runner', () => {
  it('a job is claimed and run exactly once across two workers', async () => {
    let owner: string | null = null;
    let runs = 0;
    const shared = {
      listQueuedJobs: async () => (owner ? [] : [job({ id: '11', kind: 'analyze', reportId: '7' })]),
      getJob: async () => job({ id: '11', kind: 'analyze', reportId: '7', state: 'leased', leaseOwner: owner }),
    };
    const mk = (identity: string) => {
      const { stdb, calls } = fakeStdb({
        ...shared,
        identityHex: identity,
        claimJob: async () => {
          if (owner) throw new Error('already leased');
          owner = identity;
        },
      });
      const runner = new Runner({
        stdb, storage: fakeStorage().storage, nim: new NimClient({ baseUrl: 'x', apiKey: '', visionModel: 'v', agentModel: 'a', useFixtures: true }),
        log: silentLog, concurrency: 2, handlers: { analyze: async () => void runs++ },
      });
      return { runner, calls };
    };
    const a = mk('aa');
    const b = mk('bb');
    const [ra, rb] = await Promise.all([a.runner.tick(), b.runner.tick()]);
    await a.runner.stop();
    await b.runner.stop();
    expect(ra.length + rb.length).toBe(1);
    expect(runs).toBe(1);
    expect([...a.calls, ...b.calls].filter((c) => c.name === 'complete_job')).toEqual([{ name: 'complete_job', args: { id: '11', ok: true, error: undefined } }]);
  });

  it('a throwing handler completes the job with ok=false', async () => {
    const { stdb, calls } = fakeStdb({
      listQueuedJobs: async () => [job({ id: '3', kind: 'verify_identity', verificationId: '1' })],
      getJob: async () => job({ id: '3', kind: 'verify_identity', verificationId: '1', state: 'leased', leaseOwner: 'aa' }),
    });
    const runner = new Runner({
      stdb, storage: fakeStorage().storage, nim: new NimClient({ baseUrl: 'x', apiKey: '', visionModel: 'v', agentModel: 'a', useFixtures: true }),
      log: silentLog, concurrency: 1, handlers: { verify_identity: async () => { throw new Error('boom'); } },
    });
    await runner.tick();
    await runner.stop();
    expect(calls.find((c) => c.name === 'complete_job')!.args).toEqual({ id: '3', ok: false, error: 'boom' });
  });
});
