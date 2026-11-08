import { t, ScheduleAt } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { requireAdmin } from '../auth';
import { AREA_TICK_MICROS, LEASE_TICK_MICROS, SERVICE_ROLES, oneOf } from '../constants';
import { identityFromHex } from '../values';
import { ensureAccountTick } from '../account_maintenance';

export const init = spacetimedb.init(ctx => {
  // The publisher becomes the first admin (CONTRACTS §5.2).
  if (!ctx.db.service_identity.identity.find(ctx.sender)) {
    ctx.db.service_identity.insert({ identity: ctx.sender, role: 'admin' });
  }
  ctx.db.lease_tick.insert({ scheduled_id: 0n, scheduled_at: ScheduleAt.interval(LEASE_TICK_MICROS) });
  ctx.db.area_tick.insert({ scheduled_id: 0n, scheduled_at: ScheduleAt.interval(AREA_TICK_MICROS) });
  ensureAccountTick(ctx.db);
});

export const admin_add_service = spacetimedb.reducer(
  { identity: t.string(), role: t.string() },
  (ctx, { identity, role }) => {
    requireAdmin(ctx.db, ctx.sender);
    const r = oneOf(SERVICE_ROLES, role, 'role');
    const id = identityFromHex(ctx, identity);
    const existing = ctx.db.service_identity.identity.find(id);
    if (existing) ctx.db.service_identity.identity.update({ identity: id, role: r });
    else ctx.db.service_identity.insert({ identity: id, role: r });
  }
);
