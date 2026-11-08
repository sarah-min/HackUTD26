'use client';

import type { HazardListProps } from '@/components/affected/placeholders/types';

export function HazardList({ flags }: HazardListProps) {
  if (flags.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {flags.map((f) => (
        <li
          className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800"
          key={f}
        >
          {f.replace(/_/g, ' ')}
        </li>
      ))}
    </ul>
  );
}
