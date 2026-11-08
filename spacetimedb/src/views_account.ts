// Sender-scoped views for recovery-code accounts (CONTRACTS.md §5.3). They never expose recovery_hash, the pepper, any
// code or another account's rows. Views have no clock: expiry shows up when account_tick (60 s) updates the tables.
import { t } from 'spacetimedb/server';
import { spacetimedb } from './schema';
import { accountIdOf, isAdmin } from './auth';

export const my_account = spacetimedb.view(
  { name: 'my_account', public: true },
  t.array(t.row('MyAccountRow', { id: t.u64().primaryKey(), created_at: t.timestamp(), last_login_at: t.timestamp() })),
  ctx => {
    const id = accountIdOf(ctx.db, ctx.sender);
    const a = id === undefined ? undefined : ctx.db.account.id.find(id);
    return a ? [{ id: a.id, created_at: a.created_at, last_login_at: a.last_login_at }] : [];
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
        require_stepup: ctx.db.account_config.id.find(0)?.require_stepup === true,
      },
    ];
  }
);

/** Always exactly one row: are new sign-ins / sign-ups accepted? (account_config.accounts_enabled, default true). */
export const my_account_status = spacetimedb.view(
  { name: 'my_account_status', public: true },
  t.array(t.row('AccountStatusRow', { id: t.u8().primaryKey(), enabled: t.bool() })),
  ctx => [{ id: 0, enabled: ctx.db.account_config.id.find(0)?.accounts_enabled !== false }]
);

/** Admin only: booleans, never the pepper. `spacetime sql <db> "SELECT * FROM admin_account_config"` while logged in as admin. */
export const admin_account_config = spacetimedb.view(
  { name: 'admin_account_config', public: true },
  t.array(
    t.row('AdminAccountConfigRow', {
      id: t.u8().primaryKey(),
      accounts_enabled: t.bool(),
      require_stepup: t.bool(),
      has_pepper: t.bool(),
    })
  ),
  ctx => {
    if (!isAdmin(ctx.db, ctx.sender)) return [];
    const c = ctx.db.account_config.id.find(0);
    return [
      {
        id: 0,
        accounts_enabled: c ? c.accounts_enabled : true,
        require_stepup: c ? c.require_stepup : false,
        has_pepper: !!c && c.hash_pepper.length > 0,
      },
    ];
  }
);
