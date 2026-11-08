'use client';

import { useEffect, useState } from 'react';
import { useStdb } from '@/lib/stdb';

const SLOW_MS = 12_000;

/** Live SpacetimeDB connection indicator for the shared header. */
export function ConnectionChip() {
  const { isActive, error } = useStdb();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (isActive || error) {
      setSlow(false);
      return;
    }
    const t = window.setTimeout(() => setSlow(true), SLOW_MS);
    return () => window.clearTimeout(t);
  }, [isActive, error]);

  if (error) {
    return (
      <span
        className="rounded-full bg-red-400/15 px-2.5 py-1 text-[9px] font-bold text-red-200 ring-1 ring-inset ring-red-300/30"
        title={error.message}
      >
        Connection error
      </span>
    );
  }

  if (isActive) {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[9px] font-bold text-emerald-300 ring-1 ring-inset ring-emerald-300/20">
        <span className="size-1.5 rounded-full bg-emerald-300" />
        Live
      </span>
    );
  }

  return (
    <span className="rounded-full bg-white/10 px-2.5 py-1 text-[9px] font-bold text-slate-300 ring-1 ring-inset ring-white/15">
      {slow ? 'Still connecting…' : 'Connecting…'}
    </span>
  );
}
