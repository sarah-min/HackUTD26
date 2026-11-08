// Authorization helpers. Roles are derived from data (CONTRACTS.md §5):
// reporter = report.reporter == sender; verified = a 'verified' verification row
// for the property; service/admin = row in service_identity.
import type { Identity } from 'spacetimedb';
import { fail, type RoDb } from './constants';

export function serviceRole(db: RoDb, who: Identity): string | null {
  const row = db.service_identity.identity.find(who);
  return row ? row.role : null;
}

/** Worker-capable service (worker reducers + svc_* views). The 'web' role is NOT a service here. */
export function isService(db: RoDb, who: Identity): boolean {
  const r = serviceRole(db, who);
  return r === 'admin' || r === 'worker';
}

/** The Next.js server role: may read the narrow web_* auth views only. */
export function isWeb(db: RoDb, who: Identity): boolean {
  const r = serviceRole(db, who);
  return r === 'admin' || r === 'web';
}

export function isAdmin(db: RoDb, who: Identity): boolean {
  return serviceRole(db, who) === 'admin';
}

export function requireService(db: RoDb, who: Identity): void {
  if (!isService(db, who)) fail('unauthorized: service only');
}

export function requireAdmin(db: RoDb, who: Identity): void {
  if (!isAdmin(db, who)) fail('unauthorized: admin only');
}

export function isReporter(db: RoDb, who: Identity, reportId: bigint): boolean {
  const r = db.report.id.find(reportId);
  return !!r && r.reporter.isEqual(who);
}

// ---- Owner access (accounts) -------------------------------------------------------------------------------
// Ownership of a property = a 'verified' verification row held by the caller's identity OR by ANY device linked to
// the same account (account_device) OR a property bound to the caller's account (account_property, set when a linked
// device is verified and kept after that device signs out). Every owner-access view, reducer and read_blob goes through the helpers
// below; nothing else should read `verification` to decide access.
//
// Step-up (email_config.require_stepup, default OFF): the FULL-REPORT views and read_blob additionally need the caller's
// account_device.stepup_until to be set (views have no clock; account_tick clears it on expiry) and, where a clock
// exists (procedures), in the future. A verified owner with no account gets nothing from those views while it is on.

/** The account the identity's device is linked to, if any. */
export function accountIdOf(db: RoDb, who: Identity): bigint | undefined {
  return db.account_device.identity.find(who)?.account_id;
}

/** The caller plus every other device linked to the caller's account (just the caller when there is no account). */
export function accountIdentities(db: RoDb, who: Identity): Identity[] {
  const accountId = accountIdOf(db, who);
  if (accountId === undefined) return [who];
  const out: Identity[] = [who];
  for (const d of db.account_device.account_id.filter(accountId)) if (!d.identity.isEqual(who)) out.push(d.identity);
  return out;
}

export function stepupRequired(db: RoDb): boolean {
  return db.email_config.id.find(0)?.require_stepup === true;
}

/**
 * May the caller read full report details right now? Always true while require_stepup is off.
 * `nowMicros` is passed from procedures/reducers; views omit it (the scheduled tick clears expired step-ups instead).
 */
export function hasReportAccess(db: RoDb, who: Identity, nowMicros?: bigint): boolean {
  if (!stepupRequired(db)) return true;
  const dev = db.account_device.identity.find(who);
  if (!dev || !dev.stepup_until) return false;
  return nowMicros === undefined || dev.stepup_until.microsSinceUnixEpoch > nowMicros;
}

/** Property ids the caller owns: verified by this identity or any device of the same account. Not step-up gated. */
export function verifiedPropertyIds(db: RoDb, who: Identity): Set<bigint> {
  const out = new Set<bigint>();
  for (const id of accountIdentities(db, who)) {
    for (const v of db.verification.identity.filter(id)) {
      if (v.state === 'verified') out.add(v.property_id);
    }
  }
  // Properties bound to the account (they survive the verifying device signing out).
  const accountId = accountIdOf(db, who);
  if (accountId !== undefined) for (const b of db.account_property.account_id.filter(accountId)) out.add(b.property_id);
  return out;
}

/** Owned property ids for FULL-REPORT access: empty when step-up is required and the caller has not stepped up. */
export function reportPropertyIds(db: RoDb, who: Identity, nowMicros?: bigint): Set<bigint> {
  return hasReportAccess(db, who, nowMicros) ? verifiedPropertyIds(db, who) : new Set<bigint>();
}

/** Ownership only (not step-up gated): used by write reducers. */
export function isVerifiedFor(db: RoDb, who: Identity, propertyId: bigint): boolean {
  return verifiedPropertyIds(db, who).has(propertyId);
}

/** Full-report read access to one property (ownership + step-up). Used by read_blob. */
export function canReadReport(db: RoDb, who: Identity, propertyId: bigint, nowMicros?: bigint): boolean {
  return hasReportAccess(db, who, nowMicros) && isVerifiedFor(db, who, propertyId);
}

export function propertyHasVerified(db: RoDb, propertyId: bigint): boolean {
  for (const v of db.verification.property_id.filter(propertyId)) {
    if (v.state === 'verified') return true;
  }
  return false;
}
