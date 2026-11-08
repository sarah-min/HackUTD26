'use client';

import { useEffect, useState } from 'react';

export type MediaUrlResolver = (objectKey: string) => Promise<string | null>;

/** Resolver over a file reader (SpacetimeDB storage, see useReadFile): the bytes become an object URL. */
export function blobResolver(read: (objectKey: string) => Promise<Blob>): MediaUrlResolver {
  return async (objectKey) => {
    if (objectKey.startsWith('idv/')) return null;
    try {
      return URL.createObjectURL(await read(objectKey));
    } catch {
      return null;
    }
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
