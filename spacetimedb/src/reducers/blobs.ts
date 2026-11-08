// File storage reducers + read procedure (storage inside SpacetimeDB; replaces /api/uploads/presign and
// /api/media). Uploads go over the client's own connection, so the caller is authorized by identity:
//   media/<reportId>/...   the report's reporter, while the report accepts footage
//   idv/<verificationId>/... the person who started that verification, while it is pending
//   frames/<reportId>/...  the worker (service role)
// Reads (read_blob): the worker reads anything; a verified affected person (or a device on the same account, with a current step-up
// when email_config.require_stepup is on) reads media/ and frames/ of their property; idv/ is never readable by a client.
import { t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { hasReportAccess, isReporter, isService, isVerifiedFor, requireService } from '../auth';
import { fail, oneOf, type Db } from '../constants';
import { logAccess } from '../security';
import {
  BLOB_CHUNK_BYTES, FRAME_MAX_BYTES, MAX_IDV_BLOBS_PER_VERIFICATION, MAX_MEDIA_BLOBS_PER_REPORT, MAX_MEDIA_BYTES_PER_REPORT, blobsWithPrefix, IDV_IMAGE_MAX_BYTES, IMAGE_CONTENT_TYPES, MEDIA_CONTENT_TYPES,
  MEDIA_IMAGE_MAX_BYTES, MEDIA_VIDEO_MAX_BYTES, deleteBlob, parseKey,
} from '../blobs';

const UPLOADABLE = new Set(['draft', 'needs_more_footage', 'failed']);
const HEX64 = /^[0-9a-f]{64}$/;

function authorizeWrite(ctx: { db: Db; sender: any }, key: string, contentType: string, size: bigint): void {
  const k = parseKey(key);
  if (k.kind === 'media') {
    const r = ctx.db.report.id.find(k.reportId);
    if (!r) fail('report not found');
    if (!isReporter(ctx.db, ctx.sender, k.reportId)) fail('unauthorized: reporter only');
    if (!UPLOADABLE.has(r.status)) fail(`cannot upload in status ${r.status}`);
    oneOf(MEDIA_CONTENT_TYPES, contentType, 'content_type');
    const max = contentType.startsWith('video/') ? MEDIA_VIDEO_MAX_BYTES : MEDIA_IMAGE_MAX_BYTES;
    if (size > BigInt(max)) fail(`file too large (max ${max} bytes)`);
  } else if (k.kind === 'idv') {
    const v = ctx.db.verification.id.find(k.verificationId);
    if (!v) fail('verification not found');
    if (!v.identity.isEqual(ctx.sender)) fail('unauthorized: not your verification');
    if (v.state !== 'pending' || v.object_key !== undefined) fail(`cannot upload in state ${v.state}`);
    oneOf(IMAGE_CONTENT_TYPES, contentType, 'content_type');
    if (size > BigInt(IDV_IMAGE_MAX_BYTES)) fail(`file too large (max ${IDV_IMAGE_MAX_BYTES} bytes)`);
  } else {
    requireService(ctx.db, ctx.sender);
    oneOf(IMAGE_CONTENT_TYPES, contentType, 'content_type');
    if (size > BigInt(FRAME_MAX_BYTES)) fail('frame too large');
  }
}

/** Starts (or restarts) an upload. Then call upload_chunk for seq 0..chunk_count-1 (each <= 512 KiB). */
export const begin_upload = spacetimedb.reducer(
  { object_key: t.string(), content_type: t.string(), size_bytes: t.u64(), sha256: t.string(), chunk_count: t.u32() },
  (ctx, a) => {
    authorizeWrite(ctx, a.object_key, a.content_type, a.size_bytes);
    const sha = a.sha256.toLowerCase();
    if (!HEX64.test(sha)) fail('sha256 must be 64 hex chars');
    if (a.size_bytes === 0n) fail('empty file');
    const expected = Number((a.size_bytes + BigInt(BLOB_CHUNK_BYTES) - 1n) / BigInt(BLOB_CHUNK_BYTES));
    if (a.chunk_count !== expected) fail(`chunk_count must be ${expected} for ${a.size_bytes} bytes`);
    const k = parseKey(a.object_key);
    if (k.kind === 'media') {
      // Re-shoots get a fresh budget: files attached in earlier rounds don't count against this round's cap.
      const round = ctx.db.report_private.report_id.find(k.reportId)?.submit_count ?? 0;
      const earlier = new Set<string>();
      for (const m of ctx.db.media_asset.report_id.filter(k.reportId)) if (m.round < round) earlier.add(m.object_key);
      const others = blobsWithPrefix(ctx.db, `media/${k.reportId}/`, a.object_key).filter(b => !earlier.has(b.object_key));
      if (others.length >= MAX_MEDIA_BLOBS_PER_REPORT) fail(`too many files for this report (max ${MAX_MEDIA_BLOBS_PER_REPORT})`);
      const bytes = others.reduce((n, b) => n + b.size_bytes, 0n) + a.size_bytes;
      if (bytes > BigInt(MAX_MEDIA_BYTES_PER_REPORT)) fail(`too much media for this report (max ${MAX_MEDIA_BYTES_PER_REPORT} bytes)`);
    } else if (k.kind === 'idv') {
      if (blobsWithPrefix(ctx.db, `idv/${k.verificationId}/`, a.object_key).length >= MAX_IDV_BLOBS_PER_VERIFICATION)
        fail('too many files for this verification');
    }
    const old = ctx.db.blob.object_key.find(a.object_key);
    if (old) {
      if (!old.owner.isEqual(ctx.sender)) fail('object_key already in use');
      if (old.complete && parseKey(a.object_key).kind === 'media') {
        // Re-uploading the same content-addressed media is a no-op once complete.
        if (old.sha256 === sha && old.size_bytes === a.size_bytes) return;
      }
      deleteBlob(ctx.db, a.object_key);
    }
    ctx.db.blob.insert({
      object_key: a.object_key, owner: ctx.sender, content_type: a.content_type, size_bytes: a.size_bytes,
      sha256: sha, chunk_count: a.chunk_count, received: 0, complete: false, created_at: ctx.timestamp,
    });
  }
);

export const upload_chunk = spacetimedb.reducer(
  { object_key: t.string(), seq: t.u32(), bytes: t.byteArray() },
  (ctx, { object_key, seq, bytes }) => {
    const b = ctx.db.blob.object_key.find(object_key);
    if (!b) fail('call begin_upload first');
    if (!b.owner.isEqual(ctx.sender)) fail('unauthorized: not your upload');
    if (b.complete) return; // idempotent re-send
    if (seq >= b.chunk_count) fail('seq out of range');
    const last = seq === b.chunk_count - 1;
    const want = last ? Number(b.size_bytes - BigInt(seq) * BigInt(BLOB_CHUNK_BYTES)) : BLOB_CHUNK_BYTES;
    if (bytes.length !== want) fail(`chunk ${seq} must be ${want} bytes`);
    for (const c of ctx.db.blob_chunk.object_key.filter(object_key)) if (c.seq === seq) return; // duplicate
    ctx.db.blob_chunk.insert({ id: 0n, object_key, seq, bytes });
    const received = b.received + 1;
    ctx.db.blob.object_key.update({ ...b, received, complete: received === b.chunk_count });
  }
);

/** Worker: store a small object (frame thumbnail) in one call. */
export const put_blob = spacetimedb.reducer(
  { object_key: t.string(), content_type: t.string(), bytes: t.byteArray() },
  (ctx, { object_key, content_type, bytes }) => {
    requireService(ctx.db, ctx.sender);
    if (parseKey(object_key).kind !== 'frames') fail('put_blob is for frames/ keys');
    authorizeWrite(ctx, object_key, content_type, BigInt(bytes.length));
    deleteBlob(ctx.db, object_key);
    ctx.db.blob.insert({
      object_key, owner: ctx.sender, content_type, size_bytes: BigInt(bytes.length), sha256: '0'.repeat(64),
      chunk_count: 1, received: 1, complete: true, created_at: ctx.timestamp,
    });
    ctx.db.blob_chunk.insert({ id: 0n, object_key, seq: 0, bytes });
  }
);

/** Worker: delete an object (the ID image after extraction). */
export const delete_blob = spacetimedb.reducer({ object_key: t.string() }, (ctx, { object_key }) => {
  requireService(ctx.db, ctx.sender);
  parseKey(object_key);
  deleteBlob(ctx.db, object_key);
});

const BlobPart = t.object('BlobPart', {
  content_type: t.string(),
  size_bytes: t.u64(),
  chunk_count: t.u32(),
  seq: t.u32(),
  bytes: t.byteArray(),
});

/**
 * Reads one chunk of a complete object. Call with seq 0, then 1..chunk_count-1. Returns an error string for
 * missing objects or callers who may not read them (procedures can't throw SenderError to clients reliably).
 */
export const read_blob = spacetimedb.procedure(
  { object_key: t.string(), seq: t.u32() },
  t.object('ReadBlobResult', { ok: t.bool(), error: t.string(), part: t.option(BlobPart) }),
  (ctx, { object_key, seq }) =>
    ctx.withTx(tx => {
      const err = (error: string) => ({ ok: false, error, part: undefined });
      let k;
      try {
        k = parseKey(object_key);
      } catch {
        return err('invalid object_key');
      }
      const service = isService(tx.db, ctx.sender);
      let ownedProperty: bigint | undefined;
      if (!service) {
        if (k.kind === 'idv') return err('forbidden');
        const r = tx.db.report.id.find(k.reportId);
        if (!r || !isVerifiedFor(tx.db, ctx.sender, r.property_id)) return err('forbidden');
        // Owner, but the full report needs a current email step-up (only when email_config.require_stepup is on).
        if (!hasReportAccess(tx.db, ctx.sender, tx.timestamp.microsSinceUnixEpoch)) return err('stepup_required');
        ownedProperty = r.property_id;
      }
      const b = tx.db.blob.object_key.find(object_key);
      if (!b || !b.complete) return err('not_found');
      if (seq >= b.chunk_count) return err('seq out of range');
      let bytes: Uint8Array | undefined;
      for (const c of tx.db.blob_chunk.object_key.filter(object_key)) if (c.seq === seq) bytes = c.bytes;
      if (!bytes) return err('not_found');
      // Audit log: an OWNER (never the worker) read media/frames. One entry per object (first chunk), never idv/.
      if (ownedProperty !== undefined && seq === 0) logAccess(tx.db, ctx.sender, ownedProperty, 'blob', tx.timestamp, object_key);
      return {
        ok: true, error: '',
        part: { content_type: b.content_type, size_bytes: b.size_bytes, chunk_count: b.chunk_count, seq, bytes },
      };
    })
);
