import { randomUUID } from 'node:crypto';

export const MEDIA_VIDEO_MAX_BYTES = 200 * 1024 * 1024;
export const MEDIA_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const IDV_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const PRESIGN_PUT_TTL_SEC = 10 * 60;
export const PRESIGN_GET_TTL_SEC = 10 * 60;

export const MEDIA_CONTENT_TYPES = [
  'video/mp4',
  'video/quicktime',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const IDV_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type MediaContentType = (typeof MEDIA_CONTENT_TYPES)[number];
export type IdvContentType = (typeof IDV_CONTENT_TYPES)[number];

const EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function isIdvKey(key: string): boolean {
  return key === 'idv' || key.startsWith('idv/');
}

export function mediaObjectKey(reportId: string, sha256: string, contentType: string): string {
  const ext = EXT[contentType] ?? 'bin';
  return `media/${reportId}/${sha256}.${ext}`;
}

export function idvObjectKey(verificationId: string, contentType: string): string {
  const ext = EXT[contentType] ?? 'jpg';
  return `idv/${verificationId}/${randomUUID()}.${ext}`;
}

export function frameObjectKey(reportId: string, frameIndex: number): string {
  return `frames/${reportId}/${frameIndex}.jpg`;
}

export function assertMediaUpload(contentType: string, sizeBytes: number): void {
  if (!(MEDIA_CONTENT_TYPES as readonly string[]).includes(contentType)) {
    throw new Error(`unsupported media contentType: ${contentType}`);
  }
  const max = contentType.startsWith('video/') ? MEDIA_VIDEO_MAX_BYTES : MEDIA_IMAGE_MAX_BYTES;
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > max) {
    throw new Error(`media sizeBytes out of range (max ${max})`);
  }
}

export function assertIdvUpload(contentType: string, sizeBytes: number): void {
  if (!(IDV_CONTENT_TYPES as readonly string[]).includes(contentType)) {
    throw new Error(`unsupported idv contentType: ${contentType}`);
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > IDV_IMAGE_MAX_BYTES) {
    throw new Error(`idv sizeBytes out of range (max ${IDV_IMAGE_MAX_BYTES})`);
  }
}
