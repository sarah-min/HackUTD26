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

export function isVerifiedFor(db: RoDb, who: Identity, propertyId: bigint): boolean {
  for (const v of db.verification.identity.filter(who)) {
    if (v.property_id === propertyId && v.state === 'verified') return true;
  }
  return false;
}

/** Property ids the identity is verified for. */
export function verifiedPropertyIds(db: RoDb, who: Identity): Set<bigint> {
  const out = new Set<bigint>();
  for (const v of db.verification.identity.filter(who)) {
    if (v.state === 'verified') out.add(v.property_id);
  }
  return out;
}

export function propertyHasVerified(db: RoDb, propertyId: bigint): boolean {
  for (const v of db.verification.property_id.filter(propertyId)) {
    if (v.state === 'verified') return true;
  }
  return false;
}
