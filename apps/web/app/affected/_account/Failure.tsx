'use client';
// Failure state for code procedures: one plain message, or a live "try again in N minutes"
// countdown after `locked` / `rate_limited`. The countdown text is aria-live off so a screen reader
// hears the notice once, not every second.
import { useCallback, useEffect, useState } from 'react';
import type { AccountCodeResult } from '@/lib/stdb';
import { NETWORK_ERROR_TEXT, failureText, isLockout, waitText } from './copy';
import { errorText } from './ui';

export type FailureState = {
  message: string | null;
  /** Seconds left of a lockout; 0 when not locked. */
  secondsLeft: number;
  locked: boolean;
  /** Record a refused procedure result (a lockout starts the countdown). */
  fail: (r: Pick<AccountCodeResult, 'error' | 'attemptsLeft' | 'retryAfterS'>) => void;
  network: () => void;
  text: (message: string) => void;
  clear: () => void;
};

export function useFailure(): FailureState {
  const [message, setMessage] = useState<string | null>(null);
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (until === 0) return;
    setNow(Date.now());
    const t = window.setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= until) {
        window.clearInterval(t);
        setUntil(0);
      }
    }, 1000);
    return () => window.clearInterval(t);
  }, [until]);

  const secondsLeft = until > 0 ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;

  const fail = useCallback(
    (r: Pick<AccountCodeResult, 'error' | 'attemptsLeft' | 'retryAfterS'>) => {
      if (isLockout(r.error)) {
        const wait = Math.max(1, r.retryAfterS);
        setMessage(null);
        setNow(Date.now());
        setUntil(Date.now() + wait * 1000);
      } else {
        setUntil(0);
        setMessage(failureText(r));
      }
    },
    [],
  );

  return {
    message,
    secondsLeft,
    locked: secondsLeft > 0,
    fail,
    network: useCallback(() => setMessage(NETWORK_ERROR_TEXT), []),
    text: useCallback((m: string) => setMessage(m), []),
    clear: useCallback(() => {
      setMessage(null);
      setUntil(0);
    }, []),
  };
}

export function FailureNotice({ f, id }: { f: FailureState; id?: string }) {
  if (f.locked) {
    return (
      <p id={id} role="alert" className={errorText}>
        Too many tries. Try again in <span aria-live="off">{waitText(f.secondsLeft)}</span>.
      </p>
    );
  }
  if (!f.message) return null;
  return (
    <p id={id} role="alert" className={errorText}>
      {f.message}
    </p>
  );
}
