// Security hardening tables (CONTRACTS.md §5.4). ALL private; clients read them only through the sender-scoped /
// admin-only views in ../views_security.ts. None of them ever holds ID bytes or document names.
import { table, t } from 'spacetimedb/server';

/**
 * A second identity tried to verify a property that already has a verified owner. The new verification is held
 * (state 'failed', fail_reason 'duplicate_claim') until an admin calls admin_resolve_claim. Owners see only id/created_at/status.
 */
export const claim_conflict = table(
  { name: 'claim_conflict' },
  {
    id: t.u64().primaryKey().autoInc(),
    property_id: t.u64().index('btree'),
    existing_verification_id: t.u64(),
    new_verification_id: t.u64().index('btree'),
    created_at: t.timestamp(),
    status: t.string(), // 'open' | 'approved' | 'rejected'
    resolved_at: t.timestamp().optional(),
  }
);

/** Single row (id 0). Absent = defaults (hold_duplicate_claims TRUE, 120 starts/hour globally, 6 starts/property/day). */
export const security_config = table(
  { name: 'security_config' },
  {
    id: t.u8().primaryKey(),
    hold_duplicate_claims: t.bool(),
    max_verification_starts_per_hour_global: t.u32(),
    max_verification_starts_per_property_per_day: t.u32(),
  }
);

/** Audit log of owner reads / grants. kind: 'blob' (media/frames read) | 'verify' (ownership granted) | 'claim' (account sign-in bound a property). */
export const access_log = table(
  { name: 'access_log' },
  {
    id: t.u64().primaryKey().autoInc(),
    identity: t.identity().index('btree'),
    property_id: t.u64().index('btree'),
    kind: t.string(),
    object_key: t.string().optional(), // 'blob' entries only; never an idv/ key
    at: t.timestamp(),
  }
);

/**
 * Ledger of accepted start_verification calls, used for the global per-hour and per-property per-day caps (identities are
 * free to mint, so per-identity limits alone are evadable). Purged after 24 h by the 60 s maintenance tick.
 */
export const verification_start = table(
  { name: 'verification_start' },
  {
    id: t.u64().primaryKey().autoInc(),
    property_id: t.u64().index('btree'),
    at: t.timestamp(),
  }
);
