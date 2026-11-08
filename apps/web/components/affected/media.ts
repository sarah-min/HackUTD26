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

export type MediaUrlState =
  | { status: 'idle'; url: null }
  | { status: 'loading'; url: null }
  | { status: 'ready'; url: string }
  | { status: 'error'; url: null }
  | { status: 'unavailable'; url: null };

/** Object URL for one media key, revoked on unmount. */
export function useMediaUrlState(
  key: string | null,
  verification: { id: string; secret: string } | null,
): MediaUrlState {
  const [state, setState] = useState<MediaUrlState>({ status: 'idle', url: null });
  useEffect(() => {
    if (!key) {
      setState({ status: 'idle', url: null });
      return;
    }
    if (!verification) {
      setState({ status: 'unavailable', url: null });
      return;
    }
    const ac = new AbortController();
    let made: string | null = null;
    setState({ status: 'loading', url: null });
    fetchMediaObjectUrl(key, verification, ac.signal)
      .then((u) => {
        made = u;
        setState({ status: 'ready', url: u });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({ status: 'error', url: null });
      });
    return () => {
      ac.abort();
      if (made) URL.revokeObjectURL(made);
    };
  }, [key, verification?.id, verification?.secret]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

/** @deprecated Prefer useMediaUrlState for loading/error UI. */
export function useMediaUrl(key: string | null, verification: { id: string; secret: string } | null): string | null {
  const s = useMediaUrlState(key, verification);
  return s.url;
}
