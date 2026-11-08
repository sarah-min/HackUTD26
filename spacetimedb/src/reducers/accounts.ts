// Recovery-code accounts for affected persons (CONTRACTS.md §5.3). The BROWSER generates the 20-char code
// (apps/web/lib/stdb/recoveryCode.ts); the module stores only sha256(pepper + code). The pepper is a domain separator, not a
// secret: the 100-bit code is the protection. Flow order for the UI:
//   create   : create_account(code)          [verified owner, no account yet; show the code once, user saves it]
//   signin   : sign_in_with_code(code)       [new device, existing account]
//   stepup   : step_up_with_code(code)       [signed-in device when require_stepup is on]
//   rotate   : replace_recovery_code(old, new)
// All four procedures RETURN { ok, error, retry_after_s, attempts_left } (a thrown error would roll back the failed-attempt ledger).
import { t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { accountIdOf, requireActiveStepup, requireAdmin } from '../auth';
import type { Identity, Timestamp } from 'spacetimedb';
import { fail, type Db } from '../constants';
import { identityFromHex } from '../values';
import { ensureAccountTick } from '../account_maintenance';
import { hex } from '../recovery_code';
import { sha256Hex } from '../sha256';
import { runCreateAccount, runReplaceRecoveryCode, runSignInWithCode, runStepUpWithCode } from '../account_flow';

const AccountCodeResult = t.object('AccountCodeResult', {
  ok: t.bool(),
  error: t.string(), // '' on success, else a stable code (see CONTRACTS.md §5.3)
  retry_after_s: t.u32(), // for locked / rate_limited
  attempts_left: t.u8(), // failed attempts left before `locked` (0 when refused for another reason)
});

/** A verified owner with no account links this device and stores the hash of the browser-generated code. */
export const create_account = spacetimedb.procedure({ recovery_code: t.string() }, AccountCodeResult, (ctx, args) =>
  runCreateAccount(ctx, args)
);

/** Links THIS identity to the account that owns the code. Every failure is the same 'invalid_code'. */
export const sign_in_with_code = spacetimedb.procedure({ recovery_code: t.string() }, AccountCodeResult, (ctx, args) =>
  runSignInWithCode(ctx, args)
);

/** A signed-in device re-types its account's code to open a 15-minute step-up window. */
export const step_up_with_code = spacetimedb.procedure({ recovery_code: t.string() }, AccountCodeResult, (ctx, args) =>
  runStepUpWithCode(ctx, args)
);

/** Rotates the code. The old code stops working immediately; other devices stay linked. */
export const replace_recovery_code = spacetimedb.procedure(
  { old_code: t.string(), new_code: t.string() },
  AccountCodeResult,
  (ctx, args) => runReplaceRecoveryCode(ctx, args)
);

/**
 * Admin only. Omitted args keep their value. Defaults when no row exists: accounts_enabled true, require_stepup false.
 * accounts_enabled=false rejects create_account / sign_in_with_code (existing devices keep working). Also makes sure the
 * 60 s account_tick schedule exists and generates the hash pepper if missing (never rotated).
 */
export const admin_set_account_config = spacetimedb.reducer(
  { accounts_enabled: t.bool().optional(), require_stepup: t.bool().optional() },
  (ctx, a) => {
    requireAdmin(ctx.db, ctx.sender);
    const cur = ctx.db.account_config.id.find(0);
    const pepper =
      cur?.hash_pepper ||
      sha256Hex(`pepper:${hex(ctx.random.fill(new Uint8Array(32)))}:${ctx.newUuidV4().toString()}:${ctx.sender.toHexString()}:${ctx.timestamp.microsSinceUnixEpoch}`);
    const row = {
      id: 0,
      accounts_enabled: a.accounts_enabled ?? cur?.accounts_enabled ?? true,
      require_stepup: a.require_stepup ?? cur?.require_stepup ?? false,
      hash_pepper: pepper,
    };
    if (cur) ctx.db.account_config.id.update(row);
    else ctx.db.account_config.insert(row);
    ensureAccountTick(ctx.db);
  }
);

/** Writes (or refreshes) the revocation of `identity` (see tables/accounts.ts device_revocation). */
function revoke(db: Db, identity: Identity, accountId: bigint, at: Timestamp): void {
  const row = { identity, account_id: accountId, revoked_at: at };
  if (db.device_revocation.identity.find(identity)) db.device_revocation.identity.update(row);
  else db.device_revocation.insert(row);
}

/**
 * Unlinks this device AND revokes it: it loses the account's properties and also the verification rows it created before now,
 * until it signs in again with a valid code or completes a new verification. Needs no step-up (you can always sign out).
 */
export const sign_out_device = spacetimedb.reducer({}, ctx => {
  const dev = ctx.db.account_device.identity.find(ctx.sender);
  if (!dev) fail('not_signed_in');
  ctx.db.account_device.identity.delete(ctx.sender);
  revoke(ctx.db, ctx.sender, dev.account_id, ctx.timestamp);
});

/**
 * Removes another device of the SAME account (or this one) and revokes it (same semantics as sign_out_device for the target).
 * ALWAYS needs an active step-up window on the caller's device ('stepup_required'), whatever account_config.require_stepup says.
 */
export const remove_device = spacetimedb.reducer({ identity_hex: t.string() }, (ctx, { identity_hex }) => {
  const mine = accountIdOf(ctx.db, ctx.sender);
  if (mine === undefined) fail('not_signed_in');
  requireActiveStepup(ctx.db, ctx.sender, ctx.timestamp.microsSinceUnixEpoch);
  const target = identityFromHex(ctx, identity_hex);
  const dev = ctx.db.account_device.identity.find(target);
  if (!dev || dev.account_id !== mine) fail('device not found on your account');
  ctx.db.account_device.identity.delete(target);
  revoke(ctx.db, target, mine, ctx.timestamp);
});

/** Renames this device. ALWAYS needs an active step-up window ('stepup_required'). */
export const set_device_label = spacetimedb.reducer({ label: t.string() }, (ctx, { label }) => {
  const dev = ctx.db.account_device.identity.find(ctx.sender);
  if (!dev) fail('not_signed_in');
  requireActiveStepup(ctx.db, ctx.sender, ctx.timestamp.microsSinceUnixEpoch);
  const l = label.trim();
  if (l.length === 0 || l.length > 40) fail('label must be 1-40 chars');
  ctx.db.account_device.identity.update({ ...dev, label: l });
});

/**
 * Hard-deletes the account, all its device links and bound properties. Verifications, reports and affected-person data
 * are NOT deleted (they belong to the identities that created them) and nothing is revoked, so devices keep what they
 * verified themselves. ALWAYS needs an active step-up window ('stepup_required'), whatever account_config.require_stepup says.
 * The failed-attempt ledger is kept (it ages out) so delete + create cannot be used to reset a lockout.
 */
export const delete_account = spacetimedb.reducer({}, ctx => {
  const accountId = accountIdOf(ctx.db, ctx.sender);
  if (accountId === undefined) fail('not_signed_in');
  requireActiveStepup(ctx.db, ctx.sender, ctx.timestamp.microsSinceUnixEpoch);
  for (const d of [...ctx.db.account_device.account_id.filter(accountId)]) ctx.db.account_device.identity.delete(d.identity);
  ctx.db.account.id.delete(accountId);
  for (const b of [...ctx.db.account_property.account_id.filter(accountId)]) ctx.db.account_property.id.delete(b.id);
});
