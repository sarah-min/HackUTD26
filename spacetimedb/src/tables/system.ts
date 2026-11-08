// Jobs, service identities and scheduler tables (CONTRACTS.md §5.1).
import { table, t } from 'spacetimedb/server';

export const job = table(
  { name: 'job' },
  {
    id: t.u64().primaryKey().autoInc(),
    kind: t.string(), // 'analyze' | 'verify_identity' | 'plan' | 'coach'
    report_id: t.u64().optional(),
    property_id: t.u64().optional(),
    verification_id: t.u64().optional(),
    subject: t.identity().optional(),
    payload_json: t.string(),
    state: t.string().index('btree'), // 'queued' | 'leased' | 'done' | 'failed'
    attempts: t.u8(),
    lease_owner: t.identity().optional(),
    lease_expires_at: t.timestamp().optional(),
    last_error: t.string().optional(),
    created_at: t.timestamp(),
  }
);

export const service_identity = table(
  { name: 'service_identity' },
  {
    identity: t.identity().primaryKey(),
    role: t.string(), // 'admin' | 'worker'
  }
);

export const lease_tick = table(
  { name: 'lease_tick' },
  {
    scheduled_id: t.u64().primaryKey().autoInc(),
    scheduled_at: t.scheduleAt(),
  }
);

export const area_tick = table(
  { name: 'area_tick' },
  {
    scheduled_id: t.u64().primaryKey().autoInc(),
    scheduled_at: t.scheduleAt(),
  }
);
