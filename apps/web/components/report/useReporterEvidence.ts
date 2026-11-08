'use client';

import { useCallback } from 'react';
import {
  R,
  mediaKeyFor,
  useReducer,
  useUploadFile,
} from '@/lib/stdb';

const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime']);
const IMAGE_TYPES = setOf(['image/jpeg', 'image/png', 'image/webp']);
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_IMAGES = 8;

function setOf(items: string[]) {
  return new Set(items);
}

export function mediaKind(file: File): 'video' | 'image' | null {
  if (VIDEO_TYPES.has(file.type)) return 'video';
  if (IMAGE_TYPES.has(file.type)) return 'image';
  return null;
}

/** Validate reporter evidence set: 1 video XOR ≤8 photos. */
export function validateEvidence(files: File[]): string | null {
  if (files.length === 0) return 'Add a photo or short video before submitting.';
  const kinds = files.map(mediaKind);
  if (kinds.some((k) => k === null)) {
    return 'Use JPEG/PNG/WebP photos or an MP4/MOV video.';
  }
  const videos = files.filter((_, i) => kinds[i] === 'video');
  const images = files.filter((_, i) => kinds[i] === 'image');
  if (videos.length > 0 && images.length > 0) return 'Use either one video or photos — not both.';
  if (videos.length > 1) return 'Only one video per submission.';
  if (images.length > MAX_IMAGES) return `At most ${MAX_IMAGES} photos.`;
  for (const f of videos) {
    if (f.size > MAX_VIDEO_BYTES) return 'Video must be 200 MB or smaller.';
  }
  for (const f of images) {
    if (f.size > MAX_IMAGE_BYTES) return 'Each photo must be 25 MB or smaller.';
  }
  return null;
}

/**
 * Upload evidence into SpacetimeDB storage, attach_media, then submit_report (P3 handoff).
 */
export function useReporterEvidence() {
  const uploadFile = useUploadFile();
  const attachMedia = useReducer(R.attachMedia);
  const submitReport = useReducer(R.submitReport);

  const uploadAttachSubmit = useCallback(
    async (
      reportId: bigint,
      files: File[],
      onProgress?: (label: string, fraction: number) => void,
    ) => {
      const err = validateEvidence(files);
      if (err) throw new Error(err);
      const idStr = reportId.toString(10);
      const total = files.length;
      for (let i = 0; i < files.length; i++) {
        const file = files[i]!;
        const kind = mediaKind(file)!;
        onProgress?.(`Uploading ${i + 1}/${total}`, i / total);
        const { objectKey, sha256 } = await mediaKeyFor(idStr, file);
        const { sizeBytes } = await uploadFile(objectKey, file, (frac) => {
          onProgress?.(`Uploading ${i + 1}/${total}`, (i + frac) / total);
        });
        await attachMedia({
          reportId,
          kind,
          objectKey,
          contentType: file.type,
          sizeBytes: BigInt(sizeBytes),
          sha256,
        });
      }
      onProgress?.('Submitting', 1);
      await submitReport({ reportId });
    },
    [attachMedia, submitReport, uploadFile],
  );

  return { uploadAttachSubmit, validateEvidence };
}
