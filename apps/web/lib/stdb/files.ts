'use client';
// Files stored in SpacetimeDB (replaces /api/uploads/presign, the S3 PUT and /api/media). Uploads and reads go over
// this browser's own connection, so the module authorizes them by identity: the reporter uploads footage for their
// report, the person verifying uploads their ID image, and a verified resident reads footage and frame thumbnails.
// ID images can never be read back. See spacetimedb/src/reducers/blobs.ts.
import { useCallback, useEffect, useState } from 'react';
import { useProcedure, useReducer } from 'spacetimedb/react';
import { P, R } from './bindings';

export const FILE_CHUNK_BYTES = 512 * 1024;
const EXT: Record<string, string> = {
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
};

async function sha256HexOf(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** media/<reportId>/<sha256>.<ext> (content-addressed, so re-uploading the same file is a no-op). */
export async function mediaKeyFor(reportId: string, file: Blob): Promise<{ objectKey: string; sha256: string }> {
  const sha256 = await sha256HexOf(await file.arrayBuffer());
  return { objectKey: `media/${reportId}/${sha256}.${EXT[file.type] ?? 'bin'}`, sha256 };
}

/** idv/<verificationId>/<random>.<ext> */
export function idvKeyFor(verificationId: string, contentType: string): string {
  return `idv/${verificationId}/${crypto.randomUUID()}.${EXT[contentType] ?? 'jpg'}`;
}

/**
 * Returns upload(objectKey, file, onProgress?) → { sha256, sizeBytes }. Then call attach_media (footage) or
 * submit_verification (ID) with the same objectKey.
 */
export function useUploadFile() {
  const begin = useReducer(R.beginUpload);
  const chunk = useReducer(R.uploadChunk);
  return useCallback(
    async (objectKey: string, file: Blob, onProgress?: (fraction: number) => void) => {
      const buf = await file.arrayBuffer();
      const sha256 = await sha256HexOf(buf);
      const chunkCount = Math.ceil(buf.byteLength / FILE_CHUNK_BYTES);
      await begin({ objectKey, contentType: file.type, sizeBytes: BigInt(buf.byteLength), sha256, chunkCount });
      for (let seq = 0; seq < chunkCount; seq++) {
        await chunk({ objectKey, seq, bytes: new Uint8Array(buf, seq * FILE_CHUNK_BYTES, Math.min(FILE_CHUNK_BYTES, buf.byteLength - seq * FILE_CHUNK_BYTES)) });
        onProgress?.((seq + 1) / chunkCount);
      }
      return { sha256, sizeBytes: buf.byteLength };
    },
    [begin, chunk],
  );
}

/** Returns read(objectKey) → Blob, for objects this identity may read. Rejects with 'forbidden' / 'not_found'. */
export function useReadFile() {
  const readBlob = useProcedure(P.readBlob);
  return useCallback(
    async (objectKey: string): Promise<Blob> => {
      if (objectKey.startsWith('idv/')) throw new Error('forbidden');
      const parts: Uint8Array[] = [];
      let count = 1;
      let type = 'application/octet-stream';
      for (let seq = 0; seq < count; seq++) {
        const r = await readBlob({ objectKey, seq });
        if (!r.ok || !r.part) throw new Error(r.error || 'unreadable');
        count = r.part.chunkCount;
        type = r.part.contentType;
        parts.push(r.part.bytes);
      }
      return new Blob(parts as BlobPart[], { type });
    },
    [readBlob],
  );
}

/** Object URL for one stored file (revoked on change/unmount). null while loading, when absent, or not allowed. */
export function useFileObjectUrl(objectKey: string | null | undefined): string | null {
  const read = useReadFile();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!objectKey) return;
    let cancelled = false;
    let made: string | null = null;
    read(objectKey)
      .then((blob) => {
        if (cancelled) return;
        made = URL.createObjectURL(blob);
        setUrl(made);
      })
      .catch(() => !cancelled && setUrl(null));
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [objectKey, read]);
  return url;
}
