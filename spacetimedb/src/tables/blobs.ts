// File storage inside SpacetimeDB (replaces S3 / Vultr Object Storage). Private tables: bytes are only
// written through the upload reducers and only read through the read_blob procedure, which authorize every call.
// Keys keep the old object-storage shapes: media/<reportId>/<sha256>.<ext>, idv/<verificationId>/<name>,
// frames/<reportId>/<n>.jpg.
import { table, t } from 'spacetimedb/server';

export const blob = table(
  { name: 'blob' },
  {
    object_key: t.string().primaryKey(),
    owner: t.identity(), // uploader (reporter, affected person or worker)
    content_type: t.string(),
    size_bytes: t.u64(),
    sha256: t.string(), // as declared by the uploader (hex)
    chunk_count: t.u32(),
    received: t.u32(),
    complete: t.bool(),
    created_at: t.timestamp(),
  }
);

export const blob_chunk = table(
  { name: 'blob_chunk' },
  {
    id: t.u64().primaryKey().autoInc(),
    object_key: t.string().index('btree'),
    seq: t.u32(),
    bytes: t.byteArray(),
  }
);
