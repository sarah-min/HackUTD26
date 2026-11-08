// Email-code flows (not exported from index.ts: only reducers/procedures/views may be). The procedures in
// reducers/accounts.ts are thin wrappers so tests can inject the email sender.
//
// Why procedures and not reducers: a reducer that throws rolls EVERYTHING back, including the failed-attempt counter,
// so verify_email_code must return its outcome instead of throwing. request_email_code needs ctx.http for Brevo.
//
// Design notes (see CONTRACTS.md §5.3):
// - The full email address is never stored on an account. It lives in email_challenge.email_plain only while a send is in
//   flight (cleared right after the send attempt; the tick also clears anything older than 15 min).
// - email_hash = sha256(pepper + normalized email). Codes are 6 digits derived from sha256(secret pepper + ctx.random bytes + uuid + ...).
//   ctx.random is the only randomness source in a module and it is seeded from the call timestamp (NOT cryptographically
//   secret), so the code is never taken from it directly: the secret pepper and per-challenge salt make it unguessable
//   to a client, and 5 wrong tries lock the address for 15 minutes.
// - signin never reveals whether an email has an account: an unknown email gets a decoy challenge that looks identical
//   (same result, same my_email_challenge row, same my_demo_code in demo mode, nothing sent) and can never verify.
import type { ProcedureCtx, TransactionCtx } from 'spacetimedb/server';
import { accountIdOf, verifiedPropertyIds } from './auth';
import { type S } from './constants';
import {
  CHALLENGE_KEEP_MICROS,
  CODE_TTL_MICROS,
  MAX_CODE_ATTEMPTS,
  EMAIL_LOCK_MICROS,
  PURPOSES,
  RESEND_COOLDOWN_MICROS,
  SENDS_PER_IDENTITY_PER_HOUR,
  SENDS_PER_EMAIL_PER_HOUR,
  STEPUP_TTL_MICROS,
  type Purpose,
} from './account_constants';
import { HOUR_MICROS } from './constants';
import { closeChallenge, ensureAccountTick } from './account_maintenance';
import { bindVerifiedProperties } from './account_bind';
import { normalizeEmail, maskEmail } from './email';
import { TimeDuration } from 'spacetimedb';
import { constantTimeEqual, sha256Hex } from './sha256';
import { sendEmailViaBrevo, type BrevoConfig, type EmailResult } from './email_brevo';
import { tsFromMicros } from './values';

export type PCtx = ProcedureCtx<S>;
export type TxCtx = TransactionCtx<S>;

export type RequestResult = { ok: boolean; error: string; challenge_id: bigint; retry_after_s: number };
export type VerifyResult = { ok: boolean; error: string; attempts_left: number; purpose: string };

export type EmailDeps = {
  /** Sends one email with the code (brevo mode only). Never throws. Tests inject a fake. */
  send: (cfg: BrevoConfig, to: string, code: string, idemKey: string) => EmailResult;
  /** Called for decoy signin challenges in brevo mode so timing doesn't reveal that no email was sent. */
  decoyDelay: () => void;
};

export function defaultDeps(ctx: PCtx): EmailDeps {
  return {
    send: (cfg, to, code, idemKey) => {
      try {
        return sendEmailViaBrevo(ctx.http, cfg, to, code, idemKey);
      } catch {
        return { ok: false, error: 'send:exception' };
      }
    },
    decoyDelay: () => {
      try {
        // ~ the time of a real single-call send
        ctx.sleep(TimeDuration.fromMillis(500));
      } catch {
        // best effort only
      }
    },
  };
}

const retry = (micros: bigint) => Math.max(1, Math.ceil(Number(micros) / 1_000_000));

export function hex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

export function emailHash(pepper: string, normalized: string): string {
  return sha256Hex(`${pepper}${normalized}`);
}

function codeHash(salt: string, code: string): string {
  return sha256Hex(`${salt}:${code}`);
}

// ------------------------------------------------------------------------------------------------ request

type Prepared =
  | { ok: false; error: string; retry_after_s?: number }
  | {
      ok: true;
      challengeId: bigint;
      mode: string;
      decoy: boolean;
      send?: { cfg: BrevoConfig; to: string; code: string };
    };

function prepare(tx: TxCtx, email: string, purposeRaw: string): Prepared {
  const db = tx.db;
  const cfg = db.email_config.id.find(0);
  if (!cfg) return { ok: false, error: 'email_not_configured' };
  if (!(PURPOSES as readonly string[]).includes(purposeRaw)) return { ok: false, error: 'invalid_purpose' };
  const purpose = purposeRaw as Purpose;
  const normalized = normalizeEmail(email);
  if (!normalized) return { ok: false, error: 'invalid_email' };
  const pHash = emailHash(cfg.hash_pepper, normalized);
  const now = tx.timestamp.microsSinceUnixEpoch;
  const me = tx.sender;
  ensureAccountTick(db);

  // Lockout after too many wrong codes (applies to every challenge for the address, any identity).
  for (const c of db.email_challenge.email_hash.filter(pHash)) {
    if (c.locked_at && now - c.locked_at.microsSinceUnixEpoch < EMAIL_LOCK_MICROS) {
      return { ok: false, error: 'locked', retry_after_s: retry(EMAIL_LOCK_MICROS - (now - c.locked_at.microsSinceUnixEpoch)) };
    }
  }

  // Purpose-specific eligibility.
  let accountId: bigint | undefined;
  let decoy = false;
  const linked = accountIdOf(db, me);
  if (purpose === 'enroll') {
    if (linked !== undefined) return { ok: false, error: 'already_signed_in' };
    if (verifiedPropertyIds(db, me).size === 0) return { ok: false, error: 'not_verified_owner' };
    // Enrolling is only offered to verified owners, so telling them "this email already has an account" is acceptable.
    if (db.account.email_hash.find(pHash)) return { ok: false, error: 'email_already_registered' };
  } else if (purpose === 'signin') {
    if (linked !== undefined) return { ok: false, error: 'already_signed_in' };
    const acct = db.account.email_hash.find(pHash);
    if (acct) accountId = acct.id;
    else decoy = true; // respond identically, send nothing
  } else {
    // stepup: the address is not stored, so the user must type it again and it must match the account's hash.
    if (linked === undefined) return { ok: false, error: 'not_signed_in' };
    const acct = db.account.id.find(linked);
    if (!acct || acct.email_hash !== pHash) return { ok: false, error: 'email_mismatch' };
    accountId = acct.id;
  }

  // Rate limits. Decoys count toward the per-email / per-identity limits exactly like real sends.
  let perEmail = 0;
  let perIdentity = 0;
  let lastAt = 0n;
  for (const c of db.email_challenge.email_hash.filter(pHash)) {
    const at = c.created_at.microsSinceUnixEpoch;
    if (now - at < HOUR_MICROS) perEmail++;
    if (at > lastAt) lastAt = at;
  }
  for (const c of db.email_challenge.identity.filter(me)) {
    const at = c.created_at.microsSinceUnixEpoch;
    if (now - at < HOUR_MICROS) perIdentity++;
    if (at > lastAt) lastAt = at;
  }
  if (lastAt > 0n && now - lastAt < RESEND_COOLDOWN_MICROS) {
    return { ok: false, error: 'cooldown', retry_after_s: retry(RESEND_COOLDOWN_MICROS - (now - lastAt)) };
  }
  if (perEmail >= SENDS_PER_EMAIL_PER_HOUR) return { ok: false, error: 'rate_limited_email' };
  if (perIdentity >= SENDS_PER_IDENTITY_PER_HOUR) return { ok: false, error: 'rate_limited_identity' };
  // Global daily cap (credit protection): rolling 24 h of real (non-decoy) challenges. Decoys are checked too, so the
  // answer doesn't depend on whether the email exists, but they are not counted.
  let today = 0;
  for (const c of db.email_challenge.iter()) {
    if (!c.decoy && now - c.created_at.microsSinceUnixEpoch < CHALLENGE_KEEP_MICROS) today++;
  }
  if (today >= cfg.daily_send_cap) return { ok: false, error: 'daily_cap' };

  // Supersede this identity's earlier open challenges.
  for (const c of [...db.email_challenge.identity.filter(me)]) if (!c.consumed) closeChallenge(db, c);

  // Fresh code.
  const rnd = hex(tx.random.fill(new Uint8Array(32)));
  const uuid = tx.newUuidV4().toString();
  const salt = sha256Hex(`salt:${uuid}:${rnd}`).slice(0, 32);
  const n = parseInt(sha256Hex(`code:${cfg.hash_pepper}:${rnd}:${uuid}:${me.toHexString()}:${now}`).slice(0, 12), 16);
  const code = String(n % 1_000_000).padStart(6, '0');

  const demo = cfg.mode === 'demo';
  const real = !demo && !decoy;
  const row = db.email_challenge.insert({
    id: 0n,
    identity: me,
    purpose,
    email_plain: real ? normalized : '',
    email_hash: pHash,
    email_masked: maskEmail(normalized),
    salt,
    code_hash: codeHash(salt, code),
    attempts: 0,
    expires_at: tsFromMicros(tx, now + CODE_TTL_MICROS),
    created_at: tx.timestamp,
    consumed: false,
    delivery_state: demo ? 'demo' : real ? 'pending' : 'sent',
    delivery_error: undefined,
    account_id: accountId,
    decoy,
    locked_at: undefined,
  });
  if (demo) db.demo_code.insert({ challenge_id: row.id, identity: me, code, created_at: tx.timestamp });

  if (real) {
    return {
      ok: true,
      challengeId: row.id,
      mode: cfg.mode,
      decoy,
      send: {
        cfg: { apiKey: cfg.brevo_api_key, senderEmail: cfg.sender_email },
        to: normalized,
        code,
      },
    };
  }
  return { ok: true, challengeId: row.id, mode: cfg.mode, decoy };
}

export function runRequestEmailCode(
  ctx: PCtx,
  args: { email: string; purpose: string },
  deps: EmailDeps
): RequestResult {
  const p = ctx.withTx(tx => prepare(tx, args.email, args.purpose));
  if (!p.ok) return { ok: false, error: p.error, challenge_id: 0n, retry_after_s: p.retry_after_s ?? 0 };

  if (p.send) {
    // Outside any transaction: the HTTP calls can take seconds.
    const res = deps.send(p.send.cfg, p.send.to, p.send.code, `${p.challengeId}-1`);
    ctx.withTx(tx => {
      const ch = tx.db.email_challenge.id.find(p.challengeId);
      if (!ch) return;
      tx.db.email_challenge.id.update({
        ...ch,
        email_plain: '', // never kept past the send
        delivery_state: res.ok ? 'sent' : 'failed',
        delivery_error: res.ok ? undefined : res.error.slice(0, 120),
      });
    });
  } else if (p.decoy && p.mode === 'brevo') {
    deps.decoyDelay();
  }
  return { ok: true, error: '', challenge_id: p.challengeId, retry_after_s: 0 };
}

// ------------------------------------------------------------------------------------------------ verify

function defaultLabel(identityHex: string): string {
  return `Device ${identityHex.slice(0, 6)}`;
}

/** Links (or refreshes) the caller's device on an account and starts a step-up window. */
function linkDevice(tx: TxCtx, accountId: bigint): void {
  const now = tx.timestamp.microsSinceUnixEpoch;
  const stepup = tsFromMicros(tx, now + STEPUP_TTL_MICROS);
  const existing = tx.db.account_device.identity.find(tx.sender);
  if (existing) {
    tx.db.account_device.identity.update({ ...existing, account_id: accountId, last_seen_at: tx.timestamp, stepup_until: stepup });
  } else {
    tx.db.account_device.insert({
      identity: tx.sender,
      account_id: accountId,
      label: defaultLabel(tx.sender.toHexString()),
      linked_at: tx.timestamp,
      last_seen_at: tx.timestamp,
      stepup_until: stepup,
    });
  }
}

export function runVerifyEmailCode(ctx: PCtx, args: { challenge_id: bigint; code: string }): VerifyResult {
  return ctx.withTx(tx => {
    const db = tx.db;
    const now = tx.timestamp.microsSinceUnixEpoch;
    const out = (ok: boolean, error: string, left = 0, purpose = ''): VerifyResult => ({ ok, error, attempts_left: left, purpose });
    const ch = db.email_challenge.id.find(args.challenge_id);
    if (!ch || !ch.identity.isEqual(tx.sender)) return out(false, 'not_found');
    if (ch.locked_at) return out(false, 'locked', 0, ch.purpose);
    if (ch.consumed) return out(false, 'expired', 0, ch.purpose);
    if (now >= ch.expires_at.microsSinceUnixEpoch) {
      closeChallenge(db, ch);
      return out(false, 'expired', 0, ch.purpose);
    }
    // Address-level lock from another challenge for the same email.
    for (const c of db.email_challenge.email_hash.filter(ch.email_hash)) {
      if (c.locked_at && now - c.locked_at.microsSinceUnixEpoch < EMAIL_LOCK_MICROS) return out(false, 'locked', 0, ch.purpose);
    }

    const attempts = ch.attempts + 1;
    const code = args.code.trim();
    const match =
      !ch.decoy && /^\d{6}$/.test(code) && constantTimeEqual(codeHash(ch.salt, code), ch.code_hash);
    if (!match) {
      if (attempts >= MAX_CODE_ATTEMPTS) {
        closeChallenge(db, { ...ch, attempts }, { locked_at: tx.timestamp });
        return out(false, 'locked', 0, ch.purpose);
      }
      db.email_challenge.id.update({ ...ch, attempts });
      return out(false, 'invalid_code', MAX_CODE_ATTEMPTS - attempts, ch.purpose);
    }

    // Correct code. Re-check eligibility (state may have changed since the request), then act.
    const linked = accountIdOf(db, tx.sender);
    if (ch.purpose === 'enroll') {
      if (linked !== undefined) return out(false, 'already_signed_in', 0, ch.purpose);
      if (verifiedPropertyIds(db, tx.sender).size === 0) return out(false, 'not_verified_owner', 0, ch.purpose);
      if (db.account.email_hash.find(ch.email_hash)) return out(false, 'email_already_registered', 0, ch.purpose);
      const acct = db.account.insert({
        id: 0n,
        email_hash: ch.email_hash,
        email_masked: ch.email_masked,
        created_at: tx.timestamp,
        last_login_at: tx.timestamp,
      });
      linkDevice(tx, acct.id);
      bindVerifiedProperties(db, acct.id, tx.sender, tx.timestamp, true);
    } else if (ch.purpose === 'signin') {
      const acct = ch.account_id !== undefined ? db.account.id.find(ch.account_id) : undefined;
      if (!acct) return out(false, 'invalid_code', 0, ch.purpose);
      if (linked !== undefined && linked !== acct.id) return out(false, 'already_signed_in', 0, ch.purpose);
      db.account.id.update({ ...acct, last_login_at: tx.timestamp });
      linkDevice(tx, acct.id);
      bindVerifiedProperties(db, acct.id, tx.sender, tx.timestamp, true); // a device that was already verified brings its properties
    } else {
      const dev = db.account_device.identity.find(tx.sender);
      const acct = dev ? db.account.id.find(dev.account_id) : undefined;
      if (!dev || !acct) return out(false, 'not_signed_in', 0, ch.purpose);
      if (acct.email_hash !== ch.email_hash) return out(false, 'email_mismatch', 0, ch.purpose);
      linkDevice(tx, acct.id);
    }
    closeChallenge(db, { ...ch, attempts });
    return out(true, '', MAX_CODE_ATTEMPTS - attempts, ch.purpose);
  });
}
