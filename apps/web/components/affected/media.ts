'use client';
// Report media for a verified affected person, read from SpacetimeDB storage (read_blob). The module checks that this
// browser identity is verified for the property; ID images (idv/) are never readable.
import { useFileObjectUrl } from '@/lib/stdb/files';

/** Object URL for one media key, revoked on unmount. null while loading, on error, or when not allowed. */
export function useMediaUrl(key: string | null): string | null {
  return useFileObjectUrl(key);
}
