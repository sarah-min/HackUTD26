'use client';

import type { HazardListProps } from '@/components/affected/placeholders/types';
import { FLAG_GUIDANCE } from '@/lib/format';

export function HazardList({ flags }: HazardListProps) {
  if (flags.length === 0) return null;
  return (
    <ul className="space-y-2">
      {flags.map((f) => (
        <li
          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950"
          key={f}
        >
          <p className="text-[12px] font-bold capitalize">{f.replace(/_/g, ' ')}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-amber-900/90">
            {FLAG_GUIDANCE[f] ?? 'Treat this as a possible on-scene hazard.'}
          </p>
        </li>
      ))}
    </ul>
  );
}
