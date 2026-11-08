import { describe, expect, it } from 'vitest';
import { NimClient, type JobContext } from '@hack/agent';
import { verifyIdentityHandler } from '../src/handlers/verifyIdentity';
import { fakeStdb, fakeStorage, silentLog } from './fakes';

const KEY = 'idv/5/abc.jpg';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const specimen = { docKind: 'drivers_license', fullName: 'SAMPLE SPECIMEN', addressText: '1234 Main Street, Dallas, TX 75201', expiration: '2030-01-31', isLikelyId: true, confidence: 0.93 };

function nimReturning(contents: string[]) {
  let i = 0;
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: contents[Math.min(i++, contents.length - 1)] } }] }))) as typeof fetch;
  return new NimClient({ baseUrl: 'https://n/v1', apiKey: 'k', visionModel: 'vl', agentModel: 'a', fetchImpl });
}

function run(opts: { nim?: NimClient; objectKey?: string | null; failGet?: boolean; propertyThrows?: boolean; image?: Buffer }) {
  const { storage, deleted } = fakeStorage({ [KEY]: opts.image ?? JPEG }, { failGet: opts.failGet });
  const { stdb, calls } = fakeStdb({
    getVerification: async () => ({ id: '5', identity: 'x', propertyId: '9', docKind: 'drivers_license', state: 'processing', failReason: null, objectKey: opts.objectKey === undefined ? KEY : opts.objectKey, attemptNo: 1, createdAt: 0 }),
    getPropertyPrivate: async () => {
      if (opts.propertyThrows) throw new Error('db down');
      return { propertyId: '9', normalized: '1234 MAIN ST | DALLAS | TX | 75201', line1: '1234 MAIN ST', city: 'DALLAS', state: 'TX', zip: '75201', lat: 1, lng: 1, countyFips: null };
    },
  });
  const ctx = { job: { id: '1', kind: 'verify_identity', verificationId: '5', payload: {} }, stdb, storage, nim: opts.nim ?? nimReturning([JSON.stringify(specimen)]), log: silentLog, step: async () => {} } as unknown as JobContext;
  return { ctx, deleted, calls };
}
const recorded = (calls: { name: string; args: any }[]) => calls.find((c) => c.name === 'record_verification')!.args;

describe('verify_identity: the ID object is deleted on every path', () => {
  it('ok → verified with the name only', async () => {
    const t = run({});
    await verifyIdentityHandler(t.ctx);
    expect(recorded(t.calls)).toEqual({ verificationId: '5', ok: true, failReason: undefined, nameOnDoc: 'SAMPLE SPECIMEN' });
    expect(t.deleted).toEqual([KEY]);
  });
  it('mismatch → address_mismatch, no name stored', async () => {
    const t = run({ nim: nimReturning([JSON.stringify({ ...specimen, addressText: '98 Oak Ave, Austin, TX 78701' })]) });
    await verifyIdentityHandler(t.ctx);
    expect(recorded(t.calls)).toEqual({ verificationId: '5', ok: false, failReason: 'address_mismatch', nameOnDoc: undefined });
    expect(t.deleted).toEqual([KEY]);
  });
  it('parse error twice → unreadable', async () => {
    const t = run({ nim: nimReturning(['garbage', 'more garbage']) });
    await verifyIdentityHandler(t.ctx);
    expect(recorded(t.calls).failReason).toBe('unreadable');
    expect(t.deleted).toEqual([KEY]);
  });
  it('thrown exception (property lookup) → unreadable, still deleted', async () => {
    const t = run({ propertyThrows: true });
    await verifyIdentityHandler(t.ctx);
    expect(recorded(t.calls).failReason).toBe('unreadable');
    expect(t.deleted).toEqual([KEY]);
  });
  it('model HTTP failure → unreadable, still deleted', async () => {
    const fetchImpl = (async () => new Response('boom', { status: 400 })) as typeof fetch;
    const t = run({ nim: new NimClient({ baseUrl: 'https://n/v1', apiKey: 'k', visionModel: 'vl', agentModel: 'a', fetchImpl }) });
    await verifyIdentityHandler(t.ctx);
    expect(recorded(t.calls).failReason).toBe('unreadable');
    expect(t.deleted).toEqual([KEY]);
  });
  it('not an image → unreadable, still deleted', async () => {
    const t = run({ image: Buffer.from('hello') });
    await verifyIdentityHandler(t.ctx);
    expect(recorded(t.calls).failReason).toBe('unreadable');
    expect(t.deleted).toEqual([KEY]);
  });
  it('never deletes a key outside idv/<verificationId>/', async () => {
    const t = run({ objectKey: 'media/7/x.jpg' });
    await verifyIdentityHandler(t.ctx);
    expect(t.deleted).toEqual([]);
    expect(recorded(t.calls).failReason).toBe('unreadable');
  });
});
