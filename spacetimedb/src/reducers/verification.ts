// Affected-person verification reducers (CONTRACTS §5.2).
import { t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { isVerifiedFor, requireService } from '../auth';
import { parseAddress, upsertProperty } from '../matching';
import { enqueueJob } from '../jobs';
import { grantOrHold } from '../verification_decide';
import { getSecurityConfig, DAY_MICROS } from '../security';
import { deleteBlob, requireOwnBlob } from '../blobs';
import { DOC_KINDS, FAIL_REASONS, HOUR_MICROS, IDV_MAX_ATTEMPTS_PER_HOUR, fail, oneOf } from '../constants';

// Same style as the per-identity limit; the web client matches on 'rate_limited'.
const TOO_MANY = 'rate_limited: too many verification attempts, try again later';

export const start_verification = spacetimedb.reducer(
  { address_json: t.string(), doc_kind: t.string(), secret_hash: t.string() },
  (ctx, { address_json, doc_kind, secret_hash }) => {
    const kind = oneOf(DOC_KINDS, doc_kind, 'doc_kind');
    const hash = secret_hash.toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(hash)) fail('secret_hash must be 64 hex chars');
    let raw: unknown;
    try {
      raw = JSON.parse(address_json);
    } catch {
      fail('address_json is not valid JSON');
    }
    const address = parseAddress(raw);

    const now = ctx.timestamp.microsSinceUnixEpoch;
    let recent = 0;
    let total = 0;
    for (const v of ctx.db.verification.identity.filter(ctx.sender)) {
      total++;
      if (now - v.created_at.microsSinceUnixEpoch < HOUR_MICROS) recent++;
    }
    // Reducers can't return data; the client sees this error message.
    if (recent >= IDV_MAX_ATTEMPTS_PER_HOUR) fail('rate_limited');

    // Global and per-property caps: the module can't see IPs and anonymous identities are free to mint, so per-identity
    // limits are evadable. Counted from the verification_start ledger (rows purged after 24 h by the maintenance tick;
    // rejected calls roll back and are not counted).
    const cfg = getSecurityConfig(ctx.db);
    let globalRecent = 0;
    for (const r of ctx.db.verification_start.iter()) {
      if (now - r.at.microsSinceUnixEpoch < HOUR_MICROS) globalRecent++;
    }
    if (globalRecent >= cfg.maxStartsPerHourGlobal) fail(TOO_MANY);

    const propertyId = upsertProperty(ctx, address);
    let propertyRecent = 0;
    for (const r of ctx.db.verification_start.property_id.filter(propertyId)) {
      if (now - r.at.microsSinceUnixEpoch < DAY_MICROS) propertyRecent++;
    }
    // A caller that already owns this property (own verification, or bound to its account) is exempt, so strangers cannot
    // burn the per-property budget to stop the real owner from re-verifying. Everyone else is still capped. Only calls that
    // got this far insert a ledger row; a rejected call rolls back and is never counted.
    const ownsProperty = isVerifiedFor(ctx.db, ctx.sender, propertyId);
    if (!ownsProperty && propertyRecent >= cfg.maxStartsPerPropertyPerDay) fail(TOO_MANY); // rolls back the property upsert too
    ctx.db.verification_start.insert({ id: 0n, property_id: propertyId, at: ctx.timestamp });
    ctx.db.verification.insert({
      id: 0n,
      identity: ctx.sender,
      property_id: propertyId,
      doc_kind: kind,
      state: 'pending',
      fail_reason: undefined,
      name_on_doc: undefined,
      secret_hash: hash,
      object_key: undefined,
      attempt_no: Math.min(total + 1, 255),
      created_at: ctx.timestamp,
      decided_at: undefined,
    });
  }
);

export const submit_verification = spacetimedb.reducer(
  { verification_id: t.u64(), object_key: t.string() },
  (ctx, { verification_id, object_key }) => {
    const v = ctx.db.verification.id.find(verification_id);
    if (!v) fail('verification not found');
    if (!v.identity.isEqual(ctx.sender)) fail('unauthorized: not your verification');
    if (v.state !== 'pending') fail(`cannot submit in state ${v.state}`);
    if (v.object_key !== undefined) fail('already submitted');
    if (!object_key.startsWith(`idv/${verification_id}/`)) fail('object_key must start with idv/<verificationId>/');
    requireOwnBlob(ctx.db, object_key, ctx.sender); // the ID image is stored in this database
    ctx.db.verification.id.update({ ...v, object_key });
    enqueueJob(ctx, { kind: 'verify_identity', verification_id, property_id: v.property_id });
  }
);

export const record_verification = spacetimedb.reducer(
  {
    verification_id: t.u64(),
    ok: t.bool(),
    fail_reason: t.string().optional(),
    name_on_doc: t.string().optional(),
  },
  (ctx, { verification_id, ok, fail_reason, name_on_doc }) => {
    requireService(ctx.db, ctx.sender);
    const v = ctx.db.verification.id.find(verification_id);
    if (!v) fail('verification not found');
    if (v.state !== 'pending' && v.state !== 'processing') fail(`already decided: ${v.state}`);
    if (!ok && fail_reason === undefined) fail('fail_reason required when ok=false');
    const reason = ok ? undefined : oneOf(FAIL_REASONS, fail_reason!, 'fail_reason');
    if (name_on_doc !== undefined && name_on_doc.length > 120) fail('name_on_doc too long');
    // The ID image is never kept once decided (the worker also deletes it; this is the guarantee).
    if (v.object_key) deleteBlob(ctx.db, v.object_key);
    if (ok) {
      // Grants access, unless another identity already owns the property (then: held as 'duplicate_claim', see security.ts).
      grantOrHold(ctx.db, v, ctx.timestamp, name_on_doc);
      return;
    }
    // 'needs_review' is a HOLD: state stays 'failed' until an admin calls admin_resolve_verification.
    ctx.db.verification.id.update({
      ...v,
      state: 'failed',
      fail_reason: reason,
      name_on_doc: undefined,
      object_key: undefined,
      decided_at: ctx.timestamp,
    });
  }
);
