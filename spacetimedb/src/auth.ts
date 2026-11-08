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
// Ownership of a property = a 'verified' verification row held by the caller's OWN identity (unless revoked, below) OR a
// property bound to the caller's account (account_property). Another device's own verification row never grants access to
// the account's other devices: it only counts once it is explicitly BOUND (create_account, or a linked device completing a
// verification). sign_in_with_code is inherit-only: the signing device gets the account's properties but never pushes its own
// into the account. Every owner-access view, reducer and read_blob goes through the helpers below; nothing else should read
// `verification` to decide access.
//
// Revocation (device_revocation): remove_device / sign_out_device mark the identity revoked. A revoked identity cannot use
// verification rows it created before revoked_at and, having no account link, gets no account access, until it signs in
// again with a valid code (row deleted) or completes a NEW verification (created after revoked_at).
//
// Step-up (account_config.require_stepup, default OFF): the FULL-REPORT views and read_blob additionally need the caller's
// account_device.stepup_until to be set (views have no clock; account_tick clears it on expiry) and, where a clock
// exists (procedures), in the future. A verified owner with no account gets nothing from those views while it is on.
// Destructive account actions (remove_device, delete_account, set_device_label) ALWAYS need an active step-up window.

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
  return db.account_config.id.find(0)?.require_stepup === true;
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

/** Epoch micros when this identity was revoked (remove_device / sign_out_device), or undefined. */
export function revokedAtMicros(db: RoDb, who: Identity): bigint | undefined {
  return db.device_revocation.identity.find(who)?.revoked_at.microsSinceUnixEpoch;
}

/** The 'verified' verification rows this identity may still use: all of them, or only those started after its revocation. */
export function ownVerifiedRows(db: RoDb, who: Identity) {
  const revoked = revokedAtMicros(db, who);
  const out = [];
  for (const v of db.verification.identity.filter(who)) {
    if (v.state !== 'verified') continue;
    if (revoked !== undefined && v.created_at.microsSinceUnixEpoch <= revoked) continue;
    out.push(v);
  }
  return out;
}

/** Fails with 'stepup_required' unless the caller's device has a step-up window that is still open at `nowMicros`. */
export function requireActiveStepup(db: RoDb, who: Identity, nowMicros: bigint): void {
  const dev = db.account_device.identity.find(who);
  if (!dev?.stepup_until || dev.stepup_until.microsSinceUnixEpoch <= nowMicros) fail('stepup_required');
}

/** Property ids the caller owns: its own non-revoked verifications plus the properties bound to its account. Not step-up gated. */
export function verifiedPropertyIds(db: RoDb, who: Identity): Set<bigint> {
  const out = new Set<bigint>();
  for (const v of ownVerifiedRows(db, who)) out.add(v.property_id);
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
