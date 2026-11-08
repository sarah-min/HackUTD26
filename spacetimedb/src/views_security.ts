// Sender-scoped / admin-only views for the security hardening (CONTRACTS.md §5.4).
import { t } from 'spacetimedb/server';
import { spacetimedb } from './schema';
import { accountIdOf, isAdmin, verifiedPropertyIds } from './auth';
import type { Identity } from 'spacetimedb';
import type { RoDb } from './constants';
import { ACCESS_LOG_VIEW_LIMIT, getSecurityConfig } from './security';

/**
 * Someone else tried to verify a property the caller owns (or that the caller's account owns). Only id, property, time and
 * status: never the claimant's identity, name, document or anything else about them.
 */
export const my_claim_conflicts = spacetimedb.view(
  { name: 'my_claim_conflicts', public: true },
  t.array(
    t.row('MyClaimConflictRow', {
      id: t.u64().primaryKey(),
      property_id: t.u64(),
      created_at: t.timestamp(),
      status: t.string(), // 'open' | 'approved' | 'rejected'
    })
  ),
  ctx => {
    const out = [];
    for (const pid of verifiedPropertyIds(ctx.db, ctx.sender)) {
      for (const c of ctx.db.claim_conflict.property_id.filter(pid)) {
        out.push({ id: c.id, property_id: c.property_id, created_at: c.created_at, status: c.status });
      }
    }
    return out.sort((a, b) => (a.id < b.id ? 1 : -1));
  }
);

const isLinkedBefore = (linked: bigint | undefined, at: bigint) => linked !== undefined && linked <= at;

function accountDevices(db: RoDb, who: Identity) {
  const id = accountIdOf(db, who);
  return id === undefined ? [] : [...db.account_device.account_id.filter(id)];
}

/**
 * Audit trail of reads/grants on properties the caller owns, newest first, at most 50 rows: time + kind only, plus `mine`
 * (was it this account's own device). Never another identity, never an object key.
 */
export const my_access_log = spacetimedb.view(
  { name: 'my_access_log', public: true },
  t.array(
    t.row('MyAccessLogRow', {
      id: t.u64().primaryKey(),
      property_id: t.u64(),
      kind: t.string(), // 'blob' | 'verify' | 'claim'
      at: t.timestamp(),
      mine: t.bool(),
    })
  ),
  ctx => {
    // `mine`: the viewer's own device, or another device CURRENTLY linked to the viewer's account, for reads made after that
    // device linked. Reads by an identity before it joined the account, or by one that was removed / signed out, are not mine.
    const linkedAt = new Map<string, bigint>();
    for (const d of accountDevices(ctx.db, ctx.sender)) linkedAt.set(d.identity.toHexString(), d.linked_at.microsSinceUnixEpoch);
    const rows = [];
    for (const pid of verifiedPropertyIds(ctx.db, ctx.sender)) rows.push(...ctx.db.access_log.property_id.filter(pid));
    rows.sort((a, b) => (a.id < b.id ? 1 : -1));
    return rows.slice(0, ACCESS_LOG_VIEW_LIMIT).map(r => ({
      id: r.id,
      property_id: r.property_id,
      kind: r.kind,
      at: r.at,
      mine: r.identity.isEqual(ctx.sender) || isLinkedBefore(linkedAt.get(r.identity.toHexString()), r.at.microsSinceUnixEpoch),
    }));
  }
);

/** Admin only: booleans and numbers. Shows the effective values (defaults when no row exists). */
export const admin_security_config = spacetimedb.view(
  { name: 'admin_security_config', public: true },
  t.array(
    t.row('AdminSecurityConfigRow', {
      id: t.u8().primaryKey(),
      hold_duplicate_claims: t.bool(),
      max_verification_starts_per_hour_global: t.u32(),
      max_verification_starts_per_property_per_day: t.u32(),
      is_default: t.bool(),
    })
  ),
  ctx => {
    if (!isAdmin(ctx.db, ctx.sender)) return [];
    const c = getSecurityConfig(ctx.db);
    return [
      {
        id: 0,
        hold_duplicate_claims: c.holdDuplicateClaims,
        max_verification_starts_per_hour_global: c.maxStartsPerHourGlobal,
        max_verification_starts_per_property_per_day: c.maxStartsPerPropertyPerDay,
        is_default: !ctx.db.security_config.id.find(0),
      },
    ];
  }
);

/** Admin only: claim conflicts with ids only (no names, no identities). Resolve with admin_resolve_claim(id, approve). */
export const admin_claim_conflicts = spacetimedb.view(
  { name: 'admin_claim_conflicts', public: true },
  t.array(
    t.row('AdminClaimConflictRow', {
      id: t.u64().primaryKey(),
      property_id: t.u64(),
      existing_verification_id: t.u64(),
      new_verification_id: t.u64(),
      created_at: t.timestamp(),
      status: t.string(),
      resolved_at: t.timestamp().optional(),
    })
  ),
  ctx => (isAdmin(ctx.db, ctx.sender) ? [...ctx.db.claim_conflict.iter()] : [])
);
