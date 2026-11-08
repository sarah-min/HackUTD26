'use client';

import { useState } from 'react';
import { R, useReducer } from '@/lib/stdb';

/** Re-queue analysis for a failed report using the last round of media. */
export function RetrySubmit({ reportId }: { reportId: bigint }) {
  const submitReport = useReducer(R.submitReport);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setError(null);
    setBusy(true);
    try {
      await submitReport({ reportId });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-800">Something went wrong</p>
      <h2 className="mt-1 text-[15px] font-bold text-slate-950">The review didn’t finish</h2>
      <p className="mt-1 text-[12px] text-slate-600">
        We can try again with the photos you already sent. No need to upload them again.
      </p>
      {error ? <p className="mt-2 text-[12px] font-semibold text-red-700">{error}</p> : null}
      <button
        className="mt-3 w-full rounded-xl bg-slate-900 px-4 py-3 text-[13px] font-bold text-white disabled:opacity-60"
        disabled={busy}
        onClick={() => void retry()}
        type="button"
      >
        {busy ? 'Starting again…' : 'Try again'}
      </button>
    </section>
  );
}
