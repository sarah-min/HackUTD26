import { createHash } from 'node:crypto';
import {
  assertIdvUpload,
  assertMediaUpload,
  idvObjectKey,
  mediaObjectKey,
} from '@hack/storage';

export type PresignMediaBody = {
  kind: 'media';
  reportId: string;
  reporterSecret: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
};

export type PresignIdvBody = {
  kind: 'idv';
  verificationId: string;
  verificationSecret: string;
  contentType: string;
  sizeBytes: number;
};

export type PresignBody = PresignMediaBody | PresignIdvBody;

export function sha256HexSync(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function parsePresignBody(raw: unknown): PresignBody | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'invalid_json' };
  const body = raw as Record<string, unknown>;
  if (body.kind === 'media') {
    const reportId = String(body.reportId ?? '');
    const reporterSecret = String(body.reporterSecret ?? '');
    const contentType = String(body.contentType ?? '');
    const sizeBytes = Number(body.sizeBytes);
    const sha256 = String(body.sha256 ?? '').toLowerCase();
    if (!reportId || !reporterSecret || !sha256 || sha256.length !== 64) {
      return { error: 'invalid_media_fields' };
    }
    try {
      assertMediaUpload(contentType, sizeBytes);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'invalid_media' };
    }
    return { kind: 'media', reportId, reporterSecret, contentType, sizeBytes, sha256 };
  }
  if (body.kind === 'idv') {
    const verificationId = String(body.verificationId ?? '');
    const verificationSecret = String(body.verificationSecret ?? '');
    const contentType = String(body.contentType ?? '');
    const sizeBytes = Number(body.sizeBytes);
    if (!verificationId || !verificationSecret) return { error: 'invalid_idv_fields' };
    try {
      assertIdvUpload(contentType, sizeBytes);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'invalid_idv' };
    }
    return { kind: 'idv', verificationId, verificationSecret, contentType, sizeBytes };
  }
  return { error: 'invalid_kind' };
}

export function objectKeyFor(body: PresignBody): string {
  if (body.kind === 'media') return mediaObjectKey(body.reportId, body.sha256, body.contentType);
  return idvObjectKey(body.verificationId, body.contentType);
}
