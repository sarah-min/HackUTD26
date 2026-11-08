// Admin-only security reducers (CONTRACTS.md §5.4): resolve held claims / verifications, tune the hardening config.
import { t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { requireAdmin } from '../auth';
import { REASON_DUPLICATE_CLAIM, REASON_NEEDS_REVIEW, fail } from '../constants';
import { grantOrHold, grantVerified, rejectHeld } from '../verification_decide';
import { getSecurityConfig } from '../security';

const MAX_CAP = 100_000;

/**
 * Resolves an open claim conflict. approve = the claimant (the held 'duplicate_claim' verification) becomes a verified owner as
 * well (access granted, account properties bound as usual); reject = it stays 'failed' with fail_reason 'review_rejected'.
 * An explicit admin approval is the one thing that bypasses the duplicate rule.
 */
export const admin_resolve_claim = spacetimedb.reducer(
  { conflict_id: t.u64(), approve: t.bool() },
  (ctx, { conflict_id, approve }) => {
    requireAdmin(ctx.db, ctx.sender);
    const c = ctx.db.claim_conflict.id.find(conflict_id);
    if (!c) fail('conflict not found');
    if (c.status !== 'open') fail(`already resolved: ${c.status}`);
    const v = ctx.db.verification.id.find(c.new_verification_id);
    if (!v) fail('verification not found');
    if (v.state !== 'failed' || v.fail_reason !== REASON_DUPLICATE_CLAIM) fail(`verification is not held (state ${v.state})`);
    if (approve) grantVerified(ctx.db, v, ctx.timestamp, v.name_on_doc);
    else rejectHeld(ctx.db, v, ctx.timestamp);
    ctx.db.claim_conflict.id.update({ ...c, status: approve ? 'approved' : 'rejected', resolved_at: ctx.timestamp });
  }
);

/**
 * Resolves a verification held with fail_reason 'needs_review' (ID tamper cues flagged by the worker). approve goes through the
 * normal grant path INCLUDING the duplicate-claim rule (so approving cannot bypass an existing owner: it is then held as a
 * 'duplicate_claim' and needs admin_resolve_claim); reject = 'failed' with fail_reason 'review_rejected'.
 */
export const admin_resolve_verification = spacetimedb.reducer(
  { verification_id: t.u64(), approve: t.bool() },
  (ctx, { verification_id, approve }) => {
    requireAdmin(ctx.db, ctx.sender);
    const v = ctx.db.verification.id.find(verification_id);
    if (!v) fail('verification not found');
    if (v.state === 'failed' && v.fail_reason === REASON_DUPLICATE_CLAIM) fail('held as duplicate_claim: use admin_resolve_claim');
    if (v.state !== 'failed' || v.fail_reason !== REASON_NEEDS_REVIEW) fail('verification is not held for review');
    if (approve) grantOrHold(ctx.db, v, ctx.timestamp, v.name_on_doc);
    else rejectHeld(ctx.db, v, ctx.timestamp);
  }
);

/** Sets the single security_config row. Omitted args keep their current value (or the default when no row exists yet). */
export const admin_set_security_config = spacetimedb.reducer(
  {
    hold_duplicate_claims: t.bool().optional(),
    max_verification_starts_per_hour_global: t.u32().optional(),
    max_verification_starts_per_property_per_day: t.u32().optional(),
  },
  (ctx, a) => {
    requireAdmin(ctx.db, ctx.sender);
    const cur = getSecurityConfig(ctx.db);
    const global = a.max_verification_starts_per_hour_global ?? cur.maxStartsPerHourGlobal;
    const perProperty = a.max_verification_starts_per_property_per_day ?? cur.maxStartsPerPropertyPerDay;
    if (global < 1 || global > MAX_CAP) fail(`max_verification_starts_per_hour_global must be 1-${MAX_CAP}`);
    if (perProperty < 1 || perProperty > MAX_CAP) fail(`max_verification_starts_per_property_per_day must be 1-${MAX_CAP}`);
    const row = {
      id: 0,
      hold_duplicate_claims: a.hold_duplicate_claims ?? cur.holdDuplicateClaims,
      max_verification_starts_per_hour_global: global,
      max_verification_starts_per_property_per_day: perProperty,
    };
    if (ctx.db.security_config.id.find(0)) ctx.db.security_config.id.update(row);
    else ctx.db.security_config.insert(row);
  }
);
