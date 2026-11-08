// Security hardening: duplicate-claim holds, admin resolution, global / per-property start caps, owner audit log.
// These tests use the PRODUCTION defaults (`setup({ security: 'defaults' })`: no security_config row, hold_duplicate_claims ON).
import { describe, expect, it } from 'vitest';
import { setup, mod, addr, BASE_LAT, BASE_LNG, HEX } from './helpers';

const EMAIL = 'owner@example.com';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
type S = ReturnType<typeof setup>;

const A = addr('123 Main St', BASE_LAT, BASE_LNG); // the property everything is claimed on
const elsewhere = (i: number) => addr(`${i} Elm Street`, BASE_LAT + 0.01 * i, BASE_LNG);

function world(opts: { email?: boolean } = {}) {
  const s = setup({ security: 'defaults' });
  if (opts.email) s.configureEmail('demo');
  const admin = s.user('admin'); // a real client identity with the admin role
  s.call(s.internal, mod.admin_add_service as any, { identity: s.idOf(admin).toHexString(), role: 'admin' });
  const owner = s.user('owner');
  const claimant = s.user('claimant');
  const first = s.verify(owner, A);
  return { s, admin, owner, claimant, first, propertyId: first.property_id };
}

const setConfig = (s: S, who: any, over: Record<string, unknown>) =>
  s.call(who, mod.admin_set_security_config as any, {
    hold_duplicate_claims: undefined,
    max_verification_starts_per_hour_global: undefined,
    max_verification_starts_per_property_per_day: undefined,
    ...over,
  });
const start = (s: S, who: any, address = A) =>
  s.call(who, mod.start_verification as any, { address_json: JSON.stringify(address), doc_kind: 'drivers_license', secret_hash: HEX('b') });
const rows = (s: S, who: any, name: string): any[] => s.view(who, (mod as any)[name]);
const readBlob = (s: S, who: any, key: string, seq = 0) => (mod.read_blob as any)(s.h.procedureContext(who), { object_key: key, seq });
const accessLog = (s: S) => [...s.h.db.access_log.iter()];

describe('duplicate-claim detection', () => {
  it('holds a second identity: failed/duplicate_claim, linked privately, no access, conflict recorded', () => {
    const { s, owner, claimant, first, propertyId } = world();
    const held = s.verify(claimant, A);
    expect(held).toMatchObject({ state: 'failed', fail_reason: 'duplicate_claim', property_id: propertyId });
    expect(held.object_key).toBeUndefined();
    const conflicts = [...s.h.db.claim_conflict.iter()];
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      property_id: propertyId, existing_verification_id: first.id, new_verification_id: held.id, status: 'open', resolved_at: undefined,
    });
    // the claimant still sees their own (failed) row but gets no access to anything
    expect(rows(s, claimant, 'my_verifications').map(v => v.fail_reason)).toEqual(['duplicate_claim']);
    expect(rows(s, claimant, 'my_property_privates')).toHaveLength(0);
    expect(rows(s, claimant, 'my_claim_conflicts')).toHaveLength(0);
    expect(rows(s, claimant, 'my_access_log')).toHaveLength(0);
    // the existing owner is untouched
    expect(rows(s, owner, 'my_property_privates')).toHaveLength(1);
    expect(s.h.db.verification.id.find(first.id)!.state).toBe('verified');
  });

  it('the existing owner sees that someone tried, with no claimant details at all', () => {
    const { s, owner, claimant, propertyId } = world();
    const held = s.verify(claimant, A);
    const r = rows(s, owner, 'my_claim_conflicts');
    expect(r).toHaveLength(1);
    expect(Object.keys(r[0]).sort()).toEqual(['created_at', 'id', 'property_id', 'status']);
    expect(r[0]).toMatchObject({ property_id: propertyId, status: 'open' });
    const text = JSON.stringify(r, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    expect(text).not.toContain(s.idOf(claimant).toHexString());
    expect(text).not.toContain('SPECIMEN');
    expect(r[0].id).toBe([...s.h.db.claim_conflict.iter()][0].id); // a conflict id, not the claimant's verification id
    expect(held.id).toBeDefined();
    // strangers, the worker and an owner of a different property see nothing
    const other = s.user('other');
    s.verify(other, elsewhere(3));
    for (const who of [s.user('stranger'), s.worker, other]) expect(rows(s, who, 'my_claim_conflicts')).toHaveLength(0);
  });

  it('does not hold the same identity re-verifying, or a property with no verified owner yet', () => {
    const { s, owner } = world();
    expect(s.verify(owner, A).state).toBe('verified'); // same identity again
    expect(s.h.db.claim_conflict.count()).toBe(0n);
    const fresh = s.user('fresh');
    expect(s.verify(fresh, elsewhere(5)).state).toBe('verified'); // no existing owner
    // a failed first attempt does not make an owner: the next person is not held either
    const p1 = s.user('p1');
    const p2 = s.user('p2');
    expect(s.verify(p1, elsewhere(6), false).state).toBe('failed');
    expect(s.verify(p2, elsewhere(6)).state).toBe('verified');
    expect(s.h.db.claim_conflict.count()).toBe(0n);
  });

  it('does not hold another device of the same account, nor a device of the owner account after the first signed out', () => {
    const { s, owner, propertyId } = world({ email: true });
    expect(s.emailFlow(owner, EMAIL, 'enroll').ok).toBe(true);
    const d2 = s.user('d2');
    expect(s.emailFlow(d2, EMAIL, 'signin').ok).toBe(true);
    expect(s.verify(d2, A)).toMatchObject({ state: 'verified', property_id: propertyId });
    // the verifying device signs out; a brand-new device of the same account verifies again: the account still owns it
    s.call(owner, mod.sign_out_device as any, {});
    s.call(d2, mod.sign_out_device as any, {});
    const d3 = s.user('d3');
    expect(s.emailFlow(d3, EMAIL, 'signin').ok).toBe(true);
    expect(s.verify(d3, A).state).toBe('verified');
    expect(s.h.db.claim_conflict.count()).toBe(0n);
    // a device of a DIFFERENT account is held
    const stranger = s.user('other-account');
    expect(s.verify(stranger, A)).toMatchObject({ state: 'failed', fail_reason: 'duplicate_claim' });
    expect(s.h.db.claim_conflict.count()).toBe(1n);
    // ...and the account's other devices see the warning too
    expect(rows(s, d3, 'my_claim_conflicts')).toHaveLength(1);
  });

  it('flag off: a second identity is verified and no conflict is recorded; the admin view shows effective values', () => {
    const { s, admin, claimant } = world();
    expect(rows(s, admin, 'admin_security_config')).toEqual([
      { id: 0, hold_duplicate_claims: true, max_verification_starts_per_hour_global: 120, max_verification_starts_per_property_per_day: 6, is_default: true },
    ]);
    setConfig(s, admin, { hold_duplicate_claims: false });
    expect(rows(s, admin, 'admin_security_config')[0]).toMatchObject({ hold_duplicate_claims: false, is_default: false });
    expect(s.verify(claimant, A).state).toBe('verified');
    expect(s.h.db.claim_conflict.count()).toBe(0n);
    setConfig(s, admin, { hold_duplicate_claims: true }); // back on: held again
    expect(s.verify(s.user('third'), A).fail_reason).toBe('duplicate_claim');
  });
});

describe('admin resolution of held claims and reviews', () => {
  it('approve: the claimant becomes a verified owner (access, audit entry); conflict closed; cannot resolve twice', () => {
    const { s, admin, owner, claimant, propertyId } = world();
    const held = s.verify(claimant, A);
    const [c] = [...s.h.db.claim_conflict.iter()];
    expect(rows(s, admin, 'admin_claim_conflicts')).toHaveLength(1);
    s.call(admin, mod.admin_resolve_claim as any, { conflict_id: c.id, approve: true });
    expect(s.h.db.verification.id.find(held.id)).toMatchObject({ state: 'verified', fail_reason: undefined });
    expect(s.h.db.claim_conflict.id.find(c.id)).toMatchObject({ status: 'approved' });
    expect(s.h.db.claim_conflict.id.find(c.id)!.resolved_at).toBeDefined();
    expect(rows(s, claimant, 'my_property_privates')).toHaveLength(1);
    expect(rows(s, owner, 'my_claim_conflicts')[0].status).toBe('approved');
    expect(accessLog(s).filter(l => l.kind === 'verify' && l.identity.isEqual(s.idOf(claimant)) && l.property_id === propertyId)).toHaveLength(1);
    expect(() => s.call(admin, mod.admin_resolve_claim as any, { conflict_id: c.id, approve: false })).toThrow(/already resolved/);
    expect(() => s.call(admin, mod.admin_resolve_claim as any, { conflict_id: 999n, approve: true })).toThrow(/not found/);
  });

  it('approve binds the property to the claimant account when the claimant device is signed in', () => {
    const { s, admin, claimant } = world({ email: true });
    s.verify(claimant, elsewhere(7)); // a different property, so the device can enroll
    expect(s.emailFlow(claimant, 'claimant@example.com', 'enroll').ok).toBe(true);
    expect(s.h.db.account_property.count()).toBe(1n);
    const held = s.verify(claimant, A);
    expect(held.fail_reason).toBe('duplicate_claim');
    expect(s.h.db.account_property.count()).toBe(1n); // held: not bound
    const [c] = [...s.h.db.claim_conflict.iter()];
    s.call(admin, mod.admin_resolve_claim as any, { conflict_id: c.id, approve: true });
    expect(s.h.db.account_property.count()).toBe(2n);
  });

  it('reject: the claim stays failed (review_rejected), no access, name dropped, conflict closed', () => {
    const { s, admin, claimant, owner } = world();
    const held = s.verify(claimant, A);
    expect(held.name_on_doc).toBe('SPECIMEN PERSON'); // kept privately for the admin until resolved
    const [c] = [...s.h.db.claim_conflict.iter()];
    s.call(admin, mod.admin_resolve_claim as any, { conflict_id: c.id, approve: false });
    expect(s.h.db.verification.id.find(held.id)).toMatchObject({ state: 'failed', fail_reason: 'review_rejected', name_on_doc: undefined });
    expect(s.h.db.claim_conflict.id.find(c.id)).toMatchObject({ status: 'rejected' });
    expect(rows(s, claimant, 'my_property_privates')).toHaveLength(0);
    expect(rows(s, owner, 'my_claim_conflicts')[0].status).toBe('rejected');
  });

  it("'needs_review' is a hold without a conflict row; approve grants, reject keeps it failed", () => {
    const { s, admin } = world();
    const hold = (who: any, address: any) => {
      start(s, who, address);
      const v = [...s.h.db.verification.identity.filter(s.idOf(who))].pop()!;
      s.upload(who, `idv/${v.id}/doc.jpg`, 'image/jpeg');
      s.call(who, mod.submit_verification as any, { verification_id: v.id, object_key: `idv/${v.id}/doc.jpg` });
      const job = [...s.h.db.job.iter()].find(j => j.verification_id === v.id)!;
      s.call(s.worker, mod.claim_job as any, { job_id: job.id, lease_ms: 60_000 });
      s.call(s.worker, mod.record_verification as any, { verification_id: v.id, ok: false, fail_reason: 'needs_review', name_on_doc: 'SHOULD NOT STICK' });
      s.call(s.worker, mod.complete_job as any, { job_id: job.id, ok: true });
      return s.h.db.verification.id.find(v.id)!;
    };
    const a = s.user('review-a');
    const b = s.user('review-b');
    const va = hold(a, elsewhere(8));
    const vb = hold(b, elsewhere(9));
    for (const v of [va, vb]) expect(v).toMatchObject({ state: 'failed', fail_reason: 'needs_review', name_on_doc: undefined, object_key: undefined });
    expect(s.h.db.claim_conflict.count()).toBe(0n);
    expect(rows(s, a, 'my_property_privates')).toHaveLength(0);
    s.call(admin, mod.admin_resolve_verification as any, { verification_id: va.id, approve: true });
    expect(s.h.db.verification.id.find(va.id)).toMatchObject({ state: 'verified', fail_reason: undefined });
    expect(rows(s, a, 'my_property_privates')).toHaveLength(1);
    s.call(admin, mod.admin_resolve_verification as any, { verification_id: vb.id, approve: false });
    expect(s.h.db.verification.id.find(vb.id)).toMatchObject({ state: 'failed', fail_reason: 'review_rejected' });
    // only held reviews can be resolved
    expect(() => s.call(admin, mod.admin_resolve_verification as any, { verification_id: va.id, approve: true })).toThrow(/not held/);
    expect(() => s.call(admin, mod.admin_resolve_verification as any, { verification_id: vb.id, approve: true })).toThrow(/not held/);
    expect(() => s.call(admin, mod.admin_resolve_verification as any, { verification_id: 999n, approve: true })).toThrow(/not found/);
  });

  it('approving a needs_review verification cannot bypass an existing owner; duplicate holds use admin_resolve_claim', () => {
    const { s, admin, claimant, propertyId } = world();
    start(s, claimant, A);
    const v = [...s.h.db.verification.identity.filter(s.idOf(claimant))].pop()!;
    s.upload(claimant, `idv/${v.id}/doc.jpg`, 'image/jpeg');
    s.call(claimant, mod.submit_verification as any, { verification_id: v.id, object_key: `idv/${v.id}/doc.jpg` });
    const job = [...s.h.db.job.iter()].find(j => j.verification_id === v.id)!;
    s.call(s.worker, mod.claim_job as any, { job_id: job.id, lease_ms: 60_000 });
    s.call(s.worker, mod.record_verification as any, { verification_id: v.id, ok: false, fail_reason: 'needs_review' });
    s.call(admin, mod.admin_resolve_verification as any, { verification_id: v.id, approve: true });
    expect(s.h.db.verification.id.find(v.id)).toMatchObject({ state: 'failed', fail_reason: 'duplicate_claim' });
    expect(rows(s, claimant, 'my_property_privates')).toHaveLength(0);
    const [c] = [...s.h.db.claim_conflict.iter()];
    expect(c).toMatchObject({ property_id: propertyId, status: 'open' });
    expect(() => s.call(admin, mod.admin_resolve_verification as any, { verification_id: v.id, approve: true })).toThrow(/admin_resolve_claim/);
    s.call(admin, mod.admin_resolve_claim as any, { conflict_id: c.id, approve: true });
    expect(s.h.db.verification.id.find(v.id)!.state).toBe('verified');
  });

  it('the worker cannot write module-only reasons', () => {
    const { s, claimant } = world();
    start(s, claimant, A);
    const v = [...s.h.db.verification.identity.filter(s.idOf(claimant))].pop()!;
    for (const reason of ['duplicate_claim', 'review_rejected']) {
      expect(() => s.call(s.worker, mod.record_verification as any, { verification_id: v.id, ok: false, fail_reason: reason })).toThrow(/invalid fail_reason/);
    }
  });

  it('everything admin-only rejects strangers, reporters, owners, claimants, the worker and web; admin views are empty for them', () => {
    const { s, owner, claimant } = world();
    s.verify(claimant, A);
    const web = s.user('web');
    s.call(s.internal, mod.admin_add_service as any, { identity: s.idOf(web).toHexString(), role: 'web' });
    const reporter = s.user('reporter');
    s.createReport(reporter);
    const [c] = [...s.h.db.claim_conflict.iter()];
    const v = s.h.db.verification.id.find(c.new_verification_id)!;
    const calls: [any, any][] = [
      [mod.admin_resolve_claim, { conflict_id: c.id, approve: true }],
      [mod.admin_resolve_verification, { verification_id: v.id, approve: true }],
      [mod.admin_set_security_config, { hold_duplicate_claims: false, max_verification_starts_per_hour_global: undefined, max_verification_starts_per_property_per_day: undefined }],
    ];
    for (const who of [s.user('stranger'), reporter, owner, claimant, s.worker, web]) {
      for (const [fn, args] of calls) expect(() => s.call(who, fn, args)).toThrow(/admin only/);
      expect(rows(s, who, 'admin_security_config')).toHaveLength(0);
      expect(rows(s, who, 'admin_claim_conflicts')).toHaveLength(0);
    }
    expect(s.h.db.claim_conflict.id.find(c.id)!.status).toBe('open'); // nothing changed
    expect(s.h.db.security_config.count()).toBe(0n);
  });

  it('admin_set_security_config validates values and keeps omitted ones', () => {
    const { s, admin } = world();
    setConfig(s, admin, { max_verification_starts_per_hour_global: 50 });
    expect(rows(s, admin, 'admin_security_config')[0]).toMatchObject({
      hold_duplicate_claims: true, max_verification_starts_per_hour_global: 50, max_verification_starts_per_property_per_day: 6,
    });
    setConfig(s, admin, { hold_duplicate_claims: false });
    expect(rows(s, admin, 'admin_security_config')[0]).toMatchObject({ hold_duplicate_claims: false, max_verification_starts_per_hour_global: 50 });
    expect(() => setConfig(s, admin, { max_verification_starts_per_hour_global: 0 })).toThrow(/1-/);
    expect(() => setConfig(s, admin, { max_verification_starts_per_property_per_day: 1_000_000 })).toThrow(/1-/);
  });
});

describe('verification start caps', () => {
  it('global cap per rolling hour across identities; resets with time; rejected calls are not counted', () => {
    const s = setup({ security: 'defaults' });
    setConfig(s, s.internal, { max_verification_starts_per_hour_global: 3 });
    const users = [1, 2, 3, 4, 5].map(i => s.user(`g${i}`));
    for (let i = 0; i < 3; i++) start(s, users[i]!, elsewhere(i + 1));
    expect(() => start(s, users[3]!, elsewhere(4))).toThrow(/rate_limited: too many verification attempts, try again later/);
    expect(s.h.db.verification_start.count()).toBe(3n);
    expect(s.h.db.verification.count()).toBe(3n); // the rejected call left nothing behind (not even a property)
    expect(s.h.db.property_private.count()).toBe(3n);
    s.advanceMs(HOUR - 1000);
    expect(() => start(s, users[3]!, elsewhere(4))).toThrow(/too many verification attempts/);
    s.advanceMs(2000); // the first three started more than an hour ago
    start(s, users[3]!, elsewhere(4));
    start(s, users[4]!, elsewhere(5));
  });

  it('per-property daily cap across identities (default 6); other properties unaffected; resets after a day', () => {
    const s = setup({ security: 'defaults' });
    const users = Array.from({ length: 8 }, (_, i) => s.user(`p${i}`));
    for (let i = 0; i < 6; i++) start(s, users[i]!, A);
    expect(() => start(s, users[6]!, A)).toThrow(/rate_limited: too many verification attempts, try again later/);
    expect(s.h.db.verification.count()).toBe(6n);
    start(s, users[6]!, elsewhere(2)); // another address is fine
    s.advanceMs(DAY - 1000);
    expect(() => start(s, users[7]!, A)).toThrow(/too many/);
    s.advanceMs(2000);
    start(s, users[7]!, A);
  });

  it('the per-identity limit is unchanged (3 per hour, plain rate_limited) and caps are configurable', () => {
    const s = setup({ security: 'defaults' });
    const u = s.user('solo');
    for (let i = 0; i < 3; i++) start(s, u, elsewhere(i + 1));
    expect(() => start(s, u, elsewhere(4))).toThrow(/rate_limited/);
    setConfig(s, s.internal, { max_verification_starts_per_property_per_day: 1 });
    start(s, s.user('x1'), A);
    expect(() => start(s, s.user('x2'), A)).toThrow(/too many/);
  });

  it('a legitimate retry after a failed verification still works within the caps', () => {
    const s = setup({ security: 'defaults' });
    const u = s.user('retry');
    expect(s.verify(u, A, false)).toMatchObject({ state: 'failed', fail_reason: 'address_mismatch' });
    const second = s.verify(u, A);
    expect(second).toMatchObject({ state: 'verified', attempt_no: 2 });
  });

  it('the maintenance tick purges the start ledger after 24 h', () => {
    const s = setup({ security: 'defaults' });
    start(s, s.user('l1'), A);
    s.advanceMs(23 * HOUR);
    start(s, s.user('l2'), A);
    s.tick();
    expect(s.h.db.verification_start.count()).toBe(2n);
    s.advanceMs(HOUR + 1000);
    s.tick();
    expect(s.h.db.verification_start.count()).toBe(1n); // only the 23 h-old one is under 24 h
    s.advanceMs(DAY);
    s.tick();
    expect(s.h.db.verification_start.count()).toBe(0n);
  });
});

describe('owner audit log', () => {
  /** An owner with one image on the report, big enough for 2 chunks. */
  function mediaWorld() {
    const w = world();
    const { s, owner } = w;
    const reporter = s.user('reporter');
    const rid = s.createReport(reporter);
    const key = `media/${rid}/${HEX('4')}.jpg`;
    s.upload(reporter, key, 'image/jpeg', 600 * 1024);
    s.attach(reporter, rid, 'image', 5);
    return { ...w, reporter, rid, key, owner };
  }

  it('logs one entry per object an OWNER reads (first chunk), with the object key; never worker or denied reads', () => {
    const { s, owner, key, propertyId } = mediaWorld();
    const before = accessLog(s).length; // the 'verify' grant entry
    expect(readBlob(s, s.worker, key).ok).toBe(true);
    expect(readBlob(s, s.user('stranger'), key).error).toBe('forbidden');
    expect(readBlob(s, owner, key, 99).ok).toBe(false);
    expect(accessLog(s)).toHaveLength(before);
    expect(readBlob(s, owner, key, 0).ok).toBe(true);
    expect(readBlob(s, owner, key, 1).ok).toBe(true); // later chunks of the same object are not logged again
    const entries = accessLog(s).slice(before);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'blob', property_id: propertyId, object_key: key });
    expect(entries[0]!.identity.isEqual(s.idOf(owner))).toBe(true);
  });

  it('logs the grant on successful verification and sign-in binding; never idv keys or names', () => {
    const { s, owner, first, propertyId } = world({ email: true });
    expect(accessLog(s)).toHaveLength(1);
    expect(accessLog(s)[0]).toMatchObject({ kind: 'verify', property_id: propertyId, object_key: undefined });
    s.emailFlow(owner, EMAIL, 'enroll'); // enroll binds the property to the new account
    const d2 = s.user('d2');
    s.emailFlow(d2, EMAIL, 'signin'); // d2 brings no property of its own: nothing to bind
    const kinds = accessLog(s).map(l => l.kind);
    expect(kinds).toEqual(['verify', 'claim']);
    // a failed verification writes nothing
    s.verify(s.user('f'), elsewhere(3), false);
    expect(accessLog(s)).toHaveLength(2);
    const blob = JSON.stringify(accessLog(s), (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    expect(blob).not.toContain('idv/');
    expect(blob).not.toContain('SPECIMEN');
    expect(first.id).toBeDefined();
  });

  it('my_access_log: owners (and their account) see time/kind only, newest first, max 50, never other identities', () => {
    const { s, owner, claimant, admin, propertyId } = mediaWorld();
    for (let i = 0; i < 60; i++) {
      s.advanceMs(1000);
      readBlob(s, owner, mediaWorldKey(s), 0);
    }
    const mine = rows(s, owner, 'my_access_log');
    expect(mine).toHaveLength(50);
    expect(Object.keys(mine[0]).sort()).toEqual(['at', 'id', 'kind', 'mine', 'property_id']);
    expect(mine.every(r => r.mine && r.property_id === propertyId)).toBe(true);
    expect(mine[0].id > mine[49].id).toBe(true);
    // a second owner (approved claim) sees the first owner's reads, flagged as not theirs, with no identity anywhere
    const held = s.verify(claimant, A);
    const [c] = [...s.h.db.claim_conflict.iter()];
    s.call(admin, mod.admin_resolve_claim as any, { conflict_id: c.id, approve: true });
    expect(held.id).toBeDefined();
    const theirs = rows(s, claimant, 'my_access_log');
    expect(theirs.length).toBeGreaterThan(0);
    expect(theirs.filter(r => r.kind === 'blob').every(r => !r.mine)).toBe(true);
    expect(theirs.find(r => r.kind === 'verify' && r.mine)).toBeDefined();
    const text = JSON.stringify(theirs, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    expect(text).not.toContain(s.idOf(owner).toHexString());
    expect(text).not.toContain('media/');
    // strangers and the worker see nothing
    for (const who of [s.user('stranger'), s.worker]) expect(rows(s, who, 'my_access_log')).toHaveLength(0);
  });

  it('purges entries older than 30 days in the maintenance tick', () => {
    const { s, owner, key } = mediaWorld();
    readBlob(s, owner, key, 0); // t0
    s.advanceMs(29 * DAY);
    readBlob(s, owner, key, 0); // t0 + 29 d
    s.tick();
    expect(accessLog(s)).toHaveLength(3); // verify + 2 reads
    s.advanceMs(2 * DAY); // verify + first read are now > 30 d old
    s.tick();
    expect(accessLog(s).map(l => l.kind)).toEqual(['blob']);
  });
});

function mediaWorldKey(s: S): string {
  return [...s.h.db.blob.iter()].find(b => b.object_key.startsWith('media/'))!.object_key;
}
