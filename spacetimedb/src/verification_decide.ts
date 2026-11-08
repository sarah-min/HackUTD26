// Shared verification decision logic (not exported from index.ts): grant ownership, or hold a claim for admin review.
import type { Timestamp } from 'spacetimedb';
import { REASON_DUPLICATE_CLAIM, REASON_REVIEW_REJECTED, type Db } from './constants';
import { bindIfLinked } from './account_bind';
import { conflictingVerification, getSecurityConfig, logAccess } from './security';

type VerificationRow = NonNullable<ReturnType<Db['verification']['id']['find']>>;

/** Marks the verification verified: grants access, binds a linked account, marks reports claimed, writes the audit entry. */
export function grantVerified(db: Db, v: VerificationRow, now: Timestamp, nameOnDoc: string | undefined): void {
  db.verification.id.update({
    ...v,
    state: 'verified',
    fail_reason: undefined,
    name_on_doc: nameOnDoc,
    object_key: undefined,
    decided_at: now,
  });
  bindIfLinked(db, v.identity, now); // a signed-in device's account now owns this property
  for (const r of [...db.report.property_id.filter(v.property_id)]) {
    if (!r.claimed) db.report.id.update({ ...r, claimed: true, updated_at: now });
  }
  logAccess(db, v.identity, v.property_id, 'verify', now);
}

/**
 * The check passed (ok): grant ownership, unless the property already has a DIFFERENT verified owner and
 * security_config.hold_duplicate_claims is on. Then the new verification is held (state 'failed', fail_reason
 * 'duplicate_claim', still linked to the property) and a private claim_conflict row is recorded. Returns true when granted.
 */
export function grantOrHold(db: Db, v: VerificationRow, now: Timestamp, nameOnDoc: string | undefined): boolean {
  const existing = getSecurityConfig(db).holdDuplicateClaims ? conflictingVerification(db, v.identity, v.property_id) : undefined;
  if (!existing) {
    grantVerified(db, v, now, nameOnDoc);
    return true;
  }
  db.verification.id.update({
    ...v,
    state: 'failed',
    fail_reason: REASON_DUPLICATE_CLAIM,
    name_on_doc: nameOnDoc, // kept (private) so the admin can compare; cleared on reject
    object_key: undefined,
    decided_at: now,
  });
  db.claim_conflict.insert({
    id: 0n,
    property_id: v.property_id,
    existing_verification_id: existing.id,
    new_verification_id: v.id,
    created_at: now,
    status: 'open',
    resolved_at: undefined,
  });
  return false;
}

/** An admin rejected a held verification: stays 'failed', reason becomes 'review_rejected', the extracted name is dropped. */
export function rejectHeld(db: Db, v: VerificationRow, now: Timestamp): void {
  db.verification.id.update({ ...v, state: 'failed', fail_reason: REASON_REVIEW_REJECTED, name_on_doc: undefined, decided_at: now });
}
