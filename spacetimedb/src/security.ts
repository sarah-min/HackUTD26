// Security hardening helpers (not exported from index.ts): duplicate-claim detection, start caps, audit log.
import type { Identity, Timestamp } from 'spacetimedb';
import { HOUR_MICROS, REASON_DUPLICATE_CLAIM, type Db, type RoDb } from './constants';
import { isVerifiedFor, propertyHasVerified } from './auth';

export const DEFAULT_HOLD_DUPLICATE_CLAIMS = true;
export const DEFAULT_MAX_STARTS_PER_HOUR_GLOBAL = 120;
export const DEFAULT_MAX_STARTS_PER_PROPERTY_PER_DAY = 6;
export const DAY_MICROS = 24n * HOUR_MICROS;
export const ACCESS_LOG_KEEP_MICROS = 30n * DAY_MICROS;
export const ACCESS_LOG_VIEW_LIMIT = 50;
export const ACCESS_KINDS = ['blob', 'verify', 'claim'] as const;
export type AccessKind = (typeof ACCESS_KINDS)[number];

export function getSecurityConfig(db: RoDb) {
  const c = db.security_config.id.find(0);
  return {
    holdDuplicateClaims: c ? c.hold_duplicate_claims : DEFAULT_HOLD_DUPLICATE_CLAIMS,
    maxStartsPerHourGlobal: c ? c.max_verification_starts_per_hour_global : DEFAULT_MAX_STARTS_PER_HOUR_GLOBAL,
    maxStartsPerPropertyPerDay: c ? c.max_verification_starts_per_property_per_day : DEFAULT_MAX_STARTS_PER_PROPERTY_PER_DAY,
  };
}

/**
 * The existing verified verification that makes a new claim by `who` on the property a DUPLICATE, or undefined.
 * A claim is legitimate when the property has no verified owner yet, or `who` already owns it (same identity, another device
 * on the same account, or a property bound to the same account: auth.ts isVerifiedFor). Call BEFORE the new row is verified.
 */
export function conflictingVerification(db: RoDb, who: Identity, propertyId: bigint) {
  if (!propertyHasVerified(db, propertyId) || isVerifiedFor(db, who, propertyId)) return undefined;
  for (const v of db.verification.property_id.filter(propertyId)) if (v.state === 'verified') return v;
  return undefined;
}

export function isHeld(v: { state: string; fail_reason?: string | undefined }): boolean {
  return v.state === 'failed' && (v.fail_reason === REASON_DUPLICATE_CLAIM || v.fail_reason === 'needs_review');
}

export function logAccess(db: Db, who: Identity, propertyId: bigint, kind: AccessKind, now: Timestamp, objectKey?: string): void {
  db.access_log.insert({ id: 0n, identity: who, property_id: propertyId, kind, object_key: objectKey, at: now });
}

/** A repeat read of the same object by the same identity inside this window is not logged again. */
export const ACCESS_LOG_DEDUPE_MICROS = 60n * 1_000_000n;

/** Audit entry for an owner's media/frames read; skips an identical (identity, object_key) entry from the last 60 s. */
export function logBlobAccess(db: Db, who: Identity, propertyId: bigint, now: Timestamp, objectKey: string): void {
  for (const r of db.access_log.identity.filter(who)) {
    if (r.kind === 'blob' && r.object_key === objectKey && now.microsSinceUnixEpoch - r.at.microsSinceUnixEpoch < ACCESS_LOG_DEDUPE_MICROS) return;
  }
  logAccess(db, who, propertyId, 'blob', now, objectKey);
}

/** Run by the 60 s maintenance tick: drop start-ledger rows older than 24 h and audit entries older than 30 days. */
export function runSecurityMaintenance(db: Db, nowMicros: bigint): void {
  for (const r of [...db.verification_start.iter()]) {
    if (nowMicros - r.at.microsSinceUnixEpoch >= DAY_MICROS) db.verification_start.id.delete(r.id);
  }
  for (const r of [...db.access_log.iter()]) {
    if (nowMicros - r.at.microsSinceUnixEpoch >= ACCESS_LOG_KEEP_MICROS) db.access_log.id.delete(r.id);
  }
}
