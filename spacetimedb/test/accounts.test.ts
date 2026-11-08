// Email accounts: enroll / signin / step-up flows, limits, lockout, access integration, privacy.
// Brevo HTTP can't run here: the email sender is injected (runRequestEmailCode) or faked at the ctx.http level.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { setup, mod, HEX } from './helpers';
import { sha256Hex } from '../src/sha256';
import { normalizeEmail, maskEmail } from '../src/email';
import { runRequestEmailCode, type EmailDeps } from '../src/email_flow';
import { sendEmailViaBrevo, BREVO_URL } from '../src/email_brevo';

const EMAIL = ' Sam.Owner@Example.com '; // typed form: trimmed and lowercased by normalizeEmail
const NORM = 'sam.owner@example.com';
const EMAIL2 = 'riley@example.org';
const MIN = 60_000;

type S = ReturnType<typeof setup>;
const json = (x: unknown) => JSON.stringify(x, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));

/** A reporter's assessed report with media, frame, steps, plus a verified owner of that property. */
function ownerWorld(configure = true) {
  const s = setup();
  if (configure) s.configureEmail('demo');
  const reporter = s.user('reporter');
  const owner = s.user('owner');
  const rid = s.createReport(reporter);
  s.attach(reporter, rid, 'image', 3);
  s.call(reporter, mod.submit_report as any, { report_id: rid });
  const job = s.jobsFor(rid).find(j => j.state === 'queued')!;
  s.call(s.worker, mod.claim_job as any, { job_id: job.id, lease_ms: 60_000 });
  s.call(s.worker, mod.record_frame as any, { report_id: rid, frame_index: 0, t_sec: 1, thumb_key: `frames/${rid}/0.jpg`, finding_json: '{}' });
  s.call(s.worker, mod.record_agent_step as any, { report_id: rid, seq: 1, kind: 'tool_call', name: 'detail', summary: 'affected-only', visibility: 'affected' });
  s.call(s.worker, mod.record_assessment as any, { report_id: rid, json: '{"secret":"cost-detail"}', overall_level: 'major', usable_frames: 4, total_frames: 4, life_safety_csv: '' });
  s.call(s.worker, mod.complete_job as any, { job_id: job.id, ok: true });
  const v = s.verify(owner);
  s.call(owner, mod.save_affected_intake as any, { property_id: v.property_id, intake_json: '{"personaId":"p"}' });
  s.call(s.worker, mod.record_recovery_plan as any, { identity: s.idOf(owner).toHexString(), property_id: v.property_id, report_id: rid, json: '{"plan":"private"}' });
  const mediaKey = `media/${rid}/${HEX('3')}.jpg`;
  const read = (who: any) => (mod.read_blob as any)(s.h.procedureContext(who), { object_key: mediaKey, seq: 0 });
  const GATED = ['my_property_reports', 'my_report_privates', 'my_media_assets', 'my_frames', 'my_assessments', 'my_agent_steps', 'my_affected_profiles', 'my_recovery_plans'] as const;
  const counts = (who: any) => Object.fromEntries(GATED.map(n => [n, s.view(who, (mod as any)[n]).length]));
  return { s, reporter, owner, rid, propertyId: v.property_id, read, counts, GATED };
}

const enroll = (s: S, who: any, email = EMAIL) => {
  const r = s.emailFlow(who, email, 'enroll');
  expect(r.ok, r.error).toBe(true);
};

describe('helpers', () => {
  it('sha256Hex matches node:crypto (empty, short, block boundaries, unicode)', () => {
    for (const m of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'a'.repeat(1000), 'héllo wörld ✓ 😀']) {
      expect(sha256Hex(m)).toBe(createHash('sha256').update(m).digest('hex'));
    }
  });

  it('normalizes emails: trim + lowercase, keeps plus-addressing and dots, rejects the obviously invalid', () => {
    expect(normalizeEmail(' Sam.Owner@Example.COM ')).toBe(NORM);
    expect(normalizeEmail('Sam+Tag@Gmail.com')).toBe('sam+tag@gmail.com'); // plus part kept
    expect(normalizeEmail('s.a.m@gmail.com')).toBe('s.a.m@gmail.com'); // dots kept
    expect(normalizeEmail("o'brien_x@sub.example.co.uk")).toBe("o'brien_x@sub.example.co.uk");
    expect(normalizeEmail('a@b.co')).toBe('a@b.co');
    expect(normalizeEmail(`${'a'.repeat(64)}@example.com`)).toBe(`${'a'.repeat(64)}@example.com`);
    const long = `a@${'b'.repeat(60)}.${'c'.repeat(60)}.${'d'.repeat(60)}.${'e'.repeat(60)}.${'f'.repeat(20)}.com`; // > 254 chars
    expect(long.length).toBeGreaterThan(254);
    const bad = [
      '', '   ', 'plain', 'no-at.example.com', '@example.com', 'a@', 'a@b', 'a@b.', 'a@.com', 'a@b..com', 'a@-b.com', 'a@b-.com', 'a@b.c',
      'a@b.123', 'a@@b.com', 'a@b@c.com', 'a b@example.com', 'a@exa mple.com', 'a\tb@example.com', 'a\nb@example.com', 'a\u0000b@example.com',
      '.a@example.com', 'a.@example.com', 'a..b@example.com', '"a b"@example.com', 'a,b@example.com', '<a@example.com>', 'a;b@example.com',
      'josé@example.com', 'a@exämple.com', `${'a'.repeat(65)}@example.com`, long, 'a@b_c.com',
    ];
    for (const x of bad) expect(normalizeEmail(x), JSON.stringify(x)).toBeNull();
    expect(normalizeEmail(undefined as any)).toBeNull();
  });

  it('masks as first char + *** + @domain and never leaks the full local part', () => {
    expect(maskEmail('sam@gmail.com')).toBe('s***@gmail.com');
    expect(maskEmail(NORM)).toBe('s***@example.com');
    expect(maskEmail('a@gmail.com')).toBe('***@gmail.com'); // a one-char local part would be shown whole by its first char
    for (const e of ['ab@x.io', 'sam@gmail.com', 'verylonglocal+tag@example.com', NORM]) {
      const m = maskEmail(e);
      const local = e.slice(0, e.lastIndexOf('@'));
      expect(m, e).not.toContain(local);
      expect(m.endsWith(e.slice(e.lastIndexOf('@'))), e).toBe(true);
    }
  });
});

describe('config and status', () => {
  it('is inert until an admin configures it; my_auth_status says so', () => {
    const s = setup();
    const owner = s.user('owner');
    expect(s.view(owner, mod.my_auth_status as any)).toEqual([{ id: 0, mode: 'off', configured: false }]);
    expect(s.requestCode(owner, EMAIL, 'signin')).toMatchObject({ ok: false, error: 'email_not_configured' });
  });

  it('admin_set_email_config is admin-only, validates, keeps the pepper, never leaks the key', () => {
    const s = setup();
    const alice = s.user('alice');
    expect(() => s.call(alice, mod.admin_set_email_config as any, { mode: 'demo' })).toThrow(/admin only/);
    expect(() => s.configureEmail('brevo')).toThrow(/brevo mode needs/);
    expect(() => s.configureEmail('brevo', { brevo_api_key: s.BREVO.brevo_api_key })).toThrow(/brevo mode needs/); // no sender
    expect(() => s.configureEmail('brevo', { sender_email: s.BREVO.sender_email })).toThrow(/brevo mode needs/); // no key
    expect(() => s.configureEmail('bogus' as any)).toThrow(/invalid mode/);
    expect(() => s.configureEmail('demo', { sender_email: 'not-an-email' })).toThrow(/sender_email/);
    expect(() => s.configureEmail('demo', { brevo_api_key: 'short' })).toThrow(/brevo_api_key/);
    expect(() => s.configureEmail('photon' as any)).toThrow(/invalid mode/); // the old SMS mode is gone
    expect(() => s.configureEmail('demo', { daily_send_cap: 0 })).toThrow(/daily_send_cap/);
    s.configureEmail('demo');
    const pepper = s.h.db.email_config.id.find(0)!.hash_pepper;
    expect(pepper).toMatch(/^[0-9a-f]{64}$/);
    s.configureEmail('brevo', { ...s.BREVO, sender_email: ' NoReply@Aftermath.Example ' }); // normalized on store
    s.configureEmail('brevo', { require_stepup: true });
    const cfg = s.h.db.email_config.id.find(0)!;
    expect(cfg.hash_pepper).toBe(pepper); // never rotated
    expect(cfg.brevo_api_key).toBe(s.BREVO.brevo_api_key); // omitted args keep their value
    expect(cfg.sender_email).toBe('noreply@aftermath.example');
    expect(cfg.require_stepup).toBe(true);

    const admin = s.internal;
    const adminView = s.view(admin, mod.admin_email_config as any);
    expect(adminView).toEqual([
      { id: 0, mode: 'brevo', has_key: true, has_sender_email: true, has_pepper: true, require_stepup: true, daily_send_cap: 200 },
    ]);
    expect(s.view(alice, mod.admin_email_config as any)).toEqual([]);
    for (const who of [alice, admin]) {
      for (const name of Object.keys(mod).filter(n => n.startsWith('my_') || n.startsWith('admin_email'))) {
        const out = json(s.view(who, (mod as any)[name]));
        expect(out, name).not.toContain(s.BREVO.brevo_api_key);
        expect(out, name).not.toContain('noreply@aftermath.example');
        expect(out, name).not.toContain(pepper);
      }
    }
  });

  it('switching away from demo mode deletes plaintext demo codes', () => {
    const { s, owner } = ownerWorld();
    s.requestCode(owner, EMAIL, 'enroll');
    expect(s.h.db.demo_code.count()).toBe(1n);
    s.configureEmail('brevo', s.BREVO);
    expect(s.h.db.demo_code.count()).toBe(0n);
  });
});

describe('enroll', () => {
  it('a verified owner enrolls with the on-screen demo code; no full number or code is kept', () => {
    const { s, owner } = ownerWorld();
    const r = s.requestCode(owner, EMAIL, 'enroll');
    expect(r).toMatchObject({ ok: true, error: '' });
    const ch = s.view(owner, mod.my_email_challenge as any);
    expect(ch).toHaveLength(1);
    expect(ch[0]).toMatchObject({ id: r.challenge_id, purpose: 'enroll', attempts_left: 5, delivery_state: 'demo' });
    const code = s.demoCode(owner)!;
    expect(code).toMatch(/^\d{6}$/);

    const bad = s.verifyCode(owner, r.challenge_id, code === '000000' ? '000001' : '000000');
    expect(bad).toMatchObject({ ok: false, error: 'invalid_code', attempts_left: 4 });
    expect(s.view(owner, mod.my_email_challenge as any)[0].attempts_left).toBe(4);
    const ok = s.verifyCode(owner, r.challenge_id, code);
    expect(ok).toMatchObject({ ok: true, purpose: 'enroll' });

    expect(s.view(owner, mod.my_account as any)).toMatchObject([{ email_masked: 's***@example.com' }]);
    const devs = s.view(owner, mod.my_devices as any);
    expect(devs).toHaveLength(1);
    expect(devs[0]).toMatchObject({ is_current: true, identity_hex: s.idOf(owner).toHexString() });
    expect(s.view(owner, mod.my_stepup as any)[0]).toMatchObject({ linked: true, active: true, require_stepup: false });
    expect(s.view(owner, mod.my_email_challenge as any)).toHaveLength(0);
    expect(s.view(owner, mod.my_demo_code as any)).toHaveLength(0);
    // Nothing at rest holds the number or the code.
    const accountJson = json([...s.h.db.account.iter()]);
    expect(accountJson).not.toContain('sam.owner');
    expect(accountJson).not.toContain(NORM);
    for (const c of s.h.db.email_challenge.iter()) {
      expect(c.email_plain).toBe('');
      expect(json(c)).not.toContain(code);
      expect(json(c)).not.toContain('sam.owner');
    }
    expect(s.h.db.demo_code.count()).toBe(0n);
    // A second verification of the same challenge fails.
    expect(s.verifyCode(owner, r.challenge_id, code).ok).toBe(false);
  });

  it('non-verified identities cannot enroll (stranger, reporter, pending verification)', () => {
    const { s, reporter } = ownerWorld();
    const stranger = s.user('stranger');
    const pending = s.user('pending');
    s.call(pending, mod.start_verification as any, { address_json: JSON.stringify({ line1: '9 Elm St', city: 'Dallas', state: 'TX', zip: '75201', lat: 32.7767, lng: -96.797, normalized: 'x', source: 'census' }), doc_kind: 'state_id', secret_hash: HEX('c') });
    for (const who of [stranger, reporter, pending]) {
      expect(s.requestCode(who, EMAIL, 'enroll')).toMatchObject({ ok: false, error: 'not_verified_owner' });
    }
    expect(s.h.db.email_challenge.count()).toBe(0n);
  });

  it('refuses an email that already has an account, and a device that is already signed in', () => {
    const { s, owner } = ownerWorld();
    enroll(s, owner);
    expect(s.requestCode(owner, EMAIL2, 'enroll')).toMatchObject({ ok: false, error: 'already_signed_in' });
    const other = s.user('other-owner');
    s.verify(other, undefined, true);
    s.advanceMs(1000);
    expect(s.requestCode(other, EMAIL, 'enroll')).toMatchObject({ ok: false, error: 'email_already_registered' });
    expect(s.requestCode(other, 'not an email', 'enroll')).toMatchObject({ ok: false, error: 'invalid_email' });
    expect(s.requestCode(other, EMAIL2, 'bogus')).toMatchObject({ ok: false, error: 'invalid_purpose' });
  });
});

describe('wrong codes, lockout, expiry', () => {
  it('locks the challenge after 5 wrong codes and the address for 15 minutes', () => {
    const { s, owner } = ownerWorld();
    const r = s.requestCode(owner, EMAIL, 'enroll');
    const good = s.demoCode(owner)!;
    const wrong = good === '111111' ? '222222' : '111111';
    for (let i = 1; i <= 4; i++) expect(s.verifyCode(owner, r.challenge_id, wrong)).toMatchObject({ ok: false, error: 'invalid_code', attempts_left: 5 - i });
    expect(s.verifyCode(owner, r.challenge_id, wrong)).toMatchObject({ ok: false, error: 'locked' });
    expect(s.verifyCode(owner, r.challenge_id, good)).toMatchObject({ ok: false, error: 'locked' }); // even the right code now
    expect(s.view(owner, mod.my_demo_code as any)).toHaveLength(0);
    expect(s.view(owner, mod.my_account as any)).toHaveLength(0);

    s.advanceMs(40_000);
    const again = s.requestCode(owner, EMAIL, 'enroll');
    expect(again.error).toBe('locked');
    expect(again.retry_after_s).toBeGreaterThan(14 * 60 - 60);
    // Another identity cannot get a code for that email either.
    const o2 = s.user('o2');
    s.verify(o2);
    expect(s.requestCode(o2, EMAIL, 'signin').error).toBe('locked');

    s.advanceMs(15 * MIN);
    expect(s.requestCode(owner, EMAIL, 'enroll').ok).toBe(true);
  });

  it('a code expires after 10 minutes; the tick closes it and purges the demo code', () => {
    const { s, owner } = ownerWorld();
    const r = s.requestCode(owner, EMAIL, 'enroll');
    const code = s.demoCode(owner)!;
    s.advanceMs(9 * MIN);
    s.tick();
    expect(s.view(owner, mod.my_email_challenge as any)).toHaveLength(1);
    s.advanceMs(2 * MIN);
    // Before the tick the view still shows it (no clock), but verification is refused.
    expect(s.verifyCode(owner, r.challenge_id, code)).toMatchObject({ ok: false, error: 'expired' });
    expect(s.view(owner, mod.my_demo_code as any)).toHaveLength(0);

    const r2 = s.requestCode(owner, EMAIL, 'enroll');
    expect(r2.ok).toBe(true);
    s.advanceMs(11 * MIN);
    s.tick();
    expect(s.view(owner, mod.my_email_challenge as any)).toHaveLength(0);
    expect(s.h.db.demo_code.count()).toBe(0n);
  });

  it('only the requesting identity can verify a challenge', () => {
    const { s, owner } = ownerWorld();
    const mallory = s.user('mallory');
    const r = s.requestCode(owner, EMAIL, 'enroll');
    expect(s.verifyCode(mallory, r.challenge_id, s.demoCode(owner)!)).toMatchObject({ ok: false, error: 'not_found' });
    expect(s.verifyCode(owner, 9999n, '123456').error).toBe('not_found');
  });
});

describe('rate limits', () => {
  it('30 s resend cooldown', () => {
    const { s, owner } = ownerWorld();
    expect(s.requestCode(owner, EMAIL, 'enroll').ok).toBe(true);
    const r = s.requestCode(owner, EMAIL, 'enroll');
    expect(r).toMatchObject({ ok: false, error: 'cooldown' });
    expect(r.retry_after_s).toBeGreaterThan(0);
    expect(r.retry_after_s).toBeLessThanOrEqual(30);
    s.advanceMs(31_000);
    expect(s.requestCode(owner, EMAIL, 'enroll').ok).toBe(true);
  });

  it('3 sends per hour per email, across identities', () => {
    const { s } = ownerWorld();
    const who = [1, 2, 3, 4].map(i => s.user(`u${i}`));
    for (let i = 0; i < 3; i++) {
      expect(s.requestCode(who[i]!, EMAIL, 'signin').ok).toBe(true);
      s.advanceMs(31_000);
    }
    expect(s.requestCode(who[3]!, EMAIL, 'signin')).toMatchObject({ ok: false, error: 'rate_limited_email' });
    s.advanceMs(HOUR());
    expect(s.requestCode(who[3]!, EMAIL, 'signin').ok).toBe(true);
  });

  it('5 sends per hour per identity, across emails', () => {
    const { s } = ownerWorld();
    const u = s.user('busy');
    for (let i = 0; i < 5; i++) {
      expect(s.requestCode(u, `user${i}@example.com`, 'signin').ok).toBe(true);
      s.advanceMs(31_000);
    }
    expect(s.requestCode(u, 'last@example.com', 'signin')).toMatchObject({ ok: false, error: 'rate_limited_identity' });
    s.advanceMs(HOUR());
    expect(s.requestCode(u, 'last@example.com', 'signin').ok).toBe(true);
  });

  it('global daily cap counts real challenges only, and applies to decoys too', () => {
    const { s, owner } = ownerWorld();
    s.configureEmail('demo', { daily_send_cap: 2 });
    enroll(s, owner); // real #1
    const b = s.user('b');
    s.advanceMs(31_000);
    // signin for the enrolled number is a real send (#2)
    expect(s.requestCode(b, EMAIL, 'signin').ok).toBe(true);
    const c = s.user('c');
    s.advanceMs(31_000);
    expect(s.requestCode(c, EMAIL2, 'signin')).toMatchObject({ ok: false, error: 'daily_cap' }); // decoy is refused too
    s.advanceMs(25 * 60 * MIN);
    expect(s.requestCode(c, EMAIL2, 'signin').ok).toBe(true);
  });
});

describe('sign in on a second device', () => {
  it('grants the account properties; sign_out removes the inheritance', () => {
    const { s, owner, rid, propertyId, read, counts } = ownerWorld();
    enroll(s, owner);
    const d2 = s.user('new-device');
    expect(counts(d2).my_property_reports).toBe(0);
    expect(read(d2).error).toBe('forbidden');

    const res = s.emailFlow(d2, EMAIL, 'signin');
    expect(res).toMatchObject({ ok: true, purpose: 'signin' });
    expect(s.view(d2, mod.my_account as any)).toMatchObject([{ email_masked: 's***@example.com' }]);
    expect(s.view(d2, mod.my_devices as any)).toHaveLength(2);
    expect(s.view(owner, mod.my_devices as any)).toHaveLength(2);
    expect(s.view(d2, mod.my_devices as any).filter((d: any) => d.is_current)).toHaveLength(1);

    const c = counts(d2);
    expect(c.my_property_reports).toBe(1);
    expect(c.my_assessments).toBe(1);
    expect(c.my_media_assets).toBe(1);
    expect(c.my_frames).toBe(1);
    expect(s.view(d2, mod.my_agent_steps as any).map((x: any) => x.visibility)).toEqual(['affected']); // owner-level step
    expect(c.my_affected_profiles).toBe(1); // created by the other device
    expect(c.my_recovery_plans).toBe(1);
    expect(s.view(d2, mod.my_verifications as any).some((v: any) => v.property_id === propertyId && v.state === 'verified')).toBe(true);
    expect(s.view(d2, mod.my_property_privates as any)).toHaveLength(1);
    expect(read(d2).ok).toBe(true);
    // Owner-level writes work from the second device.
    s.call(d2, mod.save_affected_intake as any, { property_id: propertyId, intake_json: '{"personaId":"q"}' });
    void rid;

    s.call(d2, mod.sign_out_device as any, {});
    expect(counts(d2).my_property_reports).toBe(0);
    expect(read(d2).error).toBe('forbidden');
    expect(s.view(d2, mod.my_devices as any)).toHaveLength(0);
    expect(s.view(owner, mod.my_devices as any)).toHaveLength(1);
    expect(() => s.call(d2, mod.sign_out_device as any, {})).toThrow(/not_signed_in/);
  });

  it('properties belong to the account: signing out of the verifying device does not orphan them', () => {
    const { s, owner, counts, read, propertyId } = ownerWorld();
    enroll(s, owner);
    expect(s.h.db.account_property.count()).toBe(1n);
    s.call(owner, mod.sign_out_device as any, {});
    const d2 = s.user('d2');
    s.emailFlow(d2, EMAIL, 'signin');
    expect(counts(d2).my_property_reports).toBe(1);
    expect(read(d2).ok).toBe(true);
    expect(s.view(d2, mod.my_verifications as any).some((v: any) => v.property_id === propertyId && v.state === 'verified')).toBe(true);
    expect(s.view(d2, mod.my_property_privates as any)).toHaveLength(1);
    // the signed-out device keeps only what it verified itself (everything, with step-up off)
    expect(counts(owner).my_property_reports).toBe(1);
  });

  it('a verification completed AFTER enrolling binds to the account; a device that verified before signing in brings its property', () => {
    const { s, owner, counts, propertyId } = ownerWorld();
    enroll(s, owner);
    // second device verifies a different property while signed out, then signs in: its property joins the account
    const d2 = s.user('d2');
    const other = { line1: '900 Far Road', city: 'Dallas', state: 'TX', zip: '75201', lat: 32.9, lng: -96.797, normalized: 'x', source: 'census' };
    const v2 = s.verify(d2, other);
    s.emailFlow(d2, EMAIL, 'signin');
    expect(s.h.db.account_property.count()).toBe(2n);
    s.call(d2, mod.sign_out_device as any, {});
    const verifiedIds = new Set(s.view(owner, mod.my_verifications as any).filter((v: any) => v.state === 'verified').map((v: any) => v.property_id));
    expect(verifiedIds.has(v2.property_id) && verifiedIds.has(propertyId)).toBe(true);
    // a verification that completes while the device is signed in binds immediately
    const d3 = s.user('d3');
    s.emailFlow(d3, EMAIL, 'signin');
    const v3 = s.verify(d3, { ...other, line1: '1 New Place', lat: 33.1 });
    expect([...s.h.db.account_property.iter()].some(b => b.property_id === v3.property_id)).toBe(true);
    void counts;
  });

  it('does not reveal whether an email has an account', () => {
    const { s, owner } = ownerWorld();
    enroll(s, owner);
    const known = s.user('known');
    const unknown = s.user('unknown');
    s.advanceMs(31_000);
    const a = s.requestCode(known, EMAIL, 'signin');
    const b = s.requestCode(unknown, EMAIL2, 'signin');
    expect({ ...a, challenge_id: 0n }).toEqual({ ...b, challenge_id: 0n });
    const shape = (who: any) => {
      const ch = s.view(who, mod.my_email_challenge as any)[0];
      return { ...ch, id: 0n, expires_at: 0, hasCode: !!s.demoCode(who) };
    };
    const strip = (x: any) => ({ ...x, expires_at: 0 });
    expect(strip(shape(known))).toEqual(strip(shape(unknown)));
    // The decoy never verifies, whatever is typed (including the code shown on screen), and never links a device.
    const shown = s.demoCode(unknown)!;
    expect(s.verifyCode(unknown, b.challenge_id, shown)).toMatchObject({ ok: false, error: 'invalid_code', attempts_left: 4 });
    expect(s.view(unknown, mod.my_account as any)).toHaveLength(0);
    expect(s.verifyCode(known, a.challenge_id, s.demoCode(known)!).ok).toBe(true);
    // Same lockout behaviour for the decoy.
    for (let i = 0; i < 3; i++) s.verifyCode(unknown, b.challenge_id, '000000');
    expect(s.verifyCode(unknown, b.challenge_id, '000000')).toMatchObject({ ok: false, error: 'locked' });
  });

  it('brevo mode: a decoy sends nothing, a real signin sends once, and results look the same', () => {
    const { s, owner } = ownerWorld();
    enroll(s, owner);
    s.configureEmail('brevo', s.BREVO);
    const sent: { to: string; code: string; key: string }[] = [];
    let delays = 0;
    const deps: EmailDeps = { send: (_c, to, code, key) => (sent.push({ to, code, key }), { ok: true }), decoyDelay: () => void delays++ };
    const run = (who: any, email: string) => runRequestEmailCode(s.h.procedureContext(who), { email, purpose: 'signin' }, deps);
    s.advanceMs(31_000);
    const known = run(s.user('k'), EMAIL);
    const unknown = run(s.user('u'), 'Nobody@Example.net'); // decoy: unknown address
    expect(known.ok && unknown.ok).toBe(true);
    expect({ ...known, challenge_id: 0n }).toEqual({ ...unknown, challenge_id: 0n });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: NORM, key: `${known.challenge_id}-1` });
    expect(sent[0]!.code).toMatch(/^\d{6}$/);
    expect(delays).toBe(1);
    expect(s.h.db.email_challenge.id.find(known.challenge_id)!.delivery_state).toBe('sent');
    expect(s.h.db.email_challenge.id.find(unknown.challenge_id)!.delivery_state).toBe('sent');
    expect(s.h.db.email_challenge.id.find(unknown.challenge_id)!.decoy).toBe(true);
    expect([...s.h.db.email_challenge.iter()].every(c => c.email_plain === '')).toBe(true); // nothing kept, not even for the decoy
    expect(s.h.db.demo_code.count()).toBe(0n);
  });

  it('brevo mode: the code that was emailed verifies, and the same typed address is required again', () => {
    const { s, owner } = ownerWorld();
    enroll(s, owner);
    s.configureEmail('brevo', s.BREVO);
    let code = '';
    const deps: EmailDeps = { send: (_c, _to, c) => ((code = c), { ok: true }), decoyDelay: () => {} };
    const d2 = s.user('d2');
    s.advanceMs(31_000);
    // upper-case and padded typing of the same address reaches the same account
    const r = runRequestEmailCode(s.h.procedureContext(d2), { email: '  SAM.OWNER@EXAMPLE.COM', purpose: 'signin' }, deps);
    expect(r.ok).toBe(true);
    expect(s.verifyCode(d2, r.challenge_id, code)).toMatchObject({ ok: true, purpose: 'signin' });
    expect(s.view(d2, mod.my_account as any)).toHaveLength(1);
  });
});

describe('brevo delivery bookkeeping', () => {
  it('keeps the address only while sending; failure is non-fatal and recorded', () => {
    const { s, owner } = ownerWorld();
    s.configureEmail('brevo', s.BREVO);
    let during = '';
    const fail: EmailDeps = {
      send: () => {
        during = [...s.h.db.email_challenge.iter()][0]!.email_plain;
        return { ok: false, error: 'brevo:401:unauthorized' };
      },
      decoyDelay: () => {},
    };
    const r = runRequestEmailCode(s.h.procedureContext(owner), { email: EMAIL, purpose: 'enroll' }, fail);
    expect(r.ok).toBe(true);
    expect(during).toBe(NORM); // present only during the send
    const ch = s.h.db.email_challenge.id.find(r.challenge_id)!;
    expect(ch).toMatchObject({ email_plain: '', delivery_state: 'failed', delivery_error: 'brevo:401:unauthorized' });
    expect(s.view(owner, mod.my_email_challenge as any)[0]).toMatchObject({ delivery_state: 'failed', delivery_error: 'brevo:401:unauthorized' });
    expect(s.view(owner, mod.my_demo_code as any)).toHaveLength(0); // never in brevo mode
    s.advanceMs(31_000);
    const ok = runRequestEmailCode(s.h.procedureContext(owner), { email: EMAIL, purpose: 'enroll' }, { send: () => ({ ok: true }), decoyDelay: () => {} });
    expect(s.h.db.email_challenge.id.find(ok.challenge_id)!.delivery_state).toBe('sent');
    expect(s.h.db.email_challenge.id.find(ok.challenge_id)!.email_plain).toBe('');
    expect(s.h.db.email_challenge.id.find(r.challenge_id)!.consumed).toBe(true); // superseded
  });

  it('the tick purges a stale email address (> 15 min)', () => {
    const { s, owner } = ownerWorld();
    s.configureEmail('brevo', s.BREVO);
    s.call(s.internal, ((ctx: any) => {
      ctx.db.email_challenge.insert({
        id: 0n, identity: ctx.sender, purpose: 'signin', email_plain: NORM, email_hash: 'h', email_masked: 's***@example.com', salt: 's', code_hash: 'c',
        attempts: 0, expires_at: new (ctx.timestamp.constructor as any)(ctx.timestamp.microsSinceUnixEpoch + 3_600_000_000n), created_at: ctx.timestamp, consumed: false, delivery_state: 'pending',
        delivery_error: undefined, account_id: undefined, decoy: false, locked_at: undefined,
      });
    }) as any, {});
    void owner;
    s.advanceMs(14 * MIN);
    s.tick();
    expect([...s.h.db.email_challenge.iter()][0]!.email_plain).toBe(NORM);
    s.advanceMs(2 * MIN);
    s.tick();
    expect([...s.h.db.email_challenge.iter()].every(c => c.email_plain === '')).toBe(true);
  });
});

describe('sendEmailViaBrevo', () => {
  const cfg = { apiKey: 'xkeysib-SECRETSECRET', senderEmail: 'noreply@aftermath.example' };
  const res = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: () => body, text: () => JSON.stringify(body) });

  it('POSTs the documented URL, headers and body (plain text, simple html, no links, no tracking)', () => {
    const calls: any[] = [];
    const http = { fetch: (url: string, init: any) => (calls.push({ url, init }), res(201, { messageId: '<202611081200.1@smtp-relay.mailin.fr>' })) };
    expect(sendEmailViaBrevo(http, cfg, NORM, '123456', '12-1')).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(calls[0].url).toBe(BREVO_URL);
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers).toEqual({ 'api-key': 'xkeysib-SECRETSECRET', 'content-type': 'application/json', accept: 'application/json' });
    const body = JSON.parse(calls[0].init.body);
    expect(Object.keys(body).sort()).toEqual(['htmlContent', 'sender', 'subject', 'textContent', 'to']);
    expect(body.sender).toEqual({ name: 'Project Aftermath', email: 'noreply@aftermath.example' });
    expect(body.to).toEqual([{ email: NORM }]);
    expect(body.subject).toBe('Your Aftermath verification code');
    for (const text of [body.textContent, body.htmlContent]) {
      expect(text).toContain('123456');
      expect(text).toContain('expires in 10 minutes');
      expect(text).toContain('If you did not request this, ignore this email');
      expect(text).toContain('Demo identity check, not production-grade verification');
      expect(text).not.toMatch(/https?:|href=|<img|<a /i); // no links, no tracking pixels
    }
    expect(body.htmlContent).toMatch(/^<div/);
    expect(JSON.stringify(body)).not.toContain('xkeysib'); // the key travels only in the header
  });

  it('maps Brevo errors to brevo:<status>:<code> (401, 429, ...) and never keeps a body, a message or the key', () => {
    const fail = (status: number, body: unknown) => ({ fetch: () => res(status, body) });
    expect(sendEmailViaBrevo(fail(401, { code: 'unauthorized', message: 'Key not found: xkeysib-SECRETSECRET' }), cfg, NORM, '111111')).toEqual({ ok: false, error: 'brevo:401:unauthorized' });
    expect(sendEmailViaBrevo(fail(429, { code: 'too_many_requests', message: 'slow down' }), cfg, NORM, '111111')).toEqual({ ok: false, error: 'brevo:429:too_many_requests' });
    expect(sendEmailViaBrevo(fail(400, { code: 'invalid_parameter', message: NORM }), cfg, NORM, '111111')).toEqual({ ok: false, error: 'brevo:400:invalid_parameter' });
    expect(sendEmailViaBrevo(fail(403, { code: 'permission_denied' }), cfg, NORM, '111111')).toEqual({ ok: false, error: 'brevo:403:permission_denied' });
    // no usable code: status only
    expect(sendEmailViaBrevo(fail(500, 'oops'), cfg, NORM, '111111')).toEqual({ ok: false, error: 'brevo:500' });
    expect(sendEmailViaBrevo(fail(502, { code: 'has spaces and key xkeysib-SECRETSECRET' }), cfg, NORM, '111111')).toEqual({ ok: false, error: 'brevo:502' });
    expect(sendEmailViaBrevo({ fetch: () => ({ ok: false, status: 503, json: () => { throw new Error('not json'); }, text: () => 'x' }) }, cfg, NORM, '111111')).toEqual({ ok: false, error: 'brevo:503' });
    // network error
    const boom = { fetch: () => { throw new Error('xkeysib-SECRETSECRET exploded'); } };
    expect(sendEmailViaBrevo(boom, cfg, NORM, '111111')).toEqual({ ok: false, error: 'brevo:network' });
    for (const e of [fail(401, { code: 'unauthorized' }), boom]) {
      const out = JSON.stringify(sendEmailViaBrevo(e, cfg, NORM, '111111'));
      expect(out).not.toContain('SECRETSECRET');
      expect(out).not.toContain('example');
    }
  });

  describe('the real procedure through a mocked ctx.http (brevo mode)', () => {
    const brevoWorld = (reply: (req: any) => any) => {
      const w = ownerWorld();
      w.s.configureEmail('brevo', w.s.BREVO);
      const seen: any[] = [];
      const ctx = w.s.h
        .procedureContextBuilder(w.owner)
        .http((_t: any, req: any) => {
          seen.push(req);
          return reply(req);
        })
        .build();
      const r = (mod.request_email_code as any)(ctx, { email: EMAIL, purpose: 'enroll' });
      return { ...w, r, seen, ch: w.s.h.db.email_challenge.id.find(r.challenge_id)! };
    };
    const response = (code: number, body: unknown) =>
      ({ code, headers: { entries: [] }, version: { tag: 'Http11' }, body: typeof body === 'string' ? body : JSON.stringify(body) }) as any;

    it('201: delivery_state sent, address cleared, exactly one call to Brevo', () => {
      const { r, seen, ch, s, owner } = brevoWorld(() => response(201, { messageId: '<abc>' }));
      expect(r).toMatchObject({ ok: true, error: '' });
      expect(seen).toHaveLength(1);
      expect(seen[0].uri).toBe('https://api.brevo.com/v3/smtp/email');
      expect(ch).toMatchObject({ delivery_state: 'sent', email_plain: '' });
      expect(ch.delivery_error).toBeUndefined();
      expect(s.view(owner, mod.my_demo_code as any)).toHaveLength(0);
    });

    it('401: failed with brevo:401:unauthorized, no throw, address cleared', () => {
      const { r, ch } = brevoWorld(() => response(401, { code: 'unauthorized', message: 'Key not found' }));
      expect(r.ok).toBe(true);
      expect(ch).toMatchObject({ delivery_state: 'failed', delivery_error: 'brevo:401:unauthorized', email_plain: '' });
    });

    it('429: failed with brevo:429:too_many_requests', () => {
      const { r, ch } = brevoWorld(() => response(429, { code: 'too_many_requests', message: 'Rate limit' }));
      expect(r.ok).toBe(true);
      expect(ch).toMatchObject({ delivery_state: 'failed', delivery_error: 'brevo:429:too_many_requests', email_plain: '' });
    });

    it('network error: failed with brevo:network, address cleared', () => {
      const { r, ch } = brevoWorld(() => {
        throw new Error('connection refused');
      });
      expect(r.ok).toBe(true);
      expect(ch).toMatchObject({ delivery_state: 'failed', delivery_error: 'brevo:network', email_plain: '' });
    });

    it('a full address never appears in any stored row after the send', () => {
      const { s } = brevoWorld(() => response(201, { messageId: '<abc>' }));
      const all = json([...s.h.db.email_challenge.iter()]) + json([...s.h.db.account.iter()]) + json([...s.h.db.demo_code.iter()]);
      expect(all).not.toContain('sam.owner');
    });

    it('decoy signin for an unknown email makes no Brevo call and looks the same', () => {
      const { s, owner } = ownerWorld();
      enroll(s, owner);
      s.configureEmail('brevo', s.BREVO);
      s.advanceMs(31_000);
      const seen: any[] = [];
      const known = s.user('known');
      const unknown = s.user('unknown');
      const mk = (who: any) => s.h.procedureContextBuilder(who).http((_t: any, req: any) => (seen.push(req), response(201, { messageId: '<x>' }))).build();
      const a = (mod.request_email_code as any)(mk(known), { email: EMAIL, purpose: 'signin' });
      const b = (mod.request_email_code as any)(mk(unknown), { email: 'ghost@example.net', purpose: 'signin' });
      expect({ ...a, challenge_id: 0n }).toEqual({ ...b, challenge_id: 0n });
      expect(seen).toHaveLength(1); // only the known address was emailed
      const shape = (id: bigint) => { const c = s.h.db.email_challenge.id.find(id)!; return { delivery_state: c.delivery_state, email_plain: c.email_plain, attempts: c.attempts }; };
      expect(shape(a.challenge_id)).toEqual(shape(b.challenge_id));
    });
  });
});

describe('step-up gating (email_config.require_stepup)', () => {
  it('off by default: owners without an account keep full access', () => {
    const { s, owner, counts, read } = ownerWorld();
    expect(s.view(owner, mod.my_stepup as any)[0]).toMatchObject({ linked: false, active: false, require_stepup: false });
    for (const v of Object.values(counts(owner))) expect(v).toBeGreaterThan(0);
    expect(read(owner).ok).toBe(true);
  });

  it('on: no account = no full report; enrolling or step-up restores it; expiry removes it after the tick', () => {
    const { s, owner, counts, read, GATED } = ownerWorld();
    s.configureEmail('demo', { require_stepup: true });
    expect(s.view(owner, mod.my_stepup as any)[0]).toMatchObject({ require_stepup: true, linked: false });
    for (const n of GATED) expect(counts(owner)[n], n).toBe(0);
    expect(read(owner).error).toBe('stepup_required');
    // Ownership surfaces that are not report detail stay visible so the UI can push to enroll.
    expect(s.view(owner, mod.my_verifications as any)).toHaveLength(1);
    expect(s.view(owner, mod.my_property_privates as any)).toHaveLength(1);

    enroll(s, owner);
    for (const n of GATED) expect(counts(owner)[n], n).toBeGreaterThan(0);
    expect(read(owner).ok).toBe(true);

    // 16 minutes later with no tick: views can't see the clock, but read_blob (a procedure) can.
    s.advanceMs(16 * MIN);
    expect(read(owner).error).toBe('stepup_required');
    expect(counts(owner).my_property_reports).toBe(1);
    s.tick();
    for (const n of GATED) expect(counts(owner)[n], n).toBe(0);
    expect(s.view(owner, mod.my_stepup as any)[0]).toMatchObject({ linked: true, active: false });

    // Step-up: the email must be typed again and must match.
    expect(s.requestCode(owner, EMAIL2, 'stepup')).toMatchObject({ ok: false, error: 'email_mismatch' });
    const res = s.emailFlow(owner, EMAIL, 'stepup');
    expect(res).toMatchObject({ ok: true, purpose: 'stepup' });
    for (const n of GATED) expect(counts(owner)[n], n).toBeGreaterThan(0);
    expect(read(owner).ok).toBe(true);
  });

  it('on: a device that signs in gets a step-up window and the account properties', () => {
    const { s, owner, counts } = ownerWorld();
    enroll(s, owner);
    s.configureEmail('demo', { require_stepup: true });
    const d2 = s.user('d2');
    expect(counts(d2).my_property_reports).toBe(0);
    s.emailFlow(d2, EMAIL, 'signin');
    expect(counts(d2).my_property_reports).toBe(1);
    s.advanceMs(16 * MIN);
    s.tick();
    expect(counts(d2).my_property_reports).toBe(0);
    expect(s.view(d2, mod.my_devices as any)).toHaveLength(2); // still signed in, just no step-up
  });

  it('step-up needs a signed-in device', () => {
    const { s, owner } = ownerWorld();
    expect(s.requestCode(owner, EMAIL, 'stepup')).toMatchObject({ ok: false, error: 'not_signed_in' });
  });

  it('toggling require_stepup re-evaluates immediately (config row change)', () => {
    const { s, owner, counts } = ownerWorld();
    s.configureEmail('demo', { require_stepup: true });
    expect(counts(owner).my_property_reports).toBe(0);
    s.configureEmail('demo', { require_stepup: false });
    expect(counts(owner).my_property_reports).toBe(1);
  });
});

describe('devices and account deletion', () => {
  function twoDevices() {
    const w = ownerWorld();
    enroll(w.s, w.owner);
    const d2 = w.s.user('d2');
    w.s.emailFlow(d2, EMAIL, 'signin');
    return { ...w, d2 };
  }

  it('remove_device removes another device of the same account only', () => {
    const { s, owner, d2 } = twoDevices();
    const stranger = s.user('stranger');
    const hexOwner = s.idOf(owner).toHexString();
    expect(() => s.call(stranger, mod.remove_device as any, { identity_hex: s.idOf(d2).toHexString() })).toThrow(/not_signed_in/);
    // another account's device is not removable
    const o3 = s.user('o3');
    s.verify(o3);
    s.advanceMs(2000);
    s.emailFlow(o3, EMAIL2, 'enroll');
    expect(() => s.call(o3, mod.remove_device as any, { identity_hex: hexOwner })).toThrow(/device not found/);
    expect(() => s.call(owner, mod.remove_device as any, { identity_hex: 'zz' })).toThrow(/invalid identity hex/);
    s.call(owner, mod.remove_device as any, { identity_hex: s.idOf(d2).toHexString() });
    expect(s.view(owner, mod.my_devices as any)).toHaveLength(1);
    expect(s.view(d2, mod.my_account as any)).toHaveLength(0);
    expect(s.view(d2, mod.my_property_reports as any)).toHaveLength(0);
  });

  it('set_device_label validates and renames', () => {
    const { s, owner } = twoDevices();
    expect(s.view(owner, mod.my_devices as any)[0].label).toMatch(/^Device /);
    s.call(owner, mod.set_device_label as any, { label: ' Roselyn iPhone ' });
    expect(s.view(owner, mod.my_devices as any).find((d: any) => d.is_current).label).toBe('Roselyn iPhone');
    expect(() => s.call(owner, mod.set_device_label as any, { label: '' })).toThrow(/1-40/);
    expect(() => s.call(s.user('x'), mod.set_device_label as any, { label: 'a' })).toThrow(/not_signed_in/);
  });

  it('delete_account removes the account, all devices and challenges but keeps verifications and report data', () => {
    const { s, owner, d2, propertyId, counts } = twoDevices();
    s.requestCode(d2, EMAIL, 'stepup');
    s.call(owner, mod.delete_account as any, {});
    expect(s.h.db.account.count()).toBe(0n);
    expect(s.h.db.account_device.count()).toBe(0n);
    expect(s.h.db.account_property.count()).toBe(0n);
    expect(s.h.db.email_challenge.count()).toBe(0n);
    expect(s.h.db.demo_code.count()).toBe(0n);
    expect(s.view(d2, mod.my_account as any)).toHaveLength(0);
    // The owner device keeps what it verified itself; the second device only ever had account access.
    expect([...s.h.db.verification.iter()].filter(v => v.state === 'verified')).toHaveLength(1);
    expect(counts(owner).my_property_reports).toBe(1);
    expect(counts(d2).my_property_reports).toBe(0);
    expect(s.view(owner, mod.my_verifications as any).some((v: any) => v.property_id === propertyId)).toBe(true);
    expect(() => s.call(owner, mod.delete_account as any, {})).toThrow(/not_signed_in/);
    // the email can be enrolled again
    s.advanceMs(2000);
    expect(s.emailFlow(owner, EMAIL, 'enroll').ok).toBe(true);
  });
});

describe('privacy', () => {
  it('no view ever returns an email address, a code hash, a salt, a pepper or a key; demo code only to its requester in demo mode', () => {
    const { s, owner } = ownerWorld();
    s.configureEmail('demo', s.BREVO);
    const r = s.requestCode(owner, EMAIL, 'enroll');
    const code = s.demoCode(owner)!;
    const other = s.user('other');
    expect(s.demoCode(other)).toBeUndefined();
    expect(s.view(s.internal, mod.my_demo_code as any)).toHaveLength(0);
    s.verifyCode(owner, r.challenge_id, code);
    s.advanceMs(31_000);
    const d2 = s.user('d2');
    s.requestCode(d2, EMAIL, 'signin');
    const secrets = [
      'sam.owner', NORM, s.BREVO.brevo_api_key, s.BREVO.sender_email,
      s.h.db.email_config.id.find(0)!.hash_pepper,
      ...[...s.h.db.email_challenge.iter()].flatMap(c => [c.code_hash, c.salt, c.email_hash]),
      ...[...s.h.db.account.iter()].map(a => a.email_hash),
    ];
    const views = Object.keys(mod).filter(n => /^(my_|svc_|web_|admin_email)/.test(n));
    for (const who of [owner, d2, other, s.worker, s.internal]) {
      for (const name of views) {
        const out = json(s.view(who, (mod as any)[name]));
        for (const sec of secrets) expect(out, `${name} leaks ${sec.slice(0, 6)}`).not.toContain(sec);
      }
    }
    // the on-screen code exists only while its challenge is open
    expect(s.demoCode(d2)).toMatch(/^\d{6}$/);
    s.configureEmail('brevo', s.BREVO);
    expect(s.demoCode(d2)).toBeUndefined();
  });

  it('account_maintenance rejects clients and accepts the scheduler', () => {
    const s = setup();
    const arg = { arg: { scheduled_id: 1n, scheduled_at: { tag: 'Interval', value: 0n } } };
    expect(() => s.call(s.user('alice'), mod.account_maintenance as any, arg)).toThrow(/scheduled only/);
    expect(() => s.call(s.worker, mod.account_maintenance as any, arg)).toThrow(/scheduled only/);
    expect(() => s.call(s.internal, mod.account_maintenance as any, arg)).not.toThrow();
  });

  it('init and the first config call schedule the 60 s tick exactly once', () => {
    const s = setup();
    expect(s.h.db.account_tick.count()).toBe(1n);
    s.configureEmail('demo');
    s.configureEmail('demo');
    expect(s.h.db.account_tick.count()).toBe(1n);
  });
});

function HOUR() {
  return 60 * MIN + 1000;
}
