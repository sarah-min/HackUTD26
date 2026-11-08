// Sender-scoped views for email accounts (CONTRACTS.md §5.3). They never expose email_plain, email_hash, code_hash, salt,
// any key or another account's rows. Views have no clock: expiry shows up when account_tick (60 s) updates the tables.
import { t } from 'spacetimedb/server';
import { spacetimedb } from './schema';
import { accountIdOf, isAdmin } from './auth';
import { MAX_CODE_ATTEMPTS } from './account_constants';

export const my_account = spacetimedb.view(
  { name: 'my_account', public: true },
  t.array(t.row('MyAccountRow', { id: t.u64().primaryKey(), email_masked: t.string(), created_at: t.timestamp() })),
  ctx => {
    const id = accountIdOf(ctx.db, ctx.sender);
    const a = id === undefined ? undefined : ctx.db.account.id.find(id);
    return a ? [{ id: a.id, email_masked: a.email_masked, created_at: a.created_at }] : [];
  }
);

export const my_devices = spacetimedb.view(
  { name: 'my_devices', public: true },
  t.array(
    t.row('MyDeviceRow', {
      identity_hex: t.string().primaryKey(),
      label: t.string(),
      linked_at: t.timestamp(),
      last_seen_at: t.timestamp(),
      is_current: t.bool(),
    })
  ),
  ctx => {
    const id = accountIdOf(ctx.db, ctx.sender);
    if (id === undefined) return [];
    return [...ctx.db.account_device.account_id.filter(id)].map(d => ({
      identity_hex: d.identity.toHexString(),
      label: d.label,
      linked_at: d.linked_at,
      last_seen_at: d.last_seen_at,
      is_current: d.identity.isEqual(ctx.sender),
    }));
  }
);

/** Always exactly one row for the caller. `active` = a step-up is in effect (the tick clears it on expiry). */
export const my_stepup = spacetimedb.view(
  { name: 'my_stepup', public: true },
  t.array(
    t.row('MyStepupRow', {
      device_identity: t.string().primaryKey(),
      linked: t.bool(),
      active: t.bool(),
      stepup_until: t.timestamp().optional(),
      require_stepup: t.bool(),
    })
  ),
  ctx => {
    const dev = ctx.db.account_device.identity.find(ctx.sender);
    return [
      {
        device_identity: ctx.sender.toHexString(),
        linked: !!dev,
        active: !!dev?.stepup_until,
        stepup_until: dev?.stepup_until,
        require_stepup: ctx.db.email_config.id.find(0)?.require_stepup === true,
      },
    ];
  }
);

/** The caller's open (unconsumed) challenge, newest only. Never the code or the address. */
export const my_email_challenge = spacetimedb.view(
  { name: 'my_email_challenge', public: true },
  t.array(
    t.row('MyEmailChallengeRow', {
      id: t.u64().primaryKey(),
      purpose: t.string(),
      expires_at: t.timestamp(),
      attempts_left: t.u8(),
      delivery_state: t.string(),
      delivery_error: t.string().optional(),
    })
  ),
  ctx => {
    let best;
    for (const c of ctx.db.email_challenge.identity.filter(ctx.sender)) {
      if (!c.consumed && (!best || c.id > best.id)) best = c;
    }
    if (!best) return [];
    return [
      {
        id: best.id,
        purpose: best.purpose,
        expires_at: best.expires_at,
        attempts_left: Math.max(0, MAX_CODE_ATTEMPTS - best.attempts),
        delivery_state: best.delivery_state,
        delivery_error: best.delivery_error,
      },
    ];
  }
);

/**
 * Demo mode ONLY: the plaintext code of the caller's own open challenge. UI label: "Demo mode: code shown on screen.
 * Not a real email." In any other mode (or for anyone else) this is empty.
 */
export const my_demo_code = spacetimedb.view(
  { name: 'my_demo_code', public: true },
  t.array(t.row('MyDemoCodeRow', { challenge_id: t.u64().primaryKey(), purpose: t.string(), code: t.string() })),
  ctx => {
    if (ctx.db.email_config.id.find(0)?.mode !== 'demo') return [];
    const out = [];
    for (const d of ctx.db.demo_code.identity.filter(ctx.sender)) {
      const c = ctx.db.email_challenge.id.find(d.challenge_id);
      if (c && !c.consumed) out.push({ challenge_id: d.challenge_id, purpose: c.purpose, code: d.code });
    }
    return out;
  }
);

/** Public-safe: which delivery mode applies. mode is 'off' until an admin configures email (then accounts are unavailable). */
export const my_auth_status = spacetimedb.view(
  { name: 'my_auth_status', public: true },
  t.array(t.row('AuthStatusRow', { id: t.u8().primaryKey(), mode: t.string(), configured: t.bool() })),
  ctx => {
    const cfg = ctx.db.email_config.id.find(0);
    return [{ id: 0, mode: cfg ? cfg.mode : 'off', configured: !!cfg }];
  }
);

/** Admin only: booleans, never the key. `spacetime sql <db> "SELECT * FROM admin_email_config"` while logged in as admin. */
export const admin_email_config = spacetimedb.view(
  { name: 'admin_email_config', public: true },
  t.array(
    t.row('AdminEmailConfigRow', {
      id: t.u8().primaryKey(),
      mode: t.string(),
      has_key: t.bool(),
      has_sender_email: t.bool(),
      has_pepper: t.bool(),
      require_stepup: t.bool(),
      daily_send_cap: t.u32(),
    })
  ),
  ctx => {
    if (!isAdmin(ctx.db, ctx.sender)) return [];
    const c = ctx.db.email_config.id.find(0);
    if (!c) return [];
    return [
      {
        id: 0,
        mode: c.mode,
        has_key: c.brevo_api_key.length > 0,
        has_sender_email: c.sender_email.length > 0,
        has_pepper: c.hash_pepper.length > 0,
        require_stepup: c.require_stepup,
        daily_send_cap: c.daily_send_cap,
      },
    ];
  }
);
