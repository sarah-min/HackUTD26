/**
 * Safe localStorage access. Every read/write is wrapped: private windows, blocked site
 * data and SSR all make storage unavailable, and the app must still render.
 */
export function readLocal(key: string): string | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
  } catch {
    // reason: storage unavailable; the session still works, it just won't persist
  }
}

export function removeLocal(key: string): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export const TOKEN_KEY = 'stdb:token';
