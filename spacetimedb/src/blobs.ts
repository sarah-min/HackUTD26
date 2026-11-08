// Blob helpers shared by reducers (storage inside SpacetimeDB).
import type { Identity } from 'spacetimedb';
import { fail, type Db, type RoDb } from './constants';

export const BLOB_CHUNK_BYTES = 512 * 1024; // max bytes per upload_chunk call
export const MEDIA_VIDEO_MAX_BYTES = 100 * 1024 * 1024;
export const MEDIA_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const IDV_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const FRAME_MAX_BYTES = 2 * 1024 * 1024;
export const MEDIA_CONTENT_TYPES = ['video/mp4', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp'] as const;
export const IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** Per-report storage caps (SpacetimeDB holds table data in memory). */
export const MAX_MEDIA_BLOBS_PER_REPORT = 9;
export const MAX_MEDIA_BYTES_PER_REPORT = 60 * 1024 * 1024;
export const MAX_IDV_BLOBS_PER_VERIFICATION = 3;
/** Unfinished uploads and leftover ID images are purged after this long. */
export const BLOB_STALE_MICROS = 3600n * 1_000_000n;

export type KeyKind = { kind: 'media' | 'frames'; reportId: bigint } | { kind: 'idv'; verificationId: bigint };

export function parseKey(key: string): KeyKind {
  if (key.length > 200 || key.includes('..') || key.includes('//')) fail('invalid object_key');
  const m = /^(media|frames|idv)\/(\d{1,19})\/[A-Za-z0-9._-]{1,128}$/.exec(key);
  if (!m) fail('object_key must be media/<reportId>/<name>, frames/<reportId>/<name> or idv/<verificationId>/<name>');
  const id = BigInt(m[2]!);
  return m[1] === 'idv' ? { kind: 'idv', verificationId: id } : { kind: m[1] as 'media' | 'frames', reportId: id };
}

/** Removes a blob and all its chunks (no-op when absent). */
export function deleteBlob(db: Db, key: string): void {
  for (const c of [...db.blob_chunk.object_key.filter(key)]) db.blob_chunk.id.delete(c.id);
  db.blob.object_key.delete(key);
}

/** Blobs under `prefix` (e.g. `media/12/`), excluding `exceptKey`. */
export function blobsWithPrefix(db: RoDb, prefix: string, exceptKey: string) {
  const out = [];
  for (const b of db.blob.iter()) if (b.object_key.startsWith(prefix) && b.object_key !== exceptKey) out.push(b);
  return out;
}

/** A complete blob uploaded by `who`, or a reducer error. */
export function requireOwnBlob(db: RoDb, key: string, who: Identity) {
  const b = db.blob.object_key.find(key);
  if (!b) fail('upload the file first (begin_upload + upload_chunk)');
  if (!b.owner.isEqual(who)) fail('unauthorized: not your upload');
  if (!b.complete) fail('upload not complete');
  return b;
}
