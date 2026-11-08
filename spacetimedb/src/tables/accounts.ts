// Passwordless email accounts for AFFECTED persons (reporters stay accountless). ALL tables are private:
// clients read them only through the sender-scoped views in ../views_account.ts, which never expose
// email_plain, code_hash, salts, other people's demo codes, or any key. The full address is never kept on an account:
// it stores only a peppered hash plus a masked display (s***@gmail.com).
import { table, t } from 'spacetimedb/server';

export const account = table(
  { name: 'email_account' },
  {
    id: t.u64().primaryKey().autoInc(),
    email_hash: t.string().unique(), // sha256(pepper + normalized email)
    email_masked: t.string(), // first char + *** + @domain; never the full local part
    created_at: t.timestamp(),
    last_login_at: t.timestamp(),
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
    stepup_until: t.timestamp().optional(), // set while a recent email step-up is valid; cleared by account_tick
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

export const email_challenge = table(
  { name: 'email_challenge' },
  {
    id: t.u64().primaryKey().autoInc(),
    identity: t.identity().index('btree'),
    purpose: t.string(), // 'enroll' | 'signin' | 'stepup'
    email_plain: t.string(), // normalized address, only while a send is in flight; '' afterwards (cleared after the send attempt, on success/expiry, or after 15 min)
    email_hash: t.string().index('btree'),
    email_masked: t.string(), // carried to the account on enroll (the full address is not kept)
    salt: t.string(),
    code_hash: t.string(), // sha256(salt + ':' + code)
    attempts: t.u8(),
    expires_at: t.timestamp(),
    created_at: t.timestamp(),
    consumed: t.bool(), // true after success, expiry, supersession or lockout
    delivery_state: t.string(), // 'pending' | 'sent' | 'failed' | 'demo'
    delivery_error: t.string().optional(),
    // Additive to the spec'd columns:
    account_id: t.u64().optional(), // signin: the matched account (undefined = decoy, see `decoy`)
    decoy: t.bool(), // signin for an email with no account: looks identical to the caller, nothing is sent
    locked_at: t.timestamp().optional(), // set when 5 wrong codes were entered: locks the email_hash for 15 min
  }
);

/** Plaintext code, demo mode only. Visible solely to its requester through my_demo_code. Deleted on consume/expiry. */
export const demo_code = table(
  { name: 'demo_code' },
  {
    challenge_id: t.u64().primaryKey(),
    identity: t.identity().index('btree'),
    code: t.string(),
    created_at: t.timestamp(),
  }
);

/** Single row (id 0). Absent until an admin calls admin_set_email_config: accounts are inert until then. */
export const email_config = table(
  { name: 'email_config' },
  {
    id: t.u8().primaryKey(),
    mode: t.string(), // 'demo' | 'brevo'
    brevo_api_key: t.string(), // NEVER exposed by any view or log
    sender_email: t.string(), // verified Brevo sender address; never exposed by any view
    hash_pepper: t.string(),
    require_stepup: t.bool(),
    daily_send_cap: t.u32(),
  }
);

/** Scheduled every 60 s: clears expired step-ups, purges expired challenges and stale email addresses. */
export const account_tick = table(
  { name: 'account_tick' },
  {
    scheduled_id: t.u64().primaryKey().autoInc(),
    scheduled_at: t.scheduleAt(),
  }
);
