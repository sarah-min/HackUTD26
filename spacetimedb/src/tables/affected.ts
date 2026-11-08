// Affected-person tables (CONTRACTS.md §5.1). All private; read via views.
import { table, t } from 'spacetimedb/server';

export const verification = table(
  { name: 'verification' },
  {
    id: t.u64().primaryKey().autoInc(),
    identity: t.identity().index('btree'),
    property_id: t.u64().index('btree'),
    doc_kind: t.string(),
    state: t.string(), // 'pending' | 'processing' | 'verified' | 'failed'
    fail_reason: t.string().optional(),
    name_on_doc: t.string().optional(),
    secret_hash: t.string(),
    object_key: t.string().optional(), // cleared once the job finishes
    attempt_no: t.u8(),
    created_at: t.timestamp(),
    decided_at: t.timestamp().optional(),
  }
);

export const affected_profile = table(
  {
    name: 'affected_profile',
    indexes: [
      {
        accessor: 'by_identity_property',
        algorithm: 'btree',
        columns: ['identity', 'property_id'] as const,
      },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    identity: t.identity().index('btree'),
    property_id: t.u64(),
    intake_json: t.string(),
    updated_at: t.timestamp(),
  }
);

export const recovery_plan = table(
  { name: 'recovery_plan' },
  {
    id: t.u64().primaryKey().autoInc(),
    identity: t.identity().index('btree'),
    property_id: t.u64(),
    report_id: t.u64(),
    json: t.string(),
    created_at: t.timestamp(),
  }
);

export const coach_message = table(
  { name: 'coach_message' },
  {
    id: t.u64().primaryKey().autoInc(),
    identity: t.identity().index('btree'),
    property_id: t.u64(),
    report_id: t.u64(),
    role: t.string(), // 'user' | 'assistant'
    text: t.string(),
    at: t.timestamp(),
  }
);
