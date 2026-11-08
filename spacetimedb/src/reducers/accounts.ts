// Passwordless email accounts for affected persons (CONTRACTS.md §5.3). Flow order for the UI:
//   enroll : request_email_code(email,'enroll') -> verify_email_code(id, code)        [verified owner, no account yet]
//   signin : request_email_code(email,'signin') -> verify_email_code(id, code)        [new device, existing account]
//   stepup : request_email_code(email,'stepup') -> verify_email_code(id, code)        [signed-in device; user re-types the email]
// Outcomes are RETURNED (not thrown) by the two procedures, because a thrown error would roll back the attempt counter.
import { t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { accountIdOf } from '../auth';
import { fail } from '../constants';
import { identityFromHex } from '../values';
import { defaultDeps, runRequestEmailCode, runVerifyEmailCode } from '../email_flow';

const RequestEmailCodeResult = t.object('RequestEmailCodeResult', {
  ok: t.bool(),
  error: t.string(), // '' on success, else a stable code (see CONTRACTS.md §5.3)
  challenge_id: t.u64(), // 0 when ok = false
  retry_after_s: t.u32(), // for cooldown / locked
});

const VerifyEmailCodeResult = t.object('VerifyEmailCodeResult', {
  ok: t.bool(),
  error: t.string(),
  attempts_left: t.u8(),
  purpose: t.string(),
});

/** Sends (or, in demo mode, shows) a 6-digit code. Never reveals whether an email has an account (purpose 'signin'). */
export const request_email_code = spacetimedb.procedure(
  { email: t.string(), purpose: t.string() },
  RequestEmailCodeResult,
  (ctx, args) => runRequestEmailCode(ctx, args, defaultDeps(ctx))
);

/** Checks the code. Success enrolls / signs in / starts a 15-minute step-up depending on the challenge purpose. */
export const verify_email_code = spacetimedb.procedure(
  { challenge_id: t.u64(), code: t.string() },
  VerifyEmailCodeResult,
  (ctx, args) => runVerifyEmailCode(ctx, args)
);

/** Unlinks this device. Its own verifications stay; it just stops inheriting the account's properties. */
export const sign_out_device = spacetimedb.reducer({}, ctx => {
  if (!ctx.db.account_device.identity.find(ctx.sender)) fail('not_signed_in');
  ctx.db.account_device.identity.delete(ctx.sender);
});

/** Removes another device of the SAME account (or this one). */
export const remove_device = spacetimedb.reducer({ identity_hex: t.string() }, (ctx, { identity_hex }) => {
  const mine = accountIdOf(ctx.db, ctx.sender);
  if (mine === undefined) fail('not_signed_in');
  const target = identityFromHex(ctx, identity_hex);
  const dev = ctx.db.account_device.identity.find(target);
  if (!dev || dev.account_id !== mine) fail('device not found on your account');
  ctx.db.account_device.identity.delete(target);
});

export const set_device_label = spacetimedb.reducer({ label: t.string() }, (ctx, { label }) => {
  const dev = ctx.db.account_device.identity.find(ctx.sender);
  if (!dev) fail('not_signed_in');
  const l = label.trim();
  if (l.length === 0 || l.length > 40) fail('label must be 1-40 chars');
  ctx.db.account_device.identity.update({ ...dev, label: l });
});

/**
 * Deletes the account, all its device links and every challenge for it. Verifications, reports and affected-person data
 * are NOT deleted (they belong to the identities that created them).
 */
export const delete_account = spacetimedb.reducer({}, ctx => {
  const accountId = accountIdOf(ctx.db, ctx.sender);
  if (accountId === undefined) fail('not_signed_in');
  const acct = ctx.db.account.id.find(accountId);
  const devices = [...ctx.db.account_device.account_id.filter(accountId)];
  for (const d of devices) {
    for (const c of [...ctx.db.email_challenge.identity.filter(d.identity)]) {
      ctx.db.demo_code.challenge_id.delete(c.id);
      ctx.db.email_challenge.id.delete(c.id);
    }
    ctx.db.account_device.identity.delete(d.identity);
  }
  if (acct) {
    for (const c of [...ctx.db.email_challenge.email_hash.filter(acct.email_hash)]) {
      ctx.db.demo_code.challenge_id.delete(c.id);
      ctx.db.email_challenge.id.delete(c.id);
    }
    ctx.db.account.id.delete(acct.id);
  }
  for (const b of [...ctx.db.account_property.account_id.filter(accountId)]) ctx.db.account_property.id.delete(b.id);
});
