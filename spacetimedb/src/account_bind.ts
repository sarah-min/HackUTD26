// Binds verified properties to accounts (not exported from index.ts).
import type { Identity, Timestamp } from 'spacetimedb';
import type { Db } from './constants';
import { logAccess } from './security';

/** Binds every verified verification held by `who` to `accountId` (idempotent per property). `audit` writes an access_log 'claim' entry per newly bound property (sign-in / enroll only; record_verification logs 'verify' itself). */
export function bindVerifiedProperties(db: Db, accountId: bigint, who: Identity, now: Timestamp, audit = false): void {
  const have = new Set<bigint>();
  for (const b of db.account_property.account_id.filter(accountId)) have.add(b.property_id);
  for (const v of db.verification.identity.filter(who)) {
    if (v.state !== 'verified' || have.has(v.property_id)) continue;
    db.account_property.insert({ id: 0n, account_id: accountId, property_id: v.property_id, verification_id: v.id, added_at: now });
    have.add(v.property_id);
    if (audit) logAccess(db, who, v.property_id, 'claim', now); // account sign-in/enroll bound this property
  }
}

/** Called when a verification becomes 'verified': if its identity is signed in to an account, the account owns the property. */
export function bindIfLinked(db: Db, who: Identity, now: Timestamp): void {
  const dev = db.account_device.identity.find(who);
  if (dev) bindVerifiedProperties(db, dev.account_id, who, now);
}
