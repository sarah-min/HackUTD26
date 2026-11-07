'use client';

import { useEffect, useState } from 'react';

export type MediaUrlResolver = (objectKey: string) => Promise<string | null>;

/**
 * Default resolver: GET /api/media/<key> with the verification headers (CONTRACTS §8). The route answers with a
 * 302 to a presigned GET; the image bytes become an object URL. Pass `resolveMediaUrl` to override.
 */
export function mediaResolver(auth: { verificationId: string; verificationSecret: string }): MediaUrlResolver {
  return async (objectKey) => {
    if (objectKey.startsWith('idv/')) return null;
    const res = await fetch(`/api/media/${objectKey.split('/').map(encodeURIComponent).join('/')}`, {
      headers: { 'x-verification-id': auth.verificationId, 'x-verification-secret': auth.verificationSecret },
    });
    if (!res.ok) return null;
    return URL.createObjectURL(await res.blob());
  };
}

export function useMediaUrl(objectKey: string | undefined, resolve: MediaUrlResolver | undefined) {
  const [state, setState] = useState<{ url: string | null; loading: boolean }>({ url: null, loading: !!objectKey && !!resolve });
  useEffect(() => {
    if (!objectKey || !resolve) {
      setState({ url: null, loading: false });
      return;
    }
    let cancelled = false;
    let created: string | null = null;
    setState({ url: null, loading: true });
    resolve(objectKey)
      .then((url) => {
        if (cancelled) {
          if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
          return;
        }
        if (url?.startsWith('blob:')) created = url;
        setState({ url, loading: false });
      })
      .catch(() => !cancelled && setState({ url: null, loading: false }));
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [objectKey, resolve]);
  return state;
}
