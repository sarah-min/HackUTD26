'use client';
// Reads report media for a verified affected person through P4's /api/media route
// (CONTRACTS.md §8: headers x-verification-id + x-verification-secret). <img> can't send
// headers, so the object is fetched and shown via an object URL. idv/ keys are never requested.
import { useEffect, useState } from 'react';

export async function fetchMediaObjectUrl(
  key: string,
  verification: { id: string; secret: string },
  signal?: AbortSignal,
): Promise<string> {
  if (key.startsWith('idv/')) throw new Error('idv objects are never readable');
  const path = key.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`/api/media/${path}`, {
    headers: { 'x-verification-id': verification.id, 'x-verification-secret': verification.secret },
    signal,
  });
  if (!res.ok) throw new Error(`media ${res.status}`);
  return URL.createObjectURL(await res.blob());
}

/** Object URL for one media key, revoked on unmount. null while loading or on error. */
export function useMediaUrl(key: string | null, verification: { id: string; secret: string } | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!key || !verification) return;
    const ac = new AbortController();
    let made: string | null = null;
    fetchMediaObjectUrl(key, verification, ac.signal)
      .then((u) => {
        made = u;
        setUrl(u);
      })
      .catch(() => setUrl(null));
    return () => {
      ac.abort();
      if (made) URL.revokeObjectURL(made);
    };
  }, [key, verification?.id, verification?.secret]); // eslint-disable-line react-hooks/exhaustive-deps
  return url;
}
