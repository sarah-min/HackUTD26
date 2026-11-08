'use client';

import type { Banner911Props } from '@/components/affected/placeholders/types';

/** Life-safety banner. Always shows the 911 line (ARCHITECTURE / AGENTS). */
export function Banner911({ reason }: Banner911Props) {
  return (
    <aside
      role="alert"
      className="overflow-hidden rounded-2xl border border-red-200 bg-white shadow-[0_4px_18px_rgba(15,23,42,0.06)]"
    >
      <div className="flex items-center gap-2 bg-[#d32f2f] px-4 py-2 text-white">
        <span className="text-[11px] font-bold uppercase tracking-[0.13em]">Life-safety alert</span>
      </div>
      <div className="space-y-1 p-4">
        <p className="text-[15px] font-bold text-slate-950">
          If you are in immediate danger, call{' '}
          <a className="underline underline-offset-2" href="tel:911">
            911
          </a>
          .
        </p>
        {reason ? <p className="text-[12px] text-slate-600">{reason}</p> : null}
      </div>
    </aside>
  );
}
