// Web-server-only views (role 'web' or 'admin'). The Next.js routes /api/uploads/presign and
// /api/media (Part 4) must authorize requests against secret hashes and key ownership, which live
// in private tables. These views expose ONLY the fields those checks need, and only to the web
// identity (STDB_WEB_TOKEN on the server, never in the browser). Everyone else gets [].
import { t } from 'spacetimedb/server';
import { spacetimedb } from './schema';
import { isWeb } from './auth';

const UPLOADABLE = new Set(['draft', 'needs_more_footage', 'failed']);

/** presign kind=media: sha256(reporterSecret) must equal reporterSecretHash, and the status must allow uploads. */
export const web_report_upload_auth = spacetimedb.view(
  { name: 'web_report_upload_auth', public: true },
  t.array(
    t.row('WebReportUploadAuthRow', {
      report_id: t.u64().primaryKey(),
      reporter_secret_hash: t.string(),
      status: t.string(),
    })
  ),
  ctx => {
    if (!isWeb(ctx.db, ctx.sender)) return [];
    const out = [];
    for (const r of ctx.db.report.iter()) {
      if (!UPLOADABLE.has(r.status)) continue;
      const p = ctx.db.report_private.report_id.find(r.id);
      if (p) out.push({ report_id: r.id, reporter_secret_hash: p.reporter_secret_hash, status: r.status });
    }
    return out;
  }
);

/**
 * presign kind=idv needs state 'pending'; /api/media needs state 'verified' plus the property id.
 * Rows for failed verifications are omitted.
 */
export const web_verification_auth = spacetimedb.view(
  { name: 'web_verification_auth', public: true },
  t.array(
    t.row('WebVerificationAuthRow', {
      verification_id: t.u64().primaryKey(),
      secret_hash: t.string(),
      state: t.string(),
      property_id: t.u64(),
    })
  ),
  ctx => {
    if (!isWeb(ctx.db, ctx.sender)) return [];
    const out = [];
    for (const v of ctx.db.verification.iter()) {
      if (v.state !== 'pending' && v.state !== 'verified') continue;
      out.push({ verification_id: v.id, secret_hash: v.secret_hash, state: v.state, property_id: v.property_id });
    }
    return out;
  }
);

/** /api/media: which property each servable object key belongs to (media + frame thumbnails; never idv/). */
export const web_media_index = spacetimedb.view(
  { name: 'web_media_index', public: true },
  t.array(
    t.row('WebMediaIndexRow', {
      object_key: t.string().primaryKey(),
      report_id: t.u64(),
      property_id: t.u64(),
    })
  ),
  ctx => {
    if (!isWeb(ctx.db, ctx.sender)) return [];
    const out = [];
    for (const r of ctx.db.report.iter()) {
      for (const m of ctx.db.media_asset.report_id.filter(r.id)) {
        out.push({ object_key: m.object_key, report_id: r.id, property_id: r.property_id });
      }
      for (const f of ctx.db.frame.report_id.filter(r.id)) {
        out.push({ object_key: f.thumb_key, report_id: r.id, property_id: r.property_id });
      }
    }
    return out;
  }
);
