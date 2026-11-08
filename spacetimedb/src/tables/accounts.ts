// Recovery-code accounts for AFFECTED persons (reporters stay accountless). ALL tables are private: clients read them only
// through the sender-scoped views in ../views_account.ts, which never expose recovery_hash, the pepper or any other secret.
// The module never sees a code except inside create/sign-in/step-up/replace calls and never stores it: only sha256(pepper + code).
import { table, t } from 'spacetimedb/server';

// SQL name is 'recovery_account' (the earlier email-based 'email_account' table is retired); the TS accessor stays `account`.
export const account = table(
  { name: 'recovery_account' },
  {
    id: t.u64().primaryKey().autoInc(),
    recovery_hash: t.string().unique(), // sha256(pepper + normalized recovery code); indexed lookup
    created_at: t.timestamp(),
    last_login_at: t.timestamp(),
    replaced_at: t.timestamp().optional(), // set by replace_recovery_code
  }
);

/** A SpacetimeDB identity (one browser/device) linked to an account. An identity is in at most one account. */
export const account_device = table(
  { name: 'account_device' },
  {
    identity: t.identity().primaryKey(),
    account_id: t.u64().index('btree'),
    label: t.string(),
    linked_at: t.timestamp(),
    last_seen_at: t.timestamp(),
    stepup_until: t.timestamp().optional(), // set while a recent recovery-code step-up is valid; cleared by account_tick
  }
);

/**
 * Properties an account owns, bound when a device linked to the account (or one that links later) is verified for them.
 * Without this, signing out of the device that holds the `verification` row would orphan the account's properties.
 * Additive to the spec'd tables. Removed by delete_account; NOT removed by sign_out_device / remove_device.
 */
export const account_property = table(
  { name: 'account_property' },
  {
    id: t.u64().primaryKey().autoInc(),
    account_id: t.u64().index('btree'),
    property_id: t.u64(),
    verification_id: t.u64(), // the verified `verification` row that proved ownership
    added_at: t.timestamp(),
  }
);

/**
 * Failed sign-in / step-up / replace attempts (and create_account `code_taken` / replace `invalid_new_code` probes). Backs the
 * per-identity lockout (5 in 15 min); there is deliberately NO global cap (identities are free to mint, so a global cap is a
 * lockout DoS). Only failures are recorded and a success does NOT delete them (they age out of the 15 min window), so
 * alternating wrong guesses with one valid call cannot reset the lock. Purged after 24 h by the tick.
 */
export const code_attempt = table(
  { name: 'code_attempt' },
  {
    id: t.u64().primaryKey().autoInc(),
    identity: t.identity().index('btree'),
    at: t.timestamp(),
  }
);

/**
 * Written by remove_device (target) and sign_out_device (caller): this identity may no longer use the verification rows it
 * created BEFORE revoked_at, nor any account access, until it signs in again with a valid code (which deletes this row) or
 * completes a NEW verification started after revoked_at. delete_account does not write it. See auth.ts ownVerifiedRows.
 */
export const device_revocation = table(
  { name: 'device_revocation' },
  {
    identity: t.identity().primaryKey(),
    account_id: t.u64(),
    revoked_at: t.timestamp(),
  }
);

/**
 * Single row (id 0). Absent = defaults (accounts_enabled TRUE, require_stepup FALSE, pepper generated lazily on the first
 * create/sign-in). The "pepper" is a per-database domain separator, NOT a secret (it comes from the host's timestamp-seeded RNG);
 * only the 100-bit browser-generated recovery code protects an account. It is never rotated (that would orphan every
 * account's recovery_hash) and never exposed by a view.
 */
export const account_config = table(
  { name: 'account_config' },
  {
    id: t.u8().primaryKey(),
    accounts_enabled: t.bool(),
    require_stepup: t.bool(),
    hash_pepper: t.string(),
  }
);

/** Scheduled every 60 s: clears expired step-ups and purges the failed-attempt ledger. */
export const account_tick = table(
  { name: 'account_tick' },
  {
    scheduled_id: t.u64().primaryKey().autoInc(),
    scheduled_at: t.scheduleAt(),
  }
);
