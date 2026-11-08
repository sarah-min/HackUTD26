// Recovery-code account flows (not exported from index.ts: only reducers/procedures/views may be). The procedures in
// reducers/accounts.ts are thin wrappers around these functions.
//
// Why procedures and not reducers: a reducer that throws rolls EVERYTHING back, including the failed-attempt ledger row, so
// every expected failure is RETURNED ({ ok: false, error, ... }) and the transaction commits.
//
// Design notes (CONTRACTS.md §5.3):
// - The browser generates the 100-bit code. The module only ever stores recovery_hash = sha256(pepper + normalized code).
//   The pepper is a domain separator, NOT a secret (timestamp-seeded RNG): the 100-bit code is the protection.
// - ANY failed code check returns the same error 'invalid_code' (never "close", never "no such account"). Failures are
//   recorded in code_attempt: 5 per identity per 15 min -> 'locked'. There is NO global cap (identities are free to mint, so
//   one would be a lockout DoS). Only failures count and a success does NOT delete them (they age out), so alternating wrong
//   guesses with a valid call cannot reset the lock. A locked identity cannot succeed either.
// - A malformed / weak / over-long code can never match, so it returns 'invalid_code' without spending an attempt.
// - sign_in_with_code is INHERIT-ONLY: the device gets the account's properties, it never binds its own into the account.
//   Binding the device's verified properties happens only in create_account and when a linked device completes a verification.
import type { ProcedureCtx, TransactionCtx } from 'spacetimedb/server';
import { accountIdOf, verifiedPropertyIds } from './auth';
import type { S } from './constants';
import { ATTEMPT_WINDOW_MICROS, MAX_CODE_ATTEMPTS, STEPUP_TTL_MICROS } from './account_constants';
import { ensureAccountTick } from './account_maintenance';
import { bindVerifiedProperties } from './account_bind';
import { hex, isRecoveryCodeShape, normalizeRecoveryCode, recoveryHash } from './recovery_code';
import { constantTimeEqual, sha256Hex } from './sha256';
import { tsFromMicros } from './values';

export type PCtx = ProcedureCtx<S>;
export type TxCtx = TransactionCtx<S>;

export type CodeResult = { ok: boolean; error: string; retry_after_s: number; attempts_left: number };

const retry = (micros: bigint) => Math.max(1, Math.ceil(Number(micros) / 1_000_000));

/** The single config row, created lazily with the per-database pepper (a domain separator, not a secret; never rotated, never shown). */
export function getAccountConfig(tx: TxCtx) {
  ensureAccountTick(tx.db); // self-heals a missing 60 s tick row
  const cur = tx.db.account_config.id.find(0);
  if (cur && cur.hash_pepper) return cur;
  const hash_pepper = sha256Hex(
    `pepper:${hex(tx.random.fill(new Uint8Array(32)))}:${tx.newUuidV4().toString()}:${tx.sender.toHexString()}:${tx.timestamp.microsSinceUnixEpoch}`
  );
  if (cur) return tx.db.account_config.id.update({ ...cur, hash_pepper });
  return tx.db.account_config.insert({ id: 0, accounts_enabled: true, require_stepup: false, hash_pepper });
}

function recentFailures(tx: TxCtx, now: bigint) {
  return [...tx.db.code_attempt.identity.filter(tx.sender)]
    .map(a => a.at.microsSinceUnixEpoch)
    .filter(at => now - at < ATTEMPT_WINDOW_MICROS)
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)); // newest first
}

const lockedResult = (fails: bigint[], now: bigint): CodeResult => ({
  ok: false,
  error: 'locked',
  retry_after_s: retry(fails[MAX_CODE_ATTEMPTS - 1]! + ATTEMPT_WINDOW_MICROS - now),
  attempts_left: 0,
});

/** Returns a refusal when THIS identity is locked (5 failures in 15 min), else null. Nothing global: see the header. */
function limited(tx: TxCtx, now: bigint): CodeResult | null {
  const mine = recentFailures(tx, now);
  return mine.length >= MAX_CODE_ATTEMPTS ? lockedResult(mine, now) : null;
}

/** Records one failed attempt and returns the caller-visible failure (invalid_code, or locked on the 5th). */
function failure(tx: TxCtx, error = 'invalid_code'): CodeResult {
  const now = tx.timestamp.microsSinceUnixEpoch;
  tx.db.code_attempt.insert({ id: 0n, identity: tx.sender, at: tx.timestamp });
  const mine = recentFailures(tx, now);
  if (mine.length >= MAX_CODE_ATTEMPTS) return lockedResult(mine, now);
  return { ok: false, error, retry_after_s: 0, attempts_left: MAX_CODE_ATTEMPTS - mine.length };
}

/** A failure that spends no attempt (the code could never have matched). */
function freeFailure(tx: TxCtx, error: string): CodeResult {
  const left = MAX_CODE_ATTEMPTS - recentFailures(tx, tx.timestamp.microsSinceUnixEpoch).length;
  return { ok: false, error, retry_after_s: 0, attempts_left: Math.max(0, left) };
}

/** A success deliberately keeps the identity's failure rows (they age out of the 15 min window on their own). */
function success(): CodeResult {
  return { ok: true, error: '', retry_after_s: 0, attempts_left: MAX_CODE_ATTEMPTS };
}

const refuse = (error: string): CodeResult => ({ ok: false, error, retry_after_s: 0, attempts_left: 0 });

function defaultLabel(identityHex: string): string {
  return `Device ${identityHex.slice(0, 6)}`;
}

/** Links (or refreshes) the caller's device on an account and starts a 15-minute step-up window. */
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

/** create_account: a verified owner with no account picks a browser-generated code. */
export function runCreateAccount(ctx: PCtx, args: { recovery_code: string }): CodeResult {
  return ctx.withTx(tx => {
    const db = tx.db;
    const now = tx.timestamp.microsSinceUnixEpoch;
    const cfg = getAccountConfig(tx);
    if (!cfg.accounts_enabled) return refuse('accounts_disabled');
    const lim = limited(tx, now);
    if (lim) return lim;
    if (accountIdOf(db, tx.sender) !== undefined) return refuse('already_signed_in');
    if (verifiedPropertyIds(db, tx.sender).size === 0) return refuse('not_verified_owner');
    if (!isRecoveryCodeShape(args.recovery_code)) return freeFailure(tx, 'invalid_code');
    const h = recoveryHash(cfg.hash_pepper, normalizeRecoveryCode(args.recovery_code));
    // A duplicate hash would be a probe of other people's codes (or a one-in-2^100 collision): it costs an attempt.
    if (db.account.recovery_hash.find(h)) return failure(tx, 'code_taken'); // still the only place 'code_taken' is visible: create_account
    const acct = db.account.insert({ id: 0n, recovery_hash: h, created_at: tx.timestamp, last_login_at: tx.timestamp, replaced_at: undefined });
    linkDevice(tx, acct.id);
    bindVerifiedProperties(db, acct.id, tx.sender, tx.timestamp, true);
    return success();
  });
}

/** sign_in_with_code: any identity holding the code links as a device. */
export function runSignInWithCode(ctx: PCtx, args: { recovery_code: string }): CodeResult {
  return ctx.withTx(tx => {
    const db = tx.db;
    const now = tx.timestamp.microsSinceUnixEpoch;
    const cfg = getAccountConfig(tx);
    if (!cfg.accounts_enabled) return refuse('accounts_disabled');
    const lim = limited(tx, now);
    if (lim) return lim;
    if (!isRecoveryCodeShape(args.recovery_code)) return freeFailure(tx, 'invalid_code');
    const acct = db.account.recovery_hash.find(recoveryHash(cfg.hash_pepper, normalizeRecoveryCode(args.recovery_code)));
    if (!acct) return failure(tx);
    const linked = accountIdOf(db, tx.sender);
    if (linked !== undefined && linked !== acct.id) return refuse('already_signed_in'); // the caller holds a valid code here
    db.account.id.update({ ...acct, last_login_at: tx.timestamp });
    linkDevice(tx, acct.id);
    // Inherit-only: NO bindVerifiedProperties here. A victim tricked into signing in with someone else's code must not
    // push its own verified properties into that account. A valid sign-in lifts this device's revocation.
    db.device_revocation.identity.delete(tx.sender);
    return success();
  });
}

/** The caller's linked device + account, or undefined. */
function mine(tx: TxCtx) {
  const dev = tx.db.account_device.identity.find(tx.sender);
  const acct = dev ? tx.db.account.id.find(dev.account_id) : undefined;
  return dev && acct ? { dev, acct } : undefined;
}

/** step_up_with_code: a signed-in device re-proves the code of ITS OWN account and gets a fresh 15-minute window. */
export function runStepUpWithCode(ctx: PCtx, args: { recovery_code: string }): CodeResult {
  return ctx.withTx(tx => {
    const now = tx.timestamp.microsSinceUnixEpoch;
    const cfg = getAccountConfig(tx);
    const me = mine(tx);
    if (!me) return refuse('not_signed_in');
    const lim = limited(tx, now);
    if (lim) return lim;
    if (!isRecoveryCodeShape(args.recovery_code)) return freeFailure(tx, 'invalid_code');
    const h = recoveryHash(cfg.hash_pepper, normalizeRecoveryCode(args.recovery_code));
    if (!constantTimeEqual(h, me.acct.recovery_hash)) return failure(tx);
    tx.db.account_device.identity.update({
      ...me.dev,
      last_seen_at: tx.timestamp,
      stepup_until: tsFromMicros(tx, now + STEPUP_TTL_MICROS),
    });
    return success();
  });
}

/** replace_recovery_code: old code proves control, the new browser-generated code takes over. Other devices stay linked. */
export function runReplaceRecoveryCode(ctx: PCtx, args: { old_code: string; new_code: string }): CodeResult {
  return ctx.withTx(tx => {
    const now = tx.timestamp.microsSinceUnixEpoch;
    const cfg = getAccountConfig(tx);
    const me = mine(tx);
    if (!me) return refuse('not_signed_in');
    const lim = limited(tx, now);
    if (lim) return lim;
    if (!isRecoveryCodeShape(args.old_code)) return freeFailure(tx, 'invalid_code');
    const oldHash = recoveryHash(cfg.hash_pepper, normalizeRecoveryCode(args.old_code));
    if (!constantTimeEqual(oldHash, me.acct.recovery_hash)) return failure(tx);
    // Authenticated from here on: 'invalid_new_code' (malformed/weak) and 'code_unchanged' are free and reveal nothing about other accounts.
    if (!isRecoveryCodeShape(args.new_code)) return refuse('invalid_new_code');
    const newHash = recoveryHash(cfg.hash_pepper, normalizeRecoveryCode(args.new_code));
    if (newHash === oldHash) return refuse('code_unchanged');
    // A taken hash would be a free oracle for other accounts' live codes: charge a failure and answer with the generic error.
    if (tx.db.account.recovery_hash.find(newHash)) return failure(tx, 'invalid_new_code');
    tx.db.account.id.update({ ...me.acct, recovery_hash: newHash, replaced_at: tx.timestamp });
    return success();
  });
}
